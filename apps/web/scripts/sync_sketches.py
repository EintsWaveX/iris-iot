#!/usr/bin/env python3
"""Sync src/content/sketches/ from the practicum repo's kode_praktikum/.

This is the ONLY way sketch sources should enter the web app -- editing a
file under src/content/sketches/ by hand is how it drifted from the real
practicum source in the first place (Stage 16 found Module 4's copies still
carrying the pre-Stage-14 shared-sync-word, no-GROUP_ID, no-TDMA firmware,
because nothing had ever re-synced them after that rework shipped).

For each language (id, en), copies:
  kode_praktikum/{lang}/modul1_ble_central.ino    -> modul1_ble_central.ino
  kode_praktikum/{lang}/modul1_ble_peripheral.ino -> modul1_ble_peripheral.ino
  kode_praktikum/{lang}/modul2_websocket_esp32.ino -> modul2_websocket_esp32.ino
  kode_praktikum/{lang}/modul2_websocket_server.py -> modul2_websocket_server.py
  kode_praktikum/{lang}/modul3_mqtt_publish.py    -> modul3_mqtt_publish.py
  kode_praktikum/{lang}/modul3_mqtt_subscribe.py  -> modul3_mqtt_subscribe.py
  kode_praktikum/{lang}/modul4/grup1/hunter.ino   -> modul4_hunter.ino
  kode_praktikum/{lang}/modul4/grup1/beacon.ino   -> modul4_beacon.ino

grup1 is used as Module 4's representative folder, the same way
check_sketches.py picks one group to compile-verify: every group's file is
identical except for GROUP_ID and LORA_SYNC_WORD, both handled at request
time by src/lib/group-identity.ts rather than baked into the shipped
template.

Modules 1 and 3 used to `#include`/import a shared iris_waktu.h/.py helper,
copied to public/sketches/. IRIS ASO eaae72b inlined that helper into the
sketches themselves, so every module is now a single self-contained file
and nothing is copied to public/ any more.

Writes two manifests:
  src/content/sketches/identitas.json  per-group GROUP_ID/sync word for
                                        Modules 1, 3 and 4, read from
                                        scripts/gen_modul4.py's own
                                        SYNC_WORDS so that stays the single
                                        source of truth
  src/content/sketches/SOURCE.json     the IRIS ASO commit this sync came
                                        from, plus a sha256 per file, so a
                                        future drift is provable rather than
                                        just suspected

Usage:
    python scripts/sync_sketches.py
    python scripts/sync_sketches.py --iris-aso /path/to/IRIS-ASO
    python scripts/sync_sketches.py --check     # exit 1 on any drift, write nothing
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent  # apps/web/
SKETCHES_DIR = WEB_ROOT / "src" / "content" / "sketches"

DEFAULT_IRIS_ASO = Path(os.path.expanduser("~/Downloads/IRIS ASO"))
LANGUAGES = ("id", "en")

# (source relative to kode_praktikum/{lang}/, destination filename)
PLAIN_FILES = [
    ("modul1_ble_central.ino", "modul1_ble_central.ino"),
    ("modul1_ble_peripheral.ino", "modul1_ble_peripheral.ino"),
    ("modul2_websocket_esp32.ino", "modul2_websocket_esp32.ino"),
    ("modul2_websocket_server.py", "modul2_websocket_server.py"),
    ("modul3_mqtt_publish.py", "modul3_mqtt_publish.py"),
    ("modul3_mqtt_subscribe.py", "modul3_mqtt_subscribe.py"),
]
MODUL4_REPRESENTATIVE_GROUP = "grup1"
MODUL4_FILES = [
    (f"modul4/{MODUL4_REPRESENTATIVE_GROUP}/hunter.ino", "modul4_hunter.ino"),
    (f"modul4/{MODUL4_REPRESENTATIVE_GROUP}/beacon.ino", "modul4_beacon.ino"),
]

# Modules whose downloaded/displayed file must be personalised per group --
# mirrors group-identity.ts's PERSONALIZE_PATTERNS, listed again here only
# so identitas.json carries exactly the groups that need an entry.
GROUP_COUNT = 5


class SyncError(RuntimeError):
    pass


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_sync_words(iris_aso: Path) -> dict[int, str]:
    """Imports scripts/gen_modul4.py from the practicum repo directly,
    rather than re-typing its SYNC_WORDS table here, so that table stays
    the single source of truth Stage 14 established it as."""
    gen_path = iris_aso / "scripts" / "gen_modul4.py"
    if not gen_path.exists():
        raise SyncError(f"{gen_path} not found")
    spec = importlib.util.spec_from_file_location("gen_modul4", gen_path)
    if spec is None or spec.loader is None:
        raise SyncError(f"could not load {gen_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sync_words = getattr(module, "SYNC_WORDS", None)
    if not isinstance(sync_words, dict):
        raise SyncError(f"{gen_path} has no SYNC_WORDS dict")
    return sync_words


def gather_plan(iris_aso: Path) -> dict[str, bytes]:
    """Returns {relative_output_path: content} for everything this script
    would write, computed entirely in memory so --check can compare
    without touching disk."""
    kode_praktikum = iris_aso / "kode_praktikum"
    if not kode_praktikum.exists():
        raise SyncError(f"{kode_praktikum} not found -- is --iris-aso correct?")

    plan: dict[str, bytes] = {}

    for lang in LANGUAGES:
        lang_dir = kode_praktikum / lang
        if not lang_dir.exists():
            raise SyncError(f"{lang_dir} not found")

        for src_name, dest_name in PLAIN_FILES + MODUL4_FILES:
            src = lang_dir / src_name
            if not src.exists():
                raise SyncError(f"{src} not found")
            plan[f"src/content/sketches/{lang}/{dest_name}"] = src.read_bytes()


    sync_words = load_sync_words(iris_aso)
    identitas = {
        "1": {str(g): {"groupId": g} for g in range(1, GROUP_COUNT + 1)},
        "3": {str(g): {"groupId": g} for g in range(1, GROUP_COUNT + 1)},
        "4": {
            str(g): {"groupId": g, "syncWord": sync_words[g]}
            for g in range(1, GROUP_COUNT + 1)
        },
    }
    plan["src/content/sketches/identitas.json"] = (
        json.dumps(identitas, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")

    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=iris_aso,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        dirty = bool(
            subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=iris_aso,
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        commit, dirty = "unknown", True

    files_hash = {
        path: sha256_of(content)
        for path, content in sorted(plan.items())
        if not path.endswith(("identitas.json", "SOURCE.json"))
    }
    source = {
        "irisAsoCommit": commit,
        "irisAsoDirty": dirty,
        "files": files_hash,
    }
    plan["src/content/sketches/SOURCE.json"] = (
        json.dumps(source, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")

    return plan


def run(iris_aso: Path, check: bool) -> None:
    plan = gather_plan(iris_aso)

    drift: list[str] = []
    for rel_path, content in sorted(plan.items()):
        dest = WEB_ROOT / rel_path
        current = dest.read_bytes() if dest.exists() else None
        if current != content:
            drift.append(rel_path)
        if not check:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)

    if check:
        if drift:
            print("drift found, run without --check to fix:", file=sys.stderr)
            for path in drift:
                print(f"  {path}", file=sys.stderr)
            sys.exit(1)
        print(f"ok  {len(plan)} files match IRIS ASO")
    else:
        print(f"wrote {len(plan)} files ({len(drift)} changed)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--iris-aso",
        type=Path,
        default=DEFAULT_IRIS_ASO,
        help=f"path to the IRIS ASO checkout (default: {DEFAULT_IRIS_ASO})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 on any drift instead of writing",
    )
    args = parser.parse_args()

    try:
        run(args.iris_aso.expanduser().resolve(), args.check)
    except SyncError as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
