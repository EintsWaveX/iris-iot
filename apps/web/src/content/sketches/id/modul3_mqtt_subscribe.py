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
from iris_waktu import timestamp

wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Isi sesuai broker yang dipakai; pada praktikum ini Mosquitto berjalan pada
# Orange Pi 4 PRO, jadi alamat di bawah adalah alamat IP Orange Pi tersebut.
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


# Port 1883 adalah nilai `listener` yang dipakai pada mosquitto.conf. keepalive
# memberi tahu broker untuk mengharapkan ping dari client ini setiap 30 detik.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=1883,
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)


def mqtt_subscription_callback(topic, message):
    # Waktu terima dicatat lebih dahulu agar tidak terpengaruh proses lain.
    received_at = ________()  # (3) Fungsi jam dinding dari iris_waktu di atas

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
