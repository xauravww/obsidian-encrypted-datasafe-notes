import main from "main";
import { App, TFile, TFolder } from "obsidian";

const SUPPORTED_EXTENSIONS = new Set(["md", "canvas", "excalidraw"]);

export class GetVaultFiles {
	app: App;
	plugin: main;

	constructor(app: App, plugin: main) {
		this.app = app;
		this.plugin = plugin;
	}

	getFiles() {
		const path = this.plugin.settings.folder;
		let files: TFile[] = [];

		if (path && path !== "/") {
			const folder = this.app.vault.getAbstractFileByPath(path);

			if (folder instanceof TFolder) {
				files = this.getFilesInFolder(folder);
			} else {
				return;
			}
		} else {
			files = this.app.vault.getFiles().filter((f) =>
				SUPPORTED_EXTENSIONS.has(f.extension)
			);
		}

		return files;
	}

	getFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];

		folder.children.forEach((child) => {
			if (child instanceof TFile && SUPPORTED_EXTENSIONS.has(child.extension)) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getFilesInFolder(child));
			}
		});

		return files;
	}
}
