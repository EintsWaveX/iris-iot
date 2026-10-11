/**
 * /api/presentasi/:aksi — the Asisten's slides and wiring schematics, one
 * set per module. The one dynamic-segment function for both, same
 * consolidation reasoning as api/session/[aksi].ts and api/modul/[aksi].ts:
 * the Vercel Hobby plan's serverless function ceiling.
 *
 * Storage is Vercel Blob (BLOB_READ_WRITE_TOKEN, set once a Blob store is
 * created on the project's Storage tab and pulled with `vercel env pull`,
 * the same manual provisioning step DATABASE_URL already needed). File
 * bytes never pass through this function: the token handlers only broker a
 * short-lived, content-type- and size-restricted client token, and the
 * browser then PUTs the file straight to Vercel Blob's own API. That is
 * what lets a slide deck exceed Vercel's ~4.5 MB request body ceiling at
 * all, which a plain multipart upload through this route could not. The
 * save actions then record the blob's URL (deliberately not
 * onUploadCompleted: that callback is a webhook Vercel calls back on a
 * publicly reachable deployment URL, which doesn't exist during local
 * development, and upload() on the client already resolves with the blob's
 * URL the moment the direct PUT finishes).
 *
 * Both kinds work the same way (2026-10-08): per module, one uploaded file
 * (berkas) and one link (tautan) may be active, and a new one of a kind
 * replaces the old one, its blob included. Both are for signed-in users
 * only, and a Praktikan sees a module's only once they did its practicum
 * (akses.ts modulDiikuti); an Asisten sees all four.
 *
 * GET  /api/presentasi/slides          — signed in. The active decks per
 *                                        module the caller may see, as
 *                                        { "1": {url, namaBerkas, jenis,
 *                                        bingkai, pilihan[]}, ... }.
 * GET  /api/presentasi/slides-list     — asisten. Every deck, including
 *                                        those from before decks went per
 *                                        module (modul null).
 * POST /api/presentasi/slides-token    — asisten. Upload handshake, PDF only.
 * POST /api/presentasi/slides-save     { url, namaBerkas, modul } — asisten.
 * POST /api/presentasi/slides-link     { url, modul, nama? } — asisten. A
 *                                        Canva view link, turned into its
 *                                        embed address by src/lib/tautan.ts.
 * POST /api/presentasi/slides-assign   { id, modul } — asisten. Gives an
 *                                        older deck a module, replacing that
 *                                        module's deck of the same kind.
 * POST /api/presentasi/slides-delete   { id } — asisten.
 *
 * GET  /api/presentasi/schematics         — signed in, as slides above; a
 *                                            missing module means "use the
 *                                            bundled schematic".
 * GET  /api/presentasi/schematic-list     — asisten. Every upload.
 * POST /api/presentasi/schematic-token    — asisten. Upload handshake,
 *                                            PNG/JPEG/WebP only.
 * POST /api/presentasi/schematic-save     { url, namaBerkas, modul } —
 *                                            asisten.
 * POST /api/presentasi/schematic-link     { url, modul } (Phase 9) —
 *                                            asisten. A Wokwi, Tinkercad or
 *                                            Canva link or a direct image
 *                                            address instead of an upload.
 * POST /api/presentasi/schematic-activate { id } — asisten.
 * POST /api/presentasi/schematic-default  { modul } — asisten. Back to the
 *                                            bundled schematic.
 * POST /api/presentasi/schematic-delete   { id } — asisten.
 *
 * GET  /api/presentasi/pin                — anyone. Each module's pin table
 *                                            as set (_lib/pin.ts).
 * POST /api/presentasi/pin-simpan         { modul, baris | null } —
 *                                            asisten. The code follows.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cekHak } from "../_lib/hak.js";
import { del } from "@vercel/blob";
import { LAMPIRAN_MAKS, LAMPIRAN_TIPE } from "../_lib/dokumen.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole, requireAnyRole, tolakPraktikanTot } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { presentasi, skema } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { modulDiikuti } from "../../src/lib/akses.js";
import { and, eq, desc, ne } from "drizzle-orm";
import {
  bacaTautan,
  type HasilTautan,
  type JenisTautan,
  namaLayanan,
  tautanBingkai,
  TAUTAN_SKEMA,
  TAUTAN_SLIDES,
} from "../../src/lib/tautan.js";
import { denganSiaran } from "../_lib/siaran.js";
import { handlePinGet, handlePinSimpan } from "../_lib/pin.js";

// Comfortably above a slide deck; well under what Blob itself allows.
const MAX_BYTES = 20 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const MAX_NAMA_LEN = 200;
const SKEMA_MAX_BYTES = 8 * 1024 * 1024;
const SKEMA_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Jenis = "berkas" | "tautan";

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

function idValid(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Best effort: a blob that is already gone (removed in the Vercel
 *  dashboard, or a recreated store) must not strand its row. */
async function hapusBlob(list: { url: string; jenis: Jenis }[], asal: string) {
  for (const o of list) {
    if (o.jenis !== "berkas") continue;
    try {
      await del(o.url);
    } catch (err) {
      console.error(`[api/presentasi/${asal}] blob delete failed, row removed anyway:`, err);
    }
  }
}

/** The modules whose slides and schematics this caller may see: all four
 *  for an Asisten, the ones a Praktikan did a practicum of. */
async function modulBoleh(session: SessionPayload): Promise<Set<number>> {
  return new Set(session.role === "asisten" ? [1, 2, 3, 4] : await modulDiikuti(session.nim));
}

/** Active rows per module, the file first, then `pilihan` with every active
 *  one (a file and a link at most) for the viewer's switch. `bingkai`: show
 *  it in a frame, not as an image or a PDF. */
function perModul(
  rows: { modul: number | null; url: string; namaBerkas: string; jenis: Jenis }[],
  boleh: Set<number>,
  bingkai: (r: { url: string; jenis: Jenis }) => boolean,
) {
  type Pilihan = { url: string; namaBerkas: string; bingkai: boolean; jenis: Jenis };
  const aktif: Record<string, Pilihan & { pilihan: Pilihan[] }> = {};
  const urut = [...rows].sort((a, b) => (a.jenis === b.jenis ? 0 : a.jenis === "berkas" ? -1 : 1));
  for (const r of urut) {
    if (r.modul === null || !boleh.has(r.modul)) continue;
    const p: Pilihan = {
      url: r.url,
      namaBerkas: r.namaBerkas,
      bingkai: bingkai(r),
      jenis: r.jenis,
    };
    const k = String(r.modul);
    if (aktif[k]) aktif[k].pilihan.push(p);
    else aktif[k] = { ...p, pilihan: [p] };
  }
  return aktif;
}

/** The client-upload handshake. Vercel's own SDK dictates this response
 *  shape (not this project's usual {ok, kode} contract) since
 *  @vercel/blob's browser-side upload() parses it directly. No
 *  onUploadCompleted, deliberately: even an empty one made @vercel/blob
 *  register the route as a webhook, and Blob's callback, carrying no
 *  session cookie, always failed the asisten check with 401. */
async function beriToken(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
  tipe: string[],
  maks: number,
  asal: string,
) {
  const body = jsonBody(req) as unknown as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: tipe,
        maximumSizeInBytes: maks,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ nim: session.nim }),
      }),
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error(`[api/presentasi/${asal}] unexpected error:`, err);
    res.status(400).json({ error: err instanceof Error ? err.message : "unggah gagal" });
  }
}

/**
 * A canva.link short link, followed to the /design/.../view address it
 * stands for (2026-10-07), so it is saved and framed like a design link.
 * Only Canva's own hosts are followed, at most four hops, 8 s each.
 */
async function bukaTautanPendek(
  t: HasilTautan,
  boleh: readonly JenisTautan[],
): Promise<HasilTautan> {
  if (!t.ok || !t.pendek) return t;
  let url = t.url;
  for (let i = 0; i < 4; i++) {
    let r: Response;
    try {
      r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    } catch {
      return { ok: false, kode: "canva_pendek" };
    }
    const ke = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!ke) return { ok: false, kode: "canva_pendek" };
    url = new URL(ke, url).href;
    const h = bacaTautan(url, boleh);
    if (h.ok && !h.pendek) return h;
    if (!h.ok && h.kode === "canva_edit") return h;
    const host = new URL(url).hostname;
    if (!(h.ok && h.pendek) && host !== "canva.com" && !host.endsWith(".canva.com"))
      return { ok: false, kode: "canva_pendek" };
  }
  return { ok: false, kode: "canva_pendek" };
}

/* ----------------------------------------------------------------- slides */

async function handleSlides(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const rows = await getDb()
    .select({
      modul: presentasi.modul,
      url: presentasi.url,
      namaBerkas: presentasi.namaBerkas,
      jenis: presentasi.jenis,
    })
    .from(presentasi)
    .where(eq(presentasi.aktif, true));
  const aktif = perModul(rows, await modulBoleh(session), (r) => r.jenis === "tautan");
  res.status(200).json({ ok: true, aktif });
}

async function handleSlidesList(_req: ApiRequest, res: ApiResponse) {
  const rows = await getDb().select().from(presentasi).orderBy(desc(presentasi.diunggahPada));
  res.status(200).json({ ok: true, daftar: rows });
}

/** Makes `baru` the module's deck of its kind: earlier decks of that module
 *  and kind go, and so do their blobs. An `id` moves that existing row in
 *  (slides-assign) instead of inserting one. */
async function simpanSlide(
  modul: number,
  baru: { namaBerkas: string; url: string; jenis: Jenis; id?: number },
  nim: string,
) {
  const { row, lama } = await getDb().transaction(async (tx) => {
    const [r] = baru.id
      ? await tx
          .update(presentasi)
          .set({ modul, aktif: false })
          .where(eq(presentasi.id, baru.id))
          .returning()
      : await tx
          .insert(presentasi)
          .values({
            modul,
            namaBerkas: baru.namaBerkas,
            url: baru.url,
            jenis: baru.jenis,
            diunggahOleh: nim,
          })
          .returning();
    const old = await tx
      .delete(presentasi)
      .where(
        and(eq(presentasi.modul, modul), eq(presentasi.jenis, baru.jenis), ne(presentasi.id, r.id)),
      )
      .returning({ url: presentasi.url, jenis: presentasi.jenis });
    await tx.update(presentasi).set({ aktif: true }).where(eq(presentasi.id, r.id));
    return { row: { ...r, aktif: true }, lama: old };
  });
  await hapusBlob(lama, "slides");
  return row;
}

async function handleSlidesSave(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const url = typeof body.url === "string" ? body.url : "";
  const namaBerkas = typeof body.namaBerkas === "string" ? body.namaBerkas : "";
  const modul = modulValid(body.modul);
  if (!blobUrlValid(url) || !modul || !namaBerkas || namaBerkas.length > MAX_NAMA_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const row = await simpanSlide(modul, { namaBerkas, url, jenis: "berkas" }, session.nim);
  await writeAudit(session.nim, "presentasi_unggah", { id: row.id, modul, namaBerkas });
  res.status(200).json({ ok: true, presentasi: row });
}

async function handleSlidesLink(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = modulValid(body.modul);
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  if (!modul || nama.length > MAX_NAMA_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const t = await bukaTautanPendek(
    bacaTautan(typeof body.url === "string" ? body.url : "", TAUTAN_SLIDES),
    TAUTAN_SLIDES,
  );
  if (!t.ok) {
    res.status(200).json({ ok: false, kode: t.kode });
    return;
  }
  const row = await simpanSlide(
    modul,
    { namaBerkas: nama || "Canva", url: t.url, jenis: "tautan" },
    session.nim,
  );
  await writeAudit(session.nim, "presentasi_tautan", { id: row.id, modul, url: t.url });
  res.status(200).json({ ok: true, presentasi: row });
}

async function handleSlidesAssign(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const id = idValid(body.id);
  const modul = modulValid(body.modul);
  if (!id || !modul) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const [cur] = await getDb()
    .select({ namaBerkas: presentasi.namaBerkas, url: presentasi.url, jenis: presentasi.jenis })
    .from(presentasi)
    .where(eq(presentasi.id, id))
    .limit(1);
  if (!cur) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await simpanSlide(modul, { ...cur, id }, session.nim);
  await writeAudit(session.nim, "presentasi_modul", { id, modul });
  res.status(200).json({ ok: true });
}

async function handleSlidesDelete(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const id = idValid(jsonBody(req).id);
  if (!id) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const rows = await getDb()
    .delete(presentasi)
    .where(eq(presentasi.id, id))
    .returning({ url: presentasi.url, jenis: presentasi.jenis, modul: presentasi.modul });
  if (!rows.length) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await hapusBlob(rows, "slides-delete");
  await writeAudit(session.nim, "presentasi_hapus", { id, modul: rows[0].modul });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------ wiring schematics */

async function handleSchematics(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const rows = await getDb()
    .select({
      modul: skema.modul,
      url: skema.url,
      namaBerkas: skema.namaBerkas,
      jenis: skema.jenis,
    })
    .from(skema)
    .where(eq(skema.aktif, true));
  const aktif = perModul(
    rows,
    await modulBoleh(session),
    (r) => r.jenis === "tautan" && tautanBingkai(r.url),
  );
  res.status(200).json({ ok: true, aktif });
}

async function handleSchematicList(_req: ApiRequest, res: ApiResponse) {
  const rows = await getDb().select().from(skema).orderBy(desc(skema.diunggahPada));
  res.status(200).json({ ok: true, daftar: rows });
}

/** Makes `baru` the module's schematic of its kind: earlier rows of that
 *  module and kind go, and so do their blobs. */
async function simpanSkema(
  modul: number,
  baru: { namaBerkas: string; url: string; jenis: Jenis },
  nim: string,
) {
  const { row, lama } = await getDb().transaction(async (tx) => {
    // Replaces the module's source of the same kind only: an image and a
    // link can both stay.
    await tx
      .update(skema)
      .set({ aktif: false })
      .where(and(eq(skema.modul, modul), eq(skema.jenis, baru.jenis), eq(skema.aktif, true)));
    const [r] = await tx
      .insert(skema)
      .values({ modul, ...baru, diunggahOleh: nim, aktif: true })
      .returning();
    const old = await tx
      .delete(skema)
      .where(and(eq(skema.modul, modul), eq(skema.jenis, baru.jenis), ne(skema.id, r.id)))
      .returning({ url: skema.url, jenis: skema.jenis });
    return { row: r, lama: old };
  });
  await hapusBlob(lama, "schematic");
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
  const t = await bukaTautanPendek(
    bacaTautan(typeof body.url === "string" ? body.url : "", TAUTAN_SKEMA),
    TAUTAN_SKEMA,
  );
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
  const id = idValid(jsonBody(req).id);
  if (!id) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const modul = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ modul: skema.modul, jenis: skema.jenis })
      .from(skema)
      .where(eq(skema.id, id))
      .limit(1);
    if (!row) return null;
    await tx
      .update(skema)
      .set({ aktif: false })
      .where(and(eq(skema.modul, row.modul), eq(skema.jenis, row.jenis), eq(skema.aktif, true)));
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
  await getDb()
    .update(skema)
    .set({ aktif: false })
    .where(and(eq(skema.modul, modul), eq(skema.aktif, true)));
  await writeAudit(session.nim, "skema_bawaan", { modul });
  res.status(200).json({ ok: true });
}

async function handleSchematicDelete(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const id = idValid(jsonBody(req).id);
  if (!id) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const rows = await getDb()
    .delete(skema)
    .where(eq(skema.id, id))
    .returning({ url: skema.url, jenis: skema.jenis, modul: skema.modul });
  if (!rows.length) {
    res.status(200).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  await hapusBlob(rows, "schematic-delete");
  await writeAudit(session.nim, "skema_hapus", { id, modul: rows[0].modul });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------------ routes */

type Post = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => Promise<void>;

const handleToken: Post = (req, res, s) =>
  beriToken(req, res, s, ["application/pdf"], MAX_BYTES, "slides-token");
const handleSchematicToken: Post = (req, res, s) =>
  beriToken(req, res, s, SKEMA_TYPES, SKEMA_MAX_BYTES, "schematic-token");

const POST: Record<string, Post> = {
  "slides-token": handleToken,
  "slides-save": handleSlidesSave,
  "slides-link": handleSlidesLink,
  "slides-assign": handleSlidesAssign,
  "slides-delete": handleSlidesDelete,
  "schematic-token": handleSchematicToken,
  "schematic-save": handleSchematicSave,
  "schematic-link": handleSchematicLink,
  "schematic-activate": handleSchematicActivate,
  "schematic-default": handleSchematicDefault,
  "schematic-delete": handleSchematicDelete,
  "pin-simpan": handlePinSimpan,
};

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (await tolakPraktikanTot(req, res)) return;

  const aksi = req.query.aksi;

  // The pins are in the public handbook too: anyone may read them.
  if (aksi === "pin") {
    if (!requireMethod(req, res, "GET")) return;
    return handlePinGet(req, res);
  }

  // The two viewer lists either role reads, before the asisten-only guard;
  // each filters to the modules the caller may see.
  if (aksi === "slides" || aksi === "schematics") {
    if (!requireMethod(req, res, "GET")) return;
    const session = requireAnyRole(req, res, ["asisten", "praktikan"]);
    if (!session) return;
    return aksi === "slides"
      ? handleSlides(req, res, session)
      : handleSchematics(req, res, session);
  }

  const session = requireRole(req, res, "asisten");
  if (!session) return;
  // Phase 9: a written report's photo or file (Reports › Written report ›
  // Photo or file); any Asisten may attach one, images and PDFs up to
  // 10 MB. The report row itself is written by /api/session/dokumen.
  if (aksi === "lampiran-token") {
    if (!requireMethod(req, res, "POST")) return;
    return beriToken(req, res, session, LAMPIRAN_TIPE, LAMPIRAN_MAKS, "lampiran-token");
  }

  if (aksi === "slides-list" || aksi === "schematic-list") {
    if (!requireMethod(req, res, "GET")) return;
    return aksi === "slides-list" ? handleSlidesList(req, res) : handleSchematicList(req, res);
  }

  const post = typeof aksi === "string" ? POST[aksi] : undefined;
  if (post) {
    if (!requireMethod(req, res, "POST")) return;
    // Phase 9: changing slides and schematics needs the Jadwal right.
    if (!(await cekHak(res, session.nim, "jadwal"))) return;
    return post(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("presentasi", handler);
