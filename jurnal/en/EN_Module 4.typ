#import "/template/template.typ": journal-cover, code-box, code-file, template, answer-lines
#show: template

#journal-cover(
  module: 4,
  topic: "LONG RANGE COMMUNICATION (LoRa PEER-TO-PEER)",
  lang: "en"
)

#pagebreak()

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Circuit and System

#pad(left: 0.5cm)[
  This module uses peer-to-peer LoRa in the form of a game: one Beacon board
  is hidden, and every group hunts it by listening to how strong its signal
  is. Because peer-to-peer LoRa has no protocol managing the channel for you,
  every network rule --- when each board may transmit, and how it avoids
  colliding with the others --- is one you build yourselves. The hunt doubles
  as a vehicle for learning how radio signal strength relates to distance.
]

#pad(left: 0.5cm)[
  *How the game works.* An assistant hides *one* Beacon board somewhere within
  range of the hotspot. That beacon transmits continuously, five times a
  second. Each group holds one Hunter board that *only listens*, then reports
  the signal strength it catches to the scoreboard over Wi-Fi. The closer you
  are, the stronger the reading. The first group actually holding the Beacon
  board wins.
]

1. Prepare the following components:
#pad(left: 0.5cm)[
  #table(
    columns: (auto, auto, 1fr),
    stroke: none,

    [•], [Cosmic LoRa Aurora V2] , [(1x per group, as the Hunter)],
    [•], [Cosmic LoRa Aurora V2] , [(1x per class, as the Beacon)],
    [•], [920 MHz LoRa Antenna]  , [(1x per board)],
    [•], [Orange Pi 4 PRO]       , [(1x per class, hotspot and scoreboard)],
    [•], [Power bank or a long USB cable], [(1x per group)],
  )
]

2. Unlike the previous modules, this module uses *no external sensor or actuator at all*: what is being measured is the radio wave itself. There is therefore nothing to wire --- fit the antenna and power the board up. The table below records the radio pins already wired inside the board and used by the program.

// Flip the value below to false while the schematic file is still missing.
// While it stays false, Typst never touches the image file, so the journal can
// still be compiled.
#let schematic-ready = false

#if schematic-ready {
  figure(image("/schematics/Module 4.png", height: 6cm))
} else {
  figure(
    box(
      width: 100%,
      height: 6cm,
      stroke: (paint: luma(160), thickness: 0.7pt, dash: "dashed"),
    )[
      #align(center + horizon)[
        #text(fill: luma(120))[Module 4 LoRa Hunt topology diagram (to follow)]
      ]
    ]
  )
}

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 4, [*RFM95W radio pins on the Cosmic LoRa Aurora V2*]),
  ),
  [*Signal*]  , [*Pin*] , [*Signal*]        , [*Pin*],
  [RFM (NSS)] , [GPIO15], [RFM (DIO0)]      , [GPIO27],
  [RFM (RST)] , [GPIO0] , [RFM (SCK)]       , [GPIO18],
  [RFM (MISO)], [GPIO19], [RFM (MOSI)]      , [GPIO23],
  [RFM (EN)]  , [GPIO32], []                , [],
)

#pad(left: 0.5cm)[
  _Note: fit the 920 MHz antenna *before* the USB cable goes in. Transmitting
  without an antenna can damage the radio permanently, and that applies to the
  Beacon board as much as to a Hunter. GPIO 15, 0, 27, 32, 18, 19 and 23 are
  already taken by the radio module and must not be used for anything else. A
  Hunter needs no voltage divider because nothing is wired to it._
]

#pad(left: 0.5cm)[
  *File assignment per group.* Every group has its own folder with its group
  number already in it. Copy your group's folder and upload `hunter.ino` to
  your board --- there is no line to edit. The `beacon.ino` inside that folder
  is identical for every group and is only uploaded by an assistant, to the
  Beacon board.
]

#table(
  columns: (auto, 1.5fr, auto, 1.5fr),
  align: (center + horizon),

  table.header([*Group*], [*Program folder*], [*Group*], [*Program folder*]),
  [1], [`modul4/grup1/`], [5], [`modul4/grup5/`],
  [2], [`modul4/grup2/`], [6], [`modul4/grup6/`],
  [3], [`modul4/grup3/`], [7], [`modul4/grup7/`],
  [4], [`modul4/grup4/`], [--], [--],
)

3. Before running the program, prepare your working environment in the following order. Tick every step you have completed!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Fitting the 920 MHz antenna to the board *before* plugging the USB cable in],
    [☐], [Installing the `LoRa` library by Sandeep Mistry through the Arduino IDE Library Manager],
    [☐], [Installing the `WebSockets` library by Markus Sattler through the Arduino IDE Library Manager],
    [☐], [Selecting the ESP32 Dev Module board in the Arduino IDE],
    [☐], [Checking that the Orange Pi has its `IRIS-IOT` hotspot and its scoreboard running],
    [☐], [Copying your group's folder, then uploading `hunter.ino` without editing anything],
    [☐], [Checking that the Serial Monitor prints an IP address and a synchronised clock],
    [☐], [Opening the scoreboard at `http://192.168.4.1:8080`, entering your own student ID, and confirming it is your group that appears],
    [☐], [Calibrating the distance reference: hold one Hunter exactly 1 metre from the Beacon, then press *Calibrate 1 m* on its card],
    [☐], [Turning on *Distance ticks* on whichever phone is leading the group, and setting its screen timeout to 5 minutes before setting off],
  )
]

#pad(left: 0.5cm)[
  _Regulatory note: the band permitted in Indonesia is 920--923 MHz (AS923-2),
  so the frequency used in this practicum is `920E6`. The values `433E6`,
  `866E6` and `915E6` belong to other regions and *must not* be used here. The
  beacon transmits at SF7 with 250 kHz bandwidth, so one packet is only about
  20 milliseconds in the air; with a 200 millisecond gap the channel is busy
  roughly a tenth of the time. A rate that dense is only appropriate for a
  short, low-power practicum session; a permanently installed AS923 device is
  kept far below it._
]

#pad(left: 0.5cm)[
  _Transmit power note: the beacon's power is matched to the *size of the
  arena*, not turned up as far as it goes. At 20 dBm the whole building reads
  as equally strong and the beacon becomes impossible to find; but at too low a
  power the farthest group never hears it at all and the game dies just as
  surely. The default `BEACON_TX_POWER` is *10 dBm*, which by link budget at
  SF7 is still audible at roughly a kilometre outdoors and a few hundred metres
  inside a walled building. Use 2 for a single room, 10 for one floor of a
  building, and 14 for a large building._
]

4. Complete the program below by filling in the blank sections. Afterwards (or while completing it), retype the blank sections you have filled in using the VS Code/Arduino IDE application prepared by your respective lab assistants!

#pad(left: 0.5cm)[
  Blank sections are marked with an underscore run `________` and numbered `(1)`
  through `(6)` in the comment to their right. Replace each underscore run with
  the correct code following the hint in its comment.
  All four radio values --- frequency, spreading factor, bandwidth and sync
  word --- must match exactly between Hunter and Beacon; if even one differs,
  the packets are never heard at all.
]

#code-box(
  title: "Hunter Source Code — LoRa Hunt (Cosmic LoRa Aurora V2)",
  code-file("/kode_praktikum/en/modul4/grup1/hunter.ino", excerpt: true)
)

#code-box(
  title: "Beacon Source Code — LoRa Hunt (Cosmic LoRa Aurora V2)",
  code-file("/kode_praktikum/en/modul4/grup1/beacon.ino", excerpt: true)
)

5. Record the configuration you used in the following table! The first four radio values must match exactly between Hunter and Beacon for any packet to be read.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Value used*]),
  [Operating frequency (`LORA_FREQUENCY`)]     , [],
  [Spreading factor (`LORA_SPREADING_FACTOR`)] , [],
  [Bandwidth (`LORA_BANDWIDTH`)]               , [],
  [Sync word (`LORA_SYNC_WORD`)]               , [],
  [Beacon transmit power (`BEACON_TX_POWER`)]  , [],
  [Beacon interval (`BEACON_PERIOD_MS`)]       , [],
  [Hotspot name and address (`WIFI_SSID` / `SERVER_HOST`)], [],
  [Group number (`GROUP_ID`) and your board's IP address], [],
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Analysis

1.	Draw the communication flow implemented in the system you have worked on!

#box(
  width: 100%,
  height: 8cm,
  stroke: 1pt + black,
)[]

2.	Next, a response-time experiment will be carried out for packets sent from the *Beacon* to your group's *Hunter*. Open the Hunter board's Serial Monitor; every packet it catches is printed with its packet number, raw RSSI, smoothed RSSI and SNR. The *send time* is carried by the packet itself from the Beacon, while the *receive time* is stamped by the Hunter as the packet arrives, so both can be read from the same Serial Monitor. The same numbers also appear on the scoreboard at `http://192.168.4.1:8080`. Record:
   - *FIVE (5)* rows of readings: packet number, RSSI, SNR, send time and receive time
   Both times are recorded in *HH:MM:SS:MS* format. Compute the *one-way delay* by subtracting the send time from the receive time. This module has no round-trip column because a Hunter never transmits at all.

#pad(left: 0.5cm)[
  _Note: the Beacon and the Hunters all synchronise their clocks over NTP to
  the *same Orange Pi*, not to the Internet --- the practicum hotspot has no
  route out. Because both ends start from one source of time, the difference
  between them is valid and may be subtracted, even though the Orange Pi's own
  absolute clock may be several seconds off the real time. If a board fails to
  synchronise, its timestamp is *not* a wall clock and that row must be left
  blank. RSSI and SNR can only be measured at the receiving end, so both come
  from the Hunter._
]

#table(
  columns: (0.72fr, 0.62fr, 0.72fr, 0.62fr, 1.2fr, 1.2fr, 0.94fr),
  align: (center + horizon),

  table.header(
    [Trial\ no. ...],
    [Packet\ no.],
    [RSSI\ *\[dBm\]*],
    [SNR\ *\[dB\]*],
    [Send time\ _(Beacon)_\ *\[HH:MM:SS:MS\]*],
    [Receive time\ _(Hunter)_\ *\[HH:MM:SS:MS\]*],
    [One-way delay\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],[],
  [2.], [],[],[],[],[],[],
  [3.], [],[],[],[],[],[],
  [4.], [],[],[],[],[],[],
  [5.], [],[],[],[],[],[],
  table.cell(colspan: 6, [*Average one-way delay (ms)*]), []
)

3.	Finally, test how honest RSSI really is as a distance indicator. The scoreboard shows an *estimated distance in metres*, but that number is computed from RSSI with a _log-distance_ model --- it is not measured. Place the Hunter board at three distances you measure yourself with a tape, then record both the smoothed RSSI *and* the scoreboard's estimate for each position. Try one of them with a wall or your own body blocking the line of sight to the Beacon, and compare the difference.

#table(
  columns: (0.8fr, 1fr, 1fr, 1.1fr, 1.1fr),
  align: (center + horizon),

  table.header(
    [Position],
    [Real distance\ _(tape)_\ *\[m\]*],
    [Smoothed RSSI\ *\[dBm\]*],
    [Scoreboard estimate\ *\[m\]*],
    [Obstacle?\ _(yes / no)_],
  ),
  [Near]  , [],[],[],[],
  [Middle], [],[],[],[],
  [Far]   , [],[],[],[],
)

#pad(left: 0.5cm)[
  _Note: that estimate in metres comes from_
  $ d = 10^((P_(1"m") - "RSSI") / (10 n)) $
  _where $P_(1"m")$ is the RSSI at one metre (the value you just calibrated) and
  $n$ is the path-loss exponent, here 2.0 because the hunt is played on open
  ground; inside a partitioned building it is 2.5--3.5. The formula
  assumes the signal fades smoothly with distance --- an assumption that
  collapses the moment a wall is in the way. That is why the scoreboard always
  shows a range rather than a single number. Notice too that the range *widens
  in proportion to the distance itself*: a $plus.minus 6$ dB uncertainty means
  "10 m" is really 6--17 m, while "800 m" is really 460--1390 m. RSSI is
  therefore useful for guiding your steps once you are close, and very nearly
  useless as a statement of distance while you are still far away._
]

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

4. Write your *analysis* of the system you experimented with earlier in the fill-in section below!
(Also give the *relationship/correlation* by applying the *communication methodology* you are studying in this module; it does not have to be complete!)

#answer-lines(count: 6)

#pagebreak()

= Suggestions and Feedback

1. Assistant
#answer-lines(count: 3)
2. Laboratory
#answer-lines(count: 3)

#v(1fr)

#align(center + bottom)[
  #text(size: 14pt, weight: "bold")[</> Babai </>]\
  #text(size: 14pt, weight: "bold")[\#IRIS]
]
