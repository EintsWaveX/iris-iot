# Live Upload: flash the module's code to your own board from the Live room

2026-11-13. Status: draft for approval. Author: Claude, with EintsWaveX.

## Intent and why

Today only the Asisten who owns a laptop with the right tools can put a sketch on a LoRa/ESP32 board
(on 2026-11-12/13 that meant usbipd + WSL + esptool, board by board). The lab has about 35 Praktikan
who all need to do it, on their own laptops, with nothing installed. Every Live room should therefore
offer **Upload** next to **Hubungkan**: the Praktikan types a few values, presses Upload, and the
board runs the module's working code and can be connected right away.

The code that is uploaded is the module's complete, correct sketch (the Code step's blanks are all
right at the Live step, on purpose). Only a few values change per Praktikan: Wi-Fi name and password,
group, and for Module 4 the group's board key.

## Goals

- Upload button on every board row of every module's Live room (Modules 1, 2, 3, 4).
- Inputs: Wi-Fi name, Wi-Fi password, Group ID (defaults to the user's own group), plus what the module
  needs (Module 4: the group's board key; which board is the row's role, so no extra pick).
- Nothing to install on the laptop. Chrome or Edge on desktop, the same requirement Hubungkan has.
- Works **outside a running session**: the Live in the Modules menu (`/modules/N/live`) gets the same
  Hubungkan and Upload, in a practice mode that saves nothing to any session.
- After Upload the board is reset and the room connects to it by itself.
- Fix the Live data that stops following new messages after a board reboots (the "wait until #337" bug).

## Non-goals

- No arbitrary code from the browser. The sketch always comes from the server's own template.
- No WSL/usbipd fallback on the student's laptop (see Approaches).
- Not the LoRa speed/accuracy work (separate spec, below under Order).
- No new boards: the LoRa Ray V1 (ATmega328P, no Wi-Fi) cannot run these sketches and is out of scope.

## Anti-goals (would be a failure even if it technically works)

- A Praktikan's browser ever holds a correct answer or the template with answers (the existing rule).
- A student's Wi-Fi password stored on the server or in a log.
- One slow build making the whole PC unresponsive during a practicum round.

## What I found (facts the design rests on)

- The Live room is one component (`LiveRoom.tsx`) used in the module page's Live step and on
  `/modules/N/live`. Ports exist only when `canPorts` = Praktikan (or acting Asisten) on their own group of
  a running session. That is why the Modules-menu Live has no Hubungkan.
- Hubungkan is Web Serial at 115200 baud (`useSerialBoard.ts`). Upload needs a second use of the same port
  (close it, flash, reopen).
- `personalize*`, `isiKunciPapan` (`group-identity.ts`) already rewrite GROUP_ID, WIFI_SSID,
  LORA_SYNC_WORD and HUNT_KEY with strict one-match rules, and `kode-aktif.ts` holds the published code.
- The PC already runs the site (`iris-web`, Node, sandboxed unit, `ProtectSystem=strict`) and the agent
  (`iris-agent`). The agent has a hardened `arduino-cli` compile runner (`kompilasi.py`: `bwrap`, no
  network, time and memory limits, warm build folders). Its site side (job queue) does not exist yet.
- `arduino-cli` and the esp32 core were **not** installed on the PC. Installed during this design as a
  spike: arduino-cli 1.6.0 in `/usr/local/bin`, core `esp32:esp32@3.3.12` (same as the laptop) and the
  libraries LoRa 0.8.0, WebSockets 2.7.2, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15 under
  `/opt/arduino`. PC: 4 cores, 15 GiB RAM, 916 GB free.
- The bug: `LiveRecords` keys messages by their number and keeps at most 120. After a reboot the board's
  numbers restart at 1, and the oldest-by-number record (the new one) is evicted at once, until the number
  passes the old maximum. Hence "wait until #337". Found by reading, to be confirmed by a test.

## Approaches considered

**A. Browser flashes, PC compiles a per-user image (recommended).**
The site API (on the PC) asks a small local build service for an image made from the server's template
with the user's values; the browser downloads it and flashes it with esptool-js over Web Serial. Nothing
on the laptop. Latency: a warm compile is seconds to well under a minute; results cached per identical
input. Risk: browser flashing on Windows with these CH340 boards is unproven (the Windows esptool path
failed earlier; Linux worked). Mitigated by trying several reset sequences and by testing on real boards
before building the UI.

**B. Browser plus a local helper on every laptop.** A resident program flashes with Windows esptool and
falls back to usbipd + any WSL distro. Matches the first wish ("Windows first, then WSL"), but needs
install and admin rights on about 35 laptops and keeps breaking per distro. It was dropped once the user
decided "client-side has nothing to worry about installations".

**C. Precompiled images patched in place.** No compiler on the server and instant, but GROUP_ID and
LORA_SYNC_WORD are compiled into instructions, not strings, and the image checksum and SHA-256 would need
repair. Rejected.

For the build service itself: reuse the agent's queue through the heartbeat (A1) or a new local service
the site calls directly (A2). A1 waits for the next heartbeat (seconds to minutes) and needs a whole new
job channel; A2 is a direct localhost call and the PC already hosts both sides. **A2**, reusing
`kompilasi.py`'s checks and `confine()` so the sandbox is the same.

## Design

**Build service `iris-build` (IRIS ASO, `pc/`).** systemd unit, user `iris-build`, listens on a Unix
socket or 127.0.0.1 only. Request: `{modul, board, values, templateVersion}`. It never accepts code.
It writes the sketch from a template the site hands it over the same local call, applies the validated
values, runs `arduino-cli compile` under `confine()`, returns the merged image (trim and 4-byte align as
`kompilasi.trim_image` does). Three workers, one queue, `nice`, per-build timeout, build cache keyed by
a hash of (template version, board, values). Toolchain provisioning script
(`iris-build-provision.sh`) installs arduino-cli, the core and libraries to `/opt/arduino`, pinned to the
laptop's versions; added to the bundle and to `iris-pulih`'s checks.

**Site API (`apps/web/api`).** `POST /api/live/build` (signed in; Praktikan own group in a session, any
signed-in user in practice) validates the inputs, takes the template with answers from `kode-aktif`
server-side, asks `iris-build`, returns a job id; `GET` polls it; `GET .../image` streams the image once
to that user. Limits: a few builds per user per 10 minutes, a global queue cap. The Wi-Fi password is
used for the build and never stored or logged; cached images are keyed by a hash that includes it and are
kept for a short time only.

**Validation.** SSID 1 to 32 bytes, password empty or 8 to 63 printable ASCII, group 1 to the session's
group count (practice: 1 to 6), key `[A-Z0-9]{8}`. Values are escaped as C string literals; the
substitution is the existing strict one-match rewrite, so a template that does not contain the expected
line fails the build instead of producing a wrong image.

**Browser (`LiveRoom`, `useSerialBoard`, new `useUploadBoard`).** Each board row gets Upload. A panel
"Upload Settings" holds the inputs; Group defaults to the user's own, the Module 4 key to the group's
key when a hunt is open. SSID and group are remembered in `localStorage`, the password only for the tab
(`sessionStorage`). Flow: validate, build (progress and queue position), download, close the port if it
is open, flash with esptool-js (progress), hard reset, reopen as Hubungkan. Errors are named (build
failed, port busy, could not enter the bootloader, flash verify failed) with one next step each.
Pico W (Module 3, MicroPython): no build; the server returns the module's `main.py` with the values
filled in and the browser writes it through the REPL, then soft-resets.

**Practice mode.** `/modules/N/live` for any signed-in user shows Hubungkan and Upload with a free group
picker; Capture, mirror and session upload are off; a "Practice" badge says nothing is saved. In a
running session the in-session Live is unchanged apart from Upload.

**Live data fix.** Records are keyed by (run, number). A number that goes backwards by more than a
small margin starts a new run; the previous run stays visible above it; eviction removes the oldest
**run entry by arrival**, never the newest. Test: feed 1..337, then 1..10, expect the new rows visible.

## Constraints

- Web Serial: desktop Chrome or Edge only (as now). iOS/Android get the existing "unsupported" message.
- ESP32 boards here have no BOOT button; flashing relies on the auto-reset circuit (DTR/RTS).
- The PC is also the hunt server: builds are `nice`d, capped, and refused while load is high.
- Constants outside the journal's blanks may change (smoothing, beacon rate); blanks and answers may not.

## Order and what is left to the builder

1. Live data fix (own small PR, quick).
2. Toolchain on the PC (spike done by hand: arduino-cli, core, libraries) then `iris-build` and its
   provisioning in IRIS ASO.
3. A throwaway test: flash a real Aurora V2 board from Chrome on Windows with esptool-js, using a
   server-built image. Decides whether A works as designed before any UI is built.
4. Site API, Upload UI, practice mode, strings in id/en/zh, tests, a click sweep.
5. LoRa speed and accuracy: server-side adaptive filter first (no reflash), then firmware changes
   (beacon 4 packets a second, slots aligned to the NTP clock, lighter median and smoothing), delivered
   through Upload. Its own short spec.

Left to the builder: exact socket path, queue sizes, esptool-js reset sequence order, strings, layout of
the settings panel (reuse existing Panel, field and button styles, no native widgets).

## My calls (for you to check)

- Dropped the WSL fallback on student laptops after "client-side has nothing to worry about" (reinstate
  as a later option if browser flashing proves unreliable).
- Password kept in the tab only; SSID and group remembered.
- Module 4 key auto-filled when a hunt is open, otherwise typed.
- Practice mode allows any group 1 to 6 so a lone tester can run both boards of any pair.
