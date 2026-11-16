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

---

## Revision 1 (16 Nov 2026, from the user's live feedback on the mockup)
These supersede anything above that conflicts. Mockup: `2026-11-16-home-observatory-mockup.html` (private Artifact `AAiN9cmtoBHeZyyWkHM1sA`).

**Visual world: "fantasy-modernistic with small anime touches", Genshin Impact as the style reference, in both themes, with IRIS's own astronomy as the signature.** The photoreal sky was tried and rejected as too realistic; the first flat-vector sky was rejected as too cartoonish.
- The cosmos is a full-bleed painted scene behind the first screen, drawn on a canvas by a new painter (replaces the idea of a bounded solid scene box). Two scenes, not one inverted: dark "Night Watch" (indigo to violet to magenta horizon, aurora ribbons, crescent moon, rim-lit ringed planet) and light "Golden Hour" (bright azure to peach, a low sun with a lens flare, cel-shaded clouds, a pastel ringed planet).
- Shared ingredients: sparkle-shaped stars and motes, floating islands (one carries the IRIS ground-station dish with signal arcs), misty layered ridges, thin edge ticks, orbit rings with a tick scale and riding bodies, and the four module constellations as line art. Group stars are 4-point sparkles joined by a glowing constellation line; label plaques are solid and tinted by the group hue.
- UI stays modern and restrained: solid panels, hairlines, mono figures, one small sparkle ornament on the control panel.
- **Glass exception (user's explicit request):** the four visitor stat cards (Asisten Aktif, Divisi, Modul Praktikum, Acara Terlaksana) are liquid-glass (backdrop blur, tinted gradient, inner highlight) and sit around the logo: 24 and 6 on the left, 4 and 1 on the right as X-mirrors of 24 and 6. Every other surface stays opaque. This overrides the "no translucent surfaces" rule for these four cards only.
- Gradient on the "IRIS" word in the visitor title returns (it is part of the user's theme), overriding the earlier eyebrow and gradient-text removal.

**Visitor hero:** centered, much larger logo (clamp(250px, 56svh, 600px)), title, lede, two buttons; roomier vertical rhythm (gaps up to 34px, section padding 52px, page gap 32px). Phones: cards become a 2x2 grid under the logo; side islands are dropped.

**Navbar "Praktikum" button:** shown only to visitors, centered, with the door icon. Bug found: it was centered with `transform: translateX(-50%)` and the button hover lift sets `transform`, so it jumped sideways on hover and click. Fix: center with the separate `translate` property. **Check the real `AppNav` button for the same bug when porting.**

**Open Recruitment banner:** redesigned, not slim. Broadcast icon tile, title, a "Buka Sekarang" pill (visitor), a 7-stage rail (Daftar, Berkas, Tes Tulis, Cutting, Wawancara, Tubes, Penerimaan; stage names are example data, take the real ones from the recruitment types) with a progress line, countdown or facts, and the actions. Every `kind` still renders.

**Filosofi Logo (new design):** a blueprint stage (grid, "Fig. 1" title block) holding the logo, with a spotlight that moves to the chosen part and a pin, beside a list of the four real meanings (Awan, Wi-Fi, Warna with a swatch, Huruf IRIS). Heading "Setiap Garis Punya Makna", lede "Pilih satu bagian untuk melihatnya di logo." The eyebrow "Filosofi logo" is dropped.

**Enam Divisi, Satu Lab (reuse live content, new design):** same six divisions (ASO, ARD, ADS, ADC, AER, ARM with names, one-liners, member counts and the open-for-people behaviour) restyled as PCB-module boards: silkscreen code, an LED, a trace motif in the division hue, avatar stack. Ties to the logo's "huruf IRIS = jalur PCB" meaning. Data comes from `/api/profil/baca` as today.

**Port implications (changes to the plan):** the sky painter belongs in a new `components/home/cosmos/` module (canvas, two painters, resize and theme aware, reduced motion and Low Detail honoured, painted once and on resize, not per frame); the existing global sky (`sky.ts`) is untouched for now and the Home painter can later be offered site-wide. `placeStars` is still needed for up to ten groups. Contrast: label plaques and panels are solid, so text contrast is unaffected by the sky; the glass cards need a measured 4.5:1 check against both scenes.

## Open after Revision 1
- Everything not yet browser-checked: Praktikan idle, Asisten slot and live, each banner kind, worst case (ten groups, long name) in the new style, 1280x600, both themes of the Logo and Divisi sections.
- Foto Bersama and Acara keep today's content and behaviour; their new look is not designed yet.
- The "Golden Hour" and "Night Watch" names, the stage names in the banner rail, and the example numbers are placeholders.

---

## Revision 2 (16 Nov 2026, afternoon: whole-web scope, built)
- **Scope grew from Home to the whole web.** Decisions: glass shell with solid reading plates; everything defaults to Normal detail (Low and High Detail stay a choice in Tampilan); animated by default, still when Low Detail or motion tier 0.
- **Built:** a site-wide painted scene behind every page (`scripts/cosmos/painters.ts`, `scripts/scene.ts`, `styles/scene.css`, mounted by `Cosmos.astro`, replacing `sky.ts` as the mounted sky). Islands bob, clouds drift, sparkles twinkle, waterfalls run, the aurora sways (edges faded, sized to the viewport); layers lean toward the cursor and a soft light follows it (Normal and High Detail); petals, birds and comets are High Detail only. Comet bug fixed (it travelled tail-first).
- **Glass kit** (`styles/glass.css`): `.panel`, dialogs, drawers and popovers are glass; `.glass` variants (tint, frost, aurora, gleam) and `.plate` for solid reading areas; Low Detail and tier 0 fall back to the old solid surfaces. Hover rules are behind `(hover: hover)` and no plain `ease-in` is used, as the repo's motion tests require.
- **Home, signed in** (`home/Observatory.tsx`, `observatory.css`): no big glass card (it blurred the sky away, user rejected it). The sky stays clear; small glass chips carry the Langit Lab title and the live counts; the compact welcome card sits on the left and the constellation of group stars fills the rest of the width beside it, as sparkle stars (`lib/home-sky.ts` `placeStars`, tested) with glowing lines and a thick glowing own-group ring. Rasi Modul is one glass band whose segments are the links.
- **Visitor hero:** a bigger logo with four glass readouts around it; 3 mirrors 1 and 4 mirrors 2.
- **Banner:** glass with a broadcast tile. **The 3 Nov rule stands: no stage names on the banner** (Revision 1's named rail is dropped).
- **Filosofi Logo and Enam Divisi:** restyled on their existing markup (blueprint stage, numbered glass cards, PCB-board details); content and behaviour unchanged.
- **Fixes:** the navbar Praktikum button no longer jumps (centering moved from `transform` to `translate` on desktop and phone); Dasbor greeting and module-line card are top-aligned.
- **Sweep 1 (16 Nov, evening):** an automated check lists every text node with no frosted or solid surface behind it (run per route with mocked API answers). It found three real problems, all fixed: the footer, the Privacy and Terms prose, and the shared page header sat straight on the painted sky. They now ride a frosted reading plate (`.reading` in `glass.css`, the footer's own plate, `.page-header` in `page-header.css`), solid at Low Detail and motion tier 0; the Server Lab divider label is a small frosted chip. Phone width (390) of signed-in Home: group labels near the right edge flip left, and on phones only your own group keeps its full label (no more 5px sideways overflow). Checked dark and light: Dasbor, Akun, Jadwal, Privasi, Home at 390, 820 and 1440.
- **Sweep 2 (16 Nov, night):** measured worst-case contrast of the glass tints (dark panel 3.96:1 over the lavender aurora, now about 4.7:1 after a denser tint; light clear tint a little whiter); the light-theme banner eyebrow moved from 3.2:1 to about 5:1. All six banner kinds (visitor, praktikan, candidate, cut, panitia, asisten) and the Asisten Home card checked in both themes. Profil Lab headings, event-kind titles, photo captions and edition counters (Foto Bersama, Acara) now ride frosted plates. An Asisten who holds several groups sees numbers only on phones.
- **Not done yet:** Konsol, Oprec panel and Penilaian with real data (no backend here; the mocked check only proved no unbacked text); push, PR and deploy.
