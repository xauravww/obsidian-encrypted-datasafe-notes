import * as CryptoJS from "crypto-js";

/**
 * VaultCrypto — the SINGLE owner of Datasafe's on-disk encryption format and
 * all AES operations. Nothing else in the codebase should call CryptoJS.AES on
 * note content directly; route everything through here so the format, the
 * double-encryption guard, and the write-time roundtrip verification stay in
 * one place.
 *
 * On-disk format (v1):
 *
 *     %%DATASAFE-ENC:v1%%
 *     <base64 AES ciphertext>
 *
 * The `%%...%%` header doubles as an Obsidian comment, so even if a raw file is
 * previewed it renders as an invisible comment rather than noise. Legacy files
 * (bare `U2FsdGVkX1...` ciphertext with no header) are still DETECTED and
 * DECRYPTED for zero-migration back-compat; they get upgraded to the v1 header
 * the next time they are written.
 */

/** CryptoJS's OpenSSL-compatible ciphertext always base64-starts with this. */
const LEGACY_CIPHER_PREFIX = "U2FsdGVkX1";

/** Header marker prefix. Full line is `%%DATASAFE-ENC:v<N>%%`. */
const HEADER_PREFIX = "%%DATASAFE-ENC:v";
const HEADER_REGEX = /^%%DATASAFE-ENC:v(\d+)%%\n?/;

export const CURRENT_VERSION = 1;

/** Thrown by `encrypt()` when the write-time roundtrip check fails. */
export class CryptoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CryptoError";
	}
}

export class VaultCrypto {
	/**
	 * True if `content` is Datasafe-encrypted — either the v1 header format or a
	 * legacy bare ciphertext. Cheap prefix check; safe on huge files.
	 */
	static isEncrypted(content: string): boolean {
		if (!content) return false;
		return (
			content.startsWith(HEADER_PREFIX) ||
			content.startsWith(LEGACY_CIPHER_PREFIX)
		);
	}

	/** Format version, or null if not a headered payload (legacy => 0). */
	static getVersion(content: string): number | null {
		if (!content) return null;
		const m = content.match(HEADER_REGEX);
		if (m) return Number(m[1]);
		if (content.startsWith(LEGACY_CIPHER_PREFIX)) return 0;
		return null;
	}

	/** Wrap raw ciphertext in the versioned header. */
	static wrap(cipher: string, version: number = CURRENT_VERSION): string {
		return `${HEADER_PREFIX}${version}%%\n${cipher}`;
	}

	/**
	 * Strip the header, returning the bare ciphertext. Accepts legacy bare
	 * ciphertext (returned unchanged) so old files decrypt without migration.
	 */
	static unwrap(content: string): string {
		if (!content) return content;
		const m = content.match(HEADER_REGEX);
		if (m) return content.slice(m[0].length);
		return content; // legacy bare ciphertext
	}

	/**
	 * Encrypt `plaintext` with `key` and return the fully wrapped v1 payload.
	 *
	 * CRITICAL SAFETY: before returning, this immediately decrypts its own
	 * output with the same key and asserts it equals the input. If the roundtrip
	 * fails for ANY reason it throws CryptoError and the caller MUST NOT write —
	 * this is what guarantees an unreadable/corrupt file is never persisted.
	 */
	static encrypt(plaintext: string, key: string): string {
		if (!key) throw new CryptoError("No encryption key provided");
		if (plaintext.length === 0) {
			throw new CryptoError("Refusing to encrypt empty content");
		}

		let cipher: string;
		try {
			cipher = CryptoJS.AES.encrypt(plaintext, key).toString();
		} catch (e) {
			throw new CryptoError(`AES encrypt failed: ${String(e)}`);
		}

		// Roundtrip verification — decrypt what we just produced.
		let check = "";
		try {
			check = CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8);
		} catch (e) {
			throw new CryptoError(`Roundtrip decrypt threw: ${String(e)}`);
		}
		if (check !== plaintext) {
			throw new CryptoError("Roundtrip mismatch — refusing to write");
		}

		return this.wrap(cipher, CURRENT_VERSION);
	}

	/**
	 * Attempt to decrypt `content` with `key`. Returns the plaintext, or null on
	 * any failure (wrong key, malformed UTF-8, empty result, not encrypted).
	 * NEVER throws — safe to call speculatively with multiple candidate keys.
	 */
	static tryDecrypt(content: string, key: string | undefined | null): string | null {
		if (!content || !key) return null;
		if (!this.isEncrypted(content)) return null;

		const cipher = this.unwrap(content);
		try {
			const out = CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8);
			return out && out.length > 0 ? out : null;
		} catch (e) {
			return null;
		}
	}

	/**
	 * True if `s` is non-empty and NOT still encrypted. Used to confirm a
	 * decryption actually produced plaintext (and didn't just peel one layer off
	 * a double-encrypted file, leaving ciphertext behind).
	 */
	static looksLikePlaintext(s: string | null | undefined): boolean {
		return !!s && s.length > 0 && !this.isEncrypted(s);
	}

	/**
	 * Fully decrypt a possibly multi-layer-encrypted file, trying each candidate
	 * key at every layer. Returns { plaintext, layers, keyUsed } on success or
	 * null if no key can make progress. Non-destructive: caller decides to write.
	 * `maxLayers` guards against pathological loops.
	 */
	static deepDecrypt(
		content: string,
		keys: Array<string | undefined | null>,
		maxLayers: number = 5
	): { plaintext: string; layers: number; keyUsed: string } | null {
		let current = content;
		let layers = 0;
		let keyUsed = "";

		while (this.isEncrypted(current) && layers < maxLayers) {
			let next: string | null = null;
			for (const k of keys) {
				const attempt = this.tryDecrypt(current, k);
				if (attempt !== null) {
					next = attempt;
					keyUsed = k as string;
					break;
				}
			}
			if (next === null) break; // no key advances this layer
			current = next;
			layers++;
		}

		if (layers === 0) return null; // never decrypted anything
		if (this.isEncrypted(current)) return null; // still encrypted => give up
		return { plaintext: current, layers, keyUsed };
	}
}
