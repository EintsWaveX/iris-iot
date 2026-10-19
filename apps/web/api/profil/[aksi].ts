/**
 * /api/profil/:aksi — the Lab Profile on Home (Phase 23). Its data and
 * writes live in api/_lib/profil.ts.
 *
 * GET  /api/profil/baca    — anyone. The whole profile.
 * POST /api/profil/unggah  — the "profil" right. The Vercel Blob client
 *                            upload handshake for one photo the browser
 *                            already shrank (WebP, or JPEG/PNG where the
 *                            browser can't write WebP), same scheme as
 *                            api/presentasi/[aksi].ts.
 * POST /api/profil/<write> — the "profil" right; see api/_lib/profil.ts.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, requireMethod } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { cekHak } from "../_lib/hak.js";
import { denganSiaran } from "../_lib/siaran.js";
import {
  handleAcaraHapus,
  handleAcaraSimpan,
  handleBaca,
  handleBersamaHapus,
  handleBersamaSimpan,
  handleDivisiSimpan,
  handleFotoAsisten,
  type Post,
} from "../_lib/profil.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { FOTO_TIPE_MASUK } from "../../src/lib/profil.js";

// A 1600 px WebP is well under 1 MB; this leaves room for a JPEG fallback.
const UNGGAH_MAKS = 6 * 1024 * 1024;

/** The client-upload handshake (see beriToken in api/presentasi). */
async function handleUnggah(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req) as unknown as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: FOTO_TIPE_MASUK,
        maximumSizeInBytes: UNGGAH_MAKS,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ nim: session.nim }),
      }),
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("[api/profil/unggah] unexpected error:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "unggah gagal" });
  }
}

const POST: Record<string, Post> = {
  "divisi-simpan": handleDivisiSimpan,
  "foto-asisten": handleFotoAsisten,
  "bersama-simpan": handleBersamaSimpan,
  "bersama-hapus": handleBersamaHapus,
  "acara-simpan": handleAcaraSimpan,
  "acara-hapus": handleAcaraHapus,
};

async function handler(req: ApiRequest, res: ApiResponse) {
  const aksi = req.query.aksi;

  if (aksi === "baca") {
    if (!requireMethod(req, res, "GET")) return;
    return handleBaca(req, res);
  }

  noStore(res);
  const session = requireRole(req, res, "asisten");
  if (!session) return;
  if (!requireMethod(req, res, "POST")) return;
  if (!(await cekHak(res, session.nim, "profil"))) return;

  if (aksi === "unggah") return handleUnggah(req, res, session);
  const post = typeof aksi === "string" ? POST[aksi] : undefined;
  if (post) return post(req, res, session);

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}

// A successful write tells every open Home (_lib/siaran.ts).
export default denganSiaran("profil", handler);
