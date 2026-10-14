/**
 * Jadwal › Per Modul, the server side: the semester's switch, and which
 * module each slot's date teaches (src/lib/penugasan-modul.ts holds the
 * rules; this reads what they need from the database).
 *
 * pengaturan "pasangan_modul" = { [semester]: { aktif, oleh, pada } }. A
 * semester that isn't there runs the same pairing all semester.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { jadwal, pengaturan, rosterKelompok, sesi } from "../../src/lib/schema.js";
import { getModulTerbuka } from "../../src/lib/akses.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { MODUL_PASANGAN, modulTanggal, type SumberModul } from "../../src/lib/penugasan-modul.js";
import { mingguPraktikum, type JendelaTp } from "../../src/lib/tp.js";
import { bacaSet, jendelaUntuk } from "./tp.js";

type Db = ReturnType<typeof getDb>;
type JadwalRow = typeof jadwal.$inferSelect;

export const KUNCI_PASANGAN = "pasangan_modul";

type NilaiPasangan = Record<string, { aktif: boolean; oleh: string | null; pada: string }>;

async function bacaNilai(db: Db): Promise<NilaiPasangan> {
  const [row] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_PASANGAN))
    .limit(1);
  const v = row?.nilai;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as NilaiPasangan) : {};
}

/** Whether the semester runs its pairing per module. */
export async function bacaBergilir(db: Db, semester: string): Promise<boolean> {
  return (await bacaNilai(db))[semester]?.aktif === true;
}

export async function aturBergilir(db: Db, semester: string, aktif: boolean, nim: string) {
  const nilai = await bacaNilai(db);
  nilai[semester] = { aktif, oleh: nim, pada: new Date().toISOString() };
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_PASANGAN, nilai, diubahOleh: nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: nim, diubahPada: sql`now()` },
    });
}

export interface KonteksModul {
  aktif: boolean;
  /** Each module's TP window (the current semester's only). */
  jendela: Partial<Record<number, JendelaTp | null>>;
  terbuka: number[];
}

/** What a date's module is judged by. Only read while the switch is on,
 *  unless `selalu` (Per Modul shows each module's week either way). */
export async function konteksModul(
  db: Db,
  semester: string,
  selalu = false,
): Promise<KonteksModul> {
  const aktif = await bacaBergilir(db, semester);
  if (!aktif && !selalu) return { aktif, jendela: {}, terbuka: [] };
  const [set, terbuka] = await Promise.all([bacaSet(db), getModulTerbuka()]);
  const jendela: KonteksModul["jendela"] = {};
  if (set.semester === semester)
    for (const m of MODUL_PASANGAN) {
      const j = jendelaUntuk(set, m);
      jendela[m] = j ? { buka: j.buka, tutup: j.tutup } : null;
    }
  return { aktif, jendela, terbuka };
}

/** Each module's practicum week, for the Per Modul view's hints. */
export function mingguModul(
  k: KonteksModul,
): Record<number, { senin: string; sabtu: string } | null> {
  const out: Record<number, { senin: string; sabtu: string } | null> = {};
  for (const m of MODUL_PASANGAN) {
    const j = k.jendela[m];
    out[m] = j ? mingguPraktikum(j) : null;
  }
  return out;
}

export interface ModulSlot {
  modul: number | null;
  sumber: SumberModul | null;
}

/** Each slot row's module on its date. `paksa` names it where the caller
 *  already knows (a session being started, a TP module's week). */
export async function modulPerSlot(
  db: Db,
  rows: readonly JadwalRow[],
  tanggalOf: ReadonlyMap<number, string>,
  k: KonteksModul,
  paksa?: ReadonlyMap<number, number>,
  hariIni = hariIniWib(),
): Promise<Map<number, ModulSlot>> {
  const out = new Map<number, ModulSlot>();
  if (!k.aktif || !rows.length) return out;
  const tanggalan = [...new Set(tanggalOf.values())];
  const sesiRows = tanggalan.length
    ? await db
        .select({ tanggal: sesi.tanggal, slot: sesi.slot, modul: sesi.modul })
        .from(sesi)
        .where(
          and(
            inArray(sesi.tanggal, tanggalan),
            eq(sesi.jenis, "reguler"),
            inArray(sesi.status, ["berjalan", "selesai"]),
          ),
        )
    : [];
  for (const j of rows) {
    const tanggal = tanggalOf.get(j.id);
    if (!tanggal) continue;
    const p = paksa?.get(j.id);
    if (p) {
      out.set(j.id, { modul: p, sumber: "sesi" });
      continue;
    }
    const s = sesiRows.find((x) => x.tanggal === tanggal && x.slot === j.slot);
    out.set(
      j.id,
      modulTanggal({
        tanggal,
        hariIni,
        sesiModul: s?.modul ?? null,
        jendela: k.jendela,
        terbuka: k.terbuka,
      }),
    );
  }
  return out;
}

/** The modules each slot has already taught this semester (a reguler
 *  session started there): Per Modul keeps those as they are. */
export async function modulDiajar(
  db: Db,
  rows: readonly JadwalRow[],
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!rows.length) return out;
  const semester = rows[0].semester;
  const sesiRows = await db
    .select({ tanggal: sesi.tanggal, slot: sesi.slot, modul: sesi.modul })
    .from(sesi)
    .where(and(eq(sesi.jenis, "reguler"), inArray(sesi.status, ["berjalan", "selesai"])));
  for (const s of sesiRows) {
    if (semesterDariTanggal(s.tanggal) !== semester) continue;
    const j = rows.find((r) => r.slot === s.slot && r.hari === hariDariTanggal(s.tanggal));
    if (!j) continue;
    const list = out.get(j.id) ?? [];
    if (!list.includes(s.modul)) list.push(s.modul);
    out.set(j.id, list.sort());
  }
  return out;
}

/** Each slot's SeeLabs KLP per group ("hari-slot" -> nomor -> KLP), so a
 *  group reads as "1 · KLP 6" wherever its Asisten is shown. */
export async function klpSlot(
  db: Db,
  semester: string,
): Promise<Record<string, Record<string, string>>> {
  const rows = await db
    .select({
      hari: rosterKelompok.hari,
      slot: rosterKelompok.slot,
      nomor: rosterKelompok.nomor,
      klp: rosterKelompok.klpSeelabs,
    })
    .from(rosterKelompok)
    .where(eq(rosterKelompok.semester, semester));
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (!r.klp) continue;
    (out[`${r.hari}-${r.slot}`] ??= {})[String(r.nomor)] = r.klp;
  }
  return out;
}
