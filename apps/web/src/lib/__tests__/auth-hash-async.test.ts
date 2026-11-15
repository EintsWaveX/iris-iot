import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashPasswordAsync,
  verifyPasswordHash,
  verifyPasswordHashAsync,
} from "../auth.js";

process.env.SESSION_SECRET ||= "x".repeat(40);

describe("async password hashing agrees with the sync one", () => {
  it("verifies an Argon2id hash made either way, and rejects a wrong password", async () => {
    const sync = hashPassword("kata-sandi-1");
    const async_ = await hashPasswordAsync("kata-sandi-1");
    expect(async_.startsWith("a2id$")).toBe(true);
    expect(await verifyPasswordHashAsync("kata-sandi-1", sync)).toBe(true);
    expect(await verifyPasswordHashAsync("kata-sandi-1", async_)).toBe(true);
    expect(verifyPasswordHash("kata-sandi-1", async_)).toBe(true);
    expect(await verifyPasswordHashAsync("lain", async_)).toBe(false);
  });

  it("makes a new salt every time", async () => {
    expect(await hashPasswordAsync("sama")).not.toBe(await hashPasswordAsync("sama"));
  });

  it("verifies the older scrypt forms (s2 and the first salt:hash)", async () => {
    const salt = "ab".repeat(16);
    const N = 1 << 14;
    const s2 = `s2$${N}$${salt}$${scryptSync("lama", salt, 64, { N, r: 8, p: 1, maxmem: 256 * N * 8 }).toString("hex")}`;
    expect(await verifyPasswordHashAsync("lama", s2)).toBe(true);
    expect(await verifyPasswordHashAsync("salah", s2)).toBe(false);
    const awal = `garam:${scryptSync("pertama", "garam", 64).toString("hex")}`;
    expect(await verifyPasswordHashAsync("pertama", awal)).toBe(true);
    expect(await verifyPasswordHashAsync("salah", awal)).toBe(false);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPasswordHashAsync("x", "a2id$65536$3$1")).toBe(false);
    expect(await verifyPasswordHashAsync("x", "s2$1$")).toBe(false);
    expect(await verifyPasswordHashAsync("x", "nonsense")).toBe(false);
  });

  it("keeps the event loop turning while hashes are worked out", async () => {
    let tik = 0;
    const t = setInterval(() => tik++, 5);
    await Promise.all([hashPasswordAsync("a"), hashPasswordAsync("b"), hashPasswordAsync("c")]);
    clearInterval(t);
    // Hashing on the main thread would have let no timer fire until all three were done.
    expect(tik).toBeGreaterThanOrEqual(3);
  });
});
