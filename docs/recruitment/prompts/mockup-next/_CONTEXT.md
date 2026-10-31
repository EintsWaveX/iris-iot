# Shared context for every mockup-next prompt

Read this first. Then read your own prompt (`M1` to `M7`). Everything here was decided with the user (NUE, Immanuel, Pencipta, hakPenuh) up to **mockup Version 16** (28 Oct 2026). Do not re-litigate it.

## What this work is
IRIS Open Recruitment 2026 is being **redesigned as a mockup, not by removing features**. The mockup is a vanilla Preact + htm app with a picker. It is published as one Claude artifact. **No real app code (`apps/web`) is touched until the user says S1 to S6 are all decided.** Nothing here is committed or pushed unless the user asks.

- Source: `C:\Users\EintsWaveX\Downloads\design-review\mockups\recruitment\` (open `index.html` or `local.html`).
- Backup of the approved V16 state: `...\mockups\recruitment-v16\` (never edit it).
- Older snapshots: `recruitment-pre-declutter`, `recruitment-pre-s3-merge`, `recruitment-s3`, `recruitment-s4` (the old 15a Wawancara build).
- Published artifact (Version 16): https://claude.ai/artifact/RCXL2f8vcpWhQHhorCeAPz. **Only the main session publishes.** A subagent never publishes.
- Plan docs: `docs/recruitment/PRD.md`, `docs/recruitment/prompts/` (`_RULES.md`, `STATUS.md`, `16-s5-tubes.md`, `17-s6-mengajar-penerimaan.md`).

## Standing rules (from the user and `_RULES.md`)
1. **Keep every feature.** Redesign the UI/UX flow only. Remove or merge before adding. One screen, one job. Guided steps. Mirror the real process.
2. **Laptop first** (check 1280x720, 1440x900, 1680x1050 and 1280x600). The primary action must be visible at 1280x600. Phone is checked last.
3. **One design per screen.** A redesign replaces the old screen in place. No parallel "new" group. Old ids stay only as aliases (`P9.ALIAS` in `core.js`). No stand-ins: embed the real feature components. Before retiring a screen, audit its features (parity).
4. **Judge the whole flow** (clicks, screens, key presses), not only the paint.
5. **Colour, motion and icons distinguish.** Proper alignment and spacing. Contrast must hold in dark and light themes.
6. **Write "CaAs"**, never "CaA".
7. **Surfaces:**
   - Prefer a **huge centered modal** over a drawer or popover. Broader space is better.
   - **Side drawers only for three cases:** the Cutting candidate, the Berkas review queue, and the Malam Ujian seat and Room Setup (`<P9.Drawer side ...>`).
   - A `P9.Drawer` without `side` renders as a centered modal. Use `<P9.Pop modal title=...>` (add `modal="lg"` for wide) for lists and forms. Keep `P9.Pop` as a popover only for small menus and short notes.
8. **The Daskom DOCX is only a reference template**, not the real thing. Never hard-code questions, rubric rows, parameters, crew sizes or case rules. Make them **defaults the Akademik can edit** (see `R4: Template Pertanyaan`).
9. **Candidate fog:** a CaAs sees only what they need now. Stages passed are clear, the current one glows, the rest sit under mist.
10. **The numeric 1 to 5 level per parameter** on the interview sheet is our own proposal (private to each examiner until both send). Reuse it for any new sheet unless the user says otherwise.
11. Mandarin for new strings is **not mandatory**. Write `L(id, en)` pairs. Skip `i18n-zh`.
12. No credentials in code. Never type a password. Do not run prod migrations or deploy. No `git add .`, no commit, no push.
13. `_RULES.md` rule 6 says no subagents. **The user has explicitly allowed subagents for this mockup work**, one agent per prompt, with the file ownership below.

## Decisions already made (do not ask again)
- Late grace: **10 minutes**. Makeup (Susulan) days follow the **Calendar** (Interview Susulan: Friday 4 Dec 2026; Mengajar Susulan: Saturday 26 Dec 2026).
- Any **active Asisten** may be an examiner. The mockup assumes about 25 active Asisten.
- A candidate sees the slot picker only when their **journey is at that stage**.
- **Cutting is one screen with a Tahap tab per case** (Berkas, Tes Tulis, Wawancara; Tubes, Mengajar next).
- An interview shift is **1h45** (2h at most): one CaAs with two interviewers in a booth, booths side by side. This is a default.
- Mockup pickers use `R.S2`, `R.S4` slot data and the `cfg` prop pattern (see below).

## The code (where things are)
All under `...\mockups\recruitment\app\`. Load order is in `index.html` (and `local.html`).

| File | What |
|---|---|
| `screens-rec1.js` | R1: Home, Daftar, panel shell `PanelPage` (:826), `Funnel` (:687), `Todo` (:695), `Today` (:705), `Kandidat` (:737), `CandSheet` (:714), `KalenderTab` (:757), `PanitiaBoard` (:778), `Journey` (:270), `ROLES` (:677). Exports `P9.REC1` (:901) |
| `screens-rec2.js` | candidate side of S2: envelope `RevealStage` (:261), `PickDialog`, `ChangeDialog`, `PickCard` (take a `cfg`), `Inbox`, `ThanksCard`, `NextCard2`. Exports `P9.REC2` (:780) |
| `screens-rec2p.js` | Panitia side of S2: Berkas queue `BerkasSheet` (:330), `Board` (:493), `Requests` (:415), `SlotSetup` (:456), `autofill` (:600), QR `Projector` (:649). Exports `P9.REC2P` (:631) |
| `screens-rec3*.js` | R3: candidate test screens, Bank, Panitia console (old components kept as sources) |
| `screens-rec4.js`, `screens-rec4b.js`, `rec4-data.js`, `rec4.css` | R4 Wawancara: Plotting extras (`N7.R4`), Slotku, `Sheet`, `Kasus`, `Penilaian`, `Template`, `Params`, `WawTab` |
| `screens-rec7.js` | `P9.N7` (:16), Head (:110), Swap (:43), Hold (:148), Malam Ujian, `AREA` colour map (:~25) |
| `screens-rec7b.js` | `Plot` (:26) with the Tahap dropdown, Fog CaAs page `Fog` (:187), Bank tab |
| `screens-rec7c.js` | `Cutting` (:45, `DEF` :40, `wpool` :26, `ANN` :41), Latihan mode, `N7.CaasTools` (:205), `CAT` envelopes |
| `rec7.css` | the newest styles (keyframes prefixed `n7-`), side-drawer and modal rules at the end |
| `rec-data.js` | `R.EVENTS` (the Calendar), `R.PANITIA`, `R.DIVS`, `R.CANDIDATES` |
| `core.js` | `P9.ALIAS`, `P9.Dialog`, `P9.Drawer`, `P9.Pop` (with `modal`), `P9.variant` / `P9.setVariant` |
| `main.js` | `ORDER`, `GROUP`, `TITLE` for the picker; `P9.OLD` keeps retired screens as component sources |
| `shell.js` | `GROUPS` (q1 R1, q2 R2, q3 R3, q4 R4) |

Patterns to copy:
- **Panel tab:** `N7.tabs.<name> = (role) => html`...``; add the area colour to `AREA` in `screens-rec7.js`; add a tab entry to `P9.REC2_TABS` (see the end of `screens-rec4b.js`).
- **Registered screen:** `P9.reg({ id, group, title, render, items, variants, notes })`, then add the id to `ORDER` and `GROUP` in `main.js`. Panel screens set `P9.state.v.r1Tab` and render `P9.REC1.PanelPage` with `fixedTab`.
- **Stage config for the shared pickers:** `PickCard`, `PickDialog`, `ChangeDialog` take `cfg` (see `N7.R4.cfgCaas()` in `screens-rec4.js`). `R2P.Board`, `R2P.Requests` take a stage `cfg` (see `cfg4` in `screens-rec4.js`).
- **Rubric sheet:** reuse the R4 `Sheet` pattern in `screens-rec4b.js` (three steps, shared answers and conclusions, private levels, never-dead send button, special cases dialog, edit/withdraw, offline draft).
- **Template editor:** `Template` and `Params` in `screens-rec4b.js` write through to the data.
- **Cutting stages:** extend `DEF`, `ANN`, the tab list and a pool builder like `wpool()` in `screens-rec7c.js`.
- **Variants:** use `P9.variant(key, def)`. Every state of a screen must be reachable from the picker's variant menus (rule: restore every state menu).
- **Calendar events** for the later stages are in `R.EVENTS` (`rec-data.js`): Techmeet Tubes 12 Des; Pengerjaan Tubes 13 to 17 Des 18:30 to 22:00 Lab IRIS; Presentasi Tubes 18 Des; Cutting Tubes 19 Des (internal); Pengumuman Tubes 20 Des 12:00; Pilih Jadwal Mengajar 20 Des 19:00 to 21 Des 12:00; Pleno Mengajar 21 Des; Tes Mengajar 22 to 24 Des 18:30 to 21:00 TULT; Susulan Mengajar 26 Des; Cutting Mengajar 4 to 5 Jan 2027; Pengumuman Mengajar 6 Jan 2027 12:00. There is **no Penerimaan event** yet.

## How to test (always, before saying done)
Playwright scripts are in `docs/recruitment/prompts/mockup-next/tools/` (copy them to your scratchpad; they use `playwright-core` from `C:\Users\EintsWaveX\Documents\WebApps\DMagis\package.json` and Chromium at `C:\Users\EintsWaveX\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe`; they open `file:///C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment/index.html`).
- `sweep8.mjs`: every screen, every variant option, both themes. **Must print `bad: 0`.**
- `click9.mjs`: parity clicks across S1 to S3. **Must still pass.**
- `r4flow.mjs` / `r4extra.mjs` / `r4side.mjs`: templates for flow tests (variants persist between steps, so reset defaults and navigate to `r1-home` first, then set variants, then `P9.set({ screen })`).
- Write your own `<stage>flow.mjs` the same way: open each state, click through the main flow, check no `pageerror`, take screenshots at 1440x900 and 1440x640 (and the light theme), and **look at the screenshots**.
- Quirks: the page runs in quirks mode (no doctype); the app frame is 1280 wide inside the viewport; use `P9.set({width:1280, short:H<800, lang:"id", theme})`.
- Bash heredocs with apostrophes break in this harness: write scripts with the Write tool, then run them.

## File ownership (so agents do not collide)
Each prompt names the files its agent may **create or edit**. Everything else is read-only for that agent. If you need a hook in a shared file (`main.js`, `shell.js`, `index.html`, `local.html`, `screens-rec7.js` AREA, `screens-rec7b.js` Plot, `screens-rec7c.js` Cutting/CaasTools, `rec-data.js`), **do not edit it. Write the exact change into your report under "Hooks for the main session"**, and the main session applies all hooks in one pass. Exceptions are named in your prompt.

## Done means
- `sweep8.mjs` prints `bad: 0`, `click9.mjs` passes, your flow test passes in dark and light at 1440x900 and 1440x640.
- Every state is reachable from a variant menu; `notes` on each screen explain the design in English (like the R4 screens).
- A report with: what you built, files touched, hooks for the main session, parity audit (what the old screen had, where it lives now), open questions for the user, what you could not verify.
