# 10 · Candidate exam runner (Phase 1)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 08 (done), 08c (signed off)
- **Runs in parallel with:** 09 and 11
- **Owned paths** (per EXAM-ENGINE section 10; typically):
  - migration for `rec_exam_seat` and `rec_answer` (coordinate the migration number with 09 and 11 via SendMessage)
  - `api/_lib/recruitment-seat.ts`
  - seat and answer actions
  - `pages/recruitment/test.astro`
  - `components/recruitment/exam/` (the format renderers live here and are shared with 09's preview)
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `emil-design-eng`
  - `animate`
  - `design:accessibility-review`
  - `mobile-native`
  - `break-ui`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `EXAM-ENGINE.md` sections 1 to 3, 5 to 7 and 10, the signed-off runner mockup, and `handoffs/08.md` and `handoffs/08c.md`.

## Build
1. **Entry:** visible only to a candidate assigned to a running room's evening. Check-in steps: fullscreen, a connection check, a name confirm. Then the lobby.
2. **Renderers for all formats:** single, multi, click-lines, pick-fix dropdowns (kit Dropdown inside the code, never native), order-lines (`@dnd-kit` sortable, keyboard accessible), match-pairs, FITB typed blanks (the IRIS blank look from `src/lib/blanks.ts` + `highlight.ts`).
   - One question per screen with a navigator strip (answered, flagged).
   - Answers autosave per change (debounced) and survive a reload.
3. **Timer:** from the room state with the server clock offset, showing time left as HH:MM:SS. Paused shows a "Dijeda" blur. When time ends: auto-submit, then the lobby.
4. **Soft lockdown:**
   - the fullscreen requirement and the cover
   - strike events per EXAM-ENGINE section 7, sent to the API
   - copy, cut, paste and the context menu blocked inside the test
   - no auto-fail
5. **Reference drawer:** the sandboxed snapshot iframe from 09 (stub it until 09 lands).
6. **Reconnect:** a dropped connection keeps the seat. On return, the same draw, the same answers, and the time left recomputed.

## Tests
- Credit through the renderers (each format's UI value maps to the `formats.ts` input).
- Autosave conflict (two tabs: last write wins and a warning shows).
- Reconnect.
- A candidate can't fetch another seat's draw or answers (IDOR).
- Answers are refused after the part ends.

## Verify
- Rig: 10 simulated seats (Playwright contexts) through the three parts with a fake Master (11's API, or direct state writes until 11 lands).
- The phone-width layout still works, but candidates sit on laptops: optimise for 1280 to 1680 and short laptop screens (1280×600).
- Handoff.

**Ruling 2026-10-24:** The seat page lets a candidate type their own phone hotspot (SSID and password, sealed; EXAM-ENGINE 9.6a, WAVE3.md).
