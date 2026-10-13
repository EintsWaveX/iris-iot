import { beforeAll, describe, expect, it } from "vitest";
import { buka, bungkus } from "../rahasia.js";
import { hashPassword, perluHashUlang, verifyPasswordHash } from "../../../src/lib/auth.js";
import { scryptSync } from "node:crypto";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "x".repeat(40);
});

describe("at-rest wrap (AES-256-GCM, owner as AAD)", () => {
  it("opens for its owner and label only", () => {
    const b = bungkus("segel-rahasia", "1101200001", "seelabs-segel");
    expect(b.startsWith("g1.")).toBe(true);
    expect(b).not.toContain("segel-rahasia");
    expect(buka(b, "1101200001", "seelabs-segel")).toBe("segel-rahasia");
    expect(buka(b, "1101200002", "seelabs-segel")).toBeNull();
    expect(buka(b, "1101200001", "lain")).toBeNull();
  });

  it("refuses anything altered", () => {
    const b = bungkus("abc", "n", "l");
    const [awal, iv, tag, enc] = b.split(".");
    const balik = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(buka([awal, iv, tag, balik(enc)].join("."), "n", "l")).toBeNull();
    expect(buka([awal, iv, balik(tag), enc].join("."), "n", "l")).toBeNull();
    expect(buka("bukan", "n", "l")).toBeNull();
  });

  it("never repeats a ciphertext for the same text", () => {
    expect(bungkus("sama", "n", "l")).not.toBe(bungkus("sama", "n", "l"));
  });
});

describe("Asisten password hashes", () => {
  it("makes Argon2id (or strong scrypt) hashes that verify and need no rehash", () => {
    const h = hashPassword("kata-sandi-baru");
    expect(h).toMatch(/^(a2id\$65536\$3\$1\$|s2\$131072\$)/);
    expect(verifyPasswordHash("kata-sandi-baru", h)).toBe(true);
    expect(verifyPasswordHash("kata-sandi-lain", h)).toBe(false);
    expect(perluHashUlang(h)).toBe(false);
  }, 20_000);

  it("still accepts the first scrypt form, and asks for it to be hashed again", () => {
    const salt = "00112233445566778899aabbccddeeff";
    const lama = `${salt}:${scryptSync("sandi-lama", salt, 64).toString("hex")}`;
    expect(verifyPasswordHash("sandi-lama", lama)).toBe(true);
    expect(verifyPasswordHash("salah", lama)).toBe(false);
    expect(perluHashUlang(lama)).toBe(true);
  });
});
