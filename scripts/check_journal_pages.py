#!/usr/bin/env python3
"""Compile every journal with Typst and assert its page count.

This is the CI gate the Phase 3 plan calls for before any journal/code
slim-down edit: nothing today catches a `.typ` that fails to build, and
nothing stops a later edit from silently re-inflating a journal back past its
target page count. Run from the project root:

    python scripts/check_journal_pages.py
    python scripts/check_journal_pages.py --max-pages 5

A missing `--max-pages` bound only compiles and reports counts (used to take
a baseline before an edit); CI always passes one.
"""

import argparse
import pathlib
import subprocess
import sys
import tempfile

from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent.parent
JOURNAL_GLOB = "jurnal/*/*.typ"


def compile_and_count(typ_path: pathlib.Path, typst_bin: str) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        out_pdf = pathlib.Path(tmp) / "out.pdf"
        result = subprocess.run(
            [typst_bin, "compile", "--root", str(ROOT), str(typ_path), str(out_pdf)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.exit(
                f"FAIL {typ_path}: typst compile failed\n{result.stderr}"
            )
        return len(PdfReader(str(out_pdf)).pages)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-pages", type=int, default=None,
                         help="fail if any journal compiles to more pages than this")
    parser.add_argument("--min-pages", type=int, default=None,
                         help="fail if any journal compiles to fewer pages than this "
                              "(catches an edit that deleted real content)")
    parser.add_argument("--typst", default="typst", help="path to the typst binary")
    args = parser.parse_args()

    journals = sorted(ROOT.glob(JOURNAL_GLOB))
    if not journals:
        sys.exit(f"No journals found under {JOURNAL_GLOB}")

    failures = []
    for typ_path in journals:
        pages = compile_and_count(typ_path, args.typst)
        rel = typ_path.relative_to(ROOT)
        status = "ok"
        if args.max_pages is not None and pages > args.max_pages:
            status = f"FAIL (> {args.max_pages})"
            failures.append(rel)
        elif args.min_pages is not None and pages < args.min_pages:
            status = f"FAIL (< {args.min_pages})"
            failures.append(rel)
        print(f"{status:14s} {rel}: {pages} pages")

    if failures:
        sys.exit(f"\n{len(failures)} journal(s) outside the page-count target.")

    print(f"\nok  {len(journals)} journals compiled within target")


if __name__ == "__main__":
    main()
