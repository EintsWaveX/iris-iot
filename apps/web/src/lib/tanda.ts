/**
 * Signed tickets for the relay, shared by the API (Vercel, Node), the relay
 * (Cloudflare Worker) and the tests: `base64url(payload).base64url(hmac)`,
 * HMAC-SHA256 over the first part with KONSOL_RELAY_SECRET. Pure and
 * browser safe: WebCrypto, which all three have.
 */

const enc = new TextEncoder();

/** Bytes as base64url, no padding */
export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url (padded or not) back to bytes */
export function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function kunci(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a JSON payload into a ticket */
export async function tandaiJson(isi: unknown, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error("KONSOL_RELAY_SECRET too short");
  const body = b64url(enc.encode(JSON.stringify(isi)));
  const sig = await crypto.subtle.sign("HMAC", await kunci(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export type BacaTanda = { ok: true; isi: unknown } | { ok: false; kode: "format" | "tanda" };

/** Checks a ticket's signature and reads its payload (not its fields) */
export async function bacaTanda(token: string, secret: string): Promise<BacaTanda> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 2048)
    return { ok: false, kode: "format" };
  let good = false;
  try {
    good = await crypto.subtle.verify("HMAC", await kunci(secret), unb64url(sig), enc.encode(body));
  } catch {
    return { ok: false, kode: "format" };
  }
  if (!good) return { ok: false, kode: "tanda" };
  try {
    return { ok: true, isi: JSON.parse(new TextDecoder().decode(unb64url(body))) };
  } catch {
    return { ok: false, kode: "format" };
  }
}

/** A random id for a room or a nonce (base64url, 24 bytes) */
export function acakId(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return b64url(b);
}
