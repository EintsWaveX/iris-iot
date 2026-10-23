# 03 · S1 UI build (banner, candidate page, Daftar, calendar, panel shell, Panitia board)

- **Model / effort:** Sonnet 5.5, high
- **Needs:** 01 (signed off), 02 (done)
- **Deadline:** must-haves live 25 Oct 2026 (banner, `/recruitment`, Daftar + uploads, read-only calendar). The calendar editor and Panitia board may land by 27 Oct, but Daftar must not wait on them.
- **Owned paths:**
  - `apps/web/src/pages/recruitment/` (+ `en/`, `zh/` twins)
  - `apps/web/src/components/recruitment/`
  - the banner's mount point in the Home view (one import + one element; find where the practicum hero renders)
- **Skills:**
  - `superpowers:executing-plans`
  - `emil-design-eng`
  - `frontend-design`
  - `animate`
  - `mobile-native`
  - `design:accessibility-review`
  - `break-ui`
  - `superpowers:verification-before-completion`

Read `_RULES.md`, `PRD.md` sections 5, 6 and 9, `ARCHITECTURE.md` sections 1, 4, 5 and 10, `handoffs/01.md` (mockup URL + rulings) and `handoffs/02.md` (types).

## Build order (ship the must-haves first)
1. **Home banner island** (all roles), fed by `GET banner`, live on `rec-edition` and `rec-calendar`. Below the practicum hero, never above it.
2. **`/recruitment` candidate page:** journey, next event card, public calendar (month grid with spanning bars, built from `calendar.ts`, the same kit look as `components/tp/KalenderTp.tsx`), documents drawer, envelope inbox (empty state), Mundur.
3. **Daftar dialog:** the stepper, uploads straight to R2 with progress and replace, the consent Checkbox, and success. Error states for size, type, a closed gate and offline.
4. **Panel shell** `/recruitment/panel`: tabs filtered by rights, Ringkasan, the Kandidat table and side sheet with approve and revision.
5. **Kalender editor** (Ketua and Acara): the event dialog, drag to move and resize (`@dnd-kit` is already present), the started-stage Confirm.
6. **Panitia board.**

Match the signed-off mockup's structure and every ruling in `handoffs/01.md`. Where the mockup and the real kit disagree, take the kit and note it.

## Verify
- check, lint and vitest.
- Rig Playwright flows per role in `rig/rec_s1_flows.mjs`:
  - a visitor sees the banner
  - a Praktikan applies with 3 PDFs, then withdraws in a second account
  - Admin asks for a revision and the candidate re-uploads
  - Admin approves
  - the Ketua seats an Akademik Koordinator
  - Acara moves an event and the candidate page updates live without a refresh
- 7-width screenshots of every screen, checked by eye. Use `break-ui` worst-case data: long names, 100 candidates, an empty calendar month.
- `pop2.mjs` and `pop4.mjs`.
- Don't deploy. Handoff to 04.
