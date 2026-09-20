// IRIS ASO — Touying slide theme
//
// Dark navy "code-walkthrough" theme matching the lab's existing deck
// design: a full-bleed background image (with the logo tab and "IRIS
// Laboratory" mark baked into its pixels), a small LoRa icon top-right,
// a big bold white centered title, light near-white rounded "code cards"
// holding syntax-highlighted source, and a cream callout box.
// Both the Indonesian and English Module 4 decks import this single file.
//
// Usage (top of a deck):
//   #import "template/slides.typ": *
//   #show: iris-theme.with(title: "...", subtitle: "...", lang: "id")
//   #title-slide(title: [...], topic: [...], lang: "id")
//   #section-slide[Section name]
//   #slide(title: [...])[ ... ]
//   #cards-row(code-card(caption: [...])[...], code-card(caption: [...])[...])
//   #note-box[...]

#import "@preview/touying:0.7.4": *

// ---------------------------------------------------------------------
// MEASURED SLIDE CAPACITY (verified empirically on this theme — a slide
// that exceeds these silently spills onto a second physical page with no
// warning at all, so treat them as hard limits):
//
//   one full-width card ....................... 13 code lines
//   one full-width card + note-box ............ 10 code lines
//   two side-by-side cards .................... 13 code lines each
//   two side-by-side cards + note-box ......... 10 code lines each
//
// Re-measured empirically after raising _margin-top from 2.4cm to 2.9cm
// (needed so a wide/centered slide title clears the baked-in logo tab in
// bg-template.png — its lowest point sits at 2.57cm, so 2.4cm was not
// enough clearance and titles were overlapping it). Every text-heavy
// two-column theory slide and one code slide needed re-trimming after
// this change; re-verify the full deck's page count after any further
// margin adjustment.
//
// Always check the page count after adding a slide.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Brand palette. Exported for downstream slides that need to color a
// table cell, a chart line, a manual box, etc.
// ---------------------------------------------------------------------
#let color-accent   = rgb("#40b0ff") // IRIS cyan-blue — brand accent, reads well on navy
#let color-background = rgb("#0d2444") // flat dark navy page fill
#let color-card      = rgb("#f6f8fb") // near-white code-card background
#let color-card-border = rgb("#d8dee6") // soft light-gray card border
#let color-code-text = rgb("#1c1c1c") // dark text/code fill used inside cards
#let color-note-bg     = rgb("#fdf4d4") // cream/pale-yellow note-box fill
#let color-note-border = rgb("#c9a227") // amber note-box border
#let color-note-text   = rgb("#1c1c1c") // dark note-box text

#let iris-font = "Cantarell"

// Logos, as project-root-absolute Typst paths (compile with --root .).
// Kept exported for backward compatibility even though the theme no longer
// draws them programmatically (they are baked into bg-template.png /
// cover-id.png / cover-en.png now) — harmless to leave in place.
#let logo-iris   = "/template/logo_iris.png"
#let logo-telkom = "/Module - IRIS IoT/assets/logo_telkom.png"

// New image assets: full-slide background, per-language finished covers,
// and the small top-right LoRa icon. All project-root-absolute Typst
// paths (compile with --root .).
#let bg-template = "/presentasi/template/bg-template.png"
#let cover-id-img = "/presentasi/template/cover-id.png"
#let cover-en-img = "/presentasi/template/cover-en.png"
#let lora-icon = "/presentasi/template/lora-icon.png"

#let iris-year = "2026"

#let _labels = (
  id: (
    course: "PRAKTIKUM PEMROGRAMAN PERANGKAT IOT",
    faculty: "FAKULTAS TEKNIK ELEKTRO",
    uni: "UNIVERSITAS TELKOM",
  ),
  en: (
    course: "IOT DEVICE PROGRAMMING PRACTICUM",
    faculty: "SCHOOL OF ELECTRICAL ENGINEERING",
    uni: "TELKOM UNIVERSITY",
  ),
)

// ---------------------------------------------------------------------
// Page geometry. The top/bottom margins exist to hold clear of the
// baked-in artwork in bg-template.png: the logo tab occupies roughly the
// left 16% x top 15% of the slide, and the "IRIS Laboratory" mark
// occupies roughly the right 16% x the 93%-97% height band. The top
// margin also clears the new top-right LoRa icon (placed with its own
// negative offset so it sits flush against the true corner regardless of
// margin).
// ---------------------------------------------------------------------
// Measured against bg-template.png: the baked-in logo tab's lowest point
// is 15.4% of the slide height (2.57cm on this page size). _margin-top
// must clear that PLUS a title's font ascent, or a wide/centered slide
// title's left edge collides with the tab — this happened at the old
// 2.4cm value and is why it now sits well above 2.57cm.
#let _margin-top    = 2.9cm
#let _margin-bottom = 1.5cm
#let _margin-x      = 1.3cm

// Full-bleed background image, used as the page `background:` (sits
// behind content, never affects layout/flow).
#let _bg = image(bg-template, width: 100%, height: 100%)

// Small LoRa icon placed near the top-right corner of every content/
// section slide (never on the covers). Deliberately NOT flush against the
// true page edge (dx/dy of exactly -_margin-top / +_margin-x): content
// placed exactly on the physical page boundary gets its outermost pixel
// row/column clipped by some PDF renderers/viewers, which is why a small
// inset is subtracted here.
#let _lora-badge = place(
  top + right,
  dx: _margin-x - 0.12cm,
  dy: -_margin-top + 0.12cm,
  image(lora-icon, width: 1.4cm),
)

// ---------------------------------------------------------------------
// Low-level slide primitive (mirrors touying's themes/default.typ shape)
// used as the `slide-fn` for heading-driven subslides and as the base
// every public constructor below builds on.
// ---------------------------------------------------------------------
#let _raw-slide(
  config: (:),
  repeat: auto,
  setting: body => body,
  composer: auto,
  ..bodies,
) = touying-slide-wrapper(self => {
  touying-slide(
    self: self,
    config: config,
    repeat: repeat,
    setting: setting,
    composer: composer,
    ..bodies,
  )
})

// ---------------------------------------------------------------------
// 1. iris-theme(..) — top-level `#show:` rule.
//
//    #show: iris-theme.with(
//      title: "Module 4 — LoRa", subtitle: "...", author: "...",
//      date: "2026", lang: "id",
//    )
//
//    Sets 16:9 aspect ratio, Cantarell font, the full-bleed background
//    image (bg-template.png, which already contains the logo tab and the
//    "IRIS Laboratory" mark baked into its pixels), and default white
//    body text on every slide. `author` and `date` are optional (default
//    `none`); `lang` is "id" or "en" (default "id") and is threaded
//    through to `title-slide`/`section-slide` callers.
// ---------------------------------------------------------------------
#let iris-theme(
  title: "",
  subtitle: none,
  author: none,
  date: none,
  lang: "id",
  body,
) = {
  show: touying-slides.with(
    config-page(
      ..utils.page-args-from-aspect-ratio("16-9"),
      margin: (top: _margin-top, bottom: _margin-bottom, x: _margin-x),
      fill: color-background,
      background: _bg,
      header: none,
      footer: none,
    ),
    config-common(slide-fn: _raw-slide),
    config-colors(
      primary: color-accent,
      neutral-lightest: white,
      neutral-darkest: color-background,
    ),
    config-info(title: title, subtitle: subtitle, author: author, date: date),
  )
  set text(font: iris-font, fill: white, size: 22pt)
  set heading(numbering: none)
  show heading.where(level: 1): set text(fill: white, weight: "bold")
  show heading.where(level: 2): set text(fill: color-accent, weight: "bold")
  // Bold text on the navy body reads as an accent-color highlight. This
  // rule is intentionally NOT allowed to leak into code-card / note-box —
  // both of those set their own `show strong` locally to override it.
  show strong: set text(fill: color-accent)
  body
}

// ---------------------------------------------------------------------
// 2. title-slide(..) — full-bleed cover.
//
//    #title-slide(title: [Module 4], topic: [LoRa Peer-to-Peer],
//      subtitle: [...], author: [...], lang: "id")
//
//    The cover is now a single finished image, picked by `lang`
//    ("id" -> cover-id.png, anything else -> cover-en.png), rendered
//    full-bleed with nothing drawn on top — no logo tab, no LoRa icon,
//    no title/topic/subtitle/author text, no institutional block. All of
//    that is already baked into the image's pixels. `title`, `topic`,
//    `subtitle`, and `author` are UNUSED — they are kept only as
//    parameters so existing call sites in both decks keep compiling
//    unchanged; only `lang` has any effect.
// ---------------------------------------------------------------------
#let title-slide(
  title: none,
  topic: none,
  subtitle: none,
  author: none,
  lang: "id",
) = _raw-slide(config: config-common(freeze-slide-counter: true))[
  #let cover-img = if lang == "id" { cover-id-img } else { cover-en-img }
  // Cover the ENTIRE physical page, ignoring the page margin, so the
  // finished cover image sits truly full-bleed with no white/navy border
  // and no bg-template.png bleed-through around its edges.
  #layout(avail => place(
    top + left,
    dx: -_margin-x,
    dy: -_margin-top,
    image(
      cover-img,
      width: avail.width + 2 * _margin-x,
      height: avail.height + _margin-top + _margin-bottom,
    ),
  ))
]

// ---------------------------------------------------------------------
// 3. section-slide(title) — divider slide announcing a new section.
//
//    #section-slide[Wiring & Schematic]
//
//    `title` is POSITIONAL.
// ---------------------------------------------------------------------
#let section-slide(title) = _raw-slide(
  config: config-common(freeze-slide-counter: true),
)[
  #_lora-badge
  #set align(center + horizon)
  // `stack` (not two separate block-level elements) is deliberate: plain
  // consecutive blocks each carry Typst's default ~1.2em above/below
  // spacing, which stacked up as a much bigger line-to-title gap than the
  // v(0.5em) between them suggested. `stack` gives one exact, predictable
  // gap instead.
  #stack(
    dir: ttb,
    spacing: 1.5em,
    line(length: 22%, stroke: 1.5pt + color-accent),
    text(size: 1.8em, weight: "bold", fill: white)[#title],
  )
]

// ---------------------------------------------------------------------
// 4. slide(title: .., body) — standard content slide on the navy field.
//
//    #slide(title: [Wiring Diagram])[
//      #cards-row(code-card(...), code-card(...))
//    ]
//
//    `title` is a NAMED argument (not positional); `body` is the single
//    trailing content block. Keep furniture compact — content that is
//    slightly too tall silently spills onto a second physical page.
// ---------------------------------------------------------------------
#let slide(title: none, body) = _raw-slide[
  #_lora-badge
  #if title != none {
    align(center, text(size: 1.45em, weight: "bold", fill: white)[#title])
    v(0.3em)
  }
  #body
]

// ---------------------------------------------------------------------
// 5. code-card(caption: none, body) — light rounded card for source code.
//
//    #code-card(caption: [Import Library])[
//      #code-src("/kunci_jawaban/id/modul4_lora_p2p_transmitter.ino",
//        from: 19, to: 20)
//    ]
//
//    Pass the SAME explicit `height:` (e.g. `height: 4.2cm`) to every card
//    in a `cards-row` so their captions line up on one baseline; with the
//    default `auto` each card sizes to its own content and the captions sit
//    at different heights.
//
//    Renders `body` (typically a `code-src(..)` raw block) inside a
//    near-white rounded card with dark, readable text — this explicitly
//    overrides the theme's global white text and accent-colored bold, so
//    code and any bold text inside the card stay dark instead of
//    disappearing. An optional bold white centered caption is placed
//    below the card.
// ---------------------------------------------------------------------
// Shared card chrome. `height: 100%` makes a card stretch to its grid row.
#let _card-block(height: auto, body) = block(
  width: 100%,
  height: height,
  fill: color-card,
  stroke: .6pt + color-card-border,
  radius: 8pt,
  inset: (x: .6em, y: .4em),
)[
  // Code is ALWAYS flush left, even if the card sits inside a centered
  // context — otherwise short snippets drift to the middle of the card.
  #set align(left)
  #set par(justify: false)
  #set text(fill: color-code-text, size: .68em)
  #show strong: set text(fill: color-code-text)
  #body
]

#let code-card(caption: none, height: auto, body) = {
  _card-block(height: height, body)
  if caption != none {
    v(0.25em)
    align(center, text(fill: white, weight: "bold", size: .85em)[#caption])
  }
}

// ---------------------------------------------------------------------
// 6. code-src(path, from: none, to: none, lang: "cpp") — syntax-highlighted
//    source straight from disk, kept in sync with the real files instead
//    of duplicating code onto slides.
//
//    #code-src("/kunci_jawaban/id/modul4_lora_p2p_transmitter.ino",
//      from: 39, to: 43, lang: "cpp")
//
//    `strip-hints` (default true) drops trailing "// (n) ..." blank markers
//    carried over from the practicum sources: the completed code shown here
//    has no blanks for them to point at, and they wrap badly inside a card.
//
//    `path` is project-root-absolute (compile with --root .). `from`/`to`
//    are 1-based, inclusive line numbers; omit both for the whole file.
//    Any indentation shared by every selected line (e.g. lines sliced out
//    of the middle of a function) is stripped, so a snippet starts flush
//    at column 0 instead of rendering awkwardly indented.
// ---------------------------------------------------------------------
#let code-src(path, from: none, to: none, lang: "cpp", strip-hints: true) = {
  let lines = read(path).split("\n")
  // The practicum sources carry trailing "// (n) ..." markers pointing at the
  // fill-in blanks students complete. These slides show the COMPLETED code, so
  // those markers refer to nothing that is on screen, and they are long enough
  // to wrap badly inside a narrow card. Stripped by default; ordinary
  // explanatory comments are kept.
  if strip-hints {
    lines = lines.map(l => l.replace(regex("\\s*//\\s*\\(\\d+\\).*$"), ""))
  }
  let from-idx = if from != none { from - 1 } else { 0 }
  let to-idx = if to != none { to } else { lines.len() }
  lines = lines.slice(from-idx, to-idx)

  let indent-of(line) = line.len() - line.trim(" ", at: start).len()
  let nonblank = lines.filter(l => l.trim() != "")
  let min-indent = if nonblank.len() == 0 {
    0
  } else {
    nonblank.map(indent-of).fold(int.max, calc.min)
  }
  let stripped = lines.map(l => if l.len() >= min-indent {
    l.slice(min-indent)
  } else {
    l
  })

  raw(stripped.join("\n"), lang: lang, block: true)
}

// ---------------------------------------------------------------------
// 7. note-box(body) — cream/amber callout for warnings and reminders.
//
//    #note-box[Ingat *UUID* tiap perangkat *harus unik!*]
//
//    Dark text on a pale-yellow card; bold text stays dark (this locally
//    overrides the theme's global accent-colored `strong` rule so bold
//    words don't turn navy-on-cream or otherwise wash out).
// ---------------------------------------------------------------------
#let note-box(body) = block(
  width: 100%,
  fill: color-note-bg,
  stroke: 1pt + color-note-border,
  radius: 8pt,
  inset: (x: .8em, y: .45em),
)[
  #set text(fill: color-note-text, size: .8em)
  #show strong: set text(fill: color-note-text, weight: "bold")
  #body
]

// ---------------------------------------------------------------------
// 8. cards-row(captions: (..), ..bodies) — 2+ code cards side by side.
//
//    #cards-row(
//      captions: ([Import Library], [Variable]),
//      code-src("/kunci_jawaban/id/modul4_lora_p2p_transmitter.ino",
//        from: 19, to: 20),
//      code-src("/kunci_jawaban/id/modul4_lora_p2p_transmitter.ino",
//        from: 39, to: 43),
//    )
//
//    Pass the card BODIES positionally and their captions as the `captions`
//    array, in the same order. This builds the cards itself rather than
//    taking pre-built `code-card`s, because that is what lets every card in
//    the row share one grid row height: each card stretches to the tallest
//    one, so the captions underneath line up on a single baseline. Building
//    the cards separately and passing them in cannot do that — each would
//    size to its own content and the captions would sit at different
//    heights. Use `code-card` only for a single standalone card.
//
//    Never give a card a fixed height smaller than its content: a block
//    does not scroll, it simply clips, and the lost lines are silent.
// ---------------------------------------------------------------------
#let cards-row(captions: (), ..bodies) = layout(avail => {
  let items = bodies.pos()
  let n = items.len()
  let gutter = 10pt
  // Each card is measured at the width it will actually occupy, then every
  // card in the row is given the tallest measured height. Do NOT use
  // `height: 100%` here: that resolves against the remaining page space,
  // not the grid row, so the cards balloon and shove the rest of the slide
  // onto a second physical page.
  let col-width = (avail.width - gutter * (n - 1)) / n
  let heights = items.map(b => measure(block(width: col-width, _card-block(b))).height)
  let row-height = calc.max(..heights)
  grid(
    columns: (1fr,) * n,
    column-gutter: gutter,
    row-gutter: 0.3em,
    ..items.map(b => _card-block(height: row-height, b)),
    ..items.enumerate().map(((i, _)) => if i < captions.len() {
      align(center, text(fill: white, weight: "bold", size: .85em)[#captions.at(i)])
    } else { [] }),
  )
})

// ---------------------------------------------------------------------
// Re-exported Touying authoring helpers, so a content file only needs to
// import this one theme file: pause, uncover, only, cols, side-by-side,
// speaker-note, etc. all come along automatically via the wildcard
// import above.
// ---------------------------------------------------------------------
