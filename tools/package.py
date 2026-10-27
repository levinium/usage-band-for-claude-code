"""Builds dist/usage-band-v<version>.plugin and its .sha256.

A .plugin file is a zip of the mod with .claude-plugin/ at its top. It is what
Claude saves to an account, and what a release offers for download.

    python tools/package.py
"""

import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The mod itself, and nothing the engine writes (.claude-plugin/types/) or the
# repository needs only for itself (docs, workflows, this script).
INCLUDE = [
    ".claude-plugin/plugin.json",
    "hooks",
    "types",
    "tests",
    "tsconfig.json",
    "README.md",
    "LICENSE",
]


def files():
    for entry in INCLUDE:
        path = ROOT / entry
        if not path.exists():
            sys.exit(f"Missing {entry}; refusing to build an incomplete package.")
        if path.is_dir():
            yield from sorted(p for p in path.rglob("*") if p.is_file() and not p.is_symlink())
        else:
            yield path


def main():
    manifest = json.loads((ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
    name, version = manifest["name"], manifest["version"]

    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / f"{name}-v{version}.plugin"

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path in files():
            z.write(path, path.relative_to(ROOT).as_posix())

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    (dist / f"{out.name}.sha256").write_text(f"{digest}  {out.name}\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)}  {out.stat().st_size} bytes  sha256 {digest}")


if __name__ == "__main__":
    main()
