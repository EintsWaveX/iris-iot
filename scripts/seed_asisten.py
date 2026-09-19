#!/usr/bin/env python3
"""Extract the assistant roster from the finalized handbook into JSON.

`Module - IRIS IoT/data_asisten.typ` is Typst source, not a data-interchange
format, and that folder is finalized -- it must never be edited (see the
project's own standing rule on this). So rather than hand-copy the roster
into the web app, or edit the handbook to export one, this script parses the
one array that matters (`asistens`) with a handful of targeted regexes. It
is not a Typst parser and does not try to be one; it knows the exact shape
of this one file.

Run from the repository root:

    python scripts/seed_asisten.py

Writes web/src/data/asisten.json: an array of {nim, nama, kode, divisiId,
divisiEn}. Phone numbers and Line IDs from the source are deliberately
dropped -- see the Phase 1 design doc's note on why nothing on the site has
a legitimate reason to display them.

This runs in CI (see .github/workflows/ci.yml) specifically so the site
cannot silently drift from the handbook: if data_asisten.typ changes, the
next CI run regenerates asisten.json and the build-diff step in CI catches
it if a committed copy fell out of sync. If you are seeing this script fail,
the handbook's `asistens` array most likely gained a shape this script
does not yet recognise -- extend the regex, do not hand-edit the output.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = ROOT / "Module - IRIS IoT" / "data_asisten.typ"
OUTPUT = ROOT / "web" / "src" / "data" / "asisten.json"

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

# The (nama: "...", nim: "...") pairs in #let penyusun-praktikum -- used
# only as a cross-check, per the plan's note that this file has a known
# data-quality defect (one NIM spelled two different ways in two places).
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
                "nama": m.group("nama").strip(),
                "kode": m.group("kode").strip(),
                "divisiId": div_id,
                "divisiEn": div_en,
            }
        )

    if not rows:
        print("error: parsed zero entries from #let asistens", file=sys.stderr)
        return 1

    # Cross-check against #let penyusun-praktikum: the plan's own note
    # records that NIM 101022300172 is spelled two different ways between
    # this array and that one. Warn rather than fail -- #let asistens is
    # authoritative for this app, and a documentation typo elsewhere in a
    # finalized, unrelated file is not this script's problem to fix.
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
