# Phase 20: Who Sees What (role view access)

Date: 2026-10-18. Status: stage 0 mockup built, waiting for review by the user and fellow Asisten.

Mockup: `~/Downloads/design-review/mockups/phase20/local.html` (screens `r20-*`; toolbar groups Peran, Lencana DEV, Tampilkan, Tanda).

## Why

In the last test run, fellow Asisten liked the look but found IRIS crowded on first use. The nav has 11 menus and none is filtered by role. Every role gate sits inside a page, and most are "shown but locked". DEV holds every right (`hakPenuh`), so every ASO and ARM member sees an Admin's crowd. Several sensitive reads are open to every Asisten: colleagues' Rp cuts, the Audit log, other people's trails and rights, the score change log, and Server command output.

This phase settles one matrix and applies it. First-use UX polish is a later session.

## Rulings (user, 2026-10-18)

1. **Default: hide.** A menu, tab or control you can't act on doesn't appear. Read only stays only where reading is the point. The four Persiapan editors (Akses Modul, Ringkasan Modul, Presentasi, Skema Rangkaian) stay read only for plain Asisten.
2. **All 11 menus stay for everyone.** The tidying happens inside the pages.
3. **DEV narrowed** to the technical rights plus Jadwal: the full Server view, Konsol without approval, answering Panggil DEV, Sumber SeeLabs, LMS Sambungan, Jadwal editing. DEV loses Tim editing, Bayar, Rp cuts and Audit. Auto-assignment to ASO and ARM stays.
4. **Division tools go to the whole division.** ASO: code, TP, LMS. ADS: attendance and Rp. ARM: Server control. A Kepala adds Jadwal and full Pair on top of their division's tools. Kepala of other divisions no longer get Server control.
5. **ADS** sees everyone's attendance and Rp cuts, and does the PJ actions on every slot.
6. **Rp cuts:** your own; Admin and ADS see all. Lateness minutes and statuses stay visible to everyone.
7. **Audit:** the Audit tab, other people's trails, and the rights list are Admin only. Each Asisten sees their own on Akun.
8. **Scores:** everyone sees a session's scores. The score change log is Admin only.
9. **Server command output** (`hasil`): DEV, Admin and the Pencipta only.
10. Stage 0 mockup first, reviewed before any code.
11. **Lihat sebagai Peran** for Admins: a read-only preview of what a role sees.

## Rights model (`apps/web/src/lib/hak.ts`)

A person's base rights are the union of tier, division and badges. Admin overrides apply on top, as today.

| Right | Anggota | +ASO | +ADS | +ARM | +Kepala (any) | DEV badge | Admin / Pencipta |
|---|---|---|---|---|---|---|---|
| own | ✓ | | | | | | ✓ |
| pair | own slot | | | | full | | ✓ |
| jadwal | – | | | | ✓ | ✓ | ✓ |
| server | – | | | ✓ | (ARM only) | ✓ | ✓ |
| full | – | | | | | ✓ | ✓ |
| tim | – | | | | | | ✓ |
| kode | – | ✓ | | | | | ✓ |
| lms (new, replaces `bolehKelolaLms`) | – | ✓ | | | | | ✓ |
| hadir (new) | – | | ✓ | | | | ✓ |
| audit (new) | – | | | | | | ✓ |

- `hakPenuh` becomes Pencipta or Admin only.
- Knock-on of DEV leaving `hakPenuh`, shown in the mockup's matrix: DEV no longer holds full Pair, kode, lms, tim, hadir or audit unless the division or position gives them. ASO + DEV keeps kode and lms through ASO; ARM + DEV loses kode and lms. This follows the plan's table; reviewers should confirm it.
- The Konsol "istimewa" rule (DEV, Pencipta, Admin) stays.
- No DB migration: new keys are missing from existing `hakOverride` JSON and fall back to the base. The Tim drawer's rights list reads `HAK`, so the new keys need labels in ID, EN and ZH.

Call sites to re-point: see the plan file (`~/.claude/plans/lucky-questing-simon.md`), "Call sites to re-point".

## Per page (plain Anggota unless stated)

| Page | Change |
|---|---|
| Nav | All 11 menus stay. Account menu gains Lihat sebagai Peran (tim right). |
| Konsol | Susulan switch hidden without full Pair (today locked with a toast). PJ actions (Geser Jam Sesi, Ubah Status) for the slot's PJ, ADS on every slot, and Admins; DEV loses them. Changing your own status: ADS and Admins only. |
| Persiapan | Kode Jurnal hidden without kode (already). The four editors stay read only. Roster: own slot editable, others read only. |
| Penilaian | Buat Soal TP hidden without jadwal or kode (today read only). Sumber SeeLabs needs full (as today). LMS buttons need lms. |
| LMS | Isi Kelas hidden without lms; Sambungan hidden without full. The other six tabs stay readable with every edit control hidden. The Pengumuman composer card hides without lms. The one BacaSaja note stays. |
| Jadwal | Grid and slot drawer read for everyone. Per Modul hidden without jadwal. Impor and the gear already hidden. |
| Server | Controls you can't use are hidden, not disabled. Own-slot hotspot, Sinkronkan Jam and Cek Siap Praktikum stay. Ringkas/Lengkap and Pengaturan hidden without full. Command output stripped by the API without full. |
| Laporan | Audit hidden without audit. Beban Asisten: minutes for all, Rp only on your own row unless hadir or tim. Session scores for all; the change log hidden without audit. |
| Tim | Directory stays. Someone else's drawer: rights list and trail hidden without audit; Rp hidden without hadir or tim. Penugasan Slot read only with its buttons hidden. Pembayaran hidden (already). |
| Mode TOT | Without jadwal: switch and controls hidden; status, Sesi TOT and Riwayat TOT read only. **Change from the plan for review:** Akun Praktikan TOT also stays read only, since TOT participants need those NIMs to sign in. |
| Akun | New Hak Saya card: your rights in plain words, where each comes from, and the trail of changes to them. |

## API enforcement

Stripped server side for anyone without the right: others' Rp, the Audit log, others' trails, others' rights map, `nilaiLog`, and Server `perintah.hasil`. Read paths: `api/_lib/hadir-laporan.ts`, `api/_lib/laporan-data.ts`, `api/_lib/hadir-mengajar.ts`, `api/_lib/tim.ts`, `api/server/[id].ts`. Hides that only reduce crowding are UI only; writes are already guarded.

## Lihat sebagai Peran

An account-menu row for tim holders opens a picker of 8 presets (Anggota, ASO, ADS, ARM, Kepala, Kepala ARM, DEV, Admin). The client swaps `useMe().hak` for the preset's rights (from `hakDasar` with a stand-in `Orang`) and shows a bar "Melihat sebagai … · Kembali" on every page, kept in sessionStorage like `src/lib/proyektor.ts`. While previewing, the shared fetch helper refuses every non-GET with a toast. The API still checks the real person.

## Stages after review

1. Model (`hak.ts`), TDD per preset and right, then re-point call sites.
2. API stripping with tests.
3. UI hide sweep per the page table, matching the mockup.
4. Akun Hak Saya card and strings (ID/EN/ZH, no dashes, title case headers).
5. Lihat sebagai Peran.
6. Verify (vitest, rig role sweep `p20_peran.mjs`, leak probes, click sweep), then ship as one set.
