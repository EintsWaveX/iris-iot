#!/usr/bin/env python3
"""Fail CI only on a genuinely NEW potential secret, not on every rerun of
the same already-audited finding.

`.secrets.baseline` at the repo root is the output of `detect-secrets
scan`, hand-audited once: every finding it contained at that point was
individually inspected (see the Phase 1 commit message) and is a false
positive -- a classroom Wi-Fi password on an isolated, internet-less
network, a placeholder a student is meant to fill in, a charset constant,
a CI-only dummy value, or a test fixture.

The naive CI recipe from detect-secrets' own docs --

    detect-secrets scan --baseline .secrets.baseline
    git diff --exit-code .secrets.baseline

-- compares the WHOLE baseline file, including its `generated_at`
timestamp and `plugins_used`/`filters_used` metadata. Both drift on their
own whenever the installed detect-secrets version differs even slightly
between the machine that last touched the baseline and the CI runner,
which would fail this check for reasons that have nothing to do with
secrets. This script instead compares only the finding identities
(filename, line number, and secret hash) between the checked-in baseline
and a fresh scan, so it reacts to what actually matters: a NEW string
appearing that was not there when this baseline was last audited.

Usage: python scripts/check_secrets.py
Exit 0: every finding in a fresh scan already exists in the baseline.
Exit 1: prints each new finding and fails -- audit it, then mark the new
entries `is_secret: false` in .secrets.baseline after confirming them by
hand, the same way the existing ones were done.

Note for local testing: `detect-secrets scan` with no path argument only
scans files git already knows about (tracked or staged) when run inside a
repository -- an untracked scratch file on disk is invisible to it until
`git add`ed. This matches CI's real situation exactly (a checked-out push
or PR is, by definition, all tracked), but it means dropping a throwaway
test file next to your changes and running this script will NOT see it
unless you stage it first.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / ".secrets.baseline"


def load_findings(data: dict) -> set[tuple[str, int, str]]:
    """(filename, line_number, hashed_secret) triples -- ignores
    `is_secret`, `type`, and all top-level metadata.

    Filenames are normalised to forward slashes: detect-secrets reports
    paths in whatever separator the host OS uses, so a baseline generated
    or re-audited on Windows records `kode_praktikum\\en\\...` while a
    Linux CI runner's fresh scan reports `kode_praktikum/en/...` for the
    identical file. Without normalising, every finding looks "new" on
    whichever OS did not generate the baseline -- this was caught by CI
    itself failing on findings a local, same-baseline run had just called
    clean, which is what surfaced the mismatch.
    """
    out = set()
    for filename, items in data.get("results", {}).items():
        normalised = filename.replace("\\", "/")
        for item in items:
            out.add((normalised, item["line_number"], item["hashed_secret"]))
    return out


def main() -> int:
    if not BASELINE_PATH.exists():
        print(f"error: {BASELINE_PATH} does not exist", file=sys.stderr)
        return 1

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    known = load_findings(baseline)

    # Invoked as `python -m detect_secrets` rather than the `detect-secrets`
    # console script: the script is not guaranteed to be on PATH (it isn't,
    # by default, in this project's own local dev environment on Windows),
    # while the module always is once the package is installed.
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "detect_secrets",
            "scan",
            "--exclude-files",
            "node_modules/",
            "--exclude-files",
            r"\.git/",
            # The baseline itself is not source -- it is 67 SHA1 hashes
            # under keys literally named "hashed_secret", which is exactly
            # the shape the Keyword plugin looks for. Scanning it against
            # itself would forever "discover" ~67 new findings that are
            # nothing but the audit trail of the 67 findings already
            # recorded. This is what --exclude-files exists for here;
            # detect-secrets' own documented `--baseline` flag does the
            # same exclusion automatically, but also folds
            # version-dependent metadata into its output, which is the
            # exact fragility this script exists to avoid (see the module
            # docstring).
            "--exclude-files",
            r"\.secrets\.baseline$",
        ],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        return proc.returncode

    fresh = json.loads(proc.stdout)
    current = load_findings(fresh)

    # Always written, not just on failure: this is what makes a mismatch
    # debuggable at all when the machine regenerating the baseline and the
    # machine enforcing it disagree about what detect-secrets finds for
    # identical, byte-identical source (this happened once already --
    # see the commit that added this line for the full story).
    (ROOT / "fresh-scan.json").write_text(json.dumps(fresh, indent=2), encoding="utf-8")

    # A lookup back into the fresh scan, so a genuinely new finding can be
    # reported with its human-readable type, not just its hash.
    by_key = {}
    for filename, items in fresh.get("results", {}).items():
        normalised = filename.replace("\\", "/")
        for item in items:
            by_key[(normalised, item["line_number"], item["hashed_secret"])] = item

    new = current - known
    if new:
        print(f"{len(new)} finding(s) not in the audited baseline:", file=sys.stderr)
        for filename, line, _ in sorted(new):
            kind = by_key[(filename, line, _)]["type"]
            print(f"  {filename}:{line}  {kind}", file=sys.stderr)
        print(
            "\nIf this is a real secret: remove it, rotate it if it was ever live, "
            "and do not add it to the baseline.\n"
            "If this is a false positive: confirm it by reading the actual line, "
            "then add it to .secrets.baseline with is_secret: false.",
            file=sys.stderr,
        )
        return 1

    print(f"clean: {len(current)} finding(s), all already audited")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
