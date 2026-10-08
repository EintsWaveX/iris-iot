/**
 * POST /api/action   { tipe: "kirim", serverId, aksi, argumen }
 *                    | { tipe: "perintah_ulang", id }              (P6.7)
 *                    | { tipe: "perintah_batal", id }              (P6.7)
 *                    | { tipe: "perintah_hapus", serverId }        (Phase 9)
 *                    | { tipe: "riwayat_hapus", serverId }         (Phase 9)
 *                    | { tipe: "konsol_*", ... }  (Phase 9 Stage 9, Konsol Pi;
 *                      see _lib/konsol.ts, rights by badge there)
 *   — assistant-only for all three. Phase 9 removed "adopsi" and
 *   "perangkat" with the Devices tab; the perangkat table stays.
 *
 * Two actions that would otherwise be their own route files, merged into
 * one: the Vercel Hobby plan caps a deployment at 12 serverless functions,
 * and this project is already at that ceiling with the Phase 2 server
 * registry's other routes (server/index, server/[id], agen/index) plus
 * Phase 1's seven. Splitting these back into api/perintah/index.ts and
 * api/perangkat/adopsi.ts is fine once the project is on a plan without
 * that limit, or once another route is retired to make room — nothing
 * about the handlers below depends on sharing a file, `tipe` is dispatched
 * once at the top and the two branches never share state.
 *
 * "kirim": queues one whitelisted action. `aksi` is validated here against
 * the exact same AKSI_PERINTAH list the agent itself checks before mapping
 * an action to an argv list (server-lib.ts) -- an action neither side
 * recognises is refused at both ends, on purpose. Delivery happens on the
 * agent's next heartbeat (api/agent/index.ts), not immediately -- there is
 * no inbound path to the Pi to deliver it any faster.
 */
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { cekHak } from "./_lib/hak.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "./_lib/http.js";
import { requireRole } from "./_lib/session.js";
import { getDb } from "../src/lib/db.js";
import { denyut, perintah, server } from "../src/lib/schema.js";
import {
  aksiValid,
  bangunTimelineLayanan,
  detectGaps,
  detectReboots,
  layananValid,
  modulSiapValid,
  RENTANG_DETIK,
  unitDiagValid,
} from "../src/lib/server-lib.js";
import { apSumberValid, journalArgValid } from "../src/lib/server-shared.js";
import { handleKonsolAksi } from "./_lib/konsol.js";
import { bundelTerbaru } from "./_lib/bundel.js";
import { currentSesi } from "../src/lib/sesi.js";
import { writeAudit } from "../src/lib/auth.js";
import type { SessionPayload } from "../src/lib/auth.js";
import { and, asc, desc, eq, gte, notInArray } from "drizzle-orm";
import { denganSiaran } from "./_lib/siaran.js";

async function handleKirim(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const serverId = Number(body.serverId);
  const aksi = body.aksi;
  let argumen = isPlainObject(body.argumen) ? body.argumen : {};

  if (!Number.isInteger(serverId) || serverId <= 0 || !aksiValid(aksi)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  // Konsol Pi opens only through its own approved ticket flow.
  if (aksi === "konsol.buka") {
    res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "konsol" });
    return;
  }
  if (aksi.startsWith("layanan.") && !layananValid(argumen.layanan)) {
    res.status(200).json({ ok: false, kode: "layanan_tidak_dikenal" });
    return;
  }
  if (aksi === "diag.log" && !unitDiagValid(argumen.layanan)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (aksi === "diag.siap" && !modulSiapValid(argumen.modul ?? "")) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (aksi === "diag.journal" && !journalArgValid(argumen)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (aksi === "ap.sumber") {
    if (!apSumberValid(argumen.sumber)) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    argumen = { sumber: argumen.sumber };
  }
  // The Updates card: services restart while it installs, so never during
  // a session, and the bundle is always the one CI published last.
  if (aksi === "pembaruan.bundel" || aksi === "pembaruan.apt") {
    if (await currentSesi()) {
      res.status(200).json({ ok: false, kode: "sesi_berjalan" });
      return;
    }
    if (aksi === "pembaruan.bundel") {
      const terbit = await bundelTerbaru();
      if (!terbit) {
        res.status(200).json({ ok: false, kode: "bundel_belum_ada" });
        return;
      }
      argumen = { sha256: terbit.sha256 };
    } else {
      argumen = {};
    }
  }

  try {
    const db = getDb();
    const [target] = await db
      .select({ id: server.id })
      .from(server)
      .where(eq(server.id, serverId))
      .limit(1);
    if (!target) {
      res.status(200).json({ ok: false, kode: "server_tidak_ada" });
      return;
    }

    const [row] = await db
      .insert(perintah)
      .values({ serverId, aksi, argumen, dimintaOleh: session.nim })
      .returning({ id: perintah.id });

    await writeAudit(session.nim, "perintah_kirim", {
      serverId,
      aksi,
      argumen,
      perintahId: row.id,
    });
    res.status(200).json({ ok: true, id: row.id });
  } catch (err) {
    console.error("[api/action kirim] unexpected error:", err);
    res.status(200).json({
      ok: false,
      kode: pgErrorCode(err) === "23503" ? "server_tidak_ada" : "galat_server",
    });
  }
}

/**
 * "perintah_ulang" (P6.7): re-queues a finished command's exact aksi and
 * argumen as a brand new `menunggu` row rather than resetting the old
 * one's status -- the original stays in the log exactly as it happened,
 * and the retry gets its own id, timestamps and eventual outcome. Only
 * offered for a command that is actually done trying (gagal/kedaluwarsa);
 * retrying one still selesai or in flight makes no sense.
 */
async function handlePerintahUlang(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [asal] = await db.select().from(perintah).where(eq(perintah.id, id)).limit(1);
  if (!asal) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  if (asal.status !== "gagal" && asal.status !== "kedaluwarsa") {
    res.status(200).json({ ok: false, kode: "tidak_bisa_diulang" });
    return;
  }

  const [row] = await db
    .insert(perintah)
    .values({
      serverId: asal.serverId,
      aksi: asal.aksi,
      argumen: asal.argumen,
      dimintaOleh: session.nim,
    })
    .returning({ id: perintah.id });

  await writeAudit(session.nim, "perintah_ulang", { asalId: id, perintahId: row.id });
  res.status(200).json({ ok: true, id: row.id });
}

/**
 * "perintah_batal" (P6.7): only ever cancels a command still `menunggu` --
 * one already claimed (`terkirim`) may be mid-execution on the Pi right
 * now, and there is no way to interrupt a subprocess that is already
 * running there, so pretending to cancel it here would just lie about
 * what actually happens.
 */
async function handlePerintahBatal(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const result = await db
    .update(perintah)
    .set({ status: "gagal", selesaiPada: new Date(), keluaran: "dibatalkan oleh asisten" })
    .where(and(eq(perintah.id, id), eq(perintah.status, "menunggu")))
    .returning({ id: perintah.id });

  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_bisa_dibatalkan" });
    return;
  }
  await writeAudit(session.nim, "perintah_batal", { id });
  res.status(200).json({ ok: true });
}

/** Rows an audit copy keeps; a cleared log longer than this keeps its newest. */
const SALINAN_MAKS = 500;

/**
 * "perintah_hapus" (Phase 9 Stage 5): "Kosongkan log" on All commands.
 * Removes the server's finished commands (one still queued or on its way to
 * the Pi stays, its result has to land somewhere), after a compact copy of
 * them goes into the audit log.
 */
async function handlePerintahHapus(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const serverId = Number(jsonBody(req).serverId);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const selesai = notInArray(perintah.status, ["menunggu", "terkirim"]);
  const lama = await db
    .select()
    .from(perintah)
    .where(and(eq(perintah.serverId, serverId), selesai))
    .orderBy(desc(perintah.id))
    .limit(SALINAN_MAKS);
  await writeAudit(session.nim, "perintah_hapus", {
    serverId,
    salinan: lama.map((p) => ({
      id: p.id,
      aksi: p.aksi,
      argumen: p.argumen,
      status: p.status,
      oleh: p.dimintaOleh,
      pada: p.dimintaPada,
      keluaran: p.keluaran?.slice(0, 200) ?? null,
    })),
  });
  const hapus = await db
    .delete(perintah)
    .where(and(eq(perintah.serverId, serverId), selesai))
    .returning({ id: perintah.id });
  res.status(200).json({ ok: true, jumlah: hapus.length });
}

/**
 * "riwayat_hapus" (Phase 9 Stage 5): "Kosongkan log" on the History dialog.
 * The events come from denyut rows the charts still need, so nothing is
 * deleted: server.riwayat_sejak hides what came before, and the audit log
 * keeps the events that were showing.
 */
async function handleRiwayatHapus(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const serverId = Number(jsonBody(req).serverId);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [row] = await db
    .select({ sejak: server.riwayatSejak })
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "server_tidak_ada" });
    return;
  }
  const dari = row.sejak ?? new Date(Date.now() - RENTANG_DETIK["7d"] * 1000);
  const seri = (
    await db
      .select({ pada: denyut.pada, uptimeSec: denyut.uptimeSec, layanan: denyut.layanan })
      .from(denyut)
      .where(and(eq(denyut.serverId, serverId), gte(denyut.pada, dari)))
      .orderBy(asc(denyut.pada))
  ).map((r) => ({ ...r, pada: r.pada.toISOString() }));
  await writeAudit(session.nim, "riwayat_hapus", {
    serverId,
    dari: dari.toISOString(),
    reboot: detectReboots(seri),
    gap: detectGaps(seri),
    layanan: bangunTimelineLayanan(seri).slice(-SALINAN_MAKS),
  });
  await db.update(server).set({ riwayatSejak: new Date() }).where(eq(server.id, serverId));
  res.status(200).json({ ok: true });
}

/** Commands any Asisten may send while running a slot. */
// layanan.mulai (2026-10-05): the start check offers it for a stopped
// practicum service; stopping and restarting still need the Server right.
const AKSI_SLOT = new Set(["ap.nyala", "ap.mati", "jam.selaraskan", "diag.siap", "layanan.mulai"]);
/** Commands that belong to the Full view (DEV, Admin, Pencipta). */
const AKSI_FULL = new Set(["diag.rinci", "diag.journal", "ap.sumber"]);

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  // Konsol Pi checks its own rights (the DEV badge, the Pencipta).
  if (typeof body.tipe === "string" && body.tipe.startsWith("konsol_"))
    return handleKonsolAksi(req, res, session, body.tipe);
  // Phase 9: commands need the Server right, except the few an Asisten
  // needs to run their own slot (hotspot, clock, Ready check).
  // Stage 5: the Full view's reads and clearing a log need the full right.
  const kunci =
    body.tipe === "kirim" && AKSI_SLOT.has(String(body.aksi))
      ? "own"
      : (body.tipe === "kirim" && AKSI_FULL.has(String(body.aksi))) ||
          body.tipe === "perintah_hapus" ||
          body.tipe === "riwayat_hapus"
        ? "full"
        : "server";
  if (!(await cekHak(res, session.nim, kunci))) return;
  if (body.tipe === "kirim") return handleKirim(req, res, session);
  if (body.tipe === "perintah_ulang") return handlePerintahUlang(req, res, session);
  if (body.tipe === "perintah_batal") return handlePerintahBatal(req, res, session);
  if (body.tipe === "perintah_hapus") return handlePerintahHapus(req, res, session);
  if (body.tipe === "riwayat_hapus") return handleRiwayatHapus(req, res, session);

  res.status(200).json({ ok: false, kode: "format_salah" });
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("action", handler);
