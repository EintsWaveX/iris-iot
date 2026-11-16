# Home Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home (Beranda) page in place with the "Observatory" layout: the live Langit Lab scene is the first screen, a solid control panel carries the viewer's one next action, modules and profile are layers below.

**Architecture:** Mockup first (one private HTML Artifact, user sign-off gate), then port. A new `Observatory` component draws the scene, panel slot and stats strip; star positions come from a pure, tested helper. Existing role content (`RoleCard`, `DayCard`), `ModConstellation`, `RecBanner` and `ProfilLab` are reused; no backend, schema or new animation library.

**Tech Stack:** Astro 7 + React 19 islands, plain global CSS on kosmik tokens, vitest (node env, `.test.ts` only), Phosphor icons. Work in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-11-16-home-observatory-design.md` (read its **Revision 1** first: it changes the visual world to a painted fantasy-modernistic cosmos in two themes, and adds the banner, Filosofi Logo and Enam Divisi redesigns, glass stat cards, and the navbar button bug fix. Tasks 3 to 7 below follow Revision 1 wherever they conflict with the older wording, and gain these items: a `components/home/cosmos/` painter module, the Filosofi Logo and Divisi sections, the real banner stage names, and a fix of the real `AppNav` Praktikum button hover jump.)

## Global Constraints

- Same theme: kosmik tokens (`packages/kosmik/style/tokens.css`, `apps/web/src/styles/theme.css`), dark and `:root[data-theme="light"]`. Tokens only; text and icons at least 4.5:1 (3:1 large text and UI edges) in both themes.
- Opaque surfaces only; no `backdrop-filter` or translucency on cards. The global navbar (`AppNav`) stays glass and is not touched.
- `--sweep-ring` never under text; text-bearing gradients use `--sweep-surface`. One `.panel--key` per screen.
- Every figure in `--font-mono`. No em or en dashes in copy. No abbreviations ("Kelompok 3", never "K3"). Title Case headers and buttons. People are "Full Name (CODE)".
- Copy: casual everyday Indonesian, tech terms in English (array, input, output). Keep `id`, `en`, `zh` in step in `homeStrings.ts` and `profilStrings.ts`. Write CaAs, never CaA.
- Motion: CSS only, gated by `:root:not([data-motion-tier="0"])`, honours reduced motion and Low Detail. Nothing animates behind a reading; one authored moment (stars light up on load, from a visible resting state).
- No feature removed: all role variants, every `RecBanner` kind (`none`, `visitor`, `praktikan`, `candidate`, `cut`, `panitia`, `asisten`), projector mode, `/lab-profile` edit links. Guests get counts only (`lab.bintang` undefined): never draw per-group stars for them.
- Laptop first: verify 1280x600, 1280x720, 1440x900, 1680x1050, then 820, 390, 360. Primary action visible at 1280x600. Works with ten groups.
- Work in worktree `.claude/worktrees/home-bento` (branch renamed `home-observatory`). Run `npx astro sync` in a fresh worktree before `npm run check`. Never commit `db.ts` RIG-ONLY changes. Stage explicit paths only (`.superpowers/` is untracked scratch). No deploy without the user's go. Pre-existing failure, ignore but report: `reconstruction.test.ts` (12 tests, Module 4).

## Review Focus

1. Ten groups, and a group count above ten: stars must not overlap each other or their labels; labels stay inside the scene.
2. Long greeting name ("Immanuel Eben Haezer Joseph Aletheia") at 360px and inside the bottom-left panel: wraps, no clipping, primary action still visible at 1280x600.
3. Guest with no lab data: the scene shows the ambient four constellations and profile stats, never an empty box or endless skeleton.
4. Banner `kind: "none"` or still loading past 1.5s: no gap and no layout jump when it arrives.
5. Asisten with no slot ("Belum ada slot mengajar") and Praktikan with no session: the panel still has exactly one clear primary action; `zh` strings (longer, CJK) do not collide with stars.

---

### Task 1: Mockup and sign-off gate

**Files:**
- Create: `<scratchpad>/home-observatory-mockup.html` (single self-contained file; copy into `docs/superpowers/specs/2026-11-16-home-observatory-mockup.html` once approved)

**Interfaces:**
- Produces: the visual contract for Tasks 3 to 7 (scene height, panel width, strip placement, module band, slim banner, chapter nav yes or no).

- [ ] **Step 1: Build the mockup** of Visitor, Praktikan live, Praktikan idle, Asisten slot, Asisten live, with banner states, dark and light, a worst-case toggle (ten groups, long name) and a language note. Use real copy from `homeStrings.ts` and token values from `theme.css`; example data labelled as such. Use the `impeccable`, `frontend-design` and `animate` skills; avoid eyebrow lines and gradient text.
- [ ] **Step 2: Verify at real viewport sizes** with the Chrome DevTools or Playwright MCP (load tools via ToolSearch): 1440x900, 1280x600, 390x844, both themes, Praktikan live and the worst case. Fix everything seen in one batch; one confirm round.
- [ ] **Step 3: Publish as a private Artifact** and give the user the link.
- [ ] **Step 4: STOP for the user's sign-off.** Tasks 2 to 9 wait; loop here until approved.

### Task 2: `placeStars` helper (TDD)

**Files:**
- Create: `apps/web/src/lib/home-sky.ts`, `apps/web/src/lib/__tests__/home-sky.test.ts`

**Interfaces:**
- Produces: `export function placeStars(n: number): { x: number; y: number }[]` returning `n` points in percent coordinates of a 0-100 by 0-60 field, deterministic, for any `n >= 0` (clamp negatives to 0).

- [ ] **Step 1: Write the failing tests** `placeStars returns n points`, `all points stay inside 6..94 by 8..52`, `no two points closer than 14 units for n up to 12`, `same input gives same output`, `n = 0 gives an empty array`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/home-sky.test.ts` from `apps/web`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** with a golden-angle spiral scaled to the field (a fixed, spread layout), no randomness.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `web: home-sky star layout for up to ten groups`.

### Task 3: Observatory scene

**Files:**
- Create: `apps/web/src/components/home/Observatory.tsx`, `apps/web/src/components/home/observatory.css`
- Modify: `apps/web/src/components/home/HomePage.tsx` (replace `LabSky` use and the `.home10__top` block; keep `LabSky` export only if `HeroLab` still imports it, otherwise remove)

**Interfaces:**
- Consumes: `placeStars` (Task 2); `Lab` type and `usePoll` data already in `HomePage.tsx`; `ModConstellation`.
- Produces: `export function Observatory(props: { lang: Lang; lab: Lab | null | undefined; mine: number[]; holder: "praktikan" | "asisten" | null; panel: ReactNode; stats?: [string, string][] }): JSX.Element` rendering the scene, the `panel` slot bottom-left and the stats strip bottom-right.

- [ ] **Step 1: Add `Observatory`** with states: loading (skeleton with the scene's final height, no jump), quiet (ambient four constellations, `skyQuiet` copy), live (faint module constellation, large stars via `placeStars(lab.bintang.length)`, label "{n} · {name}" and `starP`/`starDone`, own-group dashed ring, "Langsung" pill), guest (counts only, `skyGuest` line).
- [ ] **Step 2: Style** scene, stars, ring, strip and the one-time star light-up in `observatory.css`, tokens only, both themes.
- [ ] **Step 3: Wire into `HomePage`** passing the existing role content as `panel` (Task 4 refines it).
- [ ] **Step 4: Verify** `npx vitest run` (contrast, motion-rules, abbreviations) and `npm run check:app` pass; browser-check 1280x720 and 390 in both themes against the mockup.
- [ ] **Step 5: Commit** `web: Home Observatory scene`.

### Task 4: Control panel content per role

**Files:**
- Modify: `HomePage.tsx` (`RoleCard` ~107), `home.css` / `observatory.css`, `profil/ProfilLab.tsx` (`HeroLab` becomes the Visitor panel content)
- Reuse unchanged: `console/DayCard.tsx`, `console/day.css`

**Interfaces:**
- Consumes: `Observatory`'s `panel` slot. Produces: restyled role content only; props and fetches unchanged.

- [ ] **Step 1: Restyle the greeting and `RoleCard` variants** into the panel, with exactly one primary button each (`Lanjutkan Modul N`, `Dasbor`, `Buka Konsol` / `Buka Papan`, `Praktikum`).
- [ ] **Step 2: Move the Visitor hero** (logo, "Laboratorium IRIS", lede, `Lihat Modul`, `Praktikum`) into the panel; visitor stats (Asisten aktif, Divisi, Modul, Acara with `Hitung` count-up) go to the strip.
- [ ] **Step 3: Verify** long name at 360 and 1280x600, no-slot and no-session states; `npx vitest run`, `npm run check:app`.
- [ ] **Step 4: Commit** `web: Home control panel per role`.

### Task 5: Module band

**Files:** Modify `HomePage.tsx` (Empat Rasi section, `LANES`), `home.css`

- [ ] **Step 1: Replace the four `.panel.rasi` cards** with one band of four hairline-separated segments (constellation, mono protocol, name, one line, "Baca Modul"); each segment is the whole link to `/modules/{m}`; hover takes `--mod-N`; phone keeps the snap-scroll row.
- [ ] **Step 2: Verify** focus ring and contrast of module hues in both themes; `npx vitest run`.
- [ ] **Step 3: Commit** `web: Home module band`.

### Task 6: Slim recruitment banner

**Files:** Modify `recruitment/home-banner/RecBanner.tsx` (props ~117), `recruitment/recruitment.css` (`.rec-bn*`), callers in `HomePage.tsx` and `ProfilLab.tsx`

**Interfaces:** Produces optional `slim?: boolean` (default false) on `RecBanner`; behaviour and every `kind` unchanged.

- [ ] **Step 1: Add `slim` and class `rec-bn--slim`** (one row: title, one status line, the one action). `none` still renders nothing.
- [ ] **Step 2: Verify each kind** (mocked `BannerResponse` or rig) at 1280 and 390; `npx vitest run recruitment-banner`; no layout jump on late arrival.
- [ ] **Step 3: Commit** `web: slim recruitment banner on Home`.

### Task 7: Profile chapter nav and rhythm

**Files:** Modify `profil/ProfilLab.tsx`, `profil/profil.css`, `profil/profilStrings.ts` (labels in id, en, zh). Only if the user kept the chapter nav at sign-off; otherwise do the rhythm and hairline-band language only.

- [ ] **Step 1: Add the sticky opaque chapter nav** (Tentang, Logo, Divisi, Foto, Acara) offset by `--nav-size`, active state via `IntersectionObserver`; tighten rhythm to the hairline-and-band language. Section content and Swiper, lightbox, `LihatGrup` logic untouched.
- [ ] **Step 2: Verify** sticky nav never covers headings (scroll-margin), Acara and lightbox still open; `npx vitest run`.
- [ ] **Step 3: Commit** `web: Home profile chapters`.

### Task 8: Strings guard and cleanup

**Files:** Create `apps/web/src/lib/__tests__/home-strings.test.ts`; modify `home/homeStrings.ts`, `home/home.css`

- [ ] **Step 1: Write the test** asserting every key of `H.id` exists in `H.en` and `H.zh`, no string contains an em or en dash, and every `H.id` key is referenced from a `.tsx` or `.astro` file under `apps/web/src`. Run it; expected: FAIL listing exactly the dead keys (`flowTitle`, `before`, `during`, `after`, `beforeList`, `duringList`, `afterList`, `boardTitle`, `quietBody`, `labNow`, `frame*` if still unused).
- [ ] **Step 2: Delete the dead keys in all three languages and the dead `home.css` rules** (`.orbitpath*`, the old `.labsky*`, `.home10__top`, `.rasi*` if replaced).
- [ ] **Step 3: Run** `npx vitest run` and `npm run build`. Expected: all pass except the known `reconstruction.test.ts`.
- [ ] **Step 4: Commit** `web: remove dead Home CSS and strings`.

### Task 9: Full verification and hand-off

- [ ] **Step 1:** from `apps/web`: `npx astro sync`, `npm run check`, `npx vitest run`; compare with the baseline; fix anything new.
- [ ] **Step 2: Browser matrix** on the rig dev server: sizes above, dark and light, id/en/zh, Visitor, Praktikan (live, none), Asisten (slot, live, start window), each banner kind, projector mode, ten groups, reduced motion, Low Detail. Fix everything found in the same turn.
- [ ] **Step 3:** before and after screenshots (1440x900, 390) to the user; list anything not browser-checked.
- [ ] **Step 4:** open a PR with the standard attribution; do not deploy; ask for the deploy go.

---

## Self-review notes
- Spec coverage: scene, panel, strip, module band, banner, profile, motion, cleanup, verification all map to tasks. Non-goals respected (no backend, no new libs, `DayCard` untouched).
- Names consistent: `placeStars`, `Observatory`, `panel`/`stats` props, `RecBanner slim`, `rec-bn--slim`.
- Tests: no component-render tests exist (node vitest, `.test.ts` only), so logic is covered by `home-sky` and `home-strings` tests plus the existing scans; the browser is the real check for layout.
