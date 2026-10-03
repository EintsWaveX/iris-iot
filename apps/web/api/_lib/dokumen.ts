/**
 * Written reports (Phase 9 Stage 6b, mockups r-docs and r-builder), behind
 * /api/session/dokumen. Any Asisten writes any kind; drafts are the
 * author's own, a sent report is readable by every Asisten. Requests to
 * the Admin move on to "diproses" and "selesai", set by an Admin (the Tim
 * right) with an optional reply.
 *
 * GET  /api/session/dokumen                 the list: mine, plus everyone's
 *                                           sent ones
 * GET  /api/session/dokumen?id=             one report, its comments and files
 * GET  /api/session/dokumen?serial=1&sesiId=&kelompok=
 *                                           a group's last Serial lines, for
 *                                           the Serial excerpt block
 * POST { aksi: "buat", jenis, judul, blok, konteks }
 *      { aksi: "simpan", id, judul, jenis, blok, konteks }   author, draft
 *      { aksi: "kirim", id }                                 author, draft
 *      { aksi: "hapus", id }                                 author, draft
 *      { aksi: "status", id, status, balasan }               Admin, request
 *      { aksi: "komentar", id, isi }                         a sent report
 *      { aksi: "lampiran", id, nama, url, tipe, ukuran }     author, draft,
 *                                                            after the upload
 *
 * The session's own written note (Reports › one session) is a `laporan`
 * row too, with konteks.catatanSesi; it never shows in this list.
 */
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  laporan,
  laporanKomentar,
  laporanLampiran,
  sesi,
  telemetriLog,
} from "../../src/lib/schema.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import {
  BLOK_MAKS,
  DOKUMEN_BYTE_MAKS,
  JENIS_DOKUMEN,
  JUDUL_MAKS,
  KOMENTAR_MAKS,
  blokValid,
  type JenisDokumen,
} from "../../src/lib/laporan.js";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
export const LAMPIRAN_TIPE = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const LAMPIRAN_MAKS = 10 * 1024 * 1024;

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const bukanCatatanSesi = sql`not (${laporan.konteks} ? 'catatanSesi')`;

/** Context a report may carry: a session, a group in it, a server. */
function bacaKonteks(v: unknown): Record<string, unknown> | null {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (x.sesiId != null) {
    const id = posInt(x.sesiId);
    if (!id) return null;
    out.sesiId = id;
  }
  if (x.kelompok != null) {
    const n = posInt(x.kelompok);
    if (!n || n > 10) return null;
    out.kelompok = n;
  }
  if (x.serverId != null) {
    const id = posInt(x.serverId);
    if (!id) return null;
    out.serverId = id;
  }
  if (x.sebut != null) {
    if (!Array.isArray(x.sebut) || x.sebut.length > 20) return null;
    if (!x.sebut.every((s) => typeof s === "string" && s.length <= 20)) return null;
    out.sebut = [...new Set(x.sebut as string[])];
  }
  return out;
}

function bacaIsi(body: Record<string, unknown>) {
  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  const jenis = body.jenis as JenisDokumen;
  const blok = body.blok;
  const konteks = bacaKonteks(body.konteks);
  if (
    judul.length > JUDUL_MAKS ||
    !(JENIS_DOKUMEN as readonly string[]).includes(jenis) ||
    !Array.isArray(blok) ||
    blok.length > BLOK_MAKS ||
    !blok.every(blokValid) ||
    new Set(blok.map((b) => (b as { id: string }).id)).size !== blok.length ||
    konteks === null ||
    JSON.stringify(blok).length > DOKUMEN_BYTE_MAKS
  ) {
    return null;
  }
  return { judul, jenis, blok: blok as unknown as Record<string, unknown>[], konteks };
}

async function muat(id: number) {
  const [row] = await getDb()
    .select()
    .from(laporan)
    .where(and(eq(laporan.id, id), bukanCatatanSesi))
    .limit(1);
  return row ?? null;
}

export async function handleDokumenGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  if (req.query.serial != null) {
    const sesiId = posInt(req.query.sesiId);
    const kelompok = posInt(req.query.kelompok);
    if (!sesiId || !kelompok) {
      res.status(400).json({ ok: false, kode: "format_salah" });
      return;
    }
    const rows = await db
      .select({
        seq: telemetriLog.seq,
        tx: telemetriLog.tx,
        rx: telemetriLog.rx,
        delayMs: telemetriLog.delayMs,
        pada: telemetriLog.dicatatPada,
      })
      .from(telemetriLog)
      .where(and(eq(telemetriLog.sesiId, sesiId), eq(telemetriLog.kelompokNomor, kelompok)))
      .orderBy(desc(telemetriLog.id))
      .limit(30);
    res.status(200).json({ ok: true, baris: rows.reverse() });
    return;
  }

  const id = req.query.id != null ? posInt(req.query.id) : null;
  if (req.query.id != null && !id) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (id) {
    const row = await muat(id);
    if (!row || (row.status === "draf" && row.penulisNim !== session.nim)) {
      res.status(200).json({ ok: false, kode: "tidak_ada" });
      return;
    }
    const [komentar, lampiran] = await Promise.all([
      db
        .select()
        .from(laporanKomentar)
        .where(eq(laporanKomentar.laporanId, id))
        .orderBy(asc(laporanKomentar.pada)),
      db
        .select()
        .from(laporanLampiran)
        .where(eq(laporanLampiran.laporanId, id))
        .orderBy(asc(laporanLampiran.pada)),
    ]);
    res.status(200).json({ ok: true, laporan: row, komentar, lampiran });
    return;
  }

  const rows = await db
    .select({
      id: laporan.id,
      judul: laporan.judul,
      jenis: laporan.jenis,
      status: laporan.status,
      konteks: laporan.konteks,
      penulisNim: laporan.penulisNim,
      dibuatPada: laporan.dibuatPada,
      diubahPada: laporan.diubahPada,
      dikirimPada: laporan.dikirimPada,
      komentar: sql<number>`(select count(*)::int from ${laporanKomentar} k where k.laporan_id = ${laporan.id})`,
    })
    .from(laporan)
    .where(
      and(bukanCatatanSesi, or(eq(laporan.penulisNim, session.nim), ne(laporan.status, "draf"))),
    )
    .orderBy(desc(laporan.diubahPada))
    .limit(500);
  // The session each report points at, for the "Kamis, 1 Oktober 2026 ·
  // Slot 3" context line.
  const sesiIds = [
    ...new Set(rows.map((r) => posInt((r.konteks as { sesiId?: unknown }).sesiId)).filter(Boolean)),
  ] as number[];
  const sesiRows = sesiIds.length
    ? await db
        .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot, modul: sesi.modul })
        .from(sesi)
        .where(inArray(sesi.id, sesiIds))
    : [];
  res.status(200).json({ ok: true, laporan: rows, sesi: sesiRows });
}

export async function handleDokumenPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const db = getDb();
  const gagal = (kode: string) => res.status(200).json({ ok: false, kode });

  if (body.aksi === "buat") {
    const isi = bacaIsi(body);
    if (!isi) return gagal("format_salah");
    const [row] = await db
      .insert(laporan)
      .values({ ...isi, status: "draf", penulisNim: session.nim })
      .returning({ id: laporan.id, diubahPada: laporan.diubahPada });
    res.status(200).json({ ok: true, id: row.id, pada: row.diubahPada.toISOString() });
    return;
  }

  const id = posInt(body.id);
  if (!id) return gagal("format_salah");
  const row = await muat(id);
  if (!row || (row.status === "draf" && row.penulisNim !== session.nim)) return gagal("tidak_ada");
  const milikku = row.penulisNim === session.nim;
  const draf = row.status === "draf";

  if (body.aksi === "simpan") {
    if (!milikku) return gagal("bukan_milikmu");
    if (!draf) return gagal("sudah_dikirim");
    const isi = bacaIsi(body);
    if (!isi) return gagal("format_salah");
    const now = new Date();
    await db
      .update(laporan)
      .set({ ...isi, diubahPada: now })
      .where(and(eq(laporan.id, id), eq(laporan.status, "draf")));
    res.status(200).json({ ok: true, pada: now.toISOString() });
    return;
  }
  if (body.aksi === "kirim") {
    if (!milikku) return gagal("bukan_milikmu");
    if (!draf) return gagal("sudah_dikirim");
    if (!row.judul.trim()) return gagal("tanpa_judul");
    const now = new Date();
    await db
      .update(laporan)
      .set({ status: "terkirim", dikirimPada: now, diubahPada: now })
      .where(eq(laporan.id, id));
    await writeAudit(session.nim, "laporan_kirim", {
      id,
      judul: row.judul,
      jenis: row.jenis,
      sebut: (row.konteks as { sebut?: string[] }).sebut ?? [],
    });
    res.status(200).json({ ok: true, pada: now.toISOString() });
    return;
  }
  if (body.aksi === "hapus") {
    if (!milikku) return gagal("bukan_milikmu");
    if (!draf) return gagal("sudah_dikirim");
    await db.delete(laporan).where(eq(laporan.id, id));
    res.status(200).json({ ok: true });
    return;
  }
  if (body.aksi === "status") {
    const orang = await muatOrang(session.nim);
    if (!orang || !bolehPenuh(orang, "tim")) return gagal("tanpa_hak");
    if (row.jenis !== "permintaan" || draf) return gagal("format_salah");
    const status = body.status;
    if (status !== "diproses" && status !== "selesai") return gagal("format_salah");
    const balasan =
      typeof body.balasan === "string" && body.balasan.trim()
        ? body.balasan.trim().slice(0, KOMENTAR_MAKS)
        : row.balasan;
    const now = new Date();
    await db
      .update(laporan)
      .set({ status, balasan, diprosesOleh: session.nim, diubahPada: now })
      .where(eq(laporan.id, id));
    await writeAudit(session.nim, "laporan_status", { id, judul: row.judul, status });
    res.status(200).json({ ok: true, pada: now.toISOString() });
    return;
  }
  if (body.aksi === "komentar") {
    if (draf) return gagal("masih_draf");
    const isi = typeof body.isi === "string" ? body.isi.trim() : "";
    if (!isi || isi.length > KOMENTAR_MAKS) return gagal("format_salah");
    const [k] = await db
      .insert(laporanKomentar)
      .values({ laporanId: id, nim: session.nim, isi })
      .returning();
    res.status(200).json({ ok: true, komentar: k });
    return;
  }
  if (body.aksi === "lampiran") {
    if (!milikku) return gagal("bukan_milikmu");
    if (!draf) return gagal("sudah_dikirim");
    const nama = typeof body.nama === "string" ? body.nama.slice(0, 200) : "";
    const url = typeof body.url === "string" ? body.url : "";
    const tipe = typeof body.tipe === "string" ? body.tipe : "";
    const ukuran = Number(body.ukuran);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      // rejected below
    }
    if (
      !nama ||
      !host.endsWith(BLOB_HOST_SUFFIX) ||
      !LAMPIRAN_TIPE.includes(tipe) ||
      !Number.isInteger(ukuran) ||
      ukuran <= 0 ||
      ukuran > LAMPIRAN_MAKS
    ) {
      return gagal("format_salah");
    }
    const [l] = await db
      .insert(laporanLampiran)
      .values({ laporanId: id, nama, url, tipe, ukuran, nim: session.nim })
      .returning();
    res.status(200).json({ ok: true, lampiran: l });
    return;
  }
  gagal("format_salah");
}
