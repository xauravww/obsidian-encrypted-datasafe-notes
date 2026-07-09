import { App, Modal, Notice, Setting } from "obsidian";
import main from "../main";
import { hash } from "./hash";
import * as CryptoJS from "crypto-js";
import { ModalSetPassword } from "./modalSetPassword";

export class ModalShowRecovery extends Modal {
	code: string;

	constructor(app: App, code: string) {
		super(app);
		this.code = code;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h1", { text: "🚨 CRITICAL: Recovery Code" });
		
		contentEl.createEl("p", { 
			text: "If you ever forget your password, this code is the ONLY way to recover your vault. If you lose this code AND your password, your files are gone forever.",
			cls: "password_modal__alert"
		});

		const codeBox = contentEl.createEl("div", {
			text: this.code,
			attr: { style: "background: var(--background-modifier-form-field); padding: 15px; text-align: center; font-family: monospace; font-size: 1.5em; user-select: all; margin: 15px 0; border-radius: 8px; letter-spacing: 2px;" }
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("I have safely copied this code")
					.setCta()
					.onClick(() => this.close())
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class ModalRecovery extends Modal {
	plugin: main;
	value: string = "";

	constructor(app: App, plugin: main) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h1", { text: "Recover Vault" });

		const input = contentEl.createEl("input", {
			type: "text",
			placeholder: "Enter your 32-character recovery code",
			attr: { style: "width: 100%; margin: 15px 0; padding: 10px; font-family: monospace;" }
		});

		input.addEventListener("input", (e) => {
			this.value = (e.target as HTMLInputElement).value.trim();
		});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Recover")
					.setCta()
					.onClick(() => this.recover())
			);
	}

	async recover() {
		if (!this.plugin.settings.recoveryEncryptedMVK) {
			new Notice("This vault does not have a recovery code configured.");
			return;
		}

		const codeHash = hash(this.value);
		let mvk = "";
		try {
			mvk = CryptoJS.AES.decrypt(this.plugin.settings.recoveryEncryptedMVK, codeHash).toString(CryptoJS.enc.Utf8);
		} catch (e) {}

		if (!mvk) {
			new Notice("Invalid recovery code.");
			return;
		}

		new Notice("Code accepted! Please set a new password.");
		this.close();

		new ModalSetPassword(this.app, this.plugin, async (newHash) => {
			if (newHash) {
				this.plugin.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", newHash).toString();
				this.plugin.settings.encryptedMVK = CryptoJS.AES.encrypt(mvk, newHash).toString();
				await this.plugin.saveSettings();
				new Notice("Password has been reset successfully!");
			}
		}).open();
	}

	onClose() {
		this.contentEl.empty();
	}
}
