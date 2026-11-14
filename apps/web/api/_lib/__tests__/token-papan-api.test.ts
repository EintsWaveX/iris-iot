/**
 * The Asisten token on the website (2026-11-14). Two guarantees: the token endpoint hands it out
 * only while a Module 4 session runs, and handlePerburuan, which Praktikan read, never carries it,
 * whoever asks and whatever the PC reported.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "QXA3W7";
let sesiJalan: { id: number; modul: number } | null = null;
let ringkasMasuk: Record<string, unknown> | null = null;

// The select chain of drizzle, enough for handlePerburuan: every `await` of it gives these rows.
function rantai(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "innerJoin"]) c[m] = () => c;
  c.then = (ok: (v: unknown[]) => unknown) => Promise.resolve(rows).then(ok);
  return c;
}
vi.mock("../../../src/lib/db", () => ({
  getDb: () => ({
    select: (kolom: Record<string, unknown>) =>
      rantai(
        "perburuan" in kolom
          ? ringkasMasuk
            ? [{ perburuan: ringkasMasuk, hotspot: null }]
            : []
          : [],
      ),
  }),
}));
vi.mock("../../../src/lib/sesi", () => ({ currentSesi: async () => sesiJalan }));
vi.mock("../perburuan-sesi", () => ({
  bacaPerburuanSesi: async () => ({ mulai: "2026-11-14T08:00:00Z", selesai: null }),
}));
vi.mock("../../../src/lib/jaringan-hunt", () => ({ bacaJaringanHunt: async () => "internet" }));

const { handleTokenPapanGet } = await import("../token-papan-api");
const { handlePerburuan } = await import("../perburuan-api");

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

const ringkas = (token: string) => ({
  versi: 1,
  kode: "K7QX4M",
  token,
  kunci: { "1": "MPLLTH9L", "2": "ABCDEFGH" },
  sesi: 2,
  mulai: true,
  selesai: false,
  berjalan: 60,
  grup: [{ grup: 1, status: "berburu", anggota: [] }],
  penghargaan: null,
  peristiwa: [],
});

beforeEach(() => {
  sesiJalan = { id: 7, modul: 4 };
  ringkasMasuk = ringkas(TOKEN);
});

describe("GET the token", () => {
  it("hands it out while a Module 4 session runs and the PC reports it", async () => {
    const res = jawab();
    await handleTokenPapanGet({} as never, res as never);
    expect(res.body).toMatchObject({ ok: true, token: TOKEN, sesiModul4: true });
  });

  it("gives none when no session runs, or another module does", async () => {
    sesiJalan = null;
    let res = jawab();
    await handleTokenPapanGet({} as never, res as never);
    expect(res.body).toEqual({ ok: true, token: null, sesiModul4: false });
    sesiJalan = { id: 7, modul: 2 };
    res = jawab();
    await handleTokenPapanGet({} as never, res as never);
    expect(res.body.token).toBeNull();
  });

  it("gives none when the PC reports nothing (or a malformed token)", async () => {
    ringkasMasuk = null;
    let res = jawab();
    await handleTokenPapanGet({} as never, res as never);
    expect(res.body.token).toBeNull();
    ringkasMasuk = ringkas("not valid!");
    res = jawab();
    await handleTokenPapanGet({} as never, res as never);
    expect(res.body.token).toBeNull();
  });
});

describe("the Perburuan answer never carries the token", () => {
  for (const role of ["praktikan", "asisten"]) {
    it(`for a ${role}`, async () => {
      const res = jawab();
      await handlePerburuan(
        {} as never,
        res as never,
        { nim: "2311102001", role, kelompokNomor: 1 } as never,
      );
      expect(res.body.ok).toBe(true);
      const teks = JSON.stringify(res.body);
      expect(teks).not.toContain(TOKEN);
      expect(teks).not.toContain('"token"');
      // The same call does hand out this group's own board key, so the mock really reached it
      expect(res.body.kunciPapan).toBe("MPLLTH9L");
    });
  }
});
