/**
 * Phase 14: sealing a SeeLabs password in the Asisten's own browser, before
 * it ever leaves the page. RSA-OAEP with SHA-256 (WebCrypto) to the robot
 * Pi's 3072-bit public key, over {"nim", "sandi"}: only that Pi can open it,
 * and only for that NIM. The site stores the seal, never the password.
 *
 * The fingerprint is worked out here from the key itself, not taken from
 * the site, so the dialog shows what the browser really sealed to; it must
 * match the one Sumber SeeLabs approved.
 */

/** The Laboran's default SeeLabs password: the NIM followed by the suffix
 *  set in Sumber SeeLabs (1715 unless changed). */
export const sandiBawaanSeelabs = (nim: string, sufiks: string) => nim + sufiks;

function dariBase64(b64: string): Uint8Array<ArrayBuffer> {
  const biner = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(biner.length));
  for (let i = 0; i < biner.length; i++) out[i] = biner.charCodeAt(i);
  return out;
}

function keBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let biner = "";
  for (let i = 0; i < bytes.length; i++) biner += String.fromCharCode(bytes[i]);
  return btoa(biner);
}

/** The first 16 bytes of SHA-256 over the key, as eight groups: what the Pi prints too. */
export async function sidikKunci(spkiBase64: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", dariBase64(spkiBase64)));
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return hex.match(/.{4}/g)!.join(":");
}

/**
 * The seal for this NIM and password, or an Error when the key isn't the
 * approved one (its fingerprint differs from `sidikDisetujui`).
 */
export async function segelSandi(
  spkiBase64: string,
  sidikDisetujui: string,
  nim: string,
  sandi: string,
): Promise<{ segel: string; sidik: string }> {
  const sidik = await sidikKunci(spkiBase64);
  if (sidik !== sidikDisetujui) throw new Error("kunci_berubah");
  const kunci = await crypto.subtle.importKey(
    "spki",
    dariBase64(spkiBase64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const isi = new TextEncoder().encode(JSON.stringify({ nim, sandi }));
  const segel = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, kunci, isi);
  return { segel: keBase64(segel), sidik };
}
