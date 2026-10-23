# 11 · Master console, Pengawas, relay exam room

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 08 (done)
- **Runs in parallel with:** 09 and 10
- **Owned paths** (per EXAM-ENGINE section 10; typically):
  - migration for `rec_exam_room` + the pengawas plotting for test evenings (`rec_slot`, `rec_slot_examiner` if S4 hasn't made them; coordinate with 15)
  - `api/_lib/recruitment-room.ts`
  - the room actions
  - `apps/relay/src/` (new room type, tests in `apps/relay/test`)
  - `components/recruitment/panel/tes/ruang/`
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `typescript-pro`
  - `emil-design-eng`
  - `apple-design`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `EXAM-ENGINE.md` sections 5, 6 and 10, the signed-off console mockup, and `handoffs/08.md`. Also read how Konsol does approval, the one-controller rule and handover (memory `iris-konsol-rooms`, code under `components/console/` and `api/_lib/konsol.ts`). Reuse its patterns.

## Build
1. **Test evening setup** (Akademik): rooms for 17, 18, 19 Nov + Susulan 20 Nov, the candidates per room (from plotting, or a simple assign list if S4 hasn't shipped), and the pengawas per room.
2. **Jadi Master:** any pengawas of that room, never the Pencipta. One Master at a time. Handover with the Konsol-style request and accept. The others are Pengawas: view only, plus notes per seat.
3. **Controls** through `room.ts` (from 08), each an API write that broadcasts on the relay: Start (next part), Pause/Resume all, Skip, Reopen previous, ± time for the room or one seat, Finish, re-roll a Live Coding spin for one seat (the call is defined here; 12 renders it).
4. **Console UI:**
   - the seat grid: live progress, strikes (with a timeline popover), connection, time left
   - the 120 min budget bar with overrun warnings
   - a part stepper styled like video controls
   - every destructive action behind HoldButton or Confirm
   - works on a laptop and on a projector; the Pengawas view also on a phone
5. **Relay room type:** auth tickets like Konsol's, fan-out only (the API is the truth), and a ping/staleness check like siaran's.

## Tests
- Every Master action's guards.
- Two Masters racing.
- Handover.
- The Pencipta refused as Master.
- Pause/resume time math with ± time.
- The relay room: auth, fan-out, a dropped seat.

## Verify
- Rig: a Master on one context and 10 seats from 10's runner. Run the full Phase 1 with pause, skip, reopen, +5 min to one seat and a handover mid-part.
- Record a video for the user.
- Handoff.
