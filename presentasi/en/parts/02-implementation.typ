// #include does NOT propagate #import bindings in Typst — every file that
// uses theme helpers (slide, section-slide, note-box, ...) must re-import
// the theme itself, even though the parent deck already imported it.
#import "/presentasi/template/slides.typ": *

// ---------------------------------------------------------------------
// Section: Code implementation — a walkthrough of the Beacon and Hunter
// sketches for the LoRa Hunt game (Module 4), read straight from
// kunci_jawaban/en/modul4/grup1/*.ino.
//
// The line numbers in code-src() are read directly from the answer key
// files, so every time scripts/gen_modul4.py changes and is re-run, the
// ranges below must be re-checked.
//
// Watch the theme's capacity limits: 10 code lines per card once a
// note-box is present. Exceeding them silently spills the note-box onto
// an orphan page, so re-count the deck's pages after any edit here.
// ---------------------------------------------------------------------

#let hunter = "/kunci_jawaban/en/modul4/grup1/hunter.ino"
#let beacon = "/kunci_jawaban/en/modul4/grup1/beacon.ino"

#section-slide[Implementation — The LoRa Hunt]

// --- Topology ------------------------------------------------------------

#slide(title: [Why There Are No Time Slots Any More])[
  One *Beacon* board is hidden and transmits continuously. Six *Hunter*
  boards only *listen*, and report the signal strength they catch to the
  scoreboard over Wi-Fi.

  #v(0.4em)
  Only *one radio* in the room ever transmits, so a packet collision is
  impossible. The elaborate per-group second-slot scheme is no longer needed
  — not because it was fixed, but because the topology means the problem
  never arises.

  #v(0.5em)
  #note-box[
    Because peer-to-peer LoRa has no protocol managing the channel for you,
    every network rule is one you build yourselves.
  ]
]

// --- Beacon --------------------------------------------------------------

#slide(title: [Beacon — Radio Parameters])[
  #cards-row(
    captions: ([Frequency, SF, Bandwidth, Sync Word], [Transmit Power + Interval]),
    code-src(beacon, from: 42, to: 45),
    {
      code-src(beacon, from: 51, to: 51)
      v(0.3em)
      code-src(beacon, from: 55, to: 55)
    },
  )
  #v(0.5em)
  #note-box[
    Power is matched to the *size of the arena*. At 20 dBm the whole building
    reads as equally strong and the beacon is impossible to find; too low and
    the farthest group hears nothing. Default 10 dBm — a room 2, a building 14.
  ]
]

#slide(title: [Beacon — Radio `setup()`])[
  #cards-row(
    captions: ([Enable the Radio + SPI], [Modem Parameters + Power]),
    code-src(beacon, from: 105, to: 110),
    code-src(beacon, from: 117, to: 120),
  )
  #v(0.4em)
  #note-box[
    All four radio values must be *identical* on every Hunter. If even one
    differs, the packets do not error — they are simply *silent*.
  ]
]

#slide(title: [Beacon — `loop()`: Transmitting])[
  #cards-row(
    captions: ([200 ms Interval + Packet Number], [Build & Transmit]),
    code-src(beacon, from: 141, to: 149),
    code-src(beacon, from: 151, to: 153),
  )
  #v(0.4em)
  #note-box[
    `beginPacket()` prepares the buffer and `print()` fills it, but it is
    *`endPacket()`* that actually puts the packet on the air. Every packet
    carries a *sequence number* and its *send time*.
  ]
]

// --- Hunter --------------------------------------------------------------

#slide(title: [Hunter — Library & Radio Pins])[
  #cards-row(
    captions: ([Library Imports], [RFM95W Pins]),
    code-src(hunter, from: 15, to: 20),
    code-src(hunter, from: 35, to: 41),
  )
  #v(0.5em)
  #note-box[
    GPIO *15, 0, 27, 32, 18, 19* and *23* are already taken by the RFM95W
    radio module. A Hunter needs no voltage divider because nothing is wired
    to it.
  ]
]

#slide(title: [Hunter — Smoothing the RSSI])[
  #cards-row(
    captions: ([Median of 5 Readings], [EWMA on Top of It]),
    code-src(hunter, from: 78, to: 84),
    code-src(hunter, from: 98, to: 104),
  )
  #v(0.4em)
  #note-box[
    Indoors, RSSI jumps by as much as *10 dB* from wall reflections. Without
    both filters the distance bar is nothing but noise.
  ]
]

#slide(title: [Hunter — `loop()`: Catch & Report])[
  #cards-row(
    captions: ([Read Packet + RSSI], [Report over Wi-Fi]),
    code-src(hunter, from: 179, to: 187),
    {
      code-src(hunter, from: 195, to: 196)
      v(0.3em)
      code-src(hunter, from: 206, to: 206)
    },
  )
  #v(0.4em)
  #note-box[
    A Hunter's radio *never transmits*. The only thing leaving this board is
    a Wi-Fi report to the scoreboard — which is exactly why all six groups
    can hunt at the same time without interfering.
  ]
]

// --- Application layer ----------------------------------------------------

#slide(title: [Scoreboard — The Application Layer])[
  One RSSI reading crosses five layers before it becomes a number on screen:

  #v(0.3em)
  #set text(size: 0.92em)
  / Physical: the 920 MHz wave, SF7, 250 kHz — RSSI and SNR
  / Data link: LoRa packet numbering, lost packets, sync word
  / Network: an IP address from the Orange Pi's DHCP, one hop to its gateway
  / Transport: one WebSocket connection over TCP
  / Application: the ranking, the heat, and the winner

  #v(0.4em)
  #note-box[
    The scoreboard at `http://192.168.4.1:8080` shows all five layers with
    their live values, per group.
  ]
]

// --- Closing ---------------------------------------------------------

#slide[
  #v(1fr)
  #align(center)[
    #text(size: 1.6em, weight: "bold")[</> Babai </>] \
    #text(size: 1.6em, weight: "bold")[\#IRIS]
  ]
  #v(1fr)
]
