"""
MODUL 2 - WEBSOCKET  |  Peran: Server (Orange Pi 4 PRO)
Mencatat pembacaan DHT22 tiap kelompok ESP32 lewat path-nya sendiri (mis.
"/grup1"), lalu membalas dengan waktu terimanya. Kebutuhan paket: lihat
jurnal. Jalankan: python main.py. Isi bagian rumpang (1)-(6).
"""

import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

HOST: str = "0.0.0.0"  # Mendengarkan pada semua antarmuka jaringan
PORT: int = ________  # (1) Nomor port server, lihat jurnal

# Path yang diterima, satu per kelompok. Lima path disediakan, sesuai jumlah
# kelompok tiap sesi; hapus yang tidak dipakai bila kelompok yang hadir lebih
# sedikit.
ALLOWED_PATHS: set[str] = ________  # (2) Path yang diterima, sama dengan WS_PATH tiap ESP32


def timestamp() -> str:
    """Mengembalikan jam dinding saat ini dalam format HH:MM:SS:MS."""
    now = datetime.now()
    return f"{now:%H:%M:%S}:{now.microsecond // 1000:03d}"


async def handle_client(websocket: ServerConnection) -> None:
    # Path membedakan kelompok/papan mana yang terhubung.
    path: str = websocket.request.path
    group: str = path.lstrip("/")

    if path not in ALLOWED_PATHS:
        print(f"[{timestamp()}] Path tidak dikenal: {path}")
        return

    print(f"[{timestamp()}] {group} terhubung")

    try:
        async for message in websocket:
            received_at = timestamp()

            # Pesan datang sebagai teks JSON dan harus diubah menjadi dict
            # sebelum nilainya dapat dibaca.
            reading = ________(message)  # (3) Fungsi pengurai teks JSON menjadi dict

            seq = int(reading["seq"])
            temperature = float(reading["temp"])
            humidity = float(reading[________])  # (4) Kunci JSON kelembapan, sama dengan pada ESP32

            print(f"[{received_at}] {group} #{seq}: {temperature:.1f} C, "
                  f"{humidity:.1f} %")

            # Balasan hanya berisi tanda terima: nomor urut dan waktu terima
            # di sisi server, agar dapat dibandingkan pada tabel jurnal.
            response = json.dumps({"seq": seq, "at": received_at})
            await websocket.________(response)  # (5) Metode pengirim balasan

    except ConnectionClosed:
        print(f"[{timestamp()}] {group} terputus")


async def main() -> None:
    # ping_interval/ping_timeout menutup koneksi yang tidak lagi membalas
    # pong, agar koneksi "zombie" tidak membuat ESP32 menunggu balasan selamanya.
    runner = ________  # (6) Fungsi penjalan server
    async with runner(
        handle_client, HOST, PORT, ping_interval=15, ping_timeout=10
    ):
        print(f"[{timestamp()}] Server WebSocket berjalan pada {HOST}:{PORT}")
        await asyncio.Future()  # Menunggu pesan tanpa batas waktu


if __name__ == "__main__":
    asyncio.run(main())
