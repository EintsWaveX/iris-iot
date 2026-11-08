/**
 * The self-hosted server must answer every redirect, rewrite and header the
 * way vercel.json says. These run the real file through the same engine the
 * server uses, so a rule added to vercel.json is covered the day it lands,
 * and a shape the engine cannot read fails here, not in production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileRules, sumberKeRegex, type VercelConfig } from "../rules.js";

const config: VercelConfig = JSON.parse(
  readFileSync(resolve(__dirname, "..", "..", "vercel.json"), "utf8"),
);
const a = compileRules(config);
const BARU = "irisiotlab.com";
const LAMA = "iris-praktikum-jurnal.vercel.app";

describe("vercel.json redirects", () => {
  it("reads every rule in the file", () => {
    expect(() => compileRules(config)).not.toThrow();
    expect(config.redirects!.length).toBeGreaterThan(5);
  });

  it("only uses host conditions (the engine ignores any other kind)", () => {
    for (const r of [...(config.redirects ?? []), ...(config.rewrites ?? [])])
      for (const h of r.has ?? []) expect(h.type).toBe("host");
  });

  it("sends the old Vercel host's pages to the same path and query on the new host", () => {
    expect(a.alihkan(LAMA, "/en/modules/3", "?tab=x")).toEqual({
      status: 308,
      lokasi: "https://irisiotlab.com/en/modules/3?tab=x",
    });
    expect(a.alihkan(LAMA, "/", "")).toEqual({ status: 308, lokasi: "https://irisiotlab.com/" });
  });

  it("never redirects /api on the old host (the PC agent POSTs there)", () => {
    expect(a.alihkan(LAMA, "/api/agen", "")).toBeNull();
    expect(a.alihkan(LAMA, "/api/tp/detak", "")).toBeNull();
  });

  it("leaves the new host alone, and ignores the port", () => {
    expect(a.alihkan(BARU, "/en/modules/3", "")).toBeNull();
    expect(a.alihkan(`${BARU}:443`, "/", "")).toBeNull();
  });

  it.each([
    ["/lms", "?a=1", 308, "/grading?a=1"],
    ["/en/lms", "", 308, "/en/grading"],
    ["/zh/lms", "", 308, "/zh/grading"],
    ["/masuk", "", 307, "/login"],
    ["/privasi", "", 308, "/privacy"],
    ["/ketentuan", "", 308, "/terms"],
    ["/dashboard/server", "", 308, "/servers"],
    ["/zh", "", 307, "/en"],
    ["/zh/modules/3", "?x=1", 307, "/en/modules/3?x=1"],
  ])("%s%s -> %i %s", (path, query, status, lokasi) => {
    expect(a.alihkan(BARU, path, query)).toEqual({ status, lokasi });
  });

  it("does not touch ordinary pages", () => {
    for (const p of ["/", "/en", "/en/modules/3", "/login", "/servers", "/zhx"])
      expect(a.alihkan(BARU, p, "")).toBeNull();
  });
});

describe("vercel.json rewrites", () => {
  it.each([
    ["/api/agen", "/api/agent"],
    ["/api/tindakan", "/api/action"],
    ["/api/auth/praktikan", "/api/auth/student"],
    ["/api/auth/asisten", "/api/auth/assistant"],
    ["/api/auth/keluar", "/api/auth/logout"],
    ["/api/sesi", "/api/session"],
    ["/api/sesi/kelompok", "/api/session/group"],
    ["/api/sesi/akhiri", "/api/session/end"],
    ["/api/sesi/mulai", "/api/session/mulai"],
    ["/api/sesi/a/b", "/api/session/a/b"],
  ])("%s -> %s", (dari, ke) => {
    expect(a.tulisUlang(dari)).toBe(ke);
  });

  it("leaves every other path as it is", () => {
    for (const p of ["/api/agent", "/api/tp/detak", "/en/modules/3", "/"])
      expect(a.tulisUlang(p)).toBe(p);
  });
});

describe("vercel.json headers", () => {
  const nilai = (path: string, key: string) =>
    a
      .header(path)
      .filter(([k]) => k === key)
      .map(([, v]) => v)
      .pop();

  it("puts the security headers and the CSP on pages and the API", () => {
    for (const p of ["/", "/en/modules/3", "/api/agent"]) {
      expect(nilai(p, "Strict-Transport-Security")).toContain("max-age=63072000");
      expect(nilai(p, "X-Content-Type-Options")).toBe("nosniff");
      expect(nilai(p, "Content-Security-Policy")).toContain("default-src 'self'");
    }
  });

  it("gives the handbook its own CSP and cache time instead", () => {
    expect(nilai("/handbook/x.pdf", "Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(nilai("/handbook/x.pdf", "Cache-Control")).toBe("public, max-age=3600");
    expect(nilai("/handbook/x.pdf", "Content-Security-Policy")).not.toContain("default-src");
  });

  it("has the longer limit for the TP routes", () => {
    expect(a.durasiMaks("api/tp/[aksi].ts")).toBe(60);
    expect(a.durasiMaks("api/agent/index.ts")).toBeUndefined();
  });
});

describe("sumberKeRegex", () => {
  it("refuses a shape it cannot read, so no rule is silently skipped", () => {
    expect(() => sumberKeRegex("/a/:b{c}")).toThrow();
    expect(() => sumberKeRegex("/a/(unclosed")).toThrow();
  });

  it("treats a literal dot as a dot", () => {
    expect(sumberKeRegex("/a.txt").test("/aXtxt")).toBe(false);
    expect(sumberKeRegex("/a.txt").test("/a.txt")).toBe(true);
  });
});
