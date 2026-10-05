# Mode TOT (TOT Only Session) — design and plan

Approved in chat 2026-10-05. TOT = Training of Trainers: the Asisten's weekly
practice run of next week's module, played with dummy Praktikan accounts.

## Decisions (user)

- 60 dummy Praktikan, fixed in code: NIM `D0000N`, D = 1 ASO, 2 ARD, 3 ADS,
  4 ADC, 5 AER, 6 ARM, N = 0..9. Group D is that division, 10 members each.
  Names "TOT ASO 01" .. "TOT ARM 10". NIM-only sign-in like real Praktikan.
- Switch on Preparation, right `jadwal` (Pengelola, Admin).
- Approach A: on switch-on, the live roster (`kelompok` + `anggota`) is saved
  verbatim to `pengaturan` key `tot` and replaced with the dummies; switch-off
  restores it row for row and clears the backup. `praktikan`, slot rosters,
  susulan drafts, `sesi_anggota` snapshots, answers and scores are never
  written. Both directions refused while a session is running.
- TOT sessions: `sesi.jenis = 'tot'`, started any time from the TOT card
  (module, duration; 6 groups), right `pair` in full, like a susulan. The
  roster is not re-copied, only snapshotted. Any module may be used, closed
  or not; while a TOT session runs its module counts as open for dummies.
- Kept, tagged, kept out: no pay units, no SeeLabs export, out of the
  Reports list by default (a TOT filter shows them, with a TOT pill), out of
  Home stats, Team/Account earnings and "Siapkan Sesi Berikutnya".
- Warn only: no auto-off. Banner on every Asisten page while on. Real slot
  and susulan starts refused with `mode_tot`.

## Isolation rules

- Praktikan sign-in: TOT on and NIM not a dummy, or TOT off and NIM a dummy
  -> `mode_tot` refusal with its own message.
- Praktikan cookies: every Praktikan request through the session, modul and
  presentasi dispatchers is checked the same way; a mismatch answers 401
  `sesi_berganti` (the client already signs out on it), `alasan: "mode_tot"`.
- Journal answers keyed by `kelompok_id` are shared ids between TOT and real
  groups. Off-session reads exclude TOT sessions for real Praktikan; dummies
  only ever see TOT-session rows and never write home-practice rows.

## Plan (one commit per step where sensible)

1. `src/lib/tot.ts`: divisions, dummy list, `isNimTot`, `bacaModeTot()`
   (pengaturan read), types. Unit tests.
2. `api/_lib/tot.ts`: `nyalakanTot` / `matikanTot` transactions with the
   backup/restore; GET/POST `/api/session/tot` (state, toggle, audit).
   Tests for exact restore.
3. Sign-in + cookie guard (`src/lib/auth.ts`, dispatchers).
4. Session start: `jenis: "tot"`; refusals for slot/susulan while on.
5. Module gate for the running TOT session's module; off-session answer
   scoping in `api/modul`.
6. Exclusions: bayar, seelabs, laporan-data, beranda, phase8/persiapan.
7. UI: Preparation TOT card (switch, confirm, start TOT session), Asisten
   banner, sign-in message (ID/EN/ZH), Reports TOT filter + pill, `jenis`
   unions.
8. Checks (tsc, eslint, prettier, vitest, build), rig round trip, push,
   prod pg_dump before first switch-on, then the rehearsal using TOT.
