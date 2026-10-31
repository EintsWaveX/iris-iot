/**
 * The S3 dispatch (api/_lib/recruitment-s3.ts): which exam action goes to
 * which area's handler, and who may call it. The handlers themselves are
 * tested with their areas; here they are stand-ins that only say they ran.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let asistenSesi: Record<string, unknown> | null = null;
let oprec: Record<string, unknown> | null = null;

vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readSessionCookie: () => asistenSesi,
}));
vi.mock("../_lib/recruitment-akun", () => ({
  sesiOprec: async () => oprec,
  wajibOprec: async (
    _q: unknown,
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => {
    if (!oprec) res.status(401).json({ ok: false, kode: "belum_masuk_oprec" });
    return oprec;
  },
}));
const ran = vi.fn();
const area =
  (name: string) =>
  async (_q: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    ran(name);
    res.status(200).json({ ok: true, area: name });
  };
vi.mock("../_lib/recruitment-bank", () => ({ handleBank: area("bank") }));
vi.mock("../_lib/recruitment-seat", () => ({ handleSeat: area("seat") }));
vi.mock("../_lib/recruitment-room", () => ({ handleRoom: area("room") }));
vi.mock("../_lib/recruitment-livecode", () => ({ handleLiveCode: area("livecode") }));
vi.mock("../_lib/recruitment-score", () => ({ handleScore: area("score") }));

const { handleS3 } = await import("../_lib/recruitment-s3");

const asisten = { role: "asisten", nim: "1101200001", nama: "A", exp: 9e9 };
const praktikan = { role: "praktikan", nim: "1101200002", nama: "P", exp: 9e9 };
const kandidat = { role: "praktikan", nim: "1101209999", nama: "K", exp: 9e9 };

function jalan(aksi: string, method: string) {
  const out: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => undefined,
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: unknown) {
      out.body = b;
    },
  };
  const req = { method, query: { aksi }, headers: {}, body: {} };
  const dipegang = handleS3(aksi, req as never, res as never);
  return dipegang.then((ok) => ({ ok, ...out }));
}

beforeEach(() => {
  asistenSesi = null;
  oprec = null;
  ran.mockClear();
});

describe("S3 dispatch", () => {
  it("leaves an action it does not know to the route", async () => {
    const r = await jalan("banner", "GET");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it("sends each action to its area", async () => {
    asistenSesi = asisten;
    oprec = kandidat;
    const cases: [string, string, string][] = [
      ["exam-config", "GET", "bank"],
      ["question-save", "POST", "bank"],
      ["rooms", "GET", "room"],
      ["room-act", "POST", "room"],
      ["test", "GET", "seat"],
      ["test-answer", "POST", "seat"],
      ["lc-grade", "POST", "livecode"],
      ["lc", "GET", "livecode"],
      ["scores", "GET", "score"],
      ["score-finalize", "POST", "score"],
    ];
    for (const [aksi, method, nama] of cases) {
      const r = await jalan(aksi, method);
      expect(r.ok, aksi).toBe(true);
      expect((r.body as { area: string }).area, aksi).toBe(nama);
    }
  });

  it("answers 405 when the method is wrong", async () => {
    asistenSesi = asisten;
    expect((await jalan("rooms", "POST")).status).toBe(405);
    expect((await jalan("room-act", "GET")).status).toBe(405);
    expect(ran).not.toHaveBeenCalled();
  });

  it("serves a candidate's actions only to an oprec account, never the practicum session", async () => {
    asistenSesi = asisten;
    const r = await jalan("test", "GET");
    expect(r.status).toBe(401);
    expect(ran).not.toHaveBeenCalled();
    asistenSesi = praktikan;
    expect((await jalan("test-answer", "POST")).status).toBe(401);
    oprec = kandidat;
    expect((await jalan("test-answer", "POST")).status).toBe(200);
  });

  it("serves the Panitia's actions only to an Asisten session", async () => {
    expect((await jalan("room", "GET")).status).toBe(401);
    asistenSesi = praktikan;
    expect((await jalan("room", "GET")).status).toBe(403);
    // An oprec account is not a Panitia session
    asistenSesi = null;
    oprec = kandidat;
    expect((await jalan("room-act", "POST")).status).toBe(401);
    asistenSesi = asisten;
    expect((await jalan("room-act", "POST")).status).toBe(200);
  });

  it("serves a shared read to an Asisten or a candidate, and nobody else", async () => {
    expect((await jalan("media", "GET")).status).toBe(401);
    asistenSesi = asisten;
    expect((await jalan("media", "GET")).status).toBe(200);
    asistenSesi = null;
    oprec = kandidat;
    expect((await jalan("media", "GET")).status).toBe(200);
  });
});
