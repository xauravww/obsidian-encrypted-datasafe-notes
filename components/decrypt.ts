import main from "main";
import { App, TFile } from "obsidian";
import * as CryptoJS from "crypto-js";
import { GetVaultFiles } from "./getMDFiles";

export class Decrypt {
	app: App;
	plugin: main;
	counter: number;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
		this.counter = 0;
	}

	async decryptFilesInDirectory() {
		const files = this.app.vault.getMarkdownFiles().filter(f => this.plugin.encryptedPaths.has(f.path));
		
		for (const file of files) {
			const content = await this.app.vault.read(file);

			if (content.startsWith("U2FsdGVkX1")) {
				const decryptedContent = this.decryptContent(content);
				if (decryptedContent) {
					await this.app.vault.modify(file, decryptedContent);
				}
			}
		}

		this.plugin.settings.fileEncrypt.isAlreadyEncrypted = false;
		await this.plugin.saveSettings();
	}

	private decryptContent(content: string): string {
		const key = this.plugin.settings.password;
		const fallbackKey = this.plugin.settings.fallbackPassword;

		let decrypted = "";
		try {
			decrypted = CryptoJS.AES.decrypt(content, key).toString(CryptoJS.enc.Utf8);
		} catch (e) {
			// Decryption failed with primary key (Malformed UTF-8 or padding error)
		}
		
		if (!decrypted && fallbackKey) {
			try {
				decrypted = CryptoJS.AES.decrypt(content, fallbackKey).toString(CryptoJS.enc.Utf8);
			} catch (e) {
				// Failed with fallback key as well
			}
		}

		return decrypted;
	}
}
