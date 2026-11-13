/**
 * The Module 4 board layout (2026-11-13): any Asisten may change how many Beacons there are, but not
 * once the hunt has started, because the boards are flashed before Mulai.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Layout = { jumlah: number | null; pola: "selang" | "berurutan" };
let sesiJalan: { id: number; modul: number; jumlahKelompok: number } | null = null;
let buru: { mulai: string | null; selesai: string | null } | null = null;
let tersimpan: Layout = { jumlah: null, pola: "selang" };
const tulis = vi.fn(async (p: Layout, _nim: string) => {
  tersimpan = p;
});
const audit = vi.fn(async (..._a: unknown[]) => {});

vi.mock("../../../src/lib/sesi", () => ({ currentSesi: async () => sesiJalan }));
vi.mock("../perburuan-sesi", () => ({ bacaPerburuanSesi: async () => buru }));
vi.mock("../../../src/lib/beacon-hunt", () => ({
  bacaBeaconHunt: async () => tersimpan,
  tulisBeaconHunt: (p: Layout, nim: string) => tulis(p, nim),
}));
vi.mock("../../../src/lib/auth", () => ({ writeAudit: (...a: unknown[]) => audit(...a) }));

const { handleBeaconGet, handleBeaconPost } = await import("../beacon-api");

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
  await handleBeaconPost({ body } as never, res as never, { nim: "ASD" } as never);
  return res.body;
};

beforeEach(() => {
  sesiJalan = null;
  buru = null;
  tersimpan = { jumlah: null, pola: "selang" };
  tulis.mockClear();
  audit.mockClear();
});

describe("GET the layout", () => {
  it("reads the default (a Beacon per group) with the default group count", async () => {
    const res = jawab();
    await handleBeaconGet({} as never, res as never);
    expect(res.body).toEqual({
      ok: true,
      jumlah: null,
      pola: "selang",
      jumlahKelompok: 5,
      terkunci: false,
      sesiModul4: false,
    });
  });

  it("reports the running Module 4 session's group count and locks once its hunt has started", async () => {
    sesiJalan = { id: 5, modul: 4, jumlahKelompok: 8 };
    let res = jawab();
    await handleBeaconGet({} as never, res as never);
    expect(res.body).toMatchObject({ jumlahKelompok: 8, terkunci: false, sesiModul4: true });
    buru = { mulai: new Date().toISOString(), selesai: null };
    res = jawab();
    await handleBeaconGet({} as never, res as never);
    expect(res.body).toMatchObject({ terkunci: true });
  });

  it("ignores a running session of another module", async () => {
    sesiJalan = { id: 2, modul: 3, jumlahKelompok: 9 };
    const res = jawab();
    await handleBeaconGet({} as never, res as never);
    expect(res.body).toMatchObject({ sesiModul4: false, jumlahKelompok: 5 });
  });
});

describe("POST the layout", () => {
  it("saves, audits, and says whether a Module 4 session is open", async () => {
    expect(await kirim({ jumlah: 2, pola: "selang" })).toEqual({
      ok: true,
      jumlah: 2,
      pola: "selang",
      sesiModul4: false,
    });
    expect(tulis).toHaveBeenCalledWith({ jumlah: 2, pola: "selang" }, "ASD");
    expect(audit).toHaveBeenCalledWith("ASD", "beacon_hunt", {
      dari: { jumlah: null, pola: "selang" },
      ke: { jumlah: 2, pola: "selang" },
    });
    sesiJalan = { id: 5, modul: 4, jumlahKelompok: 5 };
    expect(await kirim({ jumlah: null, pola: "berurutan" })).toMatchObject({
      ok: true,
      sesiModul4: true,
    });
  });

  it("writes nothing when the layout is unchanged", async () => {
    expect(await kirim({ jumlah: null, pola: "selang" })).toMatchObject({ ok: true });
    expect(tulis).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("refuses once the hunt has started", async () => {
    sesiJalan = { id: 5, modul: 4, jumlahKelompok: 5 };
    buru = { mulai: new Date().toISOString(), selesai: null };
    expect(await kirim({ jumlah: 2, pola: "selang" })).toEqual({
      ok: false,
      kode: "hunt_berjalan",
    });
    expect(tulis).not.toHaveBeenCalled();
  });

  it("refuses a layout that is not one", async () => {
    for (const bad of [
      {},
      { jumlah: 0, pola: "selang" },
      { jumlah: -1, pola: "selang" },
      { jumlah: 1.5, pola: "selang" },
      { jumlah: 100, pola: "selang" },
      { jumlah: "2", pola: "selang" },
      { jumlah: 2, pola: "acak" },
      { jumlah: 2 },
    ]) {
      expect(await kirim(bad)).toEqual({ ok: false, kode: "format_salah" });
    }
    expect(tulis).not.toHaveBeenCalled();
  });
});
