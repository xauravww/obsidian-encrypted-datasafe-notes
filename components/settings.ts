import main from "../main";
import { ModalEnterPassword } from "components/modalEnterPassword";
import { ModalSetPassword } from "components/modalSetPassword";
import { ModalChangePassword } from "./modalChangePassword";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { GetVaultFiles } from "./getMDFiles";
import { FolderSuggestModal } from "./modalFolderSuggest";
import { VaultCrypto } from "./vaultCrypto";
import * as CryptoJS from "crypto-js";

export interface PluginSettings {
	password: string;
	passwordVerifier: string;
	encryptedMVK: string;
	recoveryEncryptedMVK: string;
	hideEncrypted: boolean;
	showCustomSettingsIcon: boolean;
	enablePass: boolean;
	animations: boolean;
	fileEncrypt: { encrypt: boolean; isAlreadyEncrypted: boolean };
	autoLock: string;
	folder: string;
	isLocked: boolean;
	lockOnBlur: boolean;
	searchDecrypt: boolean;
	fallbackPassword?: string;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	password: "",
	passwordVerifier: "",
	encryptedMVK: "",
	recoveryEncryptedMVK: "",
	hideEncrypted: false,
	showCustomSettingsIcon: true,
	enablePass: false,
	animations: true,
	fileEncrypt: { encrypt: false, isAlreadyEncrypted: false },
	autoLock: "0",
	folder: "",
	isLocked: false,
	lockOnBlur: false,
	searchDecrypt: true,
};

export class SettingsTab extends PluginSettingTab {
	plugin: main;

	constructor(app: App, plugin: main) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty(); //clear the old content settings reopen when we open it again



		new Setting(containerEl)
			.setName("Show custom settings icon in sidebar")
			.setDesc("Enable to show a gear icon in the left ribbon that opens the premium custom settings modal.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCustomSettingsIcon)
					.onChange(async (value) => {
						this.plugin.settings.showCustomSettingsIcon = value;
						await this.plugin.saveSettings();
						this.plugin.updateSettingsRibbon();
					})
			);



		this.containerEl.createEl("hr");

		this.containerEl.createEl("p", {
			text: "💡 All advanced custom options (Auto lock, Protected folder, Animations, Recovery Code, etc.) have been moved to the Custom Settings panel.",
			attr: { style: "color: var(--text-muted); font-size: 14px; margin-top: 20px; font-style: italic;" }
		});
		
		this.containerEl.createEl("p", {
			text: "Click the gear icon ⚙️ in the left sidebar ribbon to access them. (Make sure 'Show custom settings icon in sidebar' is enabled above).",
			attr: { style: "color: var(--text-muted); font-size: 14px; margin-top: 10px; font-style: italic;" }
		});
	}

	async scanStatus() {
		const files = new GetVaultFiles(this.app, this.plugin).getFiles();
		if (!files || files.length === 0) {
			new Notice("No markdown files found." + (this.plugin.settings.folder ? " in " + this.plugin.settings.folder : ""));
			return;
		}
		let encrypted = 0;
		let plain = 0;
		const problems: string[] = [];
		const key = this.plugin.getFileKey();
		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (VaultCrypto.isEncrypted(content)) {
				encrypted++;
				// Detect double-encryption: one decrypt still yields ciphertext.
				const decrypted = VaultCrypto.tryDecrypt(content, key);
				if (decrypted && VaultCrypto.isEncrypted(decrypted)) {
					problems.push(f.path);
				}
			} else {
				plain++;
			}
		}
		let msg = `${encrypted} encrypted, ${plain} plaintext`;
		if (problems.length > 0) {
			msg += ` | ⚠ ${problems.length} double-encrypted`;
		}
		new Notice(msg, 8000);
	}

	async recoverFiles() {
		this.plugin.recovering = true;
		const r = await this.plugin.repairVault();
		this.plugin.recovering = false;
		let msg = `Repair: ${r.ok} OK, ${r.fixed} recovered`;
		if (r.failed > 0) msg += `, ${r.failed} FAILED`;
		new Notice(msg, 8000);
	}
}
