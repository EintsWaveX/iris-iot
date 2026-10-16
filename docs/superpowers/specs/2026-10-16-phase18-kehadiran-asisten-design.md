# Phase 18: Kehadiran Asisten (auto-start, Telat, Mangkir) — design

Asked 2026-10-16. Brings back the lateness system removed on 2026-10-05
(ac51562, dropped by migration 0027), now on a fixed, published clock so it
is fair enough to touch pay.

## Why

The first Mangkir was removed because whole sessions often started 10 to 15
minutes late (rain, prayer, Friday) and a clock rule cut pay unfairly. The
lab now runs on clear times: IRIS starts the session itself at :25, so the
clock is the same for everyone, and the slot's PJ can move it when a whole
session is legitimately late. With that, lateness can be judged and paid
automatically, and reported without anyone keeping a sheet.

Success: on any practicum day nobody computes lateness by hand. Each
Asisten sees their own status the moment they check in, the PJ fixes the
rare exception in one place, and Bayar and Laporan already hold the result.

Anti-goals: a rule that punishes someone for a late session start they
could not control; a status that changes pay without a written trail; any
evidence upload, photo or location capture.

## The clock (user)

For a regular slot whose schedule time is HH:30:

| Time | What happens |
|---|---|
| from the start window opening until HH:25 | reminder on every page of the slot's Asisten: start the session |
| HH:25 | IRIS starts the session itself if nobody has |
| checked in by HH:25:59 | Tepat Waktu |
| checked in HH:26:00 to HH:35:59 | Telat 1 to 10 minutes, 2.000 rupiah a minute |
| checked in HH:36:00 or later | 10 minutes late (20.000) **and** Mangkir Mengajar |
| never checked in before the session ends | Mangkir |

Late minutes = floor((check-in − HH:25:00) / 60 s), capped at 10.

**Friday, slot 3** (Sholat Jum'at): the clock's base is 13:00 instead of
12:25. Auto-start 13:00, Telat 13:01 to 13:10, Mangkir Mengajar from 13:11.
That session runs at most until 15:25, when slot 4 starts as usual.

**Praktikum Susulan** follows the same offsets from its own start time
(auto-start five minutes before it). **TOT sessions are exempt.**

General rule for the session cap (my call): a session ends at 150 minutes
or at the next slot's auto-start, whichever comes first (Friday slot 3 is
the only one where that bites today).

## Who is judged

- Everyone **seated** on that date (penugasan-minggu `pasanganTanggal`):
  the regular Asisten, plus accepted substitutes (pengganti) and volunteers
  (sukarela). Listed substitutes who were never seated are not expected.
  (My call: covers follow the same clock as the regular Asisten.)
- **Izin** (user): the excuse itself is agreed in chat outside IRIS; IRIS
  only holds the flag. An Asisten with the Izin flag for that date is never
  Telat or Mangkir. They may still check in when they arrive; that is
  recorded with no penalty. The flag is set by the slot's PJ or anyone with
  the Jadwal right (my call: the same people as today's izin seats in the
  slot drawer).

## Check-in (user: a trust button)

"Saya Sudah di Ruang Praktikum" on the Asisten home (today's slot card),
the running session's page and the reminder banner. One press records the
time; nothing is uploaded. It opens with the slot's start window and stays
open until the session ends. After the press the person sees their status
straight away (Tepat Waktu, Telat N Menit with the cut, or Mangkir
Mengajar).

The old signals (opening the session, acting in it, Tandai Hadir by a
colleague) no longer count as arrival (my call): with a trust button, the
press is the one clear moment. Tandai Hadir stays as a PJ correction.

## The PJ (user: one per slot)

- A new **Penanggung Jawab** on each Jadwal slot, picked from that slot's
  Asisten by anyone with the Jadwal right. Admins and above (hakPenuh) can
  always act as PJ on any slot.
- A Susulan's PJ is the person who made it (my call), plus the full Pair
  right.
- The PJ cannot change their own status (my call); an Admin does.

What the PJ can do, each with a written reason, each in the audit log and
the session's events:

1. **Geser Jam Sesi** (user): move this session's clock once, for
   everyone (e.g. "Hujan deras, mulai 09:45"). The auto-start, Telat and
   Mangkir times all move with it. A later shift replaces the earlier one.
2. **Ubah Status** for one person: Tepat Waktu, Telat N Menit, Mangkir
   Mengajar, Mangkir, Izin, or Ikuti Jam Lagi (back to the computed value).
3. **Hitung sebagai Mangkir** on a Mangkir Mengajar (user: on by default,
   the PJ can switch it off for that person and session).
4. **Tandai Izin** after an Ambil Alih (user): when a cover takes over a
   group whose Asisten never checked in, that Asisten stays judged by the
   clock, and the PJ gets a prompt "WIL belum hadir, kelompok 3 diambil
   alih oleh ABC. Tandai Izin?".

## Auto-start (user: at :25)

- At the auto-start minute IRIS starts the slot's session itself if none is
  running for it, with the slot's own module, group count and roster, as if
  its Asisten pressed Mulai. The session's events say "Dimulai otomatis oleh
  IRIS".
- My call: a failed soft lab check (server offline, service stopped, Module
  4 hotspot off) does not block it; it starts and logs which checks failed,
  and the usual error alert goes to the Asisten. A hard refusal (module
  closed, Mode TOT on, holiday or No Practicum slot) does not start, and
  the slot's Asisten and PJ get an alert instead.
- It must fire within a minute of the time even with no browser open. The
  relay already runs a once-a-minute cron and the server PC beats in; the
  builder picks the trigger (a signed call from the relay cron is the
  likely one), with the start itself idempotent so two triggers can't start
  twice.
- Starting by hand before :25 stays possible and does not move the clock.

## Pay (user: automatic cuts in Bayar)

- **Telat**: 2.000 per late minute, at most 20.000, as a "Potongan Telat"
  line in that person's month in Bayar, tied to the session.
- **Mangkir**: that person's units for that session go to zero.
- **Mangkir Mengajar** counted as Mangkir: units go to zero. Not counted
  (PJ switched it off): only the 20.000 Telat cut.
- **Open question for the user**: when a Mangkir Mengajar is counted as
  Mangkir, does the 20.000 Telat cut also apply on top of the zeroed units?
  (Default in this draft: no, the zeroed session already covers it.)
- A month's total never goes below zero (my call); a cut larger than what
  is left shows in full but takes the total to zero.
- Everything is rebuilt lazily with the units, like today: a status change
  or a clock shift marks the session for rebuild.

## Reports (user: text, like the reports we have)

- **Laporan › Sesi**: a "Kehadiran Asisten" block per session: each person,
  check-in time, status, cut, and any PJ change with its reason; the clock
  shift if there was one; "Dimulai otomatis" when IRIS started it.
- **Laporan** semester view: per person counts (Tepat, Telat, Mangkir
  Mengajar, Mangkir, Izin) and total cuts.
- **Tim** person drawer: the same counts and each late or missed session
  (as the old build had).
- **Akun / Asisten home**: the person's own history this semester.
- Every status is final when the session ends (locked in as the old build
  did); a PJ change after that still works and re-rebuilds pay.

## Screens for the stage 0 mockup

Designed with Emil Kowalski's principles, in the live app's kosmik style,
at the seven widths, ID/EN/ZH where copy is new, no dashes in UI copy, title
case headers and buttons.

1. Reminder banner (every Asisten page of the slot's people, window open to
   :25): countdown to the auto-start, Mulai Sesi and Saya Sudah di Ruang
   Praktikum.
2. Check-in on the Asisten home day card and on the session page, before
   and after the press (each status).
3. Persiapan › Yang Mengajar during the session: a status pill per person
   with the live countdown to :26 and :36, Izin shown as excused.
4. PJ panel: Geser Jam Sesi dialog, Ubah Status menu, Hitung sebagai Mangkir
   switch, the Ambil Alih "Tandai Izin?" prompt.
5. Jadwal slot drawer: the PJ picker and the Izin flag for a date.
6. Laporan session block and the semester table; Tim drawer counts.
7. Bayar: the Potongan Telat and Mangkir lines in a month.
8. The auto-start's line in the session's events, and the hard-refusal
   alert.

## Edge cases (my calls)

- No session, no judging: a slot that never starts (hard refusal) or a
  session that is cancelled (Batalkan) judges nobody.
- Judging starts from the deploy date; older sessions have no check-in
  trail and are never judged (as MANGKIR_SEJAK did).
- The per-minute rate (2.000) and the 10-minute cap sit with the unit rates
  in Bayar (Tim right), not hard-coded.
- A seat left open by an Izin with no cover judges nobody for that seat.

## Left to the builder

Table shape (a new kehadiran_asisten migration, 0038, applied to prod by
hand after pg_dump), the auto-start trigger, how the rule lib is shared
browser/API (the old src/lib/mangkir.ts is the starting point), live update
topics, and where exactly each control sits within the screens above once
the mockup is approved.
