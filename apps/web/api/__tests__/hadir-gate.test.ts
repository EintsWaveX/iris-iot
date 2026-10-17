/**
 * Phase 18: teaching attendance is Asisten data. Every route of it (the PJ's
 * and the check-in writes on hadir and hadirku, the cut rate on bayar, and
 * the hadirku and hadirrekap reads) answers 401 signed out and 403 for a
 * Praktikan, through the real dispatcher and the real requireRole; only the
 * cookie reader and the database are replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let cookie: { nim: string; role: "asisten" | "praktikan" } | null = null;

function chain(): unknown {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit", "innerJoin", "leftJoin"])
    p[m] = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok([]);
  return p;
}

vi.mock("../../src/lib/db", () => ({ getDb: () => ({ select: () => chain() }) }));
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readSessionCookie: () => cookie,
}));

const { default: handler } = await import("../session/[aksi]");

async function panggil(method: "GET" | "POST", aksi: string, body: Record<string, unknown>) {
  const res = {
    code: 200,
    body: undefined as unknown,
    status(n: number) {
      res.code = n;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader() {},
  };
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method, query: { aksi }, body, headers: {} } as never,
    res as never,
  );
  return res;
}

const RUTE: [method: "GET" | "POST", aksi: string, body: Record<string, unknown>][] = [
  ["POST", "hadir", { aksi: "status", kunci: "j:1:2026-10-19", nim: "2020", status: "tepat" }],
  ["POST", "hadir", { aksi: "geser", kunci: "j:1:2026-10-19", jam: "06:40" }],
  ["POST", "hadir", { aksi: "aa", kunci: "j:1:2026-10-19", nim: "2020", izin: true }],
  ["POST", "hadir", { aksi: "asisten", nim: "2020" }],
  ["POST", "hadirku", { aksi: "masuk" }],
  ["POST", "hadirku", { aksi: "batal" }],
  ["POST", "bayar", { aksi: "potongan", perMenit: 2000, maks: 10 }],
  ["GET", "hadir", {}],
  ["GET", "hadirku", {}],
  ["GET", "hadirrekap", {}],
];

beforeEach(() => {
  cookie = null;
});

describe("Phase 18 routes are for Asisten only", () => {
  for (const [method, aksi, body] of RUTE) {
    const nama = `${method} ${aksi}${body.aksi ? ` ${String(body.aksi)}` : ""}`;
    it(`${nama}: 401 signed out, 403 for a Praktikan, nothing else answered`, async () => {
      const keluar = await panggil(method, aksi, body);
      expect(keluar.code).toBe(401);
      expect(keluar.body).toEqual({ ok: false, kode: "belum_masuk" });
      cookie = { nim: "1301200001", role: "praktikan" };
      const praktikan = await panggil(method, aksi, body);
      expect(praktikan.code).toBe(403);
      expect(praktikan.body).toEqual({ ok: false, kode: "peran_salah" });
    });
  }
});
