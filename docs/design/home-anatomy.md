# IRIS Home anatomy (proposal for sign-off, 20 Nov 2026)

Status: **proposal, no code yet.** Sign it off (or veto lines) before any Home code. It is the first template of the
layout kit (Phase 4 of `perf overhaul`); the other views reuse the same column, header band, card and rhythm.

## 1. What Home is today (measured on the live site, 20 Nov 2026, signed out, real APIs)

| | 1440x900 | 1920x935 | 1280x720 | phone 390 |
|---|---|---|---|---|
| Page height | 5083 px (5.6 screens) | 5278 | 4850 | 5219 (6.2 screens) |
| Content column | 1358 px, gutter 36 | **1568 px** (page max 1640) | 1198 | 362, gutter 14 |
| Hero | 677 px, 75 % of the screen | 661 | 531 | 602 |
| Hero title | 73.6 px, weight 800 | same | 73 | 32 |
| Section headings (H2) | 38.4 px, weight 750 | 38.4 | 38.1 | 23 |
| Section heights | 588 / 468 / 1622 / 718 | 508 / 1802 / ... | | 851 / 880 / 1272 / 649 |
| Gap between sections | ~112 px | ~112 | | ~56 |
| Card and plate radius | **20 px everywhere** | | | |
| Division cards | 3 across, 442 x 457 | 512 x 510 | 389 x 417 | 1 across |

Sections, top to bottom (visitor): Open Recruitment banner, **Hero** (painted sky, four stat plates orbiting the
logo, title, lede, two buttons), **Tentang Kami** (text plus two photos), **Filosofi Logo** (four hotspot notes round
the logo), **Siapa Kami** (the Inti banner, six division cards, year tabs), **Jejak Kami / Acara** (event swiper),
footer. Signed in: banner, the Observatory (hello, role card, lab pane, the four-module "Rasi" row), then the same
profile sections.

A correction of mine: an earlier note in this thread said Home was 1.5 screens. That came from a run in which every
API answered 401, so the profile sections never loaded. The numbers above are with real data.

## 2. What the references do that Home does not (Arduino, Espressif, Linear, Vercel, MIT Media Lab, 1440 wide)

- **A capped column.** 1280 to 1344 px of content with 80 to 160 px side margins. Home grows to 1568 px at 1920.
- **Plain section headings.** Linear, Vercel and Arduino put the heading straight on the page, 48 to 56 px. Home puts
  every heading inside a 692 px plate of its own: five plates, one per section, none as wide as the content under it.
- **Smaller, lighter hero type.** 40 to 64 px, weight 400 to 700. Home is 73.6 px at 800.
- **Tighter corners.** Cards at 6 to 12 px (mostly 8). Home is 20 px on everything, which is why even small chips look
  like pills inside pills.
- **One closing call to action** before the footer (Linear, Vercel, Espressif). Home ends on an event swiper.
- What Home already does right: section rhythm (112 px), three cards across, a hero that is the first screen.

## 3. Proposed anatomy

**Column.** One shared column for every Praktikum and Oprec view: `--col: min(1360px, 100% - 2 * var(--gutter))`,
`--gutter: clamp(16px, 4vw, 56px)`. Hero artwork may run edge to edge; everything readable sits in the column.

**Section header band** (replaces the five loose plates). One band per section, **the full width of the column**:
eyebrow (12 px, caps, accent), H2 (clamp 28 to 44 px, weight 700), one-line sub (max 60 characters wide), an optional
action on the right ("Lihat semua"). It stays a plate because text straight on the painted sky is not readable; it
just stops being a different width in every section.

**Radius scale.** 16 px for cards and bands, 12 px for inputs and buttons, 999 px for pills and chips. (From 20
everywhere.)

**Hero.** Keep the painted sky and the four stat plates. Title clamp(40, 5vw, 64) px at weight 700; lede 18 px, 60
characters wide; the two buttons side by side on a laptop, stacked full width on a phone. Hero height
`min(100svh - nav, 760px)`.

**Rhythm.** Keep what works: 112 px between sections on a laptop, 56 px on a phone, 24 px between a band and its
content.

**Cards.** One card recipe: radius 16, gap 24 (16 on a phone), 3 across from 1100 px, 2 across from 700 px, 1 on a
phone; photo cards keep roughly 4:5.

**Sections (visitor), in order.**
1. Open Recruitment banner (unchanged)
2. Hero
3. Tentang Kami: band, then text left and two photos right (as now)
4. Filosofi Logo
5. Siapa Kami: band, Inti banner, 3 x 2 division cards, year tabs
6. Jejak Kami: band, event swiper
7. **New: closing band** "Mulai praktikum" with the two buttons and the next event date, then the footer

**Signed in.** Same column, bands and radii. The Observatory keeps its content (hello, role card, lab pane, Rasi); the
Rasi row gets a band like the other sections and the modules become the standard 4-across card (2 x 2 on a phone).

**Phone.** Same order, one column, 16 px gutters, bands wrap to two lines and drop the right-hand action under the
heading, targets 44 px.

## 4. Decisions needed (veto any line)

1. Column cap 1360 px (Home is 1568 px at 1920 today).
2. Section header band at the full column width, instead of loose plates.
3. Radius scale 16 / 12 / 999 (from 20).
4. Hero title 64 px / 700 (from 73.6 px / 800).
5. A new closing "Mulai praktikum" band.
6. Plates stay for headings (no text straight on the sky).

## 5. Not verified

- In my headless full-page capture the three lower division cards and a blank stretch of about 650 px were missing
  under "Enam Divisi". Most likely the scroll-reveal had not fired for them in a fast scripted scroll, but I have not
  confirmed it; I will check before touching that section.
- The sizes above are the live site's computed styles at the viewports shown, not a design file. The Genshin-style
  hero, the orbiting stat plates and the glass look are kept as they are.
