// #include does NOT propagate #import bindings in Typst — every file that
// uses theme helpers (slide, section-slide, note-box, ...) must re-import
// the theme itself, even though the parent deck already imported it.
#import "/presentasi/template/slides.typ": *

// ---------------------------------------------------------------------
// Section: LoRa Theory (3 slides — LoRaWAN slides removed, this module is
// peer-to-peer only)
// ---------------------------------------------------------------------

#section-slide[LoRa Theory]

#slide(title: [LoRa: A Modulation Technique, Not a Network Protocol])[
  #set text(size: .95em)
  LoRa (*Long Range*) is a *spread spectrum radio modulation technique*, not
  a network protocol. Its key traits:

  - *Long* range, *low* data rate, *low* power consumption.
  - Operates in the *sub-GHz* band, whose regulations differ by region.

  #v(0.3em)
  #align(center, text(size: .8em)[
    Example applications: smart agriculture #sym.dot.c smart cities
    #sym.dot.c industrial monitoring #sym.dot.c environmental sensing
  ])
]

#slide(title: [Where LoRa, CSS, and Its Parameters Fit])[
  #set text(size: .93em)
  #cols(columns: (1.1fr, 1fr), gutter: 1em)[
    #align(center, block(fill: white, radius: 8pt, inset: 6pt)[
      #image("/Module - IRIS IoT/gambar/modul 4/LoRa - Bandwidth.png", height: 3.4cm)
    ])
    #align(center, text(size: .68em)[
      LoRa compared to Wi-Fi and BLE (Modules 1-2): long range, low data
      rate.
    ])
  ][
    LoRa uses *Chirp Spread Spectrum (CSS)* — frequency sweeps up and down
    over time, so the signal stays recognizable below the *noise floor*.

    #v(0.25em)
    *Spreading Factor (SF) trade-off:*
    #v(0.15em)
    #text(size: .78em)[
      SF up #sym.arrow.r range up, sensitivity up, *airtime* up, data rate
      *down*.
    ]
    #v(0.2em)
    #align(center, text(size: .78em, fill: color-accent, weight: "bold")[
      This practicum uses SF12
    ])
  ]
]

#slide(title: [Airtime & AS923-2 Regulation])[
  #set text(size: .95em)
  *Airtime* is how long a single packet stays on air while being
  transmitted. It matters because it affects:

  - Compliance with the *duty cycle*
  - The chance of *collisions* between packets
  - The device's *battery consumption*

  #align(center, text(size: .8em, style: "italic")[
    Airtime will be measured directly in this practicum's hunt experiment.
  ])

  #v(0.3em)
  #note-box[
    Regional band plans: *EU863-870* (Europe), *US902-928* (Americas).
    Indonesia uses *AS923-2*, the *920-923 MHz* band #sym.arrow.r code
    `LORA_FREQUENCY 920E6`. The values `433E6`, `866E6`, `915E6` belong
    to other regions — do not use them.
  ]
]

