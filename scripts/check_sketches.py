#!/usr/bin/env python3
"""Compile-verify every practicum source file, the second half of the CI gate
the Phase 3 plan calls for alongside check_journal_pages.py.

Scope, and why it isn't simply "every file under kode_praktikum/ and
kunci_jawaban/":

  kunci_jawaban/**/*.ino   arduino-cli compile (fqbn esp32:esp32:esp32)
  kode_praktikum/**/*.ino  NOT compiled -- these intentionally contain
                           `________` blanks (e.g. `getService(________)`),
                           which a C++ compiler correctly rejects as an
                           undeclared identifier. That is by design, not a
                           defect: the student fills them in before it will
                           ever build. kunci_jawaban holds the same sketches
                           with every blank answered, so it is what actually
                           proves the sketch itself is soundly written.
  kode_praktikum/**/*.py   py_compile (syntax only)
  kunci_jawaban/**/*.py    py_compile (syntax only)

Both trees' .py files are py_compile'd because Python treats `________` as
an ordinary (if undefined) identifier -- a syntax check alone doesn't
execute it, so the blanked student version compiles just as cleanly as the
filled key. That is also why this script cannot catch a wrong *answer* in
kunci_jawaban's Python files, only a broken one; module 3's MicroPython-only
imports (`network`, `umqtt.simple`, `ntptime`) are never resolved at
py_compile time either, for the same reason.

Module 4's kunci_jawaban holds 7 near-identical group folders (hunter.ino and
beacon.ino, per language) that gen_modul4.py generates from two shared
templates and differ only by a substituted `GROUP_ID` -- a difference that
generator's own audit() already checks at generation time, not at compile
time. Compiling all 7 buys nothing a real template bug wouldn't already show
in group 1, so only grup1 is compiled per language; this cut a real,
observed OOM-kill risk (compiling all 28 modul4 sketches has twice been
killed by the host's memory-pressure reaper) roughly in half for no loss of
actual coverage.

Modul 1's central/peripheral each `#include "iris_waktu.h"`, a header shared
between the two rather than duplicated in each -- compile_sketch() stages any
`*.h` sibling of the .ino alongside it so arduino-cli can find it.

Every sketch shares one persistent `--build-path` (`.arduino-build-cache/`,
gitignored), so the ESP32 core is object-compiled once instead of from
scratch on every single sketch -- that was the real cost driver, not the
sketch code itself, and a much bigger win than throttling parallelism (an
earlier version of this script passed --jobs 1 to cut peak memory; measured,
it made the first, cache-cold compile roughly 10x slower for no actual
memory-pressure benefit, since the two reaper kills so far both hit an idle
*background* shell, not a compile actively running -- so parallelism was
never the actual problem and is left at arduino-cli's default). Run this in
the foreground, not backgrounded, for the same reason.

Run from the project root:

    python scripts/check_sketches.py
"""

import pathlib
import shutil
import subprocess
import sys

MODUL4_REPRESENTATIVE_GROUP = "grup1"
BUILD_CACHE = pathlib.Path(__file__).resolve().parent / ".arduino-build-cache"

ROOT = pathlib.Path(__file__).resolve().parent.parent
FQBN = "esp32:esp32:esp32"
LIBRARIES = [
    "ESP32Servo",
    "WebSockets",
    "LoRa",
    "DHT sensor library",
    "Adafruit Unified Sensor",
]


STAGING = BUILD_CACHE / "_staging"


def compile_sketch(ino_path: pathlib.Path) -> tuple[bool, str]:
    # arduino-cli requires a sketch FOLDER whose name matches its one .ino
    # file. Several sketches here are independent programs that happen to sit
    # side by side in one directory (modul1's central/peripheral pair, each
    # modul4 group's hunter/beacon pair) -- passing that shared directory
    # would make arduino-cli treat both files as one concatenated sketch,
    # which is wrong. Each file is staged alone, in a folder named after it,
    # so it compiles as the single independent sketch it is.
    sketch_dir = STAGING / ino_path.stem
    if sketch_dir.exists():
        shutil.rmtree(sketch_dir)
    sketch_dir.mkdir(parents=True)
    shutil.copy(ino_path, sketch_dir / ino_path.name)

    # Modul 1's central/peripheral each #include "iris_waktu.h", a header
    # shared between the two and living beside them, not inside either one.
    # It has to be staged alongside the .ino for arduino-cli to find it.
    for header in ino_path.parent.glob("*.h"):
        shutil.copy(header, sketch_dir / header.name)

    # --build-path is shared and persistent across every call in this run (see
    # the module docstring): the ESP32 core only needs compiling once, not
    # once per sketch.
    result = subprocess.run(
        ["arduino-cli", "compile", "--fqbn", FQBN,
         "--build-path", str(BUILD_CACHE / "build"), str(sketch_dir)],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0, result.stderr


def check_py(py_path: pathlib.Path) -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, "-m", "py_compile", str(py_path)],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0, result.stderr


def is_redundant_modul4_group(ino_path: pathlib.Path) -> bool:
    parts = ino_path.parts
    if "modul4" not in parts:
        return False
    group = parts[parts.index("modul4") + 1]
    return group != MODUL4_REPRESENTATIVE_GROUP


def main() -> None:
    failures = []

    all_sketches = sorted((ROOT / "kunci_jawaban").glob("**/*.ino"))
    if not all_sketches:
        sys.exit("No .ino files found under kunci_jawaban/")
    sketches = [p for p in all_sketches if not is_redundant_modul4_group(p)]
    skipped = len(all_sketches) - len(sketches)

    for ino in sketches:
        ok, err = compile_sketch(ino)
        rel = ino.relative_to(ROOT)
        print(f"{'ok' if ok else 'FAIL':6s} {rel}", flush=True)
        if not ok:
            failures.append(rel)
            print(err, file=sys.stderr, flush=True)

    py_files = sorted((ROOT / "kode_praktikum").glob("**/*.py")) + \
        sorted((ROOT / "kunci_jawaban").glob("**/*.py"))
    for py in py_files:
        ok, err = check_py(py)
        rel = py.relative_to(ROOT)
        print(f"{'ok' if ok else 'FAIL':6s} {rel}", flush=True)
        if not ok:
            failures.append(rel)
            print(err, file=sys.stderr, flush=True)

    if failures:
        sys.exit(f"\n{len(failures)} file(s) failed to compile.")

    print(f"\nok  {len(sketches)} sketches ({skipped} redundant modul4 groups "
          f"skipped, see MODUL4_REPRESENTATIVE_GROUP) + {len(py_files)} "
          f"Python files compiled")


if __name__ == "__main__":
    main()
