/**
 * GET /api/session/lab (Phase 9, Home concept A): "In the lab now". Public,
 * so the Home page shows it to guests too. Only counts and the module leave
 * this route: no names and no NIMs. Phase 10's lab sky adds each group's
 * blanks filled, by group number only (the group names are the fixed
 * constellation names, never people). With `?saya=1` an Asisten
 * also gets the group numbers they hold, the session id and who holds each
 * group (Lihat Sebagai Praktikan); that URL is never cached by the CDN, so
 * the plain one stays one shared response for every visitor.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { currentSession } from "./session.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  jawaban,
  kelompok,
  percobaanMasuk,
  sesiAnggota,
  sesiAsisten,
  telemetriLog,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { durasiSesi } from "../../src/lib/jadwal.js";
import { jumlahCelahModul, kodeModul } from "./kode-aktif.js";
import { and, eq, ne, sql } from "drizzle-orm";

export interface LabSekarang {
  modul: number;
  kelas: "reguler" | "internasional";
  mulaiPada: string;
  durasiMenit: number;
  kelompok: number;
  hadir: number;
  anggota: number;
  blank: number;
  pesan: number;
  /** The module's blanks per group (the lab sky's full star). */
  celah: number;
  /** Blanks filled per group number, every group of the session listed. */
  bintang: { nomor: number; terisi: number }[];
}

export async function handleLab(req: ApiRequest, res: ApiResponse) {
  const s = await currentSesi();
  if (!s) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10");
    res.status(200).json({ ok: true, sesi: null });
    return;
  }
  const db = getDb();
  const n = sql<number>`count(*)::int`;
  const [[hadir], [anggota], [blank], [pesan], perKelompok, kode] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${percobaanMasuk.nim})::int` })
      .from(percobaanMasuk)
      .where(
        and(
          eq(percobaanMasuk.sesiId, s.id),
          eq(percobaanMasuk.berhasil, true),
          eq(percobaanMasuk.jenis, "praktikan"),
        ),
      ),
    db.select({ n }).from(sesiAnggota).where(eq(sesiAnggota.sesiId, s.id)),
    db
      .select({ n })
      .from(jawaban)
      .where(and(eq(jawaban.sesiId, s.id), ne(jawaban.isi, ""))),
    db.select({ n }).from(telemetriLog).where(eq(telemetriLog.sesiId, s.id)),
    db
      .select({ nomor: kelompok.nomor, n })
      .from(jawaban)
      .innerJoin(kelompok, eq(kelompok.id, jawaban.kelompokId))
      .where(and(eq(jawaban.sesiId, s.id), ne(jawaban.isi, "")))
      .groupBy(kelompok.nomor),
    kodeModul(s.modul),
  ]);
  const jumlah = s.jumlahKelompok ?? 5;
  const terisi = new Map(perKelompok.map((r) => [r.nomor, r.n]));
  const bintang = Array.from({ length: jumlah }, (_, i) => ({
    nomor: i + 1,
    terisi: terisi.get(i + 1) ?? 0,
  }));

  const who = currentSession(req);
  let pegang: number[] | undefined;
  let pemegang: Record<number, string> | undefined;
  if (req.query.saya === "1" && who?.role === "asisten") {
    const rows = await db
      .select({
        nomor: kelompok.nomor,
        nim: sesiAsisten.asistenNim,
        nama: asisten.nama,
        kode: asisten.kode,
      })
      .from(sesiAsisten)
      .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
      .leftJoin(asisten, eq(asisten.nim, sesiAsisten.asistenNim))
      .where(eq(sesiAsisten.sesiId, s.id));
    pegang = rows
      .filter((r) => r.nim === who.nim)
      .map((r) => r.nomor)
      .sort((a, b) => a - b);
    pemegang = {};
    for (const r of rows)
      if (r.nama) pemegang[r.nomor] = r.kode ? `${r.nama} (${r.kode.toUpperCase()})` : r.nama;
  }

  const out: LabSekarang = {
    modul: s.modul,
    kelas: s.kelas === "internasional" ? "internasional" : "reguler",
    mulaiPada: (s.mulaiPada ?? s.dibuatPada).toISOString(),
    durasiMenit: durasiSesi(s),
    kelompok: jumlah,
    hadir: hadir?.n ?? 0,
    anggota: anggota?.n ?? 0,
    blank: blank?.n ?? 0,
    pesan: pesan?.n ?? 0,
    celah: jumlahCelahModul(kode),
    bintang,
  };
  // The per-viewer answer must not be shared by the CDN.
  if (req.query.saya === "1") res.setHeader("Cache-Control", "private, no-store");
  else res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10");
  // An Asisten also gets the session id (Lihat Sebagai Praktikan reads that
  // session's captures); a guest never does.
  res
    .status(200)
    .json({ ok: true, sesi: out, pegang, ...(pegang ? { sesiId: s.id, pemegang } : {}) });
}
