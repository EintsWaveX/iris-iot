#import "/template/template.typ": journal-cover, code-box, code-file, schematic-figure, jawab, template
#show: template

#journal-cover(
  module: 2,
  topic: "WEBSOCKET COMMUNICATION WITH A LOCAL SERVER",
  lang: "en"
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Circuit and System

1. Prepare the following components:
#pad(left: 0.5cm)[
  #table(
    columns: (auto, auto, 1fr),
    stroke: none,

    [•], [ESP32 DevKit V1 (DOIT)], [(1x)],
    [•], [Orange Pi 4 PRO]       , [(1x, as the local server)],
    [•], [DHT22 Sensor]          , [(1x)],
    [•], [Breadboard]            , [(1x)],
    [•], [Wires/Jumpers]         , [(as needed)],
  )
]

2. Build the following circuit using the tools and components you have prepared! (DHT: DHT22 Sensor)

#schematic-figure("/schematics/Module 2.png", lang: "en")

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Client (ESP32 DevKit V1 (DOIT))*]),
    table.cell(colspan: 2, [*Server (Orange Pi 4 PRO)*]),
  ),
  [*Component*], [*Pin*],
    table.cell(colspan: 2, [*Component*]),

  [DHT (VCC)]  , [3V3],
    table.cell(colspan: 2, rowspan: 3, inset: 8pt)[
      No additional circuit.\
      The WebSocket server runs entirely in software,
      so the Orange Pi only needs to be on the same
      Wi-Fi network as the ESP32.
    ],
  [DHT (DATA)] , [GPIO16],
  [DHT (GND)]  , [GND],
)

#pad(left: 0.5cm)[
  _Note: a DHT22 must not be read more often than once every 2 seconds; a
  tighter interval returns `NAN`. This module uses no actuator at all: the
  ESP32 only reads and sends, while the Orange Pi only records and replies with
  its own receive time._
]

#pad(left: 0.5cm)[
  *Path assignment per group.* The server tells each group's board apart by its
  path, so several groups can send to one and the same server without
  disturbing each other. Use only your own group's path.
]

#table(
  columns: (auto, 1fr, auto, 1fr),
  align: (center + horizon),

  table.header([*Group*], [*`WS_PATH`*], [*Group*], [*`WS_PATH`*]),
  [1], [`/grup1`], [5], [`/grup5`],
  [2], [`/grup2`], [6], [`/grup6`],
  [3], [`/grup3`], [7], [`/grup7`],
  [4], [`/grup4`], [8], [`/grup8`],
)

3. Before running the program, prepare your working environment in the following order. Tick every step you have completed!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Installing the `DHT sensor library` and `Adafruit Unified Sensor` libraries through the Arduino IDE Library Manager],
    [☐], [Installing the `WebSockets` library by Markus Sattler through the Arduino IDE Library Manager],
    [☐], [Preparing the `websockets` virtual environment on the Orange Pi (see the box below)],
    [☐], [Noting the Orange Pi's IP address with `hostname -I`],
    [☐], [Matching the port and path values across both program files],
  )
]

#pad(left: 0.5cm)[
  _Package requirement: the `websockets.asyncio.server` module only exists in
  `websockets` version 13 and above, while the package shipped with the system
  is usually older._

  #v(0.2cm)
  ```bash
  python3 -m venv ~/venv-iris
  source ~/venv-iris/bin/activate
  pip install "websockets>=13"
  ```
]

4. Complete the program below by filling in the blank sections. Afterwards (or while completing it), retype the blank sections you have filled in using the VS Code/Arduino IDE application (for the ESP32) and the text editor on the Orange Pi (for the Python server) prepared by your respective lab assistants!

#pad(left: 0.5cm)[
  Blank sections are marked with an underscore run `________` and numbered `(1)`
  through `(6)` in the comment to their right. Replace each underscore run with
  the correct code following the hint in its comment.
  Note that the *port* and *path* values on the Python server must match the
  values used in the ESP32 code exactly.
]

#code-box(
  title: "Server Source Code — WebSocket (Python, Orange Pi)",
  code-file("/kode_praktikum/en/modul2_websocket_server.py", lang: "python", excerpt: true)
)

#code-box(
  title: "Client Source Code — WebSocket (ESP32)",
  code-file("/kode_praktikum/en/modul2_websocket_esp32.ino", excerpt: true)
)

5. Record the configuration you used in the following table! The top three values must match exactly between the Python server file and the ESP32 file, otherwise the WebSocket connection will never form.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Value used*]),
  [Orange Pi IP address (`WS_HOST` / `hostname -I`)], [],
  [Server port (`PORT` / `WS_PORT`)]                   , [],
  [WebSocket path (`WS_PATH`)]                         , [],
  [Wi-Fi network name (`WIFI_SSID`)]                   , [],
  [DHT22 data pin on the ESP32 (`DHT_PIN`)]           , [],
  [Sampling interval (`SAMPLE_INTERVAL_MS`)]          , [],
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Analysis

1.	Draw the communication flow implemented in the system you have worked on!

#jawab(kode: "m2.diagram_alur", jenis: "gambar", lang: "en")

2.	Next, a response-time experiment will be carried out for data sent from the *Client (ESP32)* to the *Server (Orange Pi)*. First open the Serial Monitor on the ESP32 and the Python server terminal on the Orange Pi. Every 2 seconds the ESP32 prints its *send time* with a sequence number and the DHT22 reading, while the Orange Pi terminal prints the *receive time* with the same sequence number, temperature and humidity; that number is what pairs a line on one display with a line on the other. The server's reply carries no command, only the sequence number and its receive time in the `at` field, so both times can still be read from the ESP32 Serial Monitor alone. Record:
   - *FIVE (5)* pairs of readings: the send time, temperature and humidity from the ESP32 Serial Monitor, together with the receive time from the Orange Pi terminal
   Both times are recorded in *HH:MM:SS:MS* format. Compute the *one-way delay* by subtracting the send time from the receive time, then compare it against the round-trip delay the ESP32 prints for itself.

#pad(left: 0.5cm)[
  _Note: the ESP32 and the Orange Pi synchronise over NTP (`configTime()` on
  the ESP32, systemd-timesyncd on the Orange Pi), so their times are valid to
  subtract. NTP accuracy over Wi-Fi is around 10--50 ms, so a one-way delay
  that isn't exactly half the round-trip delay is normal._
]

#table(
  columns: (0.72fr, 0.62fr, 0.86fr, 1.14fr, 1.14fr, 0.90fr, 0.94fr),
  align: (center + horizon),

  table.header(
    [Trial\ no. ...],
    [Temp.\ *\[°C\]*],
    [Humidity\ *\[%\]*],
    [Send time\ _(ESP32)_\ *\[HH:MM:SS:MS\]*],
    [Receive time\ _(Orange Pi)_\ *\[HH:MM:SS:MS\]*],
    [One-way delay\ *\[ms\]*],
    [Round-trip delay\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],[],
  [2.], [],[],[],[],[],[],
  [3.], [],[],[],[],[],[],
  [4.], [],[],[],[],[],[],
  [5.], [],[],[],[],[],[],
  table.cell(colspan: 5, [*Average delay (ms)*]), [], []
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

3. Write your *analysis* of the system you experimented with earlier in the fill-in section below!
(Also give the *relationship/correlation* by applying the *communication methodology* you are studying in this module; it does not have to be complete!)

#jawab(kode: "m2.analisis", jenis: "teks", lang: "en")

#v(1fr)

#align(center + bottom)[
  #text(size: 14pt, weight: "bold")[</> Babai </>]\
  #text(size: 14pt, weight: "bold")[\#IRIS]
]
