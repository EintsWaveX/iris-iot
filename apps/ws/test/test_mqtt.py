"""Module 3 gateway check: the sketch's own WebSocket wrapper and the real
umqtt.simple, through `wrangler dev` and the lab bridge, into a small stand-in
MQTT broker (Mosquitto itself is only on the lab PC).

    python test/test_mqtt.py        (from apps/ws; needs websockets>=13, the
                                     IRIS ASO checkout (IRIS_ASO) and the
                                     umqtt.simple source (UMQTT_DIR))

The wrapper is cut out of kunci_jawaban/id/modul3_mqtt_subscribe.py between its
two banners and run on CPython with a thin socket adapter, since the Pico's
sockets have read() and write() where CPython's have recv() and sendall().
"""
import asyncio
import os
import pathlib
import socket
import struct
import subprocess
import sys
import time
import types
import urllib.request

ASO = pathlib.Path(os.environ.get("IRIS_ASO", pathlib.Path.home() / "Downloads" / "IRIS ASO"))
UMQTT_DIR = os.environ.get("UMQTT_DIR", "")
GATEWAY_PORT = 8791
BROKER_PORT = 18830
HERE = pathlib.Path(__file__).resolve().parent.parent

# ---------- Stand-in Broker ----------
# ---------- Stand-in Broker ----------
# ---------- Stand-in Broker ----------


async def fake_broker() -> None:
    subscribers: dict[str, list[asyncio.StreamWriter]] = {}

    async def client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            while True:
                first = (await reader.readexactly(1))[0]
                size, shift = 0, 0
                while True:
                    byte = (await reader.readexactly(1))[0]
                    size |= (byte & 127) << shift
                    shift += 7
                    if not byte & 128:
                        break
                body = await reader.readexactly(size)
                kind = first >> 4
                if kind == 1:
                    writer.write(b"\x20\x02\x00\x00")
                elif kind == 8:
                    topic_len = struct.unpack("!H", body[2:4])[0]
                    subscribers.setdefault(body[4 : 4 + topic_len].decode(), []).append(writer)
                    writer.write(b"\x90\x03" + body[:2] + b"\x00")
                elif kind == 3:
                    topic_len = struct.unpack("!H", body[:2])[0]
                    packet = bytes([first]) + encode_length(size) + body
                    for other in subscribers.get(body[2 : 2 + topic_len].decode(), []):
                        other.write(packet)
                elif kind == 12:
                    writer.write(b"\xd0\x00")
                elif kind == 14:
                    break
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        writer.close()

    server = await asyncio.start_server(client, "127.0.0.1", BROKER_PORT)
    async with server:
        await server.serve_forever()


def encode_length(size: int) -> bytes:
    out = b""
    while True:
        byte, size = size % 128, size // 128
        out += bytes([byte | (128 if size else 0)])
        if not size:
            return out


# ---------- Pico Side ----------
# ---------- Pico Side ----------
# ---------- Pico Side ----------


class Raw:
    """The Pico's socket calls on top of a CPython socket"""

    def __init__(self) -> None:
        self.s = socket.socket()

    def connect(self, addr) -> None:
        self.s.connect(addr)

    def setblocking(self, flag: bool) -> None:
        self.s.setblocking(flag)

    def write(self, data: bytes) -> None:
        self.s.sendall(data)

    def read(self, n: int):
        try:
            return self.s.recv(n)
        except BlockingIOError:
            return None

    def close(self) -> None:
        self.s.close()


def load_pico():
    net = types.ModuleType("net")
    net.socket, net.getaddrinfo = Raw, socket.getaddrinfo
    for alias, real in (("usocket", net), ("ustruct", struct), ("ubinascii", __import__("binascii"))):
        sys.modules[alias] = real
    sys.path.insert(0, UMQTT_DIR)
    import umqtt.simple as mqtt_lib

    source = (ASO / "kunci_jawaban" / "id" / "modul3_mqtt_subscribe.py").read_text(encoding="utf-8")
    shim = source[source.index("# ---- PEMBUNGKUS WEBSOCKET") : source.index("# ---- JAM DINDING")]
    shim = shim.replace("import socket as net\n", "").replace("import umqtt.simple as mqtt_lib\n", "")
    space = {"net": net, "mqtt_lib": mqtt_lib, "mqtt_host": "127.0.0.1"}
    exec(shim, space)
    return mqtt_lib


# ---------- Checks ----------
# ---------- Checks ----------
# ---------- Checks ----------

passed = failed = 0


def check(name: str, ok: bool, info: str = "") -> None:
    global passed, failed
    passed += ok
    failed += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {name}{'' if ok or not info else ': ' + info}")


def until(fn, seconds: float = 8.0) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False


def status() -> str:
    return urllib.request.urlopen(f"http://127.0.0.1:{GATEWAY_PORT}/mqtt", timeout=5).read().decode()


def main() -> None:
    key = next(
        line.split("=", 1)[1].strip() for line in (HERE / ".dev.vars").read_text().splitlines() if line.startswith("PC_KEY=")
    )
    key_file = HERE / ".wrangler" / "test-key"
    key_file.parent.mkdir(exist_ok=True)
    key_file.write_text(key)

    children = []
    try:
        children.append(subprocess.Popen([sys.executable, __file__, "broker"]))
        children.append(
            subprocess.Popen(
                ["node", "node_modules/wrangler/bin/wrangler.js", "dev", "--port", str(GATEWAY_PORT), "--ip", "127.0.0.1"],
                cwd=HERE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        )
        check("worker starts", until(lambda: "server: offline" in status(), 90))

        try:
            urllib.request.urlopen(
                urllib.request.Request(f"http://127.0.0.1:{GATEWAY_PORT}/pc-mqtt", headers={"Authorization": "Bearer nope"}), timeout=5
            )
            check("the bridge route refuses a wrong key", False)
        except urllib.error.HTTPError as error:
            check("the bridge route refuses a wrong key", error.code == 401)

        mqtt = load_pico()
        refused = mqtt.MQTTClient("x", "127.0.0.1", port=GATEWAY_PORT)
        try:
            refused.connect()
            check("a Pico is refused while the server is offline", False)
        except OSError:
            check("a Pico is refused while the server is offline", True)

        env = dict(
            os.environ,
            IRIS_MQTT_GATEWAY=f"ws://127.0.0.1:{GATEWAY_PORT}/pc-mqtt",
            IRIS_MQTT_PORT=str(BROKER_PORT),
            IRIS_WS_KEY=str(key_file),
            PYTHONUNBUFFERED="1",
        )
        children.append(subprocess.Popen([sys.executable, str(ASO / "pc" / "modul3" / "modul3_bridge.py")], env=env))
        check("the bridge connects", until(lambda: "server: connected" in status()))

        got: list[tuple[bytes, bytes]] = []
        sub = mqtt.MQTTClient("grup1-sub", "127.0.0.1", port=GATEWAY_PORT, keepalive=30)
        sub.set_callback(lambda topic, message: got.append((topic, message)))
        check("the subscriber connects through the wrapper", sub.connect() == 0)
        sub.subscribe(b"iris/grup1/pot")
        check("status counts the client", "clients: 1" in status())

        pub = mqtt.MQTTClient("grup1-pub", "127.0.0.1", port=GATEWAY_PORT, keepalive=30)
        check("the publisher connects", pub.connect() == 0)
        pub.publish(b"iris/grup1/pot", b"1 55")
        check(
            "a published reading reaches the subscriber",
            until(lambda: (sub.check_msg(), got)[1]),
        )
        check("topic and payload arrive intact", got[:1] == [(b"iris/grup1/pot", b"1 55")], str(got[:1]))

        big = b"x" * 300
        pub.publish(b"iris/grup1/pot", big)
        check("a long payload (extended frame length) arrives", until(lambda: (sub.check_msg(), len(got) > 1 and got[1][1] == big)[1]))

        sub.check_msg()
        check("check_msg with nothing waiting returns at once", True)
        pub.ping()
        check("a ping is answered", True)

        pub.disconnect()
        check("a client that leaves is cleaned up", until(lambda: "clients: 1" in status()))

        children[-1].kill()
        check("a Pico is told to retry when the bridge goes", until(lambda: _fails(sub)))
        check("status says offline again", until(lambda: "server: offline" in status()))
    except Exception as error:
        check("test crashed", False, repr(error))
    finally:
        for child in children:
            child.kill()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


def _fails(client) -> bool:
    try:
        client.check_msg()
        client.ping()
        return False
    except OSError:
        return True


if __name__ == "__main__":
    if sys.argv[1:] == ["broker"]:
        asyncio.run(fake_broker())
    else:
        main()
