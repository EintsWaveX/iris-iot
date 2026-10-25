/**
 * A picture for a question to R2 (prompt 09), the way upload.ts sends an
 * application PDF: ticket (POST media-ticket) then PUT the bytes. The ticket
 * answers `sama` when the same bytes are already stored. The key it returns
 * goes into the question's `images` list; the page shows the picture through
 * GET media, which only a bank editor or a seat that was dealt it may call.
 */
import { sha256Hex } from "../tp-r2";
import { isFail, recPost } from "./client";
import type { Image as GambarSoal } from "./exam-types";

export const GAMBAR_MAKS = 2 * 1024 * 1024;
export const GAMBAR_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type GambarGagal =
  "jenis" | "terlalu_besar" | "kosong" | "belum_diatur" | "jaringan" | "lain";
export type GambarHasil =
  { ok: true; key: string; w: number; h: number } | { ok: false; kode: GambarGagal };

/** The quick local check; null when the file may go. */
export function periksaGambar(file: Pick<File, "type" | "size">): GambarGagal | null {
  if (!(GAMBAR_MIME as readonly string[]).includes(file.type)) return "jenis";
  if (file.size < 8) return "kosong";
  if (file.size > GAMBAR_MAKS) return "terlalu_besar";
  return null;
}

async function ukuran(file: File): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close();
    if (out.w > 0 && out.h > 0) return out;
  } catch {
    /* an SVG some browsers will not decode to a bitmap: read it as an image */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { w: img.naturalWidth || 600, h: img.naturalHeight || 400 };
  } catch {
    return { w: 600, h: 400 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function put(url: string, bytes: Uint8Array, mime: string): Promise<number> {
  try {
    const r = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: new Blob([bytes as BlobPart], { type: mime }),
    });
    return r.status;
  } catch {
    return 0;
  }
}

export async function kirimGambar(file: File): Promise<GambarHasil> {
  const salah = periksaGambar(file);
  if (salah) return { ok: false, kode: salah };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const tk = await recPost<{ ok: true; key: string; sama: boolean; url?: string }>("media-ticket", {
    mime: file.type,
    size: bytes.length,
    sha256,
  });
  if (isFail(tk)) {
    if (tk.kode === "offline") return { ok: false, kode: "jaringan" };
    if (tk.kode === "belum_diatur") return { ok: false, kode: "belum_diatur" };
    if (tk.kode === "terlalu_besar") return { ok: false, kode: "terlalu_besar" };
    return { ok: false, kode: "lain" };
  }
  if (!tk.sama) {
    let status = 0;
    for (let coba = 0; coba < 3; coba++) {
      status = await put(tk.url!, bytes, file.type);
      if (status >= 200 && status < 300) break;
      if (status >= 400 && status < 500) break;
    }
    if (status === 413) return { ok: false, kode: "terlalu_besar" };
    if (status === 0) return { ok: false, kode: "jaringan" };
    if (status < 200 || status >= 300) return { ok: false, kode: "lain" };
  }
  const { w, h } = await ukuran(file);
  return { ok: true, key: tk.key, w, h };
}

/** A picture entry for a question: a short id nobody else in the list uses */
export function gambarBaru(id: string, key: string, alt: string, w: number, h: number): GambarSoal {
  return { id, key, alt, w, h };
}
