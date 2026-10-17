/**
 * Kirim Nilai counts the session's own roster: the next slot's start
 * replaces the live roster, so a group sent after it must still go.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anggota,
  kelompok,
  nilai,
  nilaiKirim,
  sesi,
  sesiAnggota,
  sesiAsisten,
} from "../../src/lib/schema";

/** Rows each read of a table answers, in order (the last one repeats). */
const baca = new Map<unknown, unknown[][]>();
const ditulis: { tabel: unknown; values: unknown }[] = [];

function q(rows: unknown[]) {
  const p: Record<string, unknown> = {};
  for (const m of ["where", "limit", "orderBy", "innerJoin", "leftJoin"]) p[m] = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok(rows);
  return p;
}
function tulis(tabel: unknown) {
  const p: Record<string, unknown> = {};
  p.values = (values: unknown) => {
    ditulis.push({ tabel, values });
    return p;
  };
  for (const m of ["onConflictDoNothing", "onConflictDoUpdate", "where", "set"]) p[m] = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok([]);
  return p;
}

vi.mock("../../src/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: unknown) => {
        const antre = baca.get(t) ?? [[]];
        return q(antre.length > 1 ? antre.shift()! : antre[0]);
      },
    }),
    insert: (t: unknown) => tulis(t),
    delete: (t: unknown) => tulis(t),
    update: (t: unknown) => tulis(t),
  }),
}));
vi.mock("../_lib/session", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireRole: () => ({ nim: "1010", role: "asisten" }),
  tolakPraktikanTot: async () => false,
}));
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../_lib/l1-otomatis", () => ({ l1PerKelompok: async () => new Map([[3, 63]]) }));
vi.mock("../_lib/seelabs-robot", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  antreNilai: async () => ({ antre: true }),
}));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => {},
}));

const { default: handler } = await import("../session/[aksi]");

async function kirim(body: Record<string, unknown>) {
  const res = {
    body: undefined as unknown,
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
  return res.body as { ok: boolean; kode?: string; kurang?: number };
}

const TANPA_L1 = ["TP", "TA", "D1", "D2", "D3", "D4", "L2"];
const skorDari = (nims: string[]) =>
  nims.flatMap((nim) => TANPA_L1.map((komponen) => ({ nim, komponen })));

beforeEach(() => {
  baca.clear();
  ditulis.length = 0;
  baca.set(sesi, [[{ id: 9, modul: 1, status: "selesai" }]]);
  baca.set(kelompok, [[{ id: 33, nomor: 3 }]]);
  baca.set(sesiAsisten, [[{ kelompokId: 33, asistenNim: "1010" }]]);
  // The next slot started: the live Kelompok 3 is somebody else now.
  baca.set(anggota, [[{ nim: "Z1" }, { nim: "Z2" }]]);
  baca.set(nilai, [skorDari(["A1", "A2"]), []]);
});

describe("Kirim Nilai after the next slot's start", () => {
  it("sends the session's own group and stores its automatic L1", async () => {
    baca.set(sesiAnggota, [
      [
        { nim: "A1", nomor: 3 },
        { nim: "A2", nomor: 3 },
        { nim: "B1", nomor: 4 },
      ],
    ]);
    expect(await kirim({ sesiId: 9, kelompokId: 33, kirim: true })).toMatchObject({ ok: true });
    const l1 = ditulis.find((w) => w.tabel === nilai)?.values as { nim: string; skor: number }[];
    expect(l1.map((r) => r.nim).sort()).toEqual(["A1", "A2"]);
    expect(l1.every((r) => r.skor === 63)).toBe(true);
    expect(ditulis.some((w) => w.tabel === nilaiKirim)).toBe(true);
  });

  it("falls back to the live roster for a session without its own", async () => {
    baca.set(sesiAnggota, [[]]);
    expect(await kirim({ sesiId: 9, kelompokId: 33, kirim: true })).toMatchObject({
      ok: false,
      kode: "belum_lengkap",
      kurang: 14,
    });
  });
});
