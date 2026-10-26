# 12 · Live Coding (Phase 2)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 08 (done), 08c (signed off), 11 (done)
- **Owned paths:**
  - migration for `rec_livecode` + the rubric tables if S4 hasn't made them (coordinate with 15)
  - `api/_lib/recruitment-livecode.ts`
  - the livecode actions + the HTTP collector route
  - `components/recruitment/livecode/`
  - relay: a per-seat WS room (coordinate with 11's room type)
  - **PC agent repo** `Downloads/IRIS ASO/pc/agent/`: the `compile` job kind + tests
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `python-pro`
  - `typescript-pro`
  - `cpp-pro`
  - `embedded-architecture` (protocol templates)
  - `animate` (spins)
  - `emil-design-eng`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `EXAM-ENGINE.md` sections 9 and 10, the signed-off Live Coding mockup, and `handoffs/08.md` and `handoffs/08c.md` and `handoffs/11.md`. Read how the SeeLabs robot job runs end to end:
- site side: `api/_lib/seelabs-robot.ts`
- agent side: `pc/agent/seelabs.py`, its worker and `Worker.urgent()`, the protocol version and its tests

## Build
1. **Spins:**
   - topic, then protocol, with the slot-machine animation from the mockup
   - the result is drawn **server side** (the animation only lands on the answer the server gave)
   - the Master can re-roll one seat (11's call)
   - the topic pool editor sits in the bank (small: a title + brief + protocol fit)
2. **Editor:** CodeMirror 6 (new dependency; pin an exact version), with the kosmik theme, C++ highlighting, a template per protocol, autosave, and the reference drawer.
3. **Compile:**
   - **API:** queues a `compile` job for the PC Server agent. Results return through R2 (`.bin` + log). Show the queue position.
   - **Agent:** a new job kind running arduino-cli for `esp32:esp32:esp32` with the libraries the topic needs, in an isolated temp dir, with a time limit and a CPU/memory guard. It returns the merged bin + log and bumps the protocol version. A compile counts as urgent for the beat.
   - **Agent tests** (pytest) in `pc/agent/tests`: a valid sketch, a compile error, a timeout, a sketch trying to escape the temp dir (`#include` of an absolute path), a queue of 35.
4. **Flash:** esptool-js (new dependency, pin an exact version) over Web Serial using the merged bin offsets, with progress. Then the serial monitor (reuse `components/live/useSerialBoard.ts` and `src/lib/serial-lines.ts`).
5. **The other end:**
   - **MQTT:** the lab Mosquitto. Per-seat username/password generated when the evening starts, delivered to the seat at runtime, ACL to the `rec/<seat>/#` prefix, revoked at Finish. Never stored in code or the repo. The page subscribes through a WS bridge to show traffic.
   - **WebSocket:** a relay room per seat.
   - **HTTP:** `POST/GET /api/recruitment/collect/<seat-token>` echoes and records.
   - **BLE:** a Web Bluetooth central panel (scan, connect, read, write, notify).
   - All traffic goes to the seat's log and is visible to graders.
6. **Grader rubric:** the rows from the edition config (the default rows of EXAM-ENGINE 9.8 ship and stay editable). Two graders per seat, IRIS averages them, 0 to 1000.

## Verify
- Agent tests pass, then the web tests.
- On the rig with the real PC Server agent, or the rig's fake agent if the PC is unreachable (say which you used): compile, flash and serial on a real ESP32 if one is plugged into this laptop; otherwise flash to a dry-run stub and say so.
- Each of the four protocols shows traffic end to end with a sample sketch.
- Handoff, with a list of what the user must test on hardware.

**Ruling 2026-10-24:** The seat's boards use the seat's own hotspot first (typed by the candidate, EXAM-ENGINE 9.6a, WAVE3.md); a changed hotspot only needs Compile Ulang.
