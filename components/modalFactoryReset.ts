import { App, Modal, Notice, Setting } from "obsidian";
import main from "../main";

export class ModalFactoryReset extends Modal {
	plugin: main;
	parentModal: Modal;
	value: string = "";

	constructor(app: App, plugin: main, parentModal: Modal) {
		super(app);
		this.plugin = plugin;
		this.parentModal = parentModal;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h1", { text: "⚠️ CRITICAL WARNING" });
		
		contentEl.createEl("p", { 
			text: "You are about to factory reset the plugin. This will permanently delete your Master Vault Key. ALL CURRENTLY ENCRYPTED FILES WILL BE LOST FOREVER AND CANNOT BE RECOVERED.",
			cls: "password_modal__alert"
		});

		contentEl.createEl("p", { 
			text: "Type 'DELETE' below to confirm you understand that your encrypted data will be destroyed.",
			attr: { style: "margin-top: 10px;" }
		});

		const input = contentEl.createEl("input", {
			type: "text",
			placeholder: "DELETE",
			attr: { style: "width: 100%; margin: 15px 0; padding: 10px;" }
		});

		input.addEventListener("input", (e) => {
			this.value = (e.target as HTMLInputElement).value;
		});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("FACTORY RESET")
					.setCta()
					.onClick(async () => {
						if (this.value === "DELETE") {
							// Factory Reset Everything
							this.plugin.settings.password = "";
							this.plugin.settings.passwordVerifier = "";
							this.plugin.settings.encryptedMVK = "";
							this.plugin.settings.recoveryEncryptedMVK = "";
							this.plugin.settings.enablePass = false;
							this.plugin.settings.isLocked = false;
							this.plugin.encryptedPaths.clear();
							await this.plugin.saveSettings();
							
							new Notice("Plugin factory reset successfully. Reloading Obsidian...");
							
							// Force an app reload to ensure all lock states and modals are cleared from memory
							setTimeout(() => {
								window.location.reload();
							}, 1500);
						} else {
							new Notice("You must type 'DELETE' to confirm.");
						}
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
