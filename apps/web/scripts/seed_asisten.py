#!/usr/bin/env python3
"""Extract the assistant roster from a vendored handbook copy into JSON.

`data_asisten.typ` beside this script is a read-only copy of the same
array from the IRIS ASO project's finalized handbook, vendored here when
this app moved into its own repository (Documents/WebApps/iris-iot).
That handbook is finalized -- it must never be hand-edited -- so this
script parses the one array that matters (`asistens`) with a handful of
targeted regexes rather than trying to be a real Typst parser. It knows
the exact shape of this one file.

Because the source is now a vendored copy rather than a live sibling
directory, it cannot drift on its own the way a shared-repo file could;
if the handbook's roster changes, refresh this vendored copy by hand and
re-run this script, the same way any other vendored dependency is updated.

Run from the app root (apps/web):

    python scripts/seed_asisten.py

Writes src/data/asisten.json: an array of {nim, nama, kode, divisiId,
divisiEn}. Phone numbers and Line IDs from the source are deliberately
dropped -- nothing on the site has a legitimate reason to display them.

This runs in CI (see .github/workflows/ci.yml) so a stale committed
asisten.json can never ship: the file is gitignored and regenerated on
every run. If you are seeing this script fail, the vendored file most
likely has a shape this script does not yet recognise -- extend the
regex, do not hand-edit the output.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = HERE / "data_asisten.typ"
OUTPUT = ROOT / "src" / "data" / "asisten.json"

# One entry inside #let divisions = ( "key": (id: "...", en: "..."), ... )
DIVISION_RE = re.compile(
    r'"(?P<key>[\w-]+)"\s*:\s*\(\s*id:\s*"(?P<id>[^"]*)"\s*,\s*en:\s*"(?P<en>[^"]*)"\s*\)',
)

# One entry inside #let asistens = ( (div-id: divisions.at("KEY").id, ...
# nim: "...", nama: "...", kode: "...", telp: "...", line: "..."), ... )
ASISTEN_RE = re.compile(
    r'div-id:\s*divisions\.at\("(?P<divkey>[\w-]+)"\)\.id\s*,\s*'
    r'div-en:\s*divisions\.at\("[\w-]+"\)\.en\s*,\s*'
    r'nim:\s*"(?P<nim>\d+)"\s*,\s*'
    r'nama:\s*"(?P<nama>[^"]*)"\s*,\s*'
    r'kode:\s*"(?P<kode>[^"]*)"',
    re.DOTALL,
)

# Phase 9 rulings applied on top of the finalized handbook (which is never
# edited): two codes renamed to match the schedule sheet, and NUE's full
# name corrected. Migration 0012 applies the same to existing rows, so a
# re-seed keeps them.
KODE_BARU = {"RGZ": "REG", "FAT": "TIR"}
NAMA_BARU = {"NUE": "Immanuel Eben Haezer Joseph Aletheia"}

# The (nama: "...", nim: "...") pairs in #let penyusun-praktikum -- used
# only as a cross-check, since the vendored file is known to have one NIM
# spelled two different ways in two places.
PENYUSUN_RE = re.compile(r'nama:\s*"(?P<nama>[^"]*)"\s*,\s*nim:\s*"(?P<nim>\d+)"')


def extract_block(text: str, let_name: str) -> str:
    """Return the parenthesised body of `#let <let_name> = ( ... )`.

    Written as a manual paren-counter rather than a regex with balanced
    groups (Python's re does not support recursive matching) -- the block
    itself contains nested parentheses (each entry is its own tuple), so a
    non-greedy regex would stop at the first `)` and truncate the array.
    """
    marker = f"#let {let_name}"
    start = text.index(marker)
    open_paren = text.index("(", start)
    depth = 0
    for i in range(open_paren, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[open_paren : i + 1]
    raise ValueError(f"unbalanced parentheses reading {let_name!r}")


def main() -> int:
    if not SOURCE.exists():
        print(f"error: {SOURCE} not found", file=sys.stderr)
        return 1

    text = SOURCE.read_text(encoding="utf-8")

    divisions_block = extract_block(text, "divisions")
    divisions = {
        m.group("key"): (m.group("id"), m.group("en"))
        for m in DIVISION_RE.finditer(divisions_block)
    }
    if not divisions:
        print("error: parsed zero entries from #let divisions", file=sys.stderr)
        return 1

    asistens_block = extract_block(text, "asistens")
    rows = []
    seen_nim = set()
    for m in ASISTEN_RE.finditer(asistens_block):
        divkey = m.group("divkey")
        if divkey not in divisions:
            print(f"error: asistens references unknown division {divkey!r}", file=sys.stderr)
            return 1
        div_id, div_en = divisions[divkey]
        nim = m.group("nim")
        if nim in seen_nim:
            print(f"error: duplicate NIM {nim} within #let asistens", file=sys.stderr)
            return 1
        seen_nim.add(nim)
        rows.append(
            {
                "nim": nim,
                "nama": NAMA_BARU.get(m.group("kode").strip(), m.group("nama").strip()),
                "kode": KODE_BARU.get(m.group("kode").strip(), m.group("kode").strip()),
                "divisiId": div_id,
                "divisiEn": div_en,
            }
        )

    if not rows:
        print("error: parsed zero entries from #let asistens", file=sys.stderr)
        return 1

    # Cross-check against #let penyusun-praktikum: the vendored file is
    # known to spell NIM 101022300172 two different ways between this
    # array and that one. Warn rather than fail -- #let asistens is
    # authoritative for this app, and a documentation typo elsewhere in a
    # finalized, unrelated source is not this script's problem to fix.
    try:
        penyusun_block = extract_block(text, "penyusun-praktikum")
        by_nim = {r["nim"]: r["nama"] for r in rows}
        for m in PENYUSUN_RE.finditer(penyusun_block):
            nim, nama = m.group("nim"), m.group("nama").strip()
            if nim in by_nim and by_nim[nim] != nama:
                print(
                    f"warning: NIM {nim} is {by_nim[nim]!r} in #let asistens "
                    f"but {nama!r} in #let penyusun-praktikum -- taking the "
                    f"asistens spelling as authoritative",
                    file=sys.stderr,
                )
    except ValueError:
        pass  # penyusun-praktikum is optional for this script's purpose

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} assistants -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
