#let font = "Cantarell"

#let logo = "logo_iris.png"
#let year = "2026"
#let labels = (
  id : (
    module: "MODUL",
    title: "JURNAL PRAKTIKUM IOT",
    course: "PRAKTIKUM PEMROGRAMAN PERANGKAT IOT",
    faculty: "FAKULTAS TEKNIK ELEKTRO",
    uni: "UNIVERSITAS TELKOM",
    identifier: (
      group: "Kelompok",
      date: "Hari/Shift",
      code: "Kode Asisten Pengajar",
      name: "Nama",
      nim: "NIM"
    )
  ),
  en : (
    module: "MODULE",
    title: "IOT PRACTICUM JOURNAL",
    course: "IOT DEVICE PROGRAMMING PRACTICUM",
    faculty: "SCHOOL OF ELECTRICAL ENGINEERING",
    uni: "TELKOM UNIVERSITY",
    identifier: (
      group: "Group",
      date: "Day/Shift",
      code: "Instructor Assistant Code",
      name: "Name",
      nim: "NIM"
    )
  )
)

// Fallback caption when a schematic isn't ready yet, and the pointer #jawab()
// prints in place of a "gambar"/"teks" answer -- both text belong here, next
// to `labels`, since both are keyed the same way and change together.
#let schematic-pending-text = (
  id: "Skema rangkaian belum tersedia.",
  en: "Circuit schematic not yet available.",
)
#let jawab-pointer-text = (
  id: (
    gambar: "Gambar dijawab pada lembar jawaban / situs praktikum.",
    teks: "Dijawab pada lembar jawaban / situs praktikum.",
  ),
  en: (
    gambar: "Diagram answered on the answer sheet / practicum site.",
    teks: "Answered on the answer sheet / practicum site.",
  ),
)

#let color-accent     = rgb("#40b0ff")
#let color-foreground = rgb("#1c1c1c")
#let color-background = rgb("#191919")

#let header-text-color  = color-accent
#let footer-text-color  = color-foreground
#let line-color         = color-accent

#let _field-row(label, value: none) = {
  grid(
    columns: (30%, 2%, 60%),
    column-gutter: 0pt,
    align: (left, center, left),
    text(size: 12pt)[#label],
    text(size: 12pt)[:],
    box(
      width: 100%,
      height: 1.45em,
      inset: (left: 2pt, bottom: 2pt),
      stroke: (
        bottom: (
          paint: black,
          thickness: 0.55pt,
          dash: "dotted",
        ),
      ),
    )[
      #if value != none { text(size: 12pt)[#value] }
    ],
  )
}

#let header-logo(path) = box()[
  #if path != none {
    align(center + horizon)[
      #image(path, width: 4cm, fit: "contain")
    ]
  }
]

#let top-bar(short-title: auto, left-logo: logo) = block(width: 100%)[
  #set text(size: 1pt)
  #grid(
    columns: (auto, 1fr),
    align: horizon,
    [#pad(bottom: 12pt)[#header-logo(left-logo)]],
    [
      #align(right)[
        #text(size: 14pt, fill: header-text-color, weight: "bold")[IRIS LABORATORY]\
        #v(0.3cm)
        #text(size: 14pt, fill: header-text-color, weight: "bold")[2026]\
      ]
    ],
  )
  #v(-1cm)
]

// A page-1 header block rather than a dedicated cover page -- the identity
// fields and the institutional line are still all here, just compact enough
// that "= Rangkaian dan Sistem" starts on the same page beneath them.
#let journal-cover(
  module: "<FILL THE MODULE HERE>",
  topic: "<FILL THE TOPIC HERE>",
  lang: "id"
) = {
  align(center)[
    #text(size: 17pt, weight: "bold")[#labels.at(lang).title]
    #v(0.8mm)
    #text(size: 13pt, weight: "bold")[#labels.at(lang).module #module #sym.dot.c #topic]
  ]

  v(3mm)

  align(center)[
    #block(width: 130mm)[
      #_field-row(labels.at(lang).identifier.group)
      #v(1.2mm)
      #_field-row(labels.at(lang).identifier.date)
      #v(1.2mm)
      #_field-row(labels.at(lang).identifier.code)
      #v(1.2mm)
      #_field-row(labels.at(lang).identifier.name)
      #v(1.2mm)
      #_field-row(labels.at(lang).identifier.nim)
    ]
  ]

  v(3mm)

  align(center)[
    #text(size: 9pt, fill: luma(90))[
      #labels.at(lang).course #sym.dot.c #labels.at(lang).faculty #sym.dot.c #labels.at(lang).uni #sym.dot.c #year
    ]
  ]

  v(4mm)
  line(length: 100%, stroke: 0.5pt + luma(180))
  v(4mm)
}

// Hoists the schematic placeholder guard that was duplicated identically
// across all 8 journals. `ready: false` still renders the dashed placeholder
// box (used while a schematic is genuinely missing); every journal that has
// its PNG on disk should pass `ready: true`.
#let schematic-figure(path, ready: true, lang: "id") = {
  if ready {
    figure(image(path, height: 6cm))
  } else {
    figure(
      box(
        width: 100%,
        height: 6cm,
        stroke: (paint: luma(160), thickness: 0.7pt, dash: "dashed"),
      )[
        #align(center + horizon)[
          #text(fill: luma(120))[#schematic-pending-text.at(lang)]
        ]
      ]
    )
  }
}

// One declarative slot for a question the web form and the answer key will
// eventually key off `kode` (`jawaban.soalKode`). In print, "gambar" and
// "teks" answers no longer reserve blank space -- that space moved to a
// single generic answer sheet printed separately -- so this prints only a
// one-line pointer. "tabel" isn't handled here: the caller still writes its
// own #table() beside the #jawab() call, because the measurement scaffolding
// itself must always print.
#let jawab(kode: none, jenis: "teks", lang: "id") = {
  pad(left: 0.5cm)[
    #text(fill: luma(120), style: "italic", size: 0.85em)[
      #jawab-pointer-text.at(lang).at(jenis)
    ]
  ]
}

#let code(body, lang: "cpp") = raw(body, lang: lang, block: false)
#let code-box(title: none, body) = {
  let box-title = if title == none { "Kode Program" } else { title }

  block(width: 100%, clip: true, inset: 0pt)[
    #block(width: 100%, fill: color-accent, inset: 6pt, above: 0pt, below: 0pt)[
      #set par(first-line-indent: 0pt)
      #text(weight: "bold", fill: white)[#box-title]
    ]

    #block(width: 100%, inset: 0pt, above: 0pt, below: 0pt)[
      #set par(first-line-indent: 0pt)
      #body
    ]
  ]
}

// Code leading. The gutter below renders its numbers at the same font size and
// the same leading as the code itself, as one paragraph joined by linebreaks, so
// the two columns advance identically and the numbers cannot drift out of step
// with their lines. That means this value can be tuned freely.
#let code-leading = 0.42em

// Shared frame for every code listing: a grey line-number gutter, a hairline
// separator, and the highlighted code itself. `numbers` is one string per
// rendered row, so a caller can pass real file line numbers (and blanks for
// elision rows) instead of a plain 1..n run.
#let _code-frame(numbers, body) = {
  set par(justify: false, leading: code-leading)
  set text(size: 0.9em)

  // Wide enough for a three-digit line number at the code's own font size.
  let gutter-width = 2.4em
  let separator-width = 0.6pt

  block(
    width: 100%,
    fill: luma(250),
    stroke: 0.7pt + luma(220),
    radius: 3pt,
    inset: 0pt,
    above: 0pt,
    below: 0pt,
  )[
    #grid(
      columns: (gutter-width, separator-width, 1fr),
      column-gutter: 0.55em,

      block(width: gutter-width, fill: luma(240), inset: (top: 0.65em, bottom: 0.65em, right: 0.25em))[
        #set align(right)
        // Rendered as raw so the gutter inherits the code's monospace metrics.
        // A proportional font here advances at a different line height and the
        // numbers slide out of step with their lines further down a long listing.
        #text(fill: luma(150))[#raw(numbers.join("\n"))]
      ],

      block(width: separator-width, fill: luma(205)),

      block(width: 100%, inset: (top: 0.65em, bottom: 0.5em, left: 0pt, right: 0.65em))[
        #body
      ],
    )
  ]
}

#let rendered-raw-block(it) = {
  let line-count = it.text.split("\n").len()
  _code-frame(range(1, line-count + 1).map(str), it)
}

// Marker that flags a fill-in-the-blank slot in the practicum sources.
#let blank-marker = "________"

// Reads a practicum source file straight from kode_praktikum/ or kunci_jawaban/,
// so the .ino/.py file stays the single source of truth for the journal.
//
// With `excerpt: true` the listing is reduced to just the neighbourhoods of the
// fill-in-the-blank slots: every line containing `blank-marker`, plus `around`
// lines either side, with overlapping neighbourhoods merged. The gutter keeps the
// ORIGINAL line numbers so a student can still find the spot in the real file, and
// omitted stretches show as a single elision row. Nothing needs to be marked up in
// the source — the blanks are their own anchors — so the excerpt stays correct on
// its own as the sketches change. The one rule that follows from that: a source
// file's prose must never spell the marker out literally, or the header comment
// gets dragged into the excerpt as if it were a blank.
#let code-file(path, lang: "cpp", excerpt: false, around: 2) = {
  let lines = read(path).replace("\r\n", "\n").trim("\n").split("\n")

  if not excerpt {
    return raw(lines.join("\n"), lang: lang, block: true)
  }

  let hits = lines.enumerate().filter(p => p.at(1).contains(blank-marker)).map(p => p.at(0))
  if hits.len() == 0 {
    return raw(lines.join("\n"), lang: lang, block: true)
  }

  // Merge each blank's +/- context window into a set of disjoint ranges. Windows
  // that touch or overlap are fused so no one-line island is left behind.
  let windows = ()
  for h in hits {
    let lo = calc.max(0, h - around)
    let hi = calc.min(lines.len() - 1, h + around)

    // A window that runs onto blank lines just pads the listing, so pull its
    // edges back onto the nearest line that actually carries code.
    while lo < h and lines.at(lo).trim() == "" { lo += 1 }
    while hi > h and lines.at(hi).trim() == "" { hi -= 1 }

    let last = windows.len() - 1
    if windows.len() > 0 and lo <= windows.at(last).at(1) + 1 {
      windows.at(last).at(1) = calc.max(hi, windows.at(last).at(1))
    } else {
      windows.push((lo, hi))
    }
  }

  let shown = ()
  let numbers = ()
  for (w, window) in windows.enumerate() {
    if w > 0 {
      shown.push("\u{22EF}")
      numbers.push("")
    }
    for i in range(window.at(0), window.at(1) + 1) {
      shown.push(lines.at(i))
      numbers.push(str(i + 1))
    }
  }

  // Deliberately an inline raw: the `raw.where(block: true)` show rule would
  // otherwise wrap this in a second, sequentially numbered frame.
  _code-frame(numbers, raw(shown.join("\n"), lang: lang, block: false))
}

#let answer-lines(count: 3) = {
  for _ in range(count) [
    #v(0.65em)
    #line(length: 100%, stroke: 0.5pt + luma(70%))
  ]
}

#let template(body) = {
  show raw.where(block: true): rendered-raw-block
  set heading(numbering: "A.")
  set text(font: "Cantarell", fill: black)
  set page(
    paper: "a4",
    margin: (
      top: 3.2cm,
      bottom: 1.6cm,
      left: 2cm,
      right: 2cm,
    ),
    header: top-bar()
  )

  body
}