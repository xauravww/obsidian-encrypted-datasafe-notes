import main from "main";
import { App } from "obsidian";

export class AutoLock {
	app: App;
	plugin: main;
	userActive: boolean;
	idleTimeout: NodeJS.Timeout;
	isAlreadyOpen: boolean;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
		this.userActive = true;
		this.isAlreadyOpen = false;
	}

	async startTimer() {
		// Remove first so repeated startTimer() calls never stack duplicate
		// listeners (handleUserActivity is a stable arrow, so removal works).
		document.removeEventListener("mousedown", this.handleUserActivity);
		document.removeEventListener("keydown", this.handleUserActivity);

		document.addEventListener("mousedown", this.handleUserActivity);
		document.addEventListener("keydown", this.handleUserActivity);

		this.handleUserActivity();
	}

	stopTimer() {
		document.removeEventListener("mousedown", this.handleUserActivity);
		document.removeEventListener("keydown", this.handleUserActivity);
		clearTimeout(this.idleTimeout);
	}

	handleUserActivity = () => {
		clearTimeout(this.idleTimeout);
		const settings = this.plugin.settings;

		if (!settings.isLocked && settings.autoLock !== "0") {
			this.idleTimeout = setTimeout(() => {
				this.plugin.lockVault(true);
			}, Number(settings.autoLock) * 1000);
		}
	};
}
