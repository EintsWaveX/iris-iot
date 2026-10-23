# 01 · S1 Stage 0 mockup

- **Model / effort:** Opus 5.5, high
- **Needs:** none (runs in parallel with 02)
- **Deadline:** today, 23 Oct 2026, so the user can sign off and 03 can build on 24 Oct
- **Owned paths:** `~/Downloads/design-review/mockups/recruitment/` (new)
- **Skills:**
  - `emil-design-eng` (main lens)
  - `frontend-design`
  - `impeccable:impeccable`
  - `animate`
  - `find-animation-opportunities`
  - `apple-design`
  - `design:ux-copy`
  - `mobile-native`
  - `artifact-design` (before publishing)

Read `_RULES.md` first.

## Goal
Build a clickable Stage 0 mockup of every **S1** screen so the user can see and correct them before 03 builds them. Use the same engine and format as earlier phases:
- a screen picker
- widths 360, 820, 1280 and 1680
- ID/EN toggle
- a motion toggle
- a variant picker per screen
- design notes per screen

Copy the engine from `~/Downloads/design-review/mockups/phase10/` (or the newest phase folder that still runs). Build the screens from the live app's current look (kosmik baseline, real kit components and CSS), not from scratch.

## Screens (with variants)
1. **Home with the recruitment banner** (PRD 5.1). One variant per viewer: Visitor, Praktikan not applied (countdown), Candidate (stage + next date + sealed envelope chip), Cut candidate (thank-you), Panitia, Other Asisten.
   - Show it under the real practicum hero at 1280 and 360 so the user can judge that practicum keeps focus.
   - Animated gradient edge, plus its Low Detail and reduced-motion static versions.
2. **`/recruitment` candidate page** (PRD 5.2): the journey constellation, next event card, public calendar (month view with spanning bars, event popover), documents drawer, empty envelope inbox, Mundur hold action.
   - Variants: just applied (Menunggu verifikasi), revision asked, approved, before Open.
3. **Daftar stepper dialog** (PRD 5.3): biodata, then uploads (PDF, progress, replace, an error for a file that is too big or not a PDF), then the consent Checkbox, then submit, then success.
4. **Panel shell** (`/recruitment/panel`): the tab bar filtered by rights, Ringkasan (funnel, today's events, my division's to-do), and the Kandidat table with the side sheet (approve or bounce with a note).
5. **Kalender editor** (Ketua and Acara): month and agenda views, the event dialog (DateRangePicker, wheel TimeField, place, internal toggle, gated stage, kind colour), drag to move, edge-drag to resize, the confirm step when editing a started stage. Seed it with PRD section 3.
6. **Panitia board:** division columns, Asisten list to drag from, Koordinator star, Ketua seat (Pencipta/Admin only).

## Notes to write in the mockup
- Which kit components each screen reuses.
- What opens in a dialog, drawer or popover versus what stays inline.
- The motion spec for the banner edge, journey path, envelope chip and calendar bar hover: duration, easing, and what Low Detail turns off.

## Publish
- Publish as an Artifact (load `artifact-design` first). Republish to the same URL on revisions.
- Give the user the link and a short list of the calls you made that they should check.
- Record the URL in `handoffs/01.md`.
- When the user approves, set STATUS.md row 01 to `done (signed off <date>)` and copy every ruling they gave into the memory file `iris-recruitment-oprec-2026.md`.

## Verify
- Render every screen and variant at all four widths with the engine's shot tool, and check them by eye.
- No dashes in the copy.
- Title Case where the rules say so.
- No icons beside labels.
