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
 * POST /api/presentasi/tautan   { url, nama? } (Phase 9) — asisten only.
 *                                  Saves a Canva design link (jenis tautan),
 *                                  turned into its embed address by
 *                                  src/lib/tautan.ts.
 *
 * Phase 8 adds the wiring-schematic library (table `skema`) to this same
 * function rather than a new file, since the Hobby plan's function count is
 * fixed. It is the presentation library again, one per module, with images
 * instead of PDFs:
 *
 * GET  /api/presentasi/schematics         — public (module pages are). The
 *                                            active upload per module, as
 *                                            { "1": {url, namaBerkas}, ... };
 *                                            a missing module means "use the
 *                                            bundled schematic".
 * GET  /api/presentasi/schematic-list     — asisten. Every upload.
 * POST /api/presentasi/schematic-token    — asisten. Upload handshake,
 *                                            PNG/JPEG/WebP only.
 * POST /api/presentasi/schematic-save     { url, namaBerkas, modul } —
 *                                            asisten. Records the upload and
 *                                            makes it the module's active one.
 * POST /api/presentasi/schematic-link     { url, modul } (Phase 9) —
 *                                            asisten. A Wokwi, Tinkercad or
 *                                            Canva link or a direct image
 *                                            address instead of an upload.
 *                                            Both saves replace the module's
 *                                            earlier ones (Phase 9 keeps one
 *                                            source per module).
 * POST /api/presentasi/schematic-activate { id } — asisten.
 * POST /api/presentasi/schematic-default  { modul } — asisten. Back to the
 *                                            bundled schematic.
 * POST /api/presentasi/schematic-delete   { id } — asisten.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cekHak } from "../_lib/hak.js";
import { del } from "@vercel/blob";
import { LAMPIRAN_MAKS, LAMPIRAN_TIPE } from "../_lib/dokumen.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole, requireAnyRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { presentasi, skema } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { and, eq, desc, ne } from "drizzle-orm";
import {
  bacaTautan,
  namaLayanan,
  tautanBingkai,
  TAUTAN_SKEMA,
  TAUTAN_SLIDES,
} from "../../src/lib/tautan.js";
import { denganSiaran } from "../_lib/siaran.js";

// Comfortably above a slide deck; well under what Blob itself allows.
const MAX_BYTES = 20 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const MAX_NAMA_LEN = 200;
const SKEMA_MAX_BYTES = 8 * 1024 * 1024;
const SKEMA_TYPES = ["image/png", "image/jpeg", "image/webp"];

function blobUrlValid(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function modulValid(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

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

async function handleTautan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const t = bacaTautan(typeof body.url === "string" ? body.url : "", TAUTAN_SLIDES);
  if (!t.ok) {
    res.status(200).json({ ok: false, kode: t.kode });
    return;
  }
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  if (nama.length > MAX_NAMA_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [row] = await db
    .insert(presentasi)
    .values({ namaBerkas: nama || "Canva", url: t.url, jenis: "tautan", diunggahOleh: session.nim })
    .returning();
  await writeAudit(session.nim, "presentasi_tautan", { id: row.id, url: t.url });
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
    .select({ url: presentasi.url, jenis: presentasi.jenis })
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
  // A link has no blob at all.
  if (row.jenis === "berkas") {
    try {
      await del(row.url);
    } catch (err) {
      console.error("[api/presentasi/hapus] blob delete failed, removing row anyway:", err);
    }
  }
  await db.delete(presentasi).where(eq(presentasi.id, id));
  await writeAudit(session.nim, "presentasi_hapus", { id });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------ wiring schematics */

async function handleSchematics(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const rows = await db
    .select({
      modul: skema.modul,
      url: skema.url,
      namaBerkas: skema.namaBerkas,
      jenis: skema.jenis,
    })
    .from(skema)
    .where(eq(skema.aktif, true));
  // bingkai: show it in a frame (a Wokwi, Tinkercad or Canva link), not as
  // an image.
  const aktif: Record<string, { url: string; namaBerkas: string; bingkai: boolean }> = {};
  for (const r of rows) {
    aktif[String(r.modul)] = {
      url: r.url,
      namaBerkas: r.namaBerkas,
      bingkai: r.jenis === "tautan" && tautanBingkai(r.url),
    };
  }
  res.status(200).json({ ok: true, aktif });
}

async function handleSchematicList(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const rows = await db.select().from(skema).orderBy(desc(skema.diunggahPada));
  res.status(200).json({ ok: true, daftar: rows });
}

async function handleSchematicToken(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req) as unknown as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: SKEMA_TYPES,
        maximumSizeInBytes: SKEMA_MAX_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ nim: session.nim }),
      }),
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("[api/presentasi/schematic-token] unexpected error:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "unggah gagal" });
  }
}

/** Makes `baru` the module's one schematic: earlier rows go, and so do
 *  their blobs (best effort, as in handleSchematicDelete). */
async function simpanSkema(
  modul: number,
  baru: { namaBerkas: string; url: string; jenis: "berkas" | "tautan" },
  nim: string,
) {
  const db = getDb();
  const { row, lama } = await db.transaction(async (tx) => {
    await tx
      .update(skema)
      .set({ aktif: false })
      .where(and(eq(skema.modul, modul), eq(skema.aktif, true)));
    const [r] = await tx
      .insert(skema)
      .values({ modul, ...baru, diunggahOleh: nim, aktif: true })
      .returning();
    const old = await tx
      .delete(skema)
      .where(and(eq(skema.modul, modul), ne(skema.id, r.id)))
      .returning({ url: skema.url, jenis: skema.jenis });
    return { row: r, lama: old };
  });
  for (const o of lama) {
    if (o.jenis !== "berkas") continue;
    try {
      await del(o.url);
    } catch (err) {
      console.error("[api/presentasi] replaced schematic blob delete failed:", err);
    }
  }
  return row;
}

async function handleSchematicSave(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const url = typeof body.url === "string" ? body.url : "";
  const namaBerkas = typeof body.namaBerkas === "string" ? body.namaBerkas : "";
  const modul = modulValid(body.modul);
  if (!blobUrlValid(url) || !modul || !namaBerkas || namaBerkas.length > MAX_NAMA_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const row = await simpanSkema(modul, { namaBerkas, url, jenis: "berkas" }, session.nim);
  await writeAudit(session.nim, "skema_unggah", { id: row.id, modul, namaBerkas });
  res.status(200).json({ ok: true, skema: row });
}

async function handleSchematicLink(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = modulValid(body.modul);
  if (!modul) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const t = bacaTautan(typeof body.url === "string" ? body.url : "", TAUTAN_SKEMA);
  if (!t.ok) {
    res.status(200).json({ ok: false, kode: t.kode });
    return;
  }
  const row = await simpanSkema(
    modul,
    { namaBerkas: namaLayanan(t.url), url: t.url, jenis: "tautan" },
    session.nim,
  );
  await writeAudit(session.nim, "skema_tautan", { id: row.id, modul, url: t.url });
  res.status(200).json({ ok: true, skema: row });
}

async function handleSchematicActivate(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const id = Number(jsonBody(req).id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const modul = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ modul: skema.modul })
      .from(skema)
      .where(eq(skema.id, id))
      .limit(1);
    if (!row) return null;
    await tx
      .update(skema)
      .set({ aktif: false })
      .where(and(eq(skema.modul, row.modul), eq(skema.aktif, true)));
    await tx.update(skema).set({ aktif: true }).where(eq(skema.id, id));
    return row.modul;
  });
  if (modul === null) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await writeAudit(session.nim, "skema_aktifkan", { id, modul });
  res.status(200).json({ ok: true });
}

async function handleSchematicDefault(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const modul = modulValid(jsonBody(req).modul);
  if (!modul) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  await db
    .update(skema)
    .set({ aktif: false })
    .where(and(eq(skema.modul, modul), eq(skema.aktif, true)));
  await writeAudit(session.nim, "skema_bawaan", { modul });
  res.status(200).json({ ok: true });
}

async function handleSchematicDelete(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const id = Number(jsonBody(req).id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [row] = await db
    .select({ url: skema.url, modul: skema.modul, jenis: skema.jenis })
    .from(skema)
    .where(eq(skema.id, id))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  if (row.jenis === "berkas") {
    try {
      await del(row.url);
    } catch (err) {
      console.error(
        "[api/presentasi/schematic-delete] blob delete failed, removing row anyway:",
        err,
      );
    }
  }
  await db.delete(skema).where(eq(skema.id, id));
  await writeAudit(session.nim, "skema_hapus", { id, modul: row.modul });
  res.status(200).json({ ok: true });
}

/** The upload handshake for a written report's attachment (Reports ›
 *  Written report › Photo or file): images and PDFs up to 10 MB. The
 *  report row itself is written by /api/session/dokumen { aksi: "lampiran" }. */
async function handleLampiranToken(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req) as unknown as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: LAMPIRAN_TIPE,
        maximumSizeInBytes: LAMPIRAN_MAKS,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ nim: session.nim }),
      }),
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("[api/presentasi/lampiran-token] unexpected error:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "unggah gagal" });
  }
}

type SkemaPost = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => Promise<void>;

const SKEMA_POST: Record<string, SkemaPost> = {
  "schematic-token": handleSchematicToken,
  "schematic-save": handleSchematicSave,
  "schematic-link": handleSchematicLink,
  "schematic-activate": handleSchematicActivate,
  "schematic-default": handleSchematicDefault,
  "schematic-delete": handleSchematicDelete,
};

async function handler(req: ApiRequest, res: ApiResponse) {
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

  // Module pages are public, so the active schematic per module is too.
  if (aksi === "schematics") {
    if (!requireMethod(req, res, "GET")) return;
    return handleSchematics(req, res);
  }

  const session = requireRole(req, res, "asisten");
  if (!session) return;
  // Phase 9: a written report's photo or file; any Asisten may attach one.
  if (aksi === "lampiran-token") {
    if (!requireMethod(req, res, "POST")) return;
    return handleLampiranToken(req, res, session);
  }
  // Phase 9: changing slides and schematics needs the Jadwal right.
  if (req.method === "POST" && !(await cekHak(res, session.nim, "jadwal"))) return;

  if (aksi === "schematic-list") {
    if (!requireMethod(req, res, "GET")) return;
    return handleSchematicList(req, res);
  }
  const skemaHandler = typeof aksi === "string" ? SKEMA_POST[aksi] : undefined;
  if (skemaHandler) {
    if (!requireMethod(req, res, "POST")) return;
    return skemaHandler(req, res, session);
  }

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
  if (aksi === "tautan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleTautan(req, res, session);
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

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("presentasi", handler);
