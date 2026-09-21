"""iris_waktu.py - shared wall clock for the Publisher & Subscriber (Module 3).

Upload this file to the Pico W alongside the program using it (`from
iris_waktu import sync_time_reference, timestamp`). NTP must already have run
before sync_time_reference() so both Pico Ws lock to the same second boundary.
"""

import utime

timezone_offset = 7 * 3600  # WIB (UTC+7).


def sync_time_reference():
    """Waits for the RTC second to roll over, then locks the clock reference.

    After this point every timestamp is computed from one Unix millisecond
    base, so the second and millisecond parts never overtake each other and the
    two Pico Ws' times really can be subtracted.
    """
    start_second = utime.localtime()[5]
    while utime.localtime()[5] == start_second:
        pass
    return utime.time() * 1000, utime.ticks_ms()


_epoch_ms_reference, _ticks_reference = sync_time_reference()


def timestamp():
    """Returns the current wall clock in HH:MM:SS:MS format."""
    now_ms = _epoch_ms_reference + utime.ticks_diff(utime.ticks_ms(), _ticks_reference)
    current_time = utime.localtime(now_ms // 1000 + timezone_offset)

    return "{:02}:{:02}:{:02}:{:03}".format(
        current_time[3], current_time[4], current_time[5], now_ms % 1000
    )
