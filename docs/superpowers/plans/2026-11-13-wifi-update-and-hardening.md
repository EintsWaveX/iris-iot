# Wi-Fi Board Update and Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Unggah work for the ESP32 modules (1, 2, 4) from any Windows browser by updating a running board over Wi-Fi instead of flashing it over USB, then prove the whole release (site, bundle, sketches, boards) holds.

**Architecture:** The site appends a small update handler to every ESP32 sketch it builds (the build service still receives one file, `s.ino`, so no PC update is needed). Unggah sends the running board one serial line carrying the Wi-Fi details and a one-time download link; the board joins Wi-Fi, downloads the app image from the site, verifies its MD5, writes it to the other app slot and restarts. No DTR/RTS reset is involved. Part B is a verification and rollback pass over everything shipped on 2026-11-13.

**Tech Stack:** Arduino-ESP32 core 3.3.12 (`Update`, `HTTPClient`, `WiFiClientSecure`), esptool 5.x on Linux for the one-time seeding flash, TypeScript/Astro site, Web Serial, vitest, arduino-cli on the PC build service.

**Spec:** The two design answers of 2026-11-13 in the conversation ("Wi-Fi update path" and "verification pass"), plus `docs/superpowers/plans/2026-11-13-live-upload.md` for the existing Upload flow this extends. Facts measured today that the design rests on: Windows' WCH CH340 driver 3.9.2024.9 never pulls GPIO0 low (about 12 DTR/RTS sequences, all boot 0x13); the same boards enter download mode from Linux; the classic ESP32 cannot force download mode from software (checked with a test sketch: `SW_CPU_RESET` and `SW_RESET` both re-read the strap as 0x13); the build service accepts exactly `{"s.ino": ...}` and fqbn `esp32:esp32:esp32` only.

## Global Constraints

- Site-only deploy: do not change `pc/agent/iris_build.py` or `kompilasi.py` (a PC update is refused during a session).
- Default partition scheme only (two 0x140000 app slots); the image today is about 1.16 MB of 1.31 MB, so the handler must fit or the task fails (Task A2 measures it).
- The student-visible sketch text is not edited; the handler is appended after it at build time. Blank numbering and line numbers cited by slides do not move.
- No credentials in the repo or in logs; the Wi-Fi password travels only over USB serial to the board and is never stored by the site.
- English routes and APIs, Indonesian copy, no dashes in UI copy, title case headers.
- Never deploy while a practicum session runs; deploy chain is PR, CI, squash-merge, `gh workflow run bundel.yml` in IRIS ASO, user presses Website Upgrade.

## Review Focus

- A board that never gets Wi-Fi (wrong password, hotspot off): Unggah must report it in about 30 seconds and leave the old firmware running.
- A download cut halfway or a wrong MD5: the old firmware must keep running (the other slot is never marked bootable).
- The handler must receive the command while the sketch is blocked in its own Wi-Fi connect loop (Module 4) and while BLE runs (Module 1).
- Normal serial traffic (Module 1's time prompt, Module 2/4 prints) must pass untouched; only a line starting with byte 0x01 is consumed.
- A board with no handler (virgin or foreign firmware): Unggah must say so in plain words and name the seeding step, not just time out.
- Two students on one hotspot, a reused or expired link, or someone else's build id: the download endpoint must refuse.
- Image too large for the slot: the build must fail with a clear code before anything is sent to a board.

---

## Part 0: Prerequisite, TOT readiness (not code)

### Task 0: Flash Group 1 for the TOT test

**Files:** none (uses `C:\...\Temp\fw2` images and WSL Fedora `~/espenv/bin/esptool`).

- [ ] **Step 1:** Get Group 1's Kunci Papan from the user; fill the Live form (user types the Wi-Fi password and key).
- [ ] **Step 2:** Rebuild Hunter and Beacon through `POST /api/session/bangun` (modul 4, group 1, key set); fetch both images with `GET /api/session/bangun-berkas?id=`.
- [ ] **Step 3:** `usbipd attach --wsl FedoraLinux-44 --busid 1-1` and `4-1`; flash each by MAC (Hunter `54:43:b2:7e:d3:50`, Beacon `54:43:b2:7e:d9:ec`) at `--baud 921600 write-flash 0x0`. Expected: `Hash of data verified.` twice.
- [ ] **Step 4:** Read both boards' serial for 30 s. Expected: Beacon packets on `:000` and `:500`, Hunter lines with RSSI, scoreboard shows Group 1 online. Then `usbipd detach` both.

---

## Part A: Wi-Fi board update

### Task A1: Hardware spike (decides the handler's receive mechanism)

**Files:** Create `docs/superpowers/plans/spike-wifi-update.md` (result notes only); scratch sketches stay out of the repo.

**Produces:** a recorded decision: handler receives serial via (a) `serialEvent()` or (b) a task calling `Serial.onReceive`, and the measured image size with handler.

- [ ] **Step 1:** Write a scratch sketch with the Module 4 shape (blocking `while (WiFi.status() != WL_CONNECTED)` loop) plus option (a); flash via WSL; send `\x01PING\n` while it is blocked. Record whether a reply arrives.
- [ ] **Step 2:** Same with option (b) (task started from a global constructor waits until `Serial` is begun, then registers `onReceive`).
- [ ] **Step 3:** With the winner, add `HTTPClient` + `WiFiClientSecure` + `Update` and download a 1.1 MB file from `https://irisiotlab.com` over the phone hotspot; write it to the other slot, restart, confirm it boots. Record the resulting app size against 1,310,720 bytes for Module 1 central (largest, 1,179,984 bytes today).
- [ ] **Step 4:** If it does not fit: record the overshoot and stop; the plan then needs a reduced client (plain `WiFiClient` over a PC-hosted HTTP port on the LAN) before Task A2.

### Task A2: Handler source and build-time injection

**Files:**
- Create: `apps/web/api/_lib/iris-update.ts` (exports the handler C++ as a string)
- Modify: `apps/web/api/_lib/live-build.ts` (`rakitSketch`, ESP32 files only)
- Test: `apps/web/api/_lib/__tests__/iris-update-inject.test.ts`

**Interfaces:**
- Produces: `export const PENGENDALI_UPDATE: string`; `rakitSketch(...)` returns the sketch with `PENGENDALI_UPDATE` appended for `kind === "esp32"` files only.

- [ ] **Step 1: Failing tests** `appends the handler once to every ESP32 file (M1 central, M1 peripheral, M2, M4 hunter, M4 beacon)`, `leaves the Pico files untouched`, `keeps the sketch text before the handler byte for byte`, `the handler defines no symbol the sketches define (setup, loop, wallClockTimestamp, webSocket)`.
- [ ] **Step 2:** Run `npx vitest run api/_lib/__tests__/iris-update-inject.test.ts`; expected FAIL.
- [ ] **Step 3:** Implement the handler per the A1 decision. Command line: `\x01IRISUPD {"s":ssid,"p":password,"u":url,"n":size,"m":md5}\n`. Replies, one per line: `IRISUPD wifi`, `IRISUPD get <percent>`, `IRISUPD ok`, `IRISUPD err <code>` with codes `wifi`, `http`, `size`, `md5`, `write`. Consume a line only when its first byte is 0x01. Never mark the slot bootable unless `Update.end(true)` succeeds after the MD5 matches.
- [ ] **Step 4:** Run tests, then the compile check: build each of the 5 ESP32 files on the PC (`POST /api/session/bangun`) one at a time; expected `state: done` and size under the slot.
- [ ] **Step 5:** Commit.

### Task A3: One-time download endpoint

**Files:**
- Create: `apps/web/api/_lib/live-update.ts` (`handleUpdateLink`, `handleUpdateImage`)
- Modify: `apps/web/api/session/[aksi].ts` (routes `bangun-tautan`, `bangun-app`)
- Test: `apps/web/api/_lib/__tests__/live-update.test.ts`

**Interfaces:**
- Consumes: `LayananBangun` image bytes, `pemilik` map (build id to NIM) from `live-build.ts`.
- Produces: `POST /api/session/bangun-tautan {id}` returns `{ok, url, size, md5}` for the build's owner; `GET /api/session/bangun-app?id=&t=` returns the app-only image (merged image from offset 0x10000, trailing 0xFF trimmed) with no cookie, token-only.

- [ ] **Step 1: Failing tests** `link only for the build's owner`, `token expires after 10 minutes`, `token works for one device then refuses (second request 403)`, `wrong id or tampered token 403`, `image starts with the ESP image magic byte 0xE9 and its md5 matches the link's`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement with an HMAC of `id|nim|expiry` using the existing server secret; one-use via an in-memory set (matches the existing `pemilik` lifetime). **Step 4:** Run; expected PASS. **Step 5:** Commit.

### Task A4: Unggah sends the update over serial

**Files:**
- Create: `apps/web/src/lib/upload-wifi.ts` (`updateOverWifi(port, link, wifi, onStage)`)
- Modify: `apps/web/src/lib/upload-flow.ts`, `apps/web/src/components/live/useUploadBoard.ts`, `apps/web/src/components/live/uploadStrings.ts`
- Test: `apps/web/src/lib/__tests__/upload-wifi.test.ts` (simulated board, like `upload-pico.test.ts`)

**Interfaces:**
- Consumes: Task A3's `{url, size, md5}`; the board protocol of Task A2.
- Produces: `updateOverWifi(port: SerialPort, link: {url: string; size: number; md5: string}, wifi: {ssid: string; password: string}, onStage: (s: "wifi" | "download" | "done", percent?: number) => void): Promise<void>`; rejects with `UploadError` codes `no_handler`, `wifi`, `http`, `md5`, `write`.

- [ ] **Step 1: Failing tests** `happy path reports wifi, download percent, done`, `no reply in 3 s is no_handler`, `err wifi from the board is wifi`, `Windows or Linux reset failure is never attempted for ESP32 boards that answer the handler`.
- [ ] **Step 2-4:** Run to fail; implement; run to pass. Order in the flow: ask the running board first; only if it is `no_handler` fall back to the USB esptool-js path (works on Linux hosts and boards that can enter download mode) and show the seeding hint (copy: Indonesian, no dashes).
- [ ] **Step 5:** Commit.

### Task A5: Seeding procedure

**Files:** Create `docs/praktikum/seeding-board.md` (exact commands for WSL or Linux: build with the site, `esptool write-flash 0x0`, verify a `IRISUPD` reply); Modify `apps/web/src/components/live/uploadStrings.ts` (failure text for `no_handler` names the seeding step).

- [ ] **Step 1:** Seed both Group 1 boards, send `\x01IRISUPD {}\n` from the Windows serial monitor, expect `IRISUPD err http` (proves the handler answers). **Step 2:** Commit the doc.

### Task A6: Acceptance on real boards (Windows Chrome, no WSL)

- [ ] **Step 1:** With the seeded Beacon, press Unggah for Module 4 Beacon from Windows Chrome. Expected: stages wifi, download, done; the board restarts on the new build; serial shows the new version.
- [ ] **Step 2:** Repeat for Module 1 central, Module 2 ESP32. **Step 3:** Pull the hotspot mid-download: expected error `wifi` or `http`, old firmware still running. **Step 4:** Merge chain (PR, CI, squash, bundle), user presses Website Upgrade.

---

## Part B: Release hardening

### Task B1: Full automated pass

- [ ] **Step 1:** `npx vitest run` in `apps/web`; expected only the known `reconstruction.test.ts` failures (stale local ASO checkout). **Step 2:** `npm run check:app`, `check:api`, `check:test`, `npx eslint .`, `npx prettier --check .`, `PYTHONUTF8=1 python scripts/check_secrets.py`; expected all clean.

### Task B2: Compile matrix on the PC's real compiler

- [ ] **Step 1:** For modules 1, 2, 4 and every role, languages `id` and `en`, groups 1, 5, 6, 10, 11, 15, and both Module 4 networks, request builds through `POST /api/session/bangun` one at a time (never parallel; parallel runs gave false failures). Expected: every one `state: done`, size under 1,310,720 bytes (record the maximum). **Step 2:** Record any failure with its log; fix before continuing.

### Task B3: Real-board pass

- [ ] **Step 1:** For each ESP32 role, update the seeded board over Wi-Fi (Task A4) and read serial for 30 s; record the first lines. **Step 2:** Module 3 Pico from Windows (already confirmed by the user) and one rerun. **Step 3:** Module 4 pair: Beacon on `:000/:500`, Hunter reports, scoreboard live.

### Task B4: Deploy safety and rollback

- [ ] **Step 1:** Confirm the published bundle's commit equals `main` HEAD. **Step 2:** On the PC (outside a session): Perbarui, then confirm the service report shows the bundle commit. **Step 3:** Rehearse rollback: restore Module 4 code v3 from history with `kode-pulihkan {modul: 4, id}`, build, then republish v4; confirm both builds succeed. **Step 4:** Verify `/modules/N/live` forwards for N = 1 to 4 in id, en, zh.

### Task B5: Freeze and handover

- [ ] **Step 1:** Write `docs/praktikum/release-freeze.md`: what must not change before a practicum (published code versions, Wi-Fi handler, build service token, bundle), who presses what, and the three known gaps (Windows USB flash of Aurora V2, Beacon late packets without a key, lab-side hotspot and cable faults). **Step 2:** Update the `iris-live-upload-1113` memory note. **Step 3:** Commit.

---

## Self-Review

- **Spec coverage:** Wi-Fi update (A1 to A6), seeding (A5), verification (B1 to B3), deploy safety and rollback (B4), freeze (B5), TOT prerequisite (Task 0). The "100% guarantee" is deliberately not a task: Part B ends with a recorded list of what is proven and what is not.
- **Type consistency:** `PENGENDALI_UPDATE`, `updateOverWifi`, link shape `{url, size, md5}` and error codes match between A2, A3 and A4.
- **Largest risk:** image size against the 1.25 MB slot (Task A1 step 3 decides before any other work; fallback named in step 4).

---

## Part C: Module 4 board layout (7 boards now: 5 Hunters and 2 Beacons; 10 or more later)

**Goal:** One Module 4 setting says how many Beacons exist and which groups each one serves, so 5H+2B works today and 10H+10B (or any mix) works later without code changes.

**Design:** Each group keeps its own Hunter, sync word, group number in packets, board key and scoreboard line. Only the Beacon changes: a Beacon serves a list of groups and takes one group per slot, switching its LoRa sync word, group number and key for that slot. The scoreboard already checks the key in every Beacon message (`"k"` per report, `apps/modul4/server.py` `on_beacon`), so it should need no change and no PC update; Task C1 confirms this first.

**Setting:** `pengaturan` key `modul4.papan` = `{ beacons: number }` (default: as many Beacons as groups, which is today's one-to-one layout). The map group to Beacon is derived, not stored: Beacon `b` (1-based) serves groups `g` where `(g - 1) % beacons == b - 1`. 5 groups and 2 Beacons: Beacon 1 serves 1, 3, 5; Beacon 2 serves 2, 4. 10 groups and 10 Beacons: one each.

### Task C1: Confirm the scoreboard accepts one Beacon reporting several groups
- [ ] Read `on_beacon` and the key check in `apps/modul4/server.py`; write `apps/modul4/tools/uji_beacon_banyak_kelompok.py` that opens one `/beacon` socket and sends reports for groups 1, 3, 5 with their own keys; expected: all three groups show packets, a wrong key for group 3 is flagged without affecting 1 and 5. If the server binds a socket to one group, stop: a PC change (and a Perbarui outside a session) is needed, say so before continuing.

### Task C2: The setting and the derived map
**Files:** Create `apps/web/src/lib/papan-hunt.ts`; Test `apps/web/src/lib/__tests__/papan-hunt.test.ts`; Modify the Module 4 Pengaturan card in the Asisten UI.
**Produces:** `export function kelompokBeacon(beacon: number, beacons: number, groups: number): number[]` and `export function beaconUntuk(group: number, beacons: number): number`; `beacons` clamped to 1..groups, default groups.
- [ ] Tests: `5 groups 2 beacons -> [1,3,5] and [2,4]`, `10 and 10 -> one each`, `beacons above groups clamps`, `beacons 0 or NaN gives the default`, `every group maps to exactly one beacon`.

### Task C3: Beacon sketch serves a list of groups
**Files:** `kode_praktikum` and `kunci_jawaban` Module 4 Beacon via ASO `scripts/gen_modul4.py`; synced into `apps/web/src/content/sketches/{id,en,zh}/modul4_beacon.ino`; `apps/web/src/lib/group-identity.ts` (personalize); `api/_lib/live-build.ts`.
- [ ] The Beacon gets `BEACON_GROUPS[]`, `LORA_SYNC_WORDS[]`, `HUNT_KEYS[]` (one entry per served group). Slot period 250 ms; slot `i` transmits for group `BEACON_GROUPS[i % n]` after `LoRa.setSyncWord(...)`, with that group's number in the payload and in the scoreboard report. With one group the behaviour equals today's Beacon (NTP slot offset by group, ten 50 ms slots).
- [ ] Blanks (1) to (4) keep their lines; (5) and (6) move and the slides' line ranges are updated again.
- [ ] Tests: `group-identity` personalizes the arrays for [1,3,5] and [2,4] and for one group; the build matrix compiles on the PC with 1, 2, 3, 5 and 10 groups per Beacon.

### Task C4: Upload form and build for a shared Beacon
**Files:** `apps/web/src/components/live/UploadPanel.tsx`, `useUploadSettings.ts`, `api/_lib/live-build.ts`, `src/lib/live-build.ts` (`UploadValues` gains `beaconNo?: number`).
- [ ] The Beacon row asks "Beacon 1 or 2" (shown only when `beacons` < groups); the build fills the served groups and their keys from the setting. Tests: validation rejects a Beacon number above `beacons`; the sketch for Beacon 2 of 2 contains groups 2 and 4 only.

### Task C5: Real-board acceptance with 5 Hunters and 2 Beacons
- [ ] Flash Beacon 1 (groups 1, 3, 5), Beacon 2 (groups 2, 4) and five Hunters (Linux seeding or Wi-Fi update). Expected: each Hunter hears only its own group's packets (about 1.3 per second), the scoreboard shows all five groups, no group sees another's data. Merge chain, user presses Website Upgrade, and Perbarui if Task C1 found a PC change.
