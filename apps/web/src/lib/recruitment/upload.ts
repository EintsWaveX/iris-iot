/**
 * One application PDF to R2 (prompt 03), the way lib/tp-unggah.ts sends a TP:
 * ticket (POST ticket) → PUT the bytes with progress → hand the ticket to
 * apply (a new candidate) or document (a re-upload). This file does the first
 * two; the caller keeps the returned ticket. With `untuk` (a candidate id)
 * it is the Panitia uploading for that candidate (Tambah CaA, 2026-10-25):
 * the ticket comes from candidate-ticket and goes to candidate-document.
 *
 * The browser checks what it can before sending (PDF magic bytes, 5 MB), so
 * a wrong file says so inside its own slot without a round trip; the server
 * and the relay check it all again.
 */
import { sha256Hex } from "../tp-r2";
import { recPost, isFail } from "./client";
import { DOC_MAX_BYTES, type DocKind, type TicketResponse } from "./types";

export type UploadFail =
  | "bukan_pdf"
  | "terlalu_besar"
  | "kosong"
  | "jendela_tutup"
  | "status_salah"
  | "tiket_salah"
  | "penyimpanan_mati"
  | "jaringan"
  | "batal"
  | "lain";

export type UploadResult =
  | { ok: true; sama: true }
  | { ok: true; sama: false; tiket: string }
  | { ok: false; kode: UploadFail };

const PDF_AWAL = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** The quick local check; null when the file may go. */
export async function periksaLokal(file: File): Promise<UploadFail | null> {
  if (file.size < 8) return "kosong";
  if (file.size > DOC_MAX_BYTES) return "terlalu_besar";
  const awal = new Uint8Array(await file.slice(0, PDF_AWAL.length).arrayBuffer());
  return PDF_AWAL.every((c, i) => awal[i] === c) ? null : "bukan_pdf";
}

function put(url: string, bytes: Uint8Array, onPersen: (p: number) => void, signal?: AbortSignal) {
  return new Promise<number>((ok, gagal) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", "application/pdf");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onPersen(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    x.onload = () => ok(x.status);
    x.onerror = () => ok(0);
    x.ontimeout = () => ok(0);
    x.timeout = 5 * 60_000;
    signal?.addEventListener("abort", () => {
      x.abort();
      gagal(new DOMException("aborted", "AbortError"));
    });
    x.send(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  });
}

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function kirimBerkas(
  kind: DocKind,
  file: File,
  onPersen: (p: number) => void,
  signal?: AbortSignal,
  untuk?: number,
): Promise<UploadResult> {
  try {
    const salah = await periksaLokal(file);
    if (salah) return { ok: false, kode: salah };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    const tk = await recPost<TicketResponse>(untuk === undefined ? "ticket" : "candidate-ticket", {
      kind,
      ukuran: bytes.length,
      sha256,
      ...(untuk === undefined ? {} : { id: untuk }),
    });
    if (isFail(tk)) {
      if (tk.kode === "offline") return { ok: false, kode: "jaringan" };
      const known: UploadFail[] = [
        "terlalu_besar",
        "jendela_tutup",
        "status_salah",
        "penyimpanan_mati",
      ];
      return { ok: false, kode: known.find((k) => k === tk.kode) ?? "lain" };
    }
    if (tk.sama) return { ok: true, sama: true };
    let status = 0;
    for (let coba = 0; coba < 4; coba++) {
      if (coba) await tunggu(1000 * 2 ** coba);
      onPersen(0);
      status = await put(tk.url, bytes, onPersen, signal);
      if (status >= 200 && status < 300) break;
      // A refusal (bad ticket, wrong bytes, too large) won't change on a retry.
      if (status >= 400 && status < 500) break;
    }
    if (status === 413) return { ok: false, kode: "terlalu_besar" };
    if (status === 415) return { ok: false, kode: "bukan_pdf" };
    if (status === 403) return { ok: false, kode: "tiket_salah" };
    if (status === 0) return { ok: false, kode: "jaringan" };
    if (status < 200 || status >= 300) return { ok: false, kode: "penyimpanan_mati" };
    onPersen(100);
    return { ok: true, sama: false, tiket: tk.tiket };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, kode: "batal" };
    return { ok: false, kode: "jaringan" };
  }
}
