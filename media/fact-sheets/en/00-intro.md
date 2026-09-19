# Fact Sheet — Intro: IRIS Laboratory & Internet of Things

## About IRIS Laboratory
IRIS (**I**oT **R**untime and **I**ntegration **S**ystem Laboratory) sits under the **ASIC (Automation System and Intelligence Control)** division, School of Electrical Engineering, Telkom University — based in P304, Gedung Deli. Every odd semester, IRIS designs and runs the **IoT Device Programming Practicum Module** for Electrical Engineering students.

The 2026/2027 module was written by the IRIS assistant team and reviewed directly by the Lab Head (Dr. Junartho Halomoan, S.T., M.T.) and Lab Supervisor (Istiqomah, S.T., M.Sc).

## What is the Internet of Things (IoT)?
IoT connects physical objects, sensors, actuators, computing devices, and applications over a network so devices can collect, exchange, and act on data — locally or over the internet.

The module teaches a 3-layer IoT architecture:
1. **Physical/Perception Layer** — sensors that acquire data, actuators that carry out actions.
2. **Network Layer** — connects devices via local network, gateway, or the internet.
3. **Application Layer** — data processing, storage, analytics, and the user-facing interface (dashboards, apps).

## This Year's 4 Modules
The practicum takes students from very-short-range to very-long-range wireless communication:

| Module | Topic | 2026/2027 revision highlight |
|---|---|---|
| 1 | Bluetooth Connectivity | Added **Bluetooth Low Energy (BLE)** |
| 2 | WebSocket Communication with a Local Server | Moved from Firebase/Kodular to a **local HTTP + WebSocket server** |
| 3 | MQTT Connectivity | Broker switched from Adafruit IO to a **local Eclipse Mosquitto** broker |
| 4 | Long Range Communication (LoRa) | New module: **LoRaWAN** via Telkom Indonesia's **ANTARES** platform |

## Shareable facts
- The practicum spans wireless range from **~10 meters (Bluetooth)** to **kilometers (LoRaWAN)** — all covered in a single semester.
- Three of the four modules were revised this year so students work directly against self-hosted infrastructure (their own server, their own broker) instead of relying entirely on third-party services.

## Verified external sources
- LoRaWAN standard: [LoRa Alliance](https://lora-alliance.org/)
- Official ESP32 specs (the practicum's primary microcontroller): [Espressif — ESP32](https://www.espressif.com/en/products/socs/esp32)
