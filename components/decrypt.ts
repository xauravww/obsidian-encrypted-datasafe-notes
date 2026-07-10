import main from "main";
import { App, Notice } from "obsidian";
import { VaultCrypto } from "./vaultCrypto";

export class Decrypt {
	app: App;
	plugin: main;
	counter: number;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
		this.counter = 0;
	}

	/**
	 * Decrypt every encrypted file in the vault. Idempotent and corruption-safe:
	 *   - plaintext files are SKIPPED (never touched)
	 *   - tries primary key then fallback key
	 *   - writes ONLY if the result looks like real plaintext (guards against
	 *     wrong-key garbage and against leaving a half-peeled double-encrypted
	 *     file as ciphertext)
	 * Files that cannot be decrypted are left encrypted and reported.
	 * Returns count of files that could NOT be decrypted.
	 */
	async decryptFilesInDirectory(): Promise<number> {
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.plugin.encryptedPaths.has(f.path));

		const keys = [
			this.plugin.getFileKey(),
			this.plugin.settings.fallbackPassword,
		];

		let failed = 0;

		for (const file of files) {
			const content = await this.app.vault.read(file);

			if (!VaultCrypto.isEncrypted(content)) {
				// Already plaintext — nothing to do.
				this.plugin.encryptedPaths.delete(file.path);
				continue;
			}

			// deepDecrypt un-nests any accidental multi-layer encryption too.
			const result = VaultCrypto.deepDecrypt(content, keys);

			if (result && VaultCrypto.looksLikePlaintext(result.plaintext)) {
				await this.app.vault.modify(file, result.plaintext);
				this.plugin.encryptedPaths.delete(file.path);
			} else {
				failed++;
				console.error(`Datasafe: could not decrypt ${file.path}`);
			}
		}

		this.plugin.settings.fileEncrypt.isAlreadyEncrypted = false;
		await this.plugin.saveSettings();

		if (failed > 0) {
			new Notice(
				`⚠ ${failed} file(s) could not be decrypted. Run "Repair Vault" to recover them.`,
				8000
			);
		}
		return failed;
	}
}
