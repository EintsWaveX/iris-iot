/**
 * POST /api/tindakan   { tipe: "kirim", serverId, aksi, argumen }
 *                    | { tipe: "adopsi", id, nama, jenis }
 *   — assistant-only for both.
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
 * agent's next heartbeat (api/agen/index.ts), not immediately -- there is
 * no inbound path to the Pi to deliver it any faster.
 *
 * "adopsi": names a discovered device and, optionally, corrects its
 * guessed type. Once diadopsi is true, a rediscovery on the next heartbeat
 * can no longer overwrite vendor/jenis (see api/agen/index.ts's
 * onConflictDoUpdate) -- this is the write that flips that flag.
 */
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "./_lib/http.js";
import { requireRole } from "./_lib/session.js";
import { getDb } from "../src/lib/db.js";
import { perintah, perangkat, server } from "../src/lib/schema.js";
import {
  aksiValid,
  layananValid,
  jenisPerangkatValid,
  type JenisPerangkat,
} from "../src/lib/server-lib.js";
import { writeAudit } from "../src/lib/auth.js";
import type { SessionPayload } from "../src/lib/auth.js";
import { eq } from "drizzle-orm";

const MAX_NAMA_LEN = 40;

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
    console.error("[api/tindakan kirim] unexpected error:", err);
    res.status(200).json({
      ok: false,
      kode: pgErrorCode(err) === "23503" ? "server_tidak_ada" : "galat_server",
    });
  }
}

async function handleAdopsi(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = Number(body.id);
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  const jenisMentah = body.jenis;

  if (!Number.isInteger(id) || id <= 0 || !nama || nama.length > MAX_NAMA_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (jenisMentah !== undefined && !jenisPerangkatValid(jenisMentah)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  // Asserted, not narrowed: jenisPerangkatValid() above already proved
  // this at runtime, but TS's control-flow narrowing does not survive into
  // a later ternary/ spread the way a straight-line `if` guard normally
  // would -- confirmed by a real `vercel build` failure showing `jenis:
  // unknown` still reaching the .set() call, not by reasoning about it.
  // astro check's own tsconfig (bundler resolution) never caught this,
  // the same class of gap Phase 1 hit with node16 import extensions.
  const jenis = jenisMentah as JenisPerangkat | undefined;

  const db = getDb();
  const result = await db
    .update(perangkat)
    .set(jenis === undefined ? { nama, diadopsi: true } : { nama, diadopsi: true, jenis })
    .where(eq(perangkat.id, id))
    .returning({ id: perangkat.id, mac: perangkat.mac });

  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }

  await writeAudit(session.nim, "perangkat_adopsi", { id, nama, mac: result[0].mac });
  res.status(200).json({ ok: true });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  if (body.tipe === "kirim") return handleKirim(req, res, session);
  if (body.tipe === "adopsi") return handleAdopsi(req, res, session);

  res.status(200).json({ ok: false, kode: "format_salah" });
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
