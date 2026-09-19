# Arena Asisten IRIS — "Cosmic Editorial" rebuild: handoff

Continuation notes for the next session. The approved plan lives at
`~/.claude/plans/i-want-to-redesign-magical-toucan.md`; this file records what
is actually **built and verified**, what is **left**, and the gotchas that cost
time the first time round.

Nothing has been deployed. The live site at `arena-iris.vercel.app` is still
running the old build. Deploy is a separate, explicit step.

---

## The direction (settled — do not re-litigate)

**Cosmic editorial.** Editorial / quiet-luxury layout and typography —
generous whitespace, hairline rules instead of glass cards, hierarchy from size
and spacing rather than weight — set against a living night sky.

- **Dark only.** The light theme was deliberately dropped. There is one
  palette, on bare `:root` in `src/style/tokens.css`. No
  `prefers-color-scheme` block, no `[data-theme]` variants.
- **Type:** Instrument Serif (display) / IBM Plex Sans (body) / IBM Plex Mono
  (kode, points, ranks, eyebrows).
- **Brand:** `--accent: #40b0ff` is lifted from `template/template.typ` so the
  site and the printed Typst journals share one identity. Keep it.
- **Gold** (`--gold: #e8b64d`) means champion and nothing else.

---

## How to build and check

```bash
cd games
python build.py --standalone     # -> public/index.html   (what Vercel serves)
python build.py                  # -> index.html          (Artifact fragment)
node test_engine.mjs             # 5088 assertions
node test_api.mjs                # 40 assertions
```

Then open `games/public/index.html` in a browser (the Chrome DevTools MCP
server works well for this — screenshot, evaluate scripts, measure frames).

**`index.html` and `public/index.html` are generated. Never edit them.** All
work happens in `src/`.

### Source layout

```
src/
├── shell.html          markup skeleton; <!--STYLE--> <!--LOGO--> <!--SCRIPT-->
├── style/              concatenated in THIS order — order is the cascade
│   ├── tokens.css      the whole palette, type scale, spacing, easing
│   ├── base.css        reset, base type, editorial primitives, app shell
│   ├── cosmos.css      background layers + per-scene skies + warp
│   ├── components.css  nav, buttons, chips, panels, empty states
│   ├── screens.css     the four screens + champion takeover
│   ├── motion.css      keyframes / animation contract
│   └── responsive.css  breakpoints, motion safety, inert-control treatment
├── vendor/             pre-built browser bundles, inlined at build time
│   ├── gsap.min.js  CustomEase  SplitText  DrawSVGPlugin
│   ├── confetti.browser.js
│   └── README.md       provenance + refresh instructions
├── data.js             roster, divisi, games, groups (constellations)
├── engine.js           pure logic — UNTOUCHED, fully tested
├── motion.js           GSAP setup, shared ticker, countUp/enter/revealText
├── cosmos.js           starfield, constellations, comets, planets, warp
├── store.js            realtime state layer
├── ui-roster.js  ui-game.js  ui-board.js
├── ui-rules.js  ui-champion.js  ui-stage.js
└── app.js              router, confetti, mode, Store wiring
```

Every module in `SCRIPT_FILES` is now implemented; there are no stubs left.

---

## Done and verified

- **Build system.** `build.py` gained `STYLE_FILES` (7 ordered parts) and
  `VENDOR_FILES`; script parts are joined with `;` separators so a minified
  bundle cannot run into the next file via ASI; a guard rejects any source
  containing `</script`. Standalone head is dark-only with a new constellation
  favicon and font preconnects.
- **Libraries vendored** (~117 KB): GSAP 3.15 + CustomEase + SplitText +
  DrawSVGPlugin, and canvas-confetti. All free under GSAP's standard
  no-charge licence since 3.13.
- **Token layer** rewritten dark-only; semantic `--danger/--warn/--ok` added
  (the palette previously had none, so a validation failure looked like
  placeholder copy).
- **Background system.** Void gradient, drifting nebula, circuit grid with a
  travelling light band, canvas starfield with three parallax depths and a
  constellation network, film grain, vignette, and a drifting rainbow aurora
  along the bottom.
- **Per-screen skies + warp.** Every screen has its own sky; changing tabs
  fires a hyperspace warp (radial star streaks, scene cross-fade under cover
  of the streaks, decelerate out). Scene weights live in `SCENES` in
  `cosmos.js`; the aurora's hues are re-mixed per screen via `--au-*` under
  `:root[data-scene="…"]` in `cosmos.css`.
- **Comets and planets.** Comets with tapering tails, spawned at
  scene-weighted rates. Planets as lit spheres with atmosphere halos, a bright
  limb and one ring, at their own parallax depths.
- **All four screens** rebuilt in the editorial language: roster name plates
  with status dots, games as an index with serif numerals, group columns in
  the four constellation hues, a real podium with gold/silver/bronze tiers at
  different heights.
- **Bracket connectors.** Real SVG elbows measured by `layoutWires()` in
  `ui-game.js`, tinted by the winning group and drawn in with DrawSVG. Each
  match now has its own label — `buildMatch(labelText)` used to accept a label
  and throw it away, so SF1 and SF2 were indistinguishable.
- **Champion takeover** (`ui-champion.js`): starfield converges, the group's
  constellation crest draws itself, the name lands in gold, members list in,
  confetti fires from two angled cannons. Auto-dismisses after 7s (override
  with `holdMs`).
- **Group constellations** added to `data.js`: Vela / Lyra / Cygnus / Orion,
  each with `stars` (points on a 0–100 grid) and `lines` (index pairs).

- **Aturan — the rules screen.** A fourth nav entry and `#screen-rules`.
  All copy lives in a `rules` block in `src/data.js` (Indonesian, four
  sections plus a scoring table), so the wording is editable in one place and
  `ui-rules.js` is pure presentation. Includes an SVG bracket diagram —
  groups in their constellation hues elbowing into two semifinals and a gold
  final — which scrolls inside its own track below ~520px rather than
  shrinking its mono labels into illegibility. Built once at init and
  deliberately left out of `distribute()`: nothing here can be changed by a
  snapshot.

- **The champion moment now reaches every phone.** See the corrected
  diagnosis below — the cause was not what this file previously claimed.
  `meta.celebrate = { gameId, at }` is stamped by the operator and every
  client fires the takeover when it observes an `at` it has not seen.
  Verified with three real browser windows against a stub backend.

- **The viewer count is gone, replaced by a real connection status.**
  `Store.onStatus` / `Store.status` report `live` / `reconnecting` /
  `offline`, derived from whether reads are actually landing. The chip pulses
  green only while live; amber and red hold steady, because a blinking dot
  reads as activity and there is none. Verified by killing the backend
  mid-session and bringing it back: live → reconnecting → live.

- **Stage — the projector view.** `?stage=1` or the nav toggle (hidden for
  spectators and below 720px). Sets `data-stage="on"`, which the existing
  `cosmos.css` hooks use to raise the sky, and hides the nav, the screens and
  the status chip. Follows `meta.activeGame` through four phases derived from
  the game document itself — lobby, draw, bracket, champion → standings — and
  **not** from `meta.phase`, which is only ever written as `"draw"` and would
  leave the projector showing a draw during the final. Type is sized off
  viewport units throughout, starting where the app's scale ends. The
  Fullscreen API rides on the toggle click, since it cannot be requested from
  a state change. `Champion.show` is given `holdMs: 15000` while the stage is
  on, so the room gets time to react where a phone does not need it.

- **Warp streaks are heavier.** `lineWidth` now ramps with `hyper` rather than
  sitting at the star's resting weight, so the streaks read as mass being
  pulled past the camera instead of hairlines that merely got longer. Scaled
  off `radius`, so the parallax layers stay distinguishable — near stars
  thicken most, far ones stay fine.

- **Roster quality-of-life.** A sticky control bar carrying the live
  `n / 25` counter with an animated arc, a search field, and "Hadir semua" /
  "Kosongkan". Filtering hides plates with `.is-filtered-out` and empties
  lanes with `.is-empty` -- never a rebuild, so a keystroke cannot cost focus.
  The bulk actions are **scoped to the current filter**, which is what makes
  the two compose: search a division, mark that division. Backed by a new
  `Store.setAttendanceMany()`, because "Hadir semua" through the per-key
  `setAttendance()` was 25 separate POSTs on venue wifi; `/api/write` already
  merges `attendance.hadir` key by key, so it is now one write (verified: one
  `rev` increment for all 25).

- **Motion is wired up.** `Motion.enter` staggers the incoming screen's
  blocks on a screen change, `Motion.revealText` splits the screen title per
  character, and `Motion.countUp` drives the roster counter, the podium and
  the leaderboard points. `.screen` was reduced to a plain cross-fade at the
  same time -- sliding and blurring the whole panel *and* staggering its
  children doubles the gesture and reads as a stutter. The
  `visibility 0s linear <duration>` pairing is untouched.

- **`ui-board.js` converted to keyed patching.** Rows live in a map by `kode`
  and are reordered with `appendChild`, which moves an existing node instead
  of replacing it. This is what makes the count-ups possible at all: under
  the old wholesale rebuild every snapshot handed each count-up a brand new
  element, so it restarted from zero every 3s and never arrived.

- **Smaller items.** The draw button reads "Undi Grup" before a draw and
  "Undi Ulang" after. The game detail screen has a "← Daftar Game" back
  affordance. Group column heads carry their constellation crest and name,
  which previously existed in `data.js` but were only ever drawn in the
  champion takeover. The unused `.skeleton` rules were deleted.

- **The reset confirmation is a real popover.** It was a label swap on the
  same button that reverted silently after 3s, so a double-tap -- or a tap on
  a button whose label had just changed under the finger -- destroyed a live
  bracket. Now an explicit two-answer dialog; Escape, a tap outside, and
  "Batal" all cancel, and only "Ya, reset" writes. Verified it survives the
  3s reconcile rather than vanishing mid-decision.

- **Bracket wires light as a winner advances.** A second path per wire
  carries a short lit segment from the semifinal end to the final end,
  driven by DrawSVG's `"start% end%"` form so both ends travel together and
  the segment moves rather than grows. It also fires when the winner
  *changes* -- the operator correcting a mis-tap is still an advance, and the
  old code only animated the not-live-to-live edge, so a correction silently
  recoloured the wire.

- **The draw reveal materialises names out of star points.** The slot
  flicker stays; the lock-in is now a coloured star flaring at the left of
  each plate with the name's words converging out of it. Split by WORDS, not
  characters, deliberately: 25 names across four columns is ~800 elements
  per-character versus ~129 per-word, on the phones this has to run on, and
  at this size the difference is invisible. `Motion.materialise()` returns
  null under reduced motion or without SplitText, in which case the original
  CSS `stagger-item` settle is the whole reveal -- verified by stubbing it
  out and re-running the draw.

- **Roster density toggle.** "Rapat" / "Renggang" drops each plate from two
  rows to one, kode inline before the name. Measured on a 390px phone
  viewport, which is what it is for: 2064px -> 1443px, a 30% shorter list,
  with no name truncated. On desktop it saves 19% and three of the longest
  names ellipsise, so every name carries a `title` and the card's aria-label
  has it regardless. The choice persists per device in localStorage, guarded
  with try/catch because a private window makes even the accessor throw.

- **`src/style.css` deleted.** 1213 lines of leftover from before the split
  into `src/style/`, referenced by nothing.

### Bugs fixed along the way

- Gold-on-gold text (`--gold-ink` on a solid `--gold-soft`) sat at ~1.2:1 and
  was invisible on the only theme this site has. `--gold-soft` is now a
  translucent wash and text on it uses `--gold`.
- The brand was `display: none` below 880px — the 25 phones that are the
  actual audience never saw the logo or wordmark.
- The `VS` badge was absolutely centred on the match box, which broke the
  moment matches gained a label row. It is now a flex item pulled into the
  seam with negative margins.

- **A spectator joining late replayed an old champion takeover.**
  `gameDocFor()` returns a synthetic all-null document until the first real
  snapshot for that game arrives, and `updateChampion` recorded that as its
  baseline — so the first real snapshot looked like a champion being crowned
  right now. Anyone opening the link after a game had finished got a
  full-screen takeover for it. `updateChampion` now waits for an actual
  document before establishing a baseline. This one predated the celebrate
  work; it surfaced while testing it with a third window.

- **The status chip sat on top of the roster search field on phones.**
  Introduced with the sticky control bar: the chip is `position: fixed` and
  was pinned top-right, which is exactly where the new bar lives on a phone.
  It now sits above the bottom nav on mobile and keeps its bottom-right spot
  on desktop, where the nav is at the top. Checked for overlap against both
  the bar and the nav at 390px and 1280px.

- **On a projector, the champion moment never fired at all — for anyone.**
  The celebration was triggered from `ui-game.js`'s `updateChampion()`, which
  only runs for the one game the detail screen has open. A machine running
  `?stage=1` opens no detail screen, so it never fired locally *and*, because
  the same call site is what broadcasts, the operator never wrote the
  `meta.celebrate` stamp either — so the 25 phones got nothing. The trigger
  now lives in `app.js`'s `watchChampions()`, which watches every game
  document on every snapshot and is independent of the visible screen.
  `updateChampion()` keeps only its local decoration: the gold strip and the
  brand pulse.

- **Crowning a second game replayed the first one.** The send side of the
  broadcast pre-set `lastCelebrateAt` to the value it was about to write.
  Until that write lands, incoming snapshots still carry the PREVIOUS stamp,
  which then compares unequal and fires the previous game's takeover — then
  the real echo fires on top of it. Stamps this client authored are now
  tracked explicitly in `ownCelebrateStamps` instead. The app-side dedupe was
  also a single slot, so two celebrations inside the window clobbered each
  other; it is a keyed map now.

### Performance baseline (1920×935, desktop)

Measured, not guessed. Steady state **81–89 fps** (was 33), warp transient 28,
canvas alone 142.

---

## The operator's phone (2026-09-04)

The premise the whole design was built on -- operator on a laptop, 25 phones in
the room as spectators -- stopped being true. Operators now run the night from
their phones, standing up, one-handed. The projector still runs off its own
device, so **nobody but the operator ever sees the operator's phone**, which is
what licences the changes below: the editorial language stays intact everywhere
it is actually watched, and only the operator's own control surface gives it up.

Measured at 360x780 in operator mode before any of it: 58% of the first screen
went to chrome before the first tappable roster row, and the roster took 4.5
screens of scroll.

### The bug underneath it (this one was not cosmetic)

All five screens share one grid cell and cross-fade (`base.css`). They were
hidden with `opacity` + `visibility`, and **a visibility-hidden element still
sizes the grid and still adds to the document's scroll height**. So the page was
always as tall as the tallest screen -- Aturan, ~3300px -- whatever you were
looking at:

| Screen | Content | Document was | Empty scroll |
|---|---|---|---|
| Klasemen | 415px | 3472px | ~2900px |
| Game | 1311px | 3472px | ~2000px |
| Kehadiran | 1776px | 3472px | ~1500px |

An operator scrolling the bracket fell off the end of the content into three
screens of empty sky. Spectators and the projector had it too; phones just made
it unmissable.

`position: absolute` on the inactive screens fixes the grid sizing but **not**
the scroll height -- out-of-flow boxes still contribute scrollable overflow.
The fix is `app.js` `setScreenInLayout()`, which sets `display: none` one fade
after a screen goes inactive. `FADE_OUT_MS` must stay >= `--dur-mid` (280ms) or
screens will vanish instead of fading. After: Klasemen 780px, Game 1319px,
Kehadiran 1956px, Aturan unchanged.

### The operator layer

All of it is in `responsive.css` behind `@media (max-width: 620px)` and gated on
`#app[data-mode="operator"]` / `[data-mode="offline"]` -- the attribute
`applyMode()` already sets. Desktop and the projector are provably untouched
(verified identical at 1920 in both modes), and **a spectator on the same phone
still gets the designed version**. Never gate this on `pointer: coarse`.

- **Head compacted.** Subtitle hidden (the lit nav item already says which
  screen you are on), title down to `--fs-display-sm`. Chrome before the first
  roster row: 452px -> 161px.
- **Division-balance strip hidden.** It duplicates the `4/4` already in every
  lane heading, for ~110px of a 780px screen.
- **Controls moved into the thumb arc.** `.roster-controls` was already sticky,
  so always findable -- but pinned to the *top* of a 6.5" phone, the one place a
  thumb cannot reach without regripping. Now fixed above the nav. Costs 119px;
  usable rows still went 4 -> 7.
- **Connection chip to the top band.** It is `position: fixed` with nothing
  reserving space, so it floated over roster rows and game cards on every
  screen -- and sat bottom-right, where the control bar now lives. Operator
  only; a spectator has no bar to collide with. The label stays: an operator
  whose writes are failing needs the word, not a dot.
- **48px touch floor on `.btn`** (measured 43px). Not gated on mode.
- **Rows to 48px** from 59px, still above both platform floors.

### Group columns stack on phones (everyone, not just operators)

Below 900px the four groups were a horizontal snap-scroll row -- 940px of
content in a 360px viewport, 2.6 screens wide. On a drawn bracket that truncates
names mid-word ("WIL - Wildan Khali...", "YEN - Bryan Gabrie..."), and the
operator reading groups out to the room is the one person who cannot afford half
a name. They now stack: 0 of 25 names clipped, no sideways gesture fighting the
vertical one. The game screen got longer (1.7 -> 3.2 screens) and that is the
intended trade.

### Gotcha found doing this: fixed positioning vs. the GSAP stagger

`Motion.enter` staggers `#game-detail-body` in with a transform, and **a
transformed ancestor becomes the containing block for any `position: fixed`
descendant**. A fixed bar inside it flew ~370px off-screen for the length of
every screen entry and every draw, then snapped back when `clearProps` fired --
correct at rest, broken only in motion, which is the worst way for a bug to
present. Anything pinned inside a staggered container has to be `sticky`, or
outside it. `.roster-controls` is safe because it is a direct child of the
screen: the transform lands on the element itself, which does not create a
containing block for its own fixed positioning.

Also note `body` has `overflow-x: hidden`, which changes how `sticky` bottom
offsets resolve. Bottom-sticky does not engage there; top-sticky is fine.

## Remaining work

**The bracket still scrolls horizontally on phones** -- `.bracket` is 504px in a
320px viewport (1.6 screens), so the FINAL column sits off-screen until you
swipe. It was left alone deliberately: `layoutWires()` draws the connector
elbows from `a.right` to `f.left`, hard-assuming the final is to the *right* of
the semifinals, and the GSAP lock-in pulse travels those same paths. Stacking
the rounds vertically means reworking the wire renderer and its animation, which
is a bigger change than the rest of this put together and deserves its own pass.
`.match-side` is 58px, so the taps themselves are fine.

Everything else from the approved plan is built and verified.

If this is picked up again, the honest candidates are all judgement calls
rather than gaps:

- The game copy in `data.js` still ships as author shorthand ("seru lah
  pokonya", "ini juga") and `pengusul` casing is inconsistent -- `REG`
  matches no roster kode, `RGZ` is the closest. Left alone deliberately: it
  is the team's own voice and their data to change.
- `--scrim` and the group crest data are both fully used now; there is no
  remaining dead CSS that I know of.

### Note: realtime is done, but the original diagnosis was wrong

Recorded here because the wrong cause is still worth knowing about.

This file used to claim the champion moment "never reaches the 25 phones"
because `Store.celebrate()` depends on `room`, which the Firebase path never
sets. That is only half right. `room` really is dead in the Firebase path, but
the takeover was never routed through it: `ui-game.js`'s `updateChampion()` is
called from `renderDetail()` on **every** client, ungated by mode, so any
spectator whose detail screen was built for that game already got the full
takeover and the confetti from synced game state alone.

The real hole was narrower and worth fixing anyway: the moment was tied to
whichever game a viewer happened to have open. `renderDetail()` only ever
renders `openGameId`, so a spectator who had wandered into a different game saw
nothing at all. `meta.celebrate` fixes that by making the moment global.

Two things to keep in mind if this is ever revisited:

- **`at` is an opaque change marker, not a timestamp.** Nothing compares it
  against the local clock. Twenty-five phones have twenty-five slightly wrong
  clocks, and a wall-clock freshness test would have some replaying an old
  takeover and others never firing. Clients seed from the first remote
  snapshot they apply and react only to changes after that.
- **Both trigger paths are kept on purpose.** The local observation is
  instant; the broadcast is what reaches someone on a different screen. They
  are de-duplicated in `app.js` rather than either being removed, so a failed
  stamp write cannot cost a viewer the moment they were already going to see.

Spectator presence / true viewer counts remain impossible and out of scope:
they would need unauthenticated writes that `firebase-rules.json` forbids.

## Gotchas that cost time — read before editing

1. **`build.py` scans the whole output for `<!doctype`, `<html`, `<head`,
   `<body` — including inside comments.** Writing `<html>` in a CSS comment
   fails the build. Say "the root element" instead.

2. **Always confirm the build actually wrote.** `python build.py … | tail -2`
   hides `BUILD FAILED` (it goes to stderr, and the exit code is masked by the
   pipe). Grep for `Wrote|FAILED` instead. Two builds silently did not apply
   before this was noticed.

3. **`.x.panel` out-specifies `.x`.** Neutralising the `panel` class in CSS
   silently ate the podium's medal rules. The builders no longer add `panel`
   to anything except `.match`; keep it that way rather than fighting
   specificity.

4. **Instrument Serif ships one weight (400) plus italic.** Any
   `font-weight: 700` on a heading triggers synthetic bolding and looks like a
   rendering fault. Hierarchy comes from size, italic and tracking.

5. **Full-viewport `mix-blend-mode` is very expensive.** The film grain's
   `overlay` blend alone cost about a third of the frame budget. Over a ground
   this dark, plain alpha compositing is indistinguishable.

6. **Animate `transform`, never `background-position`.** The circuit grid's
   pulse used `background-position` and repainted a masked full-viewport layer
   every frame.

7. **Put `filter: blur()` on the element that is transformed**, not its parent.
   Blurring a parent whose children move forces a re-blur every frame.

8. **Large additive blits are slow.** Caching planets as sprites and drawing
   them under `globalCompositeOperation = "lighter"` dropped the game screen to
   6 fps. Planets are drawn with normal compositing *before* the additive pass —
   they should occlude, not add.

9. **Build once, then patch.** `store.js` reconciles every 3 s
   (`FB_POLL_MS = 3000`). Any module that rebuilds its DOM wholesale will kill
   CSS animations, focus and count-ups. `ui-board.js` still rebuilds and must
   be converted before points can animate.

10. **`hidden` loses to author rules that set `display`.** Use the existing
    `setHidden(el, hide)` helper, which sets inline `display`.

11. **The champion overlay auto-dismisses after 7 s**, which is shorter than a
    screenshot round-trip. Pass `holdMs` when inspecting it, or slow GSAP with
    `gsap.globalTimeline.timeScale(0.06)` to catch a transition mid-flight.

---

## Not in scope (flagged, deliberately not changed)

- **The game copy.** `deskripsi` values ship as author shorthand ("seru lah
  pokonya", "ini juga") and `pengusul` casing is inconsistent (`bar`, `zan`,
  `REG` — and `REG` matches no roster kode; `RGZ` is the closest). This is the
  team's own voice and data. A five-minute change to `data.js` if wanted.
- **A light theme.** Dropped by decision.
- **Spectator presence / true viewer counts.** Blocked by the write rules.

---

## Verification checklist before deploying

```bash
cd games
python build.py --standalone   # must print "Wrote …"
python build.py
node test_engine.mjs           # 5088 assertions
node test_api.mjs              # 40 assertions
```

In a browser against `public/index.html`:

- All screens render; nav switches; the game detail back button works.
- **Operator** (`?op=<token>` from `.env.local`): attendance toggles, draw runs
  with its reveal, bracket picks advance, reset confirms.
- **Spectator** (no `?op=`): everything visible, nothing clickable, follows the
  operator's active game, **and receives the champion takeover**.
- **Stage** (`?stage=1` or the nav toggle): no chrome, follows the operator
  through lobby → draw → bracket → champion → standings, Esc exits, and the
  champion takeover holds for 15s rather than 7s.
- **Reduced motion** (DevTools → Rendering → emulate `prefers-reduced-motion`):
  the starfield paints one static frame, warps become instant scene swaps,
  nothing jitters, the app is fully usable.
- **Widths** 360 / 1024 / 1920.
- **Operator AT 360.** This checklist used to test "Operator" and "Widths" as
  separate lines and never crossed them, which is exactly where every problem
  in the section above was hiding. Check: chrome above the first roster row
  stays ~160px, the control bar sits above the nav, the connection chip is in
  the top band and over nothing tappable, group columns stack with no name
  truncated, and no screen scrolls past the end of its own content.
- **Spectator at 360 is unchanged** -- full head, subtitle, division strip,
  sticky-top controls, chip bottom-right. If a spectator phone looks like the
  operator's, the `[data-mode]` gate has been lost.
- **Frame rate** during the champion takeover with confetti and starfield
  running together.
- **Contrast** ≥4.5:1 on gold-on-gold-soft, all four group colours, and the
  muted text tokens.

Deploy: `vercel --prod` — only when explicitly asked.
