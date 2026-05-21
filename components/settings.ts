import main from "../main";
import { ModalEnterPassword } from "components/modalEnterPassword";
import { ModalSetPassword } from "components/modalSetPassword";
import { ModalChangePassword } from "./modalChangePassword";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { GetMDFiles } from "./getMDFiles";
import * as CryptoJS from "crypto-js";

export interface PluginSettings {
	password: string;
	enablePass: boolean;
	animations: boolean;
	fileEncrypt: { encrypt: boolean; isAlreadyEncrypted: boolean };
	autoLock: string;
	folder: string;
	isLocked: boolean;
	lockOnBlur: boolean;
	searchDecrypt: boolean;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	password: "",
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

		this.containerEl.createEl("h2", {
			text: "Set a password",
		});

		new Setting(containerEl)
			.setName("Enable/Disable the password")
			.setDesc(
				"To disable protection you need to confirm the password. If you want to create a new password use enable."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enablePass)
					.onChange(async () => {
						if (this.plugin.settings.enablePass) {
							//if we want to disable password

							this.plugin.toggleFlag = true;

							const modal = new ModalEnterPassword(
								this.app,
								this.plugin,
								true,
								async () => {
									if (!this.plugin.toggleFlag) {
										this.plugin.settings.enablePass = false;
										this.plugin.settings.password = "";
										this.plugin.settings.autoLock = "0";
										this.plugin.settings.fileEncrypt.encrypt =
											false;
										this.plugin.settings.fileEncrypt.isAlreadyEncrypted =
											false;
										await this.plugin.saveSettings();

										new Notice(
											"you turned off the password protection ❌"
										);
									}

									this.display(); //display again in case our toggle changed but "if" didn't go
								},
								() => {},
								true
							);

							modal.open();
						} else {
							//open the modal
							const modal = new ModalSetPassword(
								this.app,
								this.plugin,
								async () => {
									//if our toggle flag is true we do our code
									if (this.plugin.toggleFlag) {
										this.plugin.settings.enablePass = true;
										await this.plugin.saveSettings();
									}
									this.display();
								}
							);

							modal.open();
						}
					})
			);

		this.containerEl.createEl("h2", {
			text: "Other",
		});

		new Setting(containerEl)
			.setName("Protected folder")
			.setDesc(
				"Enter the path to protect only a specific folder. Leave the field empty if you want to protect the entire Obsidian."
			)
			.addText((text) => {
				text.setPlaceholder("Example: folder/myFolder")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						const path =
							value[value.length - 1] === "/"
								? value.slice(0, -1)
								: value;
						this.plugin.settings.folder = path;
						await this.plugin.saveSettings();
					});
			})
			.setDisabled(this.plugin.settings.enablePass);

		new Setting(containerEl)
			.setName("Auto lock (seconds)")
			.setDesc(
				"Number of seconds of inactivity before locking. Set 0 to disable."
			)
			.addText((text) => {
				text.setPlaceholder("e.g. 300 for 5 min")
					.setValue(this.plugin.settings.autoLock)
					.onChange(async (value) => {
						if (/^\d+$/.test(value)) {
							this.plugin.settings.autoLock = value;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Show animations")
			.setDesc(
				"Enable this if you want to see modal and background animations."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.animations)
					.onChange(async (value) => {
						this.plugin.settings.animations = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Lock on window blur")
			.setDesc("Automatically lock the vault when the window loses focus")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lockOnBlur)
					.onChange(async (value) => {
						this.plugin.settings.lockOnBlur = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Change password")
			.setDesc("Set a new password for your vault.")
			.setDisabled(!this.plugin.settings.enablePass)
			.addButton((btn) =>
				btn.setButtonText("Change Password").onClick(() => {
					new ModalChangePassword(this.app, this.plugin).open();
				})
			);

		new Setting(containerEl)
			.setName("Decrypt on unlock for search")
			.setDesc(
				"Decrypt all files when unlocking so Obsidian's search can index them. Turn off if you prefer files to stay encrypted at rest."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.searchDecrypt)
					.onChange(async (value) => {
						this.plugin.settings.searchDecrypt = value;
						await this.plugin.saveSettings();
					})
			);

		this.containerEl.createEl("h2", {
			text: "⌨ Hotkeys",
		});

		const cmdList = containerEl.createEl("div", {
			cls: "setting-item",
		});
		cmdList.createEl("div", {
			cls: "setting-item-info",
			text: "Set hotkeys in Settings → Hotkeys. Search for any of these commands:",
		});
		const cmdNames = [
			"Lock vault",
			"Unlock vault",
			"Show encryption status",
			"Recover corrupted (double-encrypted) files",
			"Encrypt this file",
			"Decrypt this file",
		];
		const ul = cmdList.createEl("ul");
		for (const name of cmdNames) {
			ul.createEl("li", { text: name });
		}

		this.containerEl.createEl("h2", {
			text: "🔧 Recovery",
		});

		new Setting(containerEl)
			.setName("Scan encryption status")
			.setDesc("Check how many files are encrypted, plaintext, or double-encrypted.")
			.addButton((btn) =>
				btn.setButtonText("Scan").onClick(async () => {
					await this.scanStatus();
				})
			);

		new Setting(containerEl)
			.setName("Fix double-encrypted files")
			.setDesc("Recover files encrypted twice (corrupted). Decrypts back to single-encryption.")
			.addButton((btn) =>
				btn.setButtonText("Recover").onClick(async () => {
					await this.recoverFiles();
				})
			);

		this.containerEl.createEl("h2", {
			text: "🛆 High files protection (beta)",
		});

		new Setting(containerEl)
			.setName("File encryption")
			.setDesc(
				"This setting will encrypt all your files. Warning: be sure you made backup before starting using this setting. This setting is on beta!"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fileEncrypt.encrypt)
					.setDisabled(!this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.fileEncrypt.encrypt = value;
						await this.plugin.saveSettings();

						if (value) {
							new Notice("High file protection is turned on 💾");
						} else {
							new Notice("High file protection is turned off ❌");
						}
					})
			);
	}

	async scanStatus() {
		const files = new GetMDFiles(this.app, this.plugin).getFiles();
		if (!files || files.length === 0) {
			new Notice("No markdown files found in protected folder.");
			return;
		}
		let encrypted = 0;
		let plain = 0;
		const problems: string[] = [];
		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (content.startsWith("U2FsdGVkX1")) {
				encrypted++;
				const key = this.plugin.settings.password;
				const decrypted = CryptoJS.AES.decrypt(content, key).toString(CryptoJS.enc.Utf8);
				if (decrypted && decrypted.startsWith("U2FsdGVkX1")) {
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
		const files = new GetMDFiles(this.app, this.plugin).getFiles();
		if (!files || files.length === 0) {
			new Notice("No files to check.");
			return;
		}
		this.plugin.recovering = true;
		const key = this.plugin.settings.password;
		let encrypted = 0;
		let fixed = 0;
		let failed = 0;
		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (!content.startsWith("U2FsdGVkX1")) continue;
			encrypted++;
			const first = CryptoJS.AES.decrypt(content, key).toString(CryptoJS.enc.Utf8);
			if (!first || !first.startsWith("U2FsdGVkX1")) continue;
			const second = CryptoJS.AES.decrypt(first, key).toString(CryptoJS.enc.Utf8);
			if (second) {
				await this.app.vault.modify(f, second);
				fixed++;
			} else {
				failed++;
			}
		}
		this.plugin.recovering = false;
		let msg = `Recovery: ${files.length} files, ${encrypted} encrypted`;
		if (fixed > 0) msg += `, ${fixed} fixed`;
		if (failed > 0) msg += `, ${failed} FAILED`;
		new Notice(msg, 8000);
	}
}
