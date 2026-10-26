/**
 * At-rest encryption for what the site keeps but must not read (Phase 14,
 * 2026-10-13). AES-256-GCM, a fresh 96-bit IV each time, and the owner's
 * NIM as additional data, so a value moved onto another row fails to open.
 *
 * The SeeLabs seal is already RSA-OAEP-3072 to the robot PC's key, which
 * the site never has; this wraps it a second time, so a copy of the
 * database alone opens nothing even with the PC's key. The key is
 * DATA_KUNCI (32 bytes, hex or base64) or, without it, derived from
 * SESSION_SECRET with HKDF, the same way lms.ts keys the LMS token.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const AWALAN = "g1.";

function kunci(label: string): Buffer {
  const k = process.env.DATA_KUNCI?.trim();
  let akar: Buffer | null = null;
  if (k) {
    const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
    if (b.length === 32) akar = b;
  }
  if (!akar) {
    const s = process.env.SESSION_SECRET;
    if (!s) throw new Error("DATA_KUNCI or SESSION_SECRET must be set");
    akar = Buffer.from(s, "utf8");
  }
  return Buffer.from(hkdfSync("sha256", akar, "iris-data", label, 32));
}

/** `teks` encrypted for `pemilik` under the `label` key, as one string. */
export function bungkus(teks: string, pemilik: string, label: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(label), iv);
  c.setAAD(Buffer.from(pemilik, "utf8"));
  const enc = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return AWALAN + [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

/** The text back, or null when it was changed, moved or keyed differently. */
export function buka(bungkusan: string, pemilik: string, label: string): string | null {
  if (!bungkusan.startsWith(AWALAN)) return null;
  const [iv, tag, enc] = bungkusan
    .slice(AWALAN.length)
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  if (!iv || !tag || !enc || iv.length !== 12 || tag.length !== 16) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", kunci(label), iv);
    d.setAAD(Buffer.from(pemilik, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
