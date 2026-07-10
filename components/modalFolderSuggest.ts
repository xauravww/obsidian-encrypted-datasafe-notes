import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	onChoose: (folder: TFolder | null) => void;

	constructor(app: App, onChoose: (folder: TFolder | null) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Select a folder to protect (or choose Root to protect entire vault)");
	}

	getItems(): TFolder[] {
		const folders = this.app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder) as TFolder[];
		return folders;
	}

	getItemText(item: TFolder): string {
		return item.path === "/" ? "Root (Entire Vault)" : item.path;
	}

	onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item.path === "/" ? null : item);
	}
}
