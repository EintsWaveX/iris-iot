"""
MODUL 3 - MQTT (MicroPython)  |  Peran: Publisher (Pico W)
Mem-publish posisi potensiometer ke broker MQTT hanya ketika pergeserannya
melewati deadband. Isi bagian rumpang (1)-(6).
"""

import network
import time
import ntptime
import utime
from umqtt.simple import MQTTClient
from machine import ADC

# ---- PEMBUNGKUS WEBSOCKET ----------------------------------------------------
# Membungkus paket MQTT ke dalam WebSocket agar dapat lewat Internet melalui
# gateway. Cukup dibaca; tidak ada yang perlu diisi atau diubah di sini.
import os
import socket as net
import umqtt.simple as mqtt_lib
from binascii import b2a_base64


class WebSocket:
    def __init__(self):
        self.raw = net.socket()
        self.buf = b""
        self.wait = True

    def connect(self, addr):
        self.raw.connect(addr)
        key = b2a_base64(os.urandom(16)).strip().decode()
        self.raw.write("GET /mqtt HTTP/1.1\r\nHost: {}\r\nUpgrade: websocket\r\n"
                       "Connection: Upgrade\r\nSec-WebSocket-Key: {}\r\n"
                       "Sec-WebSocket-Version: 13\r\n\r\n".format(mqtt_host, key).encode())
        head = b""
        while not head.endswith(b"\r\n\r\n"):
            head += self.take(1)
        if b" 101 " not in head:
            raise OSError("WebSocket ditolak")

    def take(self, n):
        data = b""
        while len(data) < n:
            part = self.raw.read(n - len(data))
            if not part:
                raise OSError("koneksi putus")
            data += part
        return data

    def frame(self, op, data):
        n, mask = len(data), os.urandom(4)
        head = bytes([128 | op, 128 | (n if n < 126 else 126)])
        if n >= 126:
            head += n.to_bytes(2, "big")
        self.raw.setblocking(True)
        self.raw.write(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def write(self, data, n=None):
        data = data[:n] if n else data
        self.frame(2, data.encode() if isinstance(data, str) else data)

    def read(self, n):
        while len(self.buf) < n:
            self.raw.setblocking(self.wait)
            head = self.raw.read(2)
            if head is None:
                return None
            self.raw.setblocking(True)
            if len(head) < 2:
                head += self.take(2 - len(head))
            op, size = head[0] & 15, head[1] & 127
            if size == 126:
                size = int.from_bytes(self.take(2), "big")
            data = self.take(size)
            if op == 8:
                raise OSError("koneksi putus")
            if op == 9:
                self.frame(10, data)
            elif op < 3:
                self.buf += data
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def setblocking(self, flag):
        self.wait = flag

    def close(self):
        self.raw.close()


class Net:
    socket = WebSocket
    getaddrinfo = net.getaddrinfo


mqtt_lib.socket = Net


# ---- JAM DINDING BERSAMA ----------------------------------------------------
# Publisher dan Subscriber sama-sama memanggil sync_time_reference() sesudah
# NTP, sehingga keduanya terkunci ke acuan detik yang sama.
timezone_offset = 7 * 3600  # WIB (UTC+7).


def sync_time_reference():
    """Menunggu pergantian detik pada RTC, lalu mengunci titik acuan jamnya.

    Sesudah titik ini seluruh timestamp dihitung dari satu basis milidetik
    Unix, sehingga bagian detik dan milidetiknya tidak pernah saling
    mendahului dan waktu kedua Pico W benar-benar dapat dikurangkan.
    """
    start_second = utime.localtime()[5]
    while utime.localtime()[5] == start_second:
        pass
    return utime.time() * 1000, utime.ticks_ms()


def timestamp():
    """Mengembalikan jam dinding saat ini dalam format HH:MM:SS:MS."""
    now_ms = _epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), _ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )


wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Mosquitto berjalan pada PC Server dan dijangkau lewat gateway di
# broker.irisiotlab.com. Broker praktikum ini tidak memakai nama pengguna atau
# kata sandi.
mqtt_host     = "broker.irisiotlab.com"

# ---- IDENTITAS KELOMPOK ----------------------------------------------------
# Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 5). Topik dan
# client id ikut berubah sendiri, sehingga potensiometer kelompok kalian hanya
# terbaca pada Subscriber kelompok kalian.
group_id = 1

mqtt_publish_topic = "iris/grup{}/pot".format(group_id)
mqtt_client_id     = "grup{}-pub".format(group_id)  # Harus unik tiap client

# Potensiometer pada GP26 (ADC0). Kaki atasnya harus dicatu dari 3V3(OUT),
# bukan VBUS, karena masukan ADC Pico W hanya tahan sampai 3,3 V.
pot = ADC(26)

# Nilai ADC selalu bergoyang beberapa satuan meskipun tuasnya diam. Deadband
# ini menahan publish sampai pergeserannya benar-benar berarti.
deadband_pct = 2

sample_count = 0
last_percent = -100

# Pico W dikonfigurasi sebagai station (client) yang bergabung ke Access Point.
wlan = network.WLAN(network.________)  # (1) Konstanta mode station (client)
wlan.active(True)
wlan.connect(wifi_ssid, ________)  # (2) Variabel kata sandi Wi-Fi

while not wlan.isconnected():
    print('Menunggu koneksi...')
    time.sleep(1)

print("Terhubung ke Wi-Fi")

# Tanpa penyelarasan ini, waktu yang tercetak tidak dapat dibandingkan dengan
# waktu pada perangkat Subscriber.
try:
    ntptime.settime()
    print("Jam tersinkronisasi melalui NTP")
except Exception as e:
    print(f'Gagal menyelaraskan jam: {e}')

# Dijalankan sesudah NTP, bukan sebelumnya, supaya acuan detik yang dikunci
# sudah memakai jam yang benar, bukan RTC Pico W yang belum terkoreksi.
_epoch_ms_reference, _ticks_reference = sync_time_reference()


# Port 80 adalah port gateway WebSocket, bukan port Mosquitto. keepalive
# memberi tahu broker untuk mengharapkan ping dari client ini setiap 30 detik.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=________,  # (3) Port gateway WebSocket, lihat jurnal
    keepalive=30,
)

mqtt_client.connect()
print("Terhubung ke broker. Putarlah tuas potensiometer untuk memicu publish.")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            raw = pot.________()  # (4) Metode pembaca ADC 16 bit (0 sampai 65535)
            percent = round(raw * 100 / 65535)

            if abs(percent - last_percent) >= ________:  # (5) Variabel ambang perubahan
                sample_count += 1
                last_percent = percent

                # Pesan membawa nomor sampel supaya baris pada Shell Publisher
                # dan Shell Subscriber dapat dipasangkan satu per satu.
                payload = "{} {}".format(sample_count, percent)

                print(f'[{timestamp()}] Posisi {percent} %, publish #{sample_count}')
                mqtt_client.________(mqtt_publish_topic, payload)  # (6) Metode kirim

            # umqtt.simple tidak mengirim ping sendiri; tanpa ping berkala di
            # sini, koneksi yang idle bisa terputus diam-diam dan publish
            # berikutnya gagal tanpa peringatan apa pun.
            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(50)

        except OSError as e:
            print(f'MQTT error: {e}, menyambung ulang...')
            # Tutup socket lama dahulu; connect() selalu membuat socket baru
            # dan tidak menutup yang lama sendiri, jadi tanpa ini socket bisa
            # bocor setiap kali terjadi reconnect.
            try:
                mqtt_client.sock.close()
            except OSError:
                pass
            time.sleep(1)
            mqtt_client.connect()
            last_ping = utime.ticks_ms()

except Exception as e:
    print(f'MQTT error: {e}')

finally:
    mqtt_client.disconnect()
