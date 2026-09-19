# Fact Sheet — Module 2: WebSocket Communication with a Local Server

## Plain-language explainer
Before WebSocket, students first learn HTTP — the classic "ask-and-answer" protocol behind the web (client requests, server responds, connection closes). The problem: HTTP isn't a great fit for a constant stream of live sensor data. **WebSocket** solves that: once the connection opens, data can flow both ways continuously without repeating a request every time. This year the module was revised so the ESP32/ESP8266 connects to a **local server running on a Raspberry Pi 3B** — replacing last year's Firebase/Kodular setup.

## Objectives (from the official module)
1. Learn the HTTP (Hypertext Transfer Protocol) protocol.
2. Understand HTTP protocol communication.
3. Understand how WebSocket is used in an IoT context.

## Hardware used
ESP32/ESP8266, local server (Raspberry Pi 3B), Arduino IDE/PlatformIO, sensor & actuator (optional).

## Shareable facts
- Classic HTTP closes the connection after every single request — which is why IoT dashboards relying on HTTP polling can feel laggy for real-time data.
- WebSocket keeps one connection open, so a microcontroller can push data as fast as its sensor reads it — a natural fit for live monitoring.
- By moving to a self-hosted local server, students build their own IoT infrastructure from scratch instead of relying on a ready-made cloud service.

## Verified external sources
- ESP32/ESP8266 as the client device (official Espressif specs): [espressif.com/en/products/socs/esp32](https://www.espressif.com/en/products/socs/esp32)
