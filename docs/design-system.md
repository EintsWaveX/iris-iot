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

All tokens live in `packages/kosmik/style/tokens.css`, shared by both apps in
this monorepo. Dark only, by decision — there is no light counterpart and no
`prefers-color-scheme` branch to maintain.

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
`--accent-ink`. `packages/kosmik/contrast.test.ts` re-measures this on every
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
was previously 4.69:1 against `--bg` alone — it scraped AA and failed AAA,
and it was the exact pairing (uppercase mono, wide tracking, the smallest
size on the page) a legibility complaint landed on.

### Accent and signal

One accent, `--accent`, lifted from the printed Typst journal templates so
the practicum's paper and both web apps share one identity. `--accent-ink`
is the fixed dark text colour for anything painted directly on a solid
`--accent` fill or on `--sweep-surface`. `--glow-ring` is the single,
non-animated focus ring for form controls, distinct from the swept ring,
which is for hover.

### Group identity: five, fixed

The practicum runs **five groups per session, fixed for the whole term
across every module.** This was previously three incompatible numbers in
different parts of the codebase: the journals for Modules 1 to 3 assumed
eight, Module 4's hunt assumed seven (one group's board becomes the shared
beacon), and the separate Arena tournament app assumed four. Five is the
settled number, and `--group-1` through `--group-5` keep their existing
hues and numbering — this was a deletion of `--group-6` and `--group-7`,
not a renumbering.

| | Hue | On `--bg` | On `--bg-elevated` |
|---|---|---|---|
| 1 mint | `#5eead4` | 13.20:1 | 11.44:1 |
| 2 violet | `#a78bfa` | 7.17:1 | 6.22:1 |
| 3 rose | `#fb7185` | 7.25:1 | 6.29:1 |
| 4 amber | `#f59e6a` | 9.28:1 | 8.04:1 |
| 5 ice | `#7dd3fc` | 11.71:1 | 10.15:1 |

`contrast.test.ts` asserts both that groups 1 through 5 exist and that 6
through 8 do not. A group is never identified by hue alone: every group hue
is always paired with its number, because the tightest gap between any two
of the five (mint and ice, 29° apart) is defensible only under that rule.

### Heat, and why it stays separate from group identity

`--heat-cold` through `--heat-burning` are a sequential ramp describing one
reading's proximity, unrelated to which group produced it. A card shows its
group on the rail and its heat on the bar — the two channels are never the
same visual property, so a reading is never mistaken for an identity.

### Nebula: background only

`--neb-indigo`, `--neb-violet`, `--neb-teal`, `--neb-plum`. Never put text
on these, and never reference one from a text-bearing gradient. This is not
a style preference, it is the rule `contrast.test.ts` enforces mechanically.

---

## 4. Type

Three faces, self-hosted via `@fontsource` in `apps/web` (see
`apps/web/src/styles/fonts.css`), so no third-party round trip blocks the
first paint on lab wifi. `apps/games` keeps loading the same three faces
from Google Fonts, because it has no bundler to resolve an npm package into
shipped files — see `packages/kosmik/style/fonts-google.css`.

| Token | Face | Job |
|---|---|---|
| `--font-display` | **Instrument Serif** 400 + italic only | Titles at `--fs-display-md` and above. Never set a heavier weight — the browser synthesises a bold and it looks broken. Below that size floor its hairline strokes break down on a dark ground, so smaller titles use `--font-body` instead. |
| `--font-body` | **Inter** 400/500/600 + 400 italic | Everything else: body, UI, headings below the display floor, eyebrow labels. |
| `--font-mono` | **JetBrains Mono** 400/500/600 | Every timestamp, every delay, every figure, every code reference. If it can be subtracted or compared, it is mono. |

`apps/games` re-declares `--font-body`/`--font-mono` only, to IBM Plex, via
`src/style/tokens-override.css` — the user's own call, kept live to compare
against the new stack before deciding whether to retire it.

Scale: `--fs-small` (0.8rem) through `--fs-display-xl`. `--fs-micro` is an
alias of `--fs-small`, not a second value — the two used to be independent
tokens that happened to converge on the same number by coincidence of a
fix, which only invites them drifting apart again by accident.

---

## 5. Geometry

Radius now encodes elevation rather than only decorating:

```css
--radius-sm: 4px;    /* chips, inputs */
--radius-md: 8px;    /* buttons, small cards */
--radius-lg: 14px;   /* standard cards */
--radius-xl: 20px;   /* modals, hero surfaces */
```

`--lift-control` and `--lift-card` are the two amounts anything ever moves
on hover, so a button, a card and anything else that lifts all agree on how
far. Space is a 4px base scale, `--space-1` through `--space-11`.

---

## 6. Layout: four breakpoints, four real designs

A single centred column that only grows wider as the viewport widens is not
a desktop design, it is a mobile design stretched. `--measure` splits into
three tokens so the difference is enforceable:

```css
--measure-prose: 68ch;   /* body copy, walkthrough steps, lede */
--measure:       1100px; /* the standard content column */
--measure-wide:  1600px; /* dashboards, ladders, tables */
```

**Extra viewport width goes to data and secondary panels. Running prose
keeps a bounded measure.** Widening a paragraph past a comfortable line
length is not using the space, it is stretching it.

| | Width | Shape |
|---|---|---|
| `sm` | ≤ 640 | One column. Tables collapse to stacked rows. Grain and the second aurora ribbon drop. |
| `md` | 641–1024 | Two columns where content genuinely pairs. |
| `lg` | 1025–1440 | **The primary desktop design.** Content plus a persistent right rail. |
| `xl` | ≥ 1441 | `--measure-wide` unlocks for data surfaces only. Prose stays at `--measure-prose`. |

Every page needs a real answer for what happens at `lg` and above, not only
a statement that it does not break. See the Phase 5 plan's page-by-page
section for the specific shape each page takes at each breakpoint.

---

## 7. Motion, in three tiers, earned

**Tier 0**, what everybody gets by default: a fully painted CSS sky with no
JavaScript and no animation. Not a degraded fallback — the base product, and
what the practicum's lab phones keep unless a device proves it can afford
more.

**Tier 1**: the CSS layers start drifting (nebula, grid pulse, one aurora
ribbon), gated behind `data-motion="full"` on `<html>`.

**Tier 2**: the canvas starfield, comets and planets mount. On apps/web
only (P6.4), the aurora also becomes a small WebGL layer of moving fbm
curtains (`aurora-gl.js`) instead of the CSS rays swaying in place; a
WebGL failure of any kind just leaves the CSS layer as it already was.

A tier is earned once per device by a capability probe (declared signals
plus a measured frame time over roughly 500ms of a trivial layer), cached in
`localStorage` so it runs once, not once per page. Reduced motion, at the OS
level or via the in-page toggle, pins a device to tier 0 regardless of what
the probe would otherwise allow.

**The toggle means what it says.** Every CSS animation in `cosmos.css` moves
behind `data-motion="full"`, which the toggle writes directly — previously
the toggle only reached the canvas and GSAP paths, so a phone where someone
turned it on kept animating the nebula, the grid and the aurora regardless.

**Navigation is a content-only crossfade.** The outgoing content fades and
lifts 8px, the incoming content arrives, and the sky does not react. This
replaces a warp effect that re-shaped every star on every navigation, which
cost the most on exactly the devices least able to pay for it.

**One entrance and one stagger per page, never a reveal on every section.**
Motion is spent deliberately, in two places, not distributed evenly across
everything that could animate.

`prefers-reduced-motion` and the tier-0 state both freeze the sky on a valid
last frame rather than blanking it — a still night sky is still the design.

---

## 8. Voice

No em dashes and no en dashes anywhere in interface copy. A full stop, or a
restructured sentence. A grep for `—` and `–` across user-facing strings is
part of verification, not a style suggestion.

---

## 9. Before you build a screen

1. Does this page know which module is running, if that is relevant to it?
2. Is every timestamp and every delay monospaced, tabular, and stated as a
   number, not only as a colour?
3. Does the sky sit behind anything a person is trying to read?
4. Is a gradient under text using `--sweep-surface`, never `--sweep-ring`?
5. Does this screen have a real, considered design at `sm`, `md`, `lg` and
   `xl`, or only one that happens not to break at the others?
6. Does it work with the "Kurangi efek" toggle on, and does the toggle
   actually stop every animated layer this screen uses?
7. Is every string free of em and en dashes?
8. Would a five-group roster, not a seven or eight-group one, actually fit
   this layout?
