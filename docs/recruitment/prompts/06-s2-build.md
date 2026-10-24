# 06 · S2 build (Berkas review, Cutting + lock, reveal, QR attendance, Pilih Jadwal)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 04 (done: S1 live), 05 (signed off)
- **Deadline:** live by 9 Nov 2026 (Berkas check 9 to 10 Nov, Pengumuman 11 Nov, First Meet 12 Nov)
- **Owned paths:**
  - `apps/web/drizzle/0049_*`
  - the S2 tables in `schema.ts`
  - `apps/web/src/components/recruitment/{reveal,panel/cutting,panel/kandidat,panel/jadwal,jadwal,qr}/`
  - the matching API actions in `api/recruitment/[aksi].ts` + `api/_lib/recruitment-cutting.ts`, `recruitment-attendance.ts`, `recruitment-slots.ts`
  - `src/lib/recruitment/slots.ts` (pure: pick, capacity, Auto Isi, the H-1 cutoff)
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
1. **Migration 0049:** the columns `rec_stage_result` and `rec_attendance` need, if 0048 didn't create them, plus the QR nonce table (rotating tokens, 20 s, signed with HMAC from an env secret: name it, never hard-code it). Also `rec_slot`, `rec_slot_assignment`, `rec_slot_change` (ARCHITECTURE section 2), the event kind `pick`, and the three Pilih Jadwal events from PRD section 3 for the live edition.
2. **API:**
   - `propose`, `lock`, `unlock` (only before `reveal_at`)
   - `results` (Panitia board)
   - `envelopes` (candidate: only locked results with `now ≥ reveal_at`)
   - `envelope-open` (stamps `opened_at`)
   - `qr-token` (projector, Panitia rights)
   - `attend` (candidate scan: token + session)
   - `attend-manual` (Admin)
   - `review` (extend with optional score + notes)
   - `slots` (candidate: their stage's slots with counts, no names; Panitia: full board), `slot-pick` (only while the pick gate is open, capacity checked in one transaction), `slot-change` (candidate: one open request, until H-1), `slot-decide` (approve/decline), `slot-set` (Panitia: create/edit slots, move anyone, over capacity allowed), `slot-autofill` (Auto Isi for those who did not pick)
   - Siaran topics: `rec-cutting`, `rec-candidates`, `rec-plotting`.
3. **Reveal timing:** a candidate's envelope appears at `reveal_at` **without a refresh**. Schedule a local timer to the exact time, then fetch again (the server is the judge), and also listen on siaran. Make sure it can never show early, even with the device clock set ahead.
4. **UI:** exactly as the signed-off mockup and its motion specs. Envelope animations are GSAP timelines with cleanup, Low Detail and reduced-motion paths, and unique `rec-` keyframe names. Audio only after a user gesture and only if sound is on.
5. **Home banner:** add the sealed-envelope chip and the 7-day thank-you state.

## Tests
- The reveal gate (clock before and after, locked or not, unlock after reveal refused).
- Threshold proposals.
- The QR token expiry and replay.
- Attendance only for a candidate whose stage includes that event.
- Leak: a candidate can never fetch `results`.
- Pilih Jadwal: two candidates racing for the last seat (one wins), picking outside the window refused, a change after H-1 refused, a second open request refused, Auto Isi deterministic and leaves picks alone, a candidate never sees who else sits in a slot.

## Verify
- Rig flow `rec_s2_flows.mjs`:
  - Admin reviews 5 candidates
  - two Panitia members propose
  - the Ketua locks with `reveal_at` 2 minutes ahead
  - the candidate page sits open and the envelope arrives on time
  - open it as a Lolos candidate and as a Gagal candidate, recording a short video of each (Playwright `recordVideo`) for the user
  - QR attendance from a phone-width context
  - Pilih Jadwal: Panitia set up 3 evenings, 5 candidates pick (one hits a full slot), one asks for a change and Panitia approve it, Auto Isi places the rest
- 7 widths, `pop2`/`pop4`. Handoff to 07.
