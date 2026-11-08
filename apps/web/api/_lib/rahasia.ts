/**
 * At-rest encryption for what the site keeps but must not read (Phase 14,
 * 2026-10-13). AES-256-GCM, a fresh 96-bit IV each time, and the owner's
 * NIM as additional data, so a value moved onto another row fails to open.
 *
 * The SeeLabs seal is already RSA-OAEP-3072 to the robot PC's key, which
 * the site never has; this wraps it a second time, so a copy of the
 * database alone opens nothing even with the PC's key.
 *
 * Two envelopes, told apart by their prefix:
 *   g1.  the key is derived from SESSION_SECRET with HKDF (how every value
 *        was wrapped until DATA_KUNCI existed). Tied to the session secret:
 *        change that and the value no longer opens.
 *   g2.  the key is derived from DATA_KUNCI (32 bytes, hex or base64), a
 *        key of its own, so the session secret can be replaced without
 *        losing anything (2026-11-08, for the move off Vercel).
 *
 * With DATA_KUNCI set, `bungkus` writes g2; without it, g1 as before.
 * `buka` opens either; `rahasia-putar.ts` turns every g1 into a g2 while the
 * old session secret is still around to open it.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const AWALAN = "g1.";
const AWALAN2 = "g2.";

/** DATA_KUNCI as 32 bytes, or null when it is unset or not a valid key. */
function akarData(): Buffer | null {
  const k = process.env.DATA_KUNCI?.trim();
  if (!k) return null;
  const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  return b.length === 32 ? b : null;
}

function turunkan(akar: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", akar, "iris-data", label, 32));
}

/** The g1 key: from the session secret. */
function kunciLama(label: string): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return turunkan(Buffer.from(s, "utf8"), label);
}

/** The g2 key: from DATA_KUNCI. */
function kunciBaru(label: string): Buffer {
  const akar = akarData();
  if (!akar) throw new Error("DATA_KUNCI must be set to a 32-byte hex or base64 key");
  return turunkan(akar, label);
}

/** Is DATA_KUNCI set to a usable key (so new values are g2 and rewrapping can run)? */
export function dataKunciSiap(): boolean {
  return akarData() !== null;
}

/** Is this still a g1 envelope, one that a session-secret change would lose? */
export function masihLama(bungkusan: string): boolean {
  return bungkusan.startsWith(AWALAN);
}

/** `teks` encrypted for `pemilik` under the `label` key, as one string. */
export function bungkus(teks: string, pemilik: string, label: string): string {
  const baru = akarData() !== null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", baru ? kunciBaru(label) : kunciLama(label), iv);
  c.setAAD(Buffer.from(pemilik, "utf8"));
  const enc = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return (
    (baru ? AWALAN2 : AWALAN) +
    [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".")
  );
}

/** The text back, or null when it was changed, moved or keyed differently. */
export function buka(bungkusan: string, pemilik: string, label: string): string | null {
  const lama = bungkusan.startsWith(AWALAN);
  if (!lama && !bungkusan.startsWith(AWALAN2)) return null;
  const [iv, tag, enc] = bungkusan
    .slice(AWALAN.length)
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  if (!iv || !tag || !enc || iv.length !== 12 || tag.length !== 16) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", lama ? kunciLama(label) : kunciBaru(label), iv);
    d.setAAD(Buffer.from(pemilik, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
