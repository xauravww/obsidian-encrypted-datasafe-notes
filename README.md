# Encrypted Datasafe Notes

A secure encryption plugin for Obsidian, designed to protect your sensitive notes. This is an enhanced fork of `obsidian-protected-note` focused on reliability, recovery, and a seamless user experience.

## What it does

Encrypted Datasafe Notes uses AES encryption to secure Markdown, Canvas, and Excalidraw files on disk. You can choose to protect your entire vault or restrict automatic locking to a specific folder. Individual files can also be encrypted manually, even outside that folder. To keep your data secure, the plugin can automatically lock your files when you step away or when the Obsidian window loses focus. Visual indicators in the file explorer and status bar show which files are locked.

## Usage Guide

### Getting Started
After installing and enabling the plugin, navigate to the settings to set your master password. You can also specify a particular folder for encryption; if left blank, the plugin will protect the entire vault.

### ✨ New & Enhanced Features

- **🛡️ Folder-Level & Manual Protection:** Keep the whole vault locked down, or specify a single folder. Files manually encrypted outside that folder are detected and can decrypt when you unlock the vault.
- **🚨 Panic Button (Boss Key):** Instantly lock the entire vault, wipe the memory, and securely close all active secret notes with a single customizable hotkey.
- **⚡ Instant Native Synchronization:** Locking and unlocking the vault instantly updates the entire Obsidian UI—including sidebar icons, note content, and banners—without requiring an app reload.
- **🏷️ Interactive Encryption Banner:** When a file is locked, a robust, native banner appears at the top of the note. It provides quick access to "Decrypt Note" or "Emergency Recovery" and perfectly survives Obsidian's UI rendering cycles.
- **🔒 Non-Blocking Security Modal:** The Master Password prompt now features a close button. If you just want to browse your public notes, you can dismiss the prompt while your secret files remain safely encrypted on disk. 
- **🛑 Safe Factory Reset:** Accidentally wiping your master key is a thing of the past. The Factory Reset option now requires you to explicitly type `DELETE` in a custom modal.
- **⚙️ Custom Settings Panel:** A beautifully redesigned, intuitive settings panel to manage all your encryption configurations.
- **🔑 Recovery Code:** A one-time recovery code is created during setup so you can reset your password and restore access to the Master Vault Key if you forget the password.
- **🔐 Dynamic Lock/Unlock Icons:** Visual feedback directly in your Obsidian Ribbon with dynamic padlock icons and interactive tooltips.
- **📄 Encrypt Single File or All Files:** Encrypt your designated folder, or use the command palette or right-click menu to encrypt/decrypt individual Markdown, Canvas, and Excalidraw files.
- **🛡️ 99.999% Corruption Free:** Re-engineered encryption state management ensures your files never get accidentally double-encrypted or corrupted during UI refresh cycles.
- **⏲️ Smart Auto-Lock & Lock On Away:** Configure the plugin to lock automatically after a set period of inactivity, or instantly when the Obsidian window loses focus (Lock on Away).
- **🧰 Repair Vault:** A non-destructive repair command can recover files affected by old double-encryption or stale-key bugs. Files that cannot be recovered are left untouched.

### How Encryption Keys Work

New vaults use a Master Vault Key (MVK) for file encryption. Your password unlocks the MVK, but the password itself is not used directly as the long-term file key. The recovery code can also unlock the MVK, which is what makes password reset possible without rewriting every encrypted file.

### Locking and Unlocking
You can toggle encryption on and off using the lock icon in the left ribbon (which now features helpful tooltips), clicking the status bar indicator, or running the "Lock vault" / "Unlock vault" commands. 

### Managing Individual Files
You don't have to encrypt everything at once. You can right-click any `.md`, `.canvas`, or `.excalidraw` file in the file explorer and select encrypt or decrypt. You can also run the "Encrypt/Decrypt this file" command for the active file.

### Security Features
- **Auto-lock**: Configure the plugin to lock automatically after a set period of inactivity or when the Obsidian window loses focus.
- **Decrypt for Search**: When enabled, unlocking decrypts encrypted files so Obsidian's built-in search can index them. When disabled, unlocking only loads the key and files stay encrypted until you decrypt them individually.

## Commands

The following commands are available and can be bound to hotkeys:
- **Lock vault**: Encrypts all files in the protected folder.
- **Unlock vault**: Loads the vault key. If "Decrypt for Search" is enabled, it also decrypts encrypted files.
- **Show encryption status**: Displays a summary of your file encryption state.
- **Recover corrupted files**: Scans for and fixes double-encrypted files.
- **Encrypt/Decrypt this file**: Toggles encryption for the currently active file.
- **Repair Vault**: Runs the non-destructive recovery flow for corrupted or multi-encrypted files.
- **Panic Button (Lock & Hide)**: Locks the vault and closes protected notes.

## Emergency Recovery

If anything goes wrong, such as files getting encrypted twice by accident, an external Python recovery script is included.

Run the following commands in your terminal from your vault directory:

```bash
cd /path/to/your/vault
python3 scripts/lockctl.py
```

This script works independently of Obsidian. It supports the current `%%DATASAFE-ENC:v1%%` file format, legacy `U2FsdGVkX1...` files, and the MVK-based key layout used by current vaults.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/xauravww/obsidian-encrypted-datasafe-notes/releases).
2. Place them in your vault at `<vault>/.obsidian/plugins/encrypted-datasafe-notes/`.
3. Enable the plugin in Obsidian settings under Community plugins.

## Building from source

```bash
npm install
npm run build
```

## License

MIT — based on [obsidian-protected-note](https://github.com/mmiksaa/obsidian-protected-note) (MIT) by Mikail Gadzhikhanov.
