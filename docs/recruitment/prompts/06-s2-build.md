# 06 · S2 build (Berkas review, Cutting + lock, reveal, QR attendance)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 04 (done: S1 live), 05 (signed off)
- **Deadline:** live by 9 Nov 2026 (Berkas check 9 to 10 Nov, Pengumuman 11 Nov, First Meet 12 Nov)
- **Owned paths:**
  - `apps/web/drizzle/0049_*`
  - the S2 tables in `schema.ts`
  - `apps/web/src/components/recruitment/{reveal,panel/cutting,panel/kandidat,qr}/`
  - the matching API actions in `api/recruitment/[aksi].ts` + `api/_lib/recruitment-cutting.ts`, `recruitment-attendance.ts`
  - `apps/web/src/pages/recruitment/qr.astro`
- **Skills:**
  - `superpowers:executing-plans`
  - `superpowers:test-driven-development`
  - `animate`
  - `emil-design-eng`
  - `typescript-pro`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, the PRD sections named in 05, `ARCHITECTURE.md` sections 2 to 4, and `handoffs/02.md`, `04.md` and `05.md`.

## Build
1. **Migration 0049:** the columns `rec_stage_result` and `rec_attendance` need, if 0048 didn't create them, plus the QR nonce table (rotating tokens, 20 s, signed with HMAC from an env secret: name it, never hard-code it).
2. **API:**
   - `propose`, `lock`, `unlock` (only before `reveal_at`)
   - `results` (Panitia board)
   - `envelopes` (candidate: only locked results with `now ≥ reveal_at`)
   - `envelope-open` (stamps `opened_at`)
   - `qr-token` (projector, Panitia rights)
   - `attend` (candidate scan: token + session)
   - `attend-manual` (Admin)
   - `review` (extend with optional score + notes)
   - Siaran topics: `rec-cutting`, `rec-candidates`.
3. **Reveal timing:** a candidate's envelope appears at `reveal_at` **without a refresh**. Schedule a local timer to the exact time, then fetch again (the server is the judge), and also listen on siaran. Make sure it can never show early, even with the device clock set ahead.
4. **UI:** exactly as the signed-off mockup and its motion specs. Envelope animations are GSAP timelines with cleanup, Low Detail and reduced-motion paths, and unique `rec-` keyframe names. Audio only after a user gesture and only if sound is on.
5. **Home banner:** add the sealed-envelope chip and the 7-day thank-you state.

## Tests
- The reveal gate (clock before and after, locked or not, unlock after reveal refused).
- Threshold proposals.
- The QR token expiry and replay.
- Attendance only for a candidate whose stage includes that event.
- Leak: a candidate can never fetch `results`.

## Verify
- Rig flow `rec_s2_flows.mjs`:
  - Admin reviews 5 candidates
  - two Panitia members propose
  - the Ketua locks with `reveal_at` 2 minutes ahead
  - the candidate page sits open and the envelope arrives on time
  - open it as a Lolos candidate and as a Gagal candidate, recording a short video of each (Playwright `recordVideo`) for the user
  - QR attendance from a phone-width context
- 7 widths, `pop2`/`pop4`. Handoff to 07.
