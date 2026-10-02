/**
 * POST /api/action   { tipe: "kirim", serverId, aksi, argumen }
 *                    | { tipe: "perintah_ulang", id }              (P6.7)
 *                    | { tipe: "perintah_batal", id }              (P6.7)
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
import { perintah, server } from "../src/lib/schema.js";
import { aksiValid, layananValid, modulSiapValid, unitDiagValid } from "../src/lib/server-lib.js";
import { writeAudit } from "../src/lib/auth.js";
import type { SessionPayload } from "../src/lib/auth.js";
import { eq, and } from "drizzle-orm";

async function handleKirim(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const serverId = Number(body.serverId);
  const aksi = body.aksi;
  const argumen = isPlainObject(body.argumen) ? body.argumen : {};

  if (!Number.isInteger(serverId) || serverId <= 0 || !aksiValid(aksi)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
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

/** Commands any Asisten may send while running a slot. */
const AKSI_SLOT = new Set(["ap.nyala", "ap.mati", "jam.selaraskan", "diag.siap"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  // Phase 9: commands need the Server right, except the few an Asisten
  // needs to run their own slot (hotspot, clock, Ready check).
  const kunci = body.tipe === "kirim" && AKSI_SLOT.has(String(body.aksi)) ? "own" : "server";
  if (!(await cekHak(res, session.nim, kunci))) return;
  if (body.tipe === "kirim") return handleKirim(req, res, session);
  if (body.tipe === "perintah_ulang") return handlePerintahUlang(req, res, session);
  if (body.tipe === "perintah_batal") return handlePerintahBatal(req, res, session);

  res.status(200).json({ ok: false, kode: "format_salah" });
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
