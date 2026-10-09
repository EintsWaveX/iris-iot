"""
模块 3 · MQTT（MicroPython）  |  角色：Publisher（Pico W）
只有电位器的变化超过死区时，
才把位置发布到 MQTT broker。请填好空格 (1)-(6)。
"""

import network
import time
import ntptime
import utime
from umqtt.simple import MQTTClient
from machine import ADC

# ---- 共用时钟 ---------------------------------------------------------------
# Publisher 和 Subscriber 都在 NTP 之后调用 sync_time_reference()，
# 所以两边对齐到同一个整秒。
timezone_offset = 7 * 3600  # WIB（UTC+7）。


def sync_time_reference():
    """等 RTC 的秒数跳到下一秒，再锁定时间基准。

    从这以后所有时间戳都从同一个 Unix 毫秒基准算出来，
    秒和毫秒部分不会互相错位，
    两块 Pico W 的时间才真的可以相减。
    """
    start_second = utime.localtime()[5]
    while utime.localtime()[5] == start_second:
        pass
    return utime.time() * 1000, utime.ticks_ms()


def timestamp():
    """返回当前时间，格式为 HH:MM:SS:MS。"""
    now_ms = _epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), _ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )


wifi_ssid     = "<YOUR SSID WIFI>"
wifi_password = "<YOUR WIFI PASSWORD>"

# 按实际用的 broker 填写；这个实验里 Mosquitto 跑在
# Orange Pi 4 PRO 上，所以下面填那台 Orange Pi 的 IP 地址。
mqtt_host     = "<MQTT HOST ADDRESS>"
mqtt_username = "<USERNAME FROM MOSQUITTO MQTT>"
mqtt_password = "<PASSWORD FROM MOSQUITTO MQTT>"

# ---- 小组编号 ---------------------------------------------------------------
# 把下面的数字改成你们的组号（1 到 5）。topic 和
# client id 会自动跟着变，所以你们组的电位器只会被
# 你们组的 Subscriber 读到。
group_id = 1

mqtt_publish_topic = "iris/grup{}/pot".format(group_id)
mqtt_client_id     = "grup{}-pub".format(group_id)  # 每个 client 都不能重复

# 电位器接 GP26（ADC0）。上端那条腿要接 3V3(OUT)，不能接
# VBUS，因为 Pico W 的 ADC 输入最多只能承受 3.3 V。
pot = ADC(26)

# 就算旋钮不动，ADC 读数也总会跳几个数。
# 这个死区让变化大到有意义时才发布。
deadband_pct = 2

sample_count = 0
last_percent = -100

# Pico W 设成 station（client）模式，连到接入点上。
wlan = network.WLAN(network.________)  # (1) station（client）模式常量
wlan.active(True)
wlan.connect(wifi_ssid, ________)  # (2) Wi-Fi 密码变量

while not wlan.isconnected():
    print('Waiting for connection...')
    time.sleep(1)

print("Connected to Wi-Fi")

# 不先对时的话，打印出来的时间没法和
# Subscriber 那块板子上的时间比较。
try:
    ntptime.settime()
    print("Clock synchronised over NTP")
except Exception as e:
    print(f'Failed to synchronise the clock: {e}')

# 要在 NTP 之后运行，不能在之前，这样锁定的基准用的才是
# 校准过的时间，而不是 Pico W 未校准的 RTC。
_epoch_ms_reference, _ticks_reference = sync_time_reference()


# 端口 1883 就是 mosquitto.conf 里的 `listener` 值。keepalive 告诉
# broker 这个 client 每 30 秒会 ping 一次。
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=________,  # (3) mosquitto.conf 里的 listener 值
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
            raw = pot.________()  # (4) 读取 16 位 ADC 的方法（0 到 65535）
            percent = round(raw * 100 / 65535)

            if abs(percent - last_percent) >= ________:  # (5) 变化阈值变量
                sample_count += 1
                last_percent = percent

                # 消息里带着样本编号，这样 Publisher
                # Shell 里的每一行都能和 Subscriber Shell 里的一行对上。
                payload = "{} {}".format(sample_count, percent)

                print(f'[{timestamp()}] Position {percent} %, publish #{sample_count}')
                mqtt_client.________(mqtt_publish_topic, payload)  # (6) 发送的方法

            # umqtt.simple 不会自己 ping；这里不定期 ping 的话，
            # 闲着的连接可能悄悄断掉，下一次发布
            # 会失败，而且一点提示都没有。
            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(50)

        except OSError as e:
            print(f'MQTT error: {e}, reconnecting...')
            # 先关掉旧的 socket；connect() 每次都会新建 socket，
            # 但不会自己关旧的，不这样做的话
            # 每次重连都会漏掉一个 socket。
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
