import main from "main";
import { App, Modal, Notice, Setting, moment, setIcon } from "obsidian";
import { hash } from "./hash";
import { Decrypt } from "./decrypt";
import { ModalRecovery } from "./modalRecovery";
import { ModalFactoryReset } from "./modalFactoryReset";
import * as CryptoJS from "crypto-js";

export class ModalEnterPassword extends Modal {
	plugin: main;
	value: string;
	description: string;
	submited: boolean;
	lockIcon: HTMLSpanElement;
	onSubmit?: () => void;
	onLeave?: () => void;
	isClosable?: boolean;
	disablingPass?: boolean;
	desc: HTMLDivElement | null;

	constructor(
		app: App,
		plugin: main,
		isClosable?: boolean,
		onSubmit?: () => void,
		onLeave?: () => void,
		disablingPass?: boolean
	) {
		super(app);
		this.plugin = plugin;
		this.value = "";
		this.submited = false;
		this.isClosable = isClosable;
		this.onSubmit = onSubmit;
		this.onLeave = onLeave;
		this.disablingPass = disablingPass;
		this.desc = null;
	}

	updatePluginIcon() {
		try { (this.plugin as any).updateRibbonIcon?.(); } catch (_) {}
	}

	async onOpen() {
		this.value = "";
		this.plugin.settings.isLocked = true;
		await this.plugin.saveSettings();

		const { modalEl, contentEl } = this; //take modal and modal_content (as HTML elements)

		contentEl.empty(); //clear the old content because modal reopen when we click outside

		// get the app-container and give it a class to give the blur-effect
		const app_container = document.querySelector(".app-container");
		app_container?.classList.add("app-container__lock_password");

		modalEl.classList.add("password_modal");
		modalEl.style.background = "#0f0f13";
		modalEl.style.border = "1px solid rgba(255, 255, 255, 0.08)";
		modalEl.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.8)";
		modalEl.style.borderRadius = "16px";
		modalEl.style.padding = "0";

		const closeBtn = modalEl.querySelector(".modal-close-button");
		if (closeBtn) closeBtn.remove();

		contentEl.empty();
		contentEl.addClass("mac-settings-view");
		contentEl.style.padding = "32px";
		contentEl.style.position = "relative"; // Ensure absolute positioning works for close btn

		if (this.isClosable) {
			const customCloseBtn = contentEl.createEl("button", {
				attr: { 
					style: "position: absolute; top: 16px; right: 16px; background: transparent; border: none; box-shadow: none; color: #a1a1aa; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s;"
				}
			});
			setIcon(customCloseBtn, "x");
			customCloseBtn.addEventListener("mouseover", () => customCloseBtn.style.opacity = "1");
			customCloseBtn.addEventListener("mouseout", () => customCloseBtn.style.opacity = "0.7");
			customCloseBtn.addEventListener("click", () => this.close());
		}

		const div_main = contentEl.createDiv({
			attr: { style: "max-width: 400px; margin: auto;" }
		});

		div_main.createEl("h2", {
			text: "Vault Locked",
			attr: { style: "text-align: center; font-family: 'Cinzel', serif; font-weight: 700; font-size: 24px; margin-bottom: 8px;" }
		});
		
		div_main.createEl("p", {
			text: "Enter your Master Password to unlock your vault.",
			attr: { style: "text-align: center; color: #a1a1aa; font-size: 14px; margin-bottom: 24px;" }
		});

		const div_input = div_main.createDiv();

		const wrapper = div_input.createDiv({ attr: { style: "position: relative; width: 100%; margin-bottom: 16px;" } });
		
		const password_input = wrapper.createEl("input", {
			type: "password",
			value: this.value || "",
			placeholder: "Master Password",
			attr: { style: "display: block; width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" }
		});
		password_input.classList.add("password_input");
		
		const toggleIcon = wrapper.createDiv({
			attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; line-height: 0; cursor: pointer; color: #8b8b93;" }
		});
		setIcon(toggleIcon, "eye");
		
		let isPasswordVisible = false;
		toggleIcon.addEventListener("click", () => {
			isPasswordVisible = !isPasswordVisible;
			password_input.type = isPasswordVisible ? "text" : "password";
			setIcon(toggleIcon, isPasswordVisible ? "eye-off" : "eye");
		});

		password_input.addEventListener("input", (event: Event) => {
			const text = event.target as HTMLInputElement;
			this.value = text.value;
		});

		password_input.addEventListener("keypress", (event) => {
			if (event.key === "Enter") {
				this.comparePassword();
			}
		});

		const errorDiv = div_input.createDiv({
			cls: "error-message",
			attr: { style: "color: #ef4444; font-size: 14px; margin-bottom: 16px; display: none; text-align: center;" }
		});

		const btnRow = div_main.createDiv({ attr: { style: "display: flex; gap: 8px; margin-bottom: 16px;" } });
		
		const submitBtn = btnRow.createEl("button", { text: "Unlock Vault", cls: "mac-btn-primary", attr: { style: "flex: 1; padding: 12px;" } });
		submitBtn.addEventListener("click", () => this.comparePassword());
		
		const forgotBtn = btnRow.createEl("button", { text: "Forgot?", cls: "mac-btn-secondary", attr: { style: "padding: 12px;" } });
		forgotBtn.addEventListener("click", () => {
			new ModalRecovery(this.app, this.plugin).open();
		});

		const resetBtn = div_main.createEl("button", { text: "⚠️ Factory Reset & Erase Data", cls: "mac-btn-danger", attr: { style: "width: 100%; padding: 12px; margin-bottom: 8px;" } });
		resetBtn.addEventListener("click", () => {
			new ModalFactoryReset(this.app, this.plugin, this).open();
		});
		
		// NOTE: The unlock modal must NEVER encrypt on open. Encryption is owned
		// solely by lockVault() / auto-lock. Opening this dialog only unlocks.

		password_input.focus();
	}

	async comparePassword() {
		const input = this.contentEl.querySelector(".password_input") as HTMLInputElement;
		const currentInput = input ? input.value || this.value : this.value;
		if (input) input.value = "";

		const inputHash = hash(currentInput);
		let isValid = false;

		if (this.plugin.settings.passwordVerifier) {
			try {
				const decrypted = CryptoJS.AES.decrypt(this.plugin.settings.passwordVerifier, inputHash).toString(CryptoJS.enc.Utf8);
				if (decrypted === "VALID") isValid = true;
			} catch (e) {
			}
		} else if (this.plugin.settings.password && inputHash === this.plugin.settings.password) {
			isValid = true;
		}

		if (!isValid) {
			this.value = "";
			const errorDiv = this.contentEl.querySelector(".error-message") as HTMLDivElement;
			if (errorDiv) {
				errorDiv.innerText = `Sorry, wrong password.`;
				errorDiv.style.display = "block";
			}
		} else {
			if (this.plugin.settings.encryptedMVK) {
				const mvk = CryptoJS.AES.decrypt(this.plugin.settings.encryptedMVK, inputHash).toString(CryptoJS.enc.Utf8);
				this.plugin.settings.password = mvk || inputHash;
				this.plugin.settings.fallbackPassword = inputHash; // Save fallback to recover bugged files
			} else {
				this.plugin.settings.password = inputHash; // Save into RAM for decryption
				this.plugin.settings.fallbackPassword = undefined;
			}
			
			// Upgrade legacy users to verifier
			if (!this.plugin.settings.passwordVerifier) {
				this.plugin.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", inputHash).toString();
				this.plugin.saveSettings(); 
			}

			if (this.plugin.settings.animations) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}

			// Always decrypt on unlock. (The old fileEncrypt.isAlreadyEncrypted
			// flag drifted from disk reality and gated decryption incorrectly.)
			if (this.desc) {
				this.desc.classList.remove("password_modal__alert");
				this.desc.innerText = "🛆 Decrypting all files..";
			}

			if (this.plugin.isBusy) return;
			this.plugin.isBusy = true;
			try {
				input.disabled = true;
				// Rebuild encryptedPaths from disk so Decrypt knows exactly which
				// files to touch — do NOT trust a stale in-RAM set.
				await this.plugin.reconcileEncryptedPaths();
				await new Decrypt(
					this.app,
					this.plugin
				).decryptFilesInDirectory();
			} catch (e) {
				console.error("Unlock error:", e);
			} finally {
				this.plugin.isBusy = false;
			}

			//we use submited in case we clicked out our password modal
			this.plugin.settings.isLocked = false;
			await this.plugin.saveSettings();
			this.submited = true;
			this.plugin.toggleFlag = false;
			this.updatePluginIcon();
			this.plugin.refreshAutoLock(); // arm auto-lock now that we're unlocked
			await this.plugin.refreshAllLeaves();
			this.close();
			new Notice(`${this.plugin.settings.folder || "Vault"} unlocked 🔓`);
		}
	}

	onClose() {
		if (this.submited || this.isClosable) {
			//remove blur effect
			const app_container = document.querySelector(".app-container");
			app_container?.classList.remove("app-container__lock_password");

			if (this.plugin.settings.animations) {
				const containerBlur = document.querySelector(
					".app-container"
				) as HTMLDivElement;
				if (containerBlur) containerBlur.classList.add("blur");

				//remove blur effect after 5ml second
				setTimeout(() => {
					containerBlur.classList.remove("blur");
				}, 500);
			}

			this.plugin.saveSettings();
			if (!this.submited && this.onLeave) this.onLeave();
			if (this.submited && this.onSubmit) this.onSubmit();
		} else {
			this.open(); //reopen the modal if we clicked outside
		}
	}
}
