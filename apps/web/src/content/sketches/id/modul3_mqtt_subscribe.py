"""
MODUL 3 - MQTT (MicroPython)  |  Peran: Subscriber (Pico W)
Berlangganan sebuah topik dan mencatat tiap posisi potensiometer yang masuk
beserta waktu terimanya, dengan reconnect otomatis. Isi bagian rumpang (1)-(6).
"""

import network
import time
import ntptime
import utime
from umqtt.simple import ________  # (1) Nama kelas client MQTT yang dipakai di bawah

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

# Isi sesuai broker yang dipakai; pada praktikum ini Mosquitto berjalan pada
# PC Server dan dijangkau lewat gateway di broker.irisiotlab.com.
mqtt_host     = "<MQTT HOST ADDRESS>"
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# ---- IDENTITAS KELOMPOK ----------------------------------------------------
# Angka di bawah harus sama persis dengan angka pada program Publisher. Topik
# dan client id ikut berubah sendiri, sehingga Subscriber ini hanya mencatat
# potensiometer kelompok kalian.
group_id = 1

mqtt_receive_topic = "iris/grup{}/pot".format(________)  # (2) Variabel nomor kelompok
mqtt_client_id     = "grup{}-sub".format(group_id)  # Harus unik tiap client

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while not wlan.isconnected():
    print('Menunggu koneksi...')
    time.sleep(1)

print("Terhubung ke Wi-Fi")

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
    port=80,
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)


def mqtt_subscription_callback(topic, message):
    # Waktu terima dicatat lebih dahulu agar tidak terpengaruh proses lain.
    received_at = ________()  # (3) Fungsi jam dinding yang didefinisikan di atas

    sample, percent = message.decode().split()

    print(f'[{received_at}] Topik {topic.decode()} menerima sampel #{sample}'
          f' | Posisi: {percent} %')


# Callback harus didaftarkan sebelum menyambung ke broker.
mqtt_client.set_callback(________)  # (4) Nama fungsi callback, tanpa tanda kurung
mqtt_client.connect()

mqtt_client.________(mqtt_receive_topic)  # (5) Metode pendaftar langganan topik
print("Terhubung dan berlangganan")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            # check_msg() tidak blocking, jadi loop ini tetap sempat mengirim
            # ping berkala; wait_msg() yang blocking selamanya tidak akan
            # pernah kembali untuk melakukan itu.
            mqtt_client.________()  # (6) Metode pemeriksa pesan (non-blocking)

            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(100)

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
            mqtt_client.subscribe(mqtt_receive_topic)
            last_ping = utime.ticks_ms()

except Exception as e:
    print(f'MQTT error: {e}')

finally:
    mqtt_client.disconnect()
