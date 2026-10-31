# Rules every recruitment session follows

Read this file first, then your own prompt file. If anything here conflicts with your prompt, the prompt wins for its own scope. The user's direct instructions win over both.

## Session protocol
1. **Check prerequisites.** Open `STATUS.md`. Every prompt listed under your prompt's **Needs** must show `done`. If one doesn't, stop, say which is missing, and do nothing else. A prompt marked `signed off` needs the user's explicit approval recorded in STATUS.md (mockups).
2. **Claim it.** Set your row in STATUS.md to `running`, with the date and time (WIB) and your session name. Commit nothing yet.
3. **Read your inputs:** `PRD.md`, `ARCHITECTURE.md`, `EXAM-ENGINE.md` (once it exists), the handoffs of your prerequisites in `handoffs/`, and the files your prompt names. Read the real code before you trust any path in these docs. They were written on 2026-10-23 and may be out of date.
4. **Work only in your owned paths** (listed in your prompt). If you need a change outside them, message the owner session with SendMessage (find it with ListAgents). If it isn't running, make the smallest change and list it in your handoff under "Touched outside my paths".
5. **Finish:**
   - Write `handoffs/NN.md` using the template in `handoffs/README.md`.
   - Set your STATUS.md row to `done`, with the commit hash(es), or to `blocked` with the reason.
   - Then tell any running dependent session that you're done (SendMessage).
6. **No subagents and no workflows.** You do the work yourself in this session.

## Repo and git
- **Repo:** `C:\Users\EintsWaveX\Documents\WebApps\iris-iot`, branch `phase9-global-and-asisten` (the working branch). Deploy = fast-forward push to `main`, and **only when the user says go**:
  ```
  git fetch -q origin && git merge-base --is-ancestor origin/main HEAD && git push origin phase9-global-and-asisten:main && git push -q origin phase9-global-and-asisten
  ```
  If unrelated unfinished work sits on the branch, ship from a temporary worktree with a cherry-pick instead.
- **Committing:** stage paths **explicitly**, never `git commit -a` or `git add .`. Keep the rig-only `apps/web/src/lib/db.ts` patch and `apps/web/public/rig-test/` out of every commit.
- **Commit message:** `web: ...` / `relay: ...` / `docs: ...`, written as plain prose of what changed and why, ending with the attribution lines the system gives you.
- **The PC agent** lives in a different repo: `C:\Users\EintsWaveX\Downloads\IRIS ASO\pc\agent` (deploy = push its `main`; the agent updates through the signed bundle and Updates card). The same staging rules apply.
- **Migrations:** the next free number is `0048`. Check `apps/web/drizzle/` first, since another session may have taken it. Production migrations are applied **by hand after a `pg_dump`**, and only on the user's go.
- **No credentials in code**, ever (no passwords, tokens, MQTT passwords, rig suffixes). Run `PYTHONUTF8=1 python scripts/check_secrets.py` before every commit.

## Build and verify
- **Checks:** `npm run check`, `npm run lint` and `npx vitest run --maxWorkers=2` in `apps/web`, each as its own step. Prettier must be clean.
- **Rig:**
  - Postgres `iris_e2e` on :54329 (start it with `pg_ctl -D ~/Downloads/design-review/rig/pgdata -o "-p 54329" start`)
  - rig API :8790 (`sh ~/Downloads/design-review/rig/restart-rig.sh`, restart after any `api/` change)
  - Astro `npx astro dev --config astro.real.config.mjs --port 4321`
  - relay `npx wrangler dev --port 8788` in `apps/relay` (only one wrangler at a time)
- **Playwright:** `createRequire(".../WebApps/DMagis/package.json")("playwright-core")`, Chromium at `~/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`.
- **New rig scripts** go in `~/Downloads/design-review/rig/rec_*.mjs`.
- **Shared rig:** other sessions may be using it. Coordinate before you reset data or flip session state, and say so when you do.
- **Screenshots** at 7 widths: 360×640, 390×844, 768×1024, 820×1180, 1280×720, 1440×900, 1680×1050, plus one short screen (1280×600). Check them by eye.
- **Before you say done on any UI work:** run `rig/pop2.mjs` and `rig/pop4.mjs` (real clicks on icon buttons, popovers, dialog X).
- **Before any outward step (deploy, sharing links):** run the leak audit as a signed-out visitor and as a Praktikan (`leak_api.mjs`, `leak_pages.mjs`, `idor_probe.mjs`, a bundle scan). A candidate must never reach another candidate's data, Panitia data, the question bank or answer keys.

## UI rules (IRIS web, standing)
- The **kosmik baseline** look. Reuse the kit (`src/components/ui/*`) and its highlights; no home-made glows. **No native browser widgets** (selects, date and time pickers, alerts, confirms): use the kit's Dropdown, DateRangePicker, wheel TimeField, Dialog and Confirm.
- **Title Case** for headers, tabs and buttons; sentence case for body text. **No em or en dashes in UI copy.** Casual Indonesian voice. en and zh strings too (zh third; see the Mandarin glossary memory). Full dates in copy.
- **No icon beside a label** (ghost buttons excepted). Badges are wide enough and never wrap. Toolbars line up.
- **Consent is a Checkbox**, not a switch. Switches fill equally.
- **Unique `@keyframes` names** (prefix `rec-`).
- **No layout guess on first paint** (no flash).
- **Live, not waiting:** subscribe to siaran topics; never poll on a timer when a change signal exists.
- **Real desktop layouts**, not stretched mobile. Short screens scale down.
- **Motion** is rich but honours Low Detail and `prefers-reduced-motion`. GSAP 3.15 is available.
- **Redesigns never delete a feature,** but they may move, merge or fold surfaces. A new surface must replace or absorb an old one.

### Simplicity rules (user, 2026-10-27; they apply to Asisten and CaAs screens alike)
- The problem is navigation and control, never the feature set. Keep every feature; reorganize it.
- **One screen, one job**, one primary action, and the top of the screen answers "what do I do now?". Detail goes one tap away in a dialog, drawer or popover.
- **Heavy-task controls (exam rooms, consoles, plotting) run as guided steps** (prepare, run, review), not as many tabs and panels at once.
- **Mirror the real process** the lab already uses (the Wawancara DOCX form) before inventing an engine, scores or averages.
- **Calendar, Candidates and Committee are the bar.** If a screen is busier than those, simplify it before shipping.
- **The user sees each screen early,** and judges "can I operate this without help", not only the look.
- **Laptop and PC first:** 1280×720, 1440×900, 1680×1050 and 1280×600 before phone widths.
- **Proper alignment, padding, margin and spacing** (user, 2026-10-27): shared edges and baselines, one spacing scale, identical padding and gaps on repeated items. Check by eye at the laptop sizes before saying done: nothing cramped or floating, no uneven gaps, no clipped or wrapping labels.
- **Colour contrast in both themes** (user, 2026-10-27): the dark and light themes can differ, so check each. Text and icons at least 4.5:1 (3:1 for large text and UI edges) on their surface, accents and tinted fills included; ok, warn and danger colours must still read on light surfaces. Use theme tokens, never a literal that only works in one theme.
- **Tell things apart with colour, motion and icons where it helps** (user, 2026-10-27): a stage, a state, a danger zone or the primary action should read at a glance. Stay inside the kosmik look and honour Low Detail and reduced motion. This overrides the "no icon beside a label" rule above: icons are allowed when they help someone find or tell apart a control.
- **Copy:** run the `stop-slop` skill over any long copy, and the `design:ux-copy` skill for microcopy.

## Skills
Load the skills your prompt lists with the Skill tool before you start that kind of work. Core process skills:
- `superpowers:executing-plans` (build sessions)
- `superpowers:test-driven-development` (pure logic, API rights)
- `superpowers:verification-before-completion` (always, before saying done)
- `superpowers:systematic-debugging` (any failure)

### Redesign discipline (added 2026-10-27, after the S1/S2/S3 review)
12. **One design per screen.** A redesign replaces the old screen in place and keeps its R1, R2 or R3 slot. Never leave a "new" group beside the old one in the picker; the old ids keep working only as aliases.
13. **No stand-ins.** A rebuilt screen embeds the real feature components (editor, hotspot rows, grading sheets, envelope scene, slot picker). If you cannot embed one, say so; do not draw a smaller one and call every feature kept.
14. **Parity audit before retiring an old screen.** Take the old screen's notes (they list its features), check each against the new one, port what is missing, and record the result. A restyle that drops a feature is a regression, not a simplification.
15. **Judge the whole flow, not just the paint.** Count clicks and screens for the real job (S3: check-in went from 3 screens and 3 clicks to 1; the draw from 2 presses to 1; the Live Coding build from two stacked rows to one next step). Colour and motion come after.
16. **Laptop first means the primary action is visible at 1280x600.** Sticky it if it must be.

The user's UI judging lens is **`emil-design-eng`**. Use it on every screen you build or review.

## Memory
Project memories live in `C:\Users\EintsWaveX\.claude\projects\C--Users-EintsWaveX-Downloads-IRIS-ASO\memory\`. The recruitment decisions are in `iris-recruitment-oprec-2026.md`. Add to that file (don't make a new one) when the user rules on something new.
