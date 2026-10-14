/**
 * The server PC's copy of every TP file (2026-10-14): the list the agent
 * mirrors, the signal that it changed, and what the agent says it holds.
 *
 * The agent asks for the list when a heartbeat's reply says it changed
 * (tp_kiriman's newest sinkron_pada differs from the stamp it last saw) and
 * every 15 minutes anyway (a group move changes a path, not a file). It
 * fetches each new or changed file through /api/agent (ambilIsiTp), moves
 * or deletes what changed, and drops whole semesters the site no longer
 * holds (the 6-month cleanup). Only the current semester is listed; an
 * older one stays on the PC as it was until its cleanup.
 */
import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { pengaturan, praktikan, tpKiriman } from "../../src/lib/schema.js";
import { jalanCermin, type TempatCermin } from "../../src/lib/tp-cermin.js";
import { bacaSet, kursiModul, tulisSet } from "./tp.js";

type Db = ReturnType<typeof getDb>;

export const KUNCI_CERMIN = "tp_cermin";

export interface EntriCermin {
  /** tp_kiriman id and the file's index in it: what the agent fetches. */
  id: number;
  i: number;
  modul: number;
  nim: string;
  /** Under the PC's TP folder, '/' between parts. */
  jalan: string;
  /** Changes whenever the file does. */
  kunci: string;
  ukuran: number;
}

export interface DaftarCermin {
  semester: string;
  /** Every semester the site still holds: any other folder goes. */
  semesterAda: string[];
  /** The newest tp_kiriman change, sent back on the heartbeat. */
  stempel: string | null;
  entri: EntriCermin[];
  versi: string;
}

/** The newest change to any TP file row, as the heartbeat compares it. */
export async function stempelCermin(db: Db): Promise<string | null> {
  const [r] = await db
    .select({
      t: sql<string | null>`max(${tpKiriman.sinkronPada})::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(tpKiriman);
  // The count too: a semester's cleanup can leave the newest time as it was.
  return r?.t ? `${r.t}#${r.n}` : null;
}

export async function daftarCermin(db: Db): Promise<DaftarCermin> {
  const set = await bacaSet(db);
  const [semesterRows, kiriman, nama, stempel] = await Promise.all([
    db.selectDistinct({ s: tpKiriman.semester }).from(tpKiriman),
    db.select().from(tpKiriman).where(eq(tpKiriman.semester, set.semester)),
    db
      .select({ nim: praktikan.nim, nama: praktikan.nama })
      .from(praktikan)
      .where(eq(praktikan.semester, set.semester)),
    stempelCermin(db),
  ]);
  const namaOf = new Map(nama.map((p) => [p.nim, p.nama]));
  const modul = [...new Set(kiriman.filter((k) => k.berkas.length).map((k) => k.modul))];
  const tempatOf = new Map<string, TempatCermin>();
  for (const m of modul)
    for (const k of await kursiModul(db, set, m))
      for (const [nomor, list] of k.anggota)
        for (const a of list)
          tempatOf.set(`${m}|${a.nim}`, { tanggal: k.tanggal, slot: k.slot, nomor });
  const entri: EntriCermin[] = kiriman.flatMap((k) =>
    k.berkas.map((b, i) => ({
      id: k.id,
      i,
      modul: k.modul,
      nim: k.nim,
      jalan: jalanCermin({
        semester: k.semester,
        modul: k.modul,
        nim: k.nim,
        nama: namaOf.get(k.nim) ?? "",
        asli: b.nama,
        i,
        jumlah: k.berkas.length,
        tempat: tempatOf.get(`${k.modul}|${k.nim}`) ?? null,
      }),
      kunci: createHash("sha256")
        .update(`${b.url}|${b.ukuran}|${k.dikirimPada?.getTime() ?? 0}`)
        .digest("hex")
        .slice(0, 24),
      ukuran: b.ukuran,
    })),
  );
  entri.sort((a, b) => a.jalan.localeCompare(b.jalan));
  return {
    semester: set.semester,
    semesterAda: [...new Set([set.semester, ...semesterRows.map((r) => r.s)])].sort(),
    stempel,
    entri,
    versi: createHash("sha256").update(JSON.stringify(entri)).digest("hex").slice(0, 24),
  };
}

/* ================================================ what the PC reports */

export interface StatusCermin {
  /** The folder on the PC. */
  akar: string;
  berkas: number;
  ukuran: number;
  /** The last mirror that finished, and what it failed on (null: nothing). */
  pada: string | null;
  galat: string | null;
  /** The manifest version it holds. */
  versi: string | null;
  /** When the site last heard it (the heartbeat). */
  dilihat: string;
}

export type CerminSet = Record<string, StatusCermin>;

/** A heartbeat's tpCermin, or null when it carries none or a bad one. */
export function saringCermin(v: unknown): Omit<StatusCermin, "dilihat"> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const teks = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : null);
  const angka = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0;
  return {
    akar: teks(o.akar, 200) ?? "",
    berkas: angka(o.berkas),
    ukuran: angka(o.ukuran),
    pada: teks(o.pada, 40),
    galat: teks(o.galat, 300),
    versi: teks(o.versi, 40),
  };
}

/** Stores a server's report when it changed, or hourly (so "seen" stays fresh). */
export async function simpanStatusCermin(
  db: Db,
  serverId: number,
  s: Omit<StatusCermin, "dilihat">,
): Promise<boolean> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_CERMIN))
    .limit(1);
  const semua = ((r?.nilai as CerminSet | undefined) ?? {}) as CerminSet;
  const lama = semua[String(serverId)];
  const sama =
    lama &&
    JSON.stringify({ ...lama, dilihat: undefined }) ===
      JSON.stringify({ ...s, dilihat: undefined });
  if (sama && Date.now() - Date.parse(lama.dilihat) < 3_600_000) return false;
  semua[String(serverId)] = { ...s, dilihat: new Date().toISOString() };
  await tulisSet(db, KUNCI_CERMIN, semua, null);
  return !sama;
}

export async function bacaStatusCermin(db: Db): Promise<CerminSet> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(inArray(pengaturan.kunci, [KUNCI_CERMIN]))
    .limit(1);
  return ((r?.nilai as CerminSet | undefined) ?? {}) as CerminSet;
}
