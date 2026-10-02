# The ground station

The IRIS IoT practicum design system.

---

## 1. The reference

A ground station tracks a signal across distance: a message leaves one place,
arrives at another, and the number that matters is the gap between the two
timestamps. That is not a metaphor bolted onto the site after the fact, it is
what all four practicum modules already are. BLE, WebSocket, MQTT and LoRa
each send a message from one board to another and print a real wall-clock
timestamp on both ends, because latency is the pedagogical point of the
course, not an incidental detail.

The cosmic identity earns its place because deep-space telemetry is the one
domain where propagation delay is the headline number on the screen. The sky
behind this site is there because the subject is signal and distance, not
because dark mode with stars looks good. Everything below is what follows
from taking that seriously.

---

## 2. What follows from it

These are the rules. Everything in section 3 onward is an implementation of
them.

**Every module view is built around one ladder diagram.** A sender rail, a
receiver rail, an arrow carrying a timestamp at each end and the delta in the
middle. One component serves all four modules, live and in review, because
all four modules are the same exercise underneath their different protocols.

**Every time and every figure is monospaced and tabular.** A timestamp you
cannot align against its neighbour is a timestamp you cannot subtract, and
subtracting is the whole exercise.

**A delay is always a number, never only a colour.** The heat ramp may tint
a reading, and never replace the figure it sits next to. The interface has to
survive being read by someone who cannot separate the hues, and by someone
looking at a washed-out phone screen in daylight.

**Nothing animates behind a reading.** The sky never sits directly under a
figure, a timestamp or a table. This is the rule that makes the cosmos safe
to ship at all: a moving background under a number people are trying to read
is a legibility regression wearing a design.

**Structure comes from the sky and from hairlines, not from stacked bordered
boxes.** A card is a genuinely contained thing, such as a control cluster or
a dialog. Two sections of the same page separated from each other want a
fading hairline and space between them, not two more boxes.

**A gradient that can pass under text is bounded to the light half of the
luminance range, and its ink is fixed to the dark half. Never mixed.** This
is the general form of a specific bug this system used to ship, and section 3
is where the fix and the reasoning live.

---

## 3. Colour and the contrast contract

`packages/kosmik/style/tokens.css` is the shared dark baseline (apps/games
uses it as is). Phase 9 adds `apps/web/src/styles/theme.css`, loaded right
after it, with two themes:

- **Dark** (the default): brighter hairlines (`--hairline` .22,
  `--hairline-strong` .38), solid surfaces `--surface-1` to `--surface-4`,
  `--invert-bg`/`--invert-ink` for tooltips and the inverse button,
  `--sel-bg`/`--sel-ink` for text selection, the status hues, and groups 6
  to 10.
- **Daylight sky** (light), under `html[data-theme="light"]`: the same
  layers re-tinted, with dark navy hairlines and darker group hues.

`public/theme-init.js` sets `data-theme` before the first paint from the
reader's choice (Gelap, Terang, Sistem in the Tampilan panel; stored as
`iris-theme`), so a light-theme reader never sees a dark flash.
`apps/web/src/lib/__tests__/contrast.test.ts` parses both blocks and holds
both themes to the contrast rules below.

### The bug that motivated this section

A single `--sweep` gradient used to do two incompatible jobs: a 1px
decorative border ring, and the fill painted under a primary button's label
on hover. Two of its stops, `--neb-violet` and `--neb-teal`, are background
hues that this very file's own NEBULA comment says never to put text on.
Measured against the label ink sitting on top of them:

| Stop | Hex | Contrast vs. the label ink |
|---|---|---|
| `--accent` | `#40b0ff` | 8.00:1 |
| `--neb-violet` | `#3a2a6b` | **1.55:1** |
| `--neb-teal` | `#0f3f4a` | **1.65:1** |

The label went nearly invisible twice per 2.6 second hover loop, and it only
ever avoided total invisibility by luck of animation phase. The fix is not
"pick better stops for this one gradient", it is the rule stated above:
decorative and text-bearing gradients are different tokens with different
constraints, and a test enforces which is which.

### Two gradients, and the rule that separates them

```css
/* DECORATIVE ONLY. 1px rings and hairlines, never a surface text sits on.
   Any hue is fine here, including the nebula tones, because nothing this
   thin can carry a label. */
--sweep-ring: linear-gradient(100deg,
  var(--accent), var(--neb-violet), var(--neb-teal),
  var(--accent-bright), var(--accent));

/* TEXT-BEARING. Every stop is a light hue, so a fixed dark ink
   (--accent-ink) clears AA at every point along the gradient, not only at
   its declared stops. */
--sweep-surface: linear-gradient(100deg,
  var(--accent), var(--group-5), var(--group-1),
  var(--group-2), var(--accent-bright), var(--accent));
```

Sampled at 5% intervals along its whole length, not merely at its declared
stops, `--sweep-surface`'s worst point is `--group-2` at **6.96:1** against
`--accent-ink`. `apps/web/src/lib/__tests__/contrast.test.ts` re-measures this on every
run rather than trusting a comment: it decodes real sRGB relative luminance,
walks the gradient in small steps, and fails the build if the worst sampled
point ever drops below 4.5:1, or if a `--neb-*` token ever finds its way back
into a text-bearing gradient.

### Ground

| Token | Role |
|---|---|
| `--void` | The true floor, behind the starfield |
| `--bg` | The page ground content reads against |
| `--bg-elevated` | A card, lifted one real luminance step off `--bg` |
| `--bg-sunken` | Gutters and inset wells |

### Ink

| Token | On `--bg` | On `--bg-elevated` | Use |
|---|---|---|---|
| `--text` | 17.24:1 | 14.94:1 | Body, headings, figures |
| `--text-muted` | 7.68:1 | 6.65:1 | Secondary labels |
| `--text-faint` | 7.12:1 | 6.17:1 | The faintest text allowed |

Both columns are measured, not assumed, because a colour used on more than
one surface has to clear the worst of them, not the easiest. `--text-faint`
was previously 4.69:1 against `--bg` alone: it scraped AA and failed AAA,
and it was the exact pairing (uppercase mono, wide tracking, the smallest
size on the page) a legibility complaint landed on.

### Accent and signal

One accent, `--accent`, lifted from the printed Typst journal templates so
the practicum's paper and both web apps share one identity. `--accent-ink`
is the fixed dark text colour for anything painted directly on a solid
`--accent` fill or on `--sweep-surface`. `--glow-ring` is the single,
non-animated focus ring for form controls, distinct from the swept ring,
which is for hover.

### Group identity: up to ten

A session has five groups by default and up to ten (Phase 9). `--group-1`
to `--group-5` keep their hues; `--group-6` to `--group-10` were added for
the larger sessions, each with a darker twin in the Daylight theme. The
table below is the original five on the dark theme.

| | Hue | On `--bg` | On `--bg-elevated` |
|---|---|---|---|
| 1 mint | `#5eead4` | 13.20:1 | 11.44:1 |
| 2 violet | `#a78bfa` | 7.17:1 | 6.22:1 |
| 3 rose | `#fb7185` | 7.25:1 | 6.29:1 |
| 4 amber | `#f59e6a` | 9.28:1 | 8.04:1 |
| 5 ice | `#7dd3fc` | 11.71:1 | 10.15:1 |

A group is never identified by hue alone: every group hue is always paired
with its written name ("Kelompok 3"), because neighbouring hues (mint and
ice are 29° apart) are only defensible under that rule.

### Heat, and why it stays separate from group identity

`--heat-cold` through `--heat-burning` are a sequential ramp describing one
reading's proximity, unrelated to which group produced it. A card shows its
group on the rail and its heat on the bar: the two channels are never the
same visual property, so a reading is never mistaken for an identity.

### Nebula: background only

`--neb-indigo`, `--neb-violet`, `--neb-teal`, `--neb-plum`. Never put text
on these, and never reference one from a text-bearing gradient. This is not
a style preference, it is the rule `contrast.test.ts` enforces mechanically.

---

## 4. Type

Self-hosted via `@fontsource` (`apps/web/src/styles/fonts.css`), so no
third-party round trip blocks the first paint on lab Wi-Fi.

| Token | Face | Job |
|---|---|---|
| `--font-display` | **Plus Jakarta Sans** 700/800 | Page titles, card titles, hero lines (signed off in the Phase 9 mockup). |
| `--font-body` | **Inter** 400 to 700 | Everything else. Bigger tab and button labels use 650/700. |
| `--font-mono` | **JetBrains Mono** 400 to 600 | Every timestamp, delay, figure, code and identifier. If it can be subtracted or compared, it is mono. |
| `--font-cjk` | **Noto Sans SC** (unicode-range subsets) | Mandarin pages; chained after the Latin face. |

Mandarin headings default to 700; the Tampilan panel offers 500 (only
while the language is Mandarin), stored as `iris-zh-weight` and applied as
`html[data-zh-weight="500"]`.

Below 1280px wide the type, tabs and buttons step down one size, and again
below 640px.

---

## 5. Geometry

```css
--radius-sm: 4px;    /* chips, inputs */
--radius-md: 8px;    /* buttons, tabs, small cards */
--radius-lg: 14px;   /* cards, popovers */
--radius-xl: 20px;   /* dialogs */
```

`--lift-control` is how far anything moves on hover. Space is a 4px base
scale, `--space-1` through `--space-11`.

---

## 6. The kit

One shared kit, in `apps/web/src/components/ui` and the global
`src/styles/controls.css` and `src/styles/app.css` (global because React
islands sit outside Astro's scoped CSS). It matches the mockup's g-kit
screen.

**Buttons (`.btn`).** Base (surface fill, bright border, the rainbow ring
sweeps on hover), `--primary` (accent fill, the rainbow sweeps across the
fill; at most one per view), `--inverse` (the key action on a key card:
dark, then bright with dark text), `--ghost` (Cancel, Close), `--danger`
(solid red, dark ink, no ring: sign out, delete, turn off, always asked
first) and `--danger-soft` (Discard in a dialog footer). Sizes `--sm` 44px,
base 48px, `--lg` 60px.

**Icon buttons (`IconButton.tsx`, `.iconbtn`).** Only when the icon says
it all. Always an aria-label and a tooltip with the same words. A disabled
one stays focusable (aria-disabled) so its tooltip can say why.

**Icons.** Phosphor (`@phosphor-icons/react`, the `*Icon` exports), regular
weight; bold for a check inside a small box, fill for a picked rating. Icon
alone when the action is obvious, icon plus words when both are needed.

**Cards (`.panel`).** One bright border on every card. `.panel--key` adds
a rainbow top edge, for the one card per screen that carries its main job.
`.panel--solo` centres a card that is alone on its view. Grids stretch, so
cards in a row share one height, and `.panel__actions` pins a card's
buttons to its bottom edge so neighbouring cards' buttons line up.

**Tabs, one style in two forms.** `.seg`, the pill track, switches views
inside a card or a form. `Tabs.tsx` (`.tabs`), the underline form with a
rainbow line, switches the main sections of a page. Both scroll sideways
on phones instead of squeezing.

**Badges (`Pill.tsx`, `.pill`).** Always upper case, a bright edge, and a
tone: ok, warn, danger, accent, gold, violet, teal, solid, `fit` (the
sheet's red Ngajar FIT marker), `a24` (the yellow Angkatan 24 marker), or a
group or module hue. Codes and identifiers (`mono`) and toggle chips keep
their own case.

**Fields.** No native browser widgets: `Dropdown.tsx` instead of
`<select>`, `DateField`/`TimeField` (in `Controls.tsx`) instead of date and
time inputs, `Disclose.tsx` instead of `<details>`, `Tooltip.tsx` instead of
`title`. Dates are written out in full ("Kamis, 1 Oktober 2026").

**Back and fades.** One `BackButton` (an arrow and words in a pill) for
every way back; `PageHeader.astro` draws the same for Astro pages. Every
in-page view switch fades in (`Fade.tsx`).

**Overlays.** Radix keeps one stack, so Esc and outside clicks close only
the top layer. Every overlay animates in and out. Layer order: drawer 60,
dialog 100, popover and menu 150, toast 200, tooltip 400, so a picker
opened inside a dialog is never covered by it. A `blocking` dialog (a
required confirm, unsaved changes) shakes instead of closing. Dialogs and
drawers focus their own panel when they open.

**Dialog footers.** Buttons keep their normal size. Two buttons sit right:
Cancel, then the main action. An alternative goes on the left (`alt`).
Three buttons use the 1-2 footer (`foot="12"`): the main action across the
top row, the other two below. Under 520px they stack full width with the
main action on top.

**Errors (`ErrorView.tsx`).** One view for 400, 401, 403, 404, 408, 409,
413, 429, 500 and 503: the code and its icon, the cause, what to do, then
the actions. Praktikan get their own wording, with no internals.

**Keyboard.** The "?" sheet (`ShortcutSheet.tsx`) lists the keys in
groups, each key as its own chip, with a switch to turn shortcuts off
(`iris-keys`). Every shortcut handler checks `shortcutsOn()` and stays
quiet while the reader types in a field.

---

## 7. Layout and widths

Every screen is designed per breakpoint, not stretched. Verify each changed
screen at **360, 390, 820, 1024, 1280×720, 1280 and 1680**, in both themes
and every interface language. Extra width goes to data and side panels;
running prose keeps a bounded measure (`--measure-prose`, 68ch).

At 640px and up the navigation is a top bar: the links start right after
the logo, then the clock, the command palette (from 1100px), Tampilan and
the account. Below 640px the links move to a bottom tab bar with icons, and
Tampilan and the account open as bottom sheets.

---

## 8. Background detail and motion

The sky (`src/scripts/sky.ts`, a port of the mockup's sky) has three
detail levels, chosen in Tampilan and stored as `iris-detail`
(`html[data-detail]`): **Low Detail** (still; the default), **Normal**
(twinkling stars, a meteor now and then) and **High Detail** (planets, a
satellite, comets, aurora).

The detail level is about the background only. The interface's own motion
(the hover sweeps, overlay open and close, view fades) runs at every
detail level; only the operating system's reduced-motion setting stops it
(`packages/kosmik/style/motion.css`), leaving every state still visible.

Nothing animates behind a reading: cards are solid, so the sky never shows
through under text or figures.

---

## 9. Voice and copy

- Casual Indonesian that keeps the common English terms, English, and
  Mandarin (Simplified) as the third language. The handbook and the
  journals stay Indonesian and English. "Brief" is "Ringkasan" in
  Indonesian.
- **No em dashes and no en dashes** anywhere in interface copy.
- **No abbreviations**: "Kelompok 3", not K3 or G3; "Modul 4", not M4;
  "Internasional", not INTER; "Persiapan", not Prep; "menit", not mnt or
  min; "detik", not dtk. Use `src/lib/labels.ts`. A vitest
  (`abbreviations.test.ts`) scans every string, template literal and JSX
  text for these, and for short month or weekday names in date formats.
- People are written **"Full Name (CODE)"** (`namaAsisten` in
  `src/lib/people.ts`). A small code chip may show the code alone.
- **Title case** for headers, tabs, buttons and menu items ("Buka
  Persiapan", "Simpan dan Pindah"). Sentence case for hints, body text and
  toasts.
- Full dates: "Kamis, 1 Oktober 2026" (`tanggalPanjang` in `src/lib/app.ts`).

---

## 10. Before you build a screen

1. Is every timestamp, delay and figure monospaced and tabular, and stated
   as a number, not only as a colour?
2. Is a gradient under text using `--sweep-surface`, never `--sweep-ring`?
3. Does it have a real design at each of the seven widths, in both themes
   and all three languages?
4. Does every overlay animate out as well as in, and does Esc close only
   the top layer?
5. Is there any native widget left (`<select>`, a date input, `<details>`,
   a `title` tooltip)?
6. Is every string free of dashes and abbreviations, every person "Full
   Name (CODE)", every button and tab title case?
7. Would a ten-group session still fit this layout?
