# Live Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user asked for the plan to run right away in one session). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every Live room gets Upload next to Hubungkan; the PC builds the module's sketch with the Praktikan's values and the browser flashes it; the Modules-menu Live gets both in a practice mode; Live data follows a rebooted board.

**Architecture:** A local build service `iris-build` on the PC (arduino-cli, sandboxed like `kompilasi.py`) is called by the site's API (same PC) with a server-side template plus validated values. The browser downloads the merged image and flashes it with esptool-js over Web Serial. Pico W (Module 3) gets a server-filled `main.py` written through the REPL.

**Tech Stack:** Python 3 stdlib (`iris-build`), TypeScript (Astro, React, vitest, Node API), esptool-js, arduino-cli 1.6.0 + esp32 core 3.3.12 (`/opt/arduino`).

**Spec:** `docs/superpowers/specs/2026-11-13-live-upload-design.md`

## Global Constraints

- Web Serial, desktop Chrome or Edge only; board baud 115200.
- No native browser widgets; UI copy in id, en and zh (zh only with characters in `src/fonts/cjk-chars.txt`); no em/en dashes in UI copy; Title Case headers.
- A Praktikan's browser never receives a correct answer or the template; the server alone reads `kode-aktif`.
- The Wi-Fi password is never stored or logged on the server; remembered in `sessionStorage` only; SSID and group in `localStorage`.
- Validation: SSID 1 to 32 bytes; password empty or 8 to 63 printable ASCII; group 1 to the session's group count (practice 1 to 6); board key `^[A-Z0-9]{8}$`.
- Builds: `nice`, 3 workers, per-build timeout 120 s, merged image at most 3 MiB, no network inside the sandbox.
- Pinned toolchain: arduino-cli 1.6.0, `esp32:esp32@3.3.12`, LoRa 0.8.0, WebSockets 2.7.2, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15.
- `git add` explicit paths only; never `commit -a` in IRIS ASO. Run `PYTHONUTF8=1 python scripts/check_secrets.py` before pushing either repo.

## Review Focus

- A board reboots mid-run and its message numbers restart: new rows must show at once (Task 1).
- SSID or password containing `"`, `\`, `%`, a newline, or non-ASCII: must be rejected or escaped, never change the code (Task 4).
- Two students upload at once, or the same student double-clicks Upload: one build per identical input, a queue position, no duplicate flash (Tasks 2, 4, 5).
- The port is busy (Serial Monitor/Arduino IDE) or the user unplugs mid-flash: a named error, port released, Hubungkan still works afterwards (Task 5).
- A guest or Praktikan of another group asks for a build for a group that is not theirs in a session: refused (Task 4).

---

## File Structure

- `apps/web/src/lib/live-records.ts` (modify): run-aware records. Test: `apps/web/src/lib/__tests__/live-records.test.ts`.
- IRIS ASO `pc/build/iris_build.py` (create): the build service. `pc/scripts/iris-build-provision.sh`, `pc/systemd/iris-build.service` (create). Tests `pc/build/tests/test_iris_build.py`.
- `apps/web/src/lib/live-build.ts` (create): shared types and input validation (browser and API). Test `src/lib/__tests__/live-build.test.ts`.
- `apps/web/api/_lib/live-build.ts` + route in `api/action.ts` (create/modify): templates, substitution, calls to `iris-build`, job store, image streaming.
- `apps/web/src/components/live/useUploadBoard.ts`, `UploadPanel.tsx`, `uploadStrings.ts` (create); `LiveRoom.tsx`, `useSerialBoard.ts` (modify).
- `apps/web/src/components/ModuleLiveView.astro` (modify): practice mode.

### Task 1: Live data follows a rebooted board

**Files:** Modify `apps/web/src/lib/live-records.ts`; Test `apps/web/src/lib/__tests__/live-records.test.ts`.

**Interfaces:** Produces `LiveRecords` unchanged publicly (`pc`, `board`, `list`, `clear`), but records are keyed by `(run, seq)`; `LiveRecord` gains `run: number`.

- [ ] **Step 1: Write failing tests** in `live-records.test.ts`: `test("a restart after #337 shows the new messages at once")` feeds `pc()` for seq 1..337 then seq 1..5 and asserts `list()` ends with seqs 1..5 of run 1 and still holds the last of run 0; `test("a gap that is not a restart stays one run")` feeds 1,2,50 and asserts one run; `test("eviction keeps the newest arrivals")` feeds 400 numbered rows then 3 new ones and asserts the 3 new are present.
- [ ] **Step 2: Run** `npm test -- live-records` in `apps/web`; expect the first and third to FAIL.
- [ ] **Step 3: Implement** in `live-records.ts`: remember `lastSeq` per source; a seq lower than `lastSeq - 5` (and not within the same run's known set) starts `run += 1`; key the map by `${run}:${seq}`; evict the entry inserted earliest (Map insertion order), never by minimum seq; `list()` sorts by `(run, seq)`. Module 1's own counter (`m1Seq`) restarts a run when `clear()` or a Central restart line arrives.
- [ ] **Step 4: Run** the whole `live-records` and `live-coverage` tests; expect PASS. Also `npx tsc --noEmit`.
- [ ] **Step 5: Commit** on a branch `live-records-restart`; open the PR (CI green), merge, Website Upgrade later.

### Task 2: `iris-build` service and toolchain provisioning (IRIS ASO)

**Files:** Create `pc/build/iris_build.py`, `pc/scripts/iris-build-provision.sh`, `pc/systemd/iris-build.service`, `pc/build/tests/test_iris_build.py`; modify `pc/build_bundle.py` manifest.

**Interfaces:** Produces an HTTP API on `127.0.0.1:8791`: `POST /build` body `{board: "esp32", files: {"s.ino": str}, tag: str}` returns `{id}`; `GET /build/<id>` returns `{state: "queued"|"running"|"done"|"failed", pos?: int, log?: str, size?: int}`; `GET /build/<id>/image` returns the merged binary. Consumes `kompilasi.confine`, `kompilasi.run_process`, `kompilasi.trim_image` (import from `pc/agent`).

- [ ] **Step 1: Write failing tests** (unittest, fake arduino-cli like `test_kompilasi.py`): queue order, three workers, cache hit for identical `tag`+files, refusal of a file name other than `s.ino`, timeout kills, image over 3 MiB refused.
- [ ] **Step 2: Run** `python -m unittest pc/build/tests/test_iris_build.py`; expect FAIL (module missing).
- [ ] **Step 3: Implement `iris_build.py`** (stdlib `http.server` on loopback, `kompilasi.compile_job`-style compile with `ARDUINO_DIRECTORIES_DATA=/opt/arduino/data` and `..._USER=/opt/arduino/user` read-only in the sandbox, warm build folder `/var/cache/iris-build`, load guard: answer 503 `busy` when `os.getloadavg()[0] > 6`).
- [ ] **Step 4: Implement the unit and provisioning script:** `iris-build.service` user `iris-build`, `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=/var/cache/iris-build`; `iris-build-provision.sh` creates the user and dirs, installs arduino-cli 1.6.0 to `/usr/local/bin`, the pinned core and libraries into `/opt/arduino`, idempotent.
- [ ] **Step 5: Run** the tests (expect PASS); on the PC run the provisioning script, start the unit, then `curl` a build of the Group 1 Hunter and check the returned size is under 3 MiB and the build time (record warm and cold).
- [ ] **Step 6: Commit** explicit paths on a branch `iris-build`; PR, CI, merge; publish the bundle (`gh workflow run bundel.yml`) so Perbarui can install it later.

### Task 3: Hardware proof: flash a real board from Chrome on Windows

**Files:** a throwaway page in the scratchpad (not committed).

**Interfaces:** Consumes Task 2's image (or the Task-2 spike's `/tmp/h/out/hunter.ino.merged.bin`).

- [ ] **Step 1:** Serve a one-file page that loads esptool-js, takes a merged image file, and flashes at 0x0 over Web Serial with `reset: "default_reset"`.
- [ ] **Step 2:** With the user's Aurora V2 board on this laptop, flash the image and watch the serial output at 115200; record: success, time, which reset sequence worked, any failure.
- [ ] **Step 3:** If it fails, try `usb_reset`, `no_reset` plus manual EN, and slower baud; write the working sequence into the spec's "Left to the builder" note. If nothing works, stop and report before any UI work.

### Task 4: Site build API

**Files:** Create `apps/web/src/lib/live-build.ts`, `apps/web/api/_lib/live-build.ts`, `apps/web/src/lib/__tests__/live-build.test.ts`, `apps/web/api/_lib/__tests__/live-build.test.ts`; modify `apps/web/api/action.ts`.

**Interfaces:** Produces `validateUploadValues(modul: number, role: string, v: UploadValues): {ok: true; v: Clean} | {ok: false; field: string; kode: string}`; `UploadValues = {ssid: string; password: string; group: number; key?: string}`; `buildSketch(modul, role, lang, clean): string` (server only; uses `kode-aktif` + `personalize*`); routes `live.bangun` (start), `live.status`, `live.berkas` (image stream, once, owner only).

- [ ] **Step 1: Write failing tests:** validation table (SSID 33 bytes, password 7 chars, group 0 and 7, key lowercase, quote/backslash/newline/non-ASCII rejected); substitution test that a password with `%` and `"` produces a literal-escaped line and the rest of the file is byte-identical; permission tests (guest refused, Praktikan other group refused in a session, practice mode accepts any group 1 to 6); rate limit test (7th build in 10 minutes refused).
- [ ] **Step 2: Run** `npm test -- live-build`; expect FAIL.
- [ ] **Step 3: Implement** `live-build.ts` (pure validation, shared) and the API module (`iris-build` client over loopback, in-memory job map with 10 minute expiry, identical-input coalescing, `Cache-Control: no-store`, never logging the password).
- [ ] **Step 4: Run** the tests, `tsc`, `eslint`; expect PASS. Local check against the PC's service is done in Task 2/5.
- [ ] **Step 5: Commit** and PR `live-upload-api`.

### Task 5: Upload UI

**Files:** Create `useUploadBoard.ts`, `UploadPanel.tsx`, `uploadStrings.ts` (id/en/zh) under `apps/web/src/components/live/`; modify `LiveRoom.tsx` (`PortRow` Upload button, panel), `useSerialBoard.ts` (expose `releasePort()`/`adopt(port)`); add `esptool-js` pinned to the version Task 3 used.

**Interfaces:** `useUploadBoard(modul): {state: UploadState; start(values, role): Promise<void>; cancel(): void}` with `UploadState = idle | building{pos?} | downloading | flashing{percent} | done | error{kode}`; consumes `live.bangun/status/berkas` and `validateUploadValues`.

- [ ] **Step 1: Write failing tests** (vitest, jsdom): panel defaults Group to the user's own group; password not written to `localStorage`; Upload disabled until values validate; error kodes map to strings in all three languages (`zh-complete` test).
- [ ] **Step 2: Run** and see FAIL; **Step 3: implement** the hook (close port, flash, hard reset, reopen as Hubungkan) and the panel (existing Panel, field and button styles; Module 4 key auto-filled from the Hunt step data when a hunt is open); Pico W path writes `main.py` via raw REPL then soft-resets.
- [ ] **Step 4: Run** tests, `tsc`, `eslint`, `prettier`; then a click sweep in DevTools at 7 widths; then upload to a real board for Modules 4 (both roles), 1, 2, and 3 if a Pico is at hand.
- [ ] **Step 5: Commit** and PR `live-upload-ui`.

### Task 6: Practice mode in the Modules-menu Live

**Files:** Modify `ModuleLiveView.astro`, `LiveRoom.tsx` (`praktik` prop), `liveStrings.ts`.

**Interfaces:** `LiveRoom` gains `praktik?: boolean`; when true, `canPorts` is true for any signed-in user, group picker is free (1 to 6), Capture, mirror and session upload are off, a "Practice" pill is shown, and `useTelemetry` runs with `sesiId = null`.

- [ ] **Step 1: Failing test:** a signed-in user with no session sees Hubungkan and Upload; Capture is absent; no request to `/api/session/telemetry` or `/api/session/cermin` is made.
- [ ] **Step 2 to 4:** implement, run tests, verify in DevTools in TOT with a practice session closed; **Step 5:** commit, PR `live-practice-mode`.

### Task 7: LoRa speed and accuracy (separate short plan)

Server-side adaptive filter in `apps/modul4/server.py` (no reflash), then firmware changes through Upload. Written as its own plan after Task 3 settles the flashing route.
