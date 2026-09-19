# Fact Sheet — Module 3: MQTT Connectivity with MicroPython, Raspberry Pi Pico W, and Eclipse Mosquitto

## Plain-language explainer
MQTT is a **publish-subscribe** communication protocol: instead of sending data directly to another device, a device "publishes" a message to a topic through a **broker**, and any device that has "subscribed" to that topic receives it. This module uses a **Raspberry Pi Pico W** programmed in **MicroPython**, connected to a locally-hosted **Eclipse Mosquitto** broker — replacing last year's Adafruit IO.

## Objectives (from the official module)
1. Learn the MQTT protocol.
2. Understand MQTT protocol communication with a local broker.
3. Understand IoT implementation using Python on the Raspberry Pi Pico W microcontroller.

## Hardware used
Raspberry Pi Pico W, Thonny (MicroPython IDE), local server (Raspberry Pi 3B) hosting the Mosquitto broker.

## Shareable facts
- MQTT was designed to be extremely lightweight — a great fit for devices with limited power and bandwidth, which is why it's a favorite in the IoT world.
- The publish-subscribe pattern lets one sensor be "heard" by many applications at once, without the sensor ever knowing who's listening.
- Eclipse Mosquitto is an open-source broker supporting MQTT versions 3.1, 3.1.1, and 5.0 — light enough to run on a single-board computer like a Raspberry Pi.
- The official Raspberry Pi Pico W retails for about $6 and still ships with WiFi and Bluetooth 5.2.

## Verified external sources
- Official Eclipse Mosquitto broker: [mosquitto.org](https://mosquitto.org/)
- Official Raspberry Pi Pico W specs: [raspberrypi.com/products/raspberry-pi-pico](https://www.raspberrypi.com/products/raspberry-pi-pico/)
