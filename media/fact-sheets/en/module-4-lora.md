# Fact Sheet — Module 4: Long Range Communication (LoRa)

## Plain-language explainer
LoRa (Long Range) is a radio modulation technique that sends small packets of data across kilometers on very little power — a great fit for smart agriculture, smart cities, and environmental monitoring. This module is brand new this year: students practice peer-to-peer LoRa using the custom **Cosmic LoRa Aurora V2** board, then put it to the test in a live hunt game — one hidden Beacon board transmits continuously, and every group races to find it using nothing but signal strength.

## Objectives (from the official module)
1. Learn Long Range (LoRa) modulation technology.
2. Understand peer-to-peer communication using LoRa, including how signal strength (RSSI) relates to distance.

## Hardware used
LoRa Module/Cosmic LoRa Aurora V2 (ESP32 + RFM95/SX1276 LoRa module), Arduino IDE/PlatformIO, a 920 MHz antenna per board.

## Shareable facts
- For Indonesia, this practicum's LoRa link uses the regional frequency band **AS923-2, 920–923 MHz**.
- With only one radio in the room ever transmitting, packet collisions are structurally impossible — no time-slot scheduling needed at all.
- Signal strength (RSSI) is a rough, not exact, distance indicator: it degrades gracefully with distance but can swing several dB from a single reflected wall — exactly what the hunt game lets students feel firsthand.

## Verified external sources
- LoRa modulation background: [lora-alliance.org](https://lora-alliance.org/)
