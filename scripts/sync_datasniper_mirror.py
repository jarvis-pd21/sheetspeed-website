#!/usr/bin/env python3
"""Copy sheetspeed-website/datasniper onto the jarvis-pd21/datasniper mirror.

manifest-alt.xml is copied unchanged, so it keeps pointing at
https://jarvis-pd21.github.io/datasniper/. README.md and .nojekyll already in
the mirror are left alone. When DATASNIPER_MIRROR_TOKEN is unset this exits 0
after a short note, so the GitHub Action can run on every main push.
"""

from __future__ import annotations

import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

MIRROR_REPO = "https://github.com/jarvis-pd21/datasniper.git"
PRESERVE = {"README.md", ".nojekyll"}


def iter_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name != ".git"]
        for name in filenames:
            yield Path(dirpath) / name


def sync_tree(src: Path, dest: Path) -> list[str]:
    """Make dest match src. Preserve README.md and .nojekyll. Return changes."""
    src = src.resolve()
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    changed = []
    wanted = set()
    for path in iter_files(src):
        rel = path.relative_to(src).as_posix()
        if rel in PRESERVE or rel.split("/", 1)[0] in PRESERVE:
            continue
        wanted.add(rel)
        target = dest / rel
        data = path.read_bytes()
        if target.is_file() and target.read_bytes() == data:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        changed.append(rel)
    for path in iter_files(dest):
        rel = path.relative_to(dest).as_posix()
        if rel in PRESERVE or rel.split("/", 1)[0] in PRESERVE:
            continue
        if rel not in wanted:
            path.unlink()
            changed.append(f"deleted {rel}")
    for dirpath, dirnames, filenames in os.walk(dest, topdown=False):
        if Path(dirpath) == dest or ".git" in Path(dirpath).parts:
            continue
        if not dirnames and not filenames:
            Path(dirpath).rmdir()
    return changed


def git_env(askpass: Path):
    env = os.environ.copy()
    env["GIT_ASKPASS"] = str(askpass)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    return env


def write_askpass(directory: Path) -> Path:
    path = directory / "askpass.sh"
    path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        "  *[Uu]sername*) printf '%s\\n' 'x-access-token' ;;\n"
        "  *) printf '%s\\n' \"$DATASNIPER_MIRROR_TOKEN\" ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return path


def push_mirror(src: Path, token: str) -> int:
    with tempfile.TemporaryDirectory(prefix="datasniper-mirror-") as tmp:
        work = Path(tmp)
        askpass = write_askpass(work)
        env = git_env(askpass)
        env["DATASNIPER_MIRROR_TOKEN"] = token
        clone = work / "datasniper"
        subprocess.run(
            ["git", "clone", "--depth", "1", MIRROR_REPO, str(clone)],
            check=True,
            env=env,
        )
        changed = sync_tree(src, clone)
        if not changed:
            print("DataSniper mirror already matches datasniper/.")
            return 0
        subprocess.run(["git", "-C", str(clone), "add", "-A"], check=True, env=env)
        status = subprocess.run(
            ["git", "-C", str(clone), "status", "--porcelain"],
            check=True,
            env=env,
            capture_output=True,
            text=True,
        )
        if not status.stdout.strip():
            print("DataSniper mirror already matches datasniper/.")
            return 0
        subprocess.run(
            [
                "git", "-C", str(clone),
                "-c", "user.name=sheetspeed-website",
                "-c", "user.email=sheetspeed@agi-jarvis.com",
                "commit", "-m", "Sync DataSniper from sheetspeed-website.",
            ],
            check=True,
            env=env,
        )
        subprocess.run(
            ["git", "-C", str(clone), "push", "origin", "HEAD:main"],
            check=True,
            env=env,
        )
        print(f"Pushed {len(changed)} DataSniper mirror change(s).")
        return 0


def main() -> int:
    token = os.environ.get("DATASNIPER_MIRROR_TOKEN", "").strip()
    if not token:
        print("DATASNIPER_MIRROR_TOKEN is unset. Skipping the DataSniper mirror sync.")
        return 0
    root = Path(__file__).resolve().parents[1]
    return push_mirror(root / "datasniper", token)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        print(f"DataSniper mirror sync failed: {error}", file=sys.stderr)
        sys.exit(error.returncode or 1)
