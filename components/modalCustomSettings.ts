import { App, Modal, Setting, Notice } from "obsidian";
import main from "../main";
import { ModalSetPassword } from "./modalSetPassword";
import { ModalChangePassword } from "./modalChangePassword";
import { ModalEnterPassword } from "./modalEnterPassword";
import * as CryptoJS from "crypto-js";

export class ModalCustomSettings extends Modal {
	plugin: main;
	activeTab: string = "security";

	constructor(app: App, plugin: main) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.classList.add("mac-settings-modal");
		
		// Hide the default Obsidian close button because we use Mac traffic lights
		const closeBtn = this.modalEl.querySelector(".modal-close-button");
		if (closeBtn) {
			(closeBtn as HTMLElement).style.display = "none";
		}

		contentEl.empty();

		const container = contentEl.createDiv({ cls: "mac-container" });

		// --- SIDEBAR ---
		const sidebar = container.createDiv({ cls: "mac-sidebar" });
		
		const sidebarHeader = sidebar.createDiv({ cls: "mac-sidebar-header" });
		const trafficLights = sidebarHeader.createDiv({ cls: "mac-traffic-lights" });
		
		const closeLight = trafficLights.createDiv({ cls: "mac-light mac-close" });
		closeLight.addEventListener("click", () => this.close());
		
		trafficLights.createDiv({ cls: "mac-light mac-min" });
		trafficLights.createDiv({ cls: "mac-light mac-max" });

		sidebar.createEl("h2", { text: "Datasafe", cls: "mac-brand" });

		const nav = sidebar.createEl("nav", { cls: "mac-nav" });
		
		const createNavItem = (id: string, icon: string, text: string) => {
			const item = nav.createEl("div", { cls: `mac-nav-item ${this.activeTab === id ? 'active' : ''}` });
			item.innerHTML = `<span class="mac-nav-icon">${icon}</span> ${text}`;
			item.addEventListener("click", () => {
				this.activeTab = id;
				this.renderContent(contentContainer);
				
				// Update active state
				nav.querySelectorAll(".mac-nav-item").forEach(el => el.classList.remove("active"));
				item.classList.add("active");
			});
		};

		createNavItem("security", "🔒", "Security");
		createNavItem("behavior", "⚙️", "Behavior & Advanced");

		// --- MAIN CONTENT ---
		const contentContainer = container.createDiv({ cls: "mac-content-area" });
		this.renderContent(contentContainer);
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
		
		new Setting(card)
			.setName("Vault Protection")
			.setDesc(this.plugin.settings.enablePass ? "Your vault is securely encrypted." : "Your vault is currently unprotected.")
			.addButton((btn) => {
				btn.setButtonText(this.plugin.settings.enablePass ? "Disable" : "Enable")
					.setClass(this.plugin.settings.enablePass ? "mac-btn-danger" : "mac-btn-primary")
					.onClick(() => {
						if (this.plugin.settings.enablePass) {
							new ModalEnterPassword(this.app, this.plugin, true, async () => {
								this.plugin.settings.password = "";
								this.plugin.settings.passwordVerifier = "";
								this.plugin.settings.encryptedMVK = "";
								this.plugin.settings.recoveryEncryptedMVK = "";
								this.plugin.settings.enablePass = false;
								await this.plugin.saveSettings();
								new Notice("Password protection disabled.");
								this.onOpen(); 
							}).open();
						} else {
							new ModalSetPassword(this.app, this.plugin, async (newHash) => {
								if (newHash) {
									this.plugin.settings.enablePass = true;
									await this.plugin.saveSettings();
									this.onOpen();
								}
							}).open();
						}
					});
			});

		if (this.plugin.settings.enablePass) {
			new Setting(card)
				.setName("Change Master Password")
				.setDesc("Instantly re-encrypt your Master Vault Key.")
				.addButton((btn) => {
					btn.setButtonText("Change Password")
						.setClass("mac-btn-secondary")
						.onClick(() => {
						new ModalChangePassword(this.app, this.plugin).open();
					});
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
	}

	onClose() {
		this.contentEl.empty();
	}
}
