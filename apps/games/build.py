#!/usr/bin/env python3
"""
Build script for Arena Asisten IRIS.

Assembles games/index.html from the pieces in games/src/ plus
games/logo.b64.txt. Runnable as:

    python games/build.py                  (from the project root)
    python build.py                        (from inside games/)
    python games/build.py --allow-missing  (build even if JS sources
                                             from the other agent haven't
                                             landed yet)

All paths are resolved relative to this script's own location, not the
current working directory, so it works from either place.
"""

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR / "src"
OUTPUT_PATH = SCRIPT_DIR / "index.html"
STANDALONE_OUTPUT_PATH = SCRIPT_DIR / "public" / "index.html"

# The Artifact platform wraps the page in its own <!doctype>/<head>/<body>
# and supplies a small reset. Vercel does not -- it serves the file verbatim,
# so a file with no doctype renders in QUIRKS MODE and the layout breaks in
# ways that are painful to debug. --standalone therefore supplies an
# equivalent document shell itself. Keep this reset in step with the platform's
# (charset, viewport, color-scheme, zero body margin, responsive images, and a
# [hidden] rule that actually wins).
#
# The site is deliberately DARK-ONLY -- the cosmic identity is a night sky and
# there is no light counterpart -- so color-scheme is pinned rather than
# offered as "light dark".
STANDALONE_HEAD = """<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Arena turnamen game asisten IRIS.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2305060b'/%3E%3Cpath d='M16 40 28 20 44 30 50 16' stroke='%2340b0ff' stroke-width='1.5' fill='none' opacity='.55'/%3E%3Ccircle cx='16' cy='40' r='2.5' fill='%2340b0ff'/%3E%3Ccircle cx='28' cy='20' r='3.5' fill='%23e8b64d'/%3E%3Ccircle cx='44' cy='30' r='2.5' fill='%2340b0ff'/%3E%3Ccircle cx='50' cy='16' r='2' fill='%2340b0ff'/%3E%3Ccircle cx='38' cy='48' r='1.5' fill='%23fff' opacity='.6'/%3E%3Ccircle cx='22' cy='52' r='1' fill='%23fff' opacity='.4'/%3E%3C/svg%3E">
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

SHELL_PATH = SRC_DIR / "shell.html"
STYLE_DIR = SRC_DIR / "style"
VENDOR_DIR = SRC_DIR / "vendor"
LOGO_PATH = SCRIPT_DIR / "logo.b64.txt"

# The shared design system, split out to Documents/WebApps/iris-iot's
# packages/kosmik/ so apps/web can use the same tokens, base primitives,
# cosmos background and motion layer without copy-pasting them. Vite
# resolves this for apps/web via a workspace dependency; this plain build
# script resolves it as a relative filesystem path instead, since it has no
# package resolution of its own.
KOSMIK_DIR = SCRIPT_DIR.parent.parent / "packages" / "kosmik"
KOSMIK_STYLE_DIR = KOSMIK_DIR / "style"
KOSMIK_JS_DIR = KOSMIK_DIR / "js"

# Concatenated in this order into a single <style>. Order IS the cascade, so
# tokens must come first and the responsive/override layer last. Each entry
# is (base_dir, filename) rather than a bare filename, since sources now
# come from two places -- packages/kosmik/style/ for the shared design
# language, src/style/ for what stays local to this app -- while the
# original cascade order is preserved exactly:
#   tokens (kosmik) -> tokens-override (local: re-pins body/mono to IBM
#     Plex, see that file's own header) -> base (kosmik) -> app-shell
#     (local: the #app/.screens SPA-shell rules extracted from base.css
#     when the rest of it moved to kosmik) -> cosmos (kosmik) -> components,
#     screens (local) -> motion (kosmik) -> responsive (local)
STYLE_FILES = [
    (KOSMIK_STYLE_DIR, "tokens.css"),
    (STYLE_DIR, "tokens-override.css"),
    (KOSMIK_STYLE_DIR, "base.css"),
    (STYLE_DIR, "app-shell.css"),
    (KOSMIK_STYLE_DIR, "cosmos.css"),
    (STYLE_DIR, "components.css"),
    (STYLE_DIR, "screens.css"),
    (KOSMIK_STYLE_DIR, "motion.css"),
    (STYLE_DIR, "responsive.css"),
]

# Third-party libraries, vendored as pre-built browser bundles so the page
# stays a single self-contained file with no CDN dependency (the Artifact
# target's CSP would block most hosts anyway, and 25 phones on venue wifi
# should not each be resolving five extra origins). Each defines a global and
# ends in a semicolon; provenance is recorded in src/vendor/README.md.
VENDOR_FILES = [
    "gsap.min.js",            # window.gsap  - timeline/tween engine
    "CustomEase.min.js",      # window.CustomEase
    "SplitText.min.js",       # window.SplitText
    "DrawSVGPlugin.min.js",   # window.DrawSVGPlugin
    "confetti.browser.js",    # window.confetti
]

# Order matters: data/engine have no dependencies, motion wraps gsap, cosmos
# needs motion's shared ticker, the ui-* modules need store, and app.js wires
# everything together last. motion.core.js/cosmos.core.js now live in
# packages/kosmik/js/ (see KOSMIK_JS_DIR above); both stay plain scripts
# assigning window.Motion/window.Cosmos rather than becoming real ES
# modules, specifically so they still concatenate safely into one inlined
# <script> here -- a bare `export` in the middle of that bundle would be a
# syntax error. apps/web imports the same two files through one-line ESM
# wrappers that Vite bundles instead.
SCRIPT_FILES = [
    (SRC_DIR, "data.js"),
    (SRC_DIR, "engine.js"),
    (KOSMIK_JS_DIR, "motion.core.js"),
    (KOSMIK_JS_DIR, "cosmos.core.js"),
    (SRC_DIR, "store.js"),
    (SRC_DIR, "ui-roster.js"),
    (SRC_DIR, "ui-game.js"),
    (SRC_DIR, "ui-board.js"),
    (SRC_DIR, "ui-rules.js"),
    (SRC_DIR, "ui-champion.js"),
    (SRC_DIR, "ui-stage.js"),
    (SRC_DIR, "app.js"),
]

PLACEHOLDER_STYLE = "<!--STYLE-->"
PLACEHOLDER_LOGO = "<!--LOGO-->"
PLACEHOLDER_SCRIPT = "<!--SCRIPT-->"

MAX_OUTPUT_BYTES = 16 * 1024 * 1024  # 16MB


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


# Tab, newline and carriage return are the only control characters a source
# in this project has any business containing.
_ALLOWED_CONTROLS = frozenset("\t\n\r")

# U+FFFD is not a control character, but it is never legitimate here either:
# it means some earlier step already lost the original byte, so whatever it
# stands for is damage that has been baked in rather than a character anyone
# typed. Built with chr() rather than written literally or as a string escape,
# so this file stays pure ASCII and cannot be tripped up by the same encoding
# accident it exists to catch.
_REPLACEMENT_CHAR = chr(0xFFFD)


def check_no_control_chars(text, what):
    """
    Reject stray control characters in a source file.

    A NUL byte reached production through this build once: a CSS escape was
    mangled into a literal \\x00 on its way into the file, the browser parsed
    it as U+FFFD, and the separator it was supposed to draw shipped to every
    spectator as a replacement character. Nothing downstream noticed -- the
    build succeeded, both test suites passed, and the byte only surfaced when
    someone looked at the deployed page.

    Checked per source file rather than on the concatenated bundle so the
    error names the file and the line, which is the difference between a
    one-line fix and a search through 400KB of output.
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
        label = "replacement character" if char == _REPLACEMENT_CHAR else "control character"
        raise BuildError(
            f"{what}: {label} U+{code:04X} at line {line}, column {column}. "
            "This is almost always a mangled escape rather than anything "
            "intentional -- write the literal character instead of spelling "
            "it in hex."
        )


def read_required(path, what):
    if not path.is_file():
        raise BuildError(f"Missing required source: {what} not found at {path}")
    text = path.read_text(encoding="utf-8")
    check_no_control_chars(text, what)
    return text


def wrap_standalone(inner):
    """Wrap the Artifact-style fragment in a real HTML document.

    The fragment is `<title>` then `<style>` then markup then `<script>`.
    A browser tolerates a stray <style> in the body but moves or drops a
    <title> found there, so both are lifted into a proper <head> rather
    than dumped into the body wholesale.
    """
    rest = inner
    title_match = re.match(r"\s*(<title>.*?</title>)\s*", rest, re.DOTALL | re.IGNORECASE)
    if not title_match:
        raise BuildError("standalone: could not find a leading <title> in the built fragment")
    title = title_match.group(1)
    rest = rest[title_match.end():]

    style_match = re.match(r"\s*(<style>.*?</style>)\s*", rest, re.DOTALL | re.IGNORECASE)
    if not style_match:
        raise BuildError("standalone: could not find the <style> block after <title>")
    style = style_match.group(1)
    body = rest[style_match.end():]

    return STANDALONE_HEAD + title + "\n" + style + "\n</head>\n<body>\n" + body + STANDALONE_TAIL


def main():
    allow_missing = "--allow-missing" in sys.argv[1:]
    standalone = "--standalone" in sys.argv[1:]

    print(f"Arena Asisten IRIS build")
    print(f"  script dir : {SCRIPT_DIR}")
    print(f"  src dir    : {SRC_DIR}")
    print(f"  output     : {STANDALONE_OUTPUT_PATH if standalone else OUTPUT_PATH}")
    print(f"  target     : {'standalone (Vercel)' if standalone else 'artifact fragment'}")
    print(f"  mode       : {'allow-missing' if allow_missing else 'strict'}")
    print()

    # ---- read shell -------------------------------------------------
    shell = read_required(SHELL_PATH, "src/shell.html")
    sizes = [("src/shell.html", len(shell.encode("utf-8")))]

    # ---- style --------------------------------------------------------
    # @import must be the first thing in a stylesheet or the browser drops
    # it silently -- no error, no warning a build script would ever see,
    # just a font that quietly never loads. That is exactly what happened
    # here: tokens-override.css's own @import (for IBM Plex, once
    # tokens.css's @import moved to Inter) landed after tokens.css's rules
    # in the concatenated output, and apps/games rendered in a system
    # sans-serif fallback instead of IBM Plex for a full build cycle before
    # a real browser check caught it. Every @import line is hoisted to the
    # very top of the combined stylesheet, in source order, regardless of
    # which file it came from, so a style file can carry its own @import
    # without knowing or caring where the concatenation puts it.
    import_re = re.compile(r'^\s*@import\b.*;\s*$', re.MULTILINE)

    style_parts = []
    hoisted_imports = []
    for base_dir, filename in STYLE_FILES:
        path = base_dir / filename
        label = str(path.relative_to(SCRIPT_DIR.parent.parent))
        content = read_required(path, label)
        sizes.append((label, len(content.encode("utf-8"))))
        imports = import_re.findall(content)
        hoisted_imports.extend(imports)
        content = import_re.sub("", content, count=len(imports))
        style_parts.append(f"/* ==== {filename} ==== */\n{content}")
    style_css = "\n".join(hoisted_imports) + "\n" + "\n".join(style_parts)

    if PLACEHOLDER_STYLE not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_STYLE} placeholder")
    shell = shell.replace(PLACEHOLDER_STYLE, f"<style>{style_css}</style>", 1)

    # ---- logo -----------------------------------------------------------
    logo_data = read_required(LOGO_PATH, "logo.b64.txt").strip()
    sizes.append(("logo.b64.txt", len(logo_data.encode("utf-8"))))

    if not logo_data.startswith("data:image/"):
        raise BuildError(
            "logo.b64.txt does not look like a data URI "
            "(expected it to start with 'data:image/')"
        )

    if PLACEHOLDER_LOGO not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_LOGO} placeholder")
    shell = shell.replace(PLACEHOLDER_LOGO, logo_data, 1)

    # ---- scripts ----------------------------------------------------
    script_parts = []

    for filename in VENDOR_FILES:
        path = VENDOR_DIR / filename
        content = read_required(path, "src/vendor/" + filename)
        sizes.append(("src/vendor/" + filename, len(content.encode("utf-8"))))
        script_parts.append(f"/* ---- vendor/{filename} ---- */\n{content}")

    missing_files = []
    for base_dir, filename in SCRIPT_FILES:
        path = base_dir / filename
        label = str(path.relative_to(SCRIPT_DIR.parent.parent))
        if not path.is_file():
            missing_files.append(label)
            if allow_missing:
                script_parts.append(f"/* ---- {filename} ---- */\n/* MISSING: omitted via --allow-missing */")
                sizes.append((label, 0))
                continue
            else:
                raise BuildError(
                    f"Missing required source: {label} not found at {path}\n"
                    f"  (pass --allow-missing to build anyway while other sources "
                    f"are still being written)"
                )
        content = path.read_text(encoding="utf-8")
        sizes.append((label, len(content.encode("utf-8"))))
        script_parts.append(f"/* ---- {filename} ---- */\n{content}")

    if missing_files and allow_missing:
        print(f"  NOTE: building with missing sources omitted: {', '.join(missing_files)}")
        print()

    # Joined with an explicit empty statement so a minified vendor bundle can
    # never run headlong into the next file via automatic semicolon insertion.
    script_bundle = "\n;\n".join(script_parts)

    # A source carrying this literal would terminate the inlined <script>
    # early and dump the rest of the bundle into the page as visible text.
    # Checked on the bundle alone -- the finished output legitimately ends
    # with the closing tag this function writes.
    if "</script" in script_bundle.lower():
        raise BuildError(
            "A source contains '</script' -- inlining it would close the script "
            "tag early. Check src/vendor/ and the src/*.js sources."
        )

    if PLACEHOLDER_SCRIPT not in shell:
        raise BuildError(f"shell.html is missing the {PLACEHOLDER_SCRIPT} placeholder")
    shell = shell.replace(PLACEHOLDER_SCRIPT, f"<script>{script_bundle}</script>", 1)

    output = shell

    # ---- validation ---------------------------------------------------
    # shell.html must never carry document tags of its own, in EITHER target:
    # the Artifact platform supplies them, and --standalone adds its own below.
    lowered = output.lower()
    for forbidden in ("<!doctype", "<html", "<head", "<body"):
        if forbidden in lowered:
            raise BuildError(
                f"Output contains forbidden tag '{forbidden}' -- the document "
                f"shell is supplied by the platform (or by --standalone); "
                f"shell.html must not include it."
            )

    for token in (PLACEHOLDER_STYLE, PLACEHOLDER_LOGO, PLACEHOLDER_SCRIPT):
        if token in output:
            raise BuildError(f"Placeholder {token} survived substitution unsubstituted")

    if standalone:
        output = wrap_standalone(output)
        target_path = STANDALONE_OUTPUT_PATH
        target_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        target_path = OUTPUT_PATH

    output_bytes = output.encode("utf-8")
    if len(output_bytes) > MAX_OUTPUT_BYTES:
        raise BuildError(
            f"Output size {human_size(len(output_bytes))} exceeds the 16MB Artifact limit"
        )

    target_path.write_text(output, encoding="utf-8", newline="\n")

    # ---- summary --------------------------------------------------------
    print("Size summary:")
    for name, size in sizes:
        print(f"  {name:<28} {human_size(size):>10}")
    print(f"  {'TOTAL (output)':<28} {human_size(len(output_bytes)):>10}")
    print()
    print(f"Wrote {target_path} ({human_size(len(output_bytes))})")

    if missing_files:
        print()
        print(f"WARNING: built with {len(missing_files)} missing source(s) omitted "
              f"via --allow-missing: {', '.join(missing_files)}")
        print("This output is NOT the final deliverable -- rebuild once those land.")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BuildError as exc:
        print(f"\nBUILD FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
