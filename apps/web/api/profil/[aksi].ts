/**
 * /api/profil/:aksi — the Lab Profile on Home (Phase 23). Its data and
 * writes live in api/_lib/profil.ts.
 *
 * GET  /api/profil/baca    — anyone. The whole profile.
 * POST /api/profil/unggah  — the "profil" right. The upload of one photo the
 *                            browser already shrank (WebP, or JPEG/PNG where
 *                            the browser can't write WebP): its bytes as the
 *                            body, stored by api/_lib/berkas.ts.
 * POST /api/profil/<write> — the "profil" right; see api/_lib/profil.ts.
 */
import { terimaUnggah } from "../_lib/berkas.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { noStore, requireMethod } from "../_lib/http.js";
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
  handleNonaktif,
  handleTampilAsisten,
  type Post,
} from "../_lib/profil.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { FOTO_TIPE_MASUK } from "../../src/lib/profil.js";

// A 1600 px WebP is well under 1 MB; this leaves room for a JPEG fallback.
const UNGGAH_MAKS = 6 * 1024 * 1024;

/** One photo's bytes in the body (see api/_lib/berkas.ts). */
async function handleUnggah(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  try {
    await terimaUnggah(req, res, session.nim, {
      tipe: FOTO_TIPE_MASUK,
      maks: UNGGAH_MAKS,
      asal: "profil/unggah",
    });
  } catch (err) {
    console.error("[api/profil/unggah] unexpected error:", err);
    res.status(500).json({ ok: false, kode: "unggah_gagal" });
  }
}

const POST: Record<string, Post> = {
  "divisi-simpan": handleDivisiSimpan,
  "foto-asisten": handleFotoAsisten,
  "nonaktif-daftar": handleNonaktif,
  "tampil-asisten": handleTampilAsisten,
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
