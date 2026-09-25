/**
 * /api/presentasi/:aksi — the assistant-uploaded presentation library
 * (Stage 9). The one dynamic-segment function for this feature, same
 * consolidation reasoning as api/session/[aksi].ts and api/modul/[aksi].ts:
 * the Vercel Hobby plan's serverless function ceiling.
 *
 * Storage is Vercel Blob (BLOB_READ_WRITE_TOKEN, set once a Blob store is
 * created on the project's Storage tab and pulled with `vercel env pull`,
 * the same manual provisioning step DATABASE_URL already needed). File
 * bytes never pass through this function: handleToken() only brokers a
 * short-lived, content-type- and size-restricted client token, and the
 * browser then PUTs the file straight to Vercel Blob's own API. That is
 * what lets a slide deck exceed Vercel's ~4.5 MB request body ceiling at
 * all, which a plain multipart upload through this route could not.
 *
 * GET  /api/presentasi/aktif    — asisten OR praktikan. The one entry the
 *                                  dashboard card shows, or null.
 * GET  /api/presentasi/daftar   — asisten only. The full library, for the
 *                                  management list.
 * POST /api/presentasi/token    { ...client-upload handshake body } —
 *                                  asisten only. Issues the upload token.
 * POST /api/presentasi/simpan   { url, namaBerkas } — asisten only. Records
 *                                  a completed upload. Deliberately not
 *                                  onUploadCompleted: that callback is a
 *                                  webhook Vercel calls back on a publicly
 *                                  reachable deployment URL, which doesn't
 *                                  exist during local development or this
 *                                  project's throwaway-Postgres
 *                                  verification, and upload() on the client
 *                                  already resolves with the blob's own URL
 *                                  the moment the direct PUT finishes -- no
 *                                  need to wait on the webhook for that.
 * POST /api/presentasi/aktifkan { id } — asisten only. Exactly one row is
 *                                  aktif at a time (presentasi_aktif_unik).
 * POST /api/presentasi/nonaktifkan (no body) (P6.6/B12) — asisten only.
 *                                  Turns the active entry off without
 *                                  deleting it, working around
 *                                  presentasi_aktif_unik's partial unique
 *                                  index the same way handleAktifkan does
 *                                  (a plain UPDATE ... SET aktif=false), the
 *                                  gap being that switching TO another entry
 *                                  was the only existing way to turn one
 *                                  OFF, which meant "show nothing" required
 *                                  deleting the deck.
 * POST /api/presentasi/hapus    { id } — asisten only. Deletes the blob and
 *                                  its row.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole, requireAnyRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { presentasi } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { eq, desc } from "drizzle-orm";

// Comfortably above a slide deck; well under what Blob itself allows.
const MAX_BYTES = 20 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const MAX_NAMA_LEN = 200;

async function handleAktif(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const [row] = await db
    .select({ id: presentasi.id, namaBerkas: presentasi.namaBerkas, url: presentasi.url })
    .from(presentasi)
    .where(eq(presentasi.aktif, true))
    .limit(1);
  res.status(200).json({ ok: true, presentasi: row ?? null });
}

async function handleDaftar(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const rows = await db.select().from(presentasi).orderBy(desc(presentasi.diunggahPada));
  res.status(200).json({ ok: true, daftar: rows });
}

/**
 * The client-upload handshake. Vercel's own SDK dictates this response
 * shape (not this project's usual {ok, kode} contract) since @vercel/blob's
 * browser-side upload() parses it directly -- see the docs' own route
 * example, matched here on purpose.
 */
async function handleToken(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req) as unknown as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ nim: session.nim }),
      }),
      // No onUploadCompleted, deliberately (see this file's header). Even
      // an empty one made @vercel/blob register this route as a webhook on
      // every deployed upload, and Blob's callback POST, carrying no
      // session cookie, always failed this route's asisten check with 401.
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("[api/presentasi/token] unexpected error:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "unggah gagal" });
  }
}

async function handleSimpan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const url = typeof body.url === "string" ? body.url : "";
  const namaBerkas = typeof body.namaBerkas === "string" ? body.namaBerkas : "";

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // host stays empty, rejected below alongside every other malformed case
  }
  if (
    !host.endsWith(BLOB_HOST_SUFFIX) ||
    namaBerkas.length === 0 ||
    namaBerkas.length > MAX_NAMA_LEN
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [row] = await db
    .insert(presentasi)
    .values({ namaBerkas, url, diunggahOleh: session.nim })
    .returning();
  await writeAudit(session.nim, "presentasi_unggah", { id: row.id, namaBerkas });
  res.status(200).json({ ok: true, presentasi: row });
}

async function handleAktifkan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const ada = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: presentasi.id })
      .from(presentasi)
      .where(eq(presentasi.id, id))
      .limit(1);
    if (!row) return false;
    await tx.update(presentasi).set({ aktif: false }).where(eq(presentasi.aktif, true));
    await tx.update(presentasi).set({ aktif: true }).where(eq(presentasi.id, id));
    return true;
  });

  if (!ada) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await writeAudit(session.nim, "presentasi_aktifkan", { id });
  res.status(200).json({ ok: true });
}

async function handleNonaktifkan(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  const [row] = await db
    .select({ id: presentasi.id })
    .from(presentasi)
    .where(eq(presentasi.aktif, true))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await db.update(presentasi).set({ aktif: false }).where(eq(presentasi.id, row.id));
  await writeAudit(session.nim, "presentasi_nonaktifkan", { id: row.id });
  res.status(200).json({ ok: true });
}

async function handleHapus(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [row] = await db
    .select({ url: presentasi.url })
    .from(presentasi)
    .where(eq(presentasi.id, id))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }

  // A blob that is already gone (removed in the Vercel dashboard, or a
  // store that was recreated) must not strand its row: del() throwing
  // here used to 500 the request and leave an undeletable dead entry.
  try {
    await del(row.url);
  } catch (err) {
    console.error("[api/presentasi/hapus] blob delete failed, removing row anyway:", err);
  }
  await db.delete(presentasi).where(eq(presentasi.id, id));
  await writeAudit(session.nim, "presentasi_hapus", { id });
  res.status(200).json({ ok: true });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const aksi = req.query.aksi;

  // "aktif" is the one action either role can call, checked before the
  // blanket asisten-only guard below -- the dashboard card a praktikan's
  // browser reaches needs it, same shape as /api/session/now.
  if (aksi === "aktif") {
    if (!requireMethod(req, res, "GET")) return;
    if (!requireAnyRole(req, res, ["asisten", "praktikan"])) return;
    return handleAktif(req, res);
  }

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  if (aksi === "daftar") {
    if (!requireMethod(req, res, "GET")) return;
    return handleDaftar(req, res);
  }
  if (aksi === "token") {
    if (!requireMethod(req, res, "POST")) return;
    return handleToken(req, res, session);
  }
  if (aksi === "simpan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleSimpan(req, res, session);
  }
  if (aksi === "aktifkan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleAktifkan(req, res, session);
  }
  if (aksi === "nonaktifkan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleNonaktifkan(req, res, session);
  }
  if (aksi === "hapus") {
    if (!requireMethod(req, res, "POST")) return;
    return handleHapus(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
