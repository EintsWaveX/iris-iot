/**
 * Oprec accounts (2026-10-24) through the real dispatcher: the cookie is its
 * own (a practicum cookie never passes, nor the other way round), Reset Akun
 * signs every device out, a wrong password and an unknown NIM look the same,
 * and the lockout holds. The database is a fake keyed by table.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  percobaanMasuk,
  praktikan,
  recAccount,
  recCandidate,
  recCommittee,
  recEdition,
  recEvent,
} from "../../src/lib/schema";
import { EVENT_SEED } from "../../src/lib/recruitment/seed";
import { createSessionCookie, hashPassword } from "../../src/lib/auth";
import { cekAkunBaru, cekMasukOprec, cekNama } from "../../src/lib/recruitment/akun";

type Rows = Record<string, unknown[]>;
const tabelNama = new Map<unknown, string>([
  [asisten, "asisten"],
  [percobaanMasuk, "percobaan"],
  [praktikan, "praktikan"],
  [recAccount, "account"],
  [recCandidate, "candidate"],
  [recCommittee, "committee"],
  [recEdition, "edition"],
  [recEvent, "event"],
]);

let rows: Rows = {};
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy"]) p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = tabelNama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(rows[tabel] ?? []);
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
  writeAudit: async () => undefined,
}));

const { default: handler } = await import("../recruitment/[aksi]");
const { buatTokenOprec, bacaTokenOprec } = await import("../_lib/recruitment-akun");

const NIM = "102022500001";
const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const EVENT_ROWS = EVENT_SEED.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}));
let HASH = "";
let HASH_KLAIM = "";

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
const oprecCookie = (v = 1, nim = NIM) => `iris_oprec=${buatTokenOprec({ nim, nama: "Sari", v })}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:00:00+07:00"));
  process.env.SESSION_SECRET = "x".repeat(40);
  tulis.length = 0;
  rows = { edition: [EDISI], event: EVENT_ROWS, percobaan: [{ n: 0 }] };
});
afterEach(() => vi.useRealTimers());

describe("the checks", () => {
  it("takes a 10 or 12 digit NIM, a real name and 8 characters of password", () => {
    expect(cekAkunBaru({ nim: NIM, nama: "  Sari  Dewi ", sandi: "rahasia12" })).toEqual({
      ok: true,
      nim: NIM,
      nama: "Sari Dewi",
      sandi: "rahasia12",
    });
    expect(cekAkunBaru({ nim: "1103221234", nama: "Sari", sandi: "rahasia12" }).ok).toBe(true);
    expect(cekAkunBaru({ nim: "12345", nama: "Sari", sandi: "rahasia12" })).toMatchObject({
      field: "nim",
    });
    expect(cekAkunBaru({ nim: NIM, nama: "<b>x</b>", sandi: "rahasia12" })).toMatchObject({
      field: "nama",
    });
    expect(cekAkunBaru({ nim: NIM, nama: "Sari", sandi: "pendek" })).toMatchObject({
      field: "sandi",
    });
    expect(cekNama("Muhammad Al-Fatih O'Neil")).toBe("Muhammad Al-Fatih O'Neil");
    expect(cekNama("李小龙")).toBe("李小龙");
    expect(cekMasukOprec({ nim: NIM, sandi: "" })).toMatchObject({ field: "sandi" });
  });
});

describe("the cookie is its own", () => {
  it("reads back what it signed, and nothing a practicum cookie carries", () => {
    const t = buatTokenOprec({ nim: NIM, nama: "Sari", v: 2 });
    expect(bacaTokenOprec(t)).toMatchObject({ nim: NIM, v: 2 });
    expect(bacaTokenOprec(`${t.split(".")[0]}.AAAA`)).toBeNull();
    const praktikum = createSessionCookie({ role: "praktikan", nim: NIM, nama: "Sari" });
    expect(bacaTokenOprec(praktikum)).toBeNull();
  });
  it("is a candidate only while the account still has that versi", async () => {
    rows.account = [{ nama: "Sari", versi: 1, ada: "h" }];
    const ok = await panggil("GET", "account", { cookie: oprecCookie(1) });
    expect(ok.body.account).toEqual({ nim: NIM, nama: "Sari" });
    rows.account = [{ nama: "Sari", versi: 2, ada: "h" }];
    expect((await panggil("GET", "account", { cookie: oprecCookie(1) })).body.account).toBeNull();
    rows.account = [{ nama: "Sari", versi: 1, ada: null }];
    expect((await panggil("GET", "account", { cookie: oprecCookie(1) })).body.account).toBeNull();
  });
  it("a practicum cookie in the oprec slot is not a session", async () => {
    rows.account = [{ nama: "Sari", versi: 1, ada: "h" }];
    const praktikum = createSessionCookie({ role: "praktikan", nim: NIM, nama: "Sari" });
    const r = await panggil("GET", "me", { cookie: `iris_oprec=${praktikum}` });
    expect(r.code).toBe(401);
    expect(r.body.kode).toBe("belum_masuk_oprec");
  });
});

describe("signing up", () => {
  const sah = { nim: NIM, nama: "Sari Dewi", sandi: "rahasia12" };
  it("makes the account and signs in", async () => {
    const r = await panggil("POST", "account-signup", { body: sah });
    expect(r.code).toBe(200);
    expect(r.body.account).toEqual({ nim: NIM, nama: "Sari Dewi" });
    expect(r.headers["set-cookie"]).toMatch(/^iris_oprec=.+; Path=\/; HttpOnly; Secure/);
    const baru = tulis.find((w) => w.tabel === "account" && w.op === "insert")!.nilai as {
      passHash: string;
    };
    expect(baru.passHash).not.toContain("rahasia12");
    expect(tulis.some((w) => w.tabel === "percobaan")).toBe(true);
  });
  it("refuses a NIM that already has a password", async () => {
    rows.account = [{ nim: NIM, nama: "Sari", passHash: "h", versi: 1 }];
    const r = await panggil("POST", "account-signup", { body: sah });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("akun_ada");
  });
  it("after a reset, only the holder of Admin's claim code makes it again", async () => {
    HASH_KLAIM ||= hashPassword("ABCD2345");
    rows.account = [
      { nim: NIM, nama: "Orang Lain", passHash: null, klaimHash: HASH_KLAIM, versi: 3 },
    ];
    rows["account:update"] = [{ nim: NIM }];
    expect((await panggil("POST", "account-signup", { body: sah })).body.kode).toBe("perlu_klaim");
    expect(
      (await panggil("POST", "account-signup", { body: { ...sah, klaim: "ABCD2346" } })).body.kode,
    ).toBe("klaim_salah");
    const r = await panggil("POST", "account-signup", { body: { ...sah, klaim: " abcd2345 " } });
    expect(r.code).toBe(200);
    const t = bacaTokenOprec(r.headers["set-cookie"].split(";")[0].split("=")[1]);
    expect(t?.v).toBe(4);
    expect(tulis.find((w) => w.tabel === "account" && w.op === "update")?.nilai).toMatchObject({
      klaimHash: null,
    });
  });
  it("refuses an Asisten's NIM and a bad form", async () => {
    rows.asisten = [{ nim: NIM }];
    expect((await panggil("POST", "account-signup", { body: sah })).body.kode).toBe("nim_asisten");
    rows.asisten = [];
    expect(
      (await panggil("POST", "account-signup", { body: { ...sah, nim: "abc" } })).body,
    ).toMatchObject({ kode: "data_salah", field: "nim" });
  });
  it("stops when the address or the NIM failed too often", async () => {
    rows.percobaan = [{ n: 80 }];
    expect((await panggil("POST", "account-signup", { body: sah })).code).toBe(429);
  });
});

describe("signing in", () => {
  beforeEach(() => {
    HASH ||= hashPassword("rahasia12");
  });
  it("lets the right password in", async () => {
    rows.account = [{ nim: NIM, nama: "Sari", passHash: HASH, versi: 2 }];
    const r = await panggil("POST", "account-signin", { body: { nim: NIM, sandi: "rahasia12" } });
    expect(r.code).toBe(200);
    expect(bacaTokenOprec(r.headers["set-cookie"].split(";")[0].split("=")[1])?.v).toBe(2);
  });
  it("answers a wrong password and an unknown NIM the same way", async () => {
    rows.account = [{ nim: NIM, nama: "Sari", passHash: HASH, versi: 1 }];
    const salah = await panggil("POST", "account-signin", {
      body: { nim: NIM, sandi: "salah123" },
    });
    rows.account = [];
    const asing = await panggil("POST", "account-signin", {
      body: { nim: NIM, sandi: "rahasia12" },
    });
    expect([salah.code, salah.body]).toEqual([401, { ok: false, kode: "salah" }]);
    expect([asing.code, asing.body]).toEqual([401, { ok: false, kode: "salah" }]);
    expect(salah.headers["set-cookie"]).toBeUndefined();
  });
  it("a reset account cannot sign in", async () => {
    rows.account = [{ nim: NIM, nama: "Sari", passHash: null, versi: 2 }];
    const r = await panggil("POST", "account-signin", { body: { nim: NIM, sandi: "rahasia12" } });
    expect(r.code).toBe(401);
  });
  it("is locked after five misses", async () => {
    rows.percobaan = [{ n: 5 }];
    const r = await panggil("POST", "account-signin", { body: { nim: NIM, sandi: "rahasia12" } });
    expect(r.code).toBe(429);
    expect(r.body.kode).toBe("terlalu_sering");
  });
  it("signs out by clearing the cookie", async () => {
    const r = await panggil("POST", "account-signout");
    expect(r.headers["set-cookie"]).toMatch(/^iris_oprec=; .*Max-Age=0/);
  });
});

describe("Reset Akun", () => {
  const asistenCookie = () =>
    `iris_session=${createSessionCookie({ role: "asisten", nim: "101022300900", nama: "Uji" })}`;
  const ORANG = {
    nim: "101022300900",
    kode: "ABC",
    nama: "Uji",
    tier: "asisten",
    divisi: "ADC",
    badges: [],
    hakOverride: {},
    status: "aktif",
  };
  it("is for Admin and the Ketua", async () => {
    rows.asisten = [ORANG];
    rows.committee = [{ division: "acara", isKoor: false, title: null }];
    const r = await panggil("POST", "account-reset", {
      body: { nim: NIM },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(403);
    rows.committee = [{ division: "admin", isKoor: false, title: null }];
    rows["account:update"] = [{ nim: NIM }];
    const ok = await panggil("POST", "account-reset", {
      body: { nim: NIM },
      cookie: asistenCookie(),
    });
    expect(ok.code).toBe(200);
    expect(ok.body.klaim).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(tulis.find((w) => w.tabel === "account")?.nilai).toMatchObject({ passHash: null });
  });
});
