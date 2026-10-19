import { afterEach, describe, expect, it, vi } from "vitest";
import { sebagaiPeran, tulisanApi } from "../lihat-peran";
import type { Me } from "../app";

const simpan = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => simpan.get(k) ?? null,
  setItem: (k: string, v: string) => void simpan.set(k, v),
  removeItem: (k: string) => void simpan.delete(k),
});

const admin: Me = {
  ok: true,
  role: "asisten",
  nim: "1",
  nama: "Admin",
  tier: "admin",
  badges: [],
  kodeDivisi: null,
  hak: {
    own: true,
    pair: true,
    jadwal: true,
    server: true,
    full: true,
    tim: true,
    kode: true,
    lms: true,
    hadir: true,
    audit: true,
    profil: true,
  },
};

afterEach(() => simpan.clear());

describe("the write guard", () => {
  it("refuses writes to the API, never reads or signing in and out", () => {
    expect(tulisanApi("/api/session/tim", "POST")).toBe(true);
    expect(tulisanApi("https://irisiotlab.com/api/server/3", "PATCH")).toBe(true);
    expect(tulisanApi("/api/server/3", "delete")).toBe(true);
    expect(tulisanApi("/api/session/tim", "GET")).toBe(false);
    expect(tulisanApi("/api/session/tim", undefined)).toBe(false);
    expect(tulisanApi("/api/auth/logout", "POST")).toBe(false);
    expect(tulisanApi("/brand/logo.png", "POST")).toBe(false);
  });
});

describe("sebagaiPeran", () => {
  it("leaves the person alone without a preview", () => {
    expect(sebagaiPeran(admin)).toBe(admin);
  });

  it("swaps an Admin's rights for the preset's", () => {
    simpan.set("iris-lihat-peran", "aso");
    vi.stubGlobal("window", { fetch: async () => new Response("{}") });
    const m = sebagaiPeran(admin);
    expect(m.lihatPeran).toBe("aso");
    expect(m.tier).toBe("asisten");
    expect(m.kodeDivisi).toBe("ASO");
    expect(m.hak).toMatchObject({ kode: true, lms: true, tim: false, audit: false, pair: "own" });
    expect(m.nim).toBe("1");
    vi.unstubAllGlobals();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => simpan.get(k) ?? null,
      setItem: (k: string, v: string) => void simpan.set(k, v),
      removeItem: (k: string) => void simpan.delete(k),
    });
  });

  it("drops a stored preset for anyone without the Tim right", () => {
    simpan.set("iris-lihat-peran", "admin");
    const asisten: Me = { ...admin, tier: "asisten", hak: { ...admin.hak!, tim: false } };
    expect(sebagaiPeran(asisten)).toBe(asisten);
    expect(simpan.has("iris-lihat-peran")).toBe(false);
  });
});
