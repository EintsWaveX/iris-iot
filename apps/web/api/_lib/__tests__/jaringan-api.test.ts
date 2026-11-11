/**
 * The Module 4 network switch (2026-11-11): any Asisten may change it, but
 * not once the hunt has started, because the boards are flashed before Mulai
 * with the network's Wi-Fi name and scoreboard address.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let sesiJalan: { id: number; modul: number } | null = null;
let buru: { mulai: string | null; selesai: string | null } | null = null;
let tersimpan: "internet" | "iris_iot" = "iris_iot";
const tulis = vi.fn(async (j: "internet" | "iris_iot", _nim: string) => {
  tersimpan = j;
});
const audit = vi.fn(async (..._a: unknown[]) => {});

vi.mock("../../../src/lib/sesi", () => ({ currentSesi: async () => sesiJalan }));
vi.mock("../perburuan-sesi", () => ({ bacaPerburuanSesi: async () => buru }));
vi.mock("../../../src/lib/jaringan-hunt", () => ({
  bacaJaringanHunt: async () => tersimpan,
  tulisJaringanHunt: (j: "internet" | "iris_iot", nim: string) => tulis(j, nim),
}));
vi.mock("../../../src/lib/auth", () => ({ writeAudit: (...a: unknown[]) => audit(...a) }));

const { handleJaringanGet, handleJaringanPost } = await import("../jaringan-api");

function jawab() {
  const res = {
    code: 200,
    body: undefined as unknown as Record<string, unknown>,
    status(n: number) {
      res.code = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
    setHeader() {},
  };
  return res;
}

const kirim = async (body: unknown) => {
  const res = jawab();
  await handleJaringanPost({ body } as never, res as never, { nim: "ASD" } as never);
  return res.body;
};

beforeEach(() => {
  sesiJalan = null;
  buru = null;
  tersimpan = "iris_iot";
  tulis.mockClear();
  audit.mockClear();
});

describe("GET the network", () => {
  it("reads the setting, unlocked when no hunt runs", async () => {
    const res = jawab();
    await handleJaringanGet({} as never, res as never);
    expect(res.body).toEqual({
      ok: true,
      jaringan: "iris_iot",
      terkunci: false,
      sesiModul4: false,
    });
  });

  it("says a Module 4 session is open, and locks once its hunt has started", async () => {
    sesiJalan = { id: 5, modul: 4 };
    let res = jawab();
    await handleJaringanGet({} as never, res as never);
    expect(res.body).toMatchObject({ terkunci: false, sesiModul4: true });

    buru = { mulai: new Date().toISOString(), selesai: null };
    res = jawab();
    await handleJaringanGet({} as never, res as never);
    expect(res.body).toMatchObject({ terkunci: true, sesiModul4: true });

    buru = { mulai: new Date().toISOString(), selesai: new Date().toISOString() };
    res = jawab();
    await handleJaringanGet({} as never, res as never);
    expect(res.body).toMatchObject({ terkunci: false });
  });

  it("ignores a running session of another module", async () => {
    sesiJalan = { id: 2, modul: 3 };
    buru = { mulai: new Date().toISOString(), selesai: null };
    const res = jawab();
    await handleJaringanGet({} as never, res as never);
    expect(res.body).toMatchObject({ terkunci: false, sesiModul4: false });
  });
});

describe("POST the network", () => {
  it("switches, audits, and says whether students must download again", async () => {
    expect(await kirim({ jaringan: "internet" })).toEqual({
      ok: true,
      jaringan: "internet",
      sesiModul4: false,
    });
    expect(tulis).toHaveBeenCalledWith("internet", "ASD");
    expect(audit).toHaveBeenCalledWith("ASD", "jaringan_hunt", {
      dari: "iris_iot",
      ke: "internet",
    });

    sesiJalan = { id: 5, modul: 4 };
    expect(await kirim({ jaringan: "iris_iot" })).toMatchObject({ ok: true, sesiModul4: true });
  });

  it("writes nothing when it is already that network", async () => {
    expect(await kirim({ jaringan: "iris_iot" })).toMatchObject({ ok: true });
    expect(tulis).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("refuses once the hunt has started", async () => {
    sesiJalan = { id: 5, modul: 4 };
    buru = { mulai: new Date().toISOString(), selesai: null };
    expect(await kirim({ jaringan: "internet" })).toEqual({ ok: false, kode: "hunt_berjalan" });
    expect(tulis).not.toHaveBeenCalled();
  });

  it("refuses anything that is not one of the two networks", async () => {
    for (const buruk of [
      {},
      { jaringan: "wifi" },
      { jaringan: 1 },
      { jaringan: null },
      "internet",
    ]) {
      expect(await kirim(buruk)).toEqual({ ok: false, kode: "format_salah" });
    }
    expect(tulis).not.toHaveBeenCalled();
  });
});
