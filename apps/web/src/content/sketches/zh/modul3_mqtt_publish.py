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

# ---- WEBSOCKET 封装 ----------------------------------------------------------
# 把 MQTT 数据包封装进 WebSocket，这样才能经过
# 网关穿过互联网。只读：这里没有要填或要改的地方。
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
# PC 服务器上，通过 broker.irisiotlab.com 的网关连接。
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


# 端口 80 是 WebSocket 网关的端口，不是 Mosquitto 的。keepalive 告诉
# broker 这个 client 每 30 秒会 ping 一次。
mqtt_client = MQTTClient(
    client_id=mqtt_client_id,
    server=mqtt_host,
    port=________,  # (3) WebSocket 网关端口，见日志
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
