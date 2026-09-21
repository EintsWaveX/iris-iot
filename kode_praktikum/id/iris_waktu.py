"""iris_waktu.py - jam dinding bersama Publisher & Subscriber (Modul 3).

Upload berkas ini ke Pico W bersama program yang memakainya (`from iris_waktu
import sync_time_reference, timestamp`). NTP harus sudah dipanggil sebelum
sync_time_reference() supaya kedua Pico W terkunci ke acuan detik yang sama.
"""

import utime

timezone_offset = 7 * 3600  # WIB (UTC+7).


def sync_time_reference():
    """Menunggu pergantian detik pada RTC, lalu mengunci titik acuan jamnya.

    Sesudah titik ini seluruh timestamp dihitung dari satu basis milidetik
    Unix, sehingga bagian detik dan milidetiknya tidak pernah saling
    mendahului dan waktu kedua Pico W benar-benar dapat dikurangkan.
    """
    start_second = utime.localtime()[5]
    while utime.localtime()[5] == start_second:
        pass
    return utime.time() * 1000, utime.ticks_ms()


_epoch_ms_reference, _ticks_reference = sync_time_reference()


def timestamp():
    """Mengembalikan jam dinding saat ini dalam format HH:MM:SS:MS."""
    now_ms = _epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), _ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )
