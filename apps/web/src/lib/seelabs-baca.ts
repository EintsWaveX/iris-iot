/**
 * The SeeLabs read-back (2026-10-17, spec 2026-10-17-seelabs-two-way-sync):
 * the rules both sides share when the robot reads back what SeeLabs holds.
 * Browser safe.
 *
 * - A read compares SeeLabs with the values IRIS's last verified save put
 *   there (dasar), not with IRIS's live values: only then is a difference a
 *   change made in SeeLabs. With no saved copy, any difference is flagged.
 * - TP and TA changed in SeeLabs are copied into IRIS; a changed Praktikum
 *   or Jurnal mean is flagged for the Asisten (IRIS keeps D1..D4 and L1, L2).
 * - While an IRIS send is waiting, IRIS is newer: the group is skipped.
 */
import type { NilaiKomponen } from "./nilai-komponen.js";

/** What SeeLabs keeps of one Praktikan's scores: TP, TA, the mean of D1..D4
 *  (Praktikum), the mean of L1, L2 (Jurnal) and presence. */
export interface NilaiTersimpan {
  tp: number;
  ta: number;
  praktikum: number;
  jurnal: number;
  presensi: boolean;
}

/** SeeLabs rounds its means to 2 decimals (80.025 shows 80.03); the agent's MEAN_TOLERANCE. */
const TOLERANSI_RERATA = 0.006;
const TOLERANSI_SKOR = 0.05;

/** IRIS's scores as SeeLabs will keep them (all zeros read as Absen). */
export function nilaiTersimpan(skor: Partial<Record<NilaiKomponen, number>>): NilaiTersimpan {
  const v = (k: NilaiKomponen) => skor[k] ?? 0;
  const dl = (["D1", "D2", "D3", "D4", "L1", "L2"] as const).map(v);
  return {
    tp: v("TP"),
    ta: v("TA"),
    praktikum: (v("D1") + v("D2") + v("D3") + v("D4")) / 4,
    jurnal: (v("L1") + v("L2")) / 2,
    presensi: [v("TP"), v("TA"), ...dl].some((x) => x > 0),
  };
}

export type Tindakan = "sama" | "salin_tp_ta" | "beda_rerata" | "beda_tanpa_dasar" | "lewati";

const tpTaSama = (a: NilaiTersimpan, b: NilaiTersimpan) =>
  Math.abs(a.tp - b.tp) < TOLERANSI_SKOR && Math.abs(a.ta - b.ta) < TOLERANSI_SKOR;
const rerataSama = (a: NilaiTersimpan, b: NilaiTersimpan) =>
  Math.abs(a.praktikum - b.praktikum) <= TOLERANSI_RERATA &&
  Math.abs(a.jurnal - b.jurnal) <= TOLERANSI_RERATA;

/**
 * What one Praktikan's SeeLabs row means for IRIS. Presence is not compared
 * on its own: it follows the scores, so a presence change always comes with
 * a mean change.
 */
export function bandingkan(p: {
  /** The values the last verified save put in SeeLabs; null without one. */
  dasar: NilaiTersimpan | null;
  /** IRIS's values now, used only when there is no dasar. */
  iris: NilaiTersimpan;
  seelabs: NilaiTersimpan;
  /** An IRIS send for this group is waiting (queued, running, retrying or not yet sent). */
  menunggu: boolean;
}): { tindakan: Tindakan; tp?: number; ta?: number } {
  const banding = p.dasar ?? p.iris;
  const tpBeda = !tpTaSama(banding, p.seelabs);
  const rerataBeda = !rerataSama(banding, p.seelabs);
  if (!tpBeda && !rerataBeda) return { tindakan: "sama" };
  if (p.menunggu) return { tindakan: "lewati" };
  if (!p.dasar) return { tindakan: "beda_tanpa_dasar" };
  const salin = tpBeda ? { tp: Math.round(p.seelabs.tp), ta: Math.round(p.seelabs.ta) } : {};
  return { tindakan: rerataBeda ? "beda_rerata" : "salin_tp_ta", ...salin };
}

/**
 * The IRIS session a SeeLabs row lands in (Rincian has no date or shift):
 * of the sessions of that module the Praktikan sat in, the one whose group
 * was sent through the account read, else the latest.
 */
export function tempatkan(
  calon: {
    sesiId: number;
    kelompokNomor: number;
    akun: string | null;
    tanggal: string;
    mulai: string;
  }[],
  akunBaca: string,
): { sesiId: number; kelompokNomor: number } | null {
  if (!calon.length) return null;
  const urut = [...calon].sort((a, b) =>
    `${b.tanggal} ${b.mulai}`.localeCompare(`${a.tanggal} ${a.mulai}`),
  );
  const pilih = urut.find((c) => c.akun === akunBaca) ?? urut[0];
  return { sesiId: pilih.sesiId, kelompokNomor: pilih.kelompokNomor };
}

/** Every connected account is read every minute, around the clock (user,
 *  2026-10-18); a read still waiting or running holds the next one back. */
export const JEDA_BACA_MS = 60_000;

function wib(d: Date): { tanggal: string; jam: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return {
    tanggal: `${get("year")}-${get("month")}-${get("day")}`,
    jam: Number(get("hour")) % 24,
  };
}

/** Rows as one string, whatever their order or their keys' order: what a
 *  read wrote before against what it writes now. */
export function sidikStabil(rows: unknown[]): string {
  const urut = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(urut)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, urut((v as Record<string, unknown>)[k])]),
          )
        : v;
  return rows
    .map((r) => JSON.stringify(urut(r)))
    .sort()
    .join("\n");
}

/** The nightly full pass: the first beat from 22:00 WIB, once a day. */
export function waktunyaMalam(sekarang: Date, terakhirMalam: string | null): boolean {
  const w = wib(sekarang);
  return w.jam >= 22 && terakhirMalam !== w.tanggal;
}

/** Rekap BAP's shift cell ("Shift 06.30 - 09.00", or "Shift 3") as 1..4. */
export function bacaShiftBap(teks: string): number | null {
  const jam = teks.match(/(\d{2})[.:](\d{2})/);
  if (jam) {
    const awal = { "06": 1, "09": 2, "12": 3, "15": 4 }[jam[1]];
    return awal ?? null;
  }
  const n = teks.match(/shift\s*([1-4])\b/i);
  return n ? Number(n[1]) : null;
}

const BULAN: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

/** Rekap BAP's date cell ("20 Oktober 2026", "Jumat, 23 Oktober 2026") as YYYY-MM-DD. */
export function bacaTanggalBap(teks: string): string | null {
  const iso = teks.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = teks.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const bulan = m ? BULAN[m[2].toLowerCase()] : undefined;
  if (!m || !bulan) return null;
  return `${m[3]}-${String(bulan).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export interface BedaBap {
  tanggal: string;
  shift: number;
  jenis: "hanya_iris" | "hanya_seelabs";
  penilai: string[];
}

/** The days and shifts only one side has: IRIS's pay units through an
 *  account against that account's Rekap BAP. Flags only. */
export function bandingkanBap(
  iris: { tanggal: string; shift: number; penilai: string }[],
  bap: { tanggal: string; shift: number }[],
): BedaBap[] {
  const kunci = (x: { tanggal: string; shift: number }) => `${x.tanggal}|${x.shift}`;
  const adaBap = new Set(bap.map(kunci));
  const perIris = new Map<string, { tanggal: string; shift: number; penilai: Set<string> }>();
  for (const u of iris) {
    const k = kunci(u);
    const ada = perIris.get(k) ?? { tanggal: u.tanggal, shift: u.shift, penilai: new Set() };
    ada.penilai.add(u.penilai);
    perIris.set(k, ada);
  }
  const out: BedaBap[] = [];
  for (const [k, u] of perIris)
    if (!adaBap.has(k))
      out.push({
        tanggal: u.tanggal,
        shift: u.shift,
        jenis: "hanya_iris",
        penilai: [...u.penilai],
      });
  for (const b of bap)
    if (!perIris.has(kunci(b)))
      out.push({ tanggal: b.tanggal, shift: b.shift, jenis: "hanya_seelabs", penilai: [] });
  return out.sort((a, b) => kunci(a).localeCompare(kunci(b)));
}

/** The connected accounts whose last read is older than the gap (or none yet). */
export function akunPerluBaca(p: {
  akun: { nim: string; status: string }[];
  /** NIM to when its last read was queued. */
  terakhir: Record<string, string>;
  jedaMs: number;
  sekarang: Date;
  /** Accounts with a read still waiting or running. */
  sibuk?: Set<string>;
}): string[] {
  return p.akun
    .filter((a) => a.status === "aktif" && !p.sibuk?.has(a.nim))
    .filter((a) => {
      const t = p.terakhir[a.nim];
      return !t || p.sekarang.getTime() - Date.parse(t) >= p.jedaMs;
    })
    .map((a) => a.nim);
}

/* ------------------------------------------------- taking a read in */

/** One Praktikan's row as the robot read it from Rincian. */
export interface BarisBaca extends NilaiTersimpan {
  nim: string;
}

/** One group of one account's saves (bukti.nilai of a baca job). */
export interface KelompokBaca {
  praktikum: number;
  klp: number;
  modul: number;
  baris: BarisBaca[];
}

export interface CalonSesi {
  sesiId: number;
  kelompokNomor: number;
  /** The account the group's scores go through. */
  akun: string | null;
  tanggal: string;
  mulai: string;
}

/** IRIS's side of one group, keyed "sesiId|kelompokNomor". */
export interface KeadaanKelompok {
  /** What the last verified save put in SeeLabs; null without one. */
  dasar: Record<string, NilaiTersimpan> | null;
  /** IRIS's scores now, per NIM. */
  iris: Record<string, Partial<Record<NilaiKomponen, number>>>;
  /** Kirim Nilai happened for the group. */
  terkirim: boolean;
  /** A nilai job for it is queued or running. */
  menunggu: boolean;
}

export interface SalinSkor {
  sesiId: number;
  nim: string;
  komponen: "TP" | "TA";
  skor: number;
  sebelum: number | null;
  /** SeeLabs's own value, before rounding to IRIS's whole number. */
  mentah: number;
}

export type StatusBaca = "sama" | "beda" | "hilang" | "hanya_seelabs";

export interface HasilKelompok {
  sesiId: number;
  kelompokNomor: number;
  status: StatusBaca;
  seelabs: Record<string, NilaiTersimpan>;
  /** The values read become the group's new baseline (a seelabs_ekspor row). */
  dasarBaru: boolean;
}

export interface RencanaTerima {
  salin: SalinSkor[];
  kelompok: HasilKelompok[];
  lepas: { praktikum: number; klp: number; modul: number; nim: string; nilai: NilaiTersimpan }[];
}

const tanpaNim = ({ nim: _nim, ...n }: BarisBaca): NilaiTersimpan => n;

/**
 * What one account's read means for IRIS: the TP/TA copies, each group's
 * read state, and the rows with nowhere to land. Pure; api/_lib/seelabs-baca.ts
 * gathers the inputs and writes the result.
 */
export function rencanaTerima(p: {
  akunBaca: string;
  bacaan: KelompokBaca[];
  /** "nim|modul" to the sessions of that module the Praktikan sat in (no TOT). */
  calon: Record<string, CalonSesi[]>;
  keadaan: Record<string, KeadaanKelompok>;
  /** "praktikum|klp" of this semester's KLPs: rows outside it are ignored. */
  klpSemester: Set<string>;
  /** This account's verified saves, to tell a save gone from SeeLabs. */
  tersimpan: {
    sesiId: number;
    kelompokNomor: number;
    praktikum: number;
    modul: number;
    klp: number[];
  }[];
  /** The modules this read covered (all of tersimpan's when left out). */
  modulDibaca?: number[];
}): RencanaTerima {
  const out: RencanaTerima = { salin: [], kelompok: [], lepas: [] };
  const grup = new Map<string, Map<string, NilaiTersimpan>>();
  for (const g of p.bacaan)
    for (const b of g.baris) {
      const tempat = tempatkan(p.calon[`${b.nim}|${g.modul}`] ?? [], p.akunBaca);
      if (!tempat) {
        if (p.klpSemester.has(`${g.praktikum}|${g.klp}`))
          out.lepas.push({
            praktikum: g.praktikum,
            klp: g.klp,
            modul: g.modul,
            nim: b.nim,
            nilai: tanpaNim(b),
          });
        continue;
      }
      const k = `${tempat.sesiId}|${tempat.kelompokNomor}`;
      grup.set(k, (grup.get(k) ?? new Map()).set(b.nim, tanpaNim(b)));
    }

  const dilihat = new Set<string>();
  for (const [k, baris] of grup) {
    dilihat.add(k);
    const st = p.keadaan[k];
    if (!st || st.menunggu) continue;
    const [sesiId, kelompokNomor] = k.split("|").map(Number);
    let beda = false;
    let berubah = false;
    // An IRIS edit not yet in SeeLabs (a send failed or gave up): the
    // baseline must not move, or the strip reads Tersimpan over it.
    let geser = false;
    for (const [nim, sl] of baris) {
      const ir = st.iris[nim] ?? {};
      const irisN = nilaiTersimpan(ir);
      const salin = (komponen: "TP" | "TA", mentah: number) => {
        const skor = Math.round(mentah);
        if (ir[komponen] === skor) return;
        out.salin.push({ sesiId, nim, komponen, skor, sebelum: ir[komponen] ?? null, mentah });
        berubah = true;
      };
      if (!st.dasar && !st.terkirim) {
        // Scored only in SeeLabs: TP and TA fill IRIS's empty fields.
        if (ir.TP == null) salin("TP", sl.tp);
        if (ir.TA == null) salin("TA", sl.ta);
        continue;
      }
      const d = st.dasar?.[nim] ?? null;
      const irisJuga = !!d && !(tpTaSama(irisN, d) && rerataSama(irisN, d));
      if (irisJuga) geser = true;
      const r = bandingkan({ dasar: d, iris: irisN, seelabs: sl, menunggu: false });
      if (r.tindakan === "sama") {
        if (!d) berubah = true; // a Praktikan new to the baseline
        continue;
      }
      if (r.tindakan === "beda_tanpa_dasar") {
        beda = true;
        continue;
      }
      // IRIS moved too since the save: IRIS wins and sends again.
      if (r.tp !== undefined && !irisJuga) {
        if (Math.abs(sl.tp - d!.tp) >= 0.05) salin("TP", sl.tp);
        if (Math.abs(sl.ta - d!.ta) >= 0.05) salin("TA", sl.ta);
      }
      if (r.tindakan === "beda_rerata" || irisJuga) beda = true;
    }
    const hanya = !st.dasar && !st.terkirim;
    const status: StatusBaca = hanya ? "hanya_seelabs" : beda ? "beda" : "sama";
    out.kelompok.push({
      sesiId,
      kelompokNomor,
      status,
      seelabs: Object.fromEntries(baris),
      dasarBaru: status === "sama" && !geser && (berubah || !st.dasar),
    });
  }

  const dibaca = new Set(p.modulDibaca ?? p.tersimpan.map((t) => t.modul));
  for (const t of p.tersimpan) {
    const k = `${t.sesiId}|${t.kelompokNomor}`;
    if (!dibaca.has(t.modul) || dilihat.has(k) || p.keadaan[k]?.menunggu) continue;
    const ada = p.bacaan.some(
      (b) => b.praktikum === t.praktikum && b.modul === t.modul && t.klp.includes(b.klp),
    );
    if (ada) continue;
    dilihat.add(k);
    out.kelompok.push({
      sesiId: t.sesiId,
      kelompokNomor: t.kelompokNomor,
      status: "hilang",
      seelabs: {},
      dasarBaru: false,
    });
  }
  return out;
}

/** The baseline a verified save leaves: its rows (the Pi's tp..l2) as SeeLabs keeps them. */
export function dasarDariBaris(
  baris: {
    nim: string;
    tp: number;
    ta: number;
    d1: number;
    d2: number;
    d3: number;
    d4: number;
    l1: number;
    l2: number;
  }[],
): Record<string, NilaiTersimpan> {
  return Object.fromEntries(
    baris.map((b) => [
      b.nim,
      nilaiTersimpan({
        TP: b.tp,
        TA: b.ta,
        D1: b.d1,
        D2: b.d2,
        D3: b.d3,
        D4: b.d4,
        L1: b.l1,
        L2: b.l2,
      }),
    ]),
  );
}

/** One praktikum's Rekap BAP rows as day and shift; rows it can't read are counted. */
export function barisBap(
  bap: { praktikum: number; hari?: string; shift: string; tanggal: string }[],
  praktikum: number,
): { baris: { tanggal: string; shift: number }[]; takTerbaca: number } {
  const baris: { tanggal: string; shift: number }[] = [];
  let takTerbaca = 0;
  for (const r of bap) {
    if (r.praktikum !== praktikum) continue;
    const tanggal = bacaTanggalBap(r.tanggal);
    const shift = bacaShiftBap(r.shift);
    if (tanggal && shift) baris.push({ tanggal, shift });
    else takTerbaca++;
  }
  return { baris, takTerbaca };
}

/** The flagged groups that go to this Asisten's inbox: the scorer's, whatever
 *  account they went through (a lender sees them only on the session). */
export function bacakuUntuk<T extends { status: StatusBaca; penilai: string | null }>(
  grup: T[],
  nim: string,
): T[] {
  return grup.filter((g) => g.status !== "sama" && g.penilai === nim);
}
