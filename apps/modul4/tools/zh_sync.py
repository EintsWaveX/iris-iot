#!/usr/bin/env python3
"""
Mandarin strings for the hunt: src/i18n/zh.json, keyed by the English text.

Every piece of copy in the hunt is written L("Indonesia", "English") or
T(...), or as an ["Indonesia", "English"] pair in a lookup table. In
Mandarin the page looks the English text up in zh.json. Template literals
become pattern keys: each ${...} turns into {0}, {1} and so on, which is
exactly how kit.js matches them at run time.

    python tools/zh_sync.py --from <mockups/phase9/tools>   fill from the mockup
    python tools/zh_sync.py --check                          list what is missing

--from reads the Phase 9 mockup's zh.json and zh-extra.json (the reviewed
Mandarin draft) and copies over every key the hunt uses; keys the hunt has
stopped using are dropped. Anything still missing is printed so it can be
translated by hand into src/i18n/zh.json in the same plain register.

build.py imports used_keys() and missing() and refuses to build while a
key is missing, so a new English string can never ship untranslated.
Stdlib only, Python 3.10, like build.py.
"""

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "src"
ZH_PATH = SRC / "i18n" / "zh.json"
SKIP = {"icons.js"}


def _read_lit(s, i):
    """One JS string literal starting at s[i] -> (key, end) or None."""
    q = s[i] if i < len(s) else ""
    if q not in "\"'`" or not q:
        return None
    key = []
    n = 0
    j = i + 1
    while j < len(s):
        c = s[j]
        if c == "\\":
            nx = s[j + 1]
            key.append("\n" if nx == "n" else nx)
            j += 2
            continue
        if c == q:
            return "".join(key), j + 1
        if q == "`" and c == "$" and s[j + 1:j + 2] == "{":
            depth = 1
            k = j + 2
            while k < len(s) and depth:
                ch = s[k]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                elif ch in "\"'`":
                    r = _read_lit(s, k)
                    if r:
                        k = r[1]
                        continue
                k += 1
            key.append("{%d}" % n)
            n += 1
            j = k
            continue
        key.append(c)
        j += 1
    return None


def _skip_ws(s, i):
    while i < len(s) and s[i].isspace():
        i += 1
    return i


CALL_RE = re.compile(r"(?<![A-Za-z0-9_$])(?:H\.)?(?:L|T)\(\s*")
PAIR_RE = re.compile(r'\[\s*"([^"\n]{2,})",\s*"([^"\n]{2,})"\s*\]')


def used_keys():
    """Every English string the hunt's scripts can show, as zh.json keys."""
    keys = set()
    for path in sorted(SRC.glob("*.js")):
        if path.name in SKIP:
            continue
        s = path.read_text(encoding="utf-8")
        for m in CALL_RE.finditer(s):
            i = m.end()
            a = _read_lit(s, i)
            if not a:
                continue
            i = _skip_ws(s, a[1])
            if i >= len(s) or s[i] != ",":
                continue
            i = _skip_ws(s, i + 1)
            b = _read_lit(s, i)
            if b:
                keys.add(b[0])
        for m in PAIR_RE.finditer(s):
            ind, en = m.group(1), m.group(2)
            if re.fullmatch(r"[a-z0-9_-]+", ind) and re.fullmatch(r"[a-z0-9_-]+", en):
                continue
            keys.add(en)
    # Strings with nothing to translate (numbers, codes, units) need no entry.
    return {k for k in keys if re.search(r"[A-Za-z]{2,}", k)}


def load_zh():
    if not ZH_PATH.is_file():
        return {}
    return json.loads(ZH_PATH.read_text(encoding="utf-8"))


def missing(zh=None):
    zh = load_zh() if zh is None else zh
    return sorted(k for k in used_keys() if k not in zh)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--from", dest="src", metavar="DIR",
                    help="the mockup's tools/ folder holding zh.json and zh-extra.json")
    ap.add_argument("--check", action="store_true", help="only report missing keys")
    args = ap.parse_args()

    zh = load_zh()
    keys = used_keys()
    if args.src and not args.check:
        pool = {}
        for name in ("zh.json", "zh-extra.json"):
            p = Path(args.src) / name
            if p.is_file():
                pool.update(json.loads(p.read_text(encoding="utf-8")))
        out = {}
        for k in sorted(keys):
            if k in zh:
                out[k] = zh[k]
            elif k in pool:
                out[k] = pool[k]
        ZH_PATH.parent.mkdir(parents=True, exist_ok=True)
        ZH_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                           encoding="utf-8")
        zh = out
        print(f"wrote {ZH_PATH.relative_to(HERE)}: {len(out)} of {len(keys)} keys")

    gone = missing(zh)
    for k in gone:
        print(f"  missing: {k}")
    print(f"{len(keys) - len(gone)}/{len(keys)} keys translated")
    return 1 if gone else 0


if __name__ == "__main__":
    sys.exit(main())
