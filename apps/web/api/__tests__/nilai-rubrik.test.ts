/**
 * Task 14: the lab rubric decides which scores the nilai handler accepts
 * (levels for D1 to D4 and L2, 0 to 90 for L1, 0 to 100 for TA and TP).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Tulis = {
  jenis: "insert" | "delete";
  tabel: unknown;
  values?: unknown;
  konflik?: string;
  where?: unknown;
};
const ditulis: Tulis[] = [];
/** Reads answer group 1 as sent (Kirim Nilai) when set, else group 99. */
let terkirim = false;

function chain(tulis?: Tulis): unknown {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "from", "limit", "orderBy", "innerJoin", "leftJoin", "set"])
    p[m] = () => p;
  p.where = (w: unknown) => {
    if (tulis) tulis.where = w;
    return p;
  };
  p.values = (v: unknown) => {
    if (tulis) tulis.values = v;
    return p;
  };
  p.onConflictDoNothing = () => {
    if (tulis) tulis.konflik = "nothing";
    return p;
  };
  p.onConflictDoUpdate = () => {
    if (tulis) tulis.konflik = "update";
    return p;
  };
  // Every read answers one row that satisfies the group and session lookups.
  p.then = (ok: (v: unknown) => unknown) =>
    ok(
      tulis
        ? []
        : [
            {
              id: 1,
              kelompokId: 1,
              nomor: 1,
              nim: "A1",
              status: "berjalan",
              // As a nilai_kirim row: group 1 sent, or another group.
              kelompokNomor: terkirim ? 1 : 99,
              dikirimPada: new Date(0),
              dikirimOleh: "1010",
            },
          ],
    );
  return p;
}

function rekam(jenis: Tulis["jenis"], tabel: unknown) {
  const t: Tulis = { jenis, tabel };
  ditulis.push(t);
  return chain(t);
}

vi.mock("../../src/lib/db", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: (t: unknown) => rekam("insert", t),
    delete: (t: unknown) => rekam("delete", t),
    update: () => chain({ jenis: "insert", tabel: null }),
  }),
}));
vi.mock("../_lib/session", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireRole: () => ({ nim: "1010", role: "asisten" }),
  tolakPraktikanTot: async () => false,
}));
vi.mock("../_lib/l1-otomatis", () => ({ l1PerKelompok: async () => new Map([[1, 63]]) }));
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => {},
}));

const { default: handler } = await import("../session/[aksi]");
const { nilai } = await import("../../src/lib/schema");

async function kirim(body: Record<string, unknown>) {
  const res = {
    body: undefined as unknown,
    statusCode: 200,
    status() {
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader() {},
  };
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method: "POST", query: { aksi: "nilai" }, body, headers: {} } as never,
    res as never,
  );
  return res.body as { ok: boolean; kode?: string };
}

const nilaiTulis = () => ditulis.filter((t) => t.tabel === nilai);

beforeEach(() => {
  ditulis.length = 0;
  terkirim = false;
});

describe("score validation by rubric", () => {
  it("refuses 50 for a level component and 95 for L1", async () => {
    for (const k of ["D1", "D2", "D3", "D4", "L2"]) {
      expect(await kirim({ sesiId: 5, nim: "A1", komponen: k, skor: 50 })).toMatchObject({
        ok: false,
        kode: "format_salah",
      });
    }
    expect(await kirim({ sesiId: 5, nim: "A1", komponen: "L1", skor: 95 })).toMatchObject({
      ok: false,
      kode: "format_salah",
    });
    expect(await kirim({ sesiId: 5, nim: "A1", komponen: "TA", skor: 101 })).toMatchObject({
      ok: false,
    });
    expect(nilaiTulis()).toHaveLength(0);
  });

  it("refuses an off-level score in Sama Rata too", async () => {
    const r = await kirim({ sesiId: 5, nims: ["A1", "A2"], komponen: "D3", skor: 70 });
    expect(r.kode).toBe("format_salah");
  });

  it("accepts every level, L1 up to 90 and TA 100", async () => {
    for (const [k, v] of [
      ["D1", 45],
      ["D4", 90],
      ["L2", 0],
      ["L2", 65],
      ["D2", 80],
      ["L1", 90],
      ["L1", 63],
      ["TA", 100],
    ] as const) {
      const r = await kirim({ sesiId: 5, nim: "A1", komponen: k, skor: v });
      expect(r.ok, k + v).toBe(true);
    }
  });

  it("clears an L1 override with hapus, and only for L1", async () => {
    expect((await kirim({ sesiId: 5, nim: "B9", komponen: "L1", hapus: true })).ok).toBe(true);
    expect(ditulis.some((t) => t.tabel === nilai && t.jenis === "delete")).toBe(true);
    ditulis.length = 0;
    expect((await kirim({ sesiId: 5, nim: "A1", komponen: "D1", hapus: true })).kode).toBe(
      "format_salah",
    );
  });

  it("after Kirim Nilai, clearing L1 stores the system's value instead of none", async () => {
    terkirim = true;
    expect((await kirim({ sesiId: 5, nim: "B9", komponen: "L1", hapus: true })).ok).toBe(true);
    const w = nilaiTulis();
    expect(w.some((t) => t.jenis === "delete")).toBe(false);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      jenis: "insert",
      konflik: "update",
      values: [{ sesiId: 5, nim: "B9", komponen: "L1", skor: 63, diubahOleh: "otomatis" }],
    });
  });
});
