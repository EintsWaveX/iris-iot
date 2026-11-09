/**
 * Hak Akses (recruitment-hak.ts): any Panitia reads the config, only the
 * Ketua seat and the Pencipta change it, a bad body is refused without a
 * write, a reset deletes the row, and what is saved changes what people can
 * do. The database is a fake keyed by table.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  percobaanMasuk,
  praktikan,
  recAccount,
  recCandidate,
  recCommittee,
  recDocument,
  recEdition,
  recEvent,
  pengaturan,
} from "../../src/lib/schema";
import { EVENT_SEED } from "../../src/lib/recruitment/seed";
import { createSessionCookie } from "../../src/lib/auth";
import { HAK_BAWAAN } from "../../src/lib/recruitment/rights";
import { RIGHTS_KEYS } from "../../src/lib/recruitment/types";

type Rows = Record<string, unknown[] | unknown[][]>;
const tabelNama = new Map<unknown, string>([
  [asisten, "asisten"],
  [percobaanMasuk, "percobaan"],
  [praktikan, "praktikan"],
  [recAccount, "account"],
  [recCandidate, "candidate"],
  [recCommittee, "committee"],
  [recDocument, "document"],
  [recEdition, "edition"],
  [recEvent, "event"],
  [pengaturan, "pengaturan"],
]);

let rows: Rows = {};
/** Tables answering a different result per read, in order. */
let antrean: Record<string, unknown[][]> = {};
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];
const audit: { aksi: string; isi: unknown }[] = [];

function baca(tabel: string): unknown[] {
  const q = antrean[tabel];
  if (q?.length) return q.shift()!;
  return (rows[tabel] as unknown[]) ?? [];
}
function chain(): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy"]) p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = tabelNama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(baca(tabel));
  return p;
}
function tulisan(op: string, t: unknown) {
  const tabel = tabelNama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "onConflictDoUpdate"]) p[m] = () => p;
  p.values = (nilai: unknown) => (tulis.push({ op, tabel, nilai }), p);
  p.set = (nilai: unknown) => (tulis.push({ op, tabel, nilai }), p);
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok(rows[`${tabel}:${op}`] ?? rows[tabel] ?? []);
  return p;
}
vi.mock("../../src/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: (t: unknown) => tulisan("insert", t),
    update: (t: unknown) => tulisan("update", t),
    delete: (t: unknown) => tulisan("delete", t),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { getDb: () => db };
});
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (_nim: string, aksi: string, isi: unknown) => void audit.push({ aksi, isi }),
}));
vi.mock("../_lib/tp-simpan", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  simpanSiap: () => true,
  tiketUnggah: async (o: { kunci: string }) => ({ url: `https://relay.test/put?k=${o.kunci}` }),
}));
vi.mock("../_lib/recruitment-unggah", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  periksaBerkas: async () => "ok",
}));

const { default: handler } = await import("../recruitment/[aksi]");

const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const EVENT_ROWS = EVENT_SEED.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}));
const orang = (tier: string, badges: string[] = []) => ({
  nim: "101022300900",
  kode: "ABC",
  nama: "Uji",
  tier,
  divisi: "ADC",
  badges,
  hakOverride: {},
  status: "aktif",
});
const asistenCookie = () =>
  `iris_session=${createSessionCookie({ role: "asisten", nim: "101022300900", nama: "Uji" })}`;

async function panggil(
  method: "GET" | "POST",
  aksi: string,
  o: { body?: unknown; cookie?: string } = {},
) {
  const res = {
    code: 200,
    statusCode: 200,
    body: undefined as unknown as Record<string, unknown>,
    headers: {} as Record<string, string>,
    status(n: number) {
      res.code = n;
      res.statusCode = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k.toLowerCase()] = v;
    },
    end() {},
  };
  const headers: Record<string, string> = { "x-vercel-forwarded-for": "10.0.0.1" };
  if (o.cookie) headers.cookie = o.cookie;
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method, query: { aksi }, body: o.body ?? {}, headers } as never,
    res as never,
  );
  return res;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:00:00+07:00"));
  process.env.SESSION_SECRET = "x".repeat(40);
  tulis.length = 0;
  audit.length = 0;
  antrean = {};
  rows = { edition: [EDISI], event: EVENT_ROWS, percobaan: [{ n: 0 }] };
});
afterEach(() => vi.useRealTimers());

const KURSI = (division: string) => ({ division, isKoor: false, title: null });
const config = (ubah: (c: typeof HAK_BAWAAN) => void = () => {}) => {
  const c = structuredClone(HAK_BAWAAN);
  ubah(c);
  return c;
};
const badan = (c: typeof HAK_BAWAAN) => ({ semua: c.semua, peran: c.peran });
const tersimpan = (nilai: unknown) => {
  rows.pengaturan = [{ nilai, oleh: "101022300001", pada: new Date("2026-11-09T10:00:00Z") }];
};

describe("rights-config (read)", () => {
  it("shows any Panitia the default, and that only the Ketua and the Pencipta can change it", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("acara")];
    const r = await panggil("GET", "rights-config", { cookie: asistenCookie() });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ custom: false, canManage: false, by: null });
    expect(r.body.config).toEqual(HAK_BAWAAN);
  });
  it("is closed to an Asisten with no seat", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [];
    expect((await panggil("GET", "rights-config", { cookie: asistenCookie() })).code).toBe(403);
  });
  it("tells the Ketua and the Pencipta they can change it; not Akademik, not the Admin tier", async () => {
    for (const [tier, badges, seat, boleh] of [
      ["asisten", [], "ketua", true],
      ["asisten", ["pencipta"], null, true],
      ["asisten", [], "akademik", false],
      ["admin", [], null, false],
      ["admin", [], "admin", false],
    ] as const) {
      antrean.asisten = [[orang(tier, [...badges])]];
      rows.committee = seat ? [KURSI(seat)] : [];
      const r = await panggil("GET", "rights-config", { cookie: asistenCookie() });
      expect(r.body.canManage, `${tier} ${seat} ${badges}`).toBe(boleh);
    }
  });
  it("shows what the server really applies, a saved config and who saved it", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("ketua")];
    tersimpan(config((x) => (x.semua = true)));
    const r = await panggil("GET", "rights-config", { cookie: asistenCookie() });
    expect(r.body).toMatchObject({ custom: true, by: "101022300001" });
    expect((r.body.config as { semua: boolean }).semua).toBe(true);
  });
  it("falls back to the default when the saved row is junk", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("ketua")];
    tersimpan({ semua: "ya", peran: 7 });
    const r = await panggil("GET", "rights-config", { cookie: asistenCookie() });
    expect(r.body.config).toEqual(HAK_BAWAAN);
  });
});

describe("rights-save and rights-reset", () => {
  const simpan = (c = config((x) => (x.semua = true))) => ({
    body: badan(c),
    cookie: asistenCookie(),
  });

  it("lets the Ketua save, and leaves an audit line with before and after", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("ketua")];
    const c = config((x) => (x.semua = true));
    const r = await panggil("POST", "rights-save", simpan(c));
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, custom: true });
    const w = tulis.find((t) => t.tabel === "pengaturan");
    expect(w?.nilai).toMatchObject({ kunci: "rec_hak", nilai: c, diubahOleh: "101022300900" });
    expect(audit[0]).toMatchObject({ aksi: "rec_hak", isi: { after: c } });
  });
  it("lets the Pencipta save without a seat", async () => {
    antrean.asisten = [[orang("asisten", ["pencipta"])]];
    rows.committee = [];
    expect((await panggil("POST", "rights-save", simpan())).code).toBe(200);
  });
  it("refuses everyone else, the Admin tier and a seated Admin included, without a write", async () => {
    for (const [tier, seat] of [
      ["asisten", "akademik"],
      ["asisten", "admin"],
      ["asisten", "acara"],
      ["admin", null],
      ["admin", "admin"],
      ["asisten", null],
    ] as const) {
      antrean.asisten = [[orang(tier)]];
      rows.committee = seat ? [KURSI(seat)] : [];
      const r = await panggil("POST", "rights-save", simpan());
      expect(r.code, `${tier} ${seat}`).toBe(403);
      antrean.asisten = [[orang(tier)]];
      const del = await panggil("POST", "rights-reset", { cookie: asistenCookie() });
      expect(del.code, `reset ${tier} ${seat}`).toBe(403);
    }
    expect(tulis).toHaveLength(0);
  });
  it("refuses a body that is not a full config, without a write", async () => {
    const [kunci] = RIGHTS_KEYS;
    const lengkap = badan(config());
    const rusak: unknown[] = [
      {},
      { semua: "ya", peran: lengkap.peran },
      { semua: true },
      { semua: true, peran: [] },
      { semua: true, peran: { ...lengkap.peran, [kunci]: ["bos"] } },
      { semua: true, peran: { ...lengkap.peran, [kunci]: "ketua" } },
      { semua: true, peran: Object.fromEntries(Object.entries(lengkap.peran).slice(1)) },
    ];
    for (const body of rusak) {
      antrean.asisten = [[orang("asisten")]];
      rows.committee = [KURSI("ketua")];
      const r = await panggil("POST", "rights-save", { body, cookie: asistenCookie() });
      expect(r.code, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(tulis).toHaveLength(0);
  });
  it("removes duplicate roles when saving", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("ketua")];
    const c = config((x) => (x.peran.bank = ["akademik", "akademik", "tanpa"]));
    const r = await panggil("POST", "rights-save", simpan(c));
    expect((r.body.config as typeof c).peran.bank).toEqual(["akademik", "tanpa"]);
  });
  it("puts it back to the default by deleting the row, and audits the reset", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [KURSI("ketua")];
    tersimpan(config((x) => (x.semua = true)));
    const r = await panggil("POST", "rights-reset", { cookie: asistenCookie() });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ custom: false });
    expect(tulis.some((t) => t.op === "insert")).toBe(false);
    expect(audit[0]).toMatchObject({ aksi: "rec_hak", isi: { reset: true } });
  });
  it("needs an Asisten session", async () => {
    expect((await panggil("POST", "rights-save", { body: badan(config()) })).code).toBe(401);
    expect((await panggil("GET", "rights-config")).code).toBe(401);
  });
});

describe("what a saved config changes", () => {
  const lihatKandidat = async (seat: string | null) => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = seat ? [KURSI(seat)] : [];
    rows.candidate = [];
    return (await panggil("GET", "candidates", { cookie: asistenCookie() })).code;
  };

  it("keeps the PRD table while nothing is saved", async () => {
    expect(await lihatKandidat(null)).toBe(403);
    expect(await lihatKandidat("pdd")).toBe(200);
  });
  it("opens everything to an Asisten with no seat while the all-Asisten switch is on", async () => {
    tersimpan(config((x) => (x.semua = true)));
    expect(await lihatKandidat(null)).toBe(200);
  });
  it("keeps the matrix but ignores it while the switch is on, and uses it again when it goes off", async () => {
    tersimpan(config((x) => ((x.semua = true), (x.peran.candidates = []))));
    expect(await lihatKandidat("pdd")).toBe(200);
    tersimpan(config((x) => (x.peran.candidates = [])));
    expect(await lihatKandidat("pdd")).toBe(403);
  });
  it("gives a role a right it did not have, and takes one away", async () => {
    tersimpan(config((x) => (x.peran.candidates = ["tanpa", "acara"])));
    expect(await lihatKandidat(null)).toBe(200);
    expect(await lihatKandidat("acara")).toBe(200);
    expect(await lihatKandidat("pdd")).toBe(403);
  });
  it("never reduces the Pencipta or the Admin tier", async () => {
    tersimpan(config((x) => RIGHTS_KEYS.forEach((k) => (x.peran[k] = []))));
    antrean.asisten = [[orang("asisten", ["pencipta"])]];
    rows.committee = [];
    rows.candidate = [];
    expect((await panggil("GET", "candidates", { cookie: asistenCookie() })).code).toBe(200);
    antrean.asisten = [[orang("admin")]];
    expect((await panggil("GET", "candidates", { cookie: asistenCookie() })).code).toBe(200);
  });
  it("lets a seat be granted the Ketua seat right, which nobody had but hakPenuh", async () => {
    tersimpan(config((x) => (x.peran.seatKetua = ["ketua"])));
    antrean.asisten = [[orang("asisten")], []];
    rows.committee = [KURSI("ketua")];
    const r = await panggil("POST", "seat", {
      body: { nim: "101022300111", division: "ketua" },
      cookie: asistenCookie(),
    });
    expect(r.body).not.toMatchObject({ hak: "seatKetua" });
  });
});
