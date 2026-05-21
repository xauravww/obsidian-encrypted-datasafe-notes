import { App, Modal, Notice, Setting } from "obsidian";
import main from "../main";
import { hash } from "./hash";

export class ModalChangePassword extends Modal {
	plugin: main;
	currentPass: string;
	newPass: string;
	confirmPass: string;

	constructor(app: App, plugin: main) {
		super(app);
		this.plugin = plugin;
		this.currentPass = "";
		this.newPass = "";
		this.confirmPass = "";
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Change Password" });

		const box = contentEl.createDiv({ cls: "password_modal__box" });

		const currentInput = box.createEl("input", {
			type: "password",
			placeholder: "Current password",
		});
		currentInput.addEventListener("input", (e) => {
			this.currentPass = (e.target as HTMLInputElement).value;
		});

		const newInput = box.createEl("input", {
			type: "password",
			placeholder: "New password",
		});
		newInput.addEventListener("input", (e) => {
			this.newPass = (e.target as HTMLInputElement).value;
		});

		const confirmInput = box.createEl("input", {
			type: "password",
			placeholder: "Confirm new password",
		});
		confirmInput.addEventListener("input", (e) => {
			this.confirmPass = (e.target as HTMLInputElement).value;
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton((btn) =>
				btn
					.setButtonText("Change")
					.setCta()
					.onClick(() => this.submit())
			);

		confirmInput.addEventListener("keypress", (event) => {
			if (event.key === "Enter") this.submit();
		});
	}

	async submit() {
		if (this.newPass !== this.confirmPass) {
			new Notice("New passwords do not match");
			return;
		}
		if (this.newPass.length < 1) {
			new Notice("Password cannot be empty");
			return;
		}

		const success = await this.plugin.changePassword(
			this.currentPass,
			this.newPass
		);
		if (success) {
			new Notice("Password changed successfully");
			this.close();
		} else {
			new Notice("Current password is incorrect");
		}
	}

	onClose() {}
}
