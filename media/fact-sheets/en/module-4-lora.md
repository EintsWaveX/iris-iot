# Fact Sheet — Module 4: Long Range Communication (LoRa)

## Plain-language explainer
LoRa (Long Range) is a radio modulation technique that sends small packets of data across kilometers on very little power — a great fit for smart agriculture, smart cities, and environmental monitoring. LoRa itself isn't a network protocol; **LoRaWAN** is the network protocol built on top of it, handling how devices join a network, authenticate, and get data through a gateway to a server. This module is brand new this year: students practice both peer-to-peer LoRa and full LoRaWAN through Telkom Indonesia's **ANTARES** platform, using the custom **Cosmic LoRa Aurora V2** board.

## Objectives (from the official module)
1. Learn Long Range (LoRa) modulation technology.
2. Understand communication using LoRa, especially LoRaWAN.

## Hardware used
LoRa Module/Cosmic LoRa Aurora V2 (ESP32 + RFM95/SX1276 LoRa module), an ANTARES account, Arduino IDE/PlatformIO, sensor & actuator (optional).

## Shareable facts
- LoRaWAN uses a **star-of-stars** topology: one data packet can be received by several gateways at once, and the server picks out and filters duplicate packets — no complex mesh routing required.
- For Indonesia, LoRaWAN uses the regional frequency band **AS923-2, 920–923 MHz**.
- LoRaWAN defines 3 device classes: **Class A** (lowest power, downlink waits for uplink), **Class B** (scheduled beacons, more predictable downlink), and **Class C** (receiver almost always open, lowest latency but highest power draw).
- ANTARES is PT Telkom Indonesia Tbk's horizontal IoT platform, supporting LoRaWAN, NB-IoT, and GPRS, and holds international oneM2M certification.

## Verified external sources
- Official LoRaWAN standard: [lora-alliance.org](https://lora-alliance.org/)
- ANTARES platform (official, Telkom Indonesia): [antares.id](https://antares.id/)
