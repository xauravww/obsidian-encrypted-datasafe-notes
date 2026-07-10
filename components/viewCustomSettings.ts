import { App, ItemView, WorkspaceLeaf, Setting, Notice, setIcon } from "obsidian";
import main from "../main";
import { ModalSetPassword } from "./modalSetPassword";
import { ModalChangePassword } from "./modalChangePassword";
import { ModalEnterPassword } from "./modalEnterPassword";
import { hash } from "./hash";
import { FolderSuggestModal } from "./modalFolderSuggest";
import * as CryptoJS from "crypto-js";

export const VIEW_TYPE_CUSTOM_SETTINGS = "datasafe-custom-settings-view";

export class CustomSettingsView extends ItemView {
	plugin: main;
	activeTab: string = "security";
	contentContainer: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: main) {
		super(leaf);
		this.plugin = plugin;
	}

	refresh() {
		if (this.contentContainer) {
			this.renderContent(this.contentContainer);
		}
	}

	getViewType() {
		return VIEW_TYPE_CUSTOM_SETTINGS;
	}

	getDisplayText() {
		return "Datasafe Settings";
	}
	
	getIcon() {
		return "settings";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("mac-settings-view");

		const layout = container.createDiv({ cls: "mac-container" });

		// --- SIDEBAR ---
		const sidebar = layout.createDiv({ cls: "mac-sidebar" });
		
		const sidebarHeader = sidebar.createDiv({ cls: "mac-sidebar-header" });
		sidebarHeader.createEl("h2", { text: "Datasafe", cls: "mac-brand" });

		const nav = sidebar.createEl("nav", { cls: "mac-nav" });
		
		const createNavItem = (id: string, icon: string, text: string) => {
			const item = nav.createEl("div", { cls: `mac-nav-item ${this.activeTab === id ? 'active' : ''}` });
			
			const iconEl = item.createSpan({ cls: "mac-nav-icon" });
			setIcon(iconEl, icon);
			
			item.createSpan({ cls: "mac-nav-text", text: text });
			
			item.addEventListener("click", () => {
				this.activeTab = id;
				this.renderContent(this.contentContainer);
				
				// Update active state
				nav.querySelectorAll(".mac-nav-item").forEach(el => el.classList.remove("active"));
				item.classList.add("active");
			});
		};

		createNavItem("security", "shield-check", "Security");
		createNavItem("behavior", "sliders-horizontal", "Behavior");

		// --- MAIN CONTENT ---
		this.contentContainer = layout.createDiv({ cls: "mac-content-area" });
		this.renderContent(this.contentContainer);
	}

	renderContent(container: HTMLElement) {
		container.empty();
		
		const scrollArea = container.createDiv({ cls: "mac-scroll-area" });

		if (this.activeTab === "security") {
			this.renderSecurityTab(scrollArea);
		} else if (this.activeTab === "behavior") {
			this.renderBehaviorTab(scrollArea);
		}
	}

	renderSecurityTab(container: HTMLElement) {
		container.createEl("h1", { text: "Security", cls: "mac-page-title" });
		container.createEl("p", { text: "Manage your Master Vault Key and encryption status.", cls: "mac-page-subtitle" });

		const card = container.createDiv({ cls: "mac-card" });
		
		const statusBanner = card.createDiv({ cls: "mac-status-banner", attr: { style: "display: flex; align-items: center; gap: 16px; padding: 24px; background: rgba(0,0,0,0.2); border-radius: 12px; margin-bottom: 24px;" } });
		const statusIcon = statusBanner.createDiv({ attr: { style: `display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: ${this.plugin.settings.enablePass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${this.plugin.settings.enablePass ? '#22c55e' : '#ef4444'};` } });
		setIcon(statusIcon, this.plugin.settings.enablePass ? "shield-check" : "shield-alert");
		
		const statusText = statusBanner.createDiv();
		statusText.createEl("div", { text: "Vault Protection", attr: { style: "font-family: 'Manrope', sans-serif; font-size: 14px; color: #8b8b93; margin-bottom: 4px;" } });
		statusText.createEl("div", { text: this.plugin.settings.enablePass ? "Active and Encrypted" : "Unprotected", attr: { style: `font-family: 'Cinzel', serif; font-size: 20px; font-weight: 700; color: ${this.plugin.settings.enablePass ? '#22c55e' : '#ef4444'};` } });

		if (!this.plugin.settings.enablePass) {
			const setupDiv = card.createDiv({ cls: "mac-inline-form", attr: { style: "margin-top: 16px; padding-top: 8px;" } });
			setupDiv.createEl("h3", { text: "Create Master Password", cls: "mac-section-header", attr: { style: "color: #e5e5e5; margin-bottom: 16px; font-family: 'Cinzel', serif;" } });
			
			let pass = "";
			let repass = "";

			const createInput = (placeholder: string) => {
				const wrapper = setupDiv.createDiv({ attr: { style: "position: relative; margin-bottom: 16px;" } });
				const input = wrapper.createEl("input", { type: "password", placeholder, attr: { style: "width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" } });
				const eyeBtn = wrapper.createDiv({ attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #8b8b93; display: flex; align-items: center;" } });
				setIcon(eyeBtn, "eye");
				eyeBtn.addEventListener("click", () => {
					input.type = input.type === "password" ? "text" : "password";
					setIcon(eyeBtn, input.type === "password" ? "eye" : "eye-off");
				});
				return input;
			};

			const passInput = createInput("Enter your local password");
			passInput.addEventListener("input", (e) => pass = (e.target as HTMLInputElement).value);

			const repassInput = createInput("Re-enter your password");
			repassInput.addEventListener("input", (e) => repass = (e.target as HTMLInputElement).value);

			const createBtn = setupDiv.createEl("button", { text: "Create Vault", cls: "mac-btn-primary", attr: { style: "width: 100%; padding: 12px; margin-top: 8px; border-radius: 8px;" } });
			createBtn.addEventListener("click", async () => {
				if (pass !== repass) { new Notice("Passwords do not match"); return; }
				if (pass.length === 0) { new Notice("Password cannot be empty"); return; }
				
				
				const hashed = hash(pass);
				
				const mvk = CryptoJS.lib.WordArray.random(32).toString();
				const code = CryptoJS.lib.WordArray.random(16).toString().toUpperCase().match(/.{1,4}/g)?.join('-') || "ERR-CODE";
				
				this.plugin.settings.password = mvk; // MUST use MVK for file encryption!
				this.plugin.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", hashed).toString();
				this.plugin.settings.encryptedMVK = CryptoJS.AES.encrypt(mvk, hashed).toString();
				this.plugin.settings.recoveryEncryptedMVK = CryptoJS.AES.encrypt(mvk, hash(code)).toString();
				this.plugin.settings.enablePass = true;
				
				await this.plugin.saveSettings();
				new Notice("Vault protected successfully! 🔑");
				this.plugin.toggleFlag = true;
				
				// Show recovery code inline instead of modal
				setupDiv.empty();
				setupDiv.createEl("h3", { text: "🚨 CRITICAL: Recovery Code", attr: { style: "color: #ef4444; font-family: 'Cinzel', serif;" } });
				setupDiv.createEl("p", { text: "If you ever forget your password, this code is the ONLY way to recover your vault. If you lose this code AND your password, your files are gone forever.", attr: { style: "color: #e5e5e5; font-size: 14px; margin-bottom: 16px;" } });
				
				const codeWrapper = setupDiv.createDiv({ attr: { style: "position: relative; margin-bottom: 16px;" } });
				codeWrapper.createEl("div", { text: code, attr: { style: "background: rgba(0,0,0,0.3); padding: 20px; text-align: center; font-family: monospace; font-size: 18px; user-select: all; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; letter-spacing: 2px; color: #fff;" } });
				
				const copyBtn = codeWrapper.createDiv({ attr: { style: "position: absolute; top: 8px; right: 8px; padding: 6px; cursor: pointer; border-radius: 6px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: #a1a1aa;" } });
				setIcon(copyBtn, "copy");
				copyBtn.addEventListener("click", async () => {
					await navigator.clipboard.writeText(code);
					setIcon(copyBtn, "check"); copyBtn.style.color = "#22c55e";
					new Notice("Copied to clipboard!");
					setTimeout(() => { setIcon(copyBtn, "copy"); copyBtn.style.color = "#a1a1aa"; }, 2000);
				});
				
				const dismissBtn = setupDiv.createEl("button", { text: "I have safely copied this code", cls: "mac-btn-primary", attr: { style: "width: 100%; padding: 12px;" } });
				dismissBtn.addEventListener("click", () => this.onOpen());
			});
		} else {
			const disableBtn = statusBanner.createEl("button", { text: "Disable", cls: "mac-btn-danger", attr: { style: "margin-left: auto;" } });
			
			const disableForm = card.createDiv({ attr: { style: "display: none; margin-top: 16px; padding: 16px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px;" } });
			disableForm.createEl("div", { text: "Confirm Disable Protection", attr: { style: "color: #ef4444; font-family: 'Cinzel', serif; font-weight: 700; font-size: 16px; margin-bottom: 12px;" } });
			
			let disablePass = "";
			const passWrapper = disableForm.createDiv({ attr: { style: "position: relative; margin-bottom: 16px;" } });
			const confirmInput = passWrapper.createEl("input", { type: "password", placeholder: "Enter current password to disable", attr: { style: "width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" } });
			const eyeBtn = passWrapper.createDiv({ attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #8b8b93; display: flex; align-items: center;" } });
			setIcon(eyeBtn, "eye");
			eyeBtn.addEventListener("click", () => {
				confirmInput.type = confirmInput.type === "password" ? "text" : "password";
				setIcon(eyeBtn, confirmInput.type === "password" ? "eye" : "eye-off");
			});

			confirmInput.addEventListener("input", (e) => disablePass = (e.target as HTMLInputElement).value);
			
			const actionRow = disableForm.createDiv({ attr: { style: "display: flex; gap: 8px; align-items: center;" } });
			const confirmBtn = actionRow.createEl("button", { text: "Confirm Disable", cls: "mac-btn-danger" });
			const cancelBtn = actionRow.createEl("button", { text: "Cancel", cls: "mac-btn-secondary" });
			
			let resetBtn: HTMLButtonElement | null = null;
			if (this.plugin.settings.recoveryEncryptedMVK) {
				resetBtn = actionRow.createEl("button", { text: "Use Recovery Code", cls: "mac-btn-secondary", attr: { style: "margin-left: auto; color: #ef4444;" } });
				resetBtn.addEventListener("click", () => {
					// Inline Recovery Flow
					disableForm.empty();
					disableForm.createEl("div", { text: "Recover Vault", attr: { style: "color: #ef4444; font-family: 'Cinzel', serif; font-weight: 700; font-size: 16px; margin-bottom: 12px;" } });
					
					let recCode = "";
					const recInput = disableForm.createEl("input", { type: "text", placeholder: "Enter your 32-character recovery code", attr: { style: "width: 100%; padding: 12px 16px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: monospace; margin-bottom: 16px;" } });
					recInput.addEventListener("input", (e) => recCode = (e.target as HTMLInputElement).value.trim());
					
					const recActionRow = disableForm.createDiv({ attr: { style: "display: flex; gap: 8px;" } });
					const verifyBtn = recActionRow.createEl("button", { text: "Verify Code", cls: "mac-btn-danger" });
					const cancelRecBtn = recActionRow.createEl("button", { text: "Cancel", cls: "mac-btn-secondary" });
					
					cancelRecBtn.addEventListener("click", () => this.onOpen());
					
					verifyBtn.addEventListener("click", async () => {
						
						const codeHash = hash(recCode);
						let mvk = "";
						try {
							mvk = CryptoJS.AES.decrypt(this.plugin.settings.recoveryEncryptedMVK, codeHash).toString(CryptoJS.enc.Utf8);
						} catch (e) {}

						if (!mvk) {
							new Notice("Invalid recovery code.");
							return;
						}
						
						new Notice("Code accepted! Please set a new password.");
						disableForm.empty();
						disableForm.createEl("div", { text: "Set New Password", attr: { style: "color: #ef4444; font-family: 'Cinzel', serif; font-weight: 700; font-size: 16px; margin-bottom: 12px;" } });
						
						let rpass = ""; let rrepass = "";
						
						const rcreateInput = (placeholder: string) => {
							const wrapper = disableForm.createDiv({ attr: { style: "position: relative; margin-bottom: 16px;" } });
							const input = wrapper.createEl("input", { type: "password", placeholder, attr: { style: "width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" } });
							const eyeBtn = wrapper.createDiv({ attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #8b8b93; display: flex; align-items: center;" } });
							setIcon(eyeBtn, "eye");
							eyeBtn.addEventListener("click", () => {
								input.type = input.type === "password" ? "text" : "password";
								setIcon(eyeBtn, input.type === "password" ? "eye" : "eye-off");
							});
							return input;
						};

						const rpassInput = rcreateInput("Enter new password");
						rpassInput.addEventListener("input", (e) => rpass = (e.target as HTMLInputElement).value);
						
						const rrepassInput = rcreateInput("Confirm new password");
						rrepassInput.addEventListener("input", (e) => rrepass = (e.target as HTMLInputElement).value);
						
						const finalActionRow = disableForm.createDiv({ attr: { style: "display: flex; gap: 8px;" } });
						const submitResetBtn = finalActionRow.createEl("button", { text: "Reset Password", cls: "mac-btn-danger" });
						const cancelResetBtn = finalActionRow.createEl("button", { text: "Cancel", cls: "mac-btn-secondary" });
						
						cancelResetBtn.addEventListener("click", () => this.onOpen());
						
						submitResetBtn.addEventListener("click", async () => {
							if (rpass !== rrepass) { new Notice("Passwords do not match"); return; }
							if (rpass.length === 0) { new Notice("Password cannot be empty"); return; }
							
							const newHash = hash(rpass);
							this.plugin.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", newHash).toString();
							this.plugin.settings.encryptedMVK = CryptoJS.AES.encrypt(mvk, newHash).toString();
							await this.plugin.saveSettings();
							new Notice("Password has been reset successfully! 🔑");
							this.onOpen();
						});
					});
				});
			}
			
			disableBtn.addEventListener("click", () => {
				disableBtn.style.display = "none";
				disableForm.style.display = "block";
				confirmInput.focus();
			});
			
			cancelBtn.addEventListener("click", () => {
				disableBtn.style.display = "block";
				disableForm.style.display = "none";
				confirmInput.value = "";
				disablePass = "";
			});
			
			confirmBtn.addEventListener("click", async () => {
				
				const inputHash = hash(disablePass);
				let isValid = false;
				
				if (this.plugin.settings.passwordVerifier) {
					try {
						const decrypted = CryptoJS.AES.decrypt(this.plugin.settings.passwordVerifier, inputHash).toString(CryptoJS.enc.Utf8);
						if (decrypted === "VALID") isValid = true;
					} catch (e) {}
				} else if (this.plugin.settings.password && inputHash === this.plugin.settings.password) {
					isValid = true;
				}
				
				if (isValid) {
					// Also decrypt files back if needed
					if (this.plugin.settings.fileEncrypt && this.plugin.settings.fileEncrypt.isAlreadyEncrypted) {
						new Notice("Decrypting files before disabling protection...");
						this.plugin.settings.password = inputHash; // temporary for decryption
						const { Decrypt } = require("./decrypt");
						await new Decrypt(this.app, this.plugin).decryptFilesInDirectory();
						this.plugin.encryptedPaths.clear();
					}
					
					this.plugin.settings.password = "";
					this.plugin.settings.passwordVerifier = "";
					this.plugin.settings.encryptedMVK = "";
					this.plugin.settings.recoveryEncryptedMVK = "";
					this.plugin.settings.enablePass = false;
					await this.plugin.saveSettings();
					new Notice("Password protection disabled successfully.");
					this.onOpen();
				} else {
					new Notice("Incorrect password.");
				}
			});

			const changeDiv = card.createDiv({ cls: "mac-inline-form", attr: { style: "margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.05);" } });
			changeDiv.createEl("h3", { text: "Change Master Password", cls: "mac-section-header", attr: { style: "color: #e5e5e5; margin-bottom: 16px; font-family: 'Cinzel', serif;" } });
			
			let oldpass = "";
			let newpass = "";
			let renewpass = "";

			const createInput = (placeholder: string) => {
				const wrapper = changeDiv.createDiv({ attr: { style: "position: relative; margin-bottom: 16px;" } });
				const input = wrapper.createEl("input", { type: "password", placeholder, attr: { style: "width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" } });
				const eyeBtn = wrapper.createDiv({ attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #8b8b93; display: flex; align-items: center;" } });
				setIcon(eyeBtn, "eye");
				eyeBtn.addEventListener("click", () => {
					input.type = input.type === "password" ? "text" : "password";
					setIcon(eyeBtn, input.type === "password" ? "eye" : "eye-off");
				});
				return input;
			};

			const oldInput = createInput("Current password");
			oldInput.addEventListener("input", (e) => oldpass = (e.target as HTMLInputElement).value);

			const newInput = createInput("New password");
			newInput.addEventListener("input", (e) => newpass = (e.target as HTMLInputElement).value);

			const renewInput = createInput("Confirm new password");
			renewInput.addEventListener("input", (e) => renewpass = (e.target as HTMLInputElement).value);

			const changeBtn = changeDiv.createEl("button", { text: "Update Password", cls: "mac-btn-secondary", attr: { style: "width: 100%; padding: 12px; margin-top: 8px; border-radius: 8px;" } });
			changeBtn.addEventListener("click", async () => {
				if (newpass !== renewpass) { new Notice("New passwords do not match"); return; }
				if (newpass.length === 0) { new Notice("Password cannot be empty"); return; }
				
				const success = await this.plugin.changePassword(oldpass, newpass);
				if (success) {
					new Notice("Password changed successfully");
					oldInput.value = ""; newInput.value = ""; renewInput.value = "";
				} else {
					new Notice("Current password is incorrect");
				}
			});
		}
	}


	renderBehaviorTab(container: HTMLElement) {
		container.createEl("h1", { text: "Behavior & Advanced", cls: "mac-page-title" });
		container.createEl("p", { text: "Fine-tune locking rules and plugin automation.", cls: "mac-page-subtitle" });

		const card = container.createDiv({ cls: "mac-card" });

		const autoLockSetting = new Setting(card)
			.setName("Auto Lock (seconds)")
			.setDesc(`Automatically lock the vault after inactivity. Currently: ${Number(this.plugin.settings.autoLock) === 0 ? "Disabled" : this.plugin.settings.autoLock + " seconds"}`);
			
		autoLockSetting.addSlider((slider) => slider
				.setLimits(0, 600, 10)
				.setValue(Number(this.plugin.settings.autoLock) || 0)
				.setDynamicTooltip()
				.onChange(async (val) => {
					this.plugin.settings.autoLock = val.toString();
					autoLockSetting.setDesc(`Automatically lock the vault after inactivity. Currently: ${val === 0 ? "Disabled" : val + " seconds"}`);
					await this.plugin.saveSettings();
					this.plugin.refreshAutoLock();
				})
			);

		new Setting(card)
			.setName("Lock on Window Blur")
			.setDesc("Instantly lock the vault when switching to another app.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.lockOnBlur)
				.onChange(async (val) => {
					this.plugin.settings.lockOnBlur = val;
					await this.plugin.saveSettings();
				})
			);
			
		new Setting(card)
			.setName("Decrypt for Search")
			.setDesc("Decrypt all files on unlock so Obsidian's search can index them.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.searchDecrypt)
				.onChange(async (val) => {
					this.plugin.settings.searchDecrypt = val;
					await this.plugin.saveSettings();
				})
			);

		new Setting(card)
			.setName("Repair Vault")
			.setDesc("Scan and recover corrupted or multi-encrypted files. Non-destructive — files that can't be recovered are left untouched. Vault must be unlocked.")
			.addButton((btn) => btn
				.setButtonText("Repair")
				.setClass("mac-btn-secondary")
				.onClick(async () => {
					if (this.plugin.settings.isLocked || !this.plugin.getFileKey()) {
						new Notice("Unlock the vault first, then run Repair.");
						return;
					}
					await this.plugin.promptRepairVault();
				})
			);
			
		const folderSetting = new Setting(card)
			.setName("Protected Folder")
			.setDesc("Select a folder to only protect specific files. Leave empty to protect the entire vault.");

		const updateFolderUI = () => {
			folderSetting.controlEl.empty();
			
			const folderChip = folderSetting.controlEl.createDiv({
				attr: {
					style: "display: flex; align-items: center; gap: 8px; background: rgba(147, 51, 234, 0.1); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(147, 51, 234, 0.3); cursor: pointer; transition: background 0.2s;"
				}
			});
			
			folderChip.createSpan({ text: this.plugin.settings.folder || "Entire Vault", attr: { style: "font-family: monospace; font-size: 13px; color: #e5e5e5;" } });
			
			const editIcon = folderChip.createSpan({ attr: { style: "display: flex; align-items: center; color: #c084fc; opacity: 0.7; margin-left: 4px;" } });
			setIcon(editIcon, "pencil");
			
			folderChip.addEventListener("mouseover", () => {
				if (!this.plugin.settings.enablePass) folderChip.style.background = "rgba(147, 51, 234, 0.2)";
			});
			folderChip.addEventListener("mouseout", () => {
				if (!this.plugin.settings.enablePass) folderChip.style.background = "rgba(147, 51, 234, 0.1)";
			});
			
			folderChip.addEventListener("click", () => {
				if (this.plugin.settings.enablePass) return;
				new FolderSuggestModal(this.app, async (folder) => {
					this.plugin.settings.folder = folder ? folder.path : "";
					await this.plugin.saveSettings();
					updateFolderUI();
				}).open();
			});
			
			if (this.plugin.settings.enablePass) {
				folderChip.style.opacity = "0.5";
				folderChip.style.cursor = "not-allowed";
				folderSetting.controlEl.title = "You must disable password protection first to change the protected folder.";
			} else {
				folderSetting.controlEl.title = "";
			}
		};
		
		updateFolderUI();
			
		new Setting(card)
			.setName("Show Custom Settings Icon")
			.setDesc("Show a gear icon in the left ribbon to open this modern settings menu.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showCustomSettingsIcon)
				.onChange(async (val) => {
					this.plugin.settings.showCustomSettingsIcon = val;
					await this.plugin.saveSettings();
					this.plugin.updateSettingsRibbon();
				})
			);
			
		new Setting(card)
			.setName("Show UI Animations")
			.setDesc("Enable to see smooth modal and background animations.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.animations)
				.onChange(async (val) => {
					this.plugin.settings.animations = val;
					await this.plugin.saveSettings();
				})
			);
	}

	async onClose() {
		// Nothing needed here
	}
}
