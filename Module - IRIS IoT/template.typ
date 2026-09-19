#import "data_asisten.typ": lab-name-short, updated-year, logo-image, module-year

// -----------------------------------------------------
// Document settings
// -----------------------------------------------------
#let font-typeface = "Cantarell"
#let font-size      = 11pt
#let language       = "id"
#let indent         = 1cm

#let logo-box-width = 3cm
#let logo-height    = 3cm

#let color-accent     = rgb("#40b0ff")
#let color-foreground = rgb("#1c1c1c")
#let color-background = rgb("#191919")

#let header-text-color  = color-accent
#let footer-text-color  = color-foreground
#let line-color         = color-accent

#let line-width       = 3pt
#let header-line-gap  = -0.5cm
#let footer-line-gap  = -0.3cm

#let bibliography-file = "references.bib"

#let labels = (
  id: (
    module: "MODUL",
    objectives: "TUJUAN",
    requirements: "REQUIREMENT",
    example: "Contoh",
    important: "Penting",
    figure: "Gambar",
    table: "Tabel",
  ),
  en: (
    module: "MODULE",
    objectives: "OBJECTIVES",
    requirements: "REQUIREMENTS",
    example: "Example",
    important: "Important",
    figure: "Figure",
    table: "Table",
  ),
)

#let label(lang, key) = labels.at(lang).at(key)

// Counter used for module-scoped image numbering, e.g. 1.1, 1.2.
#let module-counter = counter("module")

// Running header state for the main matter.
#let running-header = state("running-header", lab-name-short + " " + updated-year)
#let set-running-header(content) = running-header.update(content)
#let current-running-header() = context running-header.get()

// -----------------------------------------------------
// Page chrome
// -----------------------------------------------------
#let header-logo(path) = box(
  width: logo-box-width,
  height: logo-height,
)[
  #if path != none {
    align(center + horizon)[
      #image(path, width: logo-box-width, height: logo-height, fit: "contain")
    ]
  }
]

#let top-bar(short-title: auto, left-logo: logo-image) = block(width: 100%)[
  // Keeps the header aligned with the top margin.
  #set text(size: 1pt)

  #let resolved-title = if short-title == auto {
    current-running-header()
  } else {
    short-title
  }

  #grid(
    columns: (auto, 1fr),
    align: horizon,
    [#pad(bottom: 12pt)[#header-logo(left-logo)]],
    [
      #align(right)[
        #text(size: 14pt, fill: header-text-color, weight: "bold")[#resolved-title]
      ]
    ],
  )

  #v(header-line-gap)
  #line(length: 100%, stroke: line-width + line-color)
]

#let bottom-bar(left, right) = block(width: 100%)[
  #line(length: 100%, stroke: line-width + line-color)
  #v(footer-line-gap)

  #set text(size: 11pt, fill: footer-text-color, weight: "bold")

  #grid(
    columns: (1fr, auto),
    align: horizon,
    [
      #move(dy: -4pt)[
        #left
        #text(fill: color-accent)[#right #module-year]
      ]
    ],
    [
      #move(dy: -4pt)[
        #box(fill: color-accent, radius: 0pt, inset: (x: 12pt, y: 5pt))[
          #text(fill: white, weight: "bold")[
            #context counter(page).display(page.numbering)
          ]
        ]
      ]
    ],
  )
]

// -----------------------------------------------------
// Reusable blocks
// -----------------------------------------------------


#let code-box(title: none, lang: language, body) = {
  let box-title = if title == none { label(lang, "example") } else { title }

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


#let info-box(title: "Information", body) = {
  block(width: 100%, inset: 6pt, stroke: 0.8pt + black, fill: rgb("#d8efff"))[
    #set par(first-line-indent: 0cm)
    #text(weight: "bold")[#title] \
    #body
  ]
}

// Inline code helper.
#let code(body, lang: "cpp") = raw(body, lang: lang, block: false)

// -----------------------------------------------------
// Typography and code-rendering rules
// -----------------------------------------------------
#let front-heading(it) = block(width: 100%, above: 1em, below: 1em)[
  #align(center)[#text(size: 17pt, weight: "bold")[#it.body]]
]

#let rendered-raw-block(it) = {
  set par(justify: false, leading: 0.55em)
  set text(size: 0.9em)

  let lines = it.text.split("\n")
  let line-count = lines.len()
  let gutter-width = 1.7em
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
        #for n in range(1, line-count + 1) {
          align(right)[#text(size: 0.9em, fill: luma(140), str(n))]
          if n < line-count { v(-0.455em) }
        }
      ],

      block(width: separator-width, fill: luma(205)),

      block(width: 100%, inset: (top: 0.65em, bottom: 0.5em, left: 0pt, right: 0.65em))[
        #it
      ],
    )
  ]
}

#let practicum-template(lang: language, body) = {
  set text(font: font-typeface, size: font-size, fill: color-foreground, lang: lang)
  set par(justify: true, leading: 0.65em, first-line-indent: (amount: indent, all: true))
  set enum(indent: 0.3cm, body-indent: 0.4cm)
  set list(indent: 0.3cm, body-indent: 0.4cm)

  show heading.where(level: 1): front-heading
  show raw.where(block: true): rendered-raw-block

  body
}

// -----------------------------------------------------
// Intro-only image block
// -----------------------------------------------------
// Use this for introduction images. It prints captions as
// "Gambar 1: ...", "Gambar 2: ..." but DOES NOT create a
// Typst `figure`, so it will not enter Daftar Gambar and will
// not affect module figure counters.
#let intro-image-counter = counter("intro-image")

#let intro-figure(body, caption, lang: language) = {
  intro-image-counter.step()

  context {
    let n = intro-image-counter.get().first()

    block(width: 100%, above: 0.8em, below: 0.8em)[
      #set par(first-line-indent: 0pt)
      #align(center)[#body]
      #v(0.35em)
      #align(center)[
        #text(size: 10pt)[#label(lang, "figure") #n: #caption]
      ]
    ]
  }
}

// -----------------------------------------------------
// Module opening page
// -----------------------------------------------------
#let modul_page(
  modul_number: 1,
  modul_title: [],
  tujuan: [],
  requirements: [],
  lang: language,
) = {
  
  let module-number = if type(modul_number) == int { 
    modul_number 
  } else { 
    int(modul_number) 
  }

  counter(heading).update((module-number,))
  // Reset image figures.
  counter( figure.where(kind: image) ).update(0)
  
  // Reset table figures.
  counter( figure.where(kind: table) ).update(0)

  set enum(numbering: "1)", indent: 0pt, body-indent: 0.6em)
  set par(first-line-indent: 0cm)

  let module-label = label(lang, "module")
  set-running-header([#lab-name-short #updated-year])

  show heading.where(level: 1): it => block(width: 100%)[
    #if module-number == 0 {
      text(size: 24pt, weight: "bold")[#modul_title]
      line(length: 50%, stroke: 2.5pt + color-accent)
      v(1em)
    } else {
      text(size: 24pt, weight: "bold")[#module-label #module-number]
      pad(left: 0.5cm)[#text(size: 20pt, weight: "regular")[#modul_title]]
      line(length: 100%, stroke: 2.5pt + color-accent)
      v(1em)
    }
  ]

  if module-number == 0 {
    align(center + horizon)[
      #heading(level: 1, numbering: none)[#modul_title]
    ]
  } else {
    heading(level: 1, numbering: none)[#module-label #module-number: #modul_title]
  }

  if tujuan != [] {
    text(size: 18pt, weight: "bold")[#label(lang, "objectives")]
    v(0em)
    text(size: 13pt)[#tujuan]
  } else {}

  if requirements != [] {
    text(size: 18pt, weight: "bold")[#label(lang, "requirements")]
    v(0em)
    text(size: 13pt)[#requirements]
  }
}