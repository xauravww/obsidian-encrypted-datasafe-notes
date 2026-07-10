import { Notice, Plugin, addIcon, TFile, Modal, setIcon, WorkspaceLeaf } from "obsidian";
import { ModalEnterPassword } from "./components/modalEnterPassword";
import {
	DEFAULT_SETTINGS,
	PluginSettings,
	SettingsTab,
} from "./components/settings";
import { lockSVG, unlockSVG } from "./components/svgIcons";
import { AutoLock } from "components/autolock";
import { FolderLock } from "components/folderLock";
import { Encrypt } from "./components/encrypt";
import { Decrypt } from "./components/decrypt";
import { GetVaultFiles } from "./components/getMDFiles";
import { hash } from "./components/hash";
import { CustomSettingsView, VIEW_TYPE_CUSTOM_SETTINGS } from "./components/viewCustomSettings";
import { VaultCrypto } from "./components/vaultCrypto";
import * as CryptoJS from "crypto-js";

export default class PasswordPlugin extends Plugin {
	settings: PluginSettings;
	toggleFlag: boolean;
	settingsRibbonItem: HTMLElement | null = null;
	private ribbonItem: HTMLElement;
	private folderLock: FolderLock;
	private modalEnterPassword: ModalEnterPassword;
	private statusBarItemEl: HTMLElement;
	private blurHandler: () => void;
	private explorerObserver: MutationObserver;
	recovering: boolean = false;
	encryptedPaths: Set<string>;
	autoLockInstance: AutoLock | null = null;
	isBusy: boolean = false;

	async onload() {
		await this.loadSettings();
		this.encryptedPaths = new Set();

		this.folderLock = new FolderLock(this.app, this);
		this.modalEnterPassword = new ModalEnterPassword(
			this.app, 
			this, 
			false, // Not closable
			() => {
				this.encryptedPaths.clear();
				this.updateRibbonIcon();
				this.updateStatusBar();
				this.decorateFileExplorer();
			},
			() => {}
		);

		this.registerView(
			VIEW_TYPE_CUSTOM_SETTINGS,
			(leaf) => new CustomSettingsView(leaf, this)
		);

		this.app.workspace.onLayoutReady(async () => {
			await this.reconcileEncryptedPaths();

			// Single source of truth: the vault is locked whenever there is no
			// file key in RAM. loadSettings() already clears the key on startup,
			// so force isLocked to match rather than trusting the persisted flag.
			if (!this.getFileKey()) {
				this.settings.isLocked = true;
			}

			// If the vault is locked on startup, we no longer force a non-closable modal.
			// The in-editor banner will elegantly handle any encrypted files that are opened,
			// allowing the user to freely read/edit unencrypted files in the meantime!

			this.refreshAutoLock();

			this.setupExplorerObserver();
		});

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.setupExplorerObserver();
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === "markdown") {
						const f = (leaf.view as any).file;
						if (f && f.extension === "md") {
							this.enforceEncryptionState(f, leaf);
						}
					}
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", async (file: TFile | null) => {
				this.app.workspace.iterateAllLeaves(async (leaf) => {
					if (leaf.view.getViewType() === "markdown") {
						const f = (leaf.view as any).file;
						if (f && f.extension === "md") {
							await this.enforceEncryptionState(f, leaf);
						}
					}
				});
			})
		);

		addIcon("lock-closed", lockSVG);
		addIcon("lock-open", unlockSVG);
		
		this.updateSettingsRibbon();

		this.ribbonItem = this.addRibbonIcon(
			"lock-closed",
			this.settings.isLocked ? "Vault is locked" : "Vault is unlocked",
			async () => {
				if (!this.settings.enablePass) {
					new Notice("Welcome to Encrypted Datasafe Notes!");
					this.openCustomSettingsView();
					return;
				}
				if (this.settings.isLocked) {
					const m = new ModalEnterPassword(this.app, this, false,
						() => {
							this.updateRibbonIcon();
							this.updateStatusBar();
							this.decorateFileExplorer();
						},
						() => {}
					);
					m.open();
				} else {
					await this.lockVault();
				}
			}
		);
		this.updateRibbonIcon();

		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar();

		this.blurHandler = () => {
			if (this.recovering) return;
			if (this.settings.lockOnBlur && !this.settings.isLocked && this.settings.enablePass) {
				this.lockVault();
			}
		};
		window.addEventListener("blur", this.blurHandler);

		this.addCommand({
			id: "lock-vault",
			name: "Lock vault",
			callback: () => this.lockVault(),
		});

		this.addCommand({
			id: "unlock-vault",
			name: "Unlock vault",
			callback: () => this.unlockVault(),
		});

		this.addCommand({
			id: "show-status",
			name: "Show encryption status",
			callback: () => this.showStatus(),
		});

		this.addCommand({
			id: "recover-files",
			name: "Recover corrupted (double-encrypted) files",
			callback: () => this.recoverFiles(),
		});

		this.addCommand({
			id: "repair-vault",
			name: "Repair Vault (recover corrupted / multi-encrypted files)",
			callback: () => this.promptRepairVault(),
		});

		this.addCommand({
			id: "panic-button",
			name: "Panic Button (Lock & Hide)",
			callback: async () => {
				this.lockVault(true);
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === "markdown") {
						const file = (leaf.view as any).file;
						if (file) {
							const inFolder = this.settings.folder
								? file.path.startsWith(this.settings.folder + "/")
								: true;
							if (inFolder) {
								leaf.detach();
							}
						}
					}
				});
				this.app.workspace.getLeaf(false);
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!this.settings.enablePass) return;
				if (!(file instanceof TFile)) return;
				if (!["md", "canvas", "excalidraw"].includes(file.extension)) return;

				menu.addItem((item) => {
					item.setTitle("Encrypt this file")
						.setIcon("lock")
						.onClick(async () => {
							const tf = file as TFile;
							const content =
								await this.app.vault.read(tf);
							if (
								VaultCrypto.isEncrypted(content)
							) {
								new Notice(
									`${tf.name} is already encrypted`
								);
								return;
							}
							
							if (this.settings.isLocked || !this.settings.password) {
								new Notice("Please unlock the vault first to load your encryption key!");
								return;
							}

							new Notice(
								`Encrypting ${tf.name}...`
							);
							let encrypted: string;
								try {
									encrypted = VaultCrypto.encrypt(content, this.getFileKey());
								} catch (e) {
									new Notice(`Failed to encrypt ${tf.name} safely. File left unchanged.`, 6000);
									console.error("Datasafe encrypt error:", e);
									return;
								}
							await this.app.vault.modify(
								tf,
								encrypted
							);
							this.encryptedPaths.add(tf.path);
							this.decorateFileExplorer();
							this.updateStatusBar();
							new Notice(
								`Encrypted: ${tf.name}`
							);
							
							// Enforce UI state immediately for all open views of this file
							this.app.workspace.iterateAllLeaves(async (leaf) => {
								if (leaf.view.getViewType() === "markdown") {
									const f = (leaf.view as any).file;
									if (f && f.path === tf.path) {
										await this.enforceEncryptionState(f, leaf);
									}
								}
							});
						});
				});

				menu.addItem((item) => {
					item.setTitle("Decrypt this file")
						.setIcon("unlock")
						.onClick(async () => {
							const tf = file as TFile;
							this.promptSingleFileDecrypt(tf);
						});
				});
			})
		);
	}

	async promptSingleFileDecrypt(tf: TFile) {
		const doDecrypt = async () => {
			const content = await this.app.vault.read(tf);
			if (!VaultCrypto.isEncrypted(content)) {
				new Notice(`${tf.name} is not encrypted`);
				return;
			}
			new Notice(`Decrypting ${tf.name}...`);
			console.log("=== DATASAFE: SINGLE FILE DECRYPT START ===");
			console.log("File:", tf.name);

			// Try every candidate key AND un-nest multi-layer encryption. Covers
			// legacy files encrypted under the raw password hash, the MVK, or a
			// stale/double-encrypted state from older buggy versions.
			const candidateKeys = [
				this.getFileKey(),
				this.settings.fallbackPassword,
				this.settings.password,
			];
			const result = VaultCrypto.deepDecrypt(content, candidateKeys);
			const decrypted =
				result && VaultCrypto.looksLikePlaintext(result.plaintext)
					? result.plaintext
					: "";

			if (decrypted) {
				await this.app.vault.modify(tf, decrypted);
				this.encryptedPaths.delete(tf.path);
				this.decorateFileExplorer();
				this.updateStatusBar();
				new Notice(`Decrypted: ${tf.name}`);
				console.log("Decryption complete.");
				
				// Clean up the banner immediately
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.getViewType() === "markdown") {
						const f = (leaf.view as any).file;
						if (f && f.path === tf.path) {
							leaf.view.containerEl.classList.remove("agy-is-encrypted-view");
							leaf.view.containerEl.querySelectorAll(".datasafe-encryption-banner").forEach((b: Element) => b.remove());
							const state = leaf.getViewState();
							if (state.state && state.state.mode === "preview") {
								state.state.mode = "source";
								leaf.setViewState(state);
							}
						}
					}
				});
			} else {
				console.error("Decryption failed for:", tf.name);
				new Notice(`Failed to decrypt ${tf.name}. The encryption key doesn't match. Try clicking the sidebar padlock to Lock and Unlock the vault again to refresh the keys!`, 8000);
			}
			console.log("===========================================");
		};

		if (this.settings.isLocked || !this.settings.password) {
			const pwModal = new Modal(this.app);
			pwModal.modalEl.classList.add("password_modal");
			pwModal.modalEl.style.background = "#0f0f13";
			pwModal.modalEl.style.border = "1px solid rgba(255, 255, 255, 0.08)";
			pwModal.modalEl.style.boxShadow = "0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset";
			pwModal.modalEl.style.borderRadius = "16px";

			pwModal.titleEl.style.display = "none";
			
			const contentEl = pwModal.contentEl;
			contentEl.empty();
			contentEl.addClass("mac-settings-view");
			contentEl.style.padding = "32px";

			const div_main = contentEl.createDiv({
				attr: { style: "max-width: 400px; margin: auto;" }
			});

			div_main.createEl("h2", {
				text: "Decrypt File",
				attr: { style: "text-align: center; font-family: 'Cinzel', serif; font-weight: 700; font-size: 24px; margin-bottom: 8px;" }
			});
			
			div_main.createEl("p", {
				text: "Enter your Master Password to decrypt this specific file.",
				attr: { style: "text-align: center; color: #a1a1aa; font-size: 14px; margin-bottom: 24px;" }
			});

			const div_input = div_main.createDiv();
			const wrapper = div_input.createDiv({ attr: { style: "position: relative; width: 100%; margin-bottom: 16px;" } });
			
			const input = wrapper.createEl("input", {
				type: "password",
				placeholder: "Master Password",
				attr: { style: "display: block; width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" }
			});
			input.classList.add("password_input");
			
			const toggleIcon = wrapper.createDiv({
				attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; line-height: 0; cursor: pointer; color: #8b8b93;" }
			});
			setIcon(toggleIcon, "eye");
			
			let isPasswordVisible = false;
			toggleIcon.addEventListener("click", () => {
				isPasswordVisible = !isPasswordVisible;
				input.type = isPasswordVisible ? "text" : "password";
				setIcon(toggleIcon, isPasswordVisible ? "eye-off" : "eye");
			});

			const errorDiv = div_input.createDiv({
				cls: "error-message",
				attr: { style: "color: #ef4444; font-size: 14px; margin-bottom: 16px; display: none; text-align: center;" }
			});

			const btnRow = div_main.createDiv({ attr: { style: "display: flex; gap: 8px; margin-bottom: 8px;" } });
			
			const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "mac-btn-secondary", attr: { style: "flex: 1; padding: 12px;" } });
			cancelBtn.addEventListener("click", () => pwModal.close());
			
			const submitBtn = btnRow.createEl("button", { text: "Decrypt", cls: "mac-btn-primary", attr: { style: "flex: 1; padding: 12px;" } });

			const checkPass = () => {
				const inputHash = hash(input.value);
				let isValid = false;
				
				if (this.settings.passwordVerifier) {
					try {
						const check = CryptoJS.AES.decrypt(this.settings.passwordVerifier, inputHash).toString(CryptoJS.enc.Utf8);
						if (check === "VALID") isValid = true;
					} catch (e) {}
				} else if (this.settings.password && inputHash === this.settings.password) {
					isValid = true;
				}
				
				if (isValid) {
					if (this.settings.encryptedMVK) {
						this.settings.password = CryptoJS.AES.decrypt(this.settings.encryptedMVK, inputHash).toString(CryptoJS.enc.Utf8) || inputHash;
						this.settings.fallbackPassword = inputHash;
					} else {
						this.settings.password = inputHash;
					}
					
					pwModal.close();
					doDecrypt();
				} else {
					errorDiv.innerText = "Wrong password";
					errorDiv.style.display = "block";
					input.value = "";
					input.focus();
				}
			};

			submitBtn.addEventListener("click", checkPass);
			input.addEventListener("keypress", (e) => {
				if (e.key === "Enter") checkPass();
			});
			pwModal.open();
			input.focus();
		} else {
			await doDecrypt();
		}
	}

	async promptRecoveryMode(tf: TFile) {
		const pwModal = new Modal(this.app);
		pwModal.modalEl.classList.add("password_modal");
		pwModal.modalEl.style.background = "#0f0f13";
		pwModal.modalEl.style.border = "1px solid rgba(255, 255, 255, 0.08)";
		pwModal.modalEl.style.boxShadow = "0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset";
		pwModal.modalEl.style.borderRadius = "16px";
		pwModal.titleEl.style.display = "none";
		
		const contentEl = pwModal.contentEl;
		contentEl.empty();
		contentEl.addClass("mac-settings-view");
		contentEl.style.padding = "32px";

		const div_main = contentEl.createDiv({
			attr: { style: "max-width: 400px; margin: auto;" }
		});

		div_main.createEl("h2", {
			text: "Emergency Recovery",
			attr: { style: "text-align: center; font-family: 'Cinzel', serif; font-weight: 700; font-size: 24px; margin-bottom: 8px;" }
		});
		
		div_main.createEl("p", {
			text: "Bypass vault checks and force-decrypt this file. Enter an old/lost password OR your recovery code — both are tried.",
			attr: { style: "text-align: center; color: #a1a1aa; font-size: 14px; margin-bottom: 24px;" }
		});

		const div_input = div_main.createDiv();
		const wrapper = div_input.createDiv({ attr: { style: "position: relative; width: 100%; margin-bottom: 16px;" } });
		
		const input = wrapper.createEl("input", {
			type: "password",
			placeholder: "Old Password or Recovery Code",
			attr: { style: "display: block; width: 100%; padding: 12px 16px; padding-right: 44px; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'Manrope', sans-serif;" }
		});
		
		const toggleIcon = wrapper.createDiv({
			attr: { style: "position: absolute; right: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; line-height: 0; cursor: pointer; color: #8b8b93;" }
		});
		setIcon(toggleIcon, "eye");
		
		let isPasswordVisible = false;
		toggleIcon.addEventListener("click", () => {
			isPasswordVisible = !isPasswordVisible;
			input.type = isPasswordVisible ? "text" : "password";
			setIcon(toggleIcon, isPasswordVisible ? "eye-off" : "eye");
		});

		const errorDiv = div_input.createDiv({
			cls: "error-message",
			attr: { style: "color: #ef4444; font-size: 14px; margin-bottom: 16px; display: none; text-align: center;" }
		});

		const btnRow = div_main.createDiv({ attr: { style: "display: flex; gap: 8px; margin-bottom: 8px;" } });
		
		const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "mac-btn-secondary", attr: { style: "flex: 1; padding: 12px;" } });
		cancelBtn.addEventListener("click", () => pwModal.close());
		
		const submitBtn = btnRow.createEl("button", { text: "Force Decrypt", cls: "mac-btn-danger", attr: { style: "flex: 1; padding: 12px;" } });

		const checkPass = async () => {
			const raw = input.value.trim();
			const inputHash = hash(raw);
			try {
				const content = await this.app.vault.read(tf);

				// Build every candidate key the typed value could represent:
				//  - a raw password (used directly by very old versions)
				//  - hash(password) (the standard file key for legacy vaults)
				//  - the MVK unwrapped via hash(password) (encryptedMVK path)
				//  - the MVK unwrapped via hash(recoveryCode) (2FA recovery key)
				const candidateKeys: Array<string | undefined | null> = [
					this.getFileKey(),
					this.settings.fallbackPassword,
					inputHash,
					raw,
				];
				if (this.settings.encryptedMVK) {
					const mvkFromPass = VaultCrypto.tryDecrypt(
						VaultCrypto.wrap(this.settings.encryptedMVK),
						inputHash
					);
					if (mvkFromPass) candidateKeys.push(mvkFromPass);
				}
				if (this.settings.recoveryEncryptedMVK) {
					const mvkFromCode = VaultCrypto.tryDecrypt(
						VaultCrypto.wrap(this.settings.recoveryEncryptedMVK),
						inputHash
					);
					if (mvkFromCode) candidateKeys.push(mvkFromCode);
				}

				const result = VaultCrypto.deepDecrypt(content, candidateKeys);
				const decrypted =
					result && VaultCrypto.looksLikePlaintext(result.plaintext)
						? result.plaintext
						: "";
				if (decrypted) {
					await this.app.vault.modify(tf, decrypted);
					this.encryptedPaths.delete(tf.path);
					this.decorateFileExplorer();
					this.updateStatusBar();
					new Notice(`Recovered: ${tf.name}`);
					pwModal.close();
					
					// Clean up the banner
					this.app.workspace.iterateAllLeaves((leaf) => {
						if (leaf.view.getViewType() === "markdown") {
							const f = (leaf.view as any).file;
							if (f && f.path === tf.path) {
								// Invalidate any pending banner-inject loop for this leaf.
								(leaf as any)._datasafeInjectGen = (((leaf as any)._datasafeInjectGen) || 0) + 1;
								leaf.view.containerEl.classList.remove("agy-is-encrypted-view");
								leaf.view.containerEl.querySelectorAll(".datasafe-encryption-banner").forEach((b: Element) => b.remove());
								const state = leaf.getViewState();
								if (state.state && state.state.mode === "preview") {
									state.state.mode = "source";
									leaf.setViewState(state);
								}
							}
						}
					});
				} else {
					errorDiv.innerText = "Incorrect password or corrupted file.";
					errorDiv.style.display = "block";
				}
			} catch (e) {
				errorDiv.innerText = "Incorrect password or corrupted file.";
				errorDiv.style.display = "block";
			}
		};

		submitBtn.addEventListener("click", checkPass);
		input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") checkPass();
		});
		pwModal.open();
		input.focus();
	}

	async enforceEncryptionState(f: TFile, leaf: WorkspaceLeaf) {
		let isEncrypted = false;
		const view = leaf.view as any;

		// Bump a per-leaf generation token. Any tryInject loop from a PRIOR call is now stale
		// and must abort — otherwise an old encrypted-state timer re-injects the banner AFTER
		// unlock/decrypt has already cleaned it up (banner shows on an unlocked file).
		const myGen = ((leaf as any)._datasafeInjectGen || 0) + 1;
		(leaf as any)._datasafeInjectGen = myGen;
		
		// If the file is actively open in an editor, pull from the live memory rather than the disk!
		// This ensures we catch files that were just encrypted via editor injection but haven't finished saving yet.
		if (view.editor) {
			const liveContent = view.editor.getValue();
			if (liveContent) {
				isEncrypted = VaultCrypto.isEncrypted(liveContent);
			}
		}
		
		// Fallback to reading from disk if there's no live editor or live content is empty
		if (!isEncrypted) {
			const content = await this.app.vault.read(f);
			isEncrypted = VaultCrypto.isEncrypted(content);
		}

		if (isEncrypted) {
			// Force it into preview mode
			const state = leaf.getViewState();
			if (state.state && (state.state.mode !== "preview" || state.state.source !== false)) {
				state.state.mode = "preview";
				state.state.source = false;
				await leaf.setViewState(state);
			}

			// Ensure banner and classes are added after React/Mithril updates the DOM
			let attempts = 0;
			const tryInject = () => {
				// Abort if a newer enforceEncryptionState call superseded us (e.g. file got unlocked).
				if ((leaf as any)._datasafeInjectGen !== myGen) return;
				if (attempts > 5) return;
				attempts++;

				// Re-verify CURRENT state every tick. If the file was decrypted by
				// any path (single-file decrypt, unlock, recovery) while this loop
				// was pending, stop re-injecting and clean up — this is what stops
				// a zombie banner from reappearing on a now-plaintext note.
				const liveView = leaf.view as any;
				let stillEncrypted = false;
				if (liveView.editor) {
					const live = liveView.editor.getValue();
					stillEncrypted = live ? VaultCrypto.isEncrypted(live) : false;
				}
				if (!stillEncrypted && !liveView.editor) {
					// No live editor — fall back to what we detected at call time.
					stillEncrypted = true;
				}
				if (!stillEncrypted) {
					leaf.view.containerEl.classList.remove("agy-is-encrypted-view");
					leaf.view.containerEl
						.querySelectorAll(".datasafe-encryption-banner")
						.forEach((b: Element) => b.remove());
					return;
				}

				leaf.view.containerEl.classList.add("agy-is-encrypted-view");

				// Remove any existing banners first to prevent duplicates
				leaf.view.containerEl.querySelectorAll(".datasafe-encryption-banner").forEach((b: Element) => b.remove());

				const header = leaf.view.containerEl.querySelector(".view-header");
				// If header is missing, Obsidian hasn't rendered yet
				if (!header) {
					setTimeout(tryInject, 150);
					return;
				}
				
				const banner = document.createElement("div");
				banner.className = "datasafe-encryption-banner";
				banner.style.padding = "12px 16px";
				banner.style.margin = "0"; 
				banner.style.backgroundColor = "rgba(var(--callout-warning), 0.15)";
				banner.style.borderBottom = "1px solid rgb(var(--callout-warning))";
				banner.style.color = "var(--text-normal)";
				banner.style.fontWeight = "500";
				banner.style.fontSize = "14px";
				banner.style.lineHeight = "1.5";
				banner.style.zIndex = "10";
				banner.style.display = "flex";
				banner.style.justifyContent = "space-between";
				banner.style.alignItems = "center";
				banner.style.flexWrap = "wrap";
				banner.style.gap = "10px";
				banner.style.userSelect = "text";

				const textDiv = document.createElement("div");
				textDiv.innerText = "🔒 This note is encrypted and read-only. If you forgot the password for this specific file, use Emergency Recovery.";
				banner.appendChild(textDiv);

				const btnContainer = document.createElement("div");
				btnContainer.style.display = "flex";
				btnContainer.style.gap = "8px";

				const recoverBtn = document.createElement("button");
				recoverBtn.className = "mac-btn-secondary";
				recoverBtn.style.padding = "6px 12px";
				recoverBtn.style.fontSize = "13px";
				recoverBtn.style.whiteSpace = "nowrap";
				recoverBtn.innerText = "Emergency Recovery";
				recoverBtn.addEventListener("click", () => this.promptRecoveryMode(f));
				btnContainer.appendChild(recoverBtn);

				const decryptBtn = document.createElement("button");
				decryptBtn.className = "mac-btn-primary";
				decryptBtn.style.padding = "6px 12px";
				decryptBtn.style.fontSize = "13px";
				decryptBtn.style.whiteSpace = "nowrap";
				decryptBtn.innerText = "Decrypt Note";
				decryptBtn.addEventListener("click", () => this.promptSingleFileDecrypt(f));
				btnContainer.appendChild(decryptBtn);

				banner.appendChild(btnContainer);
				
				if (header.nextSibling) {
					leaf.view.containerEl.insertBefore(banner, header.nextSibling);
				} else {
					leaf.view.containerEl.appendChild(banner);
				}
				
				setTimeout(tryInject, 150); // Keep checking in case a late React render wipes it
			};
			setTimeout(tryInject, 50);
		} else {
			leaf.view.containerEl.classList.remove("agy-is-encrypted-view");
			leaf.view.containerEl.querySelectorAll(".datasafe-encryption-banner").forEach((b: Element) => b.remove());
			
			// Force the view back to edit mode to ensure Obsidian's UI refreshes
			// and clears any cached preview of the encrypted ciphertext.
			const state = leaf.getViewState();
			if (state.state && state.state.mode === "preview") {
				state.state.mode = "source";
				await leaf.setViewState(state);
			}
		}
	}

	async openCustomSettingsView() {
		const leaf = this.app.workspace.getLeaf(true); // Open in new tab
		await leaf.setViewState({
			type: VIEW_TYPE_CUSTOM_SETTINGS,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	updateSettingsRibbon() {
		if (this.settings.showCustomSettingsIcon) {
			if (!this.settingsRibbonItem) {
				this.settingsRibbonItem = this.addRibbonIcon("settings", "Datasafe Premium Settings", () => {
					this.openCustomSettingsView();
				});
			}
		} else {
			if (this.settingsRibbonItem) {
				this.settingsRibbonItem.remove();
				this.settingsRibbonItem = null;
			}
		}
	}

	// ⚠ WARNING: Do NOT change this method. The SVGs in svgIcons.ts
	// depend on this exact logic (querySelectorAll("path") → paths[1] → toggle dasharray).
	// Changing this will BREAK the icon rendering.
	updateRibbonIcon() {
		if (!this.ribbonItem) return;
		const paths = this.ribbonItem.querySelectorAll("path");
		if (paths.length >= 2) {
			const shackle = paths[1];
			if (this.settings.isLocked) {
				shackle.removeAttribute("stroke-dasharray");
				shackle.removeAttribute("stroke-dashoffset");
			} else {
				shackle.setAttribute("stroke-dasharray", "4 4");
				shackle.setAttribute("stroke-dashoffset", "-4");
			}
		}
		this.ribbonItem.setAttribute("aria-label",
			this.settings.isLocked ? "Click to unlock vault" : "Click to lock vault");
	}

	async lockVault(silent = false) {
		if (this.isBusy || this.settings.isLocked) return;
		
		this.isBusy = true;
		try {
			if (!this.settings.password) {
				if (!silent) new Notice("Vault is already locked, or no encryption key is loaded!");
				return;
			}

			if (!silent) new Notice("Encrypting files...");
			const failed = await new Encrypt(this.app, this).encryptFilesInDirectory();
			await this.reconcileEncryptedPaths();
			this.settings.isLocked = true;

			if (failed > 0) {
				new Notice(`⚠ ${failed} file(s) could not be encrypted safely and were left as plaintext. Check the console.`, 8000);
			}

			// Stop the idle timer — no point running while locked.
			if (this.autoLockInstance) {
				this.autoLockInstance.stopTimer();
				this.autoLockInstance = null;
			}

			// CLEAR THE PASSWORD FROM RAM SO IT IS TRULY LOCKED!
			this.settings.password = "";
			this.settings.fallbackPassword = "";
			
			await this.saveSettings();
			this.updateRibbonIcon();
			this.updateStatusBar();
			this.decorateFileExplorer();
			await this.refreshAllLeaves();
			
			// Instantly pop up the full-screen overlay if they are inside a protected file
			new FolderLock(this.app, this).closeOnLocked();
			
			if (!silent) {
				const label = this.settings.folder || "Vault";
				new Notice(`${label} is locked 🔒`);
			}
			
			// Force Obsidian's UI (CodeMirror, React, etc.) to wake up and repaint immediately.
			// Background timers often cause UI frameworks to defer DOM reconciliation until the next user interaction.
			window.dispatchEvent(new Event("resize"));
			this.app.workspace.trigger("layout-change");
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		} catch (e) {
			new Notice("Encryption failed! Vault is not locked.");
			console.error("Lock error:", e);
		} finally {
			this.isBusy = false;
		}
	}

	async refreshAllLeaves() {
		// Wait slightly to let Obsidian's internal file modify event finish rendering
		await new Promise(resolve => setTimeout(resolve, 150));
		this.app.workspace.iterateAllLeaves(async (leaf) => {
			if (leaf.view.getViewType() === "markdown") {
				const f = (leaf.view as any).file;
				if (f && f.extension === "md") {
					await this.enforceEncryptionState(f, leaf);
				}
			}
		});
	}

	async unlockVault() {
		if (!this.settings.enablePass) return;
		const modal = new ModalEnterPassword(
			this.app,
			this,
			false, // MUST NOT BE CLOSABLE! Otherwise users bypass the lock.
			() => {
				this.updateRibbonIcon();
				this.updateStatusBar();
				this.decorateFileExplorer();
			},
			() => {}
		);
		modal.open();
	}

	async showStatus() {
		const files = new GetVaultFiles(this.app, this).getFiles();
		if (!files || files.length === 0) {
			new Notice("No markdown files found." + (this.settings.folder ? " in " + this.settings.folder : ""));
			return;
		}
		let encrypted = 0;
		let plain = 0;
		const problems: string[] = [];
		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (VaultCrypto.isEncrypted(content)) {
				encrypted++;
				const key = this.settings.password;
				const decrypted = CryptoJS.AES.decrypt(content, key).toString(CryptoJS.enc.Utf8);
				if (decrypted && VaultCrypto.isEncrypted(decrypted)) {
					problems.push(f.path);
				}
			} else {
				plain++;
			}
		}
		let msg = `${encrypted} encrypted, ${plain} plaintext`;
		if (problems.length > 0) {
			msg += ` | ⚠ ${problems.length} double-encrypted`;
		}
		new Notice(msg, 8000);
	}

	// Legacy command kept for back-compat — now routes to the unified,
	// multi-layer, multi-key, non-destructive repair logic.
	async recoverFiles() {
		this.recovering = true;
		const r = await this.repairVault();
		this.recovering = false;
		let msg = `Repair: ${r.ok} OK, ${r.fixed} recovered`;
		if (r.failed > 0) msg += `, ${r.failed} FAILED`;
		new Notice(msg, 8000);
	}

	/**
	 * Run Repair Vault. If any files can't be recovered with the in-RAM keys,
	 * prompt for the recovery code and retry those with the code-derived key.
	 */
	async promptRepairVault() {
		new Notice("Repairing vault...");
		let r = await this.repairVault();

		if (r.failed > 0 && this.settings.recoveryEncryptedMVK) {
			const modal = new Modal(this.app);
			modal.titleEl.setText("Repair Vault — Recovery Code");
			modal.contentEl.createEl("p", {
				text: `${r.failed} file(s) could not be recovered with your current key. Enter your recovery code to try again.`,
			});
			const input = modal.contentEl.createEl("input", {
				type: "text",
				placeholder: "XXXX-XXXX-XXXX-XXXX",
				attr: { style: "width: 100%; padding: 10px; margin: 8px 0;" },
			});
			const row = modal.contentEl.createDiv({ attr: { style: "display:flex; gap:8px; justify-content:flex-end;" } });
			const cancel = row.createEl("button", { text: "Cancel" });
			cancel.addEventListener("click", () => modal.close());
			const go = row.createEl("button", { text: "Repair", cls: "mod-cta" });
			go.addEventListener("click", async () => {
				modal.close();
				new Notice("Repairing with recovery code...");
				r = await this.repairVault(input.value.trim());
				this.reportRepair(r);
			});
			modal.open();
			input.focus();
			return;
		}
		this.reportRepair(r);
	}

	private reportRepair(r: { ok: number; fixed: number; failed: number; failedPaths: string[] }) {
		let msg = `Repair complete: ${r.ok} OK, ${r.fixed} recovered`;
		if (r.failed > 0) {
			msg += `, ${r.failed} FAILED`;
			console.error("Datasafe repair — unrecoverable files:", r.failedPaths);
		}
		new Notice(msg, 9000);
	}

	updateStatusBar() {
		if (!this.statusBarItemEl) return;
		this.statusBarItemEl.setText(
			this.settings.isLocked ? "🔒 Locked" : "🔓 Unlocked"
		);
	}

	private setupExplorerObserver() {
		const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (!explorer) return;
		const container = explorer.view.containerEl;
		if (this.explorerObserver) this.explorerObserver.disconnect();
		this.explorerObserver = new MutationObserver(() => {
			this.decorateFileExplorer();
		});
		this.explorerObserver.observe(container, {
			childList: true,
			subtree: true,
		});
		this.decorateFileExplorer();
	}

	decorateFileExplorer() {
		const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (!explorer) return;
		const container = explorer.view.containerEl;

		const items = container.querySelectorAll(".nav-file, .nav-file-title");
		items.forEach((file: Element) => {
			const el = file as HTMLElement;
			const path = el.getAttribute("data-path");
			if (!path) return;
			const title = el.matches(".nav-file-title")
				? el
				: el.querySelector(".nav-file-title");
			if (title) {
				if (this.encryptedPaths.has(path)) {
					title.addClass("is-encrypted");
					title.removeClass("is-decrypted");
				} else {
					title.removeClass("is-encrypted");
					title.addClass("is-decrypted");
				}
			}
		});
	}

	async reconcileEncryptedPaths() {
		this.encryptedPaths.clear();
		const allFiles = this.app.vault.getMarkdownFiles();
		for (const f of allFiles) {
			const content = await this.app.vault.read(f);
			if (VaultCrypto.isEncrypted(content)) {
				this.encryptedPaths.add(f.path);
			}
		}
	}

	/**
	 * The ONE key used for all file encrypt/decrypt. After unlock this holds the
	 * Master Vault Key (MVK); for legacy vaults with no MVK it is the password
	 * hash. Empty string when locked. Everything crypto-related must call this —
	 * never read settings.password directly for file ops.
	 */
	getFileKey(): string {
		return this.settings.password || "";
	}

	/**
	 * Rebuild the auto-lock timer to match current settings. Safe to call any
	 * number of times. Previously referenced but never defined — its absence
	 * threw and left the timer dead (the "10s lock does nothing" bug).
	 */
	refreshAutoLock() {
		if (this.autoLockInstance) {
			this.autoLockInstance.stopTimer();
			this.autoLockInstance = null;
		}
		if (
			this.settings.enablePass &&
			this.settings.autoLock !== "0" &&
			!this.settings.isLocked
		) {
			this.autoLockInstance = new AutoLock(this.app, this);
			this.autoLockInstance.startTimer();
		}
	}

	/**
	 * Non-destructive vault repair. Recovers files corrupted by past bugs:
	 * double/multi-layer encryption, or files encrypted under a stale key.
	 * Tries MVK, fallback hash, and an optional recovery-code-derived key.
	 * A file that cannot be recovered is left untouched and reported.
	 */
	async repairVault(recoveryCode?: string): Promise<{ ok: number; fixed: number; failed: number; failedPaths: string[] }> {
		const files = new GetVaultFiles(this.app, this).getFiles() || [];
		const keys: Array<string | undefined> = [
			this.getFileKey(),
			this.settings.fallbackPassword,
		];

		// Derive a key from the recovery code by unwrapping the MVK it protects.
		if (recoveryCode && this.settings.recoveryEncryptedMVK) {
			try {
				const mvk = CryptoJS.AES.decrypt(
					this.settings.recoveryEncryptedMVK,
					hash(recoveryCode)
				).toString(CryptoJS.enc.Utf8);
				if (mvk) keys.push(mvk);
			} catch (e) { /* ignore bad code */ }
		}

		let ok = 0, fixed = 0, failed = 0;
		const failedPaths: string[] = [];

		for (const f of files) {
			const content = await this.app.vault.read(f);
			if (!VaultCrypto.isEncrypted(content)) { ok++; continue; }

			const result = VaultCrypto.deepDecrypt(content, keys);
			if (result && VaultCrypto.looksLikePlaintext(result.plaintext)) {
				await this.app.vault.modify(f, result.plaintext);
				fixed++;
			} else {
				failed++;
				failedPaths.push(f.path);
			}
		}

		await this.reconcileEncryptedPaths();
		this.decorateFileExplorer();
		this.updateStatusBar();
		return { ok, fixed, failed, failedPaths };
	}

	async changePassword(oldPass: string, newPass: string): Promise<boolean> {
		const oldHash = hash(oldPass);
		const newHash = hash(newPass);

		let isValid = false;
		if (this.settings.passwordVerifier) {
			try {
				const decrypted = CryptoJS.AES.decrypt(this.settings.passwordVerifier, oldHash).toString(CryptoJS.enc.Utf8);
				if (decrypted === "VALID") isValid = true;
			} catch (e) {}
		} else if (this.settings.password && oldHash === this.settings.password) {
			isValid = true;
		}

		if (!isValid) return false;

		if (this.settings.encryptedMVK) {
			// Fast O(1) path using Master Vault Key architecture
			try {
				const mvk = CryptoJS.AES.decrypt(this.settings.encryptedMVK, oldHash).toString(CryptoJS.enc.Utf8);
				if (mvk) {
					this.settings.encryptedMVK = CryptoJS.AES.encrypt(mvk, newHash).toString();
				}
			} catch (e) {}
		} else {
			// Legacy fallback: re-encrypt all files
			const files = new GetVaultFiles(this.app, this).getFiles();
			if (files) {
				for (const file of files) {
					const content = await this.app.vault.read(file);
					let plaintext = content;

					if (VaultCrypto.isEncrypted(content)) {
						const decrypted = CryptoJS.AES.decrypt(content, oldHash).toString(CryptoJS.enc.Utf8);
						if (decrypted) plaintext = decrypted;
					}

					if (plaintext.length > 0) {
						const reEncrypted = CryptoJS.AES.encrypt(plaintext, newHash).toString();
						await this.app.vault.modify(file, reEncrypted);
					}
				}
			}
		}

		this.settings.password = newHash;
		this.settings.passwordVerifier = CryptoJS.AES.encrypt("VALID", newHash).toString();
		this.settings.isLocked = true;
		await this.saveSettings();
		this.updateRibbonIcon();
		this.updateStatusBar();
		this.decorateFileExplorer();

		return true;
	}

	onunload() {
		window.removeEventListener("blur", this.blurHandler);
		if (this.explorerObserver) this.explorerObserver.disconnect();
		if (this.autoLockInstance) {
			this.autoLockInstance.stopTimer();
			this.autoLockInstance = null;
		}
	}

	async loadSettings() {
		const saved = await this.loadData();
		if (saved && (saved.passwordVerifier || saved.password)) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
			
			// If we just loaded a vault that was locked, the RAM password must be cleared!
			// If it was already a verifier, we clear the password so it's not held in RAM.
			if (this.settings.passwordVerifier) {
				this.settings.password = "";
				this.settings.isLocked = true; // The vault is locked if there's no password in RAM!
			}
			return;
		}
		
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
	}

	async saveSettings() {
		const toSave = Object.assign({}, this.settings);
		// NEVER save the plain hash to disk
		toSave.password = ""; 
		await this.saveData(toSave);
	}
}
