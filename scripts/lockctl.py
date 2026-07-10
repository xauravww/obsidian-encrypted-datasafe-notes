#!/usr/bin/env python3
# Emergency recovery tool for Obsidian Encrypted Datasafe Notes
# Run this from terminal when files get double-encrypted/corrupted.
import base64, hashlib, json, os, sys
from Crypto.Cipher import AES

PLUGIN_DIRS = [
    os.path.join(".obsidian", "plugins", "encrypted-datasafe-notes"),
    os.path.join(".obsidian", "plugins", "protected-note"),
]
HEADER = "%%DATASAFE-ENC:v1%%\n"
HEADER_PREFIX = "%%DATASAFE-ENC:v"
LEGACY_PREFIX = "U2FsdGVkX1"
SUPPORTED_EXTENSIONS = (".md", ".canvas", ".excalidraw")

def find_vault():
    cwd = os.getcwd()
    def has_plugin(dirpath):
        return any(os.path.exists(os.path.join(dirpath, p, "data.json")) for p in PLUGIN_DIRS)
    for entry in os.listdir(cwd):
        sub = os.path.join(cwd, entry)
        if os.path.isdir(sub) and has_plugin(sub):
            return sub
    d = cwd
    while True:
        if has_plugin(d):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    print("ERROR: No Obsidian vault with Encrypted Datasafe Notes plugin found.")
    sys.exit(1)

VAULT = find_vault()
JSON = next(
    os.path.join(VAULT, p, "data.json")
    for p in PLUGIN_DIRS
    if os.path.exists(os.path.join(VAULT, p, "data.json"))
)

def strip_header(content):
    if not content.startswith(HEADER_PREFIX):
        return content
    first, _, rest = content.partition("\n")
    if first.startswith(HEADER_PREFIX) and first.endswith("%%"):
        return rest
    return content

def wrap_header(ciphertext):
    return HEADER + ciphertext

def is_encrypted(content):
    return content.startswith(HEADER_PREFIX) or content.startswith(LEGACY_PREFIX)

def evp_kdf(password, salt, key_len=32, iv_len=16):
    pw = password.encode("utf-8")
    d = hashlib.md5(pw + salt).digest()
    r = d
    while len(r) < key_len + iv_len:
        r += hashlib.md5(r[-16:] + pw + salt).digest()
    return r[:key_len], r[key_len:key_len+iv_len]

def aes_decrypt(data, pw):
    d = base64.b64decode(strip_header(data).strip())
    assert d[:8] == b"Salted__"
    salt, ct = d[8:16], d[16:]
    key, iv = evp_kdf(pw, salt)
    pt = AES.new(key, AES.MODE_CBC, iv=iv).decrypt(ct)
    pad = pt[-1]
    return None if (pad < 1 or pad > 16) else pt[:-pad]

def aes_encrypt(plaintext, pw):
    salt = os.urandom(8)
    key, iv = evp_kdf(pw, salt)
    data = plaintext.encode("utf-8")
    pad = 16 - (len(data) % 16)
    data += bytes([pad] * pad)
    ct = AES.new(key, AES.MODE_CBC, iv=iv).encrypt(data)
    return wrap_header(base64.b64encode(b"Salted__" + salt + ct).decode("ascii"))

def get_folder():
    return json.load(open(JSON)).get("folder", "")

def get_md_files(folder):
    root = VAULT if folder in ("", "/") else os.path.join(VAULT, folder)
    if not os.path.isdir(root):
        print(f"Folder '{folder}' not found at:\n  {root}")
        return []
    out = []
    for r, _, f in os.walk(root):
        for fn in f:
            if fn.endswith(SUPPORTED_EXTENSIONS):
                out.append(os.path.join(r, fn))
    return out

def set_locked(state):
    d = json.load(open(JSON))
    d["isLocked"] = state
    json.dump(d, open(JSON, "w"), indent=2)

def do_unlock(pw):
    folder = get_folder()
    for fp in get_md_files(folder):
        rel = os.path.relpath(fp, VAULT)
        c = open(fp).read().strip()
        if not is_encrypted(c): continue
        pt = aes_decrypt(c, pw)
        if pt is None: continue
        decoded = pt.decode("utf-8", errors="replace")
        if len(pt) == 0 or not is_encrypted(decoded):
            open(fp, "w").write(pt.decode("utf-8")); print(f"  DECRYPTED {rel}")
            continue
        pt2 = aes_decrypt(decoded, pw)
        if pt2 is not None:
            open(fp, "w").write(pt2.decode("utf-8"))
            print(f"  RECOVERED (was double-encrypted) {rel}")
    set_locked(False)
    print("Unlock done.")

def do_lock(pw):
    folder = get_folder()
    for fp in get_md_files(folder):
        rel = os.path.relpath(fp, VAULT)
        c = open(fp).read().strip()
        if is_encrypted(c): continue
        open(fp, "w").write(aes_encrypt(c, pw))
        print(f"  ENCRYPTED {rel}")
    set_locked(True)
    print("Lock done.")

def do_recover(pw):
    folder = get_folder()
    for fp in get_md_files(folder):
        rel = os.path.relpath(fp, VAULT)
        c = open(fp).read().strip()
        if not is_encrypted(c): continue
        pt = aes_decrypt(c, pw)
        if pt is None:
            print(f"  FAILED {rel}"); continue
        decoded = pt.decode("utf-8", errors="replace")
        if len(pt) == 0 or not is_encrypted(decoded):
            print(f"  OK {rel}"); continue
        pt2 = aes_decrypt(decoded, pw)
        if pt2 is not None:
            open(fp, "w").write(pt2.decode("utf-8"))
            print(f"  RECOVERED {rel}")
        else:
            print(f"  FAILED {rel}")
    print("Recover done.")

def do_status():
    folder = get_folder()
    locked = json.load(open(JSON)).get("isLocked", False)
    print(f'Lock state: {"LOCKED" if locked else "UNLOCKED"}')
    for fp in get_md_files(folder):
        c = open(fp).read().strip()
        icon = "LOCKED" if is_encrypted(c) else "PLAIN"
        print(f"  {icon} {os.path.relpath(fp, VAULT)}")

def get_file_key(pwd):
    settings = json.load(open(JSON))
    pwd_hash = hashlib.sha256(pwd.encode()).hexdigest()

    verifier = settings.get("passwordVerifier", "")
    if verifier:
        valid = aes_decrypt(verifier, pwd_hash)
        if valid != b"VALID":
            print("Wrong password!"); sys.exit(1)
    elif settings.get("password", "") != pwd_hash:
        print("Wrong password!"); sys.exit(1)

    encrypted_mvk = settings.get("encryptedMVK", "")
    if encrypted_mvk:
        mvk = aes_decrypt(encrypted_mvk, pwd_hash)
        if not mvk:
            print("Could not unlock the Master Vault Key."); sys.exit(1)
        return mvk.decode("utf-8")
    return pwd_hash

if __name__ == "__main__":
    pwd = input("Enter vault password: ").strip()
    file_key = get_file_key(pwd)

    while True:
        print("\n1) Status  2) Unlock  3) Lock  4) Recover  q) Quit")
        c = input("> ").strip()
        if c == "1": do_status()
        elif c == "2": do_unlock(file_key)
        elif c == "3": do_lock(file_key)
        elif c == "4": do_recover(file_key)
        elif c.lower() == "q": print("Bye."); break
