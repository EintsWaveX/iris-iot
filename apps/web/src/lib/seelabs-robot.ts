/**
 * Phase 14: the SeeLabs robot. Browser-safe: the API, the screens and the
 * tests share these shapes and rules.
 *
 * The robot is the PC on campus (server #13 on TelU-Connect, the only
 * network SeeLabs answers on). Each Asisten connects their own SeeLabs
 * account once: the browser seals the password to the PC's public key, the
 * site keeps only that seal, and the PC opens it for one job at a time. The
 * site queues jobs and hands them out on the PC's heartbeat:
 * - uji       sign in once, to check the password
 * - nilai     one SeeLabs KLP's scores, after the holder's Kirim Nilai
 * - jaga      Input Jaga slots the Asisten teaches and SeeLabs lacks (adds only)
 * - kelompok  the KLP list of both praktikum, for Cocokkan KLP and the jaga weeks
 */
import { NILAI_KOMPONEN, type NilaiKomponen } from "./nilai-komponen.js";
import type { Kelas } from "./kelas.js";

/** SeeLabs' praktikum ids: Reguler and INT. */
export const PRAKTIKUM_SEELABS: Record<Kelas, number> = { reguler: 237, internasional: 238 };

export const JENIS_TUGAS = ["uji", "nilai", "jaga", "kelompok", "baca"] as const;
export type JenisTugas = (typeof JENIS_TUGAS)[number];

export type StatusTugas = "antre" | "diambil" | "selesai" | "gagal" | "batal";
export type StatusAkses = "menunggu_uji" | "aktif" | "ditolak" | "kunci_lain";

/**
 * What a failed job reports, as the PC's seelabs.py names it.
 * Only the first two can be fixed by waiting, so only they are retried.
 */
export const GALAT_ROBOT = [
  "tak_terjangkau", // the PC can't reach SeeLabs (not on TelU-Connect, or SeeLabs is down)
  "seelabs_galat", // SeeLabs answered with a server error or an expired page
  "ditolak", // SeeLabs refused the username or password
  "bentuk_berubah", // a page looked unfamiliar, so nothing was saved
  "butuh_token", // the group isn't on today's list: needs a Token Khusus
  "token_salah", // the Token Khusus didn't open it
  "anggota_beda", // the KLP's NIMs in SeeLabs differ from IRIS
  "seelabs_menolak", // SeeLabs said no in its own words (rinci), e.g. put in already today
  "tak_terverifikasi", // saved, but Lihat Nilai didn't show the same scores
  "segel_rusak", // the seal couldn't be opened with the PC's key
  "pc_diam", // the PC took the job and never answered (the site's own code)
] as const;
export type GalatRobot = (typeof GALAT_ROBOT)[number];

export const GALAT_DIULANG: ReadonlySet<string> = new Set([
  "tak_terjangkau",
  "seelabs_galat",
  "pc_diam",
]);

/** Tries before a retryable failure stays gagal, and the wait before each retry. */
export const PERCOBAAN_MAKS = 3;
export const JEDA_ULANG_DETIK = [60, 300, 900] as const;

/** A claimed job the PC hasn't answered for this long goes back to the queue. */
export const BATAS_DIAMBIL_DETIK = 10 * 60;

/** A score edit after Kirim Nilai waits this long, so a run of edits saves once. */
export const JEDA_SUNTING_DETIK = 60;

/** The oldest agent protocol that runs SeeLabs jobs. */
export const PROTOKOL_ROBOT = 6;
/** The read-back's own job (2026-10-17) needs agent protocol 8. */
export const PROTOKOL_BACA = 8;

/** The job kinds an agent on this protocol may take. */
export function jenisDiambil(protokol: number): JenisTugas[] {
  return JENIS_TUGAS.filter((j) => j !== "baca" || protokol >= PROTOKOL_BACA);
}

/** The fixed SeeLabs addresses the PC knows; the site only picks one by name. */
export const ALAMAT_SEELABS = ["kampus", "athena"] as const;
export type AlamatSeelabs = (typeof ALAMAT_SEELABS)[number];

/** A suffix the Laboran could set: 1 to 16 letters or digits. */
export const sufiksSah = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9]{1,16}$/.test(s);

/** The `pengaturan` keys the robot keeps. */
export const KUNCI_ROBOT = {
  /** { nyala: boolean }: the kill switch, Pencipta and Admin only. */
  robot: "seelabs_robot",
  /** { serverId, spki, sidik, oleh, pada }: the approved PC key. */
  kunci: "seelabs_kunci",
  /** AlamatSeelabs: which address the PC uses. */
  alamat: "seelabs_alamat",
  /** { sufiks }: what follows the NIM in the Laboran's default password (an
   *  object, since a bare "2026" would come back from jsonb as a number). */
  sufiks: "seelabs_sufiks",
  /** { pada, oleh, kelompok: { "237": [...], "238": [...] } }: the last pull. */
  kelompok: "seelabs_kelompok",
  /** "YYYY-MM-DD" (WIB): the day the daily jaga check last ran. */
  harian: "seelabs_harian",
  /** JadwalBaca: when each account's read-back was last queued, and the night pass. */
  baca: "seelabs_baca_jadwal",
} as const;

export interface KunciRobot {
  serverId: number;
  spki: string;
  sidik: string;
  oleh: string;
  pada: string;
}

/** The SeeLabs part of the PC's infoSistem (agent protocol 6). */
export interface InfoSeelabsPc {
  spki: string;
  sidik: string;
  jangkau?: { ok: boolean; ms?: number; kode?: string; rinci?: string };
}

export function bacaInfoSeelabs(info: unknown): InfoSeelabsPc | null {
  const s = (info as { seelabs?: unknown } | null)?.seelabs as Partial<InfoSeelabsPc> | undefined;
  if (!s || typeof s.spki !== "string" || typeof s.sidik !== "string") return null;
  if (!/^[A-Za-z0-9+/=]{100,2000}$/.test(s.spki) || !/^([0-9A-F]{4}:){7}[0-9A-F]{4}$/.test(s.sidik))
    return null;
  const j = s.jangkau;
  return {
    spki: s.spki,
    sidik: s.sidik,
    ...(j && typeof j.ok === "boolean"
      ? {
          jangkau: {
            ok: j.ok,
            ...(typeof j.ms === "number" ? { ms: j.ms } : {}),
            ...(typeof j.kode === "string" ? { kode: j.kode.slice(0, 40) } : {}),
            ...(typeof j.rinci === "string" ? { rinci: j.rinci.slice(0, 200) } : {}),
          },
        }
      : {}),
  };
}

/* ------------------------------------------------------------ nilai */

export interface BarisRobot {
  nim: string;
  tp: number;
  ta: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  l1: number;
  l2: number;
}

/** A group's rows split by each student's SeeLabs KLP; a cell IRIS lacks goes as 0,
 *  which is what SeeLabs' form holds anyway (it always opens at zeros). Students
 *  with no KLP known are returned apart: such a group can't go by robot. */
export function barisPerKlp(
  baris: { nim: string; klp: string | null; skor: Partial<Record<NilaiKomponen, number>> }[],
): { perKlp: Map<string, BarisRobot[]>; tanpaKlp: string[] } {
  const perKlp = new Map<string, BarisRobot[]>();
  const tanpaKlp: string[] = [];
  for (const b of baris) {
    if (!b.klp) {
      tanpaKlp.push(b.nim);
      continue;
    }
    const r = { nim: b.nim } as BarisRobot;
    // IRIS names the components TP..L2; the PC's seelabs.py, like SeeLabs' wire:model, tp..l2.
    for (const k of NILAI_KOMPONEN)
      r[k.toLowerCase() as Exclude<keyof BarisRobot, "nim">] = b.skor[k] ?? 0;
    perKlp.set(b.klp, [...(perKlp.get(b.klp) ?? []), r]);
  }
  return { perKlp, tanpaKlp };
}

/* ------------------------------------------------------------- jaga */

export interface SlotJaga {
  minggu: 1 | 2;
  /** 1 = Senin ... 6 = Sabtu, as IRIS' jadwal.hari. */
  hari: number;
  shift: number[];
}

export interface KelompokTarik {
  klp: number;
  /** As SeeLabs writes it: "Selasa Mgg2". */
  hari: string;
  /** "06.30 - 09.00" */
  shift: string;
  anggota: { nim: string; nama: string; uid: number | null }[];
}

const NAMA_HARI: Record<string, number> = {
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
};
const MULAI_SHIFT: Record<string, number> = { "06.30": 1, "09.30": 2, "12.30": 3, "15.30": 4 };

/** "Selasa Mgg2" and "06.30 - 09.00" as IRIS numbers, or null when unfamiliar. */
export function bacaHariShift(hari: string, shift: string) {
  const h = hari.toLowerCase().match(/(senin|selasa|rabu|kamis|jum'?at|sabtu)\s*mgg\s*(\d)/);
  const s = shift.match(/(\d{2})[.:](\d{2})/);
  const nomor = s ? MULAI_SHIFT[`${s[1]}.${s[2]}`] : undefined;
  if (!h || !nomor) return null;
  const minggu = Number(h[2]);
  if (minggu !== 1 && minggu !== 2) return null;
  return { hari: NAMA_HARI[h[1]], minggu: minggu as 1 | 2, shift: nomor };
}

/**
 * The Input Jaga slots an Asisten should have: each weekly slot they teach
 * (hari, slot, kelas), in the SeeLabs week its groups meet, from the last
 * Kelompok pull. A slot whose week the pull doesn't show is left out and
 * listed in `tanpaMinggu` (pull again, or SeeLabs has no group there yet).
 */
export function slotJaga(
  mengajar: { hari: number; slot: number; kelas: Kelas }[],
  tarik: Partial<Record<string, KelompokTarik[]>>,
): {
  perPraktikum: Map<number, SlotJaga[]>;
  tanpaMinggu: { hari: number; slot: number; kelas: Kelas }[];
} {
  const perPraktikum = new Map<number, SlotJaga[]>();
  const tanpaMinggu: { hari: number; slot: number; kelas: Kelas }[] = [];
  for (const m of mengajar) {
    const pid = PRAKTIKUM_SEELABS[m.kelas];
    const minggu = new Set<1 | 2>();
    for (const g of tarik[String(pid)] ?? []) {
      const hs = bacaHariShift(g.hari, g.shift);
      if (hs && hs.hari === m.hari && hs.shift === m.slot) minggu.add(hs.minggu);
    }
    if (!minggu.size) {
      tanpaMinggu.push(m);
      continue;
    }
    const daftar = perPraktikum.get(pid) ?? [];
    for (const w of minggu) {
      const ada = daftar.find((d) => d.minggu === w && d.hari === m.hari);
      if (ada) {
        if (!ada.shift.includes(m.slot)) ada.shift.push(m.slot);
      } else daftar.push({ minggu: w, hari: m.hari, shift: [m.slot] });
    }
    perPraktikum.set(pid, daftar);
  }
  for (const daftar of perPraktikum.values()) {
    for (const d of daftar) d.shift.sort((a, b) => a - b);
    daftar.sort((a, b) => a.minggu - b.minggu || a.hari - b.hari);
  }
  return { perPraktikum, tanpaMinggu };
}

/** A stable text of the wanted slots, so the daily check signs in only on a change. */
export function sidikJaga(perPraktikum: Map<number, SlotJaga[]>): string {
  return [...perPraktikum]
    .sort(([a], [b]) => a - b)
    .map(
      ([pid, d]) =>
        pid + ":" + d.map((s) => `${s.minggu}/${s.hari}/${s.shift.join(".")}`).join(","),
    )
    .join(";");
}

/* ----------------------------------------------------- retries */

/** What a failed job becomes: back to antre later, or gagal for good. */
export function setelahGagal(
  kode: string,
  percobaan: number,
  sekarang: Date,
): { status: "antre" | "gagal"; jalanPada: Date; percobaan: number } {
  const ke = percobaan + 1;
  if (GALAT_DIULANG.has(kode) && ke < PERCOBAAN_MAKS) {
    const jeda = JEDA_ULANG_DETIK[Math.min(ke - 1, JEDA_ULANG_DETIK.length - 1)];
    return {
      status: "antre",
      jalanPada: new Date(sekarang.getTime() + jeda * 1000),
      percobaan: ke,
    };
  }
  return { status: "gagal", jalanPada: sekarang, percobaan: ke };
}

/**
 * A failed save that a later save of its group has overtaken, because the
 * scores went in by hand and the read-back adopted them, or another try
 * worked. It still sits in the queue's history but says nothing any more, so
 * the strip and the table leave it out.
 */
export function gagalBasi(
  t: { status: string; kelompokNomor: number | null; selesai: Date | null; dibuat: Date },
  disimpan: ReadonlyMap<number, Date>,
): boolean {
  if (t.status !== "gagal" || t.kelompokNomor === null) return false;
  const pada = disimpan.get(t.kelompokNomor);
  return !!pada && pada.getTime() > (t.selesai ?? t.dibuat).getTime();
}

/** How an account's status moves with an uji or any job's sign-in. */
export function statusAksesSetelah(kode: string | null, sekarang: StatusAkses): StatusAkses {
  if (kode === null) return "aktif"; // signed in fine
  if (kode === "ditolak") return "ditolak";
  if (kode === "segel_rusak") return "kunci_lain";
  return sekarang; // unreachable or a page problem says nothing about the password
}

/** A job's proof for the screens. A group pull's proof is every group with
 *  its members' names and NIMs (about 100 KB, seen live): the screens get
 *  how many groups per practicum instead, the full list stays in the job. */
export function ringkasBukti(bukti: unknown): Record<string, unknown> | null {
  if (typeof bukti !== "object" || bukti === null || Array.isArray(bukti)) return null;
  const b = bukti as Record<string, unknown>;
  const k = b.kelompok;
  if (typeof k !== "object" || k === null || Array.isArray(k)) return b;
  return {
    ...b,
    kelompok: Object.fromEntries(
      Object.entries(k as Record<string, unknown>).map(([p, v]) => [
        p,
        Array.isArray(v) ? v.length : 0,
      ]),
    ),
  };
}
