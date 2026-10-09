"""Builds the Mandarin sketches (src/content/sketches/zh) from the English ones.

Only comments and docstrings change: every comment or docstring line is
looked up in scripts/sketch_zh.json (English text -> Mandarin text) and the
code around it stays byte for byte. A line with no entry keeps its English.

    python scripts/sketch_zh.py extract   # list the English lines still missing
    python scripts/sketch_zh.py build     # write src/content/sketches/zh/*
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(ROOT, "src", "content", "sketches", "en")
ZH_DIR = os.path.join(ROOT, "src", "content", "sketches", "zh")
TABLE = os.path.join(ROOT, "scripts", "sketch_zh.json")


# ---------- Finding comment text ----------
# ---------- Finding comment text ----------
# ---------- Finding comment text ----------

def comment_spans(source, is_python):
    """(start, end) character ranges of comment or docstring text, one per line"""
    spans = []
    i, n = 0, len(source)
    quote = None          # inside a string literal: its delimiter
    block = None          # inside a /* */ comment or a docstring: its closer
    line_start = 0
    while i < n:
        ch = source[i]
        if ch == "\n":
            line_start = i + 1
        if block:
            end = source.find(block, i)
            end = n if end < 0 else end
            # one span per line of the block, trimmed of the leading * and spaces
            chunk_start = i
            while chunk_start < end:
                nl = source.find("\n", chunk_start, end)
                nl = end if nl < 0 else nl
                a = chunk_start
                while a < nl and source[a] in " \t*":
                    a += 1
                b = nl
                while b > a and source[b - 1] in " \t":
                    b -= 1
                if b > a:
                    spans.append((a, b))
                chunk_start = nl + 1
            i = end + len(block)
            block = None
            continue
        if quote:
            if ch == "\\":
                i += 2
                continue
            if source.startswith(quote, i):
                i += len(quote)
                quote = None
                continue
            i += 1
            continue
        if is_python and source.startswith('"""', i):
            # a docstring when it opens a line, otherwise an ordinary string
            if source[line_start:i].strip() == "":
                block = '"""'
                i += 3
                continue
            quote = '"""'
            i += 3
            continue
        if not is_python and source.startswith("/*", i):
            block = "*/"
            i += 2
            continue
        if ch in "\"'":
            quote = ch
            i += 1
            continue
        if (is_python and ch == "#") or (not is_python and source.startswith("//", i)):
            if not is_python and source[line_start:i].strip().startswith("#"):
                pass  # a // after #include or #define is still a comment
            a = i + (1 if is_python else 2)
            while a < n and source[a] == " ":
                a += 1
            b = source.find("\n", a)
            b = n if b < 0 else b
            while b > a and source[b - 1] in " \t\r":
                b -= 1
            if b > a and not re.fullmatch(r"[-=*#/ ]+", source[a:b]):
                spans.append((a, b))
            i = source.find("\n", i)
            i = n if i < 0 else i
            continue
        if not is_python and ch == "#" and source[line_start:i].strip() == "":
            # a preprocessor line: skip to its // comment, if any
            nl = source.find("\n", i)
            nl = n if nl < 0 else nl
            cm = source.find("//", i, nl)
            i = cm if cm >= 0 else nl
            continue
        i += 1
    return spans


def files():
    for name in sorted(os.listdir(EN_DIR)):
        with open(os.path.join(EN_DIR, name), encoding="utf-8") as f:
            yield name, f.read()


def load_table():
    if not os.path.exists(TABLE):
        return {}
    with open(TABLE, encoding="utf-8") as f:
        return json.load(f)


# ---------- Commands ----------
# ---------- Commands ----------
# ---------- Commands ----------

def extract():
    table = load_table()
    missing = []
    for name, src in files():
        for a, b in comment_spans(src, name.endswith(".py")):
            text = src[a:b]
            if text not in table and text not in missing:
                missing.append(text)
    json.dump(missing, sys.stdout, ensure_ascii=False, indent=1)
    print(f"\n[INFO] {len(missing)} lines without Mandarin", file=sys.stderr)


def build():
    table = load_table()
    os.makedirs(ZH_DIR, exist_ok=True)
    left = 0
    for name, src in files():
        out, last = [], 0
        for a, b in comment_spans(src, name.endswith(".py")):
            text = src[a:b]
            out.append(src[last:a])
            if text in table:
                out.append(table[text])
            else:
                out.append(text)
                left += 1
            last = b
        out.append(src[last:])
        with open(os.path.join(ZH_DIR, name), "w", encoding="utf-8", newline="") as f:
            f.write("".join(out))
    print(f"[INFO] wrote {ZH_DIR}, {left} lines kept in English")


if __name__ == "__main__":
    {"extract": extract, "build": build}[sys.argv[1] if len(sys.argv) > 1 else "extract"]()
