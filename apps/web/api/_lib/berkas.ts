/**
 * Uploaded files in the database (table `berkas`), replacing Vercel Blob
 * (9 Nov 2026). The browser POSTs the file's bytes to an upload action of the
 * feature that owns it (slides, schematic, attachment, profile photo); the
 * action checks who may, the type and the size, stores the bytes here and
 * answers with the file's address, `/f/<id>/<name>`. That address is what the
 * feature's own row stores, as a Blob URL was; server/app.ts serves it.
 *
 * Old rows still hold Blob addresses until scripts/migrasi-blob.ts has copied
 * them in; `urlBerkasValid` accepts both for that window (drop the Blob half
 * once the store is gone).
 */
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { berkas } from "../../src/lib/schema.js";
import type { ApiRequest, ApiResponse } from "./http.js";

export const JALUR_BERKAS = "/f/";
const ID_BERKAS = /^[A-Za-z0-9_-]{22}$/;
const BLOB_HOST_LAMA = ".public.blob.vercel-storage.com";
const NAMA_MAKS = 120;

/** The id inside a file address of ours (`/f/<id>` or `/f/<id>/<name>`), else null. */
export function idDariUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith(JALUR_BERKAS)) return null;
  const id = url.slice(JALUR_BERKAS.length).split(/[/?#]/, 1)[0] ?? "";
  return ID_BERKAS.test(id) ? id : null;
}

/** Still a Vercel Blob address (before scripts/migrasi-blob.ts has run). */
export function urlBlobLama(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST_LAMA);
  } catch {
    return false;
  }
}

/** A file address a row may store: ours, or (until the move is done) a Blob one. */
export function urlBerkasValid(url: unknown): url is string {
  return idDariUrl(url) !== null || urlBlobLama(url);
}

/** A file name safe to put in an address and a header: no path, no controls. */
export function namaBersih(mentah: unknown): string {
  const s = typeof mentah === "string" ? mentah : "";
  const dasar = s.split(/[\\/]/).pop() ?? "";
  const bersih = dasar.replace(/[\u0000-\u001f\u007f"<>|?*:#%]/g, "").trim();
  return (bersih || "berkas").slice(-NAMA_MAKS);
}

/** True when the first bytes are what the declared type says (the type alone is the client's word). */
export function isiCocok(tipe: string, isi: Buffer): boolean {
  const mulai = (...b: number[]) => b.every((x, i) => isi[i] === x);
  switch (tipe) {
    case "application/pdf":
      return isi.subarray(0, 1024).includes(Buffer.from("%PDF-"));
    case "image/png":
      return mulai(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return mulai(0xff, 0xd8, 0xff);
    case "image/webp":
      return (
        isi.length > 12 &&
        isi.subarray(0, 4).toString("latin1") === "RIFF" &&
        isi.subarray(8, 12).toString("latin1") === "WEBP"
      );
    default:
      return false;
  }
}

export interface BerkasIsi {
  nama: string;
  tipe: string;
  ukuran: number;
  isi: Buffer;
}

/** The stored file, or null when there is none. */
export async function bacaBerkas(id: string): Promise<BerkasIsi | null> {
  if (!ID_BERKAS.test(id)) return null;
  const [r] = await getDb()
    .select({ nama: berkas.nama, tipe: berkas.tipe, ukuran: berkas.ukuran, isi: berkas.isi })
    .from(berkas)
    .where(eq(berkas.id, id))
    .limit(1);
  return r ?? null;
}

/** The same without the bytes (the column is not selected), for a 304 or a HEAD. */
export async function cekBerkas(id: string): Promise<Omit<BerkasIsi, "isi"> | null> {
  if (!ID_BERKAS.test(id)) return null;
  const [r] = await getDb()
    .select({ nama: berkas.nama, tipe: berkas.tipe, ukuran: berkas.ukuran })
    .from(berkas)
    .where(eq(berkas.id, id))
    .limit(1);
  return r ?? null;
}

/** Stores a file; returns its id and address. */
export async function simpanBerkas(f: {
  nama: string;
  tipe: string;
  isi: Buffer;
  pemilik?: string | null;
}): Promise<{ id: string; url: string }> {
  const id = randomBytes(16).toString("base64url");
  const nama = namaBersih(f.nama);
  await getDb()
    .insert(berkas)
    .values({
      id,
      nama,
      tipe: f.tipe,
      ukuran: f.isi.length,
      isi: f.isi,
      pemilik: f.pemilik ?? null,
    });
  return { id, url: `${JALUR_BERKAS}${id}/${encodeURIComponent(nama)}` };
}

/** Removes the files these addresses name. Best effort, like the Blob delete
 *  was: addresses that are not ours (an old Blob one, a link) are skipped. */
export async function hapusBerkas(urls: (string | null | undefined)[], asal: string) {
  const id = urls.map((u) => idDariUrl(u)).filter((x): x is string => x !== null);
  if (!id.length) return;
  try {
    await getDb().delete(berkas).where(inArray(berkas.id, id));
  } catch (err) {
    console.warn(`[WARN] ${asal}: file delete failed, row changed anyway`, err);
  }
}

export interface OpsiUnggah {
  tipe: readonly string[];
  maks: number;
  asal: string;
}

/**
 * The body of an upload action: the file's bytes (`req.body`, a Buffer for a
 * binary content type), its name in the `x-nama` header (percent-encoded) or
 * `?nama=`. Answers {ok:true, url, nama, tipe, ukuran}, or {ok:false, kode}.
 * The caller has already checked who may upload.
 */
export async function terimaUnggah(
  req: ApiRequest,
  res: ApiResponse,
  nim: string,
  o: OpsiUnggah,
): Promise<void> {
  const tipe = String(req.headers["content-type"] ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!o.tipe.includes(tipe)) {
    res.status(415).json({ ok: false, kode: "tipe_salah" });
    return;
  }
  const isi = Buffer.isBuffer(req.body) ? req.body : null;
  if (!isi || isi.length === 0) {
    res.status(400).json({ ok: false, kode: "kosong" });
    return;
  }
  if (isi.length > o.maks) {
    res.status(413).json({ ok: false, kode: "terlalu_besar", maks: o.maks });
    return;
  }
  if (!isiCocok(tipe, isi)) {
    res.status(400).json({ ok: false, kode: "isi_tidak_cocok" });
    return;
  }
  let nama = "";
  const h = req.headers["x-nama"];
  const mentah =
    typeof h === "string" ? h : typeof req.query.nama === "string" ? req.query.nama : "";
  try {
    nama = decodeURIComponent(mentah);
  } catch {
    nama = mentah;
  }
  const { url } = await simpanBerkas({ nama, tipe, isi, pemilik: nim });
  res.status(200).json({ ok: true, url, nama: namaBersih(nama), tipe, ukuran: isi.length });
}
