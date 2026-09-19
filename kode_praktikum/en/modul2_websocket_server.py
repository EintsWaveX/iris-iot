"""
MODULE 2 - WEBSOCKET COMMUNICATION WITH A LOCAL SERVER  |  Role: WebSocket Server
Device: Orange Pi 4 PRO (Python 3 + the `websockets` package)

The server receives DHT22 readings from several ESP32 groups at once, telling
them apart by their own path (e.g. "/grup1"), records the temperature and
humidity, then replies with its own receive time.

PACKAGE REQUIREMENT: `websockets.asyncio.server` only exists in websockets
version 13 and above, while the package shipped with the system is usually older:

    python3 -m venv ~/venv-iris
    source ~/venv-iris/bin/activate
    pip install "websockets>=13"

Run with:  python main.py

Fill in every blank section; the numbers (1) through (6) in the comment beside
each one are the hints.
"""

import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0"  # Listens on every network interface
PORT: int = ________  # (1) Port number, same as WS_PORT in every ESP32 sketch

# Accepted paths, one per group. Eight are provided; delete the unused ones or
# add new ones if the number of groups changes.
ALLOWED_PATHS: set[str] = ________  # (2) Accepted paths, same as each ESP32's WS_PATH


def timestamp() -> str:
    """Returns the current wall clock in HH:MM:SS:MS format."""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


async def handle_client(websocket: ServerConnection) -> None:
    # The path tells which group's board is connected.
    path: str = websocket.request.path
    group: str = path.lstrip("/")

    if path not in ALLOWED_PATHS:
        print(f"[{timestamp()}] Unknown path: {path}")
        return

    print(f"[{timestamp()}] {group} connected")

    try:
        async for message in websocket:
            received_at = timestamp()

            # The message arrives as JSON text and must be turned into a dict
            # before its values can be read.
            reading = ________(message)  # (3) Function that parses JSON text into a dict

            seq = int(reading["seq"])
            temperature = float(reading["temp"])
            humidity = float(reading[________])  # (4) Humidity JSON key, same as on the ESP32

            print(f"[{received_at}] {group} #{seq}: {temperature:.1f} C, "
                  f"{humidity:.1f} %")

            # The reply is an acknowledgement only: the sequence number and the
            # server-side receive time, so the two can be compared in the journal table.
            response = json.dumps({"seq": seq, "at": received_at})
            await websocket.________(response)  # (5) Method that sends the reply

    except ConnectionClosed:
        print(f"[{timestamp()}] {group} disconnected")


async def main() -> None:
    # ping_interval/ping_timeout close a connection that no longer answers a
    # pong, so a "zombie" connection cannot leave the ESP32 waiting forever.
    runner = ________  # (6) Function that runs the server
    async with runner(
        handle_client, HOST, PORT, ping_interval=15, ping_timeout=10
    ):
        print(f"[{timestamp()}] WebSocket server running on {HOST}:{PORT}")
        await asyncio.Future()  # Waits for messages indefinitely


if __name__ == "__main__":
    asyncio.run(main())
