#!/usr/bin/env python3
"""
The Mandarin typeface, cut down to the characters the hunt actually says.

The full Noto Sans SC is 17 MB; the page is one file served from the Pi to
twenty-five phones over one hotspot. So this keeps only the CJK characters
and full-width punctuation that appear in src/i18n/zh.json and in the few
Mandarin strings written straight into the scripts, at two weights (400 for
text, 700 for headings), as woff2.

    pip install fonttools brotli
    python tools/subset_cjk.py <NotoSansSC[wght].ttf>

The variable font comes from github.com/google/fonts (ofl/notosanssc), under
the SIL Open Font License. Run this again whenever zh.json gains a
character: build.py compares the strings against src/fonts/cjk-chars.txt
(written here) and refuses to build when one is missing from the subset.

This is a development tool. build.py itself stays stdlib only.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
FONTS = HERE / "src" / "fonts"
CHARS = FONTS / "cjk-chars.txt"


def is_cjk(ch: str) -> bool:
    o = ord(ch)
    return (0x3000 <= o <= 0x303F or 0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF
            or 0xF900 <= o <= 0xFAFF or 0xFF00 <= o <= 0xFFEF)


def needed() -> str:
    """Every CJK character the hunt can show, sorted, as one string."""
    text = (HERE / "src" / "i18n" / "zh.json").read_text(encoding="utf-8")
    for path in (HERE / "src").glob("*.js"):
        text += path.read_text(encoding="utf-8")
    # Weekdays and the date pattern, built in kit.js from these pieces.
    text += "年月日星期一二三四五六日"
    return "".join(sorted({c for c in text if is_cjk(c)}))


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    chars = needed()
    FONTS.mkdir(parents=True, exist_ok=True)
    for weight in (400, 700):
        font = TTFont(sys.argv[1])
        font = instancer.instantiateVariableFont(font, {"wght": weight})
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        # Latin and digits stay in Inter; only the CJK range is kept here.
        sub.populate(text=chars)
        sub.subset(font)
        out = FONTS / f"noto-sans-sc-hunt-{weight}.woff2"
        font.flavor = "woff2"
        font.save(out)
        print(f"wrote {out.relative_to(HERE)} ({out.stat().st_size:,} bytes)")
    CHARS.write_text(chars + "\n", encoding="utf-8")
    print(f"{len(chars)} characters -> {CHARS.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
