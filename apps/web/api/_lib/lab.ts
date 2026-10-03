/**
 * GET /api/session/lab (Phase 9, Home concept A): "In the lab now". Public,
 * so the Home page shows it to guests too. Only counts and the module leave
 * this route: no names, no NIMs, no group numbers. With `?saya=1` an Asisten
 * also gets the group numbers they hold; that URL is never cached by the CDN,
 * so the plain one stays one shared response for every visitor.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { currentSession } from "./session.js";
import { getDb } from "../../src/lib/db.js";
import {
  jawaban,
  kelompok,
  percobaanMasuk,
  sesiAnggota,
  sesiAsisten,
  telemetriLog,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { durasiSesi } from "../../src/lib/jadwal.js";
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
  const [[hadir], [anggota], [blank], [pesan]] = await Promise.all([
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
  ]);

  const who = currentSession(req);
  let pegang: number[] | undefined;
  if (req.query.saya === "1" && who?.role === "asisten") {
    const rows = await db
      .select({ nomor: kelompok.nomor })
      .from(sesiAsisten)
      .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
      .where(and(eq(sesiAsisten.sesiId, s.id), eq(sesiAsisten.asistenNim, who.nim)));
    pegang = rows.map((r) => r.nomor).sort((a, b) => a - b);
  }

  const out: LabSekarang = {
    modul: s.modul,
    kelas: s.kelas === "internasional" ? "internasional" : "reguler",
    mulaiPada: (s.mulaiPada ?? s.dibuatPada).toISOString(),
    durasiMenit: durasiSesi(s),
    kelompok: s.jumlahKelompok ?? 5,
    hadir: hadir?.n ?? 0,
    anggota: anggota?.n ?? 0,
    blank: blank?.n ?? 0,
    pesan: pesan?.n ?? 0,
  };
  // The per-viewer answer must not be shared by the CDN.
  if (req.query.saya === "1") res.setHeader("Cache-Control", "private, no-store");
  else res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10");
  res.status(200).json({ ok: true, sesi: out, pegang });
}
