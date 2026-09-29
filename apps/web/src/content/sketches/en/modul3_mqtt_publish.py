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
# the Orange Pi 4 PRO, so the address below is that Orange Pi's IP address.
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


# Port 1883 is the `listener` value used in mosquitto.conf. keepalive tells the
# broker to expect a ping from this client every 30 seconds.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=________,  # (3) The listener value in mosquitto.conf
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
