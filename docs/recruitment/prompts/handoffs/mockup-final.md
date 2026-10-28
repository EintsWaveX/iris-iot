# mockup-final · Handoff for the real build (M7 final sweep, then M8, 28 Oct 2026)

- Session: M7 (final sweep of the mockup after M1 to M6), then M8 (the user's 28 Oct decisions applied in place), 28 Oct 2026
- Source: `~/Downloads/design-review/mockups/recruitment/` (Version 19 published; the M8 edits are on disk, not yet published). Backups: `recruitment-v16`, `recruitment-pre-wave-a`, `recruitment-pre-m8` (the Version 19 state).
- Commits, migrations: none. `apps/web` untouched. The real app is rebuilt from scratch from these mockups (DECISIONS-28OCT.md); do not port old app screens.

## 1. Screen list (picker id, what it is, real component it maps to)

Registered screens (37) and their groups. Every state is a variant menu in the picker.

| Group | id | Screen | Embeds / maps to |
|---|---|---|---|
| R1 | `r1-home` | Home with recruitment banner (Daftar opens the team's Google Form) | Home banner |
| R1 | `n7-caas` | /recruitment for a CaAs: eight-star fogged journey, one top card, envelopes, Jadwalku, Berkasku, Tubesku, Mundur. Pre-journey states (Tamu, Belum buka, Buka, Menunggu verifikasi, Perlu perbaikan) are this page | `Fog`, `N7.CaasTools`, `RevealStage`, `PickCard/PickDialog/ChangeDialog` (take a `cfg`), `N7.R5.CaasTubes`, `N7.R6.cfgCaas`, `N7.R8.FinalEnvelope` |
| R1 | `r1-panel` | Panel Panitia: tabs Ringkasan, Kalender, Kandidat, then the registered stage tabs, Panitia | `PanelPage`, `Funnel`, `Todo`, `Today`, `Kandidat`, `CandSheet`, `P9.REC2_TABS` |
| R1 | `n7-latihan` | Practice mode (sandbox, design note only) | `N7.Latihan` |
| R1 | `r1-kalender` | Calendar and editor (Ketua, Acara) | `KalenderTab` |
| R1 | `r1-panitia` | Panitia board | `PanitiaBoard` |
| R2 | `n7-cutting` | Cutting, one screen with a Tahap tab per case (Berkas, Tes Tulis, Wawancara, Tubes, Mengajar); side drawer for the candidate | `N7.Cutting` (+ `wpool`, `DEF`, `ANN`) |
| R2 | `n7-plot` | Plotting (Slot, Permintaan, Papan) with a Tahap dropdown | `N7.Plot`, `R2P.Board`, `R2P.Requests`, `SlotSetup` |
| R2 | `r2-berkas` | Berkas review queue (side drawer) | `R2P.BerkasSheet` |
| R2 | `r2-qr` | Attendance wall and hub, stage aware (First Meet, Tes Tulis, Wawancara, Tubes, Mengajar) | `R2P.QR` (`QR_STAGES`) |
| R3 | `r3-checkin` `r3-soal` `r3-keadaan` `r3-putar` `r3-lc` | Candidate test flow: check in, runner, states, draw, Live Coding | `screens-rec3*.js` |
| R3 | `n7-malam` | Malam Ujian console (Persiapan, Berjalan, Selesai); seat and Room Setup are side drawers | `N7.Malam` |
| R3 | `n7-bank` | Bank Soal | `N7.Bank` |
| R4 | `r4-plot` `r4-slotku` `r4-lembar` `r4-nilai` `r4-template` | Wawancara: pick schedule, my slots, the sheet, scores, template | `N7.R4.*`, `WawTab` |
| R6 | `r6-plot` `r6-slotku` `r6-lembar` `r6-nilai` `r6-template` | Mengajar: same shape as R4 | `N7.R6.*` |
| R5 | `r5-tubes` `r5-lembar` `r5-nilai` `r5-template` `r5-caas` | Tubes: topics, check-in, submission, Presentasi; sheet, scores, rubric; the CaAs card | `N7.R5.*`, `TubesTab` |
| R8 | `r8-final` `r8-hasil` `r8-rayakan` `r8-amplop` `r8-tutup` | Penerimaan (Ketua confirms list), Jadikan Asisten, full-screen celebration, final envelope, closed edition | `N7.R8.*`, `Penerimaan` |

Retired and removed in M8 (registrations, aliases, `P9.OLD`, the components only they used): `r1-daftar r1-caas r2-caas r2-jadwal r2-amplop` (now `n7-caas`), `r2-cutting` (`n7-cutting`), `r2-plot` (`n7-plot`), `r3-konsol r3-ruang r3-lcpanel` (`n7-malam`), `r3-bank` (`n7-bank`). `P9.OLD` and the aliases of the retired screens are gone (M8, section 8); their notes moved into the live screens.

## 2. Data each screen needs (from the mockup data files)

- `rec-data.js`: `R.EVENTS` (Calendar: kind, gates, window, place, internal), `R.PANITIA`, `R.DIVS`, `R.CANDIDATES`.
- `rec3-data`, `rec4-data` (S4), `rec5-data` (S5), `rec6-data` (S6), `rec8-data` (S8): slots, rooms, rubric parameters, templates, `CFG` objects. The Daskom DOCX is only a reference: every question, parameter, crew size and case rule is an Akademik-editable default.
- API-side fog: a CaAs receives only what they need now (passed stages clear, current stage lit, rest foggy). Filter in the API, never only in CSS. Dates of later stages are STC.
- Envelope hold: the result of a stage (star move, Diterima welcome) must come to the client only when the CaAs opens the envelope.

## 3. Rules and decisions (do not re-open)

Surfaces: huge centered modal by default; side drawers only for the Cutting candidate, the Berkas review queue, and Malam seat plus Room Setup. Popovers only for small menus (audited: all `P9.Pop` uses in the app (16) are small menus or modals, all drawers without `side` are modals). "CaAs" spelling. Laptop first, phone checked last. Active tab = underlined in the area colour with a focus ring (see section 6). STC (Subject to Change) tag on Tubes, Mengajar and Penerimaan values and on Calendar events of those stages.
Calendar: Pilih Jadwal windows, Tes Mengajar 22 to 24 Dec 18:30 to 21:00, Susulan Mengajar Sat 26 Dec, Cutting Mengajar 4 to 5 Jan 2027, Pengumuman Mengajar and Penerimaan 6 Jan 2027 12:00 (same day, separate envelopes). QR walls: Tubes Mon 14 Dec (inside 13 to 17 Dec), Mengajar Wed 23 Dec (inside 22 to 24 Dec); all weekdays checked against 2026/2027.
Late grace 10 minutes; Susulan days follow the Calendar (Interview Fri 4 Dec); any active Asisten may examine (about 25 assumed); interview shift 1h45 (2h max), two interviewers per booth; the private 1 to 5 level per parameter is our proposal.

Decided by the user on 28 Oct 2026 (DECISIONS-28OCT.md), to be built in the follow-up M8 and in the real app:
- Mengajar: a PJ per evening (STC, count and rooms editable); 3-minute changeover and top-24 start; an unanswered Susulan offer counts as withdrawn, and Panitia can record the answer or reinstate the CaAs by hand (chat-app answers).
- Penerimaan: the Ketua closes the edition by hand and it also closes automatically N days after the reveal (N editable); only the Ketua overrides a Pleno decision; quota of new Asisten about 24 (editable target shown in Tinjau); the Pengumuman Mengajar envelope already has respectful different wording for people who will not be accepted, the Penerimaan envelope stays separate; Tidak diterima shows no reason.
- Tubes: team mode also covers submission and scoring (one submission, one score set per team); Solo stays default.
- Kandidat: Ketua and Admin both get Tambah CaAs; Kandidat shows current stage and status as a filter and column with a link to that stage's Cutting tab, no duplicate scoring.
- Cleanups: retired component-source screens are removed; rebuild from scratch.
- Envelope surprise: the stage star and the Diterima welcome do not move before the envelope is opened. Implemented by M7 (see 6).
- Editability rule: everything that can reasonably be edited is editable by the right Panitia role (table in section 7).
Implemented in M8 (all of the above): PJ per Mengajar evening, manual plus automatic close, the gentle Pengumuman Mengajar wording, team scoring, Ketua Tambah CaAs, per-stage state in Kandidat, Panitia recording or reinstating a Susulan answer, removal of the component-source screens, the quota of 24, the editability pass (section 7).

## 4. Parity audit

- Whole mockup: sweep8 `bad: 0` over every screen, every variant option, dark and light (37 screens, 100+ menus); click9 35 parity clicks pass; the S1 to S3 exact-name match (183 of 196) was not touched by M7 (no variant option removed; two options added: `n7Keadaan=selamat`, menu `n7Seal`).
- Extra passes run: Low Detail and HD, reduce motion on and off, English (`lang en`), 37 screens each: 0 errors.
- Not re-run: a literal diff against `recruitment-s4` (the earlier merge audit stands; nothing in S4 was reached by M7 edits).

## 5. Findings

Fixed by M7 (details in section 8): nav tabs for Wawancara, Tubes, Mengajar and Penerimaan had no active underline (area colour missing); the panel tab bar overflowed at 1440 (Panitia cut off) and hid tabs; stale 7 Jan date for Penerimaan; "Rapi:" picker titles; Cutting stage tabs and Bank sections were pills; no focus trap or focus return in any dialog; phone header overlap; phone page widened by Cutting, Bank and Tubes strips; light-theme contrast of the new tab colour and the Kalender "Berikutnya" label; STC chip missing on the Tubes, Mengajar, Penerimaan tab headers; closed edition only showed a banner.

Resolved in M8: (1) m6flow now opens the sealed envelope first (the tools copy `m6flow.mjs` is the updated one); (2) every arrival starts sealed, Naik Tahap and a direct Tahap pick alike (`n7Seal` default is `tutup`); (3) Mengajar has its own area colour (indigo `#7c8cff`; Tubes stays lime); (4) the closed edition now locks every writing button (primary, danger, inverse, ghost, icon, switch, stepper, segmented, hold), leaving only looking controls (Lihat, Unduh, Ekspor, Cari, Kembali, filter chips, tabs); the flag no longer leaks into the panel when it is picked fresh from the picker.
Still open:
5. Contrast: remaining below 4.5 are disabled controls only (Mulai ghost buttons, Kunci Hasil hold, Naik Tahap at the end, and every button of a closed edition), accepted.
6. Mandarin not provided for the new strings (not mandatory).
7. Cleanup decisions: retire `r1-daftar` (already an alias; Daftar opens the Google Form) yes; the Latihan sandbox, the Pencipta label and API-side fog are design notes only; component-source screens removed (M8, done).
8. Phone: pages and modals tested at 390 for the screens above (no horizontal overflow, modals and footers inside the frame). Candidate-side phone flows of M3, M5 and M6 (Tubes check-in photo, QR scan) were only checked for overflow, not for task completion.
9. `smoke.mjs`/first load of the mockup is sometimes slow (CDN scripts); retry once.

## 6. M7 behaviours worth copying into the real build

- Envelope hold: `N7.GATE` maps each stage to the envelope(s) that announce arriving there (firstmeet: berkas; wawancara: tulis; tubes: wawancara; mengajar: tubes; diterima: mengajar and penerimaan). While one is sealed the star, header badge, Diterima welcome and calendar day stay on the previous stage; opening it animates the star forward.
- One tab style: area-coloured underline that draws in, focus-visible ring, same on the panel nav, every `TabLine`, and as an inset underline on the sheet step, evening and night strips.
- Panel nav folds by priority: Bank Soal, Panitia, Kalender, then the latest stages go into Lainnya, and Lainnya shows the open tab's name. Caps: under 820 four, under 1100 five, under 1440 seven, under 1680 nine, wider all twelve; panel tabs in process order.
- Dialogs, drawers and sheets: focus moves in, Tab stays inside the top layer, Escape closes, focus returns to the opener.

## 7. Editability audit (hard-coded value, where the edit surface is, role, state after M8)

| Value | Edit surface and role | Default kept | State |
|---|---|---|---|
| Event dates, windows, places, STC | Kalender editor (Ketua, Acara); a save now writes through to `R.EVENTS` | yes | done |
| QR wall date, hours, place (First Meet, Tes Tulis, Tubes, Mengajar) | read from the Calendar event (`liveCfg` in `screens-rec2p.js`); Interview keeps its shift hours | n/a | done |
| Penerimaan date and hour | the Penerimaan Calendar event (`S8.CFG.date`, `time` are getters) | yes | done |
| Slot capacities, shift length, booths, rooms | Plotting Slot (Ketua, Akademik); minutes and changeover in the Template | yes | exists |
| Interviewers per CaAs, PJ luar and dalam, panel size | Template tabs (Akademik) | yes | exists |
| PJ per Mengajar evening (count and who) | count in Template Mengajar, who in Plotting Slot (PJ Tiap Malam) (Akademik, Ketua, Admin) | 2 | done (STC) |
| Interview and Mengajar parameters, question cards, minutes, weights | Template tabs (Akademik) | yes | exists |
| Tubes rubric, topics, capacity, team size, spin seconds, submission limits | r5-template, Topik dan Brief, Atur Isi Pengumpulan (Akademik, Ketua) | yes | exists |
| Tubes team mode (one submission, one score set) | switch in Topik dan Brief (Akademik, Admin); size is a stepper | solo | done |
| Special-case rules, late grace | R4: new Aturan Terlambat dan Susulan in Template Wawancara (10 min); R6 Aturan Kasus | 10 | done |
| Susulan answer deadline (Mengajar) | Template Mengajar, Aturan: days before and hour | 1 day, 12:00 | done |
| Cutting starting Top N, minimum score and deck target | Atur Titik Awal in Cutting (Ketua, Akademik); Mengajar numbers live in its Template | per stage | done |
| Penerimaan target quota | Tinjau stepper (Ketua) | 24 (STC) | done |
| Edition close: automatic on or off, N days, retention months | Tutup, Cara Edisi Ditutup (Ketua, locked once closed) | on, 14 days, 6 months | done (STC) |
| Envelope wording (five stage envelopes, the final one, the gentle Mengajar wording) | Ubah Teks Amplop in Cutting (Ketua, Akademik), per envelope with preview and Kembalikan Bawaan | yes | done |
| Documents a CaAs sends: names, required, typed or PDF, size limit | Atur Berkas in Kandidat (Admin, Ketua); one list `R.DOCS` feeds the sheet, Berkas desk, Tambah CaAs and Berkasku | 8 documents, 5 MB | done |
| Berkas fix reasons, the Susulan offer texts | not editable | n/a | not done |
| Dates inside the candidate pickers' copy (Pilih Jadwal windows, change deadlines in `cfgCaas` of R2, R4, R6) | typed strings; should read the Calendar events | n/a | not done |
| Mockup clock per stage (`ROAD`, `HARI`), sample counts, codes and names | mockup-only demo data | n/a | none (not product data) |

## 8. Edits made by M7 and M8 (all under `mockups/recruitment/app/`, nothing in `apps/web`)

### M7
1. `screens-rec1.js`: HARI diterima 6 Jan, RecNav fold, `PANEL_ORDER`. 2. `screens-rec7.js`, `screens-rec7b.js`: picker titles, STC chip in `N7.Head`. 3. `screens-rec7b.js`: envelope hold in `Fog`, menu `n7Seal`. 4. `screens-rec7c.js`: `N7.GATE`, `CaasTools` `onGate`. 5. `core.js`: `P9.TabLine` icons, focus trap. 6. `screens-rec2p.js`: Berkas tabs. 7. `screens-rec8.js`: closed-edition lock. 8. `rec7.css`, `rec9.css`: tab style, phone rules.

### M8 (28 Oct, in place, backup `recruitment-pre-m8`)
- Cleanup: removed the registrations, aliases (`core.js`) and `P9.OLD` (`main.js`) of r1-caas, r2-amplop, r2-caas, r2-jadwal, r2-cutting, r2-plot, r3-bank, r3-konsol, r3-ruang, r3-lcpanel, and every top-level component only they used (`CaasPage`, `CaasPage2`, `AmplopScreen`, `JadwalScreen`, Konsol `Console`, `Grid`, `Feed`, `Tile`, `SeatDrawer`, `RoomPage`, `LcPanel`, `DocsCard`, `DocsDrawer`, `Inbox`, `ThanksCard`, `NextCard2` and their data). Their notes moved into n7-caas, n7-cutting, n7-plot, n7-bank and n7-malam. Checked by a dead-declaration script and sweep8.
- Mengajar (`rec6-data.js`, `screens-rec6.js`, `rec6.css`): `CFG.pj`, `PJ_PLAN` per evening, PjCard in Plotting Slot, PJ flags in Periksa Papan, PjDuty card in Slotku, Template steppers (PJ, Susulan deadline); Susulan: Catat Jawaban, Ubah Jawaban, Pulihkan (required reason), who, channel and note kept, undo; fifth sample absentee.
- Penerimaan (`rec8-data.js`, `screens-rec8.js`, `rec8.css`): quota card in Tinjau, Pleno override flag and toast (only the Ketua edits), close both ways (Cara Edisi Ditutup, three states, timeline), date and hour read from the Calendar.
- Envelopes (`screens-rec7c.js`): gentle Mengajar wording (own title, note about no Penerimaan envelope), `WordsEditor`, `S8.WORDS`; `CutDefaults`.
- Tubes (`rec5-data.js`, `screens-rec5.js`): `S5.rep`, `units`, `members`, `unitName`; `S5.ORDER` getter that re-deals on mode change; `buildSheets`; submission rows, order, sheets, Penilaian and Cutting follow the team.
- Kandidat (`screens-rec1.js`, `rec9.css`): `placeOf` stage and status, Tahap filter, column, Cutting link (no scoring), Tambah CaAs for Ketua; `DocsEditor`; `R.DOCS` in `rec-data.js` feeds `screens-rec1.js`, `screens-rec2p.js`, `screens-rec7c.js`.
- M7 leftovers: `n7Seal` default sealed; Mengajar colour `#7c8cff` (`AREA`, nav CSS); the closed-edition lock covers every writing button; the closed flag travels only from an r8 screen into the panel.
- Calendar write-through (`KalenderTab`), QR wall from events, R4 Aturan Terlambat dan Susulan.

Tests after the edits: see STATUS.md (sweep8 bad 0 with the retired ids gone, click9 35 ok, m6flow/m8flow 0 fails, phone 390 clean over 37 screens and 13 new states, contrast only disabled controls).

## 9. Open questions for the user

1. Is the Ketua-only override of a Pleno decision enough, or should an override also need a typed reason (the mockup logs it under the Ketua without one)?
2. A CaAs who passed the Cutting but is not accepted gets the "passed" Mengajar envelope and then the Penerimaan envelope that says no. Is that the intent, or should they see the gentle wording at Mengajar too?
3. Should the dates in the candidate pickers read the Calendar (the mockup still types them)?
4. Team mode: one score set per team means every member carries the same score into the Cutting; the pass decision stays per person. Right?
