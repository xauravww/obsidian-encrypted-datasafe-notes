#!/usr/bin/env python3
# Emergency recovery tool for Obsidian Encrypted Datasafe Notes
# Run this from terminal when files get double-encrypted/corrupted.
import base64, hashlib, json, os, sys
from Crypto.Cipher import AES

PLUGIN_DIR = os.path.join(".obsidian", "plugins", "protected-note")

def find_vault():
    cwd = os.getcwd()
    def has_plugin(dirpath):
        return os.path.exists(os.path.join(dirpath, PLUGIN_DIR, "data.json"))
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
    print("ERROR: No Obsidian vault with protected-note plugin found.")
    sys.exit(1)

VAULT = find_vault()
JSON = os.path.join(VAULT, PLUGIN_DIR, "data.json")

def evp_kdf(password, salt, key_len=32, iv_len=16):
    pw = password.encode("utf-8")
    d = hashlib.md5(pw + salt).digest()
    r = d
    while len(r) < key_len + iv_len:
        r += hashlib.md5(r[-16:] + pw + salt).digest()
    return r[:key_len], r[key_len:key_len+iv_len]

def aes_decrypt(data, pw):
    d = base64.b64decode(data.strip())
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
    return base64.b64encode(b"Salted__" + salt + ct).decode("ascii")

def get_folder():
    return json.load(open(JSON)).get("folder", "Personal")

def get_md_files(folder):
    root = os.path.join(VAULT, folder)
    if not os.path.isdir(root):
        print(f"Folder '{folder}' not found at:\n  {root}")
        return []
    out = []
    for r, _, f in os.walk(root):
        for fn in f:
            if fn.endswith(".md"):
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
        if not c.startswith("U2FsdGVkX1"): continue
        pt = aes_decrypt(c, pw)
        if pt is None: continue
        if len(pt) == 0 or pt[:8] != b"Salted__":
            open(fp, "w").write(pt.decode("utf-8")); print(f"  DECRYPTED {rel}")
            continue
        pt2 = aes_decrypt(pt, pw)
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
        if c.startswith("U2FsdGVkX1"): continue
        open(fp, "w").write(aes_encrypt(c, pw))
        print(f"  ENCRYPTED {rel}")
    set_locked(True)
    print("Lock done.")

def do_recover(pw):
    folder = get_folder()
    for fp in get_md_files(folder):
        rel = os.path.relpath(fp, VAULT)
        c = open(fp).read().strip()
        if not c.startswith("U2FsdGVkX1"): continue
        pt = aes_decrypt(c, pw)
        if pt is None:
            print(f"  FAILED {rel}"); continue
        if len(pt) == 0 or pt[:8] != b"Salted__":
            print(f"  OK {rel}"); continue
        pt2 = aes_decrypt(pt, pw)
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
        icon = "🔒" if c.startswith("U2FsdGVkX1") else "📄"
        print(f"  {icon} {os.path.relpath(fp, VAULT)}")

if __name__ == "__main__":
    stored = json.load(open(JSON)).get("password", "")
    pwd = input("Enter vault password: ").strip()
    if hashlib.sha256(pwd.encode()).hexdigest() != stored:
        print("Wrong password!"); sys.exit(1)
    pw_hash = stored

    while True:
        print("\n1) Status  2) Unlock  3) Lock  4) Recover  q) Quit")
        c = input("> ").strip()
        if c == "1": do_status()
        elif c == "2": do_unlock(pw_hash)
        elif c == "3": do_lock(pw_hash)
        elif c == "4": do_recover(pw_hash)
        elif c.lower() == "q": print("Bye."); break
