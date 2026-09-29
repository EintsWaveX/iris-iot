#!/usr/bin/env python3
"""Build public/handbook/{id,en}/modul-{1..4}.pdf from the finalized handbook.

The IRIS IoT Practicum Module (IRIS ASO's "Module - IRIS IoT/main_id.typ"
and main_en.typ) is final and never edited from here. This script compiles
it into a temporary folder and cuts one PDF per module: that module's own
chapter plus its own appendix (the source listings), nothing else. The
module pages show these publicly, one module and one language at a time.

Chapter and appendix boundaries come from the PDF outline Typst writes
from the headings, so a later revision of the handbook that adds or moves
pages needs no change here.

Usage:
    python scripts/build_handbook.py
    python scripts/build_handbook.py --iris-aso /path/to/IRIS-ASO

Needs the Typst CLI on PATH and the pypdf package. main_id.typ is compiled
with --jobs 1: parallel decoding of its large images runs out of memory.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter

WEB_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = WEB_ROOT / "public" / "handbook"
DEFAULT_IRIS_ASO = Path(os.path.expanduser("~/Downloads/IRIS ASO"))
CHAPTER = re.compile(r"^MODUL[E]? (\d)\b")
APPENDIX_ROOT = re.compile(r"^(APPENDICES|LAMPIRAN)$")
APPENDIX_MODULE = re.compile(r"MODUL[E]? (\d)$")


def top_level(reader: PdfReader) -> list[tuple[int, str, object]]:
    """(page index, title, the entry's children list or None) per top entry."""
    out: list[tuple[int, str, object]] = []
    items = reader.outline
    for i, item in enumerate(items):
        if isinstance(item, list):
            continue
        kids = items[i + 1] if i + 1 < len(items) and isinstance(items[i + 1], list) else None
        out.append((reader.get_destination_page_number(item), item.title, kids))
    return out


def split(pdf: Path, lang: str) -> list[str]:
    reader = PdfReader(str(pdf))
    total = len(reader.pages)
    tops = top_level(reader)
    chapters: dict[int, range] = {}
    appendix: dict[int, range] = {}
    for i, (page, title, kids) in enumerate(tops):
        m = CHAPTER.match(title)
        if m:
            end = tops[i + 1][0] if i + 1 < len(tops) else total
            chapters[int(m.group(1))] = range(page, end)
        if APPENDIX_ROOT.match(title) and isinstance(kids, list):
            entries = [
                (reader.get_destination_page_number(k), k.title)
                for k in kids
                if not isinstance(k, list)
            ]
            for j, (kp, kt) in enumerate(entries):
                am = APPENDIX_MODULE.search(kt)
                if am:
                    end = entries[j + 1][0] if j + 1 < len(entries) else total
                    appendix[int(am.group(1))] = range(kp, end)

    written: list[str] = []
    target = OUT_DIR / lang
    target.mkdir(parents=True, exist_ok=True)
    for modul in range(1, 5):
        if modul not in chapters or modul not in appendix:
            raise SystemExit(f"{pdf.name}: no chapter or appendix found for module {modul}")
        writer = PdfWriter()
        for p in [*chapters[modul], *appendix[modul]]:
            writer.add_page(reader.pages[p])
        writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
        out = target / f"modul-{modul}.pdf"
        with out.open("wb") as fh:
            writer.write(fh)
        written.append(
            f"{out.relative_to(WEB_ROOT)}: {len(chapters[modul]) + len(appendix[modul])} pages, "
            f"{out.stat().st_size // 1024} KB"
        )
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--iris-aso", type=Path, default=DEFAULT_IRIS_ASO)
    args = ap.parse_args()
    src = args.iris_aso / "Module - IRIS IoT"
    if not src.is_dir():
        sys.exit(f"{src} not found -- is --iris-aso correct?")

    with tempfile.TemporaryDirectory(prefix="iris-handbook-") as tmp:
        for lang in ("id", "en"):
            pdf = Path(tmp) / f"main_{lang}.pdf"
            subprocess.run(
                ["typst", "compile", "--jobs", "1", f"main_{lang}.typ", str(pdf)],
                cwd=src,
                check=True,
            )
            for line in split(pdf, lang):
                print(line)


if __name__ == "__main__":
    main()
