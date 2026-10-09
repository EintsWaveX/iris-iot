"""
模块 3 · MQTT（MicroPython）  |  角色：Subscriber（Pico W）
订阅一个 topic，记下收到的每个电位器位置
和收到的时间，断线会自动重连。请填好空格 (1)-(6)。
"""

import network
import time
import ntptime
import utime
from umqtt.simple import ________  # (1) 下面用到的 MQTT client 类名

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
# 下面的数字必须和 Publisher 程序里的完全一样。
# topic 和 client id 会自动跟着变，所以这个 Subscriber 只会
# 记录你们组的电位器。
group_id = 1

mqtt_receive_topic = "iris/grup{}/pot".format(________)  # (2) 组号变量
mqtt_client_id     = "grup{}-sub".format(group_id)  # 每个 client 都不能重复

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

# 要在 NTP 之后运行，不能在之前，这样锁定的基准用的才是
# 校准过的时间，而不是 Pico W 未校准的 RTC。
_epoch_ms_reference, _ticks_reference = sync_time_reference()


# 端口 1883 就是 mosquitto.conf 里的 `listener` 值。keepalive 告诉
# broker 这个 client 每 30 秒会 ping 一次。
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=1883,
    user=mqtt_username,
    password=mqtt_password,
    keepalive=30,
)


def mqtt_subscription_callback(topic, message):
    # 先记下收到的时间，免得被别的操作耽误。
    received_at = ________()  # (3) 上面定义的取时间函数

    sample, percent = message.decode().split()

    print(f'[{received_at}] Topic {topic.decode()} received sample #{sample}'
          f' | Position: {percent} %')


# 回调必须在连接 broker 之前注册。
mqtt_client.set_callback(________)  # (4) 回调函数名，不带括号
mqtt_client.connect()

mqtt_client.________(mqtt_receive_topic)  # (5) 注册订阅的方法
print("Connected and subscribed")

last_ping = utime.ticks_ms()

try:
    while True:
        try:
            # check_msg() 不会阻塞，所以这个循环还能按时发
            # ping；wait_msg() 会一直阻塞，
            # 就再也回不来做这件事了。
            mqtt_client.________()  # (6) 检查消息的方法（不阻塞）

            if utime.ticks_diff(utime.ticks_ms(), last_ping) > 20000:
                mqtt_client.ping()
                last_ping = utime.ticks_ms()

            utime.sleep_ms(100)

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
            mqtt_client.subscribe(mqtt_receive_topic)
            last_ping = utime.ticks_ms()

except Exception as e:
    print(f'MQTT error: {e}')

finally:
    mqtt_client.disconnect()
