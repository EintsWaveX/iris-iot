# SeeLabs two-way sync (read-back into IRIS) — design

Asked 2026-10-16/17. Builds on the Phase 14 robot (IRIS ASO
`orangepi/agent/seelabs.py`, iris-iot `api/_lib/seelabs-robot.ts`), which
today only goes one way: after Kirim Nilai, or an edit after it, IRIS saves
a group's scores in SeeLabs and reads them back to verify. Nothing that
changes in SeeLabs ever reaches IRIS. Practicum has not started yet (first
real Kirim Nilai in the week of 19 Oct), so this is a new feature, not a fix.

## Why

Asisten sometimes enter or correct scores in SeeLabs directly instead of in
IRIS. Then IRIS shows one score to the Praktikan and SeeLabs (the official
record, and the source of Rekap BAP pay) holds another, and nobody notices.
IRIS should stay where scores are entered, but it must see what SeeLabs
holds and either take it in or point at the difference.

Success: a score changed in SeeLabs shows in IRIS within minutes on a
practicum day, without anyone pressing anything. The Asisten fixes what IRIS
cannot take over by itself in one place. A pay mismatch between Rekap BAP
and IRIS Bayar is visible before anyone is paid.

Anti-goals:
- IRIS changing Bayar on its own because of SeeLabs. Pay mismatches are
  flagged only.
- IRIS guessing D1 to D4 or L1, L2 from a SeeLabs average.
- A loop where a value copied in from SeeLabs is sent back to SeeLabs as a
  new save.
- Signing anyone out of their own SeeLabs tab, or any SeeLabs write that
  the Asisten did not ask for (the read-back only reads).

## What SeeLabs holds (recorded, see memory seelabs-internals)

- Lihat Nilai lists only the signed-in account's own saves, per KLP and
  module, with a Rincian link per group. No scores on that page.
- Rincian holds per Praktikan: Presensi (Hadir/Absen), TP, TA,
  Praktikum = mean(D1..D4), Jurnal = mean(L1, L2), both rounded to 2
  decimals. D1..L2 themselves are not stored. Rows carry names only; the
  NIM comes from Lihat Nilai's row ids.
- Rekap BAP (`/asisten/laporan/bap`) says attendance, and so pay, comes from
  score input. Its layout has **not been recorded yet**.
- SeeLabs has no push or webhook: the only way to learn of a change is to
  look.

## Decisions (user, 2026-10-16/17)

1. **Two-way.** SeeLabs changes flow into IRIS too.
2. **Which accounts.** Only Asisten whose SeeLabs account is connected to
   IRIS (seelabs_akses aktif). Each is read with their own account, the way
   the robot already saves, since Lihat Nilai shows only one's own saves.
3. **TP and TA** changed in SeeLabs are copied into IRIS at once.
4. **A changed Praktikum or Jurnal average** is not copied (IRIS keeps
   D1..D4 and L1, L2). IRIS marks the group "Beda di SeeLabs" and the
   Asisten either fixes D1..D4 / L1..L2 in IRIS (which then re-sends as
   today) or resends IRIS's values to SeeLabs.
5. **A group scored only in SeeLabs, never in IRIS:** IRIS copies TP and
   TA, shows the two SeeLabs averages, and asks the Asisten to fill D1..D4
   and L1, L2. The Praktikan see nothing of it until that is done and the
   group is sent.
6. **Rekap BAP vs IRIS Bayar:** compared, flag only, Bayar never changes.
   The Asisten sees their own flags on Home and Penilaian; the Admins see
   every flag together on the pay page (Bayar).
7. **Praktikan see a copied TP or TA right away** when their group was
   already sent. Every copy writes a line in the score history saying it
   came from SeeLabs, so anyone can see where a number came from.
8. **How soon:** as soon as possible. Proposed and accepted:
   - on practicum days, 06:30 until the last session of the day ends: each
     connected Asisten's groups of the current module read about every
     5 minutes, Rekap BAP in the same round;
   - outside those hours: hourly, plus one full nightly pass covering
     older modules;
   - right after every IRIS send (the read-back that already exists);
   - a Periksa Sekarang button on Penilaian reads at once;
   - IRIS screens update live (siaran topics) when a round finds a change.

## Stage 0: two things to learn first (before any build)

The schedule above rests on one risk, and pay comparison on one unknown.
Both are checked first, on a real account with the user's go-ahead, through
the user's own signed-in browser tab or the robot (never typing passwords).

1. **Does the robot's sign-in or sign-out end the Asisten's own SeeLabs
   session?** The robot signs in and POSTs /logout after every job. Test:
   the user stays signed in to SeeLabs in a browser tab while the robot runs
   a read job for the same account; check the tab still works afterwards.
   If it does end it, the 5-minute rhythm is not acceptable as is; options
   then are reading less often during sessions, or skipping /logout and
   reusing one robot session per account. That choice comes back to the
   user.
2. **Record Rekap BAP's layout**: component name, filters (praktikum,
   month, week?), columns, and how one row maps to an IRIS pay unit
   (date, shift, KLP, account). Write it into memory seelabs-internals.
   The pay comparison is planned as its own later stage once this is
   known; score read-back does not wait for it.
3. **Lihat Nilai's leftovers**: does an account still list older saves
   (earlier semesters or test saves), and does any page show when a save
   was made.

Results 2026-10-17 ~01:15 WIB (NUE's account, through athena, read only):
- **Rekap BAP** is component `praktikum.asisten.laporan.rekap-bap-asisten`
  with one filter, `i_praktikum` (wire:model.live, 237 or 238). Heading
  "Riwayat Kegiatan Praktikum", table **No | Hari Jaga | Shift | Tanggal
  Kegiatan**; empty it reads "Tidak ada riwayat kehadiran / BAP untuk
  praktikum ini." Both praktikum are empty for NUE (the test saves of
  10-13 were deleted). So a BAP row is one **day and shift per account**,
  with no KLP and no amount. The pay check is therefore: for each date and
  shift where IRIS has pay units saved through an account, that account's
  Rekap BAP should list that date and shift, and the other way round. Whether
  two groups saved in one shift give one row or two is still unseen (no
  data yet); the first real week shows it.
- **Lihat Nilai** for NUE lists nothing in 237 or 238 (all modules): no
  leftover or test saves. Modules 1 to 14 are offered. Whether 237/238 are
  new ids each semester is not shown anywhere; the current-semester guard
  stays.
- **Sign-out check: passed.** With NUE signed in to SeeLabs in a browser
  tab (athena), Test Again on Akun ran robot job 33 (sign in, then POST
  /logout, through the campus address, same SeeLabs app) at 01:22 WIB. The
  tab's next Lihat Nilai load still came back signed in. A robot session
  ending does not end the Asisten's own, so the 5-minute rhythm stands and
  the robot keeps signing out after each job.

## How it works

### The read job (Pi agent)

A new job kind `baca` (read only), next to uji/nilai/jaga/kelompok:

- Input: `{praktikum: [237, 238], modul: [n...], bap: bool}`. One job per
  account per round.
- Signs in once, opens Lihat Nilai per praktikum and module, opens every
  Rincian it lists, and (when `bap`) reads Rekap BAP. Signs out as today,
  unless Stage 0 says otherwise.
- Result `bukti`: `{nilai: [{praktikum, klp, modul, baris: [{nim, presensi,
  tp, ta, praktikum, jurnal}]}], bap: [...] | null}`. Values as SeeLabs
  shows them, no rounding on the Pi.
- Never calls a SeeLabs action that changes anything (no Input Ulang, no
  Hapus, no Kelompok actions). Tests prove only GET pages and
  `wire:model` filter updates are sent.
- Protocol bump (7 to 8) so the site only sends `baca` to a Pi that knows it.

### Scheduling (site)

- `harianBilaPerlu`'s neighbour, called from the Pi heartbeat: queue a
  `baca` per connected account when its last read is older than the
  current interval (5 min in practicum hours, 60 min otherwise; nightly
  one with all modules). The existing one-waiting-job-per-thing unique
  index keeps the queue from piling up.
- Practicum hours come from the day's jadwal/sesi (first slot 06:30 to the
  end of the last session that day). TOT sessions never count.
- Periksa Sekarang queues a `baca` for the pressing Asisten's account at
  once (and for every account when an Admin presses it on Bayar).
- Robot switch off, no approved key, or a `ditolak` account: no reads, as
  with every other job.

### Taking a result in (site)

For each SeeLabs row, find the IRIS place: praktikum (237 Reguler, 238
INT) + KLP + modul → the roster group and its session of that module
(the same mapping `muatSeelabs` uses in the other direction), then the
Praktikan by NIM.

Compare against what IRIS last sent or holds:

| SeeLabs vs IRIS | What IRIS does |
|---|---|
| same (TP, TA exact; means within the existing MEAN_TOLERANCE) | nothing; mark the group "sama" with the time |
| TP or TA differs | copy into nilai at once, history line `nilai_set` with `sumber: "seelabs"`, live update |
| Praktikum or Jurnal mean differs | no copy; group flagged **Beda di SeeLabs** showing both values |
| presence differs (Hadir in one, Absen in the other) | flagged with the mean difference it always comes with |
| group or Praktikan in SeeLabs but nothing in IRIS | decision 5: TP/TA copied, averages shown, group flagged until the Asisten fills D/L and sends |
| in IRIS (sent and verified) but gone from SeeLabs (deleted there) | flagged "Tidak ada di SeeLabs"; nothing deleted in IRIS |
| SeeLabs row maps to no IRIS session | listed for the Admins as unplaced; nothing written |

**What counts as a SeeLabs change (my call).** IRIS keeps a copy of the
values each verified save put in SeeLabs (today only a hash is kept), and a
read compares SeeLabs against that copy, not against IRIS's live values.
- SeeLabs differs from the last save, IRIS has no send waiting: a real
  SeeLabs change, handled by the table above.
- An IRIS edit is waiting to be sent, or its nilai job is queued, running
  or retrying: the group is skipped this round. IRIS is newer and its send
  will overwrite SeeLabs; the next read checks the result.
- Both changed in the same gap since the last save: IRIS wins, because
  IRIS is where scores are entered, and the history line notes the SeeLabs
  value that was overwritten.
- No saved copy to compare against (marked saved by hand after the
  bookmarklet, or sent while the robot was off): any difference is
  flagged Beda di SeeLabs, TP and TA included, and nothing is copied. The
  first agreeing read stores the baseline.

**Placing a SeeLabs row (my call).** Rincian has no date or shift, so each
Praktikan is placed by NIM: the session of that module they are a member of
(sesi_anggota), not TOT, not cancelled. With more than one (a regular
session and a susulan), the one whose group was sent through this account,
else the latest. A NIM with no session of that module in IRIS goes to the
Admins' unplaced list; IRIS never adds a Praktikan to a session from
SeeLabs. A regular session someone missed is never flagged "Tidak ada di
SeeLabs" for that Praktikan when their susulan session holds the scores.

**Lent accounts (my call).** A group saved through a lender's account is
read with the lender's account, since only that account's Lihat Nilai lists
it. The flag goes to the group's scorer (who can fix the scores), and the
lender sees it read only. Periksa Sekarang reads my own account plus every
account my groups this module were saved through. A group found only in
SeeLabs belongs to the account that saved it. Pay flags go to the account
holder (Rekap BAP is per account) and to the scorer of the unit concerned.

**Old or test entries (my call).** Only modules and KLPs with a session in
the current semester are taken in; anything else is ignored, not flagged.
Stage 0 also checks whether Lihat Nilai still lists older saves (praktikum
237/238 carrying over between semesters, or leftover test saves) and, if a
date is shown anywhere, the guard uses it too.

**No echo back.** A copy from SeeLabs updates the stored "last sent"
fingerprint (sidik) for that group as well, so it does not count as an
edit and does not queue a nilai job.

**The flag clears** when a later read finds SeeLabs and IRIS agree, whether
because the Asisten fixed IRIS (and the normal re-send went out) or pressed
Kirim Ulang ke SeeLabs.

### Pay (Rekap BAP)

After Stage 0 records its layout: per account, compare Rekap BAP's rows
with that account's unit_bayar rows (nim_akun_seelabs, date, group) for
the same period. Each mismatch (a unit in one and not the other, or a
different count per day) becomes a flag. Nothing in unit_bayar, transfer
or the Phase 18 cuts changes.

### Screens (all existing places, add only what is needed)

- **Penilaian › Praktikum**, on the group's existing SeeLabs strip: a
  "Beda di SeeLabs" state with both values side by side per Praktikan, and
  two actions: Ubah di IRIS (opens the group's scores) and Kirim Ulang ke
  SeeLabs (queues the normal nilai job). A small "Dicek 5 menit lalu" line
  and the Periksa Sekarang button.
- **Home**, in the existing RobotInbox: one row per flagged group and per
  pay flag of mine.
- **Bayar** (Admins): a card listing every pay flag with the Asisten, day
  and what each side says, plus the unplaced SeeLabs rows.
- **Praktikan**: nothing new; they see a copied TP/TA as their score once
  the group is sent.
- Copy in ID, EN and ZH, no em or en dashes, title case buttons.

### Data

- A small table for read state per group (last read, sama / beda /
  hilang, SeeLabs values as read), keyed like seelabs_ekspor
  (sesi, kelompok), so flags survive between rounds and screens can show
  both values. Migration applied to prod by hand after a pg_dump.
- A table or rows for pay flags per account and day.
- Score history uses the existing audit `nilai_set` line with
  `sumber: "seelabs"` and the account read.

## What's left to the builder

- Exact table shapes, job and result field names, protocol number.
- How to spread reads across accounts in a round so one slow account does
  not hold up the rest.
- Rounding: SeeLabs allows one decimal for TP/TA but IRIS nilai is a whole
  number; my call is round half up and flag when SeeLabs held a non-whole
  value.
- TP from TP grading: a TP copied in from SeeLabs overrides the session's
  TP component as decision 3 says. My call: the TP grader keeps its
  per-question total and shows a note when the session's TP came from
  SeeLabs instead; a later TP grading change writes over it as today (and
  re-sends).
- Retries and back-off for `baca` follow the existing robot rules.
- The rig: extend `tools/fake_seelabs.py` with Lihat Nilai, Rincian and
  Rekap BAP pages and a way to change a score "in SeeLabs" during a test.

## Not in scope

- Changing Bayar from SeeLabs.
- Reading accounts that are not connected.
- Any SeeLabs write beyond the saves that already exist.
- Mangkir/Phase 18 rules (built in parallel by another session; this only
  reads unit_bayar as it stands).
