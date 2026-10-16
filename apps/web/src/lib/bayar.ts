/**
 * Payments and uang kas (Phase 9 Stage 6), the math both the API and the
 * pages use. One scored group is one unit at its class rate (kotor). The
 * kas is a percentage of kotor, rounded to the rupiah; bersih is the rest.
 * The Bendahara transfers each Asisten's kotor per month; the Asisten then
 * transfers the kas back ("transfer balik") to the Kas IRIS.
 *
 * Browser-safe: no database, no node modules.
 */
import type { Lang } from "./kelas.js";

export type Kelas = "reguler" | "internasional";

export interface TarifUnit {
  reguler: number;
  internasional: number;
}

export const TARIF_UNIT_AWAL: TarifUnit = { reguler: 32500, internasional: 65000 };
export const KAS_MIN = 0;
export const KAS_MAKS = 50;

export function bacaTarifUnit(raw: unknown): TarifUnit {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000 ? v : d;
  return {
    reguler: n(o.reguler, TARIF_UNIT_AWAL.reguler),
    internasional: n(o.internasional, TARIF_UNIT_AWAL.internasional),
  };
}

export function kasPersenValid(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= KAS_MIN && v <= KAS_MAKS;
}

/** Kas and bersih from kotor at a rate. */
export function pisah(
  kotor: number,
  persen: number,
): { kotor: number; kas: number; bersih: number } {
  const kas = Math.round((kotor * persen) / 100);
  return { kotor, kas, bersih: kotor - kas };
}

export interface BarisTarif {
  semester: string;
  persen: number;
  berlakuMulai: string;
  id?: number;
}

/** The rate in force on `tanggal`: the newest row of that semester that
 *  started on or before it (later rows win a tie). Null when none has. */
export function tarifPada(
  rows: BarisTarif[],
  semester: string,
  tanggal: string,
): BarisTarif | null {
  let best: BarisTarif | null = null;
  for (const r of rows) {
    if (r.semester !== semester || r.berlakuMulai > tanggal) continue;
    if (
      !best ||
      r.berlakuMulai > best.berlakuMulai ||
      (r.berlakuMulai === best.berlakuMulai && (r.id ?? 0) > (best.id ?? 0))
    )
      best = r;
  }
  return best;
}

/** One person's rate on a date: their exception for the semester, else the
 *  semester's rate in force, else the previous semester's last rate, else 10. */
export function persenUntuk(
  nim: string,
  semester: string,
  tanggal: string,
  tarif: BarisTarif[],
  pengecualian: { semester: string; nim: string; persen: number }[],
): number {
  const e = pengecualian.find((x) => x.semester === semester && x.nim === nim);
  if (e) return e.persen;
  const t = tarifPada(tarif, semester, tanggal);
  if (t) return t.persen;
  const lama = [...tarif]
    .filter((x) => x.berlakuMulai <= tanggal)
    .sort((a, b) => (a.berlakuMulai < b.berlakuMulai ? 1 : -1))[0];
  return lama ? lama.persen : 10;
}

/** "2026-09" for a date "2026-09-24". */
export function periodeDari(tanggal: string): string {
  return tanggal.slice(0, 7);
}

export interface Unit {
  nimPenilai: string;
  tanggal: string;
  kelas: Kelas;
  kotor: number;
  kas: number;
  bersih: number;
  kasPersen: number;
}

export interface Ringkasan {
  reguler: number;
  internasional: number;
  kotor: number;
  kas: number;
  bersih: number;
}

export const KOSONG: Ringkasan = { reguler: 0, internasional: 0, kotor: 0, kas: 0, bersih: 0 };

/** A late cut (Phase 18): money off one person's month, tied to a session. */
export interface PotonganBaris {
  tanggal: string;
  jumlah: number;
  nim?: string;
}

/** Cuts per month, each month's total capped at what that month holds. */
function terapkanPotongan(
  kotorBulan: Map<string, number>,
  potongan: PotonganBaris[],
): Map<string, number> {
  const per = new Map<string, number>();
  for (const c of potongan) {
    const p = periodeDari(c.tanggal);
    per.set(p, (per.get(p) ?? 0) + c.jumlah);
  }
  const out = new Map<string, number>();
  for (const [p, c] of per) out.set(p, Math.min(c, kotorBulan.get(p) ?? 0));
  return out;
}

/** Sums units; late cuts come off kotor and bersih (the kas stays what the
 *  units made), a month never going below zero. */
export function jumlahkan(
  units: Pick<Unit, "kelas" | "kotor" | "kas" | "bersih" | "tanggal">[],
  potongan: PotonganBaris[] = [],
): Ringkasan {
  const r = { ...KOSONG };
  const kotorBulan = new Map<string, number>();
  const bersihBulan = new Map<string, number>();
  for (const u of units) {
    r[u.kelas] += 1;
    r.kotor += u.kotor;
    r.kas += u.kas;
    r.bersih += u.bersih;
    const p = periodeDari(u.tanggal);
    kotorBulan.set(p, (kotorBulan.get(p) ?? 0) + u.kotor);
    bersihBulan.set(p, (bersihBulan.get(p) ?? 0) + u.bersih);
  }
  if (potongan.length) {
    for (const v of terapkanPotongan(kotorBulan, potongan).values()) r.kotor -= v;
    for (const v of terapkanPotongan(bersihBulan, potongan).values()) r.bersih -= v;
  }
  return r;
}

export interface Transfer {
  periode: string;
  jenis: "kotor" | "balik";
  nim: string;
  jumlah: number;
}

/** What is still owed per person and month: kotor (Bendahara to the
 *  Asisten) and balik (the Asisten's kas to the Kas IRIS), minus what was
 *  already marked as transferred. Only lines with something left, newest
 *  month first. The Bendahara's own units owe nothing: they keep their
 *  gross and already hold the kas. */
export function sisaTransfer(
  units: Unit[],
  sudah: Transfer[],
  bendahara: string | null = null,
  potongan: PotonganBaris[] = [],
): (Transfer & { total: number })[] {
  const key = (p: string, j: string, n: string) => `${p}|${j}|${n}`;
  const wajib = new Map<string, number>();
  for (const u of units) {
    if (u.nimPenilai === bendahara) continue;
    const p = periodeDari(u.tanggal);
    wajib.set(
      key(p, "kotor", u.nimPenilai),
      (wajib.get(key(p, "kotor", u.nimPenilai)) ?? 0) + u.kotor,
    );
    wajib.set(
      key(p, "balik", u.nimPenilai),
      (wajib.get(key(p, "balik", u.nimPenilai)) ?? 0) + u.kas,
    );
  }
  // A late cut comes off that person's kotor of the month, never below zero.
  const potong = new Map<string, number>();
  for (const c of potongan) {
    const k = key(periodeDari(c.tanggal), "kotor", c.nim ?? "");
    potong.set(k, (potong.get(k) ?? 0) + c.jumlah);
  }
  for (const [k, c] of potong) {
    const ada = wajib.get(k);
    if (ada !== undefined) wajib.set(k, Math.max(0, ada - c));
  }
  const bayar = new Map<string, number>();
  for (const t of sudah)
    bayar.set(
      key(t.periode, t.jenis, t.nim),
      (bayar.get(key(t.periode, t.jenis, t.nim)) ?? 0) + t.jumlah,
    );
  const out: (Transfer & { total: number })[] = [];
  for (const [k, total] of wajib) {
    const sisa = total - (bayar.get(k) ?? 0);
    if (sisa <= 0) continue;
    const [periode, jenis, nim] = k.split("|");
    out.push({ periode, jenis: jenis as Transfer["jenis"], nim, jumlah: sisa, total });
  }
  return out.sort((a, b) =>
    a.periode !== b.periode
      ? a.periode < b.periode
        ? 1
        : -1
      : a.jenis !== b.jenis
        ? a.jenis === "kotor"
          ? -1
          : 1
        : a.nim.localeCompare(b.nim),
  );
}

/** "Rp32.500,00", the way the handbook and SeeLabs write money. */
export function rupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")},00`;
}

/** "September 2026" for "2026-09". */
export function namaPeriode(periode: string, lang: Lang): string {
  const [y, m] = periode.split("-").map(Number);
  const loc = lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
