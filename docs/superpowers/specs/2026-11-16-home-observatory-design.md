# Home (Beranda) redesign v2: "Observatory"

## Context
The user asked for a noticeably better Home in the same IRIS look. A first direction (bento grid, mockup v4, branch `worktree-home-bento`) was shown and **rejected**: the user wants a brand-new approach to how Home is organized, not a restyle. Four structurally different concepts were offered (Observatory, Signal Path, Console Shell, Four Worlds); the user picked **Observatory** and **one mockup** of it before any app code.

**Concept:** the live Langit Lab sky *is* the first screen. A solid control panel sits over a large, calm scene of group stars and carries the viewer's one next action. Modules, profile and banner become layers below.

## Scope and non-goals
- Scope: everything on Home (recruitment banner, visitor hero, signed-in top, module links, lab profile), as before.
- No feature removed (user rules 1, 14): RoleCard variants (Praktikan live / no session), Asisten `DayCard` + `DayStrip`, Langit Lab stats and quiet state, module links, all `RecBanner` kinds (none, visitor, praktikan, candidate, cut, panitia, asisten), projector mode, `ProfilLab` sections and `/lab-profile` edit links.
- No backend, schema or migration; no new animation library. Reuse `usePoll`, `/api/session/lab` (`Lab` type: modul, kelompok, hadir, anggota, blank, pesan, benar, celah, `bintang[]`), `RoleCard`, `DayCard`, `ModConstellation`, `MissionClock`, `Journey`, `RecBanner`, `ProfilLab`.
- Guests get counts only (`lab.bintang` undefined), so the visitor scene shows the ambient four constellations plus profile stats, never per-group stars.
- Not a re-theme: kosmik tokens, dark and Daylight light themes stay. Same rules as before (see Rules).

## Design
```
[ slim banner strip (RecBanner, one row)                                   ]
+--------------------------------------------------------------------------+
| scene (solid, static): module constellation faint + group stars large     |
|        * Aurora          * Nova (you, dashed ring)        Langit Lab  Langsung
|              * Kometa        * Zenit                      [stats strip, solid]
|  +--------------------------+                                             |
|  | Halo, {nama}             |                                             |
|  | role content + 1 action  |  <- solid .panel--key, bottom-left          |
|  +--------------------------+                                             |
+--------------------------------------------------------------------------+
[ Empat Modul: ONE wide band, four segments split by hairlines               ]
[ Profil Lab: Tentang, Logo, Divisi, Foto, Acara (sticky chapter nav)        ]
```
- **Scene:** a bounded solid panel (container-regular width, radius-xl), height `min(100svh - nav, 760px)`, min 520px so the primary action shows at 1280x600. Dark = deep-space gradient; light = Daylight sky gradient. Stars are drawn large (halo + core scaled by correct blanks, label "{n} · {name}" and "{x}/{y} benar", own group gets the dashed ring). The running module's constellation sits faint behind. Star layout is a pure function that handles up to ten groups without overlap (replaces the six-spot `SPOTS` wrap). Nothing under a label animates; only the own-group ring turns and the "Langsung" dot pulses.
- **Control panel (bottom-left, solid):** greeting H1 (wraps long names, fluid size), then the role content: Praktikan live (MissionClock, Kelompok pill, Modul N, progress, "Lanjutkan Modul N" + "Dasbor"), Praktikan idle (journey, "Dasbor"), Asisten (day strip, next slot or live session, "Buka Konsol"/"Buka Papan" + "Jadwal", waiting count), Visitor (logo, "Laboratorium IRIS", lede, "Lihat Modul" + "Praktikum"). Phone: scene shrinks to a short top band, the panel flows below it.
- **Stats strip (solid, over the scene, bottom-right):** four mono tiles (kelompok aktif, praktikan hadir, blank kode benar, pesan by module). Visitors see the profile stats instead (Asisten aktif, Divisi, Modul, Acara).
- **Empat Modul band:** one panel, four segments separated by hairlines (design system: structure from hairlines, not stacked boxes). Each segment: constellation, mono protocol line, module name, one line, "Baca Modul"; hover lifts it and takes the module hue.
- **Banner:** `RecBanner` gains optional `slim` (one row: title, status, one action); all kinds still render.
- **Profile:** same content and logic; sticky chapter nav (opaque), tighter rhythm, same hairline-and-band language.
- **Motion:** one authored moment: stars light up in sequence on load, from a visible resting state. CSS only, gated by `:root:not([data-motion-tier="0"])` and reduced motion.
- **Visual removals vs today:** no eyebrow above the greeting, no gradient text on "IRIS" (impeccable craft floor), decorative `.orbitpath*` CSS and unused `homeStrings` keys go in cleanup.

## Rules (carry into every task)
Opaque surfaces (global navbar stays glass); tokens only, 4.5:1 text in both themes; `--sweep-ring` never under text; one `.panel--key` per screen; every figure mono; no em/en dashes; no abbreviations ("Kelompok 3"); Title Case headers and buttons; casual Indonesian with English tech terms; id/en/zh strings in step; works with ten groups; laptop first (1280x600, 1280x720, 1440x900, 1680x1050 then 820, 390, 360); primary action visible at 1280x600; remove or merge before adding.

## Build phases
0. **Housekeeping (existing worktree `.claude/worktrees/home-bento`, branch `worktree-home-bento`):** `git rm` the rejected bento spec, plan and mockup; rewrite the "Home bento" subsection of `DESIGN.md` into "Home Observatory"; write the new design doc and plan in `docs/superpowers/` (via superpowers:writing-plans). Keep DESIGN.md. Do not delete the old private artifact or branch without the user's word.
1. **Mockup (one, the gate):** HTML Artifact of Observatory: Visitor, Praktikan live, Praktikan idle, Asisten slot, Asisten live; banner states; dark and light; ten-group and long-name worst case; phone width. Check it at desktop and phone before publishing (use the Chrome DevTools or Playwright MCP for real viewport sizes, since the extension window would not narrow last time). **Stop for the user's sign-off.**
2. **Port after sign-off (TDD where logic exists):**
   - New pure helper `apps/web/src/lib/home-sky.ts` with `placeStars(n: number): { x: number; y: number }[]` (percent coordinates in a 0-100 by 0-60 field); test `src/lib/__tests__/home-sky.test.ts` for n = 0..12: count, bounds, minimum pairwise distance, determinism. Write the test first.
   - New `apps/web/src/components/home/Observatory.tsx` + `observatory.css`: scene, panel slot, stats strip; `LabSky` is replaced (it is exported and used by `HeroLab`, update the caller).
   - Module band component, `RecBanner slim`, `HeroLab` becomes the visitor panel, chapter nav in `ProfilLab`, copy in `homeStrings.ts` / `profilStrings.ts` (all three languages).
   - Guard test `src/lib/__tests__/home-strings.test.ts`: id/en/zh key parity and no dashes.
3. **Cleanup:** dead `home.css` rules and unused strings, only if still unused (a guard test lists them first).
4. **Verify and hand off:** vitest (abbreviations, contrast, motion-rules, i18n-lang, home-sky, home-strings; known pre-existing failure: `reconstruction.test.ts`, 12 tests, Module 4, unrelated), `npx astro sync` then `npm run check`, build; browser matrix (sizes above, dark and light, id/en/zh, Visitor, Praktikan live and idle, Asisten slot, live and start window, each banner kind, projector mode, ten groups, reduced motion, Low Detail) with before/after screenshots; PR; no deploy without the user's go.

## Critical files
`apps/web/src/components/home/HomePage.tsx` (compose, `RoleCard`, `LabSky` ~311-450, `SPOTS`/`LINES`), `home.css`, `homeStrings.ts`; `home/profil/ProfilLab.tsx` (`HeroLab`, chapter nav), `profil.css`; `components/console/DayCard.tsx` (reuse, restyle only through Home-scoped CSS); `components/recruitment/home-banner/RecBanner.tsx` + `recruitment.css`; `components/shared/Instruments.tsx`; tokens in `packages/kosmik/style/tokens.css` and `apps/web/src/styles/theme.css`; spec `docs/design-system.md`. Edit the worktree, never the main checkout or `.claude/worktrees/hunt-auth-speed`.

## Open items
- Exact scene height, panel width and the slim banner form are settled in the mockup.
- Whether the sticky chapter nav stays (carried over from the rejected plan as a small win) is the user's call at mockup review.
