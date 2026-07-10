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

		const createInputWithToggle = (parent: HTMLElement, placeholder: string) => {
			const wrapper = parent.createDiv({ cls: "password-input-wrapper", attr: { style: "position: relative; width: 100%; margin-bottom: 10px;" } });
			const input = wrapper.createEl("input", {
				type: "password",
				placeholder: placeholder,
				attr: { style: "width: 100%; padding-right: 40px;" }
			});
			
			const toggleBtn = wrapper.createEl("span", { 
				cls: "password-toggle-btn", 
				text: "👁️",
				attr: { style: "position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; user-select: none;" }
			});
			
			toggleBtn.addEventListener("click", () => {
				if (input.type === "password") {
					input.type = "text";
					toggleBtn.innerText = "🙈";
				} else {
					input.type = "password";
					toggleBtn.innerText = "👁️";
				}
			});
			
			return input;
		};

		const currentInput = createInputWithToggle(box, "Current password");
		currentInput.addEventListener("input", (e) => {
			this.currentPass = (e.target as HTMLInputElement).value;
		});

		const newInput = createInputWithToggle(box, "New password");
		newInput.addEventListener("input", (e) => {
			this.newPass = (e.target as HTMLInputElement).value;
		});

		const confirmInput = createInputWithToggle(box, "Confirm new password");
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
