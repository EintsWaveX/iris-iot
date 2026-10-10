"""Build the site's brand files: favicons, app icons, the nav logo and link preview cards

Sources are the lab logo (IRIS ASO's Module assets) and the nav mark already
in public/brand. Run from apps/web:
    python scripts/brand_assets.py [path/to/logo_iris.png]
"""
import base64
import io
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------- Paths and Palette ----------
# ---------- Paths and Palette ----------
# ---------- Paths and Palette ----------

WEB: Path        = Path(__file__).resolve().parent.parent
PUBLIC: Path     = WEB / "public"
FONTS: Path      = WEB / "node_modules" / "@fontsource"
LOGO_FULL: Path  = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "IRIS ASO" / "Module - IRIS IoT" / "assets" / "logo_iris.png"
LOGO_MARK: Path  = WEB / "scripts" / "assets" / "iris-logo-mark-src.png"

NIGHT: tuple[int, int, int] = (10, 12, 20)        # --nav-bg behind the dark theme
INK: tuple[int, int, int]   = (233, 238, 250)
MUTED: tuple[int, int, int] = (170, 182, 214)
MODULE: dict[int, tuple[int, int, int]] = {
    0: (76, 182, 255),
    1: (91, 181, 255),
    2: (165, 147, 255),
    3: (61, 219, 168),
    4: (255, 162, 76),
}

SITE: str = "iris-praktikum-jurnal.vercel.app"

COPY: dict[str, dict] = {
    "id": {
        "eyebrow": "PRAKTIKUM IOT · LABORATORIUM IRIS",
        "home":    ("Empat Modul. Satu Papan.", "Bluetooth, WebSocket, MQTT dan LoRa. Baca modul, kerjakan jurnal saat sesi, lihat data papanmu secara langsung."),
        "module":  "Modul",
        "titles":  ["", "Bluetooth Low Energy", "WebSocket", "MQTT", "LoRa"],
        "lines":   [
            "",
            "Central dan Peripheral bicara langsung lewat Bluetooth.",
            "Data sensor dikirim ke server Python lewat Wi-Fi lab.",
            "Pesan lewat broker di tengah, satu terbit, satu berlangganan.",
            "Berburu sinyal radio jarak jauh di seluruh gedung.",
        ],
        "foot":    "Telkom University · Fakultas Teknik Elektro",
    },
    "en": {
        "eyebrow": "IOT PRACTICUM · IRIS LABORATORY",
        "home":    ("Four Modules. One Board.", "Bluetooth, WebSocket, MQTT and LoRa. Read the modules, do the journal during your session, watch your board's data live."),
        "module":  "Module",
        "titles":  ["", "Bluetooth Low Energy", "WebSocket", "MQTT", "LoRa"],
        "lines":   [
            "",
            "A Central and a Peripheral talk directly over Bluetooth.",
            "Sensor data goes to a Python server over the lab Wi-Fi.",
            "Messages pass through a broker: one publishes, one subscribes.",
            "Hunting long range radio signals across the building.",
        ],
        "foot":    "Telkom University · School of Electrical Engineering",
    },
}

# ---------- Paths and Palette ----------
# ---------- Paths and Palette ----------
# ---------- Paths and Palette ----------


# ---------- Helpers ----------
# ---------- Helpers ----------
# ---------- Helpers ----------

def _font(family: str, weight: int, size: int) -> ImageFont.FreeTypeFont:
    """Load a fontsource Latin face at a pixel size"""
    return ImageFont.truetype(str(FONTS / family / "files" / f"{family}-latin-{weight}-normal.woff2"), size)


def _trim(image: Image.Image) -> Image.Image:
    """Crop transparent or near black borders off a logo"""
    rgba  = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] == 255:
        alpha = rgba.convert("L").point(lambda v: 255 if v > 24 else 0)
    box = alpha.getbbox()
    return rgba.crop(box) if box else rgba


def _cutout(image: Image.Image) -> Image.Image:
    """Turn a logo on black into the same logo on transparency"""
    rgba = image.convert("RGBA")
    luma = rgba.convert("L").point(lambda v: min(255, int(v * 1.6)))
    rgba.putalpha(luma)
    return rgba


def _fit(image: Image.Image, width: int, height: int) -> Image.Image:
    """Scale an image to fit a box, keeping its aspect"""
    copy = image.copy()
    copy.thumbnail((width, height), Image.LANCZOS)
    return copy


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """Break text into lines that fit a pixel width"""
    lines: list[str] = []
    line  = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def _sky(size: tuple[int, int], tone: tuple[int, int, int], seed: int) -> Image.Image:
    """Night background with a soft glow and a scatter of stars"""
    canvas = Image.new("RGB", size, NIGHT)
    glow   = Image.new("RGB", size, NIGHT)
    gd     = ImageDraw.Draw(glow)
    gd.ellipse((size[0] - 560, -300, size[0] + 260, 420), fill=tuple(int(c * 0.42) for c in tone))
    gd.ellipse((-260, size[1] - 180, 360, size[1] + 260), fill=(26, 22, 58))
    canvas = Image.blend(canvas, glow.filter(ImageFilter.GaussianBlur(140)), 0.9)

    rng  = random.Random(seed)
    draw = ImageDraw.Draw(canvas)
    for _ in range(140):
        x, y  = rng.randrange(size[0]), rng.randrange(size[1])
        level = rng.randrange(70, 200)
        r     = 1 if rng.random() < 0.85 else 2
        draw.ellipse((x, y, x + r, y + r), fill=(level, level, min(255, level + 30)))
    return canvas

# ---------- Helpers ----------
# ---------- Helpers ----------
# ---------- Helpers ----------


# ---------- Icons ----------
# ---------- Icons ----------
# ---------- Icons ----------

def build_icons(full: Image.Image) -> None:
    """Favicons and app icons from the cloud of the lab logo"""
    logo  = _trim(full)
    w, h  = logo.size
    cloud = _cutout(logo.crop((int(w * 0.56), 0, w, int(h * 0.62))))

    # The top of the S sits under the cloud's tail: clear it, keep the tail
    letter = Image.new("L", cloud.size, 0)
    ImageDraw.Draw(letter).rectangle((0, int(h * 0.455), int(w * 0.318), cloud.height), fill=255)
    cloud.putalpha(Image.composite(Image.new("L", cloud.size, 0), cloud.getchannel("A"), letter))
    cloud = _trim(cloud)

    def tile(size: int, pad: float, bg: tuple[int, int, int] | None) -> Image.Image:
        base  = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
        inner = _fit(cloud, int(size * (1 - 2 * pad)), int(size * (1 - 2 * pad)))
        base.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
        return base

    # Browser tabs: the cloud on a night tile reads on light and dark tabs alike
    tile(48, 0.08, NIGHT).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    tile(32, 0.08, NIGHT).save(PUBLIC / "favicon-32.png", optimize=True)

    small = tile(64, 0.08, NIGHT)
    data  = io.BytesIO()
    small.save(data, "PNG", optimize=True)
    encoded = base64.b64encode(data.getvalue()).decode()
    (PUBLIC / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
        f'<image width="64" height="64" href="data:image/png;base64,{encoded}"/></svg>\n',
        encoding="utf-8",
        newline="\n",
    )

    # Home screen and install icons: the full mark on the night colour
    mark = _cutout(_trim(full))
    for size, name, pad in ((180, "apple-touch-icon.png", 0.12), (192, "icons/icon-192.png", 0.12), (512, "icons/icon-512.png", 0.12), (512, "icons/icon-maskable-512.png", 0.22)):
        canvas = Image.new("RGBA", (size, size), NIGHT + (255,))
        inner  = _fit(mark, int(size * (1 - 2 * pad)), int(size * (1 - 2 * pad)))
        canvas.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
        out = PUBLIC / name
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(out, optimize=True)
        print(f"[INFO] {name}")


def build_nav_logo() -> None:
    """The nav mark at three times its 30px display height"""
    source = Image.open(LOGO_MARK if LOGO_MARK.exists() else PUBLIC / "brand" / "iris-logo-mark.png")
    if not LOGO_MARK.exists():
        source.save(LOGO_MARK)
    small = source.resize((round(source.width * 90 / source.height), 90), Image.LANCZOS)
    small.save(PUBLIC / "brand" / "iris-logo-mark.png", optimize=True)
    small.save(PUBLIC / "brand" / "iris-logo-mark.webp", quality=90, method=6)
    print(f"[INFO] brand/iris-logo-mark {small.size}")

# ---------- Icons ----------
# ---------- Icons ----------
# ---------- Icons ----------


# ---------- Link Preview Cards ----------
# ---------- Link Preview Cards ----------
# ---------- Link Preview Cards ----------

def build_card(lang: str, module: int) -> None:
    """One 1200x630 Open Graph card for the home page or a module"""
    copy   = COPY[lang]
    tone   = MODULE[module]
    canvas = _sky((1200, 630), tone, seed=module * 7 + len(lang))
    draw   = ImageDraw.Draw(canvas)

    mark = Image.open(PUBLIC / "brand" / "iris-logo-mark.png").convert("RGBA")
    mark = _fit(mark, 200, 64)
    canvas.paste(mark, (72, 64), mark)

    eyebrow = _font("plus-jakarta-sans", 800, 22)
    title   = _font("plus-jakarta-sans", 800, 76)
    kicker  = _font("plus-jakarta-sans", 700, 30)
    body    = _font("inter", 500, 30)
    foot    = _font("inter", 500, 22)

    y = 208
    draw.text((72, y), copy["eyebrow"], font=eyebrow, fill=tone)
    y += 48

    if module:
        draw.text((72, y), f"{copy['module']} {module}", font=kicker, fill=tone)
        y += 48
        heading, line = copy["titles"][module], copy["lines"][module]
    else:
        heading, line = copy["home"]

    for part in _wrap(draw, heading, title, 1050):
        draw.text((72, y), part, font=title, fill=INK)
        y += 86
    y += 12
    for part in _wrap(draw, line, body, 960)[:3]:
        draw.text((72, y), part, font=body, fill=MUTED)
        y += 42

    draw.line((72, 548, 1128, 548), fill=(40, 46, 70), width=2)
    draw.text((72, 566), copy["foot"], font=foot, fill=MUTED)
    draw.text((1128 - draw.textlength(SITE, font=foot), 566), SITE, font=foot, fill=tone)

    out = PUBLIC / "og" / f"{lang}-{'home' if not module else f'modul-{module}'}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    print(f"[INFO] {out.relative_to(PUBLIC)}")

# ---------- Link Preview Cards ----------
# ---------- Link Preview Cards ----------
# ---------- Link Preview Cards ----------


if __name__ == "__main__":
    full = Image.open(LOGO_FULL)
    build_icons(full)
    build_nav_logo()
    for lang in COPY:
        for module in range(5):
            build_card(lang, module)
    print("[STATUS] brand files written")
