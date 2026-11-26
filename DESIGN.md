---
name: IRIS IoT Practicum (Ground Station)
description: Dark-first, sky-backed practicum web app where every reading is a mono number on a solid surface and structure comes from hairlines, not stacked boxes.
colors:
  void: "#05060b"
  bg: "#0a0c14"
  bg-elevated: "#181c2c"
  surface-1: "#10131f"
  surface-2: "#161a2b"
  surface-3: "#1d2238"
  surface-4: "#262c47"
  text: "#eef1f6"
  text-muted: "#b0b8c8"
  text-faint: "#98a1b3"
  accent: "#40b0ff"
  accent-bright: "#8ed0ff"
  accent-ink: "#04121d"
  danger: "#ff6b6b"
  violet: "#b9a2ff"
  teal: "#7ff0e0"
  group-mint: "#5eead4"
  group-violet: "#a78bfa"
  group-rose: "#fb7185"
  group-amber: "#f59e6a"
  group-ice: "#7dd3fc"
  mod-ble: "#6cc4ff"
  mod-websocket: "#a39cff"
  mod-mqtt: "#5fe0b0"
  mod-lora: "#ffad6b"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "clamp(2.3rem, 6.4vw, 4.4rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "1.28rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  figure:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    height: "48px"
  button-primary-large:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    height: "60px"
  button-base:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "48px"
  panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  panel-raised:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: IRIS IoT Practicum (Ground Station)

> Captured from the shipped code on 16 Nov 2026 (tokens in `packages/kosmik/style/tokens.css` and `apps/web/src/styles/theme.css`, narrative in `docs/design-system.md`). The frontmatter shows the **dark** theme, which is the default. The light theme ("Daylight sky") re-tints the same token names under `:root[data-theme="light"]`; read the real values from `theme.css`, never from this file, when you need them. Qualitative wording below is derived from `docs/design-system.md` and the Home redesign spec, not newly invented.

## Overview

**Creative North Star: "The Ground Station"**

A ground station tracks a signal across distance and the number that matters is the gap between two timestamps. All four practicum modules (BLE, WebSocket, MQTT, LoRa) are exactly that exercise, so the whole interface is built like an instrument panel under a real sky: calm, precise, a little cinematic, never decorative for its own sake. The sky is there because the subject is signal and distance.

The look is dark-first with a pastel "Daylight sky" twin. Surfaces are solid and slightly raised off the ground; the sky, clouds and stars live only in the gaps between them. Colour carries identity (a group, a module) and state (ok, warn, danger), always together with a written name or a number. The voice is casual Indonesian with common English tech terms (array, input, output), and Mandarin as the third language.

**Key Characteristics:**
- Solid surfaces over a living sky; the sky never sits under a figure, a timestamp or a table.
- Every figure, time and identifier is monospaced and tabular.
- One accent (`#40b0ff`) plus identity hues (ten groups, four modules); a rainbow sweep is used only as a thin decorative ring or edge.
- Structure from hairlines and space; a card is a genuinely contained thing.
- Laptop-first density, designed per breakpoint, checked in both themes and all three languages.

## Colors

A cold, deep-space ground (`#0a0c14`) with raised navy-violet surfaces, one electric sky-blue accent, and a small set of pastel identity hues that stay readable on both grounds.

### Primary
- **Signal Blue** (`#40b0ff`): the single accent. Primary button fill, active states, the live sky's key stars. `--accent-ink` (`#04121d`) is the fixed dark label colour for anything painted on a solid accent fill or on `--sweep-surface`. In the light theme text-use of the accent becomes `--accent-bright` (`#075b9f`).
- **Bright Signal** (`#8ed0ff`): eyebrows, links and small accent text on dark grounds.

### Secondary
- **Module hues** `--mod-1..4` (`#6cc4ff` BLE, `#a39cff` WebSocket, `#5fe0b0` MQTT, `#ffad6b` LoRa), each with a `-soft` 14% tint for tile and pill backgrounds. They identify a module and are always paired with its name ("Modul 3").
- **Group hues** `--group-1..10` (mint `#5eead4`, violet `#a78bfa`, rose `#fb7185`, amber `#f59e6a`, ice `#7dd3fc`, then lime, pink, yellow, periwinkle, orchid). Identify a group, always next to "Kelompok N". Each has a darker twin in the light theme.

### Neutral
- **Void** (`#05060b`) and **Ground** (`#0a0c14`): the floor behind the starfield and the page ground.
- **Surfaces 1 to 4** (`#10131f`, `#161a2b`, `#1d2238`, `#262c47`) and **Elevated** (`#181c2c`): the solid surfaces (Low Detail and Normal turn the translucent glass tokens into near-opaque plates of the same tint), one luminance step apart.
- **Ink** (`#eef1f6`), **Muted** (`#b0b8c8`), **Faint** (`#98a1b3`): text, secondary labels, the faintest allowed text. All hold at least 4.5:1 on every surface they sit on.
- **Hairlines** (`rgba(205,220,255,.11 / .22 / .38)` dark; navy `rgba(16,34,70,.1 / .2 / .36)` light): borders and dividers. `--control-border` (.4 / .5) for inputs.
- **Status hues**: ok mint, warn amber, danger `#ff6b6b` (light `#c4242f`), plus violet, teal, orange, red, yellow, each with a `-soft` tint.

### Named Rules
**The Two Gradients Rule.** `--sweep` and `--sweep-ring` are decorative only (1px rings, the active nav underline). Anything that passes under text uses `--sweep-surface`, whose every stop is light enough for `--accent-ink`. `contrast.test.ts` enforces it.

**The Never Hue Alone Rule.** A delay, a group, a module or a status is always a number or a name too. A colour may tint a reading, never replace it.

**The Nebula Is Background Rule.** `--neb-*` tokens never carry text and never appear in a text-bearing gradient.

## Typography

**Display Font:** Plus Jakarta Sans (with Inter, system-ui)
**Body Font:** Inter (with system-ui)
**Mono Font:** JetBrains Mono (every figure, timestamp, code and identifier)
**CJK:** Noto Sans SC, chained after the Latin face; Mandarin headings default to weight 700 (500 selectable).

**Character:** Plus Jakarta's heavy, tightly tracked geometry gives headings an instrument-label confidence; Inter stays out of the way for reading; mono makes every number subtractable. All self-hosted, so first paint never waits on a third party.

### Hierarchy
- **Display** (700, `clamp(32px, 5vw, 64px)`, tracking -0.025em): hero lines such as "Laboratorium IRIS". It was 73.6px at 800 until Nov 2026.
- **Section band heading** (700, `clamp(1.75rem, 1.3rem + 1.5vw, 2.75rem)`): the one heading every section starts with (`SectionBand`).
- **Headline** (800, 1.7rem): page and major card titles (`.home__h1`).
- **Title** (800, 1.28rem): card and section titles (`.home__h2`).
- **Body** (400 to 500, 1rem, line-height about 1.55): prose, bounded to `--measure-prose` (68ch).
- **Label / Eyebrow** (700, 0.8rem, +0.12em, uppercase, `--accent-bright`): section eyebrows and badge text.
- **Figure** (mono 500): every number and time, tabular.
- The root size is fluid (`clamp(87.5%, 82.5% + .21vw, 100%)`); type, tabs and buttons step down below 1280px and again below 640px.

### Named Rules
**The Subtractable Rule.** If it can be compared or subtracted, it is mono and tabular.

## Layout

**The column (layout kit, Nov 2026, `src/styles/layout.css`).** Readable content never gets wider than `--col` (1360px) however big the monitor, inside a gutter `--gutter: clamp(16px, 3.4vw, 56px)`. A page opts in with `.page-col`. Sections are 56px apart on a phone and up to 112px (`--sec-gap`) on a laptop. Every section starts with a `SectionBand` (eyebrow, heading, one line of sub, optional action), the full width of the column. Home, Modul list and detail, Dasbor, Akun and the Asisten console pages (Grading, Persiapan, Jadwal, Tim, Server, Laporan, Kelola TP, Profil Lab, Mode TOT) use the column. Two things stay on `--container-wide` (1640px) on purpose: the Session page (its running board, matrix and score table have not been checked at 1360px) and the Oprec views (the interview board needs about 1040px inside its own scroller and gets 1002px at 1360, measured 21 Nov 2026). `--container-narrow` (820px) stays for forms and the sign-in card.

Spacing is a 4px-base scale (`--space-1..11`). The top navbar is 64px; below 640px links move to a bottom tab bar. Extra width goes to data and side panels, never to longer prose lines.

Every screen is designed per breakpoint (360, 390, 820, 1024, 1280x720, 1280, 1680), checked in dark and light, in Indonesian, English and Mandarin, and must still work with ten groups.

### Home (Nov 2026)
Full anatomy and the measurements it came from: `docs/design/home-anatomy.md`.
- **Visitor:** recruitment banner, hero (the painted sky, four stat plates round the logo, title, lede, two buttons; at most `min(100svh - nav, 760px)` tall), Tentang Kami, Filosofi Logo, Siapa Kami (six division cards), Jejak Kami (events), then a closing "Mulai praktikum" band with the same two buttons and the next event before the footer.
- **Signed in:** banner, the Observatory (greeting and role card on the left, the Langit Lab pane), the four-module Rasi row under a `SectionBand`, then the same profile sections.
- **Rule:** merge before adding. A new layer earns its place by replacing an old card.

## Elevation & Depth

Hybrid: tonal layering first, soft shadow second. The sky behind the app always moves, and a blurred backdrop is re-sampled on every frame it changes, so the glass look is made of tint, a highlight edge and a shadow, not of blur (measured Nov 2026: 26 blurred elements on Home cost 12 fps idle and 16 fps scrolling at High Detail).

| Detail level | Surfaces |
|---|---|
| Low Detail, Normal | Plates: the glass tokens (`--glass-panel`, `--glass-frost`, `--glass-clear`, `--nav-bg`) are near-opaque (alpha 0.86 and up). No `backdrop-filter` anywhere. |
| High Detail | The same plates, plus a real backdrop blur on a short allowlist only: the navbar and phone bottom bar (`.appnav`, `.appbar`), an open dialog, drawer or menu (`.dialog__panel`, `.drawer`, `.popover__panel`) and the page heading (`.page-header`). Chrome has never blurred the navbar (see `plates.css`) and it stays off there. |

`src/styles/plates.css` decides this by selector and loads last; `blur-diet.test.ts` fails on any other blur declaration.

### Shadow Vocabulary
- **Panel** (`--shadow-panel`, dark: `0 1px 0 rgba(255,255,255,.05) inset, 0 18px 48px rgba(0,0,0,.5)`; light: `0 1px 2px rgba(16,34,70,.08), 0 12px 32px rgba(16,34,70,.1)`): resting cards.
- **Lift** (`--shadow-lift`): hover and popovers. Movement is `--lift-control` (translateY -2px) for controls and `--lift-card` (-4px) for cards.

### Named Rules
**The Plate Rule.** Text never sits straight on the painted sky: it sits on a plate (a card, a band, a stat plate). A plate may carry a tint but must stay readable with the sky behind it at 4.5:1. Blur is a High Detail extra on the allowlist above, never what makes a plate readable.

## Shapes

One radius scale (`layout.css` maps the shared kosmik tokens onto it for the whole app): **16px** for cards, bands, dialogs and popovers (`--r-card`, also `--radius-lg` and `--radius-xl`), **12px** for buttons, tabs, inputs and other controls (`--r-ctl`, also `--radius-md`), **999px** for pills, chips and badges (`--r-pill`), 6px (`--radius-sm`) only for the smallest tags. It was 20px on everything. One bright hairline border on every card. A rainbow `--sweep` hairline edge marks the single key card per screen. Constellation line art (dashed links, ring halos) is the recurring silhouette of the product.

## Components

### Buttons (`.btn`)
- **Shape:** 12px radius; heights `--sm` 44px, base 48px, `--lg` 60px.
- **Primary:** `--accent` fill with `--accent-ink` label; at most one per view. The `--sweep-surface` gradient sweeps across the fill on hover.
- **Inverse:** the key action on a key card: dark, then bright with dark text.
- **Base / Ghost:** surface fill with a bright border and a rainbow ring sweep on hover; ghost for Cancel and Close.
- **Danger:** solid red, dark ink, no ring, always asked first.
- **Hover / Focus:** lift `translateY(-2px)`; focus uses the single non-animated `--glow-ring` (dark) or `--focus-ring` (light).

### Cards / Containers (`.panel`)
- **Corner:** 16px. **Background:** `--surface-1` (raised: `--surface-2`). **Border:** one bright hairline.
- **Variants:** `--key` adds the rainbow top edge, `--tight`, `--flush`. `.panel__actions` pins buttons to the card bottom so neighbouring cards line up.

### Badges (`.pill`)
- Always upper case, bright edge, a tone (ok, warn, danger, accent, gold, violet, teal, or a group or module hue). Codes and identifiers keep their own case.

### Navigation (`AppNav`)
- Sticky plate bar, 64px (glass tint; real blur only at High Detail, and not in Chrome); links start after the logo, then the clock, command palette (from 1100px), Tampilan and account. Active link has a `--sweep` underline. Below 640px: bottom tab bar with icons.

### Fields and overlays
- No native widgets: `Dropdown`, `DateField`, `TimeField`, `Disclose`, `Tooltip`. Drawers 1/3, 1/2 or 2/3 wide; dialogs sm (confirm), md (small form), lg (fuller form). Every overlay animates in and out; Esc closes the top layer only.

### Langit Lab (signature)
- A sky panel where each group is a star: core size and brightness scale with correct blanks, a spinning dashed ring marks the viewer's own group, dashed lines join stars, labels read "{n} · {name}". Behind it the running module's constellation sits at about 32% opacity. Quiet state: four mini constellations and one line of copy.

## Do's and Don'ts

### Do:
- **Do** set every timestamp, delay and count in `--font-mono` and state it as a number.
- **Do** use tokens only (`var(--surface-1)`, `var(--mod-3)`), so both themes work; check 4.5:1 text and 3:1 UI edges in each.
- **Do** pair every group or module colour with its written name ("Kelompok 3", "Modul 4").
- **Do** keep one primary action per view and put it where the 1280x600 first screen shows it.
- **Do** write Title Case for headers, tabs and buttons; casual Indonesian copy; full names as "Full Name (CODE)".
- **Do** honour reduced motion and Low Detail; gate motion with `:root:not([data-motion-tier="0"])`.

### Don't:
- **Don't** put `--sweep-ring` or any `--neb-*` colour under text.
- **Don't** use em or en dashes, abbreviations ("K3", "M4", "mnt"), or native `<select>`, date inputs, `<details>` or `title` tooltips.
- **Don't** animate anything behind a reading, or add a `backdrop-filter` outside the High Detail allowlist (`blur-diet.test.ts` fails).
- **Don't** stack bordered boxes to separate sections of one page; use a hairline and space.
- **Don't** add a feature or tab without removing or merging an old one.
