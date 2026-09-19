"""
MODUL 4 - KOMUNIKASI LONG RANGE (LoRaWAN)  |  Peran: Pemantau Gateway
Perangkat: Orange Pi 4 PRO (ChirpStack + gateway WM1302)

Skrip ini berlangganan topik uplink ChirpStack lewat MQTT, lalu mencetak waktu
terima beserta nomor kelompok dan jarak dari tiap node. Waktu terima inilah
yang dibandingkan dengan waktu kirim pada Serial Monitor node.

KEBUTUHAN PAKET: `paho-mqtt` dipasang di dalam virtual environment:

    python3 -m venv ~/venv-iris
    source ~/venv-iris/bin/activate
    pip install paho-mqtt

Jalankan dengan:  python main.py

KUNCI JAWABAN. Seluruh bagian rumpang sudah terisi; nomor (1) sampai (6) pada
komentar di sebelahnya menandai jawaban yang dinilai.
"""

import base64
import json
from datetime import datetime

import paho.mqtt.client as mqtt

MQTT_HOST = "localhost"
MQTT_PORT = 1883

# Topik uplink ChirpStack. Tanda + berarti application id dan device id
# mana pun, sehingga satu skrip memantau semua kelompok sekaligus.
UPLINK_TOPIC = "application/+/device/+/event/up"  # (1) Topik uplink ChirpStack, memakai + untuk semua application dan device


def timestamp() -> str:
    """Mengembalikan jam dinding saat ini dalam format HH:MM:SS:MS."""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


def decode_payload(raw: bytes) -> tuple[int, int]:
    """Memisahkan tiga byte payload menjadi nomor kelompok dan jarak."""
    group = raw[0]
    distance = (raw[1] << 8) | raw[2]
    return group, distance


def on_connect(client, userdata, flags, reason_code, properties=None) -> None:
    client.subscribe(UPLINK_TOPIC)  # (2) Metode pendaftar langganan topik
    print(f"[{timestamp()}] Terhubung ke broker ChirpStack, menunggu uplink...")


def on_message(client, userdata, msg) -> None:
    received_at = timestamp()

    event = json.loads(msg.payload)  # (3) Fungsi pengurai teks JSON menjadi dict

    # ChirpStack mengirim payload dalam bentuk base64, jadi harus didekode dahulu.
    raw = base64.b64decode(event["data"])
    group, distance = decode_payload(raw)

    info = event.get("rxInfo", [{}])[0]
    rssi = info.get("rssi", 0)
    snr = info.get("snr", 0)  # (4) Nama field rasio sinyal terhadap derau pada rxInfo

    print(f"[{received_at}] Kelompok {group} | jarak {distance} cm | RSSI: {rssi} dBm | SNR: {snr} dB")


def main() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message  # (5) Fungsi penangan pesan yang baru masuk

    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_forever()  # (6) Metode penjalan loop MQTT tanpa batas waktu


if __name__ == "__main__":
    main()
