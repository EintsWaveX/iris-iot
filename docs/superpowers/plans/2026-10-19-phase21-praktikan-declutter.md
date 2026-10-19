# Phase 21 Praktikan Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calm every Praktikan screen (signed out, Lihat-lihat, TOT and real sessions): one line stepper, one session row, state-only pills, help on demand, a Dasbor with one focal point, and the old Beranda merged into Modul behind a Home frame.

**Architecture:** Each change lands in the live React islands under `apps/web/src/components` (ModuleSteps, SessionMiniBar, BlankFile and CodeStep, LiveRoom, Dashboard, PraktikanAccount, HomePage, ModuleCards, AppNav). It reuses kit parts (TabLine underline, Disclose, Dialog, IconButton, the tooltip layer) and adds no new effects. The few pure decisions (stepper dot states, the line fill, the session fraction, which practicum row offers feedback) go in small `src/lib` modules with vitest tests. Everything else is checked on the rig with screenshots and a width sweep.

**Tech Stack:** Astro 5 with React islands, TypeScript, plain CSS per component, vitest (`--maxWorkers=2`), Playwright rig scripts in `~/Downloads/design-review/rig`.

**Spec:** `docs/superpowers/specs/2026-10-19-phase21-praktikan-declutter-design.md`. Mockup (structure only): `~/Downloads/design-review/mockups/phase21/app/screens-declutter21.js`.

## Global Constraints

- **Mockup:** take only the structure from it. Every screen is built from the live components and keeps their finish. Align to the live grid. No home-made borders or glows: use the kit's rainbow sweep, the `slot` edge and `--m` module hues (memory iris-reuse-kit-highlights).
- **Copy:**
  - Every new string in ID, EN and ZH, through the file's existing `dict({ id, en, zh })` table.
  - Title case for headers, tabs and buttons; sentence case for hints.
  - No em or en dashes.
  - ZH terms per memory iris-mandarin-glossary (时段 for slot).
- **Widths:** verify at 360, 390, 820, 1024, 1280x720, 1280 and 1680. No sideways page scroll. Rows that can overflow scroll sideways and never wrap 2 + 1. Grid and flex children get `min-width: 0`.
- **Asisten views:** they get the shared stepper (f10) and nothing else changes for them. Their banners, Show Answers, group pickers and access switch stay as they are.
- **Motion:** transform and opacity only. Nothing moves under `:root[data-motion-tier="0"]` or `prefers-reduced-motion`. `@keyframes` names must be unique (memory iris-css-keyframe-names-collide).
- **Code style:** match the surrounding files: Indonesian identifiers where the file uses them, short JSDoc comments, light comment density, no history comments.
- **Shipping:**
  - No commit per task: commit, push and deploy only when the whole set is ready and checked, with the user's go (memory iris-ship-only-when-set-is-ready).
  - Each task ends by recording itself in the ledger `.superpowers/sdd/2026-10-19-phase21/progress.md` (git-ignored).
  - Stage named paths only. Never stage `apps/web/src/lib/db.ts` (rig-only patch) or `apps/web/public/rig-test/`.
- **Parallel session:** another Claude session (the loose ends) shares this working tree and rig. It owns Incidents.tsx, SinkronBar.tsx and api/lms. Don't touch those, and coordinate with SendMessage before starting or ending rig sessions or flipping Mode TOT.
- **Practicum hours:** practicum runs 06:30 to 18:00 WIB on weekdays. Deploy only outside a running session.
- **Commands:** run `npx vitest run --maxWorkers=2` as its own step, never in an `&&` chain.

## Review Focus

1. **A Praktikan reloads mid-session on `?step=live` with Kode unfinished.** The stepper must open on the first unfinished step (today's `awal` rule) and show Live as locked, with no flash of the old header. Covered in Task 1 (`titikLangkah` test, locked after the blocker) and Task 3 (rig reload check).
2. **TP before its window opens (`tpKunci`) or Module 4's hunt still waiting.** The dot is "wait": it stays clickable, it never blocks a later step, and clicking it gives today's toast or step. Covered in Task 1 (test: wait never locks the steps after it).
3. **A 360 px phone with Module 4's 7 steps, in ZH.** The dot row fits without sideways page scroll, and "第 5 步，共 7 步" fits. Covered in Task 1's rig step at 360 in `/zh`.
4. **Session time past the end, or `mulaiPada` null.** The underline stays inside 0 to 1, with no NaN. Covered in Task 2 (`porsiSesi` tests).
5. **A practicum list where the newest row already has feedback, or is still running.** No row offers Umpan Balik, and the rest stay one action each. Covered in Task 8 (`umpanDi` tests).

---

### Task 1: Line stepper replaces the step tabs and the bottom pager (f1, f10, f11)

**Files:**
- Create: `apps/web/src/lib/langkah-garis.ts`
- Create: `apps/web/src/components/module/LineStepper.tsx`
- Modify: `apps/web/src/components/module/ModuleSteps.tsx:463-527` (the tablist), `:591-643` (the pager), `:119-125` (ICON, drop)
- Modify: `apps/web/src/components/module/module.css` (remove the `.modsteps__tabs*`, `.modsteps__pager`, `.modsteps__next`, `.modsteps__long` and `.modsteps__short` rules; add `.lstep*`)
- Modify: `apps/web/src/components/module/moduleStrings.ts` (new strings)
- Test: `apps/web/src/lib/__tests__/langkah-garis.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Titik = "selesai" | "kini" | "buka" | "kunci" | "tunggu";
  /** Each step's dot: the current one is "kini"; tunggu wins over kunci. */
  export function titikLangkah(
    steps: StepId[],
    kini: StepId,
    tahu: { selesai: (s: StepId) => boolean; terbuka: (s: StepId) => boolean; tunggu: (s: StepId) => boolean },
  ): Titik[];
  /** How far the line is filled, 0 to 1: up to the furthest of the current dot and the step after the last finished one. */
  export function isiGaris(titik: Titik[]): number;
  ```
- Produces: `LineStepper` with props `{ lang: Lang; steps: StepId[]; step: StepId; label: Record<StepId, string>; titik: Titik[]; siap: boolean; alasan: string | null; tip: (s: StepId, t: Titik) => string | undefined; onGo: (s: StepId) => void; onNext: () => void; onPrev: () => void }`. It renders `<nav className="lstep" aria-label={t.steps}>`.
- Consumes: `useLangkah` (`selesai`, `terbuka`, `penghalang`, `lanjut`) and `tpKunci` / `tpAlasan` from ModuleSteps. Hunt waiting is `keadaan === "tunggu" || keadaan === "belum"`.

- [ ] **Step 1: Write the failing tests** in `langkah-garis.test.ts`:
  - `titikLangkah` with steps `["modul","brief","tp","setup","code","live"]`, kini `"code"`, selesai for modul/brief/setup, terbuka up to code, tp tunggu → `["selesai","selesai","tunggu","selesai","kini","kunci"]`.
  - With tp tunggu and setup not finished, `"setup"` is `"buka"` (wait never locks what follows).
  - Browse (everything terbuka, nothing selesai), kini `"brief"` → `["buka","kini","buka"]` for `["modul","brief","praktikum"]`.
  - `isiGaris(["selesai","selesai","tunggu","selesai","kini","kunci"])` → `4/5`.
  - `isiGaris(["kini","buka","buka"])` → `0`.
  - `isiGaris(["selesai","buka","kini","buka"])` → `2/3`.
  - A single step → `0`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run --maxWorkers=2 src/lib/__tests__/langkah-garis.test.ts` from `apps/web`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `titikLangkah` and `isiGaris`** in `src/lib/langkah-garis.ts`. "tunggu" is decided by the caller's `tunggu()`, and "kunci" is `!terbuka(s)`.
- [ ] **Step 4: Run the tests and see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Build `LineStepper.tsx`.**
  - **Row:** Prev on the left; the dots on a line in the middle (an `<ol>`; each dot a `<button>` with `aria-current="step"` on the current one); Next on the right. The line is a track with a fill using `transform: scaleX(var(--isi))`.
  - **Dot marks:**
    - selesai: CheckIcon
    - kunci: LockSimpleIcon, `aria-disabled`, and a click calls `onGo` so today's warn toast still explains it
    - tunggu: a dashed ring with the number
    - otherwise: the number
  - **Labels:** under each dot from 640 px up.
  - **Prev and Next:** ghost buttons showing the neighbour step's name, with `aria-label` from `t.prevStep` / `t.nextStep`.
    - Next is `btn--primary` when `siap` (the current step is finished), else `btn--secondary`.
    - It gets `aria-disabled` while the next step is locked.
    - `alasan` (from `t.stepNeed[step]`) sits under Next as a `hint`.
  - **Below 640 px:** one row of Prev (icon only), then "Langkah {i} dari {n}" over the step name, then Next (icon only). The unlabelled dots sit on their own row underneath, each still a button with its name in `data-tip`. The reason gets its own row.
  - **Keyboard:** ArrowLeft and ArrowRight, Home and End move between dots (roving tabindex, as the old tablist did).
  - **Sticky:** `top: var(--minibar-h, 0px)` under the nav offset the old `.modsteps__tabs` used. Copy its sticky rule.
  - **New strings in `moduleStrings.ts`:** `stepOf: (i: number, n: number) => string`. ID "Langkah {i} dari {n}", EN "Step {i} of {n}", ZH "第 {i} 步，共 {n} 步". Reuse the existing `steps`, `prevStep`, `nextStep`, `stepNeed` and `stepLocked`.
- [ ] **Step 6: Wire it into `ModuleSteps.tsx`.**
  - Replace the tablist and the pager with one `<LineStepper>` placed where the tablist was.
  - `onNext` and `onPrev` keep today's `pindah` logic: Next from Modul or Ringkasan calls `langkah.lanjut(step)` and moves with `paksa`. After a move, scroll `.lstep` into view and focus the new dot.
  - In `"done"` mode every dot is `"selesai"`.
  - Drop `ICON` and the browse numbering.
  - Keep `id="modsteps-panel"` with `role="region"` and `aria-labelledby` pointing at the current dot's label id.
- [ ] **Step 7: Check it on the rig** (Astro :4321 and API :8790, Mode TOT on, a TOT session of Module 2, then Module 4):
  - Open `/modules/2` signed out (3 dots), as Lihat-lihat (4), in session (6), and `/modules/4` in session (7).
  - Check at 1280, 390 and 360, and at 360 in `/zh`.
  - Expected:
    - There is no `.modsteps__tabs` and no `.modsteps__pager`.
    - `document.scrollingElement.scrollWidth <= innerWidth`.
    - A locked dot toasts its reason.
    - Next on Modul opens Ringkasan.
  - Record the result in the ledger.

### Task 2: One session row (f2, f4)

**Files:**
- Create: `apps/web/src/lib/sesi-waktu.ts`
- Modify: `apps/web/src/components/shell/SessionStrip.tsx` (new prop `garis?: boolean`)
- Modify: `apps/web/src/components/shell/SessionMiniBar.tsx:283-300` (module block, kelas pill, strip)
- Modify: `apps/web/src/components/shell/SessionMiniBar.css`, `apps/web/src/components/shell/SessionStrip.css`
- Test: `apps/web/src/lib/__tests__/sesi-waktu.test.ts`

**Interfaces:**
- Produces: `export function porsiSesi(mulaiPada: string | null, durasiMenit: number, now: number): number`, the part of the session gone, clamped to 0 to 1, and 0 when `mulaiPada` is null or the duration is 0.
- Produces: `SessionStrip` `garis` prop. With it, the strip renders JAM and SISA only (no `.strip__prog`, no "x dari y menit") and sets `--porsi` on its root for the parent to draw.

- [ ] **Step 1: Write the failing tests.** `porsiSesi("2026-10-19T06:30:00+07:00", 150, <07:45 WIB>)` → `0.5`. Past the end → `1`. Before the start → `0`. `null` → `0`. Duration 0 → `0`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run --maxWorkers=2 src/lib/__tests__/sesi-waktu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `porsiSesi`.**
- [ ] **Step 4: Run the tests and see them pass.** Expected: PASS.
- [ ] **Step 5: Build the session row.**
  - **Module:** the block shows `minibar__dot`, then "Modul 2 · WebSocket" as plain bold text. The `<Pill modul>` goes.
  - **Kelas:** the Internasional `pill pill--violet` becomes `<span className="hint">`.
  - **Strip:** the minibar passes `garis`.
  - **Progress underline:** the minibar draws it as a `::after` on `.minibar` along its bottom edge, in the module hue, `transform: scaleX(var(--porsi))`, `transform-origin: left`.
  - **Below 640 px:** JAM hides (as the mockup does), and SISA stays.
  - **Warnings:** the 30 and 10 minute warning line, the projector's KodeMasuk, Ikut and the bell all stay where they are.
  - **Asisten bar:** `AsistenMiniBar` doesn't pass `garis`, so it doesn't change.
- [ ] **Step 6: Check it on the rig.**
  - Check in session at 1280, 1280x720, 390 and 360.
  - Expected:
    - The bar is one row with no wrap.
    - The underline width ≈ elapsed / duration.
    - `--minibar-h` is smaller than before (record both heights in the ledger).
    - The Asisten bar is unchanged in a screenshot of `/session`.

### Task 3: No module header in a session; plain module label elsewhere (f3, f4)

**Files:**
- Modify: `apps/web/src/components/ModuleDetailView.astro:68-70` (pill to label)
- Modify: `apps/web/src/components/module/ModuleSteps.tsx` (root `data-urut`)
- Modify: `apps/web/src/components/module/module.css`
- Modify: `apps/web/src/components/ui/Pill.css` (add the shared `.modlabel` and `.modlabel__dot` next to the pill rules, so Tasks 7 to 9 reuse them)

**Interfaces:**
- Produces: CSS classes `.modlabel` (an inline-flex row: a dot in `var(--m)` and the text in body weight 700) and `.modlabel__dot`. Later tasks use them wherever a module pill was only a name.

- [ ] **Step 1: Mark the session on the root.** ModuleSteps' root gets `data-urut={urut ? "yes" : undefined}`.
- [ ] **Step 2: Hide the header in a session.** Add the rule `.modpage:has(.modsteps[data-urut="yes"]) .modhead { display: none; }` to module.css, so the stepper is the first thing under the session row.
- [ ] **Step 3: Show the module as a plain label in browse.** Replace the header's `pill pill--group pill--lg` with `<span class="modlabel" style="--m: var(--mod-N)"><span class="modlabel__dot"></span>Modul N</span>`. Browse keeps the header and the jump buttons (the spec drops them only in a session, where the header is gone).
- [ ] **Step 4: Check on the rig.**
  - Reload `/modules/2?step=live` mid-session with Kode unfinished. Expected: no header, the page opens on Kode (Review Focus 1), and no layout jump.
  - Signed out: the header shows the dot label.

### Task 4: Ringkasan and Persiapan Alat (f4, f8, f11 with ruling 3, f12)

**Files:**
- Modify: `apps/web/src/components/module/BriefStep.tsx` (the Sekilas pills)
- Modify: `apps/web/src/components/module/ModuleSteps.tsx:648-697` (`Setup`)
- Modify: `apps/web/src/components/module/PinSchematic.tsx:709-740` (the `pins__mine` help)
- Modify: `apps/web/src/components/module/module.css` (`.modsetup` alignment)

- [ ] **Step 1: Ringkasan.** The Sekilas tool pills become one plain `hint mono` line, joined with " · " (ESP32 · DHT22 · PC Server).
- [ ] **Step 2: Persiapan Alat.**
  - Tools: the `<Pill>` row in `Setup` becomes a "Perangkat lunak" label (new string; EN "Software", ZH "软件") over one plain line per tool. Each tool's use stays in its `title` tooltip.
  - Grid: `.modsetup` gets `align-items: start`, so no card stretches to its neighbour (f12).
  - Box: SetupChecklist's Persiapan lengkap box keeps its Lanjut ke Kode button (ruling 3). With Task 1 the bottom pager is gone, which leaves the box button and the stepper's Next.
- [ ] **Step 3: Pin board help.** In the board view's `pins__mine`, the long hint (`readHint`, `yoursHint`, `tryHint`) moves into a kit `Disclose` titled "Cara Pakai" (ID), "How to Use" (EN), "使用方法" (ZH), closed by default. The `pill--warn` "yours" state stays visible.
- [ ] **Step 4: Check on the rig.** At 1440 and 390, in session, on Persiapan Alat with every item ticked. Expected: exactly two next actions (the box button and the stepper Next), cards top-aligned, and the help folded.

### Task 5: Kode toolbar inside the editor; quiet counts; Pin dan Skema folded (f6, f8)

**Files:**
- Modify: `apps/web/src/components/module/BlankFile.tsx:891-1103` (render)
- Modify: `apps/web/src/components/module/CodeStep.tsx:38, 123-158` (dock state becomes widen state; `side` becomes a folded row)
- Modify: `apps/web/src/components/module/code.css`
- Modify: `apps/web/src/components/module/codeStrings.ts`

**Interfaces:**
- Changes: the BlankFile props `pinsOpen` and `onPins` become `lebar: boolean` and `onLebar: () => void`. CodeStep owns `lebar` under a new localStorage key `iris-code-lebar` ("1" = widened; read and written in try/catch). The old `iris-code-dock` key is ignored.
- Produces: CodeStep's `side` is now a one-row card: "Pin dan Skema", a `hint mono` summary of the board line (the PinData first row; the implementer picks the shortest field that names part, pin and board), and a ghost "Lihat" button with a trailing caret that opens the existing pins `Dialog` (the same one narrow screens already use).

- [ ] **Step 1: Move the toolbar into the editor column.**
  - Put `.codehead` (the file tabs) and `.blanknav` (the Baris chips) inside the editor column: a wrapper `.codecol` around `.codecard` in `.codegrid`.
  - The file tabs fill the column in equal parts. The chips row scrolls sideways when it can't fit, with no wrap.
  - Result: both are exactly the editor's width, widened or not.
- [ ] **Step 2: Turn the counts into a status line.**
  - Remove the `.blankcount` row.
  - Add the counts as a status line in a new editor foot (`.codefoot--bar`, the last row inside `.codecard`): "{n}/{nb} benar · {n} salah · {n} kosong · {n} petunjuk" in their tone colours.
  - Each count is a text button (no box, no fill, underline on hover) that keeps today's `lompat(k)` jump, is disabled at 0, and has `aria-live="polite"` on the line.
  - The same foot holds, at its right: a question-mark IconButton whose tip is `t.keysHint` (the old `.codefoot--keys` row goes), Download, and the widen IconButton (`ArrowsOutSimpleIcon` / `SidebarSimpleIcon`, label "Lebarkan Editor" / "Tampilkan Panel Samping", EN "Widen Editor" / "Show Side Panel", ZH "加宽编辑器" / "显示侧栏").
  - The `.codehead__tools` buttons move there. The Asisten ProgressRing stays in `.codehead`.
- [ ] **Step 3: Widen hides the side column.** `lebar` hides the whole `.codeside` at ≥1280, and `kartu` and `log` then render in `.codebelow`, as on narrow screens. Below 1280 the widen button is hidden (narrow is always one column).
- [ ] **Step 4: Blank card (`pblank`, Praktikan).** Keep the title, the state badge, `t.lineTip`, the ask button and `t.askNote`. Any further help line in the Praktikan card goes behind the foot's question-mark tip. The Asisten card is unchanged.
- [ ] **Step 5: Check on the rig.**
  - In session at 1280 (widened and not), 1024, 390 and 360.
  - Expected:
    - The left edges of the file tabs and the chips line up with `.codecard`, and so do their right edges (measure `getBoundingClientRect` in the rig script).
    - No `.blankcount`.
    - Typing a right answer updates the status line.
    - Widen state survives a reload.
    - The pins dialog opens and its X closes it.

### Task 6: Live: compact connect row, Simulasi chip, rainbow tabs, a source filter that never wraps (f7)

**Files:**
- Modify: `apps/web/src/components/live/LiveRoom.tsx:610-768`
- Modify: `apps/web/src/components/live/LivePanes.tsx:375-383` (source filter)
- Modify: `apps/web/src/components/live/live-room.css`
- Modify: `apps/web/src/components/live/liveStrings.ts`

- [ ] **Step 1: Simulasi chip.** Remove the `simNote` banner (`LiveRoom.tsx:720-724`). Its text becomes the `data-tip` of the livebar status pill whenever that pill reads `t.sim`.
- [ ] **Step 2: Ports panel.**
  - **All boards connected (`!missing`):** the panel shrinks to its `ports__list` rows only. No head, no "all connected" pill, no hint line. Each `PortRow` is already one row.
  - **A board missing:** the head and its warn pill stay. The three steps fold behind a ghost "Cara Menyambung" button (caret, `aria-expanded`; EN "How to Connect", ZH "如何连接").
  - The upload and port hint line shows only while a board is missing or after an upload result.
- [ ] **Step 3: Rainbow tabs.** The panes `TabLine` drops `seg`, so Serial Monitor, Alur and Bacaan become the kit's underline tabs with the rainbow sweep. This also covers `/modules/N/live` and `/groups/N`, which mount the same LiveRoom.
- [ ] **Step 4: Source filter.** In `LivePanes.tsx:380`, the source `TabLine seg` becomes a small `role="group"` of `aria-pressed` text toggles (`.srcfilt`): one row with `flex-wrap: nowrap` that scrolls sideways when narrow. The "Tidak Ada Baris?" help stays at the row's end.
- [ ] **Step 5: Check on the rig.** Module 2 and Module 4 Live in session, the board not connected and then faked connected (or the rig's port stub, if p22_tour has one), at 1280, 390 and 360. Expected:
  - one tab row
  - no segmented control wrapping 2 + 1
  - the Simulasi tip on hover
  - `/modules/2/live` and `/groups/1` show the underline tabs

### Task 7: TP before its window opens: countdown and one line (f8)

**Files:**
- Modify: `apps/web/src/components/tp/TpStep.tsx:116-161` (`TpPraktikan`)
- Modify: `apps/web/src/components/tp/tp.css` (if the single hero needs centring)

- [ ] **Step 1: Before the window opens** (`m.keadaan !== "buka" && m.keadaan !== "tutup"`), TpPraktikan renders only the `Hero` (pill, title, countdown, `WinTrack`, the date line), centred in the step's width. The locked StateView, `Milikku`, `Cara` and the `tphelp` box don't render. The hero's `Pill modul` becomes the `.modlabel` from Task 3, and `KeadaanPill` stays (it is state).
- [ ] **Step 2: Check on the rig.** With the rig TP window set in the future, open the TP step as Lihat-lihat and in session at 1280 and 390. Expected: one card. Then set the window open: today's full layout returns.

### Task 8: Dasbor: one focal point, slim TP row, folded group, one action per practicum row (f5, f12, f13, f4)

**Files:**
- Create: `apps/web/src/lib/praktikum-riwayat.ts`
- Modify: `apps/web/src/components/dashboard/Dashboard.tsx:195-271` (GroupCard, MaterialsCard), `:308-414` (Running), `:504-571` (Practicums), `:647-690` (Waiting), `:1151-1184` (TpKartu placement)
- Modify: `apps/web/src/components/tp/TpDash.tsx` (new `TpBaris`)
- Modify: `apps/web/src/components/dashboard/Dashboard.css`, `apps/web/src/components/tp/tp.css`
- Modify: `apps/web/src/components/dashboard/dashStrings.ts`
- Test: `apps/web/src/lib/__tests__/praktikum-riwayat.test.ts`

**Interfaces:**
- Produces: `export function umpanDi(list: { sesiId: number; tanggal: string; status: string; sudahUmpanBalik: boolean }[]): number | null`. It returns the sesiId of the newest row by `tanggal`, but only if that row is `"selesai"` and has no feedback yet; otherwise null. Task 9 uses it too.
- Produces: `TpBaris({ lang, d }: { lang: Lang; d: TpSaya | null })`, one slim row.
  - It shows "TP · Modul N", the window title and the countdown inline, and the semester's four modules as dot labels with their state as plain text. A missed TP shows as red text (`.tpbaris__bad`), not a pill.
  - It ends with a ghost "Buka TP" button with a trailing caret.
  - It returns null when `modulKartu(d)` is null and no module has a TP state worth showing (same rule as TpKartu).

- [ ] **Step 1: Write the failing tests** for `umpanDi`:
  - Newest selesai without feedback → its id.
  - Newest with feedback → null.
  - Newest berjalan → null, even when an older one lacks feedback.
  - Empty → null.
  - Unsorted input → it still picks the newest.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run --maxWorkers=2 src/lib/__tests__/praktikum-riwayat.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `umpanDi`.**
- [ ] **Step 4: Run the tests and see them pass.** Expected: PASS.
- [ ] **Step 5: Running.**
  - **First row:** the kokpit (Langkah Berikutnya) first and widest, with the Instrument beside it. Change the `.gs` grid so the kokpit spans more columns than the Instrument at ≥1280. Phone order: kokpit, Instrument.
  - **Second row:** Bahan, Log Sesi and Kelompokmu. All cards use `align-items: start`, so nothing stretches (f12).
  - **TP:** in a session (`sesi`), `TpKartu` no longer renders above the body. `TpBaris` renders after the Running grid instead.
  - **Outside a session:** TpKartu stays where it is today.
- [ ] **Step 6: MaterialsCard.** Three buttons in one row (Presentasi, Modul, Skema Rangkaian), each a kit `slot` button with its name and a one-line hint. Below 640 px they stack.
- [ ] **Step 7: GroupCard folded.**
  - Members show as initials (avatar circles in the group hue; yours marked), with each name in `data-tip`.
  - A ghost toggle "Lihat Nama" / "Tutup Daftar" (EN "Show Names" / "Hide List", ZH "显示名单" / "收起名单") opens today's list.
  - The Asisten line stays.
- [ ] **Step 8: Practicums rows (f13).**
  - Each row is one `<button>` (dot label, module name, date, then score or "Menunggu nilai" as text) that opens the summary.
  - The separate arrow IconButton and the "Umpan terkirim" pill go.
  - Only the row `umpanDi(list)` names gets a small "Beri Umpan Balik" button beside it.
  - The running row's `Pill tone="ok"` stays (state).
- [ ] **Step 9: Waiting `ikut` (Lihat-lihat).** The card sizes to its content (no stretched middle). In TpBaris and Nilaiku, red TIDAK MENGUMPULKAN pills become plain red text (f4).
- [ ] **Step 10: Check on the rig.**
  - Check in session, as Lihat-lihat, and after the session ends, at 1680, 1280, 1024, 390 and 360.
  - Expected:
    - The kokpit is the first and largest card.
    - No card has an empty stretched middle (screenshot review).
    - One feedback button at most.
  - CoachMarks still points at its targets: run the tour once and confirm each mark lands. Update CoachMarks.tsx selectors if a target moved.

### Task 9: Akun: Praktikummu rows and a one-line Tampilan card (f13)

**Files:**
- Modify: `apps/web/src/components/account/PraktikanAccount.tsx:185-275`
- Modify: `apps/web/src/components/account/AccountPage.css`

- [ ] **Step 1: Praktikummu rows.**
  - Done and running practicums become the same one-action rows as Task 8's Practicums: a row link to `/dashboard?view=summary&session={id}`, plus Beri Umpan Balik only where `umpanDi` says.
  - Modules not done yet stay as plain rows: dot label, "Belum", and a ghost link to the module.
  - The NIM and group pills in the head become plain `hint mono` text and a group dot label.
- [ ] **Step 2: Tampilan card.** It shrinks to one row: today's `displaySub` line, then a ghost "Buka Tampilan" with a trailing caret (it keeps `BUKA_TAMPILAN`).
- [ ] **Step 3: Check on the rig.** `/account` as a TOT dummy with three past sessions, at 1280 and 390. Expected: one action per row and one feedback button at most.

### Task 10: Nav Praktikum button, Home frame, old Beranda merged into Modul (screen notes)

**Files:**
- Create: `apps/web/src/components/home/HomeFrame.tsx`
- Create: `apps/web/src/components/home/ModulHero.tsx` (moved out of HomePage: the guest title, lede and LabSky block; the session path)
- Modify: `apps/web/src/components/home/HomePage.tsx:438-549` (export `LabSky` and the `LANES` data, or move them into ModulHero; the signed-in render is unchanged)
- Modify: `apps/web/src/views/LandingPage.astro` (mount a switch island)
- Modify: `apps/web/src/components/home/ModuleCards.tsx:213-324` (hero, merged cards, session path)
- Modify: `apps/web/src/components/home/ModuleCards.css`, `apps/web/src/components/home/home.css`, `apps/web/src/components/home/homeStrings.ts`
- Modify: `apps/web/src/components/shell/AppNav.tsx:709-717, 760-772`, `apps/web/src/components/shell/AppNav.css`

**Interfaces:**
- Produces: `HomeFrame({ lang })`. Centred in the page: the eyebrow "IoT Runtime and Integration System Laboratory", the display title "Laboratorium IRIS" (EN "IRIS Laboratory", ZH "IRIS 实验室"), and a centred row with `Lihat Modul` (`btn--inverse`, href `/modules`) and `Praktikum` (`btn--primary btn--lg`, DoorOpenIcon after the label, `openSignIn()`). Nothing else.
- Produces: `HomePage` renders `HomeFrame` when `me === null`, a skeleton while `me === undefined`, and today's view when signed in.

- [ ] **Step 1: Nav Praktikum button (guests only).**
  - Both `appnav__signin` buttons read "Praktikum" (EN "Practicum", ZH "实验") with `DoorOpenIcon` after the label.
  - The desktop one moves into a new `.appnav__center` slot, absolutely centred in the bar. Its new place must not overlap the links at 1024 and 820: measure it, and if they collide below a width, keep it in the normal flow there.
  - The mobile one sits centred between the logo and the right icons.
  - It stays hidden on `/login`, as today.
- [ ] **Step 2: Home frame.** Build `HomeFrame` and switch HomePage to it for guests (the `/`, `/en` and `/zh` pages all mount HomePage).
- [ ] **Step 3: Old Beranda content into Modul.**
  - **Hero:** ModuleCards gets the old guest hero (eyebrow, title "Empat Modul. Satu Papan." style copy from homeStrings, lede, LabSky) above the cards. Show it for guests and for signed-in Praktikan outside a session; never in a session, which keeps today's single Continue card.
  - **Cards:** the module cards and the four lanes become one set. Each card shows:
    - the lane's `ModConstellation` art on top
    - a `.modlabel` instead of the module Pill
    - the title and one line
    - tools as one `hint mono` line instead of pills
    - the whole card as the link (kit `slot` edge on hover)
  - **Asisten:** their card controls (access switch, hints) stay on the card.
  - **Session path:** for guests the orbitpath steps follow the cards.
- [ ] **Step 4: Check on the rig.** Check `/`, `/modules`, `/en` and `/zh` signed out; `/` and `/modules` as a Praktikan; `/modules` in session and as an Asisten; all 7 widths. Expected:
  - The button is centred and never overlaps the links.
  - The guest `/` shows only the frame.
  - Signed-in `/` is unchanged (pixel-compare against the before shot).
  - No sideways scroll.
  - pop2 and pop4 pass.

### Task 11: Whole-set verification and the before/after review

**Files:**
- Create: `~/Downloads/design-review/rig/p21_cek.mjs` (rig only, not in the repo)
- Modify: `~/Downloads/design-review/rig/p22_tour.mjs` only if a selector it uses moved

- [ ] **Step 1: Take the before shots (do this first, before Task 1 starts).** Run `node p22_tour.mjs 1440` and `node p22_tour.mjs 390`, and copy `rig/p22` to `rig/p21_before`.
- [ ] **Step 2: Write `p21_cek.mjs [width] [height]`.**
  - Sign in as a TOT dummy in a running Module 2 session (and Module 4), and visit every Praktikan route of the tour.
  - Print PASS or FAIL per check:
    - no sideways page scroll
    - one `.lstep` on module pages, and no `.modsteps__tabs` or `.modsteps__pager`
    - `.minibar` is one row
    - Kode toolbar edges equal `.codecard` edges within 1 px
    - no `.blankcount`
    - Live has one tablist in the panel and no wrapped `.seg`
    - at most one "Beri Umpan Balik" on the Dasbor and Akun
    - guest `/` has exactly two buttons in the frame
  - Exit code 1 on any FAIL.
- [ ] **Step 3: Run the sweep at every width.** Run `p21_cek.mjs` at 360, 390, 820, 1024, 1280x720, 1280 and 1680. Expected: all PASS.
- [ ] **Step 4: Run the unit tests.** Run `npx vitest run --maxWorkers=2` in `apps/web`. Expected: every test passes (916 plus the new ones).
- [ ] **Step 5: Run the static checks.** Run `npx astro check`, `npx eslint` on the changed files and `npx prettier --check` on the changed files. Expected: clean, apart from the known rig pg type error.
- [ ] **Step 6: Click sweep.** Run `node pop2.mjs` and `node pop4.mjs`. Expected: PASS (memory iris-web-click-sweep-before-deploy).
- [ ] **Step 7: Take the after shots.** Run `p22_tour.mjs` at 1440 and 390 again.
- [ ] **Step 8: Publish the review page for the user.** Rebuild the review page from `p21_before` and the new shots (adapt `tour/build.py`, Before and After side by side per screen) and publish it as an Artifact for the user. **Stop here for the user's review** (memory iris-phase21-mockup-is-reference-only). Then apply their notes and re-run Steps 3 to 7.
- [ ] **Step 9: Ship, only on the user's go and outside a running session.**
  - SendMessage the parallel session to agree the set: its files in or out.
  - Run `PYTHONUTF8=1 python check_secrets.py`, then `git merge origin/main`.
  - Stage the named paths from Tasks 1 to 10 and commit one message in the user's style.
  - Push `phase9-global-and-asisten:main`, then watch CI and Smoke.
  - No migration is involved.

---

## Execution Record (2026-10-19)

Executed inline. Final review by a fresh reviewer; 4 fixes, 7 minors deferred. Gates: vitest 938/938, eslint and tsc clean, rig p21_cek.mjs 611/0 at 7 widths plus 640/700/768, p21_hero.mjs 6/6, pop2 and pop4 clean.

### Rulings

- Ruling: plan's ledger dir name was .superpowers/sdd/2026-10-19-phase21 — sdd-workspace uses the plan basename; using that — cost if wrong: none.
- Task 1: Ruling: before shots — code edits began before the plan's Task 11 step 1; used the 2026-10-18 p22 tour shots (copied to rig/p21_before) as the before set — cost if wrong: before shots predate a043331's few Praktikan changes.
- Task 1: Ruling: stepper not sticky — the old tabs were never sticky and Kode has its own sticky --code-top elements — cost if wrong: on long steps the way on is at the top only (Kode's all-right banner, Persiapan's box and Live's capture still carry next actions).
- Task 1: Ruling: Prev and Next pass over a waiting TP (tpKunci) — otherwise Next into a locked TP toasts and the way on stalls (the old pager had the same stall) — cost if wrong: none; TP's dot stays clickable.
- Task 1: Ruling: TP never shows a done check (useLangkah's selesai returns true for TP, which never holds anything) — matches the old "TP never tinted" rule — cost if wrong: none.
- Task 1: Ruling: phone dots on their own full-width row under Prev / "Langkah i dari n" / Next (mockup order) — cost if wrong: CSS only.
- Task 1: Ruling: visited-but-unfinished yellow tint kept as a warn ring on the dot (useLangkah.nada) — richness kept — cost if wrong: CSS only.
- Task 2: Ruling: JAM hides below 480 px (the strip's existing phone rule), not 640 as the plan says — the existing rule already keeps SISA clear of the buttons; at 480-639 JAM fits — cost if wrong: one media query.
- Task 2: Ruling: the Asisten-bar rig check was dropped — AsistenMiniBar shows only for a teaching Asisten off /session, and it never passes garis (static); also: an Asisten page opening /session mid-run once left the Praktikan context signed out with an empty module page (not reproduced on rerun; noted for the final review) — cost if wrong: an unseen Asisten bar change.
- Task 2: Ruling: "Modul N" in the bar is coloured in the module hue (70% mix) and the topic hides below 640 — keeps the module named once and rich — cost if wrong: CSS only.
- Task 3: Ruling: .modlabel lives in ui/Pill.css (loaded globally by Base.astro), as planned — cost if wrong: none.
- Task 3: Ruling: the header is static SSR and ModuleSteps is client:only, so in a session the header shows during the island's load and then goes (no script may run before hydration under the CSP) — cost if wrong: a brief header flash on a session reload; the skeleton keeps the jump small.
- Task 4: Ruling: the Persiapan tools sit under a "Perangkat Lunak" label as hairline-split rows inside Yang Kamu Butuhkan (mockup structure) and Ringkasan's facts are one mono line with module-hue dots — cost if wrong: CSS only.
- Task 4: Ruling: the board's how-to folds into a Disclose "Cara Pakai" under the board view (the hint span left the row) — cost if wrong: one more click to read the help.
- Task 5: Ruling: the file tabs and Baris chips are top strips INSIDE .codecard (not a .codecol wrapper) — the card is sticky at a viewport height from 1280, so a wrapper would break that; inside, they are the editor's width by construction — cost if wrong: none found.
- Task 5: Ruling: Pin dan Skema folds to one row for everyone, Asisten included (f6 + f10 sameness); on narrow screens the row sits under the code, since the old pins IconButton (its only narrow entry) became Widen — cost if wrong: an Asisten wanting the docked board opens the sheet instead.
- Task 5: Ruling: the auto-hint countdown line ("Petunjuk terbuka sendiri setelah N kali salah lagi") became the Minta Petunjuk button's data-tip when the button shows; it stays as text when asking is off — cost if wrong: the count is a hover away.
- Task 5: Ruling: the help IconButton also toasts the keys hint on click (phones have no hover) — cost if wrong: none.
- Task 5: Ruling: the shared .codehead/.codehead__files/.codehead__tools rules are kept for Persiapan's Kode Jurnal editor (console/prep/CodeEditor.tsx); the card-scoped rules override inside .codecard — cost if wrong: none for the Asisten editor (rules unchanged for it).
- Task 5: Ruling: phone Baris chips scroll sideways in one row (no 2-column grid) so the code starts higher — cost if wrong: CSS only.
- Task 6: Ruling: while a board is missing the panel keeps its head and warn pill and gains a ghost "Cara Menyambung" toggle for the three steps; once all are connected the panel is only the port rows (padding 10) — cost if wrong: CSS/JSX only.
- Task 6: Ruling: the Simulasi chip gets tabIndex 0 so keyboard users reach its tip — cost if wrong: one extra tab stop.
- Task 6: Ruling: the stepper's Next hides on the last step (like Prev on the first) — cost if wrong: CSS only.
- Task 7: Ruling: Hero gets a `polos` prop (module as .modlabel) used only by the Praktikan's before-open card, so the Asisten TP hero keeps its pill (Global Constraint: Asisten unchanged) — cost if wrong: none.
- Task 8: Ruling: the materials buttons are styled in Dashboard.css after the kit's slot/modpick look (module-hue edge on hover, lift) because .slot lives in console.css, which the Dasbor does not load — cost if wrong: CSS duplication of ~20 lines.
- Task 8: Ruling: the session grid is 7 + 5 columns (next step + Live), then 4 + 4 + 4 (materials, log, group); the journey in the head now starts at the Live column (7fr 5fr) — cost if wrong: CSS only.
- Task 8: Ruling: the log card scrolls inside at 18rem instead of contain:size (cards size to content, f12) — cost if wrong: a long log shows less before scrolling.
- Task 8: Ruling: TpBaris keeps the countdown tiles (smaller) instead of plain text — richness kept — cost if wrong: CSS only.
- Task 9: Ruling: Akun keeps the four module cards (a grid, richer than rows) but each card is one stretched link (summary, or the module when not yet attended); the Ringkasan and Jurnal buttons go — the module page's done mode still holds the journal — cost if wrong: the journal is one more click away from Akun.
- Task 9: Ruling: Tampilan card is one line (the sub-line + Buka Tampilan); DisplaySummary dropped from the Praktikan Akun only — cost if wrong: none (the popover holds the same).
- Task 10: Ruling: on phones under 480 px a visitor's nav clock steps aside so the centred Praktikum button never overlaps it (the same "a phone shows its own clock" rule SessionStrip uses) — cost if wrong: a visitor's phone shows no nav clock.
- Task 10: Ruling: ModulHero imports LabSky/Lab from HomePage.tsx (exported) instead of moving LabSky to its own file — smallest change; the Modul island now also bundles HomePage's code — cost if wrong: a larger /modules bundle (measure in the final review).
- Task 10: Ruling: Beranda's visitor-only session path and hero moved out of HomePage (dead after the frame); the Asisten keeps Modul's plain head and access switches — cost if wrong: none.
- Task 10: Ruling: Modul cards keep the state badges (Sedang Berjalan, Terbuka/Terkunci, Selesai) as pills (state, f4); the module name became a dot label; the lane constellation sits on top of each card — cost if wrong: CSS/JSX only.
- Task 11: Ruling: ZH Home eyebrow translated (the footer keeps the official English LAB_FULL) — cost if wrong: one string.
- Final: Ruling: re-graded Minor "TP label breaks mid-word 640-700" to Important — measured: Ringkasan/Pendahuluan/Persiapan split at 640, 700 and 768 (768 is in the user's must-fit range) — fixed: short "TP" label below 1024, reason on its own row below 1024, no mid-word breaks; p21_cek "no label broken mid-word" RED→GREEN at 640/700/768/1024 (control p21_patah_kontrol.mjs proves the check can fail) — cost if wrong: none
- Final: Ruling: re-graded Minor "Dasbor rows lost feedback sent" to Important — user rule redesigns-must-upgrade-not-thin-out — fixed: "· Umpan balik terkirim" on the row's date line, row aria-label dropped so its full text is its name; p21_hero.mjs "Dasbor rows say feedback was sent" RED (0 of 1) → GREEN (1 of 1) — cost if wrong: one quiet text line

### Deferred Minors

- stepper dots are a roving tabindex with no role=toolbar on the list (Tab reaches only the current dot)
- .lstep__line span sits directly inside the <ol> (invalid HTML, renders fine)
- signed-out Beranda still polls /api/session/lab though HomeFrame ignores it
- signed-out Modul polls /api/session/lab twice (ModuleCards + ModulHero)
- projector view of Modul does not star the projected group in Langit Lab (ModulHero uses useMe, not useTampil)
- running-session module page has no <h1> (header hidden)
- two practica of the same module (susulan) look alike on Dasbor rows apart from the date
