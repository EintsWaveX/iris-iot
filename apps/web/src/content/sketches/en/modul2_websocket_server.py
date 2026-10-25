"""
MODULE 2 - WEBSOCKET  |  Role: Server (Orange Pi 4 PRO)
Records DHT22 readings from each ESP32 group by its own path (e.g. "/grup1"),
then replies with its receive time. Package requirement: see the journal.
Run with: python main.py. Fill in (1)-(6).
"""

import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0"  # Listens on every network interface
PORT: int = ________  # (1) Server port number, see the journal

# Accepted paths, one per group. Five are provided, matching the number of
# groups per session; delete the unused ones if fewer groups are present.
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
