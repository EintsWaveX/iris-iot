"""
MODULE 3 - MQTT CONNECTIVITY (MicroPython + Eclipse Mosquitto)  |  Role: Subscriber
Device : Raspberry Pi Pico W (MicroPython, Thonny IDE)
Library: micropython-umqtt.simple

This program subscribes to a topic and records every incoming potentiometer
position together with its receive time. The connection uses keepalive plus a
periodic ping and reconnects automatically if it drops.

Fill in every blank section; the numbers (1) through (6) in the comment beside
each one are the hints.
"""

import network
import time
import ntptime
import utime
from umqtt.simple import ________  # (1) Name of the MQTT client class used below

wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# Fill in according to the broker in use; in this practicum Mosquitto runs on
# the Orange Pi 4 PRO, so the address below is that Orange Pi's IP address.
mqtt_host     = "<MQTT HOST ADDRESS>"
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# ---- GROUP IDENTITY --------------------------------------------------------
# The number below must match the number in the Publisher program exactly. The
# topic and the client id follow it automatically, so this Subscriber only
# records your group's potentiometer.
group_id = 1

mqtt_receive_topic = "iris/grup{}/pot".format(________)  # (2) Group number variable
mqtt_client_id     = "grup{}-sub".format(group_id)  # Must be unique per client

# Time zone offset from UTC in seconds. WIB (UTC+7) = 7 * 3600.
timezone_offset = 7 * 3600

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(wifi_ssid, wifi_password)

while not wlan.isconnected():
    print('Waiting for connection...')
    time.sleep(1)

print("Connected to Wi-Fi")

try:
    ntptime.settime()
    print("Clock synchronised over NTP")
except Exception as e:
    print(f'Failed to synchronise the clock: {e}')


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


epoch_ms_reference, ticks_reference = sync_time_reference()


def timestamp():
    """Returns the current wall clock in HH:MM:SS:MS format."""
    now_ms = epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )


# Port 1883 is the `listener` value used in mosquitto.conf. keepalive tells the
# broker to expect a ping from this client every 30 seconds.
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=1883,
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)


def mqtt_subscription_callback(topic, message):
    # The receive time is recorded first so nothing else can delay it.
    received_at = ________()  # (3) The wall-clock function defined above

    sample, percent = message.decode().split()

    print(f'[{received_at}] Topic {topic.decode()} received sample #{sample}'
          f' | Position: {percent} %')


# The callback must be registered before connecting to the broker.
mqtt_client.set_callback(________)  # (4) Callback function name, without parentheses
mqtt_client.connect()

mqtt_client.________(mqtt_receive_topic)  # (5) Method that registers the subscription
print("Connected and subscribed")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            # check_msg() is non-blocking, so this loop still gets to send its
            # periodic ping; wait_msg(), which blocks forever, would never come
            # back to do that.
            mqtt_client.________()  # (6) Message-checking method (non-blocking)

            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(100)

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
            mqtt_client.subscribe(mqtt_receive_topic)
            last_ping = utime.ticks_ms()

except Exception as e:
    print(f'MQTT error: {e}')

finally:
    mqtt_client.disconnect()
