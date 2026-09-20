// #include does NOT propagate #import bindings in Typst — every file that
// uses theme helpers (slide, section-slide, note-box, ...) must re-import
// the theme itself, even though the parent deck already imported it.
#import "/presentasi/template/slides.typ": *

// ---------------------------------------------------------------------
// Bagian: Teori LoRa (3 slide -- slide LoRaWAN dihapus, modul ini
// peer-to-peer saja)
// ---------------------------------------------------------------------

#section-slide[Teori LoRa]

#slide(title: [LoRa: Teknik Modulasi, Bukan Protokol Jaringan])[
  LoRa (*Long Range*) adalah teknik *modulasi radio spread spectrum*, bukan
  protokol jaringan. Sifat utamanya:

  - Jangkauan *jauh*, laju data *rendah*, konsumsi daya *rendah*.
  - Beroperasi di pita *sub-GHz*, yang ketentuannya berbeda menurut wilayah.

  #v(0.4em)
  #align(center, text(size: .85em)[
    Contoh aplikasi: pertanian pintar #sym.dot.c kota pintar #sym.dot.c
    pemantauan industri #sym.dot.c penginderaan lingkungan
  ])
]

#slide(title: [Posisi LoRa, CSS, dan Parameternya])[
  #set text(size: .93em)
  #cols(columns: (1.1fr, 1fr), gutter: 1em)[
    #align(center, block(fill: white, radius: 8pt, inset: 6pt)[
      #image("/Module - IRIS IoT/gambar/modul 4/LoRa - Bandwidth.png", height: 3.4cm)
    ])
    #align(center, text(size: .68em)[
      LoRa dibandingkan Wi-Fi dan BLE (Modul 1–2): jangkauan jauh, laju
      data rendah.
    ])
  ][
    LoRa memakai *Chirp Spread Spectrum (CSS)* — frekuensi menyapu naik-turun
    terhadap waktu, sehingga sinyal tetap dikenali di bawah *noise floor*.

    #v(0.25em)
    *Trade-off Spreading Factor (SF):*
    #v(0.15em)
    #text(size: .78em)[
      SF naik #sym.arrow.r jangkauan naik, sensitivitas naik, *airtime*
      naik, laju data *turun*.
    ]
    #v(0.2em)
    #align(center, text(size: .78em, fill: color-accent, weight: "bold")[
      Praktikum ini memakai SF12
    ])
  ]
]

#slide(title: [Airtime & Regulasi AS923-2])[
  #set text(size: .95em)
  *Airtime* adalah lamanya satu paket berada di udara saat ditransmisikan.
  Nilainya penting karena memengaruhi:

  - Kepatuhan terhadap *duty cycle*
  - Peluang *tabrakan* antar paket
  - *Konsumsi baterai* perangkat

  #align(center, text(size: .8em, style: "italic")[
    Airtime akan diukur langsung pada eksperimen perburuan praktikum ini.
  ])

  #v(0.3em)
  #note-box[
    Rencana pita regional: *EU863-870* (Eropa), *US902-928* (Amerika).
    Indonesia memakai *AS923-2*, pita *920–923 MHz* #sym.arrow.r kode
    `LORA_FREQUENCY 920E6`. Nilai `433E6`, `866E6`, `915E6` milik wilayah
    lain — jangan dipakai.
  ]
]

