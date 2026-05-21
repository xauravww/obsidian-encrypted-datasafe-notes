# Encrypted Datasafe Notes

A fork of [obsidian-protected-note](https://github.com/mmiksaa/obsidian-protected-note) with enhanced features.

## Features

### Core encryption
- **AES encryption** — encrypts markdown files on disk using `CryptoJS.AES` with a SHA-256 hashed passphrase
- **Dynamic ribbon icon** — lock/unlock toggle with a Lucide-style SVG that changes visually when vault is locked vs unlocked
- **Status bar indicator** — shows `🔒 Locked` / `🔓 Unlocked` in the status bar
- **Lock on window blur** — automatically locks the vault when the Obsidian window loses focus
- **Auto-lock (seconds)** — locks after a configurable number of seconds of inactivity

### File operations
- **Right-click encrypt/decrypt** — encrypt or decrypt any single `.md` file via the file explorer context menu (password prompt shown if vault is locked)
- **Bulk lock/unlock** — encrypt/decrypt all files in the configured folder at once via ribbon click or commands
- **Protected folder** — restrict bulk operations to a specific folder, or leave empty to protect the entire vault

### Settings
- **Enable/Disable password** — toggle encryption on/off with password confirmation
- **Change password** — update your vault password (re-encrypts all files with the new key)
- **Protected folder** — choose which folder to protect
- **Auto-lock (seconds)** — idle timeout before automatic lock
- **Lock on window blur** — lock when window loses focus
- **Decrypt on unlock for search** — keeps files decrypted after unlock so Obsidian's search can index them
- **Show animations** — toggle modal and background blur animations
- **High files protection (beta)** — always-at-rest file encryption

### File explorer integration
- **Encryption indicators** — files in the protected folder show a colored left border and lock icon when the vault is locked (updates dynamically as you expand/collapse folders)

### Recovery & diagnostics
- **Scan encryption status** — shows encrypted vs plaintext file count with double-encryption warnings
- **Fix double-encrypted files** — detects and recovers files encrypted twice (corrupted state)
- **lockctl.py** — terminal-based recovery script with lock/unlock/recover/status functions
- **Auto-migration** — seamlessly imports settings from the original `protected-note` plugin on first run

### Hotkeys (set in Obsidian Settings → Hotkeys)
- Lock vault
- Unlock vault
- Show encryption status
- Recover corrupted files
- Encrypt this file
- Decrypt this file

## Commands

| Command | Description |
|---------|-------------|
| Lock vault | Encrypt all files in the protected folder |
| Unlock vault | Decrypt all files (password required) |
| Show encryption status | Quick summary of file encryption state |
| Recover corrupted files | Detect and fix double-encrypted files |

## Emergency Recovery Script

If files get corrupted (e.g., double-encrypted), run the Python recovery script:

```bash
cd /path/to/your/vault
python3 scripts/lockctl.py
```

The script auto-detects the vault and provides lock/unlock/recover/status functions. It uses the same AES encryption as the plugin.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/xauravww/obsidian-encrypted-datasafe-notes/releases)
2. Copy them to `<vault>/.obsidian/plugins/encrypted-datasafe-notes/`
3. Enable the plugin in Obsidian settings → Community plugins

## Building from source

```bash
npm install
npm run build
```

## License

MIT — based on [obsidian-protected-note](https://github.com/mmiksaa/obsidian-protected-note) (MIT) by Mikail Gadzhikhanov.
