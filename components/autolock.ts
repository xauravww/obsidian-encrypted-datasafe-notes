import main from "main";
import { App } from "obsidian";

export class AutoLock {
	app: App;
	plugin: main;
	userActive: boolean;
	idleTimeout: NodeJS.Timeout;
	isAlreadyOpen: boolean;
	seconds: string;

	constructor(app: App, plugin: main, seconds: string) {
		this.app = app;
		this.plugin = plugin;
		this.userActive = true;
		this.isAlreadyOpen = false;
		this.seconds = seconds;
	}

	async startTimer() {
		document.addEventListener(
			"mousedown",
			this.handleUserActivity.bind(this)
		);

		document.addEventListener(
			"keydown",
			this.handleUserActivity.bind(this)
		);

		this.handleUserActivity();
	}

	handleUserActivity() {
		clearTimeout(this.idleTimeout);
		const settings = this.plugin.settings;

		if (!settings.isLocked && this.seconds !== "0") {
			this.idleTimeout = setTimeout(() => {
				this.plugin.lockVault(true);
			}, Number(this.seconds) * 1000);
		}
	}
}
