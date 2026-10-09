"""
模块 2 · WEBSOCKET  |  角色：Server（Orange Pi 4 PRO）
按各组自己的路径（例如 "/grup1"）记录每组 ESP32 发来的 DHT22 读数，
并回复收到的时间。需要的 Python 包见日志。
运行方式：python main.py。请填好空格 (1)-(6)。
"""

import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0"  # 监听所有网卡
PORT: int = ________  # (1) 端口号，要和每个 ESP32 程序里的 WS_PORT 一样

# 允许的路径，每组一个。这里给了五个，对应每节课的
# 小组数；组数少的话把用不到的删掉。
ALLOWED_PATHS: set[str] = ________  # (2) 允许的路径，要和每个 ESP32 的 WS_PATH 一样


def timestamp() -> str:
    """返回当前时间，格式为 HH:MM:SS:MS。"""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


async def handle_client(websocket: ServerConnection) -> None:
    # 从路径就知道连上来的是哪一组的板子。
    path: str = websocket.request.path
    group: str = path.lstrip("/")

    if path not in ALLOWED_PATHS:
        print(f"[{timestamp()}] Unknown path: {path}")
        return

    print(f"[{timestamp()}] {group} connected")

    try:
        async for message in websocket:
            received_at = timestamp()

            # 消息是 JSON 文本，要先转成 dict
            # 才能读里面的值。
            reading = ________(message)  # (3) 把 JSON 文本解析成 dict 的函数

            seq = int(reading["seq"])
            temperature = float(reading["temp"])
            humidity = float(reading[________])  # (4) 湿度在 JSON 里的键名，要和 ESP32 上的一样

            print(f"[{received_at}] {group} #{seq}: {temperature:.1f} C, "
                  f"{humidity:.1f} %")

            # 回复只是一个确认：序号加上
            # 服务器收到的时间，方便在日志表格里对比。
            response = json.dumps({"seq": seq, "at": received_at})
            await websocket.________(response)  # (5) 发送回复的方法

    except ConnectionClosed:
        print(f"[{timestamp()}] {group} disconnected")


async def main() -> None:
    # ping_interval/ping_timeout 会关掉不再回 pong 的连接，
    # 免得 ESP32 被一条"僵尸"连接一直挂着。
    runner = ________  # (6) 运行服务器的函数
    async with runner(
        handle_client, HOST, PORT, ping_interval=15, ping_timeout=10
    ):
        print(f"[{timestamp()}] WebSocket server running on {HOST}:{PORT}")
        await asyncio.Future()  # 一直等待消息


if __name__ == "__main__":
    asyncio.run(main())
