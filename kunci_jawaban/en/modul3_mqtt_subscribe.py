"""
MODULE 3 - MQTT (MicroPython)  |  Role: Subscriber (Pico W)
Subscribes to a topic and records every incoming potentiometer position with
its receive time, reconnecting automatically.

ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in
the comment beside each one mark the graded answers.
"""

import network
import time
import ntptime
import utime
from umqtt.simple import MQTTClient  # (1) Name of the MQTT client class used below
from iris_waktu import timestamp

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

mqtt_receive_topic = "iris/grup{}/pot".format(group_id)  # (2) Group number variable
mqtt_client_id     = "grup{}-sub".format(group_id)  # Must be unique per client

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
    received_at = timestamp()  # (3) The wall-clock function imported above

    sample, percent = message.decode().split()

    print(f'[{received_at}] Topic {topic.decode()} received sample #{sample}'
          f' | Position: {percent} %')


# The callback must be registered before connecting to the broker.
mqtt_client.set_callback(mqtt_subscription_callback)  # (4) Callback function name, without parentheses
mqtt_client.connect()

mqtt_client.subscribe(mqtt_receive_topic)  # (5) Method that registers the subscription
print("Connected and subscribed")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            # check_msg() is non-blocking, so this loop still gets to send its
            # periodic ping; wait_msg(), which blocks forever, would never come
            # back to do that.
            mqtt_client.check_msg()  # (6) Message-checking method (non-blocking)

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
