# Encrypted Datasafe Notes

A secure encryption plugin for Obsidian, designed to protect your sensitive notes. This is an enhanced fork of `obsidian-protected-note` focused on reliability, recovery, and a seamless user experience.

## What it does

Encrypted Datasafe Notes uses AES encryption to secure your markdown files on disk. You can choose to protect your entire vault or restrict encryption to a specific folder. To keep your data secure, the plugin can automatically lock your files when you step away or when the Obsidian window loses focus. Visual indicators in the file explorer and status bar ensure you always know when your files are locked.

## Usage Guide

### Getting Started
After installing and enabling the plugin, navigate to the settings to set your master password. You can also specify a particular 

### 🕵️‍♂️ Plausible Deniability (Decoy Vault)
Set a secondary **Decoy Password**. If someone forces you to unlock your vault, simply type the decoy password. The vault will successfully "unlock", but it will only reveal harmless decoy notes. Your real secrets will remain completely hidden and mathematically unreadable.

### 🚨 Panic Button (Boss Key)
Instantly lock the entire vault, wipe the memory, and securely close all active secret notes with a single customizable hotkey. 

### 🛡️ Folder-Level Protection; if left blank, it will protect the entire vault.

### Locking and Unlocking
You can toggle encryption on and off using the lock icon in the left ribbon, clicking the status bar indicator, or running the "Lock vault" / "Unlock vault" commands. 

### Managing Individual Files
You don't have to encrypt everything at once. You can right-click any `.md` file in the file explorer and select encrypt or decrypt to handle files individually.

### Security Features
- **Auto-lock**: Configure the plugin to lock automatically after a set period of inactivity or when the Obsidian window loses focus.
- **Search compatibility**: You can choose to keep files decrypted while the vault is unlocked, allowing Obsidian's built-in search to properly index your notes.

## Commands

The following commands are available and can be bound to hotkeys:
- **Lock vault**: Encrypts all files in the protected folder.
- **Unlock vault**: Decrypts all files (requires your password).
- **Show encryption status**: Displays a summary of your file encryption state.
- **Recover corrupted files**: Scans for and fixes double-encrypted files.
- **Encrypt/Decrypt this file**: Toggles encryption for the currently active file.

## Emergency Recovery

If anything goes wrong, such as files getting encrypted twice by accident, an external Python recovery script is included.

Run the following commands in your terminal from your vault directory:

```bash
cd /path/to/your/vault
python3 scripts/lockctl.py
```

This script works independently of Obsidian, using the same AES encryption to help you safely unlock or recover files.

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
