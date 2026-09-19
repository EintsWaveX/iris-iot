#import "@preview/suiji:0.5.1": *
#import "@preview/headcount:0.1.0": dependent-numbering, reset-counter
#import "template.typ": *
#import "data_asisten.typ": *

// Switch this to "en" for English UI labels and text hyphenation.
#let doc-lang = "en"

#show: practicum-template.with(lang: doc-lang)
#set text(hyphenate: false)

////////////////////////////////////////////////////////////////////////////////////////////

#set page(
  paper: "a4",
  margin: 0pt,
  header: none,
  footer: none,
  
)

#image(
  cover-image-id,
  width: 100%,
  height: 100%,
  fit: "cover",
  alt: "Art cover for the practicum module",
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 1.8cm, left: 2.2cm, right: 2.2cm),
  header: top-bar(short-title: lab-name-short + " " + updated-year),
  footer: bottom-bar(footer-right-text-en, footer-left-text-en),

  numbering: "i"
)

#counter(page).update(1)

////////////////////////////////////////////////////////////////////////////////////////////

= PRACTICUM MODULE DRAFTING TEAM

#align(center)[
  #stack(
    dir: ttb,
    spacing: 10pt,
    text(size: 14pt, weight: "bold")[
      #lab-name #module-year
    ],
    text(size: 14pt)[
      P304, Deli Building, Telkom University
    ],
  )
]

#table(
  columns: (4.5cm, 0.5cm, 8.5cm, 3cm),
  align: left,
  stroke: none,
  row-gutter: 0.75em,
  fill: none, 

  [],[],[],[], // Dummy, ignore this

  [Head of Laboratory],  [:], [#kepala-praktikum.at("nama")],   [],
  [Laboratory Supervisor], [:], [#pembina-praktikum.at("nama")], [],
  
  [Assistant Coordinator],  [:], koordinator-asisten.at("nama"), koordinator-asisten.at("nim"),
  [Person in Charge], [:], penanggung-jawab.at("nama"), penanggung-jawab.at("nim"),
  
  [Module Authors], [:],
)

#table(
  columns: (0.5cm,0.5cm, 12.5cm, 3cm),
  stroke: none,
  align: left,
  row-gutter: 0.75em,

  ..penyusun-praktikum.map(person => (
    [], [•], [#person.at("nama")], [#person.at("nim")],
  )).flatten(),
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 1.8cm, left: 1.0cm, right: 1.0cm),
)


= IRIS LABORATORY PRACTICUM ASSISTANTS #module-year

#{
  set text(size: 10pt)
  
  table(
    columns: (auto, auto, 1.6fr, 0.7fr, 1.8fr, auto, auto),
    align: (left, center, left, center, left, center, center),
    stroke: rgb("#d5d5d5"),
  
    ..("No.", "Student ID", "Name", "Assistant Code", "Position", "Phone Number", "LINE ID").map(strong),
  
    ..asistens.enumerate().map(((i, person)) => (
      str(i + 1),
      text[#person.at("nim")],
      text[#person.at("nama")],
      text[#person.at("kode")],
      text[#person.at("div-en")],
      text[#person.at("telp")],
      text[#person.at("line")],
    )).flatten(),
  )
}
#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 1.8cm, left: 2.2cm, right: 2.2cm),
)

////////////////////////////////////////////////////////////////////////////////////////////

= REVISION SHEET

#v(3em)

#par(first-line-indent: 0cm)[
  The undersigned:
]

#pad(left: indent)[
  #table(
    columns: (4.5cm, 0.5cm, auto),
    
    align: left,
    stroke: none,
    row-gutter: 0.75em,
    fill: none, 
  
    [Name]    ,[:], [#pembina-praktikum.at("nama")],
    [NIP]     ,[:], [#pembina-praktikum.at("nip")],
    [Position] ,[:], [Head of #lab-name Laboratory],
  )
]

#par(first-line-indent: 0cm)[
hereby certifies that the revision of the IoT Device Programming Module
for the Bachelor of Electrical Engineering Study Program has been completed as detailed below:
]

#table(
  columns: (auto, auto, 1fr, auto),
  stroke: rgb("#d5d5d5"),

  ..("No.", "Module", "Revision Description", "Final Revision Date").map(strong),

  ..revisions.at("en")
    .enumerate()
    .map(((i, revision)) => (
      str(i + 1), revision.at("module"), revision.at("description"), revision.at("date"),
  ))
  .flatten(),
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

= DECLARATION SHEET

#v(3em)

#par(first-line-indent: 0cm)[
  The undersigned:
]

#pad(left: indent)[
  #table(
    columns: (4.5cm, 0.5cm, auto),
    
    align: left,
    stroke: none,
    row-gutter: 0.75em,
    fill: none, 
  
    [Name]    ,[:], [#pembina-praktikum.at("nama")],
    [NIP]     ,[:], [#pembina-praktikum.at("nip")],
    [Position] ,[:], [Head of #lab-name Laboratory],
  )
]

#par(first-line-indent: 0cm)[
  hereby certifies that this practicum module has been reviewed and will be used
  for practicum activities in the odd semester of the 2025/2026 academic year at
  the Electronics and Industrial Automation Laboratory, School of Electrical Engineering,
  Telkom University.
]

#v(4em)

#align(center)[
  #place, #date-en
]
#v(1em)

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  align: center, // Centers the text within each column
  
  [
    Head of #lab-name Laboratory
    
    #v(3cm)
    
    *#pembina-praktikum.at("nama")*\
    NIP #pembina-praktikum.at("nip")
  ],
  
  [
    #divisions.at("ketua").en of #lab-name
    
    #v(3cm)
    
    *#koordinator-asisten.at("nama")*\
    NIM #koordinator-asisten.at("nim")\
  ]
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

= VISION AND MISSION\ SCHOOL OF ELECTRICAL ENGINEERING

#v(2.5em)

#par(first-line-indent: 0cm)[
*VISION:*
]

To become an international standard faculty that plays an active role in the
development of education, research, and entrepreneurship in the field of electrical
engineering and physical engineering, based on information technology.

#v(1em)

#par(first-line-indent: 0cm)[
*MISSION:*
]

1. Organizing an education system with international standards in the field of electrical engineering and information technology-based physics engineering.
2. Organize, disseminate, and utilize the results of international standard research in the field of electrical engineering and physics.
3. Organizing technology-based entrepreneurship programs in the field of electrical engineering and physical engineering among the academic community to support national economic development.
4. Develop networks with leading universities and industries at home and abroad in the context of education, research, and entrepreneurship cooperation.
5. Develop resources to achieve excellence in education, research, and entrepreneurship.

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

= VISION AND MISSION OF UNDERGRADUATE\ ELECTRICAL ENGINEERING STUDY PROGRAM

#v(2.5em)

#par(first-line-indent: 0cm)[
*VISION:*
]

To become an internationally recognized study program that actively contributes to
the development of education, research, and entrepreneurship and produces graduates in
Electronic Systems, Control Systems, or Embedded Systems.

#par(first-line-indent: 0cm)[
*MISSION:*
]

1. To provide internationally standardized education that produces graduates proficient in the science and technology of Electronic Systems, Control Systems, or Embedded Systems.
2. To develop and disseminate internationally recognized science and technology in Electronic Systems, Control Systems, and Embedded Systems through active student involvement.
3. To utilize the science and technology of Electronic Systems, Control Systems, and Embedded Systems to develop entrepreneurship within the academic community in support of national economic development.
4. To develop networks with leading domestic and international universities and industries for collaboration in education, research, and entrepreneurship in Electronic Systems, Control Systems, or Embedded Systems.
5. To develop resources to achieve excellence in education, research, and entrepreneurship in Electronic Systems, Control Systems, or Embedded Systems.

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#set par(first-line-indent: 0pt)

= LABORATORY PRACTICUM RULES\ SCHOOL OF ELECTRICAL ENGINEERING\ TELKOM UNIVERSITY

#v(1cm)

To ensure that every practicum session runs smoothly, all participants must observe several rules and guidelines. Compliance with these rules helps create a safe and conducive environment and enables every participant to gain the maximum benefit from the practicum. The following provisions must be observed and followed by all participants.

#v(2.5em)

#text(size: 14pt)[*Participants Who Are Not Permitted to Enter*]

Participants will not be permitted to enter or take part in the practicum if they:
- Arrive more than 20 minutes after the start of a _shift_.
  #grid(
    columns: (4.5em, 1em, auto),
    row-gutter: 0.8em,
    [Shift 1], [:], [06.30 -- 09.00 WIB],
    [Shift 2], [:], [09.30 -- 12.00 WIB],
    [Shift 3], [:], [12.30 -- 15.00 WIB],
    [Shift 4], [:], [15.30 -- 18.00 WIB]
  )
    
- Are not registered in Seelabs.

- Participants with dress-code violations may still attend the practicum but will receive sanctions in accordance with the regulations of the relevant laboratory.

#v(2.5em)

#text(size: 14pt)[*Requesting a Make-Up Practicum*]

Participants who miss a practicum may request a make-up session subject to the
following provisions established by the laboratory staff:

- The make-up session is held after the regular practicum period at a time determined by the laboratory staff.

- Only participants approved by the laboratory staff may attend a make-up session, such as those with a medical certificate, hospitalization, the death of an immediate family member, or formal dispensation from BK.

- Requests for a make-up session must be submitted through the Seelabs official account (\@jit0659i) with supporting evidence attached.

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////


= GENERAL GUIDELINES FOR SAFETY AND\ USE OF LABORATORY EQUIPMENT 


#v(1cm)

#text(size: 14pt)[*Safety*]

A safe practicum requires the participation of all participants and assistants involved
in the activity. Therefore, compliance with the guidelines in this section is essential
to maintaining a safe practicum environment.

#v(2.5em)

#text(size: 14pt)[*Electrical Hazards*]

Identify and understand the locations of electrical power sources (power outlets and circuit breakers)
and how to switch them on and off. Immediately report any damage that may create
a hazard to an assistant.

- Avoid areas or objects that may unintentionally cause electrical hazards, such as exposed mains cables and similar conditions.    
- Do not perform any action that may create an electrical hazard for yourself or others.

- Dry any wet parts of your body, for example from perspiration or residual water after ablution.

- Remain alert to electrical hazards during every practicum activity.

Electric shock is a common accident caused by electrical hazards. If it occurs, participants must take the following actions:

- Do not panic;

- Switch off all electronic equipment and power sources at your workstation and at the workstation of the person receiving the electric shock;

- Help the person receiving the electric shock separate from the power source; and

- Inform and request assistance from the assistants, other participants, and people nearby regarding the electrical accident.

#v(2.5em)

#text(size: 14pt)[*Fire or Excessive-Heat Hazards*]

Do not bring flammable items (matches, gas, and similar materials) into the
practicum room unless they are specifically required by the practicum module.

- Do not perform any action that may produce flames, sparks, or excessive heat.

- Do not perform any action that may expose yourself or others to fire or excessive heat.

- Remain alert to fire and excessive-heat hazards during every practicum activity.

Participants must take the following actions when facing a fire or excessive-heat
hazard:

- Do not panic;

- Inform and request assistance from the assistants, other participants, and people nearby regarding the fire or excessive-heat hazard;

- Switch off all electronic equipment and power sources in the practicum room;

- Move away from the practicum room.

#v(2.5em)

#text(size: 14pt)[*Other Hazards*]

To prevent unwanted incidents during the practicum, also observe the following requirements:

- Do not bring sharp objects (knives, scissors, or similar items) into the practicum room unless they are required for the experiment.

- Do not wear metal jewelry, such as rings, necklaces, or bracelets.

- Avoid areas, objects, or metal components with sharp parts that may cause injury.

- Avoid actions that may injure yourself or others, such as engaging in horseplay during the practicum.

#pagebreak()


////////////////////////////////////////////////////////////////////////////////////////////

= EVACUATION PLAN\ THIRD FLOOR - DELI/P BUILDING

#align(center)[
#image("assets/evacuation_kiri.png", width: 14cm)
#image("assets/evacuation_kanan.png", width: 14cm)
]

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#{
  show outline.entry.where(level: 1): set text(weight: "bold")
  show outline: it => {
    show linebreak: " "
    it
  }

  heading(level: 1, outlined: true)[TABLE OF CONTENTS]

  outline(
    title: none,
    indent: 0.5cm,
    depth: 3,
  )
}

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#heading(level: 1, outlined: true)[LIST OF FIGURES]

#{
  show outline.entry: it => {
    set text(weight: "regular")
    it
  }

  set outline.entry(fill: repeat(gap: 0.08em)[.])

  outline(
    title: none,
    target: figure.where(kind: image),
  )
}

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#set page(
  numbering: "1",
  header: top-bar(),
)
#counter(page).update(1)

#show heading.where(level: 1): front-heading

#set par(first-line-indent: indent)
#set enum(numbering: "a.")


////////////////////////////////////////////////////////////////////////////////////////////

= INTRODUCTION TO INTERNET OF THINGS (IOT)

== What Is the Internet of Things (IoT)?

The Internet of Things (IoT) is a concept that connects physical objects, sensors,
actuators, computing devices, and applications through networks so that devices can
collect, exchange, and utilize data. This communication may take place locally or
over the internet using protocols appropriate to the system requirements.

IoT can support a wide range of everyday activities. For example, users can
control household appliances through an Android application, remotely monitor the condition
and security of their homes, and automate animal feeding. Such implementations still require
careful security design, network reliability, and protection of user data.

== IoT _Architecture_ Layers

IoT architecture can be described using several models. One simplified model
consists of three layers: Physical/Perception, Network, and Application,
as shown in #link(<gambar:architecture-layer>)[the Architecture Layer Figure].

#intro-figure(
  image("gambar/introduction/Architecture Layer.png", width: 4cm),
  [IoT architecture layers],
  lang: doc-lang,
)<gambar:architecture-layer>


=== Physical Layer/Perception Layer

The Physical Layer, or Perception Layer, is the layer that interacts directly
with physical objects. It includes sensors for data acquisition, actuators for performing
actions, and control devices. In a smart-home system, for example, sensors can measure
temperature or detect security conditions, while actuators can lock doors, switch on lights,
or regulate an air conditioner's temperature.

=== Network Layer

In an IoT system, the Network Layer provides connectivity and data-exchange mechanisms
between devices in the Physical/Perception Layer and services in the Application Layer.
Communication may take place through a local network, a gateway, the internet, or a combination
of these. Two reference models commonly used to explain network communication are
the OSI model and the TCP/IP model, as shown in
#link(<gambar:iot-osi-tcp>)[the comparison of IoT, OSI, and TCP/IP layers].

#intro-figure(
  image("gambar/introduction/OSI TCP.png", width: 11cm),
  [Comparison of IoT, OSI, and TCP/IP layers],
  lang: doc-lang,
)<gambar:iot-osi-tcp>

==== OSI Model

1. *Physical*

The Physical layer is the lowest layer of the OSI model. It
defines the physical characteristics of the medium used to transmit data
between devices, such as voltage levels, maximum transmission distance,
physical connectors, and related characteristics. At this layer, digital bits are converted
into electrical signals for wired connections and radio signals for wireless
transmission.

2. *Data Link*

This layer facilitates communication and data transfer between nodes
(for example, from a PC to a switch, a switch to a router, and one router to another).
Physical addresses (MAC addresses) are associated with the data at this layer,
including the source and destination MAC addresses.

3. *Network*

The Network layer connects end hosts located on different networks
(that is, beyond the local LAN). This layer handles logical addressing
using IP addresses.

4. *Transport*

The Transport layer provides end-to-end communication between application processes.
Reliability, sequencing, flow control, and error recovery depend on
the protocol used. TCP provides these mechanisms, whereas
UDP sends datagrams without guaranteeing delivery or packet order.

5. *Session*

This layer manages the establishment, maintenance, synchronization, and termination
of communication sessions between applications. In modern network implementations,
session functions are often incorporated into higher-layer protocols or applications.

6. *Presentation*

This layer formats data so that the receiving application can interpret it.
It may also encrypt data before transmission and decrypt it upon
receipt, helping ensure that only the intended recipient can
read it.

7. *Application*

This layer is closest to the user and provides network services to
applications. For example, HTTP is used to exchange web resources, DNS
for name resolution, and MQTT for publish-subscribe message exchange.

==== TCP/IP Model

The TCP/IP model is a practical and widely implemented network model
that forms the foundation of the modern internet. It is named after two of its
best-known protocols: Transmission Control Protocol (TCP) and
Internet Protocol (IP). Unlike the seven-layer OSI model,
the TCP/IP model simplifies the architecture into four layers,
making it more suitable for real-world implementation and
troubleshooting.

1. *Network Access and Physical, or Link (Ethernet, Wi-Fi, Bluetooth, MAC, VLAN, etc.)*

The Link layer is located at the base of the TCP/IP model and serves as the interface
between network hardware and protocols in the layers above it. This layer covers
transmission media, data framing, local addressing, and media access. Ethernet,
Wi-Fi, and Bluetooth are examples of technologies that operate within the network
access layer, although their reliability depends on the technology and mechanisms
used.

2. *Internet (IP, NAT, ARP, etc.)*

The Internet layer is responsible for logical addressing and packet forwarding
between networks. Internet Protocol (IP) defines addresses and packet formats, while
routers determine forwarding paths from their routing tables. IP provides best-effort delivery
and therefore does not guarantee that every packet will arrive, arrive in order, or be received
only once. ARP helps map IPv4 addresses to local link-layer addresses and is often placed
at the boundary between the Link and Internet layers, depending on the model used.

3. *Transport (TCP, UDP, RTP, SCTP, DCCP)*

The Transport layer provides end-to-end communication between application processes.
Transmission Control Protocol (TCP) is connection-oriented and provides
sequencing, retransmission, and flow control. User Datagram Protocol (UDP)
is connectionless and has lower overhead, but it does not guarantee
delivery, ordering, or exactly-once transmission. The choice between TCP and UDP must
match the application's requirements.

4. *Application (HTTP, DNS, SSH, FTP, TLS, etc.)*

At the top of the TCP/IP model is the Application Layer, which serves
as the interface between the network and end-user applications. This layer
includes various protocols, each designed for particular services and
applications. Examples include Hypertext Transfer Protocol (HTTP) for
web browsing, File Transfer Protocol (FTP) for file exchange, and
Simple Mail Transfer Protocol (SMTP) for email communication. The
Application Layer is responsible for providing network services
directly to users, allowing them to interact with and
use the various applications that define the modern internet
experience. In essence, this layer completes the TCP/IP model by
facilitating seamless communication between user applications and
the underlying network infrastructure.

=== Application Layer

The Application Layer in an IoT system provides data processing, storage,
analytics, automation rules, APIs, device management, and user interfaces.
Services may be presented through a graphical user interface (GUI), mobile application,
web application, dashboard, or integration with another system.

#pagebreak()


////////////////////////////////////////////////////////////////////////////////////////////

#set heading(numbering: "1.1")

#set figure(
  numbering: (..nums) => {
    let module = counter(heading).get().at(0)
    let figure-number = nums.pos().first()
    [#module.#figure-number]
  },
  outlined: true,
)

#show figure.where(
  kind: table
): set figure.caption(position: top)

////////////////////////////////////////////////////////////////////////////////////////////

#modul_page(lang: doc-lang,
  modul_number: 1,
  modul_title: "BLUETOOTH CONNECTIVITY",
  
  tujuan: [
    + Understand Bluetooth technology.
    + Understand inter-device communication using Bluetooth.
    + Implement Bluetooth in an IoT system.
  ],
  
  requirements: [
    + Arduino IDE/PlatformIO,
    + ESP32,
    + Sensor (optional),
    + Actuator (optional).
  ]
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

Bluetooth connectivity can be used for direct communication between two devices.
Peer-to-peer (P2P) is a communication pattern in which devices interact directly
without a central application server. However, Bluetooth role terminology depends on the
technology: Bluetooth Classic may use initiator and acceptor roles for
particular connections, whereas Bluetooth Low Energy uses Central and
Peripheral roles in the Generic Access Profile (GAP).

== Bluetooth

Bluetooth is a wireless communication technology used to
connect one communication device to another without cables.
It is commonly used in mobile devices, laptops, computers, and
other equipment.

#figure(
  image("gambar/modul 1/Bluetooth - Logo.png", width: 7cm),
  kind: image,
  caption: [Bluetooth logo]
)

Bluetooth technology was developed in the 1990s by a team of Ericsson engineers,
including Jaap Haartsen. The name Bluetooth was taken from the epithet of King Harald “Blåtand”
Gormsson, who is associated with the unification of Denmark and Norway. The name
was adopted as a symbol of uniting different devices through a single
wireless communication technology.

#figure(
  image("gambar/modul 1/Bluetooth - Creator.png", width: 10cm),
  kind: image,
  caption: [Jacobus Cornelis Haartsen]
)

Bluetooth is used for short-range data exchange and to connect devices
such as headsets, speakers, keyboards, sensors, and computers. Some Bluetooth profiles
also support networking functions, including tethering.

Bluetooth operates in the 2.4 GHz ISM band. Bluetooth Classic uses frequency
hopping, whereas Bluetooth Low Energy uses different channels and radio-access
mechanisms. Range, speed, and power consumption are affected by the version, PHY mode,
transmit power, antenna, environmental conditions, and device implementation.

== Bluetooth Versions

=== Bluetooth 1.0

In 1999, the first Bluetooth release encountered numerous problems,
and manufacturers had difficulty producing devices that could interoperate
correctly. Version 1.0 and its amended release, 1.0B,
therefore had limited practical success.

Bluetooth 1.1 was released in 2001 with improvements over its
predecessor. Bluetooth 1.1 was also reflected in the
IEEE 802.15.1-2002 standard.

Bluetooth 1.2 was introduced in 2003 with improvements to discovery,
Adaptive Frequency Hopping (AFH), and connection quality. Bluetooth devices
are designed to retain interoperability with features from earlier versions,
although a successful connection still depends on the profiles and features supported by
both devices.

=== Bluetooth 2.0

Bluetooth 2.0 was introduced in 2004 with Enhanced Data Rate (EDR)
as an optional feature for increasing data rates and transmission-time efficiency.
EDR did not remove Basic Rate support, so devices
could continue communicating through mutually supported features.

Three years later, Bluetooth 2.1 was released.
It introduced Secure Simple Pairing (SSP) to make pairing faster and more secure.
It also introduced Extended Inquiry Response (EIR), which helps users
obtain information about a device before connecting and supports
more efficient discovery behavior.

=== Bluetooth 3.0

In 2009, Bluetooth 3.0 + High Speed (HS) introduced the Alternate
MAC/PHY (AMP). The Bluetooth channel is used for discovery, connection, and management,
while high-speed data transfer can be moved to an IEEE 802.11 radio
on devices that support the HS feature. The promoted theoretical rate was
approximately 24 Mbps, although the feature was optional.

=== Bluetooth 4.0 (Bluetooth Low Energy)

In 2010, Bluetooth Core Specification 4.0 introduced Bluetooth Low
Energy (BLE) as a low-power radio system alongside Bluetooth Classic. BLE
was designed to allow devices to operate with low energy consumption, including
devices powered by small batteries. BLE 4.x uses the LE 1M PHY with
a symbol rate of 1 Msym/s; application throughput and actual range depend on
the configuration and environmental conditions.

Bluetooth 4.1, adopted in 2013, improved coexistence with
cellular networks, device-role flexibility, and connection management. These
improvements do not mean that a Bluetooth connection is automatically always on or off;
power behavior is still determined by the device and application implementation.

Bluetooth 4.2, adopted in 2014, added improvements to
BLE data-packet capacity, privacy, connection security, and support for the Internet Protocol
Support Profile. Throughput improvements depend on both devices supporting the Data Length
Extension feature and should not be equated with internet download speed.

=== Bluetooth 5.0

Bluetooth Core Specification 5.0 was adopted in 2016 and introduced
important enhancements for Bluetooth Low Energy, including the LE 2M PHY, LE Coded PHY,
and Extended Advertising. These features support a range of IoT requirements,
but security and interference resilience still depend on the device configuration and
implementation.

#par(first-line-indent: 0cm)[The three principal features introduced were:]

- Up to twice the data rate through the LE 2M PHY
- Up to four times the range through the LE Coded PHY under particular conditions
- Up to eight times the advertising-data capacity compared with legacy advertising

Bluetooth 5.0 retains support for the LE 1M PHY and adds the LE 2M PHY for
higher data rates. The LE Coded PHY can extend range by adding
redundancy, but this reduces the effective data rate. Devices can use
these features only when both sides support and enable them.

=== Bluetooth 6.0

The newest major version of Bluetooth is released on 2024, focused on precision
ranging, lower latency, and efficiency improvement on device discovery. The latest
feature from this release is Channel Sounding, where the bluetooth protocol will
use precision ranging based on phase-change and time difference between arrival
and departure. This feature enable precision ranging within centimeter accuracy.
Although Bluetooth 6.0 doesn't provide improvement in data transfer rate, it
shows us the improvement in power efficiency and better security compared to the
previous version.

== Bluetooth Communication Flow

#figure(
  image("gambar/modul 1/Bluetooth - Communication Flow.png", width: 10cm),
  kind: image,
  caption: [Bluetooth communication flow]
)

The Bluetooth operating sequence is shown in the figure above and is
explained as follows:

1. *Discovery*

A device performs discovery to find other devices within
range. Bluetooth Classic may use the inquiry
procedure, whereas Bluetooth Low Energy scans
advertising packets.

2. *Pairing*

Pairing may be performed after a device has been discovered when the application
requires key establishment and a trusted relationship. Not all Bluetooth
connections require pairing; security requirements are determined by the profile,
service, and device configuration.

3. *Connection*

The devices may then establish a connection to exchange data. Connection roles
do not determine the direction of data transfer: both devices may transmit and
receive. Bluetooth Low Energy uses the terms Central and Peripheral,
whereas Bluetooth Classic role terminology depends on the procedure and
profile used.

== Bluetooth Protocols

The Bluetooth Special Interest Group (SIG) develops the Bluetooth specifications,
which define the protocols used by Bluetooth technology. Fundamental Bluetooth Classic
components include the Bluetooth Radio, Baseband, and Link Manager Protocol (LMP),
which form part of the core protocol stack. Higher-level adopted protocols can be
integrated into the Bluetooth protocol architecture and may originate from other
organizations. The radio, baseband, and LMP broadly correspond to physical- and
data-link-layer functions in the OSI model.

The Bluetooth protocol stack can be grouped into four layers according to
their functions. The protocols included in these layers are
shown in the following table:

#figure(
  table(
    columns: (1fr, 1fr),
    align: left,
    fill: none, 

    [*Protocol Layer*]              , [*Protocols in the Stack*],
    [Bluetooth Core Protocols]    , [Baseband, LMP, L2CAP, SDP],
    [Cable Replacement Protocols] , [RFCOMM],
    [Telephony Control Protocols] , [TCS Binary, AT-commands],
    [Adopted Protocols]           , [PPP, UDP/TCP/IP, OBEX, WAP, vCard, vCal, IrMC, WAE]
  ),
  kind: table,
  caption: [Bluetooth protocol layers and protocol stack]
)

The Host Controller Interface (HCI) additionally provides commands and events
between the host and controller, supporting baseband control, connection
management, and access to controller functions.

1. *Baseband*

This layer enables RF links among Bluetooth units that form a
piconet. The Bluetooth Classic radio system uses frequency-hopping spread spectrum,
transmitting data as packets in defined time slots and on defined
frequencies. It performs inquiry and paging procedures to synchronize
frequency-hopping transmission and the clocks of different Bluetooth
devices.

2. *Link Manager Protocol (LMP)*

The Link Manager Protocol manages link establishment and operation in
Bluetooth Classic. Its functions include authentication, encryption setup,
link-parameter negotiation, and control of baseband features.

3. *Logical Link Control and Adaptation Protocol (L2CAP)*

L2CAP packets carry payloads to higher
protocol layers.

4. *Service Discovery Protocol (SDP)*

This protocol is used to discover services provided by a
Bluetooth Classic device and the attributes required to access those services.

5. *Cable Replacement Protocol (RFCOMM)*

RFCOMM provides serial-port emulation.

6.  *Telephony Control Protocol*

Telephony Control Specification Binary (TCS BIN) and AT commands are used
in particular telephony profiles to control calls and modem functions.

7. *Adopted Protocols*

Bluetooth also supports adopted protocols such as PPP, TCP/UDP/IP, OBEX, and WAP
to improve interoperability.

8. *Radio Frequency (RF)*

Radio Frequency is the lowest layer of the Bluetooth specification and
provides wireless communication in the 2.4 GHz Industrial, Scientific, and Medical
(ISM) band. Bluetooth Classic uses 79 RF channels, each 1 MHz wide,
with frequency hopping, whereas Bluetooth Low Energy uses
40 RF channels, each 2 MHz wide.

== Implementing Peer-to-Peer Bluetooth

#figure(
  image("gambar/modul 1/Bluetooth - P2P.png", width: 10cm),
  caption: [P2P visualization]
)

In this peer-to-peer Bluetooth implementation, the master sends data to
the slave using ESP32 microcontrollers. If you want to use other microcontroller,
make sure the device support the required Bluetooth version. When the device
only support Bluetooth with version 4.0 and above without dual-mode support, then
the device can only use BLE implementation and vice-versa. If the device has
dual-mode support (Bluetooth Classic and BLE), the device can use both implementation
of Bluetooth Classic and BLE.

=== Using Bluetooth Serial 

Bluetooth Serial configuration is relatively straightforward compared with BLE because it uses *Master* and *Slave* roles similar to other serial communication protocols. The following examples show master and slave configurations on the ESP32.

#info-box(title: "Information", [
  The Bluetooth Serial library used here is the ESP32 built-in library:\
  #link("https://github.com/espressif/arduino-esp32/tree/master/libraries/BluetoothSerial")[https://github.com/espressif/arduino-esp32/tree/master/libraries/BluetoothSerial]
])

- *Master*

The Master searches for a connection to the Slave and
sends data to it.

#code-box(title: "Master/Host Source-Code Initialization", [
```cpp
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

String masterName = "ESP32-Master"; // ESP Master name
String slaveName = "ESP32-Slave";
bool connected = false;
int value = 0;
```
])

To initialize ESP32 P2P communication, the #code("BluetoothSerial.h") library is used
to access Bluetooth functions. The required variables are then declared:
#code("SerialBT") provides access to BluetoothSerial, #code("String masterName") defines
the master's visible name, #code("String slaveName") identifies the target device
#code("ESP32-Slave"), #code("bool connected") stores the connection status, and
#code("int value") stores the value to be sent to the Slave.

#code-box(title: "Master Source-Code Setup", [
```cpp
void setup() {
  Serial.begin(115200);  
  
  SerialBT.begin(masterName, true); // Start Bluetooth
  Serial.println("The device started in master mode, make sure remote BT device is on!");
  
  connected = SerialBT.connect(slaveName); // Check the Bluetooth connection
  if(connected) {
    Serial.println("Connected Successfully!");
  } else {
    while(!SerialBT.connected(10 * 1000)) { // Wait for 10 seconds
      Serial.println("Failed to connect!");
      Serial.println("Make sure remote device is available and in range, then restart");
    }
  }
  SerialBT.connect();
}
```
])

In #code("setup()"), #code("SerialBT.begin(masterName, true)") starts Bluetooth
in master mode and assigns the name visible to other devices.
#code("connected = SerialBT.connect(slaveName)") attempts to connect to the target
Bluetooth device and records whether the connection succeeds. The subsequent
#code("SerialBT.connect();") call can be used to request reconnection.

#code-box(title: "Master Source-Code Loop", [
```cpp
void loop() {
  if(value <= 10){
    SerialBT.println(value); // Send data through Bluetooth
    Serial.println(value);
    value++;
    
    delay(1000);
  }
  else {
    value = value - 10;
  }
}
```
])

In the loop, the program sends the value of the
`value` variable to the `Slave` until it reaches 10. The statement
#code("SerialBT.println(value)") sends the current value of the
`value` variable to the `Slave`.

- *Slave*

The Slave receives communication from the Master.

#code-box(title: "Slave Source-Code Initialization", [
```cpp
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

String slaveName = "ESP32-Slave"; // ESP Slave name
int value = 0;
String slaveValueStr;
int slaveValueInt;
```
])

The Slave initialization also uses the
#code("BluetoothSerial.h") library. A `BluetoothSerial` object is assigned to `SerialBT`, and the
required variables are declared: #code("int value"), #code("String slaveValueStr") for
received string data, and #code("int slaveValueInt") for storing the integer value
converted from that string. Finally,
#code("String slaveName = \"ESP32-Slave\"") defines the device name.

#code-box(title: "Slave Source-Code Setup", [
```cpp
void setup() {
  Serial.begin(115200);  
  
  SerialBT.begin(slaveName); // Start Bluetooth as a receiving device
  Serial.println("The device started, now you can pair it with bluetooth!");
}
```
])

During setup, #code("SerialBT.begin(slaveName)") starts the Bluetooth service
and sets the name that will be visible to other devices
from the value of #code("slaveName").

#code-box(title: "Slave Source-Code Loop", [
```cpp
void loop() {
  if(SerialBT.available()){
    slaveValueStr = SerialBT.readStringUntil('\n'); // Read data from the Master
    slaveValueInt = slaveValueStr.toInt();
    
    Serial.print("Data from Master: ");
    Serial.println(slaveValueInt);
  }
}
```
])

In the loop, #code("if(SerialBT.available())") checks whether data from
the master is available over Bluetooth. The #code("slaveValueStr") variable reads
the incoming string up to the newline character with
#code("SerialBT.readStringUntil('\n')"). The received #code("String") is then converted to an
#code("int") with #code("slaveValueStr.toInt()") and stored in
#code("slaveValueInt"), producing the following Serial Monitor output.

#figure(
  image("gambar/modul 1/Bluetooth - Output.png", width: 5cm),
  kind: image,
  caption: [Serial Monitor output]
)

The figure above shows the Slave's Serial Monitor after it has successfully
received data sent by the Master.

=== Using Bluetooth Low Energy (BLE)

Bluetooth Low Energy (BLE) uses *Central* and *Peripheral* roles. A *Central/Client* device scans for and connects to a BLE device, while a *Peripheral/Server* performs *advertising* and provides data through the GATT (*Generic Attribute Profile*) structure.

In this example, the *Peripheral/Server* generates a random value and sends it through a notification. The *Central/Client* searches for a device advertising the matching *Service UUID*, connects to it, and receives data through a callback function.

#info-box(title: "Information", [
  The following website can be used to generate a random UUID:\
  #link("https://www.uuidgenerator.net/")[https://uuidgenerator.net]
])


- *Central/Client*

The Central scans for BLE devices, identifies the Peripheral by its *Service UUID*, establishes a connection, and receives notifications from the characteristic.

#code-box(title: "BLE Central/Client Libraries, Variables, and Declarations", [
```cpp
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>

#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce6e"
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676519"

static BLEAddress *pServerAddress = nullptr;
static BLERemoteCharacteristic *pRemoteCharacteristic = nullptr;
static BLEClient *pClient = nullptr;

static bool doConnect = false;
static bool connected = false;
```
])

These libraries provide BLE scanning, client-connection, and characteristic-access functions. Pointer variables store the device address, client object, and remote characteristic. The #code("doConnect") and #code("connected") variables control the connection process and status.

#code-box(title: "BLE Central/Client Notification Function", [
```cpp
static void notifyCallback(
  BLERemoteCharacteristic *pCharacteristic,
  uint8_t *pData,
  size_t length,
  bool isNotify
) {
  String receivedData;

  for (size_t i = 0; i < length; i++) {
    receivedData += static_cast<char>(pData[i]);
  }

  Serial.print("Received from Peripheral: ");
  Serial.println(receivedData);
}
```
])

The #code("notifyCallback()") function runs automatically when the Central receives a notification from the Peripheral's characteristic.
The #code("pData") parameter contains the received data as a byte array, while #code("length") indicates the number of bytes received. Each byte is converted to a character with #code("static_cast<char>()") and appended to the #code("receivedData") variable.

After all data has been processed, the resulting value is displayed in the Serial Monitor.

#code-box(title: "BLE Central/Client Connection Callback", [
```cpp
class MyClientCallbacks : public BLEClientCallbacks {
  void onConnect(BLEClient *pClient) override {
    connected = true;
    Serial.println("Connected to Peripheral!");
  }

  void onDisconnect(BLEClient *pClient) override {
    connected = false;
    Serial.println("Disconnected from Peripheral!");
  }
};
```
])

The #code("MyClientCallbacks") class detects changes in the connection status between the Central and Peripheral.
The #code("onConnect()") function runs when the Central successfully connects to the Peripheral, setting #code("connected") to #code("true").
The #code("onDisconnect()") function runs when the connection is lost, setting #code("connected") to #code("false") so that the Central can resume scanning.

#code-box(title: "BLE Central/Client Scanning Callback", [
```cpp
class MyAdvertisedDeviceCallbacks
  : public BLEAdvertisedDeviceCallbacks {

  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    Serial.print("Found device: ");
    Serial.println(advertisedDevice.toString().c_str());

    if (
      advertisedDevice.haveServiceUUID() &&
      advertisedDevice.isAdvertisingService(BLEUUID(SERVICE_UUID))
    ) {
      Serial.println("Target Peripheral found!");
      BLEDevice::getScan()->stop();

      if (pServerAddress != nullptr) {
        delete pServerAddress;
      }

      pServerAddress =
        new BLEAddress(advertisedDevice.getAddress());

      doConnect = true;
    }
  }
};
```
])

The #code("MyAdvertisedDeviceCallbacks") class processes each BLE device discovered during scanning.
The #code("onResult()") function runs whenever the scanner finds a BLE device, and the device information is displayed through #code("advertisedDevice.toString()").
The #code("haveServiceUUID()") function checks whether the device advertises a Service UUID. The #code("isAdvertisingService()") function then compares the advertised UUID with the target #code("SERVICE_UUID").

When the UUID matches, scanning is stopped with #code("BLEDevice::getScan()->stop()"). The Peripheral address is stored in #code("pServerAddress"), and #code("doConnect") is set to #code("true") so that the connection process can run in #code("loop()").

#code-box(title: "BLE Central/Client Initialization and Connection", [
```cpp
bool connectToServer(BLEAddress address) {
  Serial.print("Connecting to Peripheral: ");
  Serial.println(address.toString().c_str());

  pClient = BLEDevice::createClient();
  pClient->setClientCallbacks(new MyClientCallbacks());

  if (!pClient->connect(address)) {
    Serial.println("Connection failed!");
    return false;
  }

  BLERemoteService *pRemoteService =
    pClient->getService(BLEUUID(SERVICE_UUID));

  if (pRemoteService == nullptr) {
    Serial.println("Service not found!");
    pClient->disconnect();
    return false;
  }

  pRemoteCharacteristic =
    pRemoteService->getCharacteristic(BLEUUID(CHARACTERISTIC_UUID));

  if (pRemoteCharacteristic == nullptr) {
    Serial.println("Characteristic not found!");
    pClient->disconnect();
    return false;
  }

  if (!pRemoteCharacteristic->canNotify()) {
    Serial.println("Characteristic does not support notifications!");
    pClient->disconnect();
    return false;
  }

  pRemoteCharacteristic->registerForNotify(notifyCallback);
  connected = true;

  Serial.println("Notification enabled!");
  return true;
}
```
])


#code("connectToServer()") connects the Central, locates the service and characteristic, and registers the notification callback. This function is subsequently called from #code("loop()").

#code-box(title: "Central/Client Source-Code Setup", [
```cpp
void setup() {
  Serial.begin(115200);
  Serial.println("=== BLE Central/Client ===");

  BLEDevice::init("ESP32_Central");
  BLEScan *pBLEScan = BLEDevice::getScan();

  pBLEScan->setAdvertisedDeviceCallbacks(
    new MyAdvertisedDeviceCallbacks()
  );
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(80);
  pBLEScan->setActiveScan(true);

  Serial.println("Scanning for Peripheral...");
  pBLEScan->start(5, false);
}
```
])

In #code("setup()"), Serial and BLE are initialized and the previously defined callback is
registered with the #code("pBLEScan") pointer through #code("setAdvertisedDeviceCallbacks()"). The scan interval, scan window, active scanning, and Peripheral search are then configured.

#code-box(title: "Loop BLE Central/Client", [
```cpp
void loop() {
  if (doConnect && pServerAddress != nullptr) {
    if (connectToServer(*pServerAddress)) {
      Serial.println("Ready to receive data!");
    } else {
      Serial.println("Connection failed. Scanning again...");
    }

    doConnect = false;
  }

  if (!connected && !doConnect) {
    BLEDevice::getScan()->start(5, false);
  }

  delay(1000);
}
```
])

In #code("loop()"), the Central attempts to connect after the target is found. If it is not connected, scanning starts again.

- *Peripheral/Server*

The Peripheral performs *advertising*, provides a service and characteristic, and sends random values to the Central through notifications.

#code-box(title: "BLE Peripheral/Server Libraries, Variables, and Declarations", [
```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce6e"
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676519"

BLEServer *pServer = nullptr;
BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;
bool oldDeviceConnected = false;

unsigned long previousSendTime = 0;
const unsigned long sendInterval = 1000;
```
])

The BLE Server libraries are used to create the server, service, characteristic, and notification descriptor. Connection variables store the Central's status, while timing variables control the data-transmission interval.

#code-box(title: "BLE Peripheral/Server Callback", [
```cpp
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
    Serial.println("Central connected!");
  }

  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    Serial.println("Central disconnected!");
  }
};
```
])

The server callback runs when the Central connects or disconnects. The #code("deviceConnected") value is used by #code("loop()") to determine whether notifications can be sent.

#code-box(title: "BLE Peripheral/Server Initialization", [
```cpp
void BLE_init() {
  BLEDevice::init("ESP32_Peripheral");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService =
    pServer->createService(BLEUUID(SERVICE_UUID));

  pCharacteristic = pService->createCharacteristic(
    BLEUUID(CHARACTERISTIC_UUID),
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setValue("0");

  pService->start();

  BLEAdvertising *pAdvertising =
    BLEDevice::getAdvertising();

  pAdvertising->addServiceUUID(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponse(true);

  BLEDevice::startAdvertising();

  Serial.println("Peripheral ready. Waiting for Central...");
}

void setup() {
  Serial.begin(115200);
  randomSeed(micros());

  BLE_init();
}
```
])

#code("BLE_init()") creates the server, service, and characteristic, adds the notification descriptor, and starts advertising. The #code("setup()") function initializes Serial, seeds the random-number generator for the data-transmission experiment, and configures BLE.

#code-box(title: "Loop BLE Peripheral/Server", [
```cpp
void loop() {
  if (
    deviceConnected &&
    millis() - previousSendTime >= sendInterval
  ) {
    previousSendTime = millis();

    String value = String(random(0, 101));

    pCharacteristic->setValue(value.c_str());
    pCharacteristic->notify();

    Serial.print("Sent: ");
    Serial.println(value);
  }
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();

    Serial.println("Advertising restarted...");
    oldDeviceConnected = false;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = true;
  }
}
```
])

In #code("loop()"), the Peripheral sends a random value once per second while the Central is connected. If the connection is lost, advertising is restarted so that the device can be discovered and reconnected.

With this flow, the Peripheral sends data and the Central receives it through notifications. The communication does not use a serial stream as Bluetooth Classic does; instead, it uses GATT services, characteristics, and callbacks.


#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#modul_page(lang: doc-lang,
  modul_number: 2,
  modul_title: "WEBSOCKET COMMUNICATION WITH A LOCAL SERVER",
  
  tujuan: [
    + Understand the HTTP (Hypertext Transfer Protocol) protocol.
    + Understand HTTP communication.
    + Understand the use of WebSocket in an IoT-system context.
  ],
  
  requirements: [
    + Arduino IDE/PlatformIO.
    + ESP32/ESP8266.
    + Local server (Raspberry Pi 3B).
    + Sensor (opsional).
    + Aktuator (opsional).
  ]
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

== Hypertext Transfer Protocol (HTTP)

HTTP (Hypertext Transfer Protocol) is an application-layer protocol for
exchanging resource representations between clients and servers. A client sends a
request containing a method, target, headers, and, when required, a body. The server then
sends a response containing a status, headers, and a data representation. HTTP can be
used for documents, structured data, images, video, and API services over either
a local network or the internet. A web browser is one type of HTTP client,
but HTTP is also used by mobile applications, IoT devices, and inter-system services.

#figure(
  image("gambar/modul 2/HTTP - Visualization.png", width: 5cm),
  kind: image,
  caption: [HTTP visualization]
)

=== CRUD

CRUD stands for Create, Read, Update, and Delete. The term
describes four basic data operations and can be applied to various
storage systems, not only relational databases. In HTTP-based systems,
CRUD operations are often mapped to HTTP methods, although the semantics of HTTP methods
remain defined by the protocol specification and do not always correspond exactly to database operations.

The CRUD functions are as follows.

- *CREATE:* Creates a new entry or record in a database table. In SQL-based applications, this operation is commonly performed with `INSERT`.
- *READ:* Retrieves a data entry stored in a database without modifying the stored data.
- *UPDATE:* Modifies an existing data entry when its information must be changed.
- *DELETE:* Removes a data entry that is no longer required from a database.

Several naming variants have been developed from the CRUD concept. The following
terms are not part of the HTTP standard; they are application-operation naming patterns:

- BREAD (Browse, Read, Edit, Add, Delete)
- CRAP (Create, Replicate, Append, and Process)
- CRUDL (Create, Read, Update, Delete, List)
- DAVE (Delete, Add View, Edit)

=== HTTP Communication Methods

HTTP methods have their own semantics and can be used to support
CRUD operations in an API:

- *GET* requests a representation of a resource and should not change server state.
- *POST* sends data to be processed according to the resource function; it is often used to create a new entry.
- *PUT* creates or replaces the representation of a resource at the specified target.
- *PATCH* applies a partial modification to a resource.
- *DELETE* requests removal of the resource association at the specified target.

#figure(
  image("gambar/modul 2/HTTP - Communication.png", width: 12cm),
  kind: image,
  caption: [HTTP communication methods]
)

In addition to the methods described above, HTTP provides several other
communication methods, as shown in the following
table.

#show figure: set block(breakable: true)

#figure(
  table(
    columns: (auto, 1fr, 1fr),

    [*HTTP Method*] , [*Definition*]                          , [*Explanation*],
    [GET]         , [Retrieve a resource]             , [Used to retrieve specified data from a server],      
    [POST]        , [Process data]                    , [Used to send data for processing according to the resource function],     
    [PUT]         , [Create or replace a resource], [Used to create or replace a resource representation at the target],      
    [DELETE]      , [Delete a resource]             , [Used to remove specified data from a server],     
    [PATCH]       , [Modify part of a resource]       , [Used to update or modify part of existing data on a server],
    [HEAD]        , [Obtain header information]      , [Used to request the headers for data that would be returned by GET],
    [OPTIONS]     , [Obtain server capability information] , [Used to request information about the methods supported by the server for a target resource],
    [CONNECT]     , [Establish a tunnel]                  , [Used to request that a proxy establish a tunnel to the destination server],
    [TRACE]       , [Perform diagnostics]              , [Used to request that the final recipient return the request it received],
  ),
  kind: table,
  caption: [Types and functions of HTTP methods]
)

== WebSocket

WebSocket is a protocol that provides bidirectional communication over a single TCP connection.
The connection begins with an HTTP Upgrade handshake, after which the client and server can exchange
frames without creating a new HTTP request for every message. WebSocket is suitable for applications
that require interactive or high-frequency data exchange, although actual latency is still affected
by the network, implementation, and server load.

#figure(
  image("gambar/modul 2/WebSocket - Visualization.png", width: 10cm),
  kind: image,
  caption: [Websocket Communication Flow]
)

The WebSocket communication flow is as follows:

1. The client sends a special HTTP request asking to upgrade the connection to WebSocket. The following is an example request header:
#pad(left: 2cm, top: -0.5cm)[
#code("
GET /chat HTTP/1.1
Host: example.com
Upgrade: WebSocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com
")
]

When the server accepts the request, it responds with:

#pad(left: 2cm, top: -0.5cm)[
#code("
HTTP/1.1 101 Switching Protocols
Upgrade: WebSocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
")
]

2. After the handshake succeeds, the client and server can exchange frames. A WebSocket frame still has a protocol header, but it does not carry the complete HTTP headers with every message. The frame structure contains the following elements:
   - *FIN bit:* Indicates whether the frame is the final frame of a message.
   - *Opcode:* Identifies the frame type (text, binary, close, ping, or pong).
   - *Mask bit:* Indicates whether the payload is masked. Client-to-server frames must be masked, while server-to-client frames are not masked. Masking is not encryption and does not provide confidentiality.
   - *Payload length:* The size of the transmitted message data.
   - *Payload data:* The transmitted data content.

The following table compares WebSocket communication with traditional HTTP communication:

#figure(
  table(
    columns: (0.45fr, 1fr, 1fr),

    [*Aspect*],
      [*HTTP*],
      [*WebSocket*],
    [Communication Pattern], 
      [Uses a request-response pattern; the client generally initiates the exchange], 
      [Maintains the connection after the handshake so that the client and server can both send messages],      
    [Connection Overhead], 
      [Every request and response carries HTTP headers; their size depends on the configuration], 
      [After the handshake, frame overhead varies with payload length, masking, and extensions],     
    [Latency], 
      [Requires a request-response exchange for each interaction],
      [Reduces the need for a new handshake or request for every message, but does not eliminate network latency],      
    [Scalability], 
      [Its stateless nature generally makes horizontal scaling easier], 
      [WebSocket connections are stateful, making scaling more complex],     
  ),
  kind: table,
  caption: [Differences between WebSocket and traditional HTTP]
)

== Implementing the WebSocket Protocol

=== Raspberry Pi Python Server

Before communication can take place, a WebSocket server must be created so that
the ESP32 can connect and exchange messages. Create a new folder to store
the server code, for example `server-websocket`. Install the required
Python packages if they are not already installed:

#code-box(title: "Installing Python Packages and a Virtual Environment", [
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```
])

Next, create a virtual environment inside the new folder as follows:
#code-box(title: "Creating a Python Virtual Environment", [
```bash
python3 -m venv .venv

# Activate the virtual environment
source .venv/bin/activate
```
])

After activating the virtual environment, install the #code("websockets") package for
Python by running the following command in the terminal:

#code-box(title: "Installing the Python WebSocket Package", [
```bash
pip install websockets
```
])

Create a Python source file in the folder, for example #code("main.py"),
and enter the following content:

#code-box(title: "Importing Libraries and Configuring Variables", [
```python
import asyncio  # Supports asynchronous coroutine execution

# WebSocket library
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0"  # Listen on all network interfaces
PORT: int = 8765
``` 
])

#code-box(title: "Callback Function for Multiple Clients", [
```python
async def handle_client(websocket: ServerConnection) -> None:
    # Distinguish messages by the WebSocket path
    # The path used in this example is "/esp32"
    path: str = websocket.request.path

    # Select the path to process
    if path == "/esp32":
        print("ESP32 device connected")
        try:
            async for message in websocket:
                # Message from ESP32
                print( f"ESP32 message: {message}" )

                # Reply
                response: str = ( f"ACK from Raspberry Pi: {message}" )
                await websocket.send(response)

        except ConnectionClosed:
            print("ESP32 disconnected")
    # Add other paths as required
    # Default case for an unrecognized path
    else:
        print(f"Unknown path: {path}")
``` 
])

In the code above, the #code("async", lang: "python") keyword defines a coroutine
that can run asynchronously. The #code("websocket") 
object represents one client connection. Messages are received through the 
#code("async for") loop, while #code("websocket.send()", lang: "python") sends a 
response over that connection.

#code-box(title: "Python Main Function", [
```python
async def main() -> None:
    # Use the configuration defined above
    async with serve(handle_client, HOST, PORT):
        print(f"WebSocket server running " f"on {HOST}:{PORT}")
        # Wait for messages...
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
``` 
])

The #code("await", lang: "python") keyword suspends the coroutine while it waits for
an asynchronous operation without blocking the entire event loop. This mechanism allows the server
to handle multiple connections on the Raspberry Pi's IP address and port.

After creating the source file, run the Python server
#code("main.py") from the terminal.

#code-box(title: "Running the Python Server", [
```bash
python main.py
``` 
])


=== ESP32 Source Code

Before writing the ESP32 code, obtain the IP address of the Raspberry Pi configured as
the server. Run the following command in the terminal to display the Raspberry Pi's IP address:

#code-box(title: "Viewing the Raspberry Pi IP Address", [
```bash
hostname -I
# Alternatively, use the following command
ip addr
```
])

The commands above display the Raspberry Pi's IPv4 and IPv6 addresses. Only the IPv4 address is required
for this WebSocket server, for example #code("192.168.1.100").

#info-box(title: "Information", [
  This practicum uses the #code("WebSockets") library by Markus Sattler:\
  #link("https://github.com/Links2004/arduinoWebSockets")[https://github.com/Links2004/arduinoWebSockets]
])

Install the required library first. Then import it into the ESP32
program as usual.

#code-box(title: "Libraries Used on the ESP32", [
```cpp
#include <WiFi.h>             // Wi-Fi connection
#include <WebSocketsClient.h> // WebSocket connection
```
])

#code-box(title: "Wi-Fi and WebSocket Configuration", [
```cpp
// WiFi
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// WebSocket
const char*    WS_HOST = "192.168.1.100";  // Match the Raspberry Pi IP address
const uint16_t WS_PORT = 8765;             // Match the Raspberry Pi port

// Use different paths to distinguish data or endpoint types
const char*    WS_PATH = "/esp32";

WebSocketsClient webSocket;

bool webSocketConnected = false;
unsigned long previousSendTime = 0;
const unsigned long SEND_INTERVAL = 1000; // Data-transmission interval

uint32_t counter = 0;
```
])

Ensure that the IP address and port in the ESP32 code match those configured on the Raspberry Pi.

#code-box(title: "WebSocket Callback Function", [
```cpp
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            webSocketConnected = true;

            Serial.println("WebSocket connected.");

            // Optional initial message
            webSocket.sendTXT("{\"status\":\"ESP32-S3 connected\"}");
            break;

        case WStype_DISCONNECTED:
            webSocketConnected = false;
            Serial.println("WebSocket disconnected.");
            break;

        case WStype_TEXT:
            Serial.print("Message from server: ");
            Serial.write(payload, length);
            Serial.println();
            break;

        case WStype_ERROR:
            Serial.println("WebSocket error.");
            break;

        default:
            break;
    }
}
```
])

In the code above, the #code("void webSocketEvent()") callback processes
WebSocket events for both transmitted and received messages.

#code-box(title: "Connecting to Wi-Fi", [
```cpp
void connectToWiFi() {
    Serial.print("Connecting to Wi-Fi");

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Wait for the Wi-Fi connection
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("Wi-Fi connected.");

    Serial.print("ESP32 IP address: ");
    Serial.println(WiFi.localIP());
}
```
])

Before using WebSocket, connect the ESP32 to the Wi-Fi network.
The #code("WIFI_STA") mode allows the device to operate as a client that
connects to an available Wi-Fi access point (AP), similarly to
a mobile phone connecting to a Wi-Fi router. The connection is initiated by calling
#code("WiFi.begin()") with the Wi-Fi name or SSID and password.
Ensure that the ESP32 and Raspberry Pi are connected
to the same local network.

#code-box(title: "ESP32 Setup Function", [
```cpp
void setup() {
    Serial.begin(115200);
    delay(1000);

    connectToWiFi();

    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);  // Start the WebSocket connection
    webSocket.onEvent(webSocketEvent);    // Register the callback function
    webSocket.setReconnectInterval(5000); // Attempt reconnection every 5 seconds

    // Reconnect to Wi-Fi automatically after disconnection
    WiFi.setAutoReconnect(true);
}
```
])

WebSocket starts after the ESP32 successfully connects to the network. In the code
above, the ESP32 attempts to connect to the Raspberry Pi through WebSocket using
the configured host, port, and path. If the connection becomes unstable, Wi-Fi and WebSocket
attempt to reconnect, with a five-second WebSocket reconnection interval.


#code-box(title: "ESP32 Loop Function", [
```cpp
void loop() {
    // Process the WebSocket connection
    webSocket.loop();

    unsigned long currentTime = millis();

    if (
        webSocketConnected &&
        currentTime - previousSendTime >= SEND_INTERVAL
    ) {
        previousSendTime = currentTime;

        // Place the transmission logic in the following block
        // This example sends a counter value every second
        String message = "{\"counter\":";
        message += counter;
        message += "}";

        webSocket.sendTXT(message);

        Serial.print("Sent: ");
        Serial.println(message);

        counter++;
    }
}
```
])

The #code("webSocket.loop()") method must be called regularly to process
WebSocket connection events. After the transmission interval has elapsed,
#code("webSocket.sendTXT()") sends a text message to the Raspberry Pi server.

#figure(
  image("gambar/modul 2/WebSocket - Output.png", width: 10cm),
  kind: image,
  caption: [WebSocket server output]
)

The example above shows the output generated by the Python WebSocket server
created earlier.

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#modul_page(lang: doc-lang,
  modul_number: 3,
  modul_title: "MQTT CONNECTIVITY WITH MICROPYTHON, RASPBERRY PI PICO W, AND ECLIPSE MOSQUITTO",
  
  tujuan: [
    + Understand the MQTT protocol.
    + Understand MQTT communication through a local broker.
    + Understand an IoT implementation using Python on a Raspberry Pi Pico W microcontroller.
  ],
  
  requirements: [
    + Thonny as the MicroPython IDE,
    + Raspberry Pi Pico W,
    + Local server (Raspberry Pi 3B).
    + Basic knowledge of Python programming.
  ]
)

#pagebreak()

== MQTT

MQTT is a lightweight client-server message-transport protocol based on the
publish-subscribe model and designed for environments with limited bandwidth, power, or device resources.
Clients communicate through a broker using topics. MQTT supports several
Quality of Service (QoS) levels, sessions, retained messages, and Last Will messages, depending on the protocol version and
features used.

== Advantages of MQTT

MQTT is widely used in IoT systems because of the following characteristics:

1. *Lightweight and Efficient*

MQTT can be implemented in IoT systems on
small microcontrollers because its messages and protocol overhead can be compact. This
helps optimize the use of network bandwidth.

2. *Scalable*

The broker architecture and separation between publishers and subscribers allow
a system to be expanded to serve many clients. Actual scalability still depends
on broker capacity, topic design, message size, QoS, the network, and connection patterns.

3. *Reliable*

MQTT provides QoS 0, QoS 1, and QoS 2 with different delivery guarantees.
Reliability is not the same as latency: higher QoS levels may increase packet exchanges
and overhead. The selected QoS should match the acceptable risk of message loss or
duplication.

4. *Widely Supported*

MQTT is supported by many programming languages and platforms,
including Python libraries specifically designed to implement the
MQTT protocol on IoT devices. This broad support simplifies
development across different devices and systems.

== MQTT Communication Flow

As described previously, MQTT communication uses the
*publish-subscribe* model to transfer data. Data exchanged between
devices is carried in *messages* containing
information such as sensor readings or commands.

=== Publish-Subscribe

The terms publish and subscribe describe how MQTT clients exchange messages
through a broker. A publisher sends a message to a particular topic, while a subscriber
uses a topic filter so that the broker forwards matching messages.

#figure(
  image("gambar/modul 3/MQTT - Publish Subscribe.png", width: 13cm),
  kind: image,
  caption: [Publish-subscribe visualization]
)<gambar:publish-subscribe>

As shown in #ref(<gambar:publish-subscribe>), Device 1 publishes a
message to a topic and Device 2 subscribes with a matching topic filter. The broker
receives the message from Device 1 and forwards it to Device 2.

=== Topics

A topic is a hierarchical string used by the broker to route messages. A client
publishes a message to a topic, while a subscriber uses a topic filter
to receive matching messages. Topics are case-sensitive; the `+` and `#` wildcards
may be used in subscriptions according to MQTT rules, but they are not used in
topic names when publishing.

An MQTT topic is a *case-sensitive* string, so differences in
capitalization produce different topic names.

=== Broker

The broker receives messages from publishers, matches them against subscriptions, and
forwards them to clients whose topic filters match. Depending on its configuration, the broker may also manage
sessions, QoS, retained messages, authentication, and authorization.

#figure(
  image("gambar/modul 3/MQTT - Broker.png", width: 13cm),
  kind: image,
  caption: [Broker visualization]
)<gambar:broker>

Various MQTT broker services are available, including Adafruit IO and HiveMQ, with
different service plans and usage limits. A broker can also be self-hosted
on a single-board computer such as a Raspberry Pi using Mosquitto.

== Eclipse Mosquitto

Eclipse Mosquitto is a lightweight, open-source MQTT message broker that can
run on various systems, including the Raspberry Pi. Mosquitto makes it possible to set up a local broker
without depending on an external broker service such as Adafruit IO and HiveMQ.

#figure(
  image("gambar/modul 3/Eclipse Mosquitto.webp", width: 3.5cm),
  kind: image,
  caption: [Mosquitto MQTT logo]
)<gambar:logo-mosquitto>

// Mosquitto will be used as the local broker in the following implementation.

== MicroPython

MicroPython is an implementation of Python optimized to run on
microcontrollers and low-power devices. Created by Damien George,
MicroPython allows developers to use the Python programming language
on hardware with limited resources, including
microcontrollers and Internet of Things (IoT) devices.

The following are several key MicroPython features and characteristics:

1. *Lightweight and Optimized*

MicroPython is designed to run on hardware with
limited resources. Its interpreter and Python language core are reduced in size to
provide effective operation on microcontrollers with
limited memory.

2. *Support for Popular Microcontrollers*

MicroPython supports a range of popular microcontrollers, including the ESP8266,
ESP32, and STM32 families. This allows developers to
use Python on hardware platforms commonly
used in microcontroller projects.

3. *Interactive*

One of MicroPython's important features is its interactive mode. Users
can interact directly with the hardware through the REPL
(read-eval-print loop), which resembles Python on a desktop computer. This
facilitates development and debugging.

4. *Support for Python-Compatible Modules*

Although it is designed for microcontrollers, MicroPython includes a number of
modules that resemble modules available in other Python implementations.
These modules may differ in size, features, or implementation,
and not every CPython standard-library module is available without
adaptation.

5. *I/O Capabilities*

MicroPython provides interfaces for accessing I/O pins and other
microcontroller hardware, enabling developers to
control sensors, motors, and other components.

6. *Wi-Fi and Networking Support*

Some MicroPython ports, particularly those for devices such as
the ESP8266 and ESP32, support Wi-Fi and
networking, allowing devices to connect to local networks or the internet.

7. *A Growing Community and Ecosystem*

MicroPython has an active developer community and many online
resources and tutorials. These resources make it easier
for developers to begin using MicroPython and troubleshoot
problems.

MicroPython brings the accessibility and expressive power of
Python to microcontrollers, making it an attractive option for
IoT projects and low-power hardware development.

== Raspberry Pi Pico W

The Raspberry Pi Pico W is an RP2040-based microcontroller board with a
dual-core Arm Cortex-M0+ processor, 264 kB of SRAM, and 2 MB of external flash on the standard board.
The Pico W adds 2.4 GHz IEEE 802.11 b/g/n Wi-Fi connectivity and
Bluetooth 5.2 support through a wireless chip that communicates with the RP2040. The board can be
programmed using MicroPython, C, or C++; MicroPython is not the only
supported programming language. The pinout diagram is shown in
#ref(<gambar:pinout-rp2040w>).

== Implementing the MQTT Protocol

#figure(
  image("gambar/modul 3/MQTT - Implementation.png", width: 14cm),
  kind: image,
  caption: [MQTT implementation with the Raspberry Pi Pico W]
)<gambar:implementasi-mqtt>

The message flow between the Raspberry Pi Pico W and Mosquitto MQTT is as follows:
1. Device 1 publishes a message to topic 'A' on the MQTT broker.
2. Device 2 subscribes to topic 'A'.
3. The MQTT broker forwards the message from Device 1 to Device 2 according to the subscription.

=== Setting Up a Local Broker on the Raspberry Pi

MQTT requires a broker to act as an intermediary between clients that
publish messages and clients that subscribe. In this practicum, a
Raspberry Pi single-board computer runs the local MQTT broker. This section
is optional when an external broker such as HiveMQ or
Adafruit IO is used.

Install the #code("mosquitto") packages on the Raspberry Pi by running the following commands in the terminal:

#code-box(title: "Installing the Mosquitto MQTT Broker", [
```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
```
])

When a command is run with #code("sudo"), the system may request the password for
the Raspberry Pi user account. The #code("mosquitto") and
#code("mosquitto-clients") packages are used to configure and test the MQTT broker.

Next, run the following command in the terminal to enable Mosquitto
automatically when the Raspberry Pi starts:

#code-box(title: "Enabling Mosquitto MQTT at Startup", [
```bash
sudo systemctl enable mosquitto.service
```
])

Run the following command in the terminal to view the Raspberry Pi IP address:

#code-box(title: "Viewing the Raspberry Pi IP Address", [
```bash
hostname -I
# Alternatively, use the following command
ip addr
```
])

The commands above display the Raspberry Pi's IPv4 and IPv6 addresses. Only the IPv4 address is required
for the broker in this example, such as #code("192.168.1.100").

==== Without Authentication

To allow other devices to access the broker without authentication, edit the Mosquitto
configuration. Open #code("/etc/mosquitto/mosquitto.conf", lang: "sh") with a text editor,
for example #code("nano") in the terminal:

#code-box(title: "Opening a Text Editor in the Terminal", [
```bash
sudo nano /etc/mosquitto/mosquitto.conf
```
])

In editing mode, add the following options at the end of the
#code("mosquitto.conf") configuration:

#code-box(title: "Contents of the mosquitto.conf Configuration File", [
```conf
# Default configuration
pid_file /run/mosquitto/mosquitto.pid

persistence true
persistence_location /var/lib/mosquitto

log_dest file /var/log/mosquitto/mosquitto.log

include_dir /etc/mosquitto/conf.d

# New file content
listener 1883
allow_anonymous true
```
])

In the configuration above, #code("listener 1883", lang: "conf") sets
the MQTT listener port, while #code("allow_anonymous true", lang: "conf") allows
any client to use the broker without authentication. This configuration must only
be used on an isolated practicum network and must not be exposed to the
internet. After saving the configuration, restart the Mosquitto service.

#code-box(title: "Restarting the Mosquitto MQTT Service", [
```bash
sudo systemctl restart mosquitto.service
```
])

=== With Authentication

To add authentication to the broker, several additional configuration steps
are required. Create the username and password that will be used by MQTT clients.

#code-box(title: "Adding a Username and Password to Mosquitto MQTT", [
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd YOUR_USERNAME
# After running the command above, enter the password when prompted.

# Change the file permissions so that Mosquitto can read the file
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd
sudo chmod 600 /etc/mosquitto/passwd
```
])

When entering a password, the terminal normally does not display the typed characters.
Record and store the password securely. Then
change the default #code("mosquitto.conf") configuration as follows:

#code-box(title: "Contents of the mosquitto.conf Configuration File", [
```conf
# New file content
# Authentication configuration applies to this listener

# Default configuration
pid_file /run/mosquitto/mosquitto.pid

persistence true
persistence_location /var/lib/mosquitto

log_dest file /var/log/mosquitto/mosquitto.log

include_dir /etc/mosquitto/conf.d

# New file content
allow_anonymous false
listener 1883
password_file /etc/mosquitto/passwd
```
])

Unlike the previous configuration, #code("allow_anonymous") is set to #code("false") so that
clients without valid credentials cannot use the broker. Username-and-password
authentication does not encrypt traffic; use TLS when the broker is accessed over
an untrusted network. Next, ensure that Mosquitto can read the
#code("passwd") file by running the following commands:

#code-box(title: "Changing the passwd File Permissions", [
```bash
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd
sudo chmod 600 /etc/mosquitto/passwd
```
])

Finally, restart the Mosquitto service.

#code-box(title: "Restarting the Mosquitto MQTT Service", [
```bash
sudo systemctl restart mosquitto.service
```
])

=== Setting Up the MQTT Library on the Raspberry Pi Pico W

The library used to run MQTT on the Pico W is
#code("micropython-umqtt.simple").
The following steps show how to add the library through Thonny for MicroPython:

#figure(
  image("gambar/modul 3/MQTT - Library.png", width: 10cm),
  kind: image,
  caption: [Tools > Manage Packages]
)<gambar:mqtt-library>

=== Raspberry Pi Pico W Source Code

==== Publish

1. *Required Libraries and Variables*

The library required to use the MQTT protocol in
MicroPython is #code("umqtt.simple").

#code-box(title: "MicroPython Library Import", [
```python
import network                      # Network connectivity
import time                         # Provides sleep() 
from umqtt.simple import MQTTClient # MQTT library
import utime                        # Time formatting
```
])

After importing the libraries, declare the required variables. These
include:
- Variables for the Wi-Fi network
- Variables for the MQTT client
- A variable containing the data to be published to the broker

#code-box(title: "Source Code for Variable Initialization", [
```python
# Enter the Wi-Fi name and password for the network shared with the local broker
wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Enter the address of the broker being used (Mosquitto, HiveMQ, Adafruit IO)
# or another broker
mqtt_host     = "<MQTT HOST ADDRESS>"

# Optional: credentials when authentication is enabled
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# Enter the topic to which messages will be published
mqtt_publish_topic = "<YOUR mqtt_topic/feed_director>" 

# Enter a client ID that is unique for each client
mqtt_client_id = "uus9asndajsndiqiwd10wid01n1kwd"

# Number to publish
counter = 0
```
])

2. *Connecting the Pico W to Wi-Fi and the MQTT Server*

After declaring the variables, connect the
Pico W to Wi-Fi and the MQTT server. The function used
to connect to Wi-Fi is:

#code("wlan.connect(\"<YOUR WIFI SSID>\", \"<YOUR WIFI PASSWORD>\")", lang: "python")

and the function used to connect the MQTT client is:

#code("mqtt_client.connect()", lang: "python")

#code-box(title: "Source Code for Connecting to Wi-Fi and the MQTT Server", [
```python
# Connect to Wi-Fi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while wlan.isconnected() == False:
  print('Waiting for connection...')
  time.sleep(1)
  
print("Connected to WiFi")

# Initialize our MQTTClient and connect to the MQTT server
mqtt_client = MQTTClient(
  client_id=mqtt_client_id,
  server=mqtt_host,
  # Optional: use when authentication is enabled
  user=mqtt_username,
  password=mqtt_password
)
  
mqtt_client.connect()
```
])

3. *The `try` Block*

In the code below, the Pico W publishes
the value stored in the `counter` variable using:

#code("mqtt_client.publish(\"<Target topic>\", str(<Value to publish>))", lang: "python")

#code-box(title: "Source Code for the try Block (Comparable to the Arduino loop Function)", [
```python
try:
  while True:
    # Generate some dummy data that changes every loop
    counter += 3
    
    # Get the current timestamp
    current_time = utime.localtime()
    timestamp = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}".format(
      current_time[0], current_time[1], current_time[2],
      current_time[3], current_time[4], current_time[5]
    )
    
    # Publish the data to the topic!
    print(f'{timestamp} - Publish {counter}')
    mqtt_client.publish(mqtt_publish_topic, str(counter))
    
    # Delay a bit to avoid hitting the rate limit
    time.sleep(3)
  
# Handle transmission errors
except Exception as e:
  print(f'MQTT error: {e}')

# Disconnect when the Python program stops
finally:
  mqtt_client.disconnect()
```
])

The information is repeatedly published to the MQTT server
every three seconds through #code("time.sleep(3)", lang: "python").

==== Subscribe

As in the publisher example, the library required to subscribe
to MQTT topics in MicroPython is #code("umqtt.simple").

#code-box(title: "MicroPython Library Import", [
```python
import network
import time
from umqtt.simple import MQTTClient
import utime
```
])

#code-box(title: "Source Code for Variable Initialization", [
```python
# Enter the Wi-Fi name and password for the network shared with the local broker
wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Enter the address of the broker being used (Mosquitto, HiveMQ, Adafruit IO)
# or another broker
mqtt_host     = "<MQTT HOST ADDRESS>"

# Optional: credentials when authentication is enabled
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# Enter the topic filter to subscribe to
mqtt_receive_topic = "<YOUR mqtt_topic/feed_director>" 

# Enter a client ID that is unique for each client
mqtt_client_id = "iij0dfq8f012nif2jnfijn"
```
])

#code-box(title: "Source Code for Connecting to Wi-Fi and the MQTT Server", [
```python
# Connect to Wi-Fi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while wlan.isconnected() == False:
  print('Waiting for connection...')
  time.sleep(1)
  
print("Connected to WiFi")

# Initialize our MQTTClient and connect to the MQTT server
mqtt_client = MQTTClient(
  client_id=mqtt_client_id,
  server=mqtt_host,
  # Optional: use when authentication is enabled
  user=mqtt_username,
  password=mqtt_password
)
```
])

The main difference between the subscriber and publisher source code is the
callback function, which is invoked whenever a new message arrives on a
subscribed topic.

#code-box(title: "MQTT Callback Function for a New Message", [
```python
def mqtt_subscription_callback(topic, message):
  # Get the current timestamp
  current_time = utime.localtime()
  
  timestamp = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}".format(
    current_time[0], current_time[1], current_time[2],
    current_time[3], current_time[4], current_time[5]
  )
  # Debug print out of what was received over MQTT
  print (f'{timestamp} - Topic {topic} received message {message}') 

# Before connecting, tell the MQTT client to use the callback
mqtt_client.set_callback(mqtt_subscription_callback)
mqtt_client.connect()
```
])

After defining the callback function, subscribe to the required topic filter
using:

#code("mqtt_client.subscribe(\"<Topic_yang_dilanggani>\")", lang: "python")

#code-box(title: "Subscribing to the Selected Topic", [
```python
# Once connected, subscribe to the MQTT topic
mqtt_client.subscribe(mqtt_receive_topic)
print("Connected and subscribed")
```
])

#code-box(title: "Source Code for the try Block (Comparable to the Arduino loop Function)", [
```python
try:
  while True:
    # Infinitely wait for messages on the topic.
    # Note wait_msg() is a blocking call, if you're doing multiple things
    # on the Pico you may want to look at putting this on another thread.
    print(f'Waiting for messages on {mqtt_receive_topic}') 
    mqtt_client.wait_msg()
    
# Handle transmission errors
except Exception as e:
  print(f'MQTT error: {e}')

# Disconnect when the Python program stops
finally:
  mqtt_client.disconnect()
```
])

In the code above, #code("mqtt_client.wait_msg()", lang: "python") waits for a message
from an MQTT client publishing to the subscribed topic. When data is received, the program produces
output according to the behavior defined in #code("mqtt_subscription_callback()").


#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#modul_page(lang: doc-lang,
  modul_number: 4,
  modul_title: "LONG RANGE (LoRa) COMMUNICATION",
  
  tujuan: [
    + Understand Long Range (LoRa) modulation technology.
    + Understand LoRa communication, especially regarding to LoRaWAN.
  ],
  
  requirements: [
    + Arduino IDE/PlatformIO,
    + LoRa Module/Cosmic LoRa Aurora V2 ESP32 LoRa Module,
    + ANTARES Account,
    + Sensor (optional),
    + Actuator (optional)
  ]
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

== LoRa

LoRa (Long Range) is a spread-spectrum radio modulation technique for long-range
communication with a low data rate and relatively low power consumption. LoRa operates
in sub-GHz frequency bands whose regulations vary by region. This technology is suitable
for transmitting small data packets in applications such as smart agriculture, smart
cities, industrial monitoring, and environmental sensing. LoRa is not a network protocol;
the network protocol commonly built on top of LoRa is LoRaWAN.

#figure(
  image("gambar/modul 4/LoRa - Bandwidth.png", width: 14cm),
  kind: image,
  caption: [LoRa Bandwidth - Range]
)

LoRa uses Chirp Spread Spectrum (CSS) and error-correction techniques to improve
signal reception robustness. Parameters such as spreading factor, bandwidth, coding
rate, frequency, and transmit power affect range, airtime, interference resistance, and
data rate. A star-of-stars topology is a characteristic of the LoRaWAN architecture, not
a mandatory property of peer-to-peer LoRa communication.

== LoRa Communication Flow

LoRa communication uses frequency bands that comply with regional plans and local
regulations. For example, LoRaWAN uses the EU863-870 regional parameters in parts of
Europe and US902-928 in the United States. In Indonesia, the applicable regional
parameters are AS923-2 in the *920–923 MHz* band. Users must ensure that frequency,
transmit power, duty cycle, and device certification comply with applicable regulations.

The choice of frequency affects communication range and performance. End devices,
such as IoT sensors or connected objects, use LoRa modulation to convert encoded data
into chirp signals transmitted over the air. This modulation enables efficient long-range
information transmission while conserving power.

LoRa uses *Chirp Spread Spectrum (CSS)* modulation, in which the chirp signal's
frequency changes over time. In peer-to-peer communication, the transmitter and receiver
communicate directly when they use compatible radio parameters, such as frequency,
bandwidth, spreading factor, coding rate, and sync word. In a LoRaWAN network, a packet
from an end device may be received by one or more gateways and then forwarded through
an IP network to the network server. Gateways and servers are therefore components of
LoRaWAN, not requirements for every form of LoRa communication.
== LoRaWAN

LoRaWAN (Long Range Wide Area Network) is a network communication protocol built on LoRa modulation technology. LoRa defines how radio signals are transmitted over the air, whereas LoRaWAN defines how devices join a network, transmit and receive data, perform authentication, maintain data security, and forward device data to user applications.

In general, LoRaWAN involves four main components:

+ *End device*: a sensor, actuator, or IoT device that collects and transmits data.
+ *Gateway*: receives LoRa packets from multiple *end devices* and forwards them through an IP network.
+ *Network server*: manages devices, validates packet security, removes duplicate data, and determines how data are forwarded.
+ *Application server*: processes and presents data for users or application systems.

#figure(
  image("gambar/modul 4/LoRaWAN - Architecture.webp", width: 14cm),
  kind: image,
  caption: [LoRaWAN Architecture]
)

LoRaWAN uses a *star-of-stars* topology. In this topology, an *end device* is not bound to a particular gateway. A single data packet may be received by several gateways at once and then forwarded to the *network server*. The server selects and processes the appropriate packet and removes duplicates. This approach can improve communication range and reliability without requiring end devices to perform *routing* as they would in a *mesh* network.

LoRaWAN is suitable for applications that transmit small amounts of data periodically or in response to an event, such as temperature, humidity, air quality, asset location, water level, meter status, machine condition, and device status. It is often selected because it can provide wide-area coverage, low power consumption, support for many devices, and relatively low network deployment costs.

The LoRaWAN communication flow begins when an *end device* reads sensor data and then packages and encrypts the data according to the LoRaWAN format. The data are transmitted using LoRa modulation and may be received by one or more gateways. The gateways forward the packet through an internet connection or local network to the *network server*. After authentication, integrity checking, duplicate removal, and network management, the data are forwarded to the *application server* for storage, analysis, or dashboard presentation. For *downlink* communication, data travel from the *application server* back to the *end device* through the *network server* and a gateway.

LoRaWAN is appropriate when a system has the following characteristics:

+ Requires communication over distances of up to several kilometers;
+ Uses battery-powered devices that must operate for long periods;
+ Has many sensors distributed over a wide area;
+ Transmits only small amounts of data at specified intervals;
+ Does not require a high data rate or real-time communication;
+ Requires security, device authentication, and centralized network management.

Conversely, LoRaWAN is not well suited to applications that require video, audio, large-file transfer, very-low-latency control, or continuous data communication. Technologies such as Wi-Fi, Ethernet, cellular networks, or other higher-capacity communication protocols are more appropriate for those requirements.

== LoRaWAN Device Classes

LoRaWAN devices are categorized into Class A, Class B, and Class C. These classes
determine when a device opens downlink receive windows and therefore affect latency,
power consumption, and communication patterns. Every LoRaWAN end device must support
Class A; support for Class B and Class C is optional.

=== Class A

In Class A, uplink communication is initiated by the end device. After each uplink,
the device opens two downlink receive windows. This pattern provides the lowest power
consumption, but a downlink must wait until the device sends an uplink.

#figure(
  image("gambar/modul 4/LoRa - Class A.png"),
  kind: image,
  caption: [LoRa Class A Communication]
)

=== Class B

Class B adds network beacons and scheduled ping slots to the Class A mechanism.
With this schedule, the server has more predictable downlink opportunities, but power
consumption and synchronization complexity are higher than in Class A.

#figure(
  image("gambar/modul 4/LoRa - Class B.png"),
  kind: image,
  caption: [LoRa Class B Communication]
)

=== Class C

Class C keeps the receiver open almost continuously, except while the device is
transmitting. This provides the lowest downlink latency but the highest power consumption,
so it is generally used for devices with a stable power supply.

#figure(
  image("gambar/modul 4/LoRa - Class C.png"),
  kind: image,
  caption: [LoRa Class C Communication]
)

== ANTARES

ANTARES is a horizontal Internet of Things platform developed by PT Telkom Indonesia Tbk. 
It provides services for connecting and managing IoT devices, storing sensor data, and presenting the data through dashboards or other applications. 
ANTARES supports various IoT implementations, including smart homes, smart metering, asset tracking, and smart buildings.
    
#figure(
  image("gambar/modul 4/ANTARES.svg", width: 8cm),
  kind: image,
  caption: [ANTARES Logo]
)

ANTARES consists of two main service areas: the IoT platform and IoT connectivity. 
Its connectivity services support technologies such as LoRaWAN, NB-IoT, and GPRS, enabling IoT devices to transmit data to the ANTARES platform for monitoring and processing. 
It is the LoRaWAN IoT Platform that we will use in the implementation on the next section.

== LoRa Protocol Implementation

=== Peer-to-peer LoRa using Cosmic LoRa Aurora V2

#figure(
  image("gambar/modul 4/LoRa - P2P.png", width: 14cm),
  kind: image,
  caption: [LoRa P2P Visualization]
)

The Cosmic LoRa Aurora V2 is a LoRa development board that uses Cosmic's RFM95W
LoRa transceiver, as shown in #ref(<gambar:pinout-cosmicLoRa>). The board uses an ESP32
as its microcontroller, so it provides both LoRa and Wi-Fi connectivity. It supports three
power sources—USB, a LiPo battery, and a DC jack—and includes a smart power-switching
system that can automatically select the active source. For example, while the LiPo battery
is charging, the system can automatically switch to USB or the DC jack.


The LoRa library developed by Sandeep Mistry is used for the LoRa implementation
with the Cosmic LoRa Aurora V2. It supports sending and receiving data through LoRa
communication and is included with the #code("LoRa.h") header.

#info-box([
  The library is available from the following repository:\ #link("https://github.com/sandeepmistry/arduino-lora")[https://github.com/sandeepmistry/arduino-lora]
])

==== LoRa Peer-to-Peer Source Code

The LoRa peer-to-peer transmitter and receiver source code is based on Cosmic's
example, which is available at the following webpage:k

#info-box(title: "Source Code",[
  The original code can be found in the link below:\
#link("https://github.com/cosmic-id/cosmic-lora-aurora/blob/main/examples/aurora-v2-lora-p2p-receiver/aurora-v2-lora-p2p-receiver.ino")[https://github.com/cosmic-id/cosmic-lora-aurora/blob/main/examples/aurora-v2-lora-p2p-receiver/aurora-v2-lora-p2p-receiver.ino]
])

- *Transmitter*

1. *Initialization*

#code-box(title: "LoRa Transmitter Initialization", [
```cpp
// The receiver and transmitter use two libraries: SPI.h and Sandeep Mistry's LoRa.h
#include <SPI.h>
#include <LoRa.h>

// Define the pins used by the LoRa module
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32

#define LORA_TX_POWER         20
#define LORA_SPREADING_FACTOR 12

int counter = 0;
```
])

To initialize LoRa P2P communication, the program uses the #code("SPI.h") library and
Sandeep Mistry's #code("LoRa.h") library. It then defines the LoRa module pins in the
#code("#define") declarations. The code above also initializes an additional variable,
#code("counter"), whose value will be sent to the receiver.

2. *Setup*

#code-box(title: "LoRa Transmitter Setup", [
```cpp
void setup() {
  pinMode(LORA_EN, OUTPUT);     // Initialize the LoRa pin mode
  digitalWrite(LORA_EN, HIGH);  // Turn on the LoRa chip
  
  // Initialize the Serial Monitor
  Serial.begin(115200);
  while (!Serial);
  Serial.println("LoRa Sender");
  
  // Configure the LoRa module pins
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  // Change the LoRa.begin(---E-) argument with a frequency permitted in your region
  // 433E6 for region Asia
  // 866E6 for region Europe
  // 915E6 for region North America
  // 920E6 for Indonesia
  while (!LoRa.begin(920E6)) {
    Serial.println(".");
    delay(500);
  } 

  LoRa.setTxPower(LORA_TX_POWER, PA_OUTPUT_PA_BOOST_PIN);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);

  // Set the sync word (0xF3) consistently on both transceivers
  // The sync word helps filter packets with different values
  // Valid range: 0x00–0xFF
  LoRa.setSyncWord(0xF3);
  Serial.println("LoRa Initializing OK!");
}
```
])

In the transmitter's #code("setup()") function, several settings must be defined:

#pad(left: 2em)[
- Declare the enable pin with *pinMode*. In this code, the enable pin is represented by #code("LORA_EN"), and its state is set to #code("HIGH").
- Configure the LoRa module pins using #code("LoRa.setPins(NSS_PIN, RST_PIN, DIO0_PIN)").
- Start the LoRa module using #code("LoRa.begin(frequency)"), where #code("frequency") is set to a value permitted by regional regulations. This Indonesian practicum example uses #code("920E6") in the 920–923 MHz band (AS923-2). Ensure that the frequency and transmit power comply with regulations and device specifications.
- Set the same *sync word* on the transmitter and receiver. The sync word is a synchronization parameter, not a device address or security mechanism. Its value ranges from 0x00 to 0xFF and is set using #code("LoRa.setSyncWord(sync_word)").
]

3. *Loop*

#code-box(title: "LoRa Transmitter Loop", [
```cpp
void loop() {
  Serial.print("Sending packet: ");
  Serial.println(counter);
  
  // Send a LoRa packet to the receiver
  LoRa.beginPacket();
  LoRa.print("hello ");
  LoRa.print(counter);
  LoRa.endPacket();
  
  counter++;
  delay(5000);
}
```
])

- *Receiver*

1. *Initialization*

#code-box(title: "LoRa Receiver Initialization", [
```cpp
// The receiver and transmitter use two libraries: SPI.h and Sandeep Mistry's LoRa.h
#include <SPI.h>
#include <LoRa.h>

// Define the pins used by the LoRa module
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32

#define LORA_TX_POWER         20
#define LORA_SPREADING_FACTOR 12

```
])

The receiver and transmitter use the same pin and library initialization. However,
the receiver code does not declare the additional #code("counter") variable used by the
transmitter as outgoing LoRa data.

2. *Setup*

#code-box(title: "LoRa Receiver Setup", [
```cpp
void setup() {
  pinMode(LORA_EN, OUTPUT);     // Initialize the LoRa pin mode
  digitalWrite(LORA_EN, HIGH);  // Turn on the LoRa chip
  
  // Initialize the Serial Monitor
  Serial.begin(115200);
  while (!Serial);
  Serial.println("LoRa Receiver");
  
  // Configure the LoRa module pins
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  
  // Change the LoRa.begin(---E-) argument with a frequency permitted in your region
  // 433E6 for region Asia
  // 866E6 for region Europe
  // 915E6 for region North America
  // 920E6 for Indonesia
  while (!LoRa.begin(920E6)) {
    Serial.println(".");
    delay(500);
  } 

  LoRa.setTxPower(LORA_TX_POWER, PA_OUTPUT_PA_BOOST_PIN);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);

  // Set the sync word (0xF3) consistently on both transceivers
  // The sync word helps filter packets with different values
  // Valid range: 0x00–0xFF
  LoRa.setSyncWord(0xF3);
  Serial.println("LoRa Initializing OK!");
}
```
])

In the receiver's #code("setup()") function, pay particular attention to the frequency
and sync word. The transmitter and receiver must use matching values. In this example,
the frequency is 920E6 and the sync word is 0xF3.

3. *Loop*

#code-box(title: "LoRa Receiver Loop", [
```cpp
void loop() {
  // Attempt to parse an incoming packet
  int packetSize = LoRa.parsePacket();
  
  if (packetSize) {
    // Receive a packet
    Serial.print("Received packet '");
    
    // Read the received packet
    while (LoRa.available()) {
      String LoRaData = LoRa.readString();
      Serial.print(LoRaData);
    }
    
    // Display the RSSI of the received packet
    Serial.print("' with RSSI ");
    Serial.println(LoRa.packetRssi());
  }
}
```
])

In the #code("loop()") function, the receiver accepts data from a transceiver that uses
the same sync word. #code("LoRa.parsePacket()") checks for an incoming packet. When a
packet is available, it is read with #code("LoRa.readString()") while
#code("LoRa.available()") remains true. Finally, #code("LoRa.packetRssi()") returns the
received packet's signal strength in dBm.

=== LoRaWAN Implementation using ANTARES

The communication process can be described as follows:

#align(center)[
*End Device → LoRaWAN Gateway → ANTARES Platform*
]

The end device transmits data using LoRa modulation and the LoRaWAN protocol. The gateway receives the radio packet and forwards it to the ANTARES infrastructure through an Internet connection.

This implementation uses LoRaWAN Class A and Activation by Personalization or ABP. In ABP activation, the device uses a predefined device address and session keys without performing a join procedure each time it starts.


==== Creating an Application and Device in ANTARES

Before uploading the program, create an application and a device on the ANTARES console. The application and device are created using the following steps:

1. Sign in to the ANTARES console.

#figure(
  image("gambar/modul 4/ANTARES - Sign Up.png", height: 6.5cm),
  kind: image,
  caption: [ANTARES Sign Up]
)

2. Open the application page

#figure(
  image("gambar/modul 4/ANTARES - Application Dashboard.png", height: 6.5cm),
  kind: image,
  caption: [ANTARES Application Dashboard]
)

3. Create a new application

#figure(
  image("gambar/modul 4/ANTARES - Create Application.png", height: 6.5cm),
  kind: image,
  caption: [ANTARES Create Application Dialog]
)

4. Then it will be redirected to device page. Create a new device.

#figure(
  image("gambar/modul 4/ANTARES - Device Dashboard.png", height: 7cm),
  kind: image,
  caption: [ANTARES Application's Device Page]
)

#figure(
  image("gambar/modul 4/ANTARES - Create Device.png", height: 7cm),
  kind: image,
  caption: [ANTARES Create Device Dialog]
)

5. After that, it will be redirected to the device's detail. Select *Set LoRa*.

#figure(
  image("gambar/modul 4/ANTARES - LoRa Dashboard.png", height: 7cm),
  kind: image,
  caption: [ANTARES Device's Detail]
)

6. Configure the LoRa settings as below:

#figure(
  image("gambar/modul 4/ANTARES - LoRa Config.png", height: 7cm),
  kind: image,
  caption: [ANTARES Device's Detail]
)

7. Finally, save the generated LoRaWAN parameters. You can take a look at the parameters needed from below figure.

#figure(
  image("gambar/modul 4/ANTARES - Final.png", height: 7cm),
  kind: image,
  caption: [ANTARES Device's LoRaWAN parameter]
)

ANTARES generates the following ABP parameters:

- *Device Address* or `DevAddr`;
- *Network Session Key* or `NwkSKey`;
- *Application Session Key* or `AppSKey`.

Copy and save these parameters before completing the device configuration. The parameters must be entered into the Arduino program.

#info-box([
The network session key and application session key are confidential credentials. do not publish the actual keys in reports, screenshots, or public repositories.
])

==== Installing the ANTARES LoRaWAN Library

Install the ANTARES LoRaWAN library called #code("AntaresLoraID") in the Arduino IDE.

#info-box([
  The library is available from the following documentation:\ 
#link("https://docs.antares.id/pendahuluan/instalasi-library-arduino/antares-lorawan")[https://docs.antares.id/pendahuluan/instalasi-library-arduino/antares-lorawan]
])

The program uses the `lorawan.h` header file provided by the ANTARES LoRaWAN library.

==== Setting the ABP Parameters

Enter the Device Address, Network Session Key, and Application Session Key generated by ANTARES into the following variables:

#code-box(title: "ABP Parameters", [

```cpp
const char *devAddr = "YOUR-DEVICE-ADDRESS";
const char *nwkSKey = "YOUR-NETWORK-SESSION-KEY";
const char *appSKey = "YOUR-APPLICATION-SESSION-KEY";
```

])

Each value must be copied without spaces or additional characters.

===== LoRaWAN Source Code Program

The following program configures the Cosmic LoRa Aurora V2 as a LoRaWAN Class A end device using Activation by Personalization or ABP. The device sends counter data to ANTARES every 60 seconds and checks for downlink messages after each uplink transmission.

The program begins by including the SPI and ANTARES LoRaWAN libraries:

#code-box(title: "Required Libraries", [
```cpp 
#include <SPI.h>
#include <lorawan.h>
```
])

The `SPI.h` library manages communication between the ESP32 and the RFM95W radio module. The `lorawan.h` library provides the functions required to configure and operate the LoRaWAN connection.

The following definitions specify the RFM95W pin configuration used by the Cosmic LoRa Aurora V2:

#code-box(title: "LoRa Radio Pin Configuration", [
```cpp
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_DIO1 2
#define LORA_EN   32

#define SPI_MISO 23
#define SPI_MOSI 19
#define SPI_SCK 18
```
])

GPIO 15 is used as the chip-select or NSS pin. GPIO 0 is connected to the reset pin, while GPIO 27 and GPIO 2 are connected to DIO0 and DIO1. GPIO 32 controls the radio-enable circuit and must be set to `HIGH` before the radio is initialized.

The ABP credentials generated by ANTARES are stored in the following variables:

#code-box(title: "ANTARES ABP Parameters", [
```cpp
const char *devAddr = "YOUR-DEVICE-ADDRESS";
const char *nwkSKey = "YOUR-NETWORK-SESSION-KEY";
const char *appSKey = "YOUR-APPLICATION-SESSION-KEY";
```
])

The `devAddr` variable contains the LoRaWAN device address. The `nwkSKey` variable contains the Network Session Key, while `appSKey` contains the Application Session Key. Replace the placeholder values with the parameters generated through the ANTARES console.

The following variables define the transmission interval and store the program state:

#code-box(title: "Program Variables", [

```cpp
const unsigned long interval = 60000;

unsigned long previousMillis = 0;
unsigned int messageCounter = 0;

char message[50];
char receivedData[255];

byte receiveStatus = 0;
int channel = 0;
```
])

The `interval` value is expressed in milliseconds. A value of `60000` causes the device to send one uplink every 60 seconds. 
The `previousMillis` variable stores the time of the previous transmission, while `messageCounter` records the number of messages generated by the device.
The `message` array stores the uplink message. The `receivedData` array stores downlink data received from ANTARES.

The RFM95W pin mapping is then passed to the LoRaWAN library:

#code-box(title: "RFM95W Pin Mapping", [

```cpp
const sRFM_pins RFM_pins = {
  .CS = LORA_NSS,
  .RST = LORA_RST,
  .DIO0 = LORA_DIO0,
  .DIO1 = LORA_DIO1,
};
```

])

The `RFM_pins` structure allows the library to communicate with the RFM95W radio using the correct ESP32 pins.

The `setup()` function initializes the Serial Monitor, radio-enable circuit, SPI interface, RFM95W module, and LoRaWAN parameters:

#code-box(title: "Setup Function", [

```cpp
void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);

  if (!lora.init()) {
    Serial.println("RFM95W radio was not detected");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("RFM95W radio initialized");

  // A Class A device opens two receive windows after each uplink transmission. 
  // Therefore, downlink messages are normally delivered after the device sends an uplink.
  lora.setDeviceClass(CLASS_A);
  
  // The data rate is configured using spreading factor 10 and a bandwidth of 125 kHz:
  // A higher spreading factor generally increases communication range and 
  // receiver sensitivity but also increases airtime and reduces the data rate.
  lora.setDataRate(SF10BW125);

  // It will be available to multiple LoRaWAN channels
  lora.setChannel(MULTI);
  
  // The transmission power should comply with the applicable regional frequency 
  // regulations and the requirements of the LoRaWAN network
  lora.setTxPower1(15);

  // ABP credentials
  // Because ABP uses predefined session parameters, 
  // the device does not perform an OTAA join procedure before transmitting data.
  lora.setNwkSKey(nwkSKey);
  lora.setAppSKey(appSKey);
  lora.setDevAddr(devAddr);

  Serial.println("LoRaWAN Class A ABP configuration completed");
}
```
])

The `loop()` function controls periodic uplink transmission and downlink reception:

#code-box(title: "Main Loop", [
```cpp
void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    snprintf(message, sizeof(message), "LoRa Counter-%u", messageCounter);

    Serial.print("Sending: ");
    Serial.println(message);

    // The message will be send here
    lora.sendUplink(message, strlen(message), 0, 5);

    messageCounter++;

    channel = lora.getChannel();

    Serial.print("Channel: ");
    Serial.println(channel);
  }

  lora.update();

  receiveStatus = lora.readData(receivedData);

  if (receiveStatus > 0) {
    bool isText = true;

    for (int i = 0; i < receiveStatus; i++) {
      if (!(
        (receivedData[i] >= 32 && receivedData[i] <= 126) ||
         receivedData[i] == 10 || receivedData[i] == 13)
        ){
        isText = false;
        break;
      }
    }

    if (isText) {
      Serial.print("Received text: ");

      for (int i = 0; i < receiveStatus; i++) {
        Serial.print(receivedData[i]);
      }
    } else {
      Serial.print("Received hexadecimal data: ");

      for (int i = 0; i < receiveStatus; i++) {
        if (static_cast<byte>( receivedData[i]) < 0x10) {
          Serial.print('0');
        }

        Serial.print(static_cast<byte>( receivedData[i]), HEX);
        Serial.print(' ');
      }
    }

    Serial.println();
  }
}
```
])

The uplink message is created using the current message-counter value:

#code-box(title: "Creating the Uplink Message", [
```cpp
snprintf(message, sizeof(message), "LoRa Counter-%u", messageCounter);
```
])

For example, the first three generated messages are:

#code-box(title: "Generated Messages", [
```text
LoRa Counter-0
LoRa Counter-1
LoRa Counter-2
```
])

The message is transmitted using the `sendUplink()` function:

#code-box(title: "Sending Data to ANTARES", [
 ```cpp
lora.sendUplink(message, strlen(message), 0, 5);
```

])

The first parameter contains the message buffer. The second parameter contains the number of bytes to be transmitted.
 The third parameter determines whether the uplink is confirmed. A value of `0` selects an unconfirmed uplink. The fourth parameter specifies LoRaWAN application port 5.
 After sending the message, the program increases the message counter and reads the channel used for transmission:

#code-box(title: "Counter and Channel Information", [
```cpp
messageCounter++;

channel = lora.getChannel();

Serial.print("Channel: ");
Serial.println(channel);
```
])

The program then checks whether downlink data have been received:

#code-box(title: "Reading Downlink Data", [
```cpp
receiveStatus = lora.readData(receivedData);
```
])

The return value indicates the number of bytes received. If the value is greater than zero, the program checks whether every byte represents a printable character.

When all received bytes are printable, the downlink is displayed as text:

#code-box(title: "Displaying a Text Downlink", [

```cpp
Serial.print("Received text: ");

for (int i = 0; i < receiveStatus; i++) {
  Serial.print(receivedData[i]);
}
```

])

For example, an ANTARES downlink containing the text `ON` is displayed as:

#code-box(title: "Text Downlink Output", [

```text
Received text: ON
```

])

If the received data contain non-printable bytes, the program displays each byte in hexadecimal format:

#code-box(title: "Displaying a Binary Downlink", [
```cpp
Serial.print("Received hexadecimal data: ");

for (int i = 0; i < receiveStatus; i++) {
  if (static_cast<byte>( receivedData[i]) < 0x10) {
    Serial.print('0');
  }

  Serial.print(static_cast<byte>( receivedData[i]), HEX);
  Serial.print(' ');
}
```
])

A binary downlink may appear in the Serial Monitor as follows:

#code-box(title: "Binary Downlink Output", [
```text
Received hexadecimal data: 01 FF A0
```
])

==== Receiving a Downlink

ANTARES can send a downlink message to the LoRaWAN device. Because the program uses Class A, the downlink is delivered through a receive window opened after an uplink.
When a text downlink is received, the Serial Monitor displays output similar to:

#code-box(title: "Text Downlink Output", [
```text
Received text: ON
```
])

When the downlink contains non-printable binary data, the program displays it in hexadecimal format:

#code-box(title: "Binary Downlink Output", [
```text
Received hexadecimal data: 01 FF A0
```
])

If the device cannot send data to ANTARES, verify the Device Address, Network Session Key, Application Session Key, antenna connection, gateway coverage, radio pin configuration, device class, activation method, and LoRaWAN channel configuration.

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

#modul_page(lang: doc-lang,
  modul_number: 0,
  modul_title: "APPENDICES",
)

#show heading: set heading(  
  numbering: none,
)

#set figure(
  numbering: (..nums) => {
    let figure-number = nums.pos().first()
    [#figure-number]
  },
  outlined: true,
  supplement: [Appendix]
)

#pagebreak()

////////////////////////////////////////////////////////////////////////////////////////////

== APPENDIX: MICROCONTROLLER PINOUT DIAGRAMS

=== ESP32 DEVKIT V1 - DOIT
#figure(
  image("gambar/pinout/ESP32 Devkit V1 - DOIT.png"),
  kind: image,
  caption: [Pinout ESP32 DEVKIT V1 - DOIT]
)<gambar:pinout-esp32>

=== ESP32-S3
#figure(
  image("gambar/pinout/ESP32-S3.webp"),
  kind: image,
  caption: [Pinout ESP32-S3]
)<gambar:pinout-esp32s3>

=== RASPBERRY PI PICO W
#figure(
  image("gambar/pinout/Raspberry Pi Pico W.png"),
  kind: image,
  caption: [Pinout RASPBERRY PI PICO W]
)<gambar:pinout-rp2040w>

=== COSMIC LORA AURORA V2
#figure(
  image("gambar/pinout/Cosmic Aurora V2.png"),
  kind: image,
  caption: [Pinout Cosmic LoRa Aurora V2]
)<gambar:pinout-cosmicLoRa>

#pagebreak()

== APPENDIX: MODULE 1

=== Bluetooth Master Source Code

#code-box(title: "Bluetooth Master", [
```cpp
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

String masterName = "ESP32-Master"; // ESP Master name
String slaveName = "ESP32-Slave";
bool connected = false;
int value = 0;

void setup() {
  Serial.begin(115200);
  
  SerialBT.begin(masterName, true); // Start Bluetooth
  Serial.println("The device started in master mode, make sure remote BT device is on!");
  
  connected = SerialBT.connect(slaveName); // Check the Bluetooth connection
  if(connected) {
    Serial.println("Connected Successfully!");
  } else {
    while(!SerialBT.connected(10 * 1000)) { // Wait for 10 seconds
      Serial.println("Failed to connect!");
      Serial.println("Make sure remote device is available and in range, then restart");
    }
  }
  SerialBT.connect();
}

void loop() {
  if(value <= 10){
    SerialBT.println(value); // Send data through Bluetooth
    Serial.println(value);
    value++;
    
    delay(1000);
  }
  else {
    value = value - 10;
  }
}
```
])

=== Bluetooth Slave Source Code

#code-box(title: "Bluetooth Slave", [
```cpp
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

String slaveName = "ESP32-Slave"; // ESP Slave name
int value = 0;
String slaveValueStr;
int slaveValueInt;

void setup() {
  Serial.begin(115200);
  SerialBT.begin(slaveName); // Start Bluetooth as a receiving device
  Serial.println("The device started, now you can pair it with bluetooth!");
}

void loop() {
  if(SerialBT.available()){
    slaveValueStr = SerialBT.readStringUntil('\n'); // Read data from the Master
    slaveValueInt = slaveValueStr.toInt();
    
    Serial.print("Data from Master: ");
    Serial.println(slaveValueInt);
  }
}
```
])

=== BLE Central/Client Source Code

#code-box(title: "BLE Central/Client", [
```cpp
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>

#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce6e"
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676519"

static BLEAddress *pServerAddress;   // Address of the BLE Peripheral device
static boolean doConnect = false;    // Flag used to start a connection
static boolean connected = false;    // Connection status
static BLERemoteCharacteristic* pRemoteCharacteristic; // Remote characteristic
BLEClient*  pClient;                 // BLE client object

static void notifyCallback(
  BLERemoteCharacteristic* pBLERemoteCharacteristic,
  uint8_t* pData,
  size_t length,
  bool isNotify) {

  // Place control logic here

  String receivedData = "";
  for (size_t i = 0; i < length; i++) {
    receivedData += (char)pData[i];
  }

  Serial.print("Received from Slave: ");
  Serial.println(receivedData);
}

bool connectToServer(BLEAddress pAddress) {
  Serial.print("Connecting to Slave: ");
  Serial.println(pAddress.toString().c_str());

  // Create a new client
  pClient = BLEDevice::createClient();

  // Attempt to connect to the BLE Peripheral address
  if (!pClient->connect(pAddress)) {
    Serial.println("Connection failed!");
    return false;
  }

  Serial.println("Connected to Slave!");

  // Obtain the service from the Peripheral
  BLERemoteService* pRemoteService = pClient->getService(SERVICE_UUID);
  if (pRemoteService == nullptr) {
    Serial.println("Service not found!");
    pClient->disconnect();
    return false;
  }

  // Obtain the characteristic from the service
  pRemoteCharacteristic = pRemoteService->getCharacteristic(CHARACTERISTIC_UUID);
  if (pRemoteCharacteristic == nullptr) {
    Serial.println("Characteristic not found!");
    pClient->disconnect();
    return false;
  }

  // Enable notifications
  if (pRemoteCharacteristic->canNotify())
    pRemoteCharacteristic->registerForNotify(notifyCallback);

  connected = true;
  return true;
}

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    Serial.print("📡 Found device: ");
    Serial.println(advertisedDevice.toString().c_str());

    // Check whether the device advertises the required service UUID
    if (advertisedDevice.haveServiceUUID() && 
        advertisedDevice.isAdvertisingService(BLEUUID(SERVICE_UUID))
    ){
      Serial.println("Found target device! Stopping scan...");
      BLEDevice::getScan()->stop();

      pServerAddress = new BLEAddress(advertisedDevice.getAddress());
      doConnect = true;
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("=== BLE Master (Central) ===");

  // Initialize the BLE Central
  BLEDevice::init("ESP32_Master");

  // Start scanning
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(80);
  pBLEScan->setActiveScan(true);
  pBLEScan->start(5, false);  // Scan for 5 seconds
}

void loop() {
  // When a matching device is found, attempt to connect
  if (doConnect) {
    if (connectToServer(*pServerAddress)) {
      Serial.println("Connected & ready to receive data!");
    } else {
      Serial.println("Retrying scan...");
    }
    doConnect = false;
  }

  // If disconnected, scan again
  if (!connected) {
    BLEDevice::getScan()->start(5, false);
  }

  delay(1000);
}
```
])

=== BLE Peripheral/Server Source Code

#code-box(title: "BLE Peripheral/Server", [
```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Service UUID: identifies the BLE service provided (for example, sensor data)
#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce6e"

// Characteristic UUID: identifies the type of data sent or read within the service
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676519"

BLEServer *pServer = NULL;                  
BLECharacteristic *pCharacteristic = NULL;  
BLE2902 *pBLE2902;                          

bool deviceConnected = false;               
bool oldDeviceConnected = false;            

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;            // Set the status to connected
    Serial.println("Master connected!");
  }

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;           // Set the status to disconnected
    Serial.println("Master disconnected!");
  }
};

void BLE_init() {
  // Initialize BLE and assign the device name shown during scanning
  BLEDevice::init("ESP32_Slave"); 

  // Create a BLE server (this device acts as the server)
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks()); // Register the callback above

  // Create a BLE service using the UUID
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create a data characteristic within the service
  // PROPERTY_READ     → The client can read data
  // PROPERTY_WRITE    → The client can send data to the ESP32
  // PROPERTY_NOTIFY   → The ESP32 sends data automatically (without an ACK)
  // PROPERTY_INDICATE → The ESP32 sends data automatically (with an ACK)
  // PROPERTY_WRITE_NR → The client sends data without confirmation
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );

  // Add a descriptor so the client device can receive notifications
  pBLE2902 = new BLE2902();
  pBLE2902->setNotifications(true);
  pCharacteristic->addDescriptor(pBLE2902);

  // Start the BLE service
  pService->start();

  // Configure advertising so that other devices can discover this device
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();

  Serial.println("Ready to connect!");
}

void setup() {
  Serial.begin(115200);
  BLE_init();
}

void loop() {
  // Data-transmission logic can be placed here
  String value = String(random(0,101));

  if (deviceConnected) {
      // This API sends the value as a null-terminated C string (\0)
      // Convert the Arduino String object to a C string before transmission
      pCharacteristic->setValue(value.c_str());   
      pCharacteristic->notify();        
      Serial.print("Sent: ");
      Serial.println(value.c_str());
  }

  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Advertising after disconnect...");
    oldDeviceConnected = deviceConnected; // Update the previous connection status
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(100);
}
```
])

#pagebreak()

== APPENDIX: MODULE 2

=== WebSocket Python Server Source Code

#code-box(title: "WebSocket Python Server", [
```python
import asyncio # Supports asynchronous coroutine execution

# WebSocket library
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0" # Listen on all network interfaces
PORT: int = 8765

async def handle_client(websocket: ServerConnection) -> None:
  # Distinguish messages by the WebSocket path
  # The path used in this example is "/esp32"
  path: str = websocket.request.path
  
  # Select the path to process
  if path == "/esp32":
    print("ESP32 device connected")
    
    try:
      async for message in websocket:
        # Message from ESP32
        print( f"ESP32 message: {message}" )
        
        # Reply
        response: str = ( f"ACK from Raspberry Pi: {message}" )
        await websocket.send(response)
    except ConnectionClosed:
      print("ESP32 disconnected")
      
  # Add other paths as required
  # Default case for an unrecognized path
  else:
  print(f"Unknown path: {path}")

async def main() -> None:
  # Use the configuration defined above
  async with serve(handle_client, HOST, PORT):
  print(f"WebSocket server running " f"on {HOST}:{PORT}")
  
  # Wait for messages...
  await asyncio.Future()
        
if __name__ == "__main__":
  asyncio.run(main())
```
])

=== WebSocket Source Code for ESP32

#code-box(title: "WebSocket with ESP32", [
```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>

const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char*    WS_HOST = "192.168.1.100";
const uint16_t WS_PORT = 8765;
const char*    WS_PATH = "/esp32";

WebSocketsClient webSocket;

bool webSocketConnected = false;
unsigned long previousSendTime = 0;
const unsigned long SEND_INTERVAL = 1000;
uint32_t counter = 0;

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      Serial.println("WebSocket connected.");
      webSocket.sendTXT("{\"status\":\"ESP32 connected\"}");
      break;

    case WStype_DISCONNECTED:
      webSocketConnected = false;
      Serial.println("WebSocket disconnected.");
      break;

    case WStype_TEXT:
      Serial.print("Message from server: ");
      Serial.write(payload, length);
      Serial.println();
      break;

    case WStype_ERROR:
      Serial.println("WebSocket error.");
      break;

    default:
      break;
  }
}

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi connected.");
  Serial.print("ESP32 IP address: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();

  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  WiFi.setAutoReconnect(true);
}

void loop() {
  webSocket.loop();

  unsigned long currentTime = millis();
  if (
    webSocketConnected &&
    currentTime - previousSendTime >= SEND_INTERVAL
  ) {
    previousSendTime = currentTime;

    String message = "{\"counter\":";
    message += counter;
    message += "}";

    webSocket.sendTXT(message);
    Serial.print("Sent: ");
    Serial.println(message);
    counter++;
  }
}
```
])

#pagebreak()

== APPENDIX: MODULE 3

=== Source Code for Publishing MQTT Messages to Mosquitto

#code-box(title: "Publish MQTT Messages to Mosquitto", [
```python
import network
import time
from umqtt.simple import MQTTClient
import utime

# Enter the Wi-Fi name and password for the network shared with the local broker
wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Enter the address of the broker being used (Mosquitto, HiveMQ, Adafruit IO)
# or another broker
mqtt_host     = "<MQTT HOST ADDRESS>"

# Optional: credentials when authentication is enabled
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# Enter the topic to which messages will be published
mqtt_publish_topic = "<YOUR mqtt_topic/feed_director>" 

# Enter a client ID that is unique for each client
mqtt_client_id = "uus9asndajsndiqiwd10wid01n1kwd"

# Number to publish
counter = 0

# Connect to Wi-Fi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while wlan.isconnected() == False:
  print('Waiting for connection...')
  time.sleep(1)
  
print("Connected to WiFi")

# Initialize our MQTTClient and connect to the MQTT server
mqtt_client = MQTTClient(
  client_id=mqtt_client_id,
  server=mqtt_host,
  # Optional: use when authentication is enabled
  user=mqtt_username,
  password=mqtt_password
)
  
mqtt_client.connect()

try:
  while True:
    # Generate some dummy data that changes every loop
    counter += 3
    
    # Get the current timestamp
    current_time = utime.localtime()
    timestamp = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}".format(
      current_time[0], current_time[1], current_time[2],
      current_time[3], current_time[4], current_time[5]
    )
    
    # Publish the data to the topic!
    print(f'{timestamp} - Publish {counter}')
    mqtt_client.publish(mqtt_publish_topic, str(counter))
    
    # Delay a bit to avoid hitting the rate limit
    time.sleep(3)
  
# Handle transmission errors
except Exception as e:
  print(f'MQTT error: {e}')

# Disconnect when the Python program stops
finally:
  mqtt_client.disconnect()
```
])

=== Source Code for Subscribing to MQTT Messages from Mosquitto

#code-box(title: "Subscribe to MQTT Messages from Mosquitto", [
```python
import network
import time
from umqtt.simple import MQTTClient
import utime

# Enter the Wi-Fi name and password for the network shared with the local broker
wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Enter the address of the broker being used (Mosquitto, HiveMQ, Adafruit IO)
# or another broker
mqtt_host     = "<MQTT HOST ADDRESS>"

# Optional: credentials when authentication is enabled
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# Enter the topic filter to subscribe to
mqtt_receive_topic = "<YOUR mqtt_topic/feed_director>" 

# Enter a client ID that is unique for each client
mqtt_client_id = "iij0dfq8f012nif2jnfijn"

# Connect to Wi-Fi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while wlan.isconnected() == False:
  print('Waiting for connection...')
  time.sleep(1)
  
print("Connected to WiFi")

# Initialize our MQTTClient and connect to the MQTT server
mqtt_client = MQTTClient(
  client_id=mqtt_client_id,
  server=mqtt_host,
  # Optional: use when authentication is enabled
  user=mqtt_username,
  password=mqtt_password
)

def mqtt_subscription_callback(topic, message):
  # Get the current timestamp
  current_time = utime.localtime()
  
  timestamp = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}".format(
    current_time[0], current_time[1], current_time[2],
    current_time[3], current_time[4], current_time[5]
  )
  # Debug print out of what was received over MQTT
  print (f'{timestamp} - Topic {topic} received message {message}') 

# Before connecting, tell the MQTT client to use the callback
mqtt_client.set_callback(mqtt_subscription_callback)
mqtt_client.connect()

mqtt_client.subscribe(mqtt_receive_topic)
print("Connected and subscribed")

try:
  while True:
    # Infinitely wait for messages on the topic.
    # Note wait_msg() is a blocking call, if you're doing multiple things
    # on the Pico you may want to look at putting this on another thread.
    print(f'Waiting for messages on {mqtt_receive_topic}') 
    mqtt_client.wait_msg()
    
# Handle transmission errors
except Exception as e:
  print(f'MQTT error: {e}')

# Disconnect when the Python program stops
finally:
  mqtt_client.disconnect()
```
])

#pagebreak()

== APPENDIX: MODULE 4

=== P2P LoRa Transmitter Source Code

#code-box(title: "LoRa Transmitter", [
```cpp
// Use two libraries: SPI.h and Sandeep Mistry's LoRa.h
#include <SPI.h>
#include <LoRa.h>

// Define the pins used by the LoRa module
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32

#define LORA_TX_POWER         20
#define LORA_SPREADING_FACTOR 12

int counter = 0;

void setup() {
  pinMode(LORA_EN, OUTPUT);     // Initialize the LoRa pin mode
  digitalWrite(LORA_EN, HIGH);  // Turn on the LoRa chip
  
  // Initialize the Serial Monitor
  Serial.begin(115200);
  while (!Serial);
  Serial.println("LoRa Sender");
  
  // Configure the LoRa module pins
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  
  // Change the LoRa.begin(---E-) argument with a frequency permitted in your region
  // 433E6 for region Asia
  // 866E6 for region Europe
  // 915E6 for region North America
  // 920E6 for Indonesia
  while (!LoRa.begin(920E6)) {
    Serial.println(".");
    delay(500);
  } 

  LoRa.setTxPower(LORA_TX_POWER, PA_OUTPUT_PA_BOOST_PIN);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);

  // Set the sync word (0xF3) consistently on both transceivers
  // The sync word helps filter packets with different values
  // Valid range: 0x00–0xFF
  LoRa.setSyncWord(0xF3);
  Serial.println("LoRa Initializing OK!");
}

void loop() {
  Serial.print("Sending packet: ");
  Serial.println(counter);
  
  // Send a LoRa packet to the receiver
  LoRa.beginPacket();
  LoRa.print("hello ");
  LoRa.print(counter);
  LoRa.endPacket();
  
  counter++;
  delay(5000);
}
```
])

=== P2P LoRa Receiver Source Code

#code-box(title: "LoRa Receiver", [
```cpp
// Use two libraries: SPI.h and Sandeep Mistry's LoRa.h
#include <SPI.h>
#include <LoRa.h>

// Define the pins used by the LoRa module
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32

#define LORA_TX_POWER         20
#define LORA_SPREADING_FACTOR 12

void setup() {
  pinMode(LORA_EN, OUTPUT);     // Initialize the LoRa pin mode
  digitalWrite(LORA_EN, HIGH);  // Turn on the LoRa chip
  
  // Initialize the Serial Monitor
  Serial.begin(115200);
  while (!Serial);
  Serial.println("LoRa Receiver");
  
  // Configure the LoRa module pins
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  
  // Change the LoRa.begin(---E-) argument with a frequency permitted in your region
  // 433E6 for region Asia
  // 866E6 for region Europe
  // 915E6 for region North America
  // 920E6 for Indonesia
  while (!LoRa.begin(920E6)) {
    Serial.println(".");
    delay(500);
  } 

  LoRa.setTxPower(LORA_TX_POWER, PA_OUTPUT_PA_BOOST_PIN);
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);

  // The sync word helps filter packets with different values
  // Valid range: 0x00–0xFF (match the transmitter)
  LoRa.setSyncWord(0xF3);
  Serial.println("LoRa Initializing OK!");
}

void loop() {
  // Attempt to parse an incoming packet
  int packetSize = LoRa.parsePacket();
  
  // Receive a packet
  if (packetSize) {
    Serial.print("Received packet '");
    
    // Read the received packet
    while (LoRa.available()) {
      String LoRaData = LoRa.readString();
      Serial.print(LoRaData);
    }
    
    // Display the RSSI of the received packet (dB)
    Serial.print("' with RSSI ");
    Serial.println(LoRa.packetRssi());
  }
}
```
])

=== LoRaWAN Source Code

#code-box(title: "LoRaWAN Microcontroller Source Code", [
```cpp
#include <SPI.h>
#include <lorawan.h>

#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_DIO1 2
#define LORA_EN   32

#define SPI_MISO 23
#define SPI_MOSI 19
#define SPI_SCK 18

const char *devAddr = "YOUR-DEVICE-ADDRESS";
const char *nwkSKey = "YOUR-NETWORK-SESSION-KEY";
const char *appSKey = "YOUR-APPLICATION-SESSION-KEY";

const unsigned long interval = 60000;

unsigned long previousMillis = 0;
unsigned int messageCounter = 0;

char message[50];
char receivedData[255];

byte receiveStatus = 0;
int channel = 0;

const sRFM_pins RFM_pins = {
  .CS = LORA_NSS,
  .RST = LORA_RST,
  .DIO0 = LORA_DIO0,
  .DIO1 = LORA_DIO1,
};

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);

  if (!lora.init()) {
    Serial.println("RFM95W radio was not detected");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("RFM95W radio initialized");

  // A Class A device opens two receive windows after each uplink transmission.
  // Therefore, downlink messages are normally delivered after the device sends an uplink.
  lora.setDeviceClass(CLASS_A);

  // The data rate is configured using spreading factor 10 and a bandwidth of 125 kHz.
  // A higher spreading factor generally increases communication range and
  // receiver sensitivity but also increases airtime and reduces the data rate.
  lora.setDataRate(SF10BW125);

  // It will be available to multiple LoRaWAN channels.
  lora.setChannel(MULTI);

  // The transmission power should comply with the applicable regional frequency
  // regulations and the requirements of the LoRaWAN network.
  lora.setTxPower1(15);

  // ABP credentials.
  // Because ABP uses predefined session parameters,
  // the device does not perform an OTAA join procedure before transmitting data.
  lora.setNwkSKey(nwkSKey);
  lora.setAppSKey(appSKey);
  lora.setDevAddr(devAddr);

  Serial.println("LoRaWAN Class A ABP configuration completed");
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    snprintf(message, sizeof(message), "LoRa Counter-%u", messageCounter);

    Serial.print("Sending: ");
    Serial.println(message);

    lora.sendUplink(message, strlen(message), 0, 5);

    messageCounter++;

    channel = lora.getChannel();

    Serial.print("Channel: ");
    Serial.println(channel);
  }

  lora.update();

  receiveStatus = lora.readData(receivedData);

  if (receiveStatus > 0) {
    bool isText = true;

    for (int i = 0; i < receiveStatus; i++) {
      if (!(
        (receivedData[i] >= 32 && receivedData[i] <= 126) ||
        receivedData[i] == 10 ||
        receivedData[i] == 13
      )) {
        isText = false;
        break;
      }
    }

    if (isText) {
      Serial.print("Received text: ");

      for (int i = 0; i < receiveStatus; i++) {
        Serial.print(receivedData[i]);
      }
    } else {
      Serial.print("Received hexadecimal data: ");

      for (int i = 0; i < receiveStatus; i++) {
        if (static_cast<byte>(receivedData[i]) < 0x10) {
          Serial.print('0');
        }

        Serial.print(static_cast<byte>(receivedData[i]), HEX);
        Serial.print(' ');
      }
    }

    Serial.println();
  }
}
```
])