#!/usr/bin/env python3
"""
Build script for Perburuan LoRa IRIS (Modul 4 Part A).

Assembles hunt/public/index.html from the pieces in hunt/src/ into ONE
self-contained file, which is what hunt/server.py serves from the Orange Pi.

    python hunt/build.py            (from the project root)
    python build.py                 (from inside hunt/)

A single file matters more here than it did for games/: the Orange Pi is an
access point with no upstream internet, so anything the page cannot carry
itself is simply unavailable on lab day. The one exception is the Google Fonts
@import inherited from tokens.css -- see the note on FONT fallbacks below.

Adapted from games/build.py. Its guard rails are kept deliberately: they exist
because a NUL byte once shipped to production through that build, and because
an unescaped "</script" inside a bundle silently truncates the page.
"""

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR / "src"
OUTPUT_PATH = SCRIPT_DIR / "public" / "index.html"

SHELL_PATH = SRC_DIR / "shell.html"
STYLE_DIR = SRC_DIR / "style"
VENDOR_DIR = SRC_DIR / "vendor"

# Order IS the cascade: tokens first, then the reset, then the background
# layers (which must lose to everything painted on top of them), then the
# hunt's own screens, then the motion layer last so it can override.
STYLE_FILES = [
    "tokens.css",
    "base.css",
    "cosmos.css",
    "hunt.css",
    "motion.css",
    # Last, so a phone can override anything the desktop layout set.
    "mobile.css",
]

VENDOR_FILES = [
    "gsap.min.js",           # window.gsap
    "CustomEase.min.js",     # window.CustomEase
    "SplitText.min.js",      # window.SplitText
    "confetti.browser.js",   # window.confetti
]

# i18n before everything that reads strings; motion before cosmos (shared
# ticker); store before the ui-* modules; app.js wires it all together last.
SCRIPT_FILES = [
    "i18n.js",
    "motion.js",
    "cosmos.js",
    # identity before store: the socket announces who we are on open.
    "identity.js",
    "roster.js",
    "store.js",
    # modal before every ui-* module that opens one.
    "modal.js",
    "sense.js",
    "ui-hunt.js",
    "ui-layers.js",
    "ui-notify.js",
    "ui-claim.js",
    "ui-awards.js",
    "ui-assistant.js",
    "ui-onboard.js",
    "ui-stage.js",
    "app.js",
]

PLACEHOLDER_STYLE = "<!--STYLE-->"
PLACEHOLDER_SCRIPT = "<!--SCRIPT-->"

MAX_OUTPUT_BYTES = 16 * 1024 * 1024

# The page is served over plain HTTP from an access point with no route to the
# internet, so the Google Fonts @import in tokens.css will simply fail on lab
# day. That is fine and expected -- the font stacks in tokens.css already fall
# back to Georgia / system-ui / Consolas -- but it must be a deliberate choice
# rather than a surprise, so the build says so out loud.
FONT_NOTE = (
    "tokens.css imports Instrument Serif + IBM Plex from Google Fonts.\n"
    "             On the Orange Pi hotspot there is no internet, so the page\n"
    "             falls back to Georgia / system-ui / Consolas. To ship the\n"
    "             real faces, download the woff2 files into src/vendor/ and\n"
    "             inline them as @font-face data URIs."
)

STANDALONE_HEAD = """<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Papan skor Perburuan LoRa IRIS - Modul 4 Part A.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2305060b'/%3E%3Ccircle cx='32' cy='32' r='5' fill='%2340b0ff'/%3E%3Ccircle cx='32' cy='32' r='13' stroke='%2340b0ff' stroke-width='1.6' fill='none' opacity='.6'/%3E%3Ccircle cx='32' cy='32' r='21' stroke='%2340b0ff' stroke-width='1.2' fill='none' opacity='.3'/%3E%3C/svg%3E">
<meta name="theme-color" content="#05060b">
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
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


def read_required(path, what):
    if not path.is_file():
        raise BuildError(f"Missing required source: {what} not found at {path}")
    text = path.read_text(encoding="utf-8")
    check_no_control_chars(text, what)
    return text


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
    sizes = [("src/shell.html", len(shell.encode("utf-8")))]

    # ---- styles ------------------------------------------------------
    styles = []
    for name in STYLE_FILES:
        text = read_required(STYLE_DIR / name, f"src/style/{name}")
        sizes.append((f"src/style/{name}", len(text.encode("utf-8"))))
        styles.append(f"/* ---- {name} ---- */\n{text}")

    if PLACEHOLDER_STYLE not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_STYLE} placeholder")
    shell = shell.replace(
        PLACEHOLDER_STYLE, "<style>\n" + "\n".join(styles) + "\n</style>", 1)

    # ---- scripts -----------------------------------------------------
    scripts = []
    for name in VENDOR_FILES:
        text = read_required(VENDOR_DIR / name, f"src/vendor/{name}")
        sizes.append((f"src/vendor/{name}", len(text.encode("utf-8"))))
        scripts.append(text)

    for name in SCRIPT_FILES:
        text = read_required(SRC_DIR / name, f"src/{name}")
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
        end = inner.find("</script>")
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
    stray = re.search(r"<(?:!doctype|html|head|body)", markup)
    if stray:
        raise BuildError(
            f"shell.html must not contain {stray.group(0)}; build.py supplies "
            "the document shell itself")

    output = wrap_standalone(shell)
    output_bytes = output.encode("utf-8")

    if len(output_bytes) > MAX_OUTPUT_BYTES:
        raise BuildError(
            f"output is {human_size(len(output_bytes))}, over the "
            f"{human_size(MAX_OUTPUT_BYTES)} limit")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(output_bytes)

    widest = max(len(name) for name, _ in sizes)
    for name, size in sizes:
        print(f"  {name.ljust(widest)}  {human_size(size)}")
    print()
    print(f"  wrote {OUTPUT_PATH} ({human_size(len(output_bytes))}, "
          f"{output.count(chr(10)) + 1:,} lines)")
    print()
    print(f"  NOTE: {FONT_NOTE}")


if __name__ == "__main__":
    try:
        main()
    except BuildError as err:
        print(f"\nBUILD FAILED: {err}", file=sys.stderr)
        sys.exit(1)
