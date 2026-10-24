"""
MODULE 3 - MQTT (MicroPython)  |  Role: Publisher (Pico W)
Publishes the potentiometer position to the MQTT broker only when the shift
crosses the deadband. Fill in (1)-(6).
"""

import network
import time
import ntptime
import utime
from umqtt.simple import MQTTClient
from machine import ADC

# ---- WEBSOCKET WRAPPER -------------------------------------------------------
# Wraps MQTT packets in WebSocket so they can cross the Internet through the
# gateway. Read-only: nothing here to fill in or change.
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
            raise OSError("WebSocket refused")

    def take(self, n):
        data = b""
        while len(data) < n:
            part = self.raw.read(n - len(data))
            if not part:
                raise OSError("connection lost")
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
                raise OSError("connection lost")
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


# ---- SHARED WALL CLOCK -------------------------------------------------------
# Both the Publisher and the Subscriber call sync_time_reference() after NTP,
# so both lock onto the same second boundary.
timezone_offset = 7 * 3600  # WIB (UTC+7).


def sync_time_reference():
    """Waits for the RTC second to roll over, then locks the clock reference.

    After this point every timestamp is computed from one Unix millisecond
    base, so the second and millisecond parts never overtake each other and the
    two Pico Ws' times really can be subtracted.
    """
    start_second = utime.localtime()[5]
    while utime.localtime()[5] == start_second:
        pass
    return utime.time() * 1000, utime.ticks_ms()


def timestamp():
    """Returns the current wall clock in HH:MM:SS:MS format."""
    now_ms = _epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), _ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )


wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Fill in according to the broker in use; in this practicum Mosquitto runs on
# the PC Server and is reached through the gateway at broker.irisiotlab.com.
mqtt_host     = "<MQTT HOST ADDRESS>"
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# ---- GROUP IDENTITY --------------------------------------------------------
# Change the number below to your group number (1 through 5). The topic and the
# client id follow it automatically, so your group's potentiometer is only read
# by your group's Subscriber.
group_id = 1

mqtt_publish_topic = "iris/grup{}/pot".format(group_id)
mqtt_client_id     = "grup{}-pub".format(group_id)  # Must be unique per client

# Potentiometer on GP26 (ADC0). Its top leg must be fed from 3V3(OUT), not
# VBUS, because the Pico W's ADC input only tolerates up to 3.3 V.
pot = ADC(26)

# The ADC value always wobbles by a few counts even when the knob is still.
# This deadband holds back a publish until the shift really means something.
deadband_pct = 2

sample_count = 0
last_percent = -100

# The Pico W is configured as a station (client) joining an Access Point.
wlan = network.WLAN(network.________)  # (1) Station (client) mode constant
wlan.active(True)
wlan.connect(wifi_ssid, ________)  # (2) Wi-Fi password variable

while not wlan.isconnected():
    print('Waiting for connection...')
    time.sleep(1)

print("Connected to Wi-Fi")

# Without this synchronisation, the printed time cannot be compared with the
# time on the Subscriber device.
try:
    ntptime.settime()
    print("Clock synchronised over NTP")
except Exception as e:
    print(f'Failed to synchronise the clock: {e}')

# Run after NTP, not before, so the locked reference already uses the
# correct clock rather than the Pico W's uncorrected RTC.
_epoch_ms_reference, _ticks_reference = sync_time_reference()


# Port 80 is the WebSocket gateway port, not Mosquitto's. keepalive tells the
# broker to expect a ping from this client every 30 seconds.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=________,  # (3) WebSocket gateway port, see the journal
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)

mqtt_client.connect()
print("Connected to the broker. Turn the potentiometer knob to trigger a publish.")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            raw = pot.________()  # (4) 16-bit ADC read method (0 through 65535)
            percent = round(raw * 100 / 65535)

            if abs(percent - last_percent) >= ________:  # (5) Change threshold variable
                sample_count += 1
                last_percent = percent

                # The message carries a sample number so a line in the Publisher
                # Shell can be paired one-to-one with a line in the Subscriber Shell.
                payload = "{} {}".format(sample_count, percent)

                print(f'[{timestamp()}] Position {percent} %, publish #{sample_count}')
                mqtt_client.________(mqtt_publish_topic, payload)  # (6) Send method

            # umqtt.simple does not ping on its own; without a periodic ping
            # here, an idle connection can drop silently and the next publish
            # fails without any warning at all.
            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(50)

        except OSError as e:
            print(f'MQTT error: {e}, reconnecting...')
            # Close the old socket first; connect() always creates a new socket
            # and never closes the old one itself, so without this a socket
            # leaks on every reconnect.
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
