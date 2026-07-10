import { App, Modal, Notice, Setting, setIcon } from "obsidian";
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

		const codeWrapper = contentEl.createEl("div", {
			attr: { style: "position: relative; margin: 15px 0;" }
		});

		const codeBox = codeWrapper.createEl("div", {
			text: this.code,
			attr: { style: "background: var(--background-modifier-form-field); padding: 20px; text-align: center; font-family: monospace; font-size: 1.5em; user-select: all; border-radius: 8px; letter-spacing: 2px;" }
		});

		const copyBtn = codeWrapper.createEl("div", {
			attr: { style: "position: absolute; top: 8px; right: 8px; padding: 6px; cursor: pointer; border-radius: 6px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; transition: background 0.2s; color: #a1a1aa;" }
		});
		setIcon(copyBtn, "copy");
		
		copyBtn.addEventListener("mouseenter", () => copyBtn.style.background = "rgba(255,255,255,0.2)");
		copyBtn.addEventListener("mouseleave", () => copyBtn.style.background = "rgba(255,255,255,0.1)");
		copyBtn.addEventListener("click", async () => {
			await navigator.clipboard.writeText(this.code);
			setIcon(copyBtn, "check");
			copyBtn.style.color = "#22c55e";
			new Notice("Recovery code copied to clipboard!");
			setTimeout(() => {
				setIcon(copyBtn, "copy");
				copyBtn.style.color = "#a1a1aa";
			}, 2000);
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
		
		// Show New Password UI Inline
		this.contentEl.empty();
		this.contentEl.createEl("h1", { text: "Set New Password" });
		
		let pass = "";
		let repass = "";

		const passInput = this.contentEl.createEl("input", { type: "password", placeholder: "Enter new password", attr: { style: "width: 100%; margin: 10px 0; padding: 10px;" } });
		passInput.addEventListener("input", (e) => pass = (e.target as HTMLInputElement).value);
		
		const repassInput = this.contentEl.createEl("input", { type: "password", placeholder: "Confirm new password", attr: { style: "width: 100%; margin: 10px 0; padding: 10px;" } });
		repassInput.addEventListener("input", (e) => repass = (e.target as HTMLInputElement).value);

		new Setting(this.contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Reset Password")
					.setCta()
					.onClick(async () => {
						if (pass !== repass) {
							new Notice("Passwords do not match");
							return;
						}
						if (pass.length === 0) {
							new Notice("Password cannot be empty");
							return;
						}
						
						const newHash = hash(pass);
						this.plugin.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", newHash).toString();
						this.plugin.settings.encryptedMVK = CryptoJS.AES.encrypt(mvk, newHash).toString();
						await this.plugin.saveSettings();
						new Notice("Password has been reset successfully! 🔑");
						this.close();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
