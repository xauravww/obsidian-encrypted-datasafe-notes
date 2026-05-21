# Encrypted Datasafe Notes

A fork of [obsidian-protected-note](https://github.com/mmiksaa/obsidian-protected-note) with enhanced features.

## Features

- **Password-protect** your notes with AES encryption
- **Lock/Unlock** toggle with dynamic ribbon icon (changes icon when locked vs unlocked)
- **File encryption** — encrypts all markdown files in the protected folder on disk
- **Corruption recovery** — detects and fixes double-encrypted files
- **Encryption status** — shows encrypted vs plaintext file count
- **Auto-lock** — locks after inactivity

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
