import main from "main";
import { App, TFile, TFolder } from "obsidian";
import { ModalEnterPassword } from "./modalEnterPassword";

export class FolderLock {
	app: App;
	plugin: main;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
	}

	openModal() {
		new ModalEnterPassword(
			this.app,
			this.plugin,
			true,
			() => {
				this.plugin.encryptedPaths.clear();
				this.plugin.updateRibbonIcon();
				this.plugin.updateStatusBar();
				this.plugin.decorateFileExplorer();
			},
			() => {
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf && activeLeaf.view.getViewType() === "markdown") {
					activeLeaf.detach();
				}
			}
		).open();
	}

	async lock() {
		const settings = this.plugin.settings;

		this.app.workspace.on("file-open", (file: TFile) => {
			const inFolder = settings.folder
				? file?.path.startsWith(`${settings.folder}/`)
				: true;
			if (inFolder && settings.isLocked) this.openModal();
		});
	}

	closeOnLocked() {
		if (!this.plugin.settings.isLocked) return;
		const file = this.app.workspace.getActiveFile();
		const inFolder = this.plugin.settings.folder
			? file?.path.startsWith(`${this.plugin.settings.folder}/`)
			: true;
		if (inFolder) this.openModal();
	}
}
