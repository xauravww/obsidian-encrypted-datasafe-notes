import { Notice, Plugin, addIcon, TFile, Modal } from "obsidian";
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
import { hash } from "./components/hash";
import * as CryptoJS from "crypto-js";

export default class PasswordPlugin extends Plugin {
	settings: PluginSettings;
	toggleFlag: boolean;
	private ribbonItem: HTMLElement;
	private folderLock: FolderLock;
	private modalEnterPassword: ModalEnterPassword;
	private statusBarItemEl: HTMLElement;
	private blurHandler: () => void;
	private explorerObserver: MutationObserver;
	recovering: boolean;

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

			this.setupExplorerObserver();
		});

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.setupExplorerObserver();
			})
		);

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

		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar();

		this.blurHandler = () => {
			if (this.recovering) return;
			if (this.settings.lockOnBlur && !this.settings.isLocked && this.settings.enablePass) {
				this.lockVault();
			}
		};
		window.addEventListener("blur", this.blurHandler);

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

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!this.settings.enablePass) return;
				if (!(file instanceof TFile)) return;
				if (file.extension !== "md") return;
				if (
					this.settings.folder &&
					!file.path.startsWith(
						this.settings.folder + "/"
					)
				)
					return;

				menu.addItem((item) => {
					item.setTitle("Encrypt this file")
						.setIcon("lock")
						.onClick(async () => {
							const tf = file as TFile;
							const content =
								await this.app.vault.read(tf);
							if (
								content.startsWith("U2FsdGVkX1")
							) {
								new Notice(
									`${tf.name} is already encrypted`
								);
								return;
							}
							new Notice(
								`Encrypting ${tf.name}...`
							);
							const encrypted =
								CryptoJS.AES.encrypt(
									content,
									this.settings.password
								).toString();
							await this.app.vault.modify(
								tf,
								encrypted
							);
							this.decorateFileExplorer();
							new Notice(
								`Encrypted: ${tf.name}`
							);
						});
				});

			menu.addItem((item) => {
				item.setTitle("Decrypt this file")
					.setIcon("unlock")
					.onClick(async () => {
						const tf = file as TFile;

						const doDecrypt = async () => {
							const content =
								await this.app.vault.read(tf);
							if (
								!content.startsWith(
									"U2FsdGVkX1"
								)
							) {
								new Notice(
									`${tf.name} is not encrypted`
								);
								return;
							}
							new Notice(
								`Decrypting ${tf.name}...`
							);
							const decrypted =
								CryptoJS.AES.decrypt(
									content,
									this.settings.password
								).toString(
									CryptoJS.enc.Utf8
								);
							if (decrypted) {
								await this.app.vault.modify(
									tf,
									decrypted
								);
								this.decorateFileExplorer();
								new Notice(
									`Decrypted: ${tf.name}`
								);
							}
						};

						if (this.settings.isLocked) {
							const pwModal = new Modal(
								this.app
							);
							pwModal.titleEl.setText(
								"Enter password to decrypt this file"
							);

							const input =
								pwModal.contentEl.createEl(
									"input",
									{
										type: "password",
										placeholder:
											"Vault password",
									}
								);

							const btnRow =
								pwModal.contentEl.createDiv(
									{
										cls:
											"modal-button-container",
									}
								);

							const cancelBtn =
								btnRow.createEl("button", {
									text: "Cancel",
								});
							cancelBtn.addEventListener(
								"click",
								() => pwModal.close()
							);

							const submitBtn =
								btnRow.createEl("button", {
									text: "Decrypt",
									cls: "mod-cta",
								});

							const checkPass = () => {
								if (
									hash(input.value) ===
									this.settings.password
								) {
									pwModal.close();
									doDecrypt();
								} else {
									new Notice(
										"Wrong password"
									);
									input.value = "";
									input.focus();
								}
							};

							submitBtn.addEventListener(
								"click",
								checkPass
							);
							input.addEventListener(
								"keypress",
								(e) => {
									if (e.key === "Enter")
										checkPass();
								}
							);

							pwModal.open();
							input.focus();
						} else {
							await doDecrypt();
						}
					});
			});
			})
		);
	}

	// ⚠ WARNING: Do NOT change this method. The SVGs in svgIcons.ts
	// depend on this exact logic (querySelectorAll("path") → paths[1] → toggle dasharray).
	// Changing this will BREAK the icon rendering.
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

	async lockVault(silent = false) {
		if (!this.settings.folder) {
			if (!silent) new Notice("Set a protected folder first.");
			return;
		}
		if (!silent) new Notice("Encrypting files...");
		await new Encrypt(this.app, this).encryptFilesInDirectory();
		this.settings.isLocked = true;
		await this.saveSettings();
		this.updateRibbonIcon();
		this.updateStatusBar();
		this.decorateFileExplorer();
		if (!silent) {
			new Notice(`'${this.settings.folder}' folder is locked 🔒`);
			new FolderLock(this.app, this).closeOnLocked();
		}
	}

	async unlockVault() {
		if (!this.settings.enablePass) return;
		const modal = new ModalEnterPassword(
			this.app,
			this,
			true,
			() => {
				this.updateRibbonIcon();
				this.updateStatusBar();
				this.decorateFileExplorer();
			},
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
		this.recovering = true;
		const key = this.settings.password;
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
		this.recovering = false;
		let msg = `Recovery: ${files.length} files, ${encrypted} encrypted`;
		if (fixed > 0) msg += `, ${fixed} fixed`;
		if (failed > 0) msg += `, ${failed} FAILED`;
		new Notice(msg, 8000);
	}

	updateStatusBar() {
		if (!this.statusBarItemEl) return;
		this.statusBarItemEl.setText(
			this.settings.isLocked ? "🔒 Locked" : "🔓 Unlocked"
		);
	}

	private setupExplorerObserver() {
		const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (!explorer) return;
		const container = explorer.view.containerEl;
		if (this.explorerObserver) this.explorerObserver.disconnect();
		this.explorerObserver = new MutationObserver(() => {
			this.decorateFileExplorer();
		});
		this.explorerObserver.observe(container, {
			childList: true,
			subtree: true,
		});
		this.decorateFileExplorer();
	}

	decorateFileExplorer() {
		if (!this.settings.folder) return;
		const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (!explorer) return;
		const container = explorer.view.containerEl;

		const files = container.querySelectorAll(".nav-file, .nav-file-title");
		files.forEach((file: Element) => {
			const el = file as HTMLElement;
			const path = el.getAttribute("data-path");
			if (path && path.startsWith(this.settings.folder + "/")) {
				const title = el.matches(".nav-file-title")
					? el
					: el.querySelector(".nav-file-title");
				if (title) {
					if (this.settings.isLocked) {
						title.addClass("is-encrypted");
					} else {
						title.removeClass("is-encrypted");
					}
				}
			}
		});
	}

	async changePassword(oldPass: string, newPass: string): Promise<boolean> {
		const oldHash = hash(oldPass);
		const newHash = hash(newPass);

		if (oldHash !== this.settings.password) {
			return false;
		}

		const files = new GetMDFiles(this.app, this).getFiles();
		if (files) {
			for (const file of files) {
				const content = await this.app.vault.read(file);
				let plaintext = content;

				if (content.startsWith("U2FsdGVkX1")) {
					const decrypted = CryptoJS.AES.decrypt(content, oldHash).toString(CryptoJS.enc.Utf8);
					if (decrypted) plaintext = decrypted;
				}

				if (plaintext.length > 0) {
					const reEncrypted = CryptoJS.AES.encrypt(plaintext, newHash).toString();
					await this.app.vault.modify(file, reEncrypted);
				}
			}
		}

		this.settings.password = newHash;
		this.settings.isLocked = true;
		await this.saveSettings();
		this.updateRibbonIcon();
		this.updateStatusBar();
		this.decorateFileExplorer();

		return true;
	}

	onunload() {
		window.removeEventListener("blur", this.blurHandler);
		if (this.explorerObserver) this.explorerObserver.disconnect();
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
						lockOnBlur: false,
						searchDecrypt: true,
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
