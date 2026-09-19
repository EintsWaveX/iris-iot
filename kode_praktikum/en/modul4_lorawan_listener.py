"""
MODULE 4 - LONG RANGE COMMUNICATION (LoRaWAN)  |  Role: Gateway monitor
Device: Orange Pi 4 PRO (ChirpStack + WM1302 gateway)

This script subscribes to the ChirpStack uplink topic over MQTT and prints the
receive time together with the group number and distance from each node. That
receive time is what gets compared against the send time in the node's Serial
Monitor.

PACKAGE REQUIREMENT: `paho-mqtt`, installed inside a virtual environment:

    python3 -m venv ~/venv-iris
    source ~/venv-iris/bin/activate
    pip install paho-mqtt

Run it with:  python main.py

Fill in every blank; the numbers (1) through (6) in the comment beside each
 * one are the hints.
"""

import base64
import json
from datetime import datetime

import paho.mqtt.client as mqtt

MQTT_HOST = "localhost"
MQTT_PORT = 1883

# The ChirpStack uplink topic. The + means any application id and any device
# id, so one script watches every group at once.
UPLINK_TOPIC = ________  # (1) ChirpStack uplink topic, using + for every application and device


def timestamp() -> str:
    """Returns the current wall-clock time in HH:MM:SS:MS format."""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


def decode_payload(raw: bytes) -> tuple[int, int]:
    """Splits the three payload bytes into a group number and a distance."""
    group = raw[0]
    distance = (raw[1] << 8) | raw[2]
    return group, distance


def on_connect(client, userdata, flags, reason_code, properties=None) -> None:
    client.________(UPLINK_TOPIC)  # (2) Method that registers a topic subscription
    print(f"[{timestamp()}] Connected to the ChirpStack broker, waiting for uplinks...")


def on_message(client, userdata, msg) -> None:
    received_at = timestamp()

    event = ________(msg.payload)  # (3) Function that parses JSON text into a dict

    # ChirpStack sends the payload as base64, so it has to be decoded first.
    raw = base64.b64decode(event["data"])
    group, distance = decode_payload(raw)

    info = event.get("rxInfo", [{}])[0]
    rssi = info.get("rssi", 0)
    snr = info.get("________", 0)  # (4) Name of the signal-to-noise field inside rxInfo

    print(f"[{received_at}] Group {group} | distance {distance} cm | RSSI: {rssi} dBm | SNR: {snr} dB")


def main() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = ________  # (5) Function that handles each incoming message

    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.________()  # (6) Method that runs the MQTT loop indefinitely


if __name__ == "__main__":
    main()
