#import "/template/template.typ": journal-cover, code-box, code-file, schematic-figure, jawab, template
#show: template

#journal-cover(
  module: 1,
  topic: "BLUETOOTH LOW ENERGY (BLE) CONNECTIVITY",
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

    [•], [ESP32 DevKit V1 (DOIT)
           or ESP32-S3]      , [(2x)],
    [•], [10 kΩ Potentiometer]   , [(1x)],
    [•], [SG90 Servo]            , [(1x)],
    [•], [Breadboard]            , [(2x)],
    [•], [Wires/Jumpers]         , [(as needed)],
  )
]

2. Build the following circuit using the tools and components you have prepared! (POT: Potentiometer, SRV: Servo)

#schematic-figure("/schematics/Module 1.png", lang: "en")

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Central \/ Client*]),
    table.cell(colspan: 2, [*Peripheral \/ Server*]),
  ),
  [*Component*]    , [*Pin*] , [*Component*]     , [*Pin*],
  [POT (left leg)] , [GND]   , [SRV (brown)]     , [GND],
  [POT (wiper)]    , [GPIO34], [SRV (red)]       , [VIN (5V)],
  [POT (right leg)], [3V3]   , [SRV (orange)]    , [GPIO16]
)

#pad(left: 0.5cm)[
  _Note: GPIO34 is an input-only pin and belongs to ADC1, the only ADC that can
  still be read while the BLE radio is on. An SG90 servo draws an inrush current
  the 3V3 regulator cannot supply, so its red wire must be taken from the VIN
  (5 V) pin with a common ground. The ESP32-S3 has no ADC on GPIO34, so on that
  board the potentiometer moves to GPIO4 by enabling `#define BOARD_ESP32S3` in
  the Central program._
]

#pad(left: 0.5cm)[
  *Group identity.* Change `GROUP_ID` in *both* programs to your group number
  (1 to 8); both UUIDs derive from it automatically. If two groups use the
  same `GROUP_ID`, one group's Central can connect to another group's
  Peripheral.
]

3. Before running the program, prepare your working environment in the following order. Tick every step you have completed!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Installing the `ESP32Servo` library through the Arduino IDE Library Manager],
    [☐], [Selecting the ESP32 Dev Module board in the Arduino IDE for both boards],
    [☐], [Changing `GROUP_ID` in *both* programs to your group number],
    [☐], [Removing the `//` in front of `#define BOARD_ESP32S3` when using an ESP32-S3 board],
    [☐], [Connecting the servo's red wire to VIN, not to 3V3],
    [☐], [Syncing *both* boards' clocks from the same PC: `.\scripts\send_time.ps1 -Port COM_A,COM_B`],
  )
]

4. Complete the program below by filling in the blank sections. Afterwards (or while completing it), retype the blank sections you have filled in using the VS Code/Arduino IDE application prepared by your respective lab assistants!

#pad(left: 0.5cm)[
  Blank sections are marked with an underscore run `________` and numbered `(1)`
  through `(6)` in the comment to their right. Replace each underscore run with
  the correct code following the hint in its comment.
  Remember that the service UUID and the characteristic UUID on the Central side
  must match the values on the Peripheral side exactly.
]

#code-box(
  title: "Central/Client Source Code — Bluetooth Low Energy (ESP32)",
  code-file("/kode_praktikum/en/modul1_ble_central.ino", excerpt: true)
)

#code-box(
  title: "Peripheral/Server Source Code — Bluetooth Low Energy (ESP32)",
  code-file("/kode_praktikum/en/modul1_ble_peripheral.ino", excerpt: true)
)

5. Record the configuration you used in the following table! These two UUIDs are what must match exactly between the Central and Peripheral sides for a connection to form, because BLE filters its counterpart by the service UUID, not by the device name.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Value used*]),
  [Central device name (`centralName`)]           , [],
  [Peripheral device name (`peripheralName`)]     , [],
  [Group number and its UUID pair]                , [],
  [`SERVICE_UUID` _(first 4 characters only)_]    , [],
  [`CHARACTERISTIC_UUID` _(first 4 characters only)_], [],
  [Potentiometer pin on the Central (`POT_PIN`)]  , [],
  [Servo pin on the Peripheral (`SERVO_PIN`)]     , [],
  [Angle change threshold (`DEADBAND_DEG`)]       , [],
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Analysis

1.	Draw the communication flow implemented in the system you have worked on!

#jawab(kode: "m1.diagram_alur", jenis: "gambar", lang: "en")

2.	Next, a response-time experiment will be carried out for data sent from the *Central/Client* to the *Peripheral/Server*. First open *TWO (2)* Serial Monitors to observe the output of the *Central/Client* and the *Peripheral/Server*. Every time the potentiometer is turned far enough, the Central Serial Monitor prints the *send time* along with the angle sent, then prints the *round-trip* delay as soon as the echo from the Peripheral arrives; meanwhile the Peripheral Serial Monitor prints the *receive time* along with the servo angle applied. Record:
   - *FIVE (5)* pairs of readings: the send time and angle from the Central Serial Monitor, together with the receive time and servo angle from the Peripheral Serial Monitor
   Both times are recorded in *HH:MM:SS:MS* format. Compute the *one-way delay* by subtracting the send time from the receive time, then compare it against the round-trip delay the Central prints for itself.

#pad(left: 0.5cm)[
  _Note: neither board has Internet access, so their clocks are set from the PC
  clock over Serial. Run `send_time.ps1` with *both boards' COM ports at once*
  so the two clocks agree to within milliseconds and the one-way delay is
  valid to compute. If only one board synced (it prints "time since boot"),
  use the round-trip column instead._
]

#table(
  columns: (0.78fr, 0.82fr, 1.22fr, 1.22fr, 0.99fr, 0.99fr),
  align: (center + horizon),

  table.header(
    [Trial\ no. ...],
    [Servo angle\ *\[degrees\]*],
    [Send time\ _(Central)_\ *\[HH:MM:SS:MS\]*],
    [Receive time\ _(Peripheral)_\ *\[HH:MM:SS:MS\]*],
    [One-way delay\ *\[ms\]*],
    [Round-trip delay\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],
  [2.], [],[],[],[],[],
  [3.], [],[],[],[],[],
  [4.], [],[],[],[],[],
  [5.], [],[],[],[],[],
  table.cell(colspan: 4, [*Average delay (ms)*]), [], []
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

3. Write your *analysis* of the system you experimented with earlier in the fill-in section below!
(Also give the *relationship/correlation* by applying the *communication methodology* you are studying in this module; it does not have to be complete!)

#jawab(kode: "m1.analisis", jenis: "teks", lang: "en")

#v(1fr)

#align(center + bottom)[
  #text(size: 14pt, weight: "bold")[</> Babai </>]\
  #text(size: 14pt, weight: "bold")[\#IRIS]
]
