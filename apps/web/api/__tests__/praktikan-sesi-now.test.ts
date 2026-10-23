/**
 * A Praktikan still learns whether a session runs (2026-10-23): the
 * own-group guard of the readings belongs to telemetry, not to
 * /api/session/now, which carries no group and is what the mini bar and the
 * join button read. Through the real dispatcher; the database answers empty.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telemetriLog } from "../../src/lib/schema";

let cookie: Record<string, unknown> | null = null;

const BACAAN = { id: 1, seq: 1, tx: 1, rx: 1, delayMs: 5, rssi: null, snr: null, nilai: null };

function chain(): unknown {
  let tabel: unknown = null;
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "innerJoin", "leftJoin"]) p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = t;
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(tabel === telemetriLog ? [BACAAN] : []);
  return p;
}

vi.mock("../../src/lib/db", () => ({
  getDb: () => ({ select: () => chain(), selectDistinctOn: () => chain() }),
}));
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readSessionCookie: () => cookie,
}));

const { default: handler } = await import("../session/[aksi]");

async function panggil(aksi: string, query: Record<string, string> = {}) {
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
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method: "GET", query: { aksi, ...query }, body: {}, headers: {} } as never,
    res as never,
  );
  return res;
}

beforeEach(() => {
  cookie = { nim: "101022300001", role: "praktikan", kelompokId: 3, kelompokNomor: 2, sesiId: 7 };
});

describe("/api/session/now for a Praktikan", () => {
  it("answers about the session, not with an empty readings list", async () => {
    const r = await panggil("now");
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ ok: true, sesi: null });
  });
});

describe("/api/session/telemetry for a Praktikan", () => {
  it("shows another group's readings as none", async () => {
    const r = await panggil("telemetry", { modul: "2", kelompok: "5" });
    expect(r.body).toEqual({ ok: true, reading: null, readings: [] });
  });

  it("lets the own group's request through to the readings", async () => {
    const r = await panggil("telemetry", { modul: "2", kelompok: "2" });
    expect(r.body.ok).toBe(true);
    expect(r.body.readings).toHaveLength(1);
  });
});
