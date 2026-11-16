# Home (Beranda) redesign: "Mission-control bento"

## Context
The IRIS Home page (`apps/web`, route `/`, island `src/components/home/HomePage.tsx`) works but reads as a stack of unrelated boxes. The signed-in top is three separate cards that don't relate to each other (recruitment banner, role/day card, an often-empty "Langit Lab" panel). The "Empat Rasi" module cards are plain white boxes with lots of empty space, and the page is long. The sky/cloud background is the strongest part, but the content doesn't use it.

The user asked for a noticeably better Home in the same IRIS theme, using popular patterns and the installed design skills. Scope chosen: **everything** (recruitment banner, visitor hero, signed-in top, lab profile sections). Direction chosen: **A, mission-control bento**. Research (SaaSFrame, Veza Digital, 2026) says bento grids on dark/sky bases are the dominant developer-product pattern and that clarity beats novelty.

## Goals
- One coherent page: a bento grid whose hero cell is the live Langit Lab sky, so the page feels alive and shows what the lab is doing right now.
- Signed-in users answer "what do I do now?" first (their role card is the primary action), with the rest one tap away.
- Visitor landing gets a stronger first screen (split hero with the live sky as the "product shot", stats beneath).
- Same theme: kosmik tokens, dark and light ("Daylight sky"), Plus Jakarta Sans / Inter / JetBrains Mono, sky background, rainbow `--sweep` rings only as decoration.

## Non-goals / anti-goals
- No feature removed (user rules 1, 14). Every current data source, role variant and link stays: RoleCard (Praktikan live/no session), Asisten `DayCard` + `DayStrip`, Langit Lab stars/stats/quiet state, Empat Rasi with "Baca Modul", all RecBanner kinds (none/visitor/praktikan/candidate/cut/panitia/asisten), projector mode, `ProfilLab` sections and `/lab-profile` edit links.
- No new backend, no schema or migration. Data hooks (`useMe`, lab polling, `useRecBanner`, `useAliranAtauTopik`) are reused as they are.
- Not a re-theme and not a marketing/editorial scroll-story (direction B rejected). No parallel "new Home"; the redesign replaces the screen in place (rule 12).
- Must not become busier than today: remove or merge before adding (rule 5).

## Approaches considered
- **A. Mission-control bento (picked).** Reworks layout the most, keeps every feature and the theme.
- B. Editorial scroll story: impressive for visitors, fights the signed-in "what now" job, heavy motion cost.
- C. Polish pass only: safest, but unlikely to read as "noticeably better".

## Design (my calls unless stated)
**Signed-in top (Praktikan and Asisten), 12-column bento at 1280+, 2 columns at 640+, one column on phones:**
```
[ slim banner strip (RecBanner, collapsed variant)                               ]
[ Halo, {nama}  + role card (primary action)  ][  Langit Lab  (hero, 2x tall)     ]
[ today / next slot / progress                ][  stars, live badge, stat tiles   ]
[ Modul 1 tile ][ Modul 2 tile ][ Modul 3 tile ][ Modul 4 tile (constellation+CTA)]
```
- Langit Lab becomes the largest cell; its "Sepi" state shows the four constellations as a calm ambient scene with one line, not an empty box.
- Role card keeps its variants; Asisten `DayCard` keeps `DayStrip` (shared with Konsol, so restyle only through Home-scoped CSS, do not edit `console/day.css`).
- Module tiles replace the white "Empat Rasi" cards: constellation filling the tile, module hue (`--mod-1..4`), one-line copy, whole tile is the link (keeps the "Baca Modul" action visible).
- RecBanner keeps every `kind` and the doNow/progress logic; only its Home presentation gets slimmer (strip with the one action), full detail stays one tap away.

**Visitor landing (`HeroLab`):** split hero. Left: H1 "Laboratorium IRIS", lede, the two existing buttons (Lihat Modul, Praktikum) and the four counting stats. Right: the Langit Lab sky (or its quiet ambient scene, since guests have no lab data) as the visual.

**Lab profile (`ProfilLab`):** same sections and content; add a sticky chapter nav (Tentang, Logo, Divisi, Foto, Acara), tighten vertical rhythm, apply the same card/tile language. Photo, Swiper and lightbox logic untouched.

**Motion:** CSS keyframes plus `IntersectionObserver` as today (no new animation library). Gated by the existing motion tier / reduced-motion. Nothing animates behind a reading. Use the `animate` / `emil-design-eng` skills for timing and easing choices.

**Rules that apply (from `docs/design-system.md` and memory):** every figure in mono; no em/en dashes; no abbreviations ("Kelompok 3"); Title Case headers and buttons; opaque surfaces (global navbar stays glass); plain casual Indonesian with English tech terms; 4.5:1 contrast in both themes via tokens; copy kept in step across id, en, zh; works with ten groups; laptop sizes first.

## Build phases
1. **Design record:** run the `impeccable` skill to write `DESIGN.md` (none exists) from the shipped theme, plus a short design brief for Home.
2. **Mockup first (user rule 6):** an HTML mockup (private Artifact) of Home for Visitor, Praktikan (live and quiet), Asisten and the banner states, in dark and light. User reviews before any app code.
3. **Port** into the real components after sign-off (use `frontend-design`, `impeccable`, `animate` skills, and `design:accessibility-review` / `design-critique` as checks).
4. **Cleanup:** delete the dead `.orbitpath*` CSS and unused `homeStrings.ts` keys (`flowTitle`, `before/during/after`, `boardTitle`, `quietBody`, `labNow`, `frame*`) only if still unused after the port.

## Critical files
- `apps/web/src/components/home/HomePage.tsx` (entry, `RoleCard`, `LabSky`), `home.css`, `homeStrings.ts`
- `apps/web/src/components/home/profil/ProfilLab.tsx` (`HeroLab`), `profil.css`, `parts.tsx`
- `apps/web/src/components/console/DayCard.tsx` (reuse; restyle via Home scope only)
- `apps/web/src/components/recruitment/home-banner/RecBanner.tsx` and `recruitment.css` (`.rec-bn*`)
- `apps/web/src/components/shared/Instruments.tsx` (`ModConstellation`, `MissionClock`, `Journey`, reuse)
- Tokens: `packages/kosmik/style/tokens.css`, `apps/web/src/styles/theme.css`; spec `docs/design-system.md`
- Edit the main tree, not `.claude/worktrees/hunt-auth-speed`.

## Verification
- `vitest` suites that scan Home: `abbreviations.test.ts`, `contrast.test.ts`, `motion-rules.test.ts`, `i18n-lang.test.ts`, plus `recruitment-banner`, `jadwal-next`, `proyektor`, `profil`; typecheck and build.
- Browser check on the local dev server (rig) at 1280x600, 1280x720, 1440x900, 1680x1050, then 820, 390, 360; dark and light; id, en, zh; as Visitor, Praktikan (in session, no session), Asisten (slot, live session, start window), each banner kind; projector mode; ten groups in Langit Lab; reduced motion and Low Detail.
- No test renders Home, so browser screenshots are the real check; share them with the user.
- No deploy without the user's go.

## Open items for the builder
- Exact bento proportions and the collapsed banner form are settled in the mockup, not here.
- Whether the Langit Lab guest view uses real data (guests currently get none) is decided in the mockup; default is the ambient quiet scene.
