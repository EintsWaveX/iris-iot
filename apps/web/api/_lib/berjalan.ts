/**
 * While a session runs (Phase 9 Stage 3, mockup c-run), behind
 * /api/session/:aksi:
 *
 * POST /api/session/durasi    { menit }   — asisten. Extend (or shorten)
 *                              the running session: 15 minutes from now at
 *                              the least, 150 at most (src/lib/sesi-mulai).
 * The session's incident log itself is read and written in
 * api/_lib/laporan-data.ts (GET and POST /api/session/kejadian).
 *
 * Pairing changes themselves stay on /api/session/assignment
 * (api/_lib/phase8.ts), which calls `cekPasangan` and `catatPasangan` here:
 * the `pair` right (own slot, or any slot for Managers and Admins), a
 * reason whenever a group loses the assistant it had, and one
 * `sesi_kejadian` row per change, with the group's first pairing so
 * Reports can say "A scores Group C (changed from the original pairing: B
 * with Group C)".
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok, sesi, sesiAsisten, sesiKejadian } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { durasiSesi } from "../../src/lib/jadwal.js";
import { bacaDurasiBaru, durasiPalingPendek } from "../../src/lib/sesi-mulai.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";

type Db = ReturnType<typeof getDb>;

/** Shortest reason a pairing change accepts (the dialog's own rule). */
export const ALASAN_MIN = 5;

/**
 * One line in a session's incident log (Reports › Incidents). Kinds the
 * system writes: mulai, akhiri, batal, siarkan, lanjutkan, durasi,
 * pasangan, akun_seelabs (tangan and tangan_jawab, the raised hands, were
 * written until 2026-10-22 and still show in old logs). Asisten write "catatan".
 * Best effort: a failed log line never fails the action it describes.
 */
export async function catatKejadian(
  sesiId: number,
  jenis: string,
  detail: Record<string, unknown>,
  aktorNim: string,
): Promise<void> {
  try {
    await getDb().insert(sesiKejadian).values({ sesiId, jenis, detail, aktorNim });
  } catch (err) {
    console.error("[kejadian] log line failed:", jenis, err);
  }
}

export async function handleDurasi(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const mulai = (running.mulaiPada ?? running.dibuatPada).getTime();
  const berjalan = (Date.now() - mulai) / 60_000;
  const dari = durasiSesi(running);
  const ke = bacaDurasiBaru(jsonBody(req).menit, berjalan);
  if (ke === null) {
    res.status(200).json({
      ok: false,
      kode: "durasi_salah",
      paling: { pendek: durasiPalingPendek(berjalan), panjang: 150 },
    });
    return;
  }
  if (ke === dari) {
    res.status(200).json({ ok: true, durasiMenit: dari });
    return;
  }
  const db = getDb();
  await db.update(sesi).set({ durasiMenit: ke }).where(eq(sesi.id, running.id));
  await db
    .insert(sesiKejadian)
    .values({ sesiId: running.id, jenis: "durasi", detail: { dari, ke }, aktorNim: session.nim });
  await writeAudit(session.nim, "sesi_durasi", { sesiId: running.id, dari, ke });
  res.status(200).json({ ok: true, durasiMenit: ke });
}

/**
 * May this person change pairings in this session? The full `pair` right
 * may anywhere; the own-slot right needs them on the slot's schedule
 * (`diSlot`) or already holding a group in this session.
 */
export async function cekPasangan(
  db: Db,
  nim: string,
  sesiId: number,
  diSlot: (kode: string) => boolean,
): Promise<"ok" | "tanpa_hak" | "bukan_slotmu"> {
  const orang = await muatOrang(nim);
  if (!orang) return "tanpa_hak";
  if (bolehPenuh(orang, "pair")) return "ok";
  if (diSlot(orang.kode)) return "ok";
  const [pegang] = await db
    .select({ id: sesiAsisten.id })
    .from(sesiAsisten)
    .where(and(eq(sesiAsisten.sesiId, sesiId), eq(sesiAsisten.asistenNim, nim)))
    .limit(1);
  return pegang ? "ok" : "bukan_slotmu";
}

/** One pairing change, with the group's first pairing for the log line. */
export async function catatPasangan(
  db: Db,
  p: {
    sesiId: number;
    kelompokId: number;
    dari: string | null;
    ke: string | null;
    alasan: string | null;
    aktorNim: string;
  },
) {
  const [g] = await db
    .select({ nomor: kelompok.nomor })
    .from(kelompok)
    .where(eq(kelompok.id, p.kelompokId))
    .limit(1);
  const [pertama] = await db
    .select({ detail: sesiKejadian.detail })
    .from(sesiKejadian)
    .where(
      and(
        eq(sesiKejadian.sesiId, p.sesiId),
        eq(sesiKejadian.jenis, "pasangan"),
        sql`${sesiKejadian.detail}->>'kelompokId' = ${String(p.kelompokId)}`,
      ),
    )
    .orderBy(asc(sesiKejadian.pada), asc(sesiKejadian.id))
    .limit(1);
  const d = pertama?.detail as { dari?: string | null; ke?: string | null } | undefined;
  const awal = d ? (d.dari ?? d.ke ?? null) : (p.dari ?? p.ke);
  await db.insert(sesiKejadian).values({
    sesiId: p.sesiId,
    jenis: "pasangan",
    detail: {
      kelompokId: p.kelompokId,
      nomor: g?.nomor ?? null,
      dari: p.dari,
      ke: p.ke,
      awal,
      alasan: p.alasan,
    },
    aktorNim: p.aktorNim,
  });
}

/** POST /api/session/kit { sesiId, kembali, rusak } -- the hand-over's
 *  "Papan dan kit" count (mockup c-next): kits back and broken, out of one
 *  per group. Any Asisten may set it for a session that ran today. */
export async function handleKit(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kembali = Number(body.kembali);
  const rusak = Number(body.rusak);
  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [row] = await db
    .select({ id: sesi.id, status: sesi.status, jumlahKelompok: sesi.jumlahKelompok })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!row || row.status === "batal" || row.status === "terjadwal") {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const total = row.jumlahKelompok;
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= total;
  if (!ok(kembali) || !ok(rusak)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const kit = { kembali, rusak, total, oleh: session.nim, pada: new Date().toISOString() };
  await db.update(sesi).set({ kit }).where(eq(sesi.id, sesiId));
  await writeAudit(session.nim, "sesi_kit", { sesiId, kembali, rusak, total });
  res.status(200).json({ ok: true, kit });
}
