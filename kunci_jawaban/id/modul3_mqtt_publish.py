"""
MODUL 3 - KONEKTIVITAS MQTT (MicroPython + Eclipse Mosquitto)  |  Peran: Publisher
Perangkat: Raspberry Pi Pico W (MicroPython, Thonny IDE)
Library  : micropython-umqtt.simple

Program ini membaca posisi potensiometer dan mem-publish nilainya hanya ketika
posisinya benar-benar berubah, yaitu ketika pergeserannya melewati deadband.

KUNCI JAWABAN. Seluruh bagian rumpang sudah terisi; nomor (1) sampai (6) pada
komentar di sebelahnya menandai jawaban yang dinilai.
"""

import network
import time
import ntptime
import utime
from umqtt.simple import MQTTClient
from machine import ADC

wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Isi sesuai broker yang dipakai; pada praktikum ini Mosquitto berjalan pada
# Orange Pi 4 PRO, jadi alamat di bawah adalah alamat IP Orange Pi tersebut.
mqtt_host     = "<MQTT HOST ADDRESS>"
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# ---- IDENTITAS KELOMPOK ----------------------------------------------------
# Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 8). Topik dan
# client id ikut berubah sendiri, sehingga potensiometer kelompok kalian hanya
# terbaca pada Subscriber kelompok kalian.
group_id = 1

mqtt_publish_topic = "iris/grup{}/pot".format(group_id)
mqtt_client_id     = "grup{}-pub".format(group_id)  # Harus unik tiap client

# Selisih zona waktu terhadap UTC dalam detik. WIB (UTC+7) = 7 * 3600.
timezone_offset = 7 * 3600

# Potensiometer pada GP26 (ADC0). Kaki atasnya harus dicatu dari 3V3(OUT),
# bukan VBUS, karena masukan ADC Pico W hanya tahan sampai 3,3 V.
pot = ADC(26)

# Nilai ADC selalu bergoyang beberapa satuan meskipun tuasnya diam. Deadband
# ini menahan publish sampai pergeserannya benar-benar berarti.
deadband_pct = 2

sample_count = 0
last_percent = -100

# Pico W dikonfigurasi sebagai station (client) yang bergabung ke Access Point.
wlan = network.WLAN(network.STA_IF)  # (1) Konstanta mode station (client)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)  # (2) Variabel kata sandi Wi-Fi

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


epoch_ms_reference, ticks_reference = sync_time_reference()


def timestamp():
    """Mengembalikan jam dinding saat ini dalam format HH:MM:SS:MS."""
    now_ms = epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )


# Port 1883 adalah nilai `listener` yang dipakai pada mosquitto.conf. keepalive
# memberi tahu broker untuk mengharapkan ping dari client ini setiap 30 detik.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=1883,  # (3) Nilai listener pada mosquitto.conf
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)

mqtt_client.connect()
print("Terhubung ke broker. Putarlah tuas potensiometer untuk memicu publish.")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            raw = pot.read_u16()  # (4) Metode pembaca ADC 16 bit (0 sampai 65535)
            percent = round(raw * 100 / 65535)

            if abs(percent - last_percent) >= deadband_pct:  # (5) Variabel ambang perubahan
                sample_count += 1
                last_percent = percent

                # Pesan membawa nomor sampel supaya baris pada Shell Publisher
                # dan Shell Subscriber dapat dipasangkan satu per satu.
                payload = "{} {}".format(sample_count, percent)

                print(f'[{timestamp()}] Posisi {percent} %, publish #{sample_count}')
                mqtt_client.publish(mqtt_publish_topic, payload)  # (6) Metode kirim

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
