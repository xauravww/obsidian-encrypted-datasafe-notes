import main from "main";
import { App } from "obsidian";
import { GetVaultFiles } from "./getMDFiles";
import { VaultCrypto, CryptoError } from "./vaultCrypto";

export class Encrypt {
	app: App;
	plugin: main;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Encrypt every plaintext file in the vault/folder. Idempotent and
	 * corruption-safe:
	 *   - already-encrypted files are SKIPPED (no double-encryption)
	 *   - empty files are skipped
	 *   - each payload is roundtrip-verified before it touches disk; a file that
	 *     fails verification is left as plaintext and reported, never corrupted
	 * Returns the number of files that could NOT be encrypted (0 = clean run).
	 */
	async encryptFilesInDirectory(): Promise<number> {
		const files = new GetVaultFiles(this.app, this.plugin).getFiles();
		if (!files) return 0;

		const key = this.plugin.getFileKey();
		if (!key) {
			// No key in RAM — cannot encrypt. Caller should not have reached here.
			console.error("Datasafe: encrypt aborted, no file key available");
			return files.length;
		}

		let failed = 0;

		for (const file of files) {
			let content = "";
			const activeEditor = this.app.workspace.activeEditor;

			// If this file is currently open and active, pull the live text
			// directly from the editor to catch keystrokes not yet saved to disk.
			const isActive =
				activeEditor &&
				activeEditor.file &&
				activeEditor.file.path === file.path &&
				activeEditor.editor;

			if (isActive) {
				content = activeEditor.editor!.getValue();
			} else {
				content = await this.app.vault.read(file);
			}

			// Skip empty and already-encrypted files. This single check is what
			// makes locking idempotent — locking twice is a no-op.
			if (content.length === 0 || VaultCrypto.isEncrypted(content)) {
				continue;
			}

			let payload: string;
			try {
				payload = VaultCrypto.encrypt(content, key);
			} catch (e) {
				// Roundtrip failed — DO NOT WRITE. Leave plaintext intact.
				failed++;
				console.error(
					`Datasafe: refusing to encrypt ${file.path} (${
						e instanceof CryptoError ? e.message : String(e)
					})`
				);
				continue;
			}

			if (isActive) {
				// Inject ciphertext into the editor's live memory so Obsidian's
				// 2s debounce save writes ciphertext, not stale plaintext.
				activeEditor.editor!.setValue(payload);
			}

			await this.app.vault.modify(file, payload);
			this.plugin.encryptedPaths.add(file.path);
		}

		this.plugin.settings.fileEncrypt.isAlreadyEncrypted = true;
		await this.plugin.saveSettings();
		return failed;
	}
}
