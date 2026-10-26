#!/usr/bin/env python3
"""
Build script for Perburuan LoRa IRIS (Modul 4).

Assembles modul4/public/index.html from the pieces in modul4/src/ into ONE
self-contained file, which is what modul4/server.py serves from the PC.

    python modul4/build.py            (from the project root)
    python build.py                   (from inside modul4/)

A single file matters here: the PC is an access point with no
upstream internet, so anything the page cannot carry itself is simply
unavailable on lab day. That includes the typefaces (inlined as @font-face
data URIs), Preact and htm (vendored), the icons, the IRIS mark and the
Mandarin strings with a CJK font cut down to the characters they use.

The client is the Phase 9 design: Preact + htm screens ported from the
Phase 9 mockup, in three languages (Indonesian, English, Mandarin). See
SETUP.md for where each source comes from and how to refresh it.

Stdlib only, Python 3.10: this also runs on the PC itself
(pc/build_bundle.py calls it).

Guard rails kept from games/build.py: they exist because a NUL byte once
shipped to production through that build, and because an unescaped
"</script" inside a bundle silently truncates the page.
"""

import base64
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR / "src"
OUTPUT_PATH = SCRIPT_DIR / "public" / "index.html"
SHELL_PATH = SRC_DIR / "shell.html"
FONT_DIR = SRC_DIR / "fonts"
ZH_PATH = SRC_DIR / "i18n" / "zh.json"
CJK_CHARS_PATH = FONT_DIR / "cjk-chars.txt"
LOGO_PATH = SRC_DIR / "logo.webp"

# Order IS the cascade: the mockup's styles (generated, pruned to what the
# hunt uses), then the hunt's own layer on top.
STYLE_FILES = [
    "style/mockup.css",
    "style/app.css",
]

# Third-party bundles, unmodified (see src/vendor/README.md).
VENDOR_FILES = [
    "vendor/htm-preact-standalone.umd.js",   # window.htmPreact
]

# Icons and the kit before everything, the socket before the screens that
# read it, app.js last (it renders and opens the socket).
SCRIPT_FILES = [
    "icons.js",
    "kit.js",
    "net.js",
    "sense.js",
    "screens-hunt.js",
    "screens-hunt2.js",
    "app.js",
]

# The typefaces: (family, weight, file, unicode-range or None).
CJK_RANGE = "U+3000-303F, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF"
FONTS = [
    ("Inter", 400, "inter-latin-400-normal.woff2", None),
    ("Inter", 500, "inter-latin-500-normal.woff2", None),
    ("Inter", 600, "inter-latin-600-normal.woff2", None),
    ("Inter", 700, "inter-latin-700-normal.woff2", None),
    ("Plus Jakarta Sans", 700, "plus-jakarta-sans-latin-700-normal.woff2", None),
    ("Plus Jakarta Sans", 800, "plus-jakarta-sans-latin-800-normal.woff2", None),
    ("JetBrains Mono", 400, "jetbrains-mono-latin-400-normal.woff2", None),
    ("JetBrains Mono", 600, "jetbrains-mono-latin-600-normal.woff2", None),
    ("Noto Sans SC", 400, "noto-sans-sc-hunt-400.woff2", CJK_RANGE),
    ("Noto Sans SC", 700, "noto-sans-sc-hunt-700.woff2", CJK_RANGE),
]

PLACEHOLDER_STYLE = "<!--STYLE-->"
PLACEHOLDER_SCRIPT = "<!--SCRIPT-->"

# Twenty-five phones load this over one PC hotspot at the start of a
# session. The fonts are most of it; anything past this budget is a mistake
# (a stray asset, a vendored file twice), not a feature.
MAX_OUTPUT_BYTES = int(1.5 * 1024 * 1024)

# The house voice rule: no em dash and no en dash in anything the hunt says,
# in any of its three languages. Checked in the hunt's own sources and in
# the Mandarin strings, not in vendored files.
DASHES = {chr(0x2014): "em dash", chr(0x2013): "en dash"}

STANDALONE_HEAD = """<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Perburuan LoRa IRIS, Modul 4.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2305060b'/%3E%3Ccircle cx='32' cy='32' r='5' fill='%2340b0ff'/%3E%3Ccircle cx='32' cy='32' r='13' stroke='%2340b0ff' stroke-width='1.6' fill='none' opacity='.6'/%3E%3Ccircle cx='32' cy='32' r='21' stroke='%2340b0ff' stroke-width='1.2' fill='none' opacity='.3'/%3E%3C/svg%3E">
<meta name="theme-color" content="#0a0c14">
"""

STANDALONE_TAIL = """
</body>
</html>
"""


class BuildError(Exception):
    """Raised for any build failure that should abort loudly."""


def human_size(num_bytes):
    size = float(num_bytes)
    for unit in ("B", "KB", "MB"):
        if size < 1024 or unit == "MB":
            if unit == "B":
                return f"{size:,.0f} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size} B"


_ALLOWED_CONTROLS = frozenset("\t\n\r")
_REPLACEMENT_CHAR = chr(0xFFFD)


def check_no_control_chars(text, what):
    """Reject stray control characters, naming the file, line and column.

    Checked per source file rather than on the concatenated bundle, because
    the error is only actionable if it says where the byte is.
    """
    for index, char in enumerate(text):
        if char in _ALLOWED_CONTROLS:
            continue

        code = ord(char)
        is_control = code < 0x20 or code == 0x7F
        if not is_control and char != _REPLACEMENT_CHAR:
            continue

        line = text.count("\n", 0, index) + 1
        column = index - text.rfind("\n", 0, index)
        label = ("replacement character" if char == _REPLACEMENT_CHAR
                 else "control character")
        raise BuildError(
            f"{what}: {label} U+{code:04X} at line {line}, column {column}. "
            "This is almost always a mangled escape rather than anything "
            "intentional."
        )


def check_no_dashes(text, what):
    """Refuse an em or en dash in the hunt's own copy, with its line."""
    for char, name in DASHES.items():
        index = text.find(char)
        if index != -1:
            line = text.count("\n", 0, index) + 1
            raise BuildError(
                f"{what}: {name} at line {line}. House rule: no em or en "
                "dashes in the copy; write a middle dot, a comma or "
                "'antara X dan Y' instead.")


def read_required(path, what):
    if not path.is_file():
        raise BuildError(f"Missing required source: {what} not found at {path}")
    text = path.read_text(encoding="utf-8")
    check_no_control_chars(text, what)
    return text


def font_faces():
    """The woff2 files as @font-face rules with data URIs."""
    rules = []
    total = 0
    for family, weight, name, urange in FONTS:
        path = FONT_DIR / name
        if not path.is_file():
            raise BuildError(f"Missing font: src/fonts/{name} (see SETUP.md, 'Sumber berkas')")
        data = path.read_bytes()
        total += len(data)
        encoded = base64.b64encode(data).decode("ascii")
        rules.append(
            "@font-face {\n"
            f'  font-family: "{family}";\n'
            "  font-style: normal;\n"
            f"  font-weight: {weight};\n"
            "  font-display: swap;\n"
            + (f"  unicode-range: {urange};\n" if urange else "")
            + f'  src: url(data:font/woff2;base64,{encoded}) format("woff2");\n'
            "}")
    return "\n".join(rules), total


def mandarin():
    """zh.json, checked: every key the scripts use, no dashes, and every
    CJK character covered by the subset font."""
    # Both helpers are stdlib at import time (subset_cjk only loads
    # fontTools inside its own main), so the PC can run this too.
    sys.path.insert(0, str(SCRIPT_DIR / "tools"))
    try:
        import subset_cjk
        import zh_sync
    finally:
        sys.path.pop(0)

    text = read_required(ZH_PATH, "src/i18n/zh.json")
    try:
        zh = json.loads(text)
    except json.JSONDecodeError as err:
        raise BuildError(f"src/i18n/zh.json is not valid JSON: {err}") from err
    check_no_dashes(text, "src/i18n/zh.json")

    gone = zh_sync.missing(zh)
    if gone:
        listed = "\n    ".join(gone[:20])
        raise BuildError(
            f"{len(gone)} English string(s) have no Mandarin in src/i18n/zh.json:\n    {listed}\n"
            "  Run python tools/zh_sync.py --check, translate them, then build again.")

    covered = set(read_required(CJK_CHARS_PATH, "src/fonts/cjk-chars.txt").strip())
    need = subset_cjk.needed()
    lacking = sorted(set(need) - covered)
    if lacking:
        raise BuildError(
            f"{len(lacking)} CJK character(s) are not in the subset font: {''.join(lacking[:40])}\n"
            "  Run python tools/subset_cjk.py <NotoSansSC[wght].ttf> again.")
    return zh


def wrap_standalone(inner):
    """Lift the leading <title> and <style> into a real <head>."""
    rest = inner

    title_match = re.match(r"\s*(<title>.*?</title>)\s*", rest,
                           re.DOTALL | re.IGNORECASE)
    if not title_match:
        raise BuildError("could not find a leading <title> in the built fragment")
    title = title_match.group(1)
    rest = rest[title_match.end():]

    style_match = re.match(r"\s*(<style>.*?</style>)\s*", rest,
                           re.DOTALL | re.IGNORECASE)
    if not style_match:
        raise BuildError("could not find the <style> block after <title>")
    style = style_match.group(1)
    body = rest[style_match.end():]

    return (STANDALONE_HEAD + title + "\n" + style + "\n</head>\n<body>\n"
            + body + STANDALONE_TAIL)


def main():
    print("Perburuan LoRa IRIS build")
    print(f"  src dir : {SRC_DIR}")
    print(f"  output  : {OUTPUT_PATH}")
    print()

    shell = read_required(SHELL_PATH, "src/shell.html")
    check_no_dashes(shell, "src/shell.html")
    sizes = [("src/shell.html", len(shell.encode("utf-8")))]

    # ---- styles ------------------------------------------------------
    faces, font_bytes = font_faces()
    sizes.append((f"src/fonts ({len(FONTS)} woff2)", font_bytes))
    styles = [f"/* ---- fonts ---- */\n{faces}"]
    for name in STYLE_FILES:
        text = read_required(SRC_DIR / name, f"src/{name}")
        check_no_dashes(text, f"src/{name}")
        sizes.append((f"src/{name}", len(text.encode("utf-8"))))
        styles.append(f"/* ---- {name} ---- */\n{text}")

    if PLACEHOLDER_STYLE not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_STYLE} placeholder")
    shell = shell.replace(
        PLACEHOLDER_STYLE, "<style>\n" + "\n".join(styles) + "\n</style>", 1)

    # ---- scripts -----------------------------------------------------
    scripts = []
    for name in VENDOR_FILES:
        text = read_required(SRC_DIR / name, f"src/{name}")
        sizes.append((f"src/{name}", len(text.encode("utf-8"))))
        scripts.append(text)

    # Data the scripts read at start: the Mandarin strings and the IRIS
    # mark. "</" is escaped so a string can never close the script block.
    zh = mandarin()
    zh_js = json.dumps(zh, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    if not LOGO_PATH.is_file():
        raise BuildError("Missing src/logo.webp")
    logo = base64.b64encode(LOGO_PATH.read_bytes()).decode("ascii")
    prelude = (f"window.HUNT_ZH={zh_js};\n"
               f'window.HUNT_LOGO="data:image/webp;base64,{logo}";')
    sizes.append(("src/i18n/zh.json + logo", len(prelude.encode("utf-8"))))
    scripts.append(f"/* ---- data ---- */\n{prelude}")

    for name in SCRIPT_FILES:
        text = read_required(SRC_DIR / name, f"src/{name}")
        check_no_dashes(text, f"src/{name}")
        sizes.append((f"src/{name}", len(text.encode("utf-8"))))
        scripts.append(f"/* ---- {name} ---- */\n{text}")

    if PLACEHOLDER_SCRIPT not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_SCRIPT} placeholder")

    # Joined by an explicit empty statement so a minified bundle that omits
    # its trailing semicolon cannot ASI-collide with the next file.
    bundle = "\n;\n".join(scripts)
    shell = shell.replace(
        PLACEHOLDER_SCRIPT, "<script>\n" + bundle + "\n</script>", 1)

    # ---- guards ------------------------------------------------------
    # A literal "</script" anywhere in the bundle ends the block early and
    # silently truncates the page; the browser gives no error worth the name.
    lowered = shell.lower()
    script_open = lowered.find("<script>")
    if script_open != -1:
        inner = lowered[script_open + len("<script>"):]
        end = inner.rfind("</script>")
        if end != -1 and "</script" in inner[:end]:
            raise BuildError(
                "a source file contains a literal '</script' inside the JS "
                "bundle, which would truncate the page")

    for token in (PLACEHOLDER_STYLE, PLACEHOLDER_SCRIPT):
        if token in shell:
            raise BuildError(f"placeholder {token} survived the build")

    # Word boundary matters: <header> and <body> both start with a document
    # tag's spelling, and a naive substring test rejects perfectly good markup.
    markup = lowered[:script_open if script_open != -1 else len(lowered)]
    stray = re.search(r"<(?:!doctype|html|head|body)\b", markup)
    if stray:
        raise BuildError(
            f"shell.html must not contain {stray.group(0)}; build.py supplies "
            "the document shell itself")

    output = wrap_standalone(shell)
    output_bytes = output.encode("utf-8")

    if len(output_bytes) > MAX_OUTPUT_BYTES:
        raise BuildError(
            f"output is {human_size(len(output_bytes))}, over the "
            f"{human_size(MAX_OUTPUT_BYTES)} budget")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(output_bytes)

    widest = max(len(name) for name, _ in sizes)
    for name, size in sizes:
        print(f"  {name.ljust(widest)}  {human_size(size)}")
    print()
    print(f"  wrote {OUTPUT_PATH} ({human_size(len(output_bytes))}, "
          f"{output.count(chr(10)) + 1:,} lines)")


if __name__ == "__main__":
    try:
        main()
    except BuildError as err:
        print(f"\nBUILD FAILED: {err}", file=sys.stderr)
        sys.exit(1)
