/**
 * Oprec accounts (user, 2026-10-24): everyone who applies makes their own
 * account on /recruitment with their NIM, their name and a password, batch
 * 24 on the practicum roster included. It is apart from the practicum
 * sign-in, which never counts on the recruitment pages. Pure checks shared by
 * the form and the API; the cookie and the hashing live in
 * api/_lib/recruitment-akun.ts.
 */
import type { Gagal } from "./validate.js";

/** A real student NIM: 10 digits (older batches) or 12. */
export const NIM_OPREC_RE = /^(\d{10}|\d{12})$/;
export const SANDI_MIN = 8;
export const SANDI_MAX = 128;
export const NAMA_MAX = 80;

export function cekNimOprec(v: unknown): v is string {
  return typeof v === "string" && NIM_OPREC_RE.test(v);
}

/** Letters of any script, spaces, and the marks names carry ( . ' - ). */
export function cekNama(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length < 3 || t.length > NAMA_MAX) return null;
  return /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(t) ? t : null;
}

export function cekSandi(v: unknown): v is string {
  return typeof v === "string" && v.length >= SANDI_MIN && v.length <= SANDI_MAX;
}

export function cekAkunBaru(
  raw: unknown,
): { ok: true; nim: string; nama: string; sandi: string } | Gagal {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nim = typeof r.nim === "string" ? r.nim.trim() : r.nim;
  if (!cekNimOprec(nim)) return { ok: false, field: "nim" };
  const nama = cekNama(r.nama);
  if (!nama) return { ok: false, field: "nama" };
  if (!cekSandi(r.sandi)) return { ok: false, field: "sandi" };
  return { ok: true, nim, nama, sandi: r.sandi };
}

export function cekMasukOprec(raw: unknown): { ok: true; nim: string; sandi: string } | Gagal {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nim = typeof r.nim === "string" ? r.nim.trim() : r.nim;
  if (!cekNimOprec(nim)) return { ok: false, field: "nim" };
  if (typeof r.sandi !== "string" || !r.sandi || r.sandi.length > SANDI_MAX)
    return { ok: false, field: "sandi" };
  return { ok: true, nim, sandi: r.sandi };
}
