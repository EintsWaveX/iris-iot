# Home Bento Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home (Beranda) page in place with a "mission-control bento" layout (hero cell = live Langit Lab), keeping every feature and the IRIS kosmik theme.

**Architecture:** Mockup first (a private HTML Artifact the user signs off), then port into the existing React islands. `HomePage.tsx` gets a bento grid wrapper; `LabSky`, `RoleCard`, the module tiles, `RecBanner` (new optional `slim` prop) and `HeroLab` are restyled through Home-scoped CSS. `DayCard` and `console/day.css` are reused untouched. No backend, schema or new animation library.

**Tech Stack:** Astro 7 + React 19 islands, plain global CSS on kosmik tokens, vitest (node env), Phosphor icons. Work in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-11-16-home-bento-design.md`

## Global Constraints

- Same theme: kosmik tokens (`packages/kosmik/style/tokens.css`, `apps/web/src/styles/theme.css`), dark and `:root[data-theme="light"]`. Never hard-code a colour that works in one theme only; text and icons at least 4.5:1 (3:1 large text and UI edges) in both themes.
- Opaque surfaces only (`.panel`-style); no `backdrop-filter` or translucent cards. The global navbar (`AppNav`) stays glass and is not touched.
- `--sweep-ring` is decoration only, never under text; text-bearing gradients use `--sweep-surface`. One `.panel--key` per screen.
- Every figure and timestamp in `--font-mono`. No em or en dashes in copy. No abbreviations ("Kelompok 3", never "K3"). Title Case headers and buttons. A person is written "Full Name (CODE)".
- Copy: casual everyday Indonesian, tech terms in English (array, input, output). Keep `id`, `en`, `zh` in step in `homeStrings.ts` and `profilStrings.ts`. Write CaAs, never CaA.
- Motion: CSS keyframes and `IntersectionObserver` only; gated by `:root:not([data-motion-tier="0"])`, honours reduced motion and Low Detail. Nothing animates behind a reading.
- No feature removed. All role variants, `RecBanner` kinds (`none`, `visitor`, `praktikan`, `candidate`, `cut`, `panitia`, `asisten`), projector mode, `/lab-profile` edit links stay.
- Laptop first: verify 1280x600, 1280x720, 1440x900, 1680x1050 before 820, 390, 360. Primary action visible at 1280x600. Must work with ten groups (`SPOTS` wraps).
- Edit the main tree, not `.claude/worktrees/hunt-auth-speed`. Work on a new branch `home-bento` in a worktree (use superpowers:using-git-worktrees). Never commit `db.ts` RIG-ONLY changes. No deploy without the user's go.

## Review Focus

1. A very long name in the greeting: the live Asisten name is "Immanuel Eben Haezer Joseph Aletheia"; the H1 must wrap cleanly at 360px and inside the bento cell without clipping.
2. Visitor (guest) has no lab data (lab polling is disabled for guests): the hero's sky cell must show the calm ambient scene, never an empty box or skeleton forever.
3. Banner `kind: "none"` (or still loading past 1.5s): no gap, no layout jump when the banner arrives; the bento starts at the top.
4. Asisten with no slot ("Belum ada slot mengajar") and Praktikan with no session: the role cell still has one clear primary action.
5. Ten groups in Langit Lab, and `zh` strings (longer, Noto Sans SC): labels must not overlap stars or wrap badly.

---

### Task 1: Worktree, DESIGN.md and baseline

**Files:**
- Create: `DESIGN.md` (repo root, via the `impeccable` skill), plus its sidecar if the skill writes one
- Modify: none

**Interfaces:**
- Produces: `DESIGN.md` recording tokens, type, geometry, bento grid rules, tile anatomy, and motion rules derived from the shipped theme; later tasks cite it.

- [ ] **Step 1: Create worktree `home-bento` from `main` with superpowers:using-git-worktrees; run `npm install` there only if the skill says so.**
- [ ] **Step 2: Capture baseline.** From `apps/web` run `npx vitest run` and `npm run check`; record pass/fail so later failures can be attributed. Expected: record the actual result (the repo may already have known failures).
- [ ] **Step 3: Run the `impeccable` skill to document the design system from `docs/design-system.md`, `tokens.css`, `theme.css`, and `home.css`; add a "Home bento" section (cell sizes at 1280, 640, phone; tile anatomy; hero-cell rule).**
- [ ] **Step 4: Commit** `docs: DESIGN.md and Home bento rules`.

### Task 2: Mockup artifact (user gate)

**Files:**
- Create: `<scratchpad>/home-bento-mockup.html` (single self-contained file, kosmik tokens inlined, dark and light toggle, view switcher)

**Interfaces:**
- Produces: the visual contract for Tasks 3 to 8. Cell proportions, slim banner form and the guest sky decision are fixed here.

- [ ] **Step 1: Build the mockup** with views: Visitor, Praktikan (live session, no session), Asisten (next slot, live session, start window), and banner states (visitor, candidate, panitia, none). Use real copy from `homeStrings.ts`, real token values, and worst-case data (the long Asisten name, ten groups). Use `frontend-design` and `impeccable`; motion decisions via `animate`.
- [ ] **Step 2: Self-check** in a browser at 1280x720, 1440x900, 390 in both themes; run `design:accessibility-review` on it. Fix contrast and alignment before showing.
- [ ] **Step 3: Publish as a private Artifact** (Artifact tool, load `artifact-design` first) and give the user the link.
- [ ] **Step 4: STOP and wait for the user's sign-off.** Do not start Task 3 until they approve or send changes; loop on this task until approved.

### Task 3: Bento shell and Langit Lab hero cell

**Files:**
- Modify: `apps/web/src/components/home/HomePage.tsx` (the signed-in `.home10` block, `LabSky` at ~311)
- Modify: `apps/web/src/components/home/home.css`

**Interfaces:**
- Consumes: approved mockup; existing `LabSky({ lang, lab, mine, ... })`, `ModConstellation`.
- Produces: a grid wrapper `.hb` with named cells `.hb__greet`, `.hb__role`, `.hb__sky`, `.hb__mod` (CSS grid, 12 columns at 1280+, 2 at 640+, 1 on phones). `LabSky` keeps its props and exports; its quiet state renders the four constellations as an ambient scene.

- [ ] **Step 1: Add `apps/web/src/lib/__tests__/home-strings.test.ts`** asserting that every key of `H.id` also exists in `H.en` and `H.zh`, and that no `H[lang]` string contains an em or en dash. (Read the `dict()` export shape in `homeStrings.ts` first.) Run `npx vitest run home-strings` and confirm it passes against the current strings (it is a guard, not a red test).
- [ ] **Step 2: Replace the `.home10__top` two-column layout with the `.hb` grid** in `HomePage.tsx`; move `LabSky` into `.hb__sky` as the double-height hero cell. Keep the skeleton, "Langsung" pulse and projector-mode behaviour.
- [ ] **Step 3: Restyle `LabSky` quiet ("Sepi") state** to the ambient scene from the mockup; keep the `skyQuiet` line.
- [ ] **Step 4: Verify.** `npx vitest run` (contrast, motion-rules, abbreviations, home-strings) and `npm run check:app` pass; then browser-check at 1280x720 and 390 in both themes against the mockup.
- [ ] **Step 5: Commit** `web: Home bento shell and Langit Lab hero cell`.

### Task 4: Greeting and role cell

**Files:**
- Modify: `HomePage.tsx` (`RoleCard` at ~107), `home.css`
- Reuse unchanged: `apps/web/src/components/console/DayCard.tsx`, `console/day.css`

**Interfaces:**
- Consumes: `.hb__greet`, `.hb__role` from Task 3; `RoleCard({ lang, lab, pegang })`, `DayCard`.
- Produces: restyle only; props and data fetches unchanged. Any `DayCard` visual change is done through selectors scoped under `.hb`.

- [ ] **Step 1: Restyle greeting H1 and `RoleCard` variants** (Praktikan live, Praktikan no session, Asisten) into the role cell; primary button remains the first visible action (`Lanjutkan Modul N`, `Dasbor`, `Buka Konsol` / `Buka Papan`).
- [ ] **Step 2: Handle the long-name case** (`overflow-wrap: anywhere`, fluid size) and the Asisten "Belum ada slot mengajar" state.
- [ ] **Step 3: Verify** in the browser as Asisten (the signed-in session on prod-like data or the rig) at 360, 390, 1280x600: primary action visible, no clipping. Run `npx vitest run` and `npm run check:app`.
- [ ] **Step 4: Commit** `web: Home greeting and role cell`.

### Task 5: Module tiles

**Files:**
- Modify: `HomePage.tsx` (Empat Rasi section, `LANES` from `homeStrings.ts`), `home.css`

**Interfaces:**
- Consumes: `.hb__mod`; `ModConstellation` from `shared/Instruments.tsx`; `LANES: { m, a, b, via }[]`.
- Produces: four tiles using `--mod-1..4` and `-soft`, whole tile is the link to `/modules/{m}`, and a visible "Baca Modul" label.

- [ ] **Step 1: Replace the `.panel.rasi` cards with module tiles** per the mockup (constellation fills the tile, mono `via` line, one-line copy, "Baca Modul" affordance). Keep the phone snap-scroll row.
- [ ] **Step 2: Verify** keyboard focus ring and contrast of module hues on both themes (`contrast.test.ts` plus a manual check of `--mod-*-soft` text); `npx vitest run`.
- [ ] **Step 3: Commit** `web: Home module tiles`.

### Task 6: Slim recruitment banner

**Files:**
- Modify: `apps/web/src/components/recruitment/home-banner/RecBanner.tsx` (props at ~117), `apps/web/src/components/recruitment/recruitment.css` (`.rec-bn*`), `bannerStrings.ts` only if new text is needed
- Modify: `HomePage.tsx`, `profil/ProfilLab.tsx` (the two callers)

**Interfaces:**
- Produces: `RecBanner` gains optional `slim?: boolean` (default `false`). `HomePage` and `ProfilLab` pass `slim` for the signed-in Home; behaviour, data and every `kind` unchanged. Detail that the slim strip hides stays one tap away (the same button target).

- [ ] **Step 1: Add the `slim` prop and class `rec-bn--slim`**: one row with title, the single doNow or status line, and the one action button; all seven kinds render. Keep `none` rendering nothing.
- [ ] **Step 2: Verify each kind** by rig or mocked `BannerResponse` at 1280 and 390 (visitor, praktikan, candidate, cut, panitia, asisten); `npx vitest run recruitment-banner` still passes; no layout jump when the banner arrives late (Review Focus 3).
- [ ] **Step 3: Commit** `web: slim recruitment banner on Home`.

### Task 7: Visitor split hero

**Files:**
- Modify: `apps/web/src/components/home/profil/ProfilLab.tsx` (`HeroLab` at ~67), `profil/profil.css`, `profil/profilStrings.ts` if copy changes

**Interfaces:**
- Consumes: `HeroLab({ lang, data })`; `LabSky` (exported from `HomePage.tsx`) rendered with `lab={null}` for guests.
- Produces: split hero (text and stats left, sky right); the two buttons (`Lihat Modul` to `/modules`, `Praktikum` calls `openSignIn()`) and four counting stats unchanged.

- [ ] **Step 1: Restructure `HeroLab`** into the split layout; guests show the ambient sky scene (Review Focus 2). Keep logo aurora, `.pl-sweep`, `Hitung` count-up and `useGerakProfil` tiers.
- [ ] **Step 2: Verify** as a logged-out visitor (private window) at 1440x900, 1280x600, 390, dark and light, in id, en, zh; `npx vitest run`.
- [ ] **Step 3: Commit** `web: Home visitor split hero`.

### Task 8: Profile chapter nav and rhythm

**Files:**
- Modify: `ProfilLab.tsx`, `profil.css`, `profilStrings.ts` (chapter labels in id, en, zh)

**Interfaces:**
- Produces: a sticky chapter nav (Tentang, Logo, Divisi, Foto, Acara) using section ids and `IntersectionObserver` for the active state; sections' content and the Swiper, lightbox, `LihatGrup` logic untouched.

- [ ] **Step 1: Add the sticky chapter nav** below the global navbar (offset by `--nav-size`); opaque surface; active chapter underlined with `--sweep` (decoration only); keyboard accessible, anchors scroll smoothly unless reduced motion.
- [ ] **Step 2: Tighten vertical rhythm and card language** to match the bento tiles; no content removed.
- [ ] **Step 3: Verify** at 1280x720 and 390 that the sticky nav does not cover headings (scroll-margin) and that Acara and the lightbox still open; `npx vitest run`.
- [ ] **Step 4: Commit** `web: Home profile chapter nav and rhythm`.

### Task 9: Cleanup of dead code

**Files:**
- Modify: `home/home.css` (`.orbitpath*`, lines ~300-376, if still unused), `home/homeStrings.ts` (`flowTitle`, `before`/`during`/`after`, `boardTitle`, `quietBody`, `labNow`, `frame*`)

- [ ] **Step 1: Extend `home-strings.test.ts`** with a check that every `H.id` key is referenced by some `.tsx` or `.astro` file under `apps/web/src`; run it and confirm it FAILS listing exactly the dead keys.
- [ ] **Step 2: Delete the dead keys (all three languages) and the unused `.orbitpath*` CSS.** Do not delete a key the port started using.
- [ ] **Step 3: Run** `npx vitest run` and `npm run build`; expected: all pass.
- [ ] **Step 4: Commit** `web: remove dead Home CSS and strings`.

### Task 10: Full verification and hand-off

- [ ] **Step 1: Run** from `apps/web`: `npm run check` and `npx vitest run`; compare with Task 1's baseline; any new failure is fixed.
- [ ] **Step 2: Browser matrix** (rig dev server): sizes 1280x600, 1280x720, 1440x900, 1680x1050, 820, 390, 360; dark and light; id, en, zh; Visitor, Praktikan (live, none), Asisten (slot, live, start window); each banner kind; projector mode; ten groups; reduced motion and Low Detail. Fix everything found in the same turn.
- [ ] **Step 3: Take screenshots** (before and after at 1440x900 and 390) and show them to the user; list anything not browser-checked plainly.
- [ ] **Step 4: Open a PR** from `home-bento` with the standard attribution lines; do not deploy; ask the user for the deploy go (the Upgrade button deploys all of main).

---

## Self-review notes
- Spec coverage: bento top (T3-5), banner (T6), visitor hero (T7), profile nav (T8), DESIGN.md and mockup (T1-2), cleanup (T9), verification (T10). Non-goals respected (no backend, no new libs, `DayCard` untouched).
- Names consistent: `.hb`, `.hb__greet`, `.hb__role`, `.hb__sky`, `.hb__mod`, `RecBanner slim`, `rec-bn--slim`.
- Tests: no component-render tests exist in this repo (vitest runs in node, `.test.ts` only), so the guards are `home-strings.test.ts` plus the existing scans, with the browser as the real check.
