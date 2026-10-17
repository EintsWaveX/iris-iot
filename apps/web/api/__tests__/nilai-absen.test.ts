/**
 * Phase 18: Tidak Hadir keeps the member's TP. TP is homework handed in
 * before the session, so being absent must not wipe it. Run through the real
 * POST /api/session/nilai handler with the database replaced by a recorder.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Tulis = {
  jenis: "insert" | "delete";
  tabel: unknown;
  values?: unknown;
  konflik?: string;
  where?: unknown;
};
const ditulis: Tulis[] = [];

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
    ok(tulis ? [] : [{ id: 1, kelompokId: 1, nomor: 1, nim: "A1", status: "berjalan" }]);
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
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => {},
}));

const { default: handler } = await import("../session/[aksi]");
const { nilai, nilaiAbsen } = await import("../../src/lib/schema");

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
});

describe("Tidak Hadir keeps TP", () => {
  it("writes 0 for the seven non-TP parts and TP only when it is missing", async () => {
    const r = await kirim({ sesiId: 5, nim: "A1", absen: true });
    expect(r.ok).toBe(true);

    const tulis = nilaiTulis().filter((t) => t.jenis === "insert");
    const tujuh = tulis.find((t) => t.konflik === "update");
    const tp = tulis.find((t) => t.konflik === "nothing");

    const komponenTujuh = (tujuh?.values as { komponen: string; skor: number }[]).map(
      (v) => v.komponen,
    );
    expect(komponenTujuh).toEqual(["TA", "D1", "D2", "D3", "D4", "L1", "L2"]);
    expect((tujuh?.values as { skor: number }[]).every((v) => v.skor === 0)).toBe(true);

    expect(tp?.values).toMatchObject({ sesiId: 5, nim: "A1", komponen: "TP", skor: 0 });
    expect(ditulis.some((t) => t.tabel === nilaiAbsen && t.jenis === "insert")).toBe(true);
  });

  it("never overwrites an existing TP when marking absent", async () => {
    await kirim({ sesiId: 5, nim: "A1", absen: true });
    const conflictUpdate = nilaiTulis().filter((t) => t.konflik === "update");
    for (const t of conflictUpdate)
      expect((t.values as { komponen: string }[]).some((v) => v.komponen === "TP")).toBe(false);
  });

  it("taking it back deletes the zero rows of the seven parts only, never TP", async () => {
    const r = await kirim({ sesiId: 5, nim: "A1", absen: false });
    expect(r.ok).toBe(true);
    const hapus = nilaiTulis().filter((t) => t.jenis === "delete");
    expect(hapus).toHaveLength(1);
    const q = new PgDialect().sqlToQuery(hapus[0].where as never);
    // Zero rows only, and TP is carved out of the filter.
    expect(q.params).toContain(0);
    expect(q.params).toContain("TP");
    expect(q.sql).toContain('"komponen" <>');
  });
});
