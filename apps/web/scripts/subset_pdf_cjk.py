#!/usr/bin/env python3
"""
The font Mandarin PDF exports draw with (Reports › Export PDF).

pdf-lib needs a TrueType font that holds every glyph a PDF uses; the full
Noto Sans SC is 17 MB. This keeps Latin (ASCII, Latin-1, Latin Extended-A,
general punctuation) and only the CJK characters the app's own source
says, at weight 400, and writes:

    public/fonts/pdf-sc.ttf        the subset, loaded only on a Mandarin export
    public/fonts/pdf-sc.chars.txt  the CJK characters it covers

    pip install fonttools
    python scripts/subset_pdf_cjk.py <NotoSansSC[wght].ttf>

The variable font comes from github.com/google/fonts (ofl/notosanssc),
under the SIL Open Font License. Run it again when Mandarin strings gain a
character: src/lib/__tests__/pdf-font.test.ts fails until the subset
covers them.
"""

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

WEB = Path(__file__).resolve().parent.parent
OUT = WEB / "public" / "fonts"
CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯]")


def cjk_chars() -> str:
    found: set[str] = set()
    for p in (WEB / "src").rglob("*"):
        if p.suffix in {".ts", ".tsx", ".astro"} and p.is_file():
            found.update(CJK.findall(p.read_text(encoding="utf-8")))
    return "".join(sorted(found))


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    chars = cjk_chars()
    font = TTFont(sys.argv[1])
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": 400})
    unicodes = set(range(0x20, 0x7F)) | set(range(0xA0, 0x180)) | set(range(0x2010, 0x2070))
    unicodes |= {ord(c) for c in chars}
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    font.save(OUT / "pdf-sc.ttf")
    (OUT / "pdf-sc.chars.txt").write_text(chars, encoding="utf-8")
    print(f"pdf-sc.ttf: {len(chars)} CJK characters, {(OUT / 'pdf-sc.ttf').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
