import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDEL_PUB, tandaSah, terbitkan } from "../bundel";

const zip = Buffer.from("PK\x03\x04 bundel uji");
const sha = createHash("sha256").update(zip).digest("hex");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const tanda = sign(null, zip, privateKey);

describe("Pi bundle signature", () => {
  it("accepts the signing key's signature and nothing else", () => {
    expect(tandaSah(zip, tanda, pem)).toBe(true);
    expect(tandaSah(Buffer.concat([zip, Buffer.from("x")]), tanda, pem)).toBe(false);
    expect(tandaSah(zip, Buffer.alloc(64), pem)).toBe(false);
    // The site's own key never signed this test's bundle.
    expect(tandaSah(zip, tanda)).toBe(false);
  });

  it("ships the same public key as the Pi's bundel.pub", () => {
    expect(BUNDEL_PUB).toContain("MCowBQYDK2VwAyEAFQ2KYNT9tPyJC52+GY5cGnNESAHH00MiEqvMb4xXhdM=");
  });

  it("gives the one-line installer the same key", () => {
    const skrip = readFileSync(new URL("../../../public/pasang-pi.sh", import.meta.url), "utf8");
    expect(skrip).toContain(BUNDEL_PUB);
  });
});

describe("Publishing a bundle", () => {
  const body = (ubah: Record<string, unknown> = {}) => ({
    aso: "abc1234",
    iot: "def5678",
    sha256: sha,
    isi: zip.toString("base64"),
    tanda: tanda.toString("base64"),
    ...ubah,
  });

  it("refuses a wrong or missing secret before anything else", async () => {
    expect(await terbitkan(body(), "salah", "benar")).toEqual({ ok: false, kode: "rahasia_salah" });
    expect(await terbitkan(body(), "", undefined)).toEqual({ ok: false, kode: "rahasia_salah" });
  });

  it("refuses a malformed body", async () => {
    for (const u of [{ aso: "x" }, { iot: 5 }, { sha256: "abc" }, { isi: null }]) {
      expect(await terbitkan(body(u), "s", "s")).toEqual({ ok: false, kode: "format_salah" });
    }
  });

  it("refuses a zip that isn't the one named", async () => {
    expect(await terbitkan(body({ sha256: "0".repeat(64) }), "s", "s")).toEqual({
      ok: false,
      kode: "sha_beda",
    });
  });

  it("refuses a bundle the CI key didn't sign", async () => {
    expect(await terbitkan(body(), "s", "s")).toEqual({ ok: false, kode: "tanda_tidak_sah" });
  });
});
