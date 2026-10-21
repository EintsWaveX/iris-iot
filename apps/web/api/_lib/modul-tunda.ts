/**
 * Jadwal's Deteksi Modul Otomatis (user, 2026-10-21): a week with no
 * practicum, such as a midterm week, is postponed by the Admin tier. Every
 * slot of the semester gets that week's remaining dates as holidays (so the
 * lab clock starts nothing and nobody is expected to teach), and the module
 * that week would have taught moves to the next week (mingguModulSemua).
 * The week ends by itself, so detection is back the Monday after; turning
 * it back on earlier takes the holidays it added off again (from today on)
 * and drops the postponement, so nothing moves.
 *
 * pengaturan "modul_tunda" = { [semester]: [{ senin, oleh, pada, libur }] },
 * `libur` holding the dates it added per jadwal id (a slot's own holidays
 * are never touched).
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { jadwal, pengaturan } from "../../src/lib/schema.js";
import { daftarLibur } from "../../src/lib/penugasan-minggu.js";
import { tambahHari } from "../../src/lib/tp.js";

type Db = ReturnType<typeof getDb>;

export const KUNCI_TUNDA = "modul_tunda";

export interface TundaMinggu {
  senin: string;
  oleh: string;
  pada: string;
  libur: Record<string, string[]>;
}

type NilaiTunda = Record<string, TundaMinggu[]>;

async function bacaSemua(db: Db): Promise<NilaiTunda> {
  const [row] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_TUNDA))
    .limit(1);
  const v = row?.nilai;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as NilaiTunda) : {};
}

/** The semester's postponed weeks, oldest first. */
export async function bacaTunda(db: Db, semester: string): Promise<TundaMinggu[]> {
  const list = (await bacaSemua(db))[semester];
  return Array.isArray(list) ? [...list].sort((a, b) => a.senin.localeCompare(b.senin)) : [];
}

async function tulis(db: Db, nilai: NilaiTunda, nim: string) {
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_TUNDA, nilai, diubahOleh: nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: nim, diubahPada: sql`now()` },
    });
}

/** Postpones (`tunda`) or brings back the week starting `senin`. */
export async function aturTunda(
  db: Db,
  f: { semester: string; senin: string; tunda: boolean; nim: string; hariIni: string },
): Promise<void> {
  const semua = await bacaSemua(db);
  const list = (semua[f.semester] ?? []).filter((x) => x.senin !== f.senin);
  const lama = (semua[f.semester] ?? []).find((x) => x.senin === f.senin);
  const rows = await db.select().from(jadwal).where(eq(jadwal.semester, f.semester));
  const tanggalan = [0, 1, 2, 3, 4, 5]
    .map((i) => tambahHari(f.senin, i))
    .filter((t) => t >= f.hariIni);

  if (f.tunda) {
    if (lama) return;
    const libur: Record<string, string[]> = {};
    for (const r of rows) {
      if (r.status === "kosong") continue;
      const ada = new Set(daftarLibur(r.liburTanggal));
      const tambah = tanggalan.filter((t) => !ada.has(t));
      if (!tambah.length) continue;
      libur[String(r.id)] = tambah;
      const baru = [...ada, ...tambah].filter((t) => t >= f.hariIni).sort();
      await db
        .update(jadwal)
        .set({ liburTanggal: baru.length ? baru.join(",") : null })
        .where(eq(jadwal.id, r.id));
    }
    list.push({ senin: f.senin, oleh: f.nim, pada: new Date().toISOString(), libur });
  } else {
    if (!lama) return;
    for (const r of rows) {
      const kita = new Set((lama.libur[String(r.id)] ?? []).filter((t) => t >= f.hariIni));
      if (!kita.size) continue;
      const sisa = daftarLibur(r.liburTanggal).filter((t) => !kita.has(t));
      await db
        .update(jadwal)
        .set({ liburTanggal: sisa.length ? sisa.join(",") : null })
        .where(eq(jadwal.id, r.id));
    }
  }
  semua[f.semester] = list.sort((a, b) => a.senin.localeCompare(b.senin));
  await tulis(db, semua, f.nim);
}
