import { Notice, Plugin, addIcon, TFile } from "obsidian";
import { ModalEnterPassword } from "./components/modalEnterPassword";
import {
	DEFAULT_SETTINGS,
	PluginSettings,
	SettingsTab,
} from "./components/settings";
import { lockSVG, unlockSVG } from "./components/svgIcons";
import { AutoLock } from "components/autolock";
import { FolderLock } from "components/folderLock";
import { Encrypt } from "./components/encrypt";
import { Decrypt } from "./components/decrypt";
import { GetMDFiles } from "./components/getMDFiles";
import * as CryptoJS from "crypto-js";

export default class PasswordPlugin extends Plugin {
	settings: PluginSettings;
	toggleFlag: boolean;
	private ribbonItem: HTMLElement;
	private folderLock: FolderLock;
	private modalEnterPassword: ModalEnterPassword;

	async onload() {
		await this.loadSettings();

		this.folderLock = new FolderLock(this.app, this);
		this.modalEnterPassword = new ModalEnterPassword(this.app, this);

		this.app.workspace.onLayoutReady(async () => {
			if (this.settings.enablePass && !this.settings.folder) {
				this.modalEnterPassword.open();
			}

			if (this.settings.enablePass && this.settings.folder) {
				this.folderLock.lock();
				this.folderLock.closeOnLocked();
			}

			if (this.settings.enablePass && this.settings.autoLock !== "0") {
				new AutoLock(
					this.app,
					this,
					this.settings.autoLock
				).startTimer();
			}
		});

		addIcon("lock-closed", lockSVG);
		addIcon("lock-open", unlockSVG);
		this.ribbonItem = this.addRibbonIcon(
			"lock-closed",
			this.settings.isLocked ? "Vault is locked" : "Vault is unlocked",
			async () => {
				if (!this.settings.enablePass) {
					new Notice("Set a password in settings first.");
					return;
				}
				if (this.settings.isLocked) {
					const m = new ModalEnterPassword(this.app, this, false,
						() => this.updateRibbonIcon(),
						() => {}
					);
					m.open();
				} else {
					await this.lockVault();
				}
			}
		);
		this.updateRibbonIcon();

		this.addCommand({
			id: "lock-vault",
			name: "Lock vault",
			callback: () => this.lockVault(),
		});

		this.addCommand({
			id: "unlock-vault",
			name: "Unlock vault",
			callback: () => this.unlockVault(),
		});

		this.addCommand({
			id: "show-status",
			name: "Show encryption status",
			callback: () => this.showStatus(),
		});

		this.addCommand({
			id: "recover-files",
			name: "Recover corrupted (double-encrypted) files",
			callback: () => this.recoverFiles(),
		});

		this.addSettingTab(new SettingsTab(this.app, this));
	}

	updateRibbonIcon() {
		if (!this.ribbonItem) return;
		const paths = this.ribbonItem.querySelectorAll("path");
		if (paths.length >= 2) {
			const shackle = paths[1];
			if (this.settings.isLocked) {
				shackle.removeAttribute("stroke-dasharray");
				shackle.removeAttribute("stroke-dashoffset");
			} else {
				shackle.setAttribute("stroke-dasharray", "4 4");
				shackle.setAttribute("stroke-dashoffset", "-4");
			}
		}
		this.ribbonItem.setAttribute("aria-label",
			this.settings.isLocked ? "Vault is locked" : "Vault is unlocked");
	}

	async lockVault() {
		if (!this.settings.folder) {
			new Notice("Set a protected folder first.");
			return;
		}
		new Notice("Encrypting files...");
		await new Encrypt(this.app, this).encryptFilesInDirectory();
		this.settings.isLocked = true;
		await this.saveSettings();
		this.updateRibbonIcon();
		new Notice(`'${this.settings.folder}' folder is locked 🔒`);
		new FolderLock(this.app, this).closeOnLocked();
	}

	async unlockVault() {
		if (!this.settings.enablePass) return;
		const modal = new ModalEnterPassword(
			this.app,
			this,
			true,
			() => this.updateRibbonIcon(),
			() => {}
		);
		modal.open();
	}

	async showStatus() {
		const files = new GetMDFiles(this.app, this).getFiles();
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
				const key = this.settings.password;
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
		const files = new GetMDFiles(this.app, this).getFiles();
		if (!files || files.length === 0) {
			new Notice("No files to check.");
			return;
		}
		const key = this.settings.password;
		let fixed = 0;
		let failed = 0;
		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (!content.startsWith("U2FsdGVkX1")) continue;
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
		new Notice(`Recovery done: ${fixed} fixed, ${failed} failed.`);
	}

	onunload() {
		this.settings.enablePass = false;
		this.settings.password = "";
		this.settings.autoLock = "0";
		this.saveSettings();
	}

	async loadSettings() {
		const saved = await this.loadData();
		if (saved && saved.password) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
			return;
		}
		try {
			const oldPath = ".obsidian/plugins/protected-note/data.json";
			const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
			if (oldFile instanceof TFile) {
				const content = await this.app.vault.read(oldFile);
				const old = JSON.parse(content);
				if (old.password) {
					this.settings = {
						password: old.password,
						enablePass: old.enablePass ?? true,
						animations: old.animations ?? true,
						fileEncrypt: old.fileEncrypt ?? { encrypt: true, isAlreadyEncrypted: true },
						autoLock: old.autoLock ?? "0",
						folder: old.folder ?? "Personal",
						isLocked: old.isLocked ?? true,
					};
					await this.saveData(this.settings);
					new Notice("Migrated settings from protected-note plugin");
					return;
				}
			}
		} catch (_) {}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
