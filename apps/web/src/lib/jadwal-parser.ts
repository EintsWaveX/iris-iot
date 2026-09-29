/**
 * Phase 8: parse the "JADWAL NGAJAR" sheet pasted as tab-separated text.
 *
 * The sheet lays a week out as 24 columns (Senin to Sabtu, four slots
 * each). Its "ASISTEN DEFAULT" block has one assistant code per group in
 * row order, plus a marker row where a slot is labelled INTER (the
 * International class) or Soon (announced, no assistants yet); its
 * "ASISTEN PENGGANTI" block ranks substitutes the same way. Cell colours do
 * not survive a copy, so the Ngajar FIT / Angkatan 24 tags are set in the
 * app afterwards.
 *
 * The parser is forgiving about what else gets swept into the selection:
 * day-name rows, slot-number rows, the "Jumlah Asisten" count row, block
 * titles and a leading label or numbering column are all skipped.
 */
import type { Kelas } from "./kelas.js";

export const KOLOM_SLOT = 24;
const KODE_RE = /^[A-Z]{2,4}$/;
const LABEL_LEWATI =
  /^(SENIN|SELASA|RABU|KAMIS|JUMAT|SABTU|MINGGU|ASISTEN DEFAULT|ASISTEN PENGGANTI|JUMLAH ASISTEN|\d{1,2})$/;
const PENANDA = /^(INTER|SOON)$/;

export interface GridJadwal {
  /** One entry per slot column (24), each the codes found top to bottom. */
  kolom: string[][];
  /** The marker row per column: "INTER", "SOON" or "". */
  penanda: string[];
  /** Cells that looked like data but not like an assistant code. */
  asing: string[];
}

function bersihkan(sel: string): string {
  return sel.trim().toUpperCase();
}

export function parseGrid(teks: string): GridJadwal {
  const kolom: string[][] = Array.from({ length: KOLOM_SLOT }, () => []);
  const penanda: string[] = Array.from({ length: KOLOM_SLOT }, () => "");
  const asing: string[] = [];
  for (const baris of teks.split(/\r?\n/)) {
    let sel = baris.split("\t").map(bersihkan);
    // A leading label or numbering column (25+ cells wide) is dropped.
    while (sel.length > KOLOM_SLOT && (sel[0] === "" || LABEL_LEWATI.test(sel[0])))
      sel = sel.slice(1);
    const isi = sel.filter((c) => c !== "");
    if (isi.length === 0) continue;
    if (isi.every((c) => LABEL_LEWATI.test(c))) continue;
    if (isi.every((c) => PENANDA.test(c))) {
      sel.slice(0, KOLOM_SLOT).forEach((c, j) => {
        if (PENANDA.test(c)) penanda[j] = c;
      });
      continue;
    }
    sel.slice(0, KOLOM_SLOT).forEach((c, j) => {
      if (c === "") return;
      if (KODE_RE.test(c)) kolom[j].push(c);
      else asing.push(c);
    });
  }
  return { kolom, penanda, asing };
}

export type TagPengganti = "fit" | "a24" | null;

export interface SlotJadwal {
  hari: number; // 1 = Senin ... 6 = Sabtu
  slot: number; // 1-4
  kelas: Kelas;
  status: "aktif" | "segera";
  asisten: string[];
  pengganti: { kode: string; tag: TagPengganti }[];
}

export interface HasilJadwal {
  slot: SlotJadwal[];
  /** Codes that are not a known assistant code (only when kodeDikenal is given). */
  kodeTakDikenal: string[];
  asing: string[];
}

/**
 * Combine the default block and (optionally) the substitute block into one
 * row per scheduled slot. A column with no default codes and no marker is
 * an unavailable slot and produces nothing.
 */
export function buildJadwal(
  teksDefault: string,
  teksPengganti = "",
  kodeDikenal?: Iterable<string>,
): HasilJadwal {
  const def = parseGrid(teksDefault);
  const peng = parseGrid(teksPengganti);
  const dikenal = kodeDikenal ? new Set(Array.from(kodeDikenal, (k) => k.toUpperCase())) : null;
  const tak = new Set<string>();
  const slot: SlotJadwal[] = [];
  for (let j = 0; j < KOLOM_SLOT; j++) {
    const segera = def.penanda[j] === "SOON";
    const asisten = segera ? [] : def.kolom[j];
    if (!segera && asisten.length === 0) continue;
    const pengganti = peng.kolom[j].map((kode) => ({ kode, tag: null as TagPengganti }));
    if (dikenal) {
      for (const k of [...asisten, ...pengganti.map((p) => p.kode)])
        if (!dikenal.has(k)) tak.add(k);
    }
    slot.push({
      hari: Math.floor(j / 4) + 1,
      slot: (j % 4) + 1,
      kelas: def.penanda[j] === "INTER" ? "internasional" : "reguler",
      status: segera ? "segera" : "aktif",
      asisten,
      pengganti,
    });
  }
  return { slot, kodeTakDikenal: [...tak].sort(), asing: [...def.asing, ...peng.asing] };
}

/** Day of week (1 = Senin ... 6 = Sabtu, 0 = Minggu) for an ISO date string. */
export function hariDariTanggal(tanggal: string): number {
  const [y, m, d] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The semester a date falls in: Aug to Jan is "ganjil", Feb to Jul is "genap". */
export function semesterDariTanggal(tanggal: string): string {
  const [y, m] = tanggal.split("-").map(Number);
  if (m >= 8) return `${y}-ganjil`;
  if (m === 1) return `${y - 1}-ganjil`;
  return `${y}-genap`;
}
