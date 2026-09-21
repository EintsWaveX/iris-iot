#import "/template/template.typ": journal-cover, code-box, code-file, schematic-figure, jawab, template
#show: template

#journal-cover(
  module: 3,
  topic: "MQTT CONNECTIVITY WITH MICROPYTHON, RASPBERRY PI PICO W, AND ECLIPSE MOSQUITTO",
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

    [•], [Raspberry Pi Pico W]  , [(2x)],
    [•], [Orange Pi 4 PRO]      , [(1x, as the Mosquitto broker)],
    [•], [10 kΩ Potentiometer]   , [(1x)],
    [•], [Breadboard]           , [(1x)],
    [•], [Wires/Jumpers]        , [(as needed)],
  )
]

2. Build the following circuit using the tools and components you have prepared! (POT: Potentiometer)

#schematic-figure("/schematics/Module 3.png", lang: "en")

#table(
  columns: 4 * (1fr,),
  align: (center + horizon),

  table.header(
    table.cell(colspan: 2, [*Publisher (Pico W)*]),
    table.cell(colspan: 2, [*Subscriber (Pico W)*]),
  ),
  [*Component*], [*Pin*],
    table.cell(colspan: 2, [*Component*]),

  [POT (VCC)]  , [3V3(OUT)],
    table.cell(colspan: 2, rowspan: 3, inset: 8pt)[
      No additional circuit.      The Subscriber only records the values that arrive,
      so the second Pico W just needs to be on the same
      Wi-Fi network as the Publisher.
    ],
  [POT (OUT)]  , [GP26 (ADC0)],
  [POT (GND)]  , [GND],
)

#pad(left: 0.5cm)[
  _Note: the Pico W's ADC input only tolerates up to 3.3 V, so the
  potentiometer's top leg must be fed from 3V3(OUT) (physical pin 36), not from
  the 5 V VBUS. Its middle leg (the wiper) must land on one of the ADC pins,
  that is GP26, GP27 or GP28. The Eclipse Mosquitto broker runs on the Orange Pi
  4 PRO and needs no additional circuit. Make sure both Pico W boards and the
  Orange Pi are on the same Wi-Fi network._
]

#pad(left: 0.5cm)[
  *Topic assignment per group.* Every group uses its own topic, so your group's
  potentiometer is only recorded by your group's Subscriber. Change `group_id`
  in *both* programs to your group number; the topic and `mqtt_client_id` follow
  it automatically.
]

#table(
  columns: (auto, 1.3fr, 1fr, 1fr),
  align: (center + horizon),

  table.header(
    [*Group*],
    [*Topic*],
    [*`mqtt_client_id`*\ _(Publisher)_],
    [*`mqtt_client_id`*\ _(Subscriber)_],
  ),
  [1], [`iris/grup1/pot`], [`grup1-pub`], [`grup1-sub`],
  [2], [`iris/grup2/pot`], [`grup2-pub`], [`grup2-sub`],
  [3], [`iris/grup3/pot`], [`grup3-pub`], [`grup3-sub`],
  [4], [`iris/grup4/pot`], [`grup4-pub`], [`grup4-sub`],
  [5], [`iris/grup5/pot`], [`grup5-pub`], [`grup5-sub`],
  [6], [`iris/grup6/pot`], [`grup6-pub`], [`grup6-sub`],
  [7], [`iris/grup7/pot`], [`grup7-pub`], [`grup7-sub`],
  [8], [`iris/grup8/pot`], [`grup8-pub`], [`grup8-sub`],
)

#pad(left: 0.5cm)[
  _An assistant can watch every group at once from the Orange Pi by subscribing
  to the wildcard topic:_ `mosquitto_sub -h localhost -t 'iris/+/pot' -v`
]

3. Before running the program, first prepare the Eclipse Mosquitto broker on the Orange Pi in the following order. Tick every step you have completed!

#pad(left: 0.5cm)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    row-gutter: 0.35em,

    [☐], [Installing the packages: `sudo apt update` then `sudo apt install mosquitto mosquitto-clients`],
    [☐], [Enabling autostart: `sudo systemctl enable mosquitto.service`],
    [☐], [Noting the Orange Pi's IP address with `hostname -I`],
    [☐], [Editing `/etc/mosquitto/mosquitto.conf`, adding `listener 1883` and `allow_anonymous true`],
    [☐], [Restarting the service: `sudo systemctl restart mosquitto.service`],
    [☐], [Installing the `micropython-umqtt.simple` library on both Pico W boards through Thonny],
    [☐], [Powering the potentiometer from 3V3(OUT), not VBUS, and wiring its wiper to GP26],
  )
]

#pad(left: 0.5cm)[
  _Note: `allow_anonymous true` may only be used on an isolated practicum network.
  If your assistant asks for a broker with authentication, use
  `sudo mosquitto_passwd -c /etc/mosquitto/passwd <USERNAME>` and then fill in
  `mqtt_username` and `mqtt_password` in both program files._
]

4. Complete the program below by filling in the blank sections. Afterwards (or while completing it), retype the blank sections you have filled in using the Thonny application prepared by your respective lab assistants!

#pad(left: 0.5cm)[
  Blank sections are marked with an underscore run `________` and numbered `(1)`
  through `(6)` in the comment to their right. Replace each underscore run with
  the correct code following the hint in its comment.
  Note that the *topic* value must match exactly on the Publisher and the
  Subscriber, while `mqtt_client_id` must differ for every device.
]

#code-box(
  title: "Publisher Source Code — MQTT (MicroPython, Pico W)",
  code-file("/kode_praktikum/en/modul3_mqtt_publish.py", lang: "python", excerpt: true)
)

#code-box(
  title: "Subscriber Source Code — MQTT (MicroPython, Pico W)",
  code-file("/kode_praktikum/en/modul3_mqtt_subscribe.py", lang: "python", excerpt: true)
)

5. Record the configuration you used in the following table! Note that the *topic* must match exactly on both devices, while `mqtt_client_id` must instead differ; the broker will drop one of the clients if both use the same ID.

#table(
  columns: (1.4fr, 1fr),
  align: (left + horizon, center + horizon),

  table.header([*Parameter*], [*Value used*]),
  [Broker address (`mqtt_host` / `hostname -I`)]       , [],
  [Broker port (`listener` in `mosquitto.conf`)]       , [],
  [Topic (`mqtt_publish_topic` = `mqtt_receive_topic`)], [],
  [Publisher `mqtt_client_id`]                         , [],
  [Subscriber `mqtt_client_id`]                        , [],
  [Potentiometer pin on the Pico W (`ADC`)]            , [],
  [Change threshold (`deadband_pct`)]                  , [],
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

= Analysis

1.	Draw the communication flow implemented in the system you have worked on!

#jawab(kode: "m3.diagram_alur", jenis: "gambar", lang: "en")

2.	Next, a response-time experiment will be carried out for messages sent from the *Publisher* to the *Subscriber* through the MQTT broker. First open *TWO (2)* Thonny Shells/REPLs to observe the output of the *Publisher* and the *Subscriber*. Turn the potentiometer knob slowly: every time its position shifts past `deadband_pct`, the Publisher Shell prints the *publish time* along with the sample number and the position, while the Subscriber Shell prints the *receive time* along with the same sample number and position. That sample number is what pairs a line in one Shell with a line in the other. Record:
   - *FIVE (5)* pairs of readings: the publish time, sample number and position from the Publisher Shell, together with the receive time from the Subscriber Shell
   Both times are recorded in *HH:MM:SS:MS* format. Compute the *one-way delay* by subtracting the publish time from the receive time.

#pad(left: 0.5cm)[
  _Note: both Pico W boards synchronise over NTP (`ntptime.settime()`) as soon
  as they connect to Wi-Fi, so times from the two Shells are valid to
  subtract. Without this step, a Pico W's RTC starts at 1 January 2021. This
  module has no round-trip column because the Subscriber only records and
  echoes nothing back._
]

#table(
  columns: (0.78fr, 0.68fr, 0.86fr, 1.22fr, 1.22fr, 1.00fr),
  align: (center + horizon),

  table.header(
    [Trial\ no. ...],
    [Sample\ no.],
    [Position\ *\[%\]*],
    [Publish time\ _(Publisher)_\ *\[HH:MM:SS:MS\]*],
    [Receive time\ _(Subscriber)_\ *\[HH:MM:SS:MS\]*],
    [One-way delay\ *\[ms\]*],
  ),
  [1.], [],[],[],[],[],
  [2.], [],[],[],[],[],
  [3.], [],[],[],[],[],
  [4.], [],[],[],[],[],
  [5.], [],[],[],[],[],
  table.cell(colspan: 5, [*Average one-way delay (ms)*]), []
)

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

3. Write your *analysis* of the system you experimented with earlier in the fill-in section below!
(Also give the *relationship/correlation* by applying the *communication methodology* you are studying in this module; it does not have to be complete!)

#jawab(kode: "m3.analisis", jenis: "teks", lang: "en")

#v(1fr)

#align(center + bottom)[
  #text(size: 14pt, weight: "bold")[</> Babai </>]\
  #text(size: 14pt, weight: "bold")[\#IRIS]
]
