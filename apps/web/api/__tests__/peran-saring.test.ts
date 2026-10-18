/**
 * Who reads what (Phase 20): the Audit log, other people's trails and their
 * rights map go to Admins only, through the real dispatcher. The database
 * answers each query by the table it reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asisten } from "../../src/lib/schema";

let cookie: { nim: string; role: "asisten" | "praktikan" } | null = null;
const baris = new Map<unknown, unknown[]>();

function chain(): unknown {
  let tabel: unknown = null;
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy"])
    p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = t;
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(baris.get(tabel) ?? []);
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

const orang = (nim: string, tier: string, divisi: string | null, badges: string[] = []) => ({
  nim,
  kode: `K${nim.slice(-2)}`,
  nama: `Orang ${nim}`,
  tier,
  divisi,
  badges,
  hakOverride: { jadwal: true },
  status: "aktif",
  seelabsAkun: null,
  terakhirAktif: null,
  punyaSandi: false,
  sandiSejak: null,
});

const masukSebagai = (saya: ReturnType<typeof orang>) => {
  cookie = { nim: saya.nim, role: "asisten" };
  const lain = orang("1111111111", "asisten", "ADC");
  baris.set(asisten, [saya, lain]);
};

beforeEach(() => {
  baris.clear();
  cookie = null;
});

describe("the Audit log", () => {
  it("is refused to a plain Asisten, ADS and DEV", async () => {
    for (const saya of [
      orang("2222222222", "asisten", "ADC"),
      orang("2222222222", "asisten", "ADS"),
      orang("2222222222", "asisten", "ARM", ["dev"]),
    ]) {
      masukSebagai(saya);
      const r = await panggil("audit");
      expect(r.code).toBe(403);
      expect(r.body).toEqual({ ok: false, kode: "tanpa_hak", hak: "audit" });
    }
  });

  it("opens for an Admin", async () => {
    masukSebagai(orang("2222222222", "admin", null));
    const r = await panggil("audit");
    expect(r.code).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe("someone's trail", () => {
  it("is one's own for everyone, anyone's for an Admin", async () => {
    masukSebagai(orang("2222222222", "asisten", "ASO", ["dev"]));
    expect((await panggil("tim", { nim: "2222222222" })).body.ok).toBe(true);
    const lain = await panggil("tim", { nim: "1111111111" });
    expect(lain.code).toBe(403);
    expect(lain.body).toEqual({ ok: false, kode: "tanpa_hak", hak: "audit" });

    masukSebagai(orang("2222222222", "admin", null));
    expect((await panggil("tim", { nim: "1111111111" })).body.ok).toBe(true);
  });
});

describe("the Tim list", () => {
  type Baris = { nim: string; hak?: unknown; hakOverride?: unknown };

  it("keeps other people's rights and overrides from a plain Asisten", async () => {
    masukSebagai(orang("2222222222", "asisten", "ADS"));
    const r = await panggil("tim");
    const list = r.body.orang as Baris[];
    const saya = list.find((o) => o.nim === "2222222222")!;
    const lain = list.find((o) => o.nim === "1111111111")!;
    expect(saya.hak).toMatchObject({ hadir: true, jadwal: true });
    expect(saya.hakOverride).toEqual({ jadwal: true });
    expect(lain).not.toHaveProperty("hak");
    expect(lain).not.toHaveProperty("hakOverride");
    expect(lain).toMatchObject({ nim: "1111111111", tier: "asisten", divisi: "ADC" });
  });

  it("shows them to an Admin", async () => {
    masukSebagai(orang("2222222222", "admin", null));
    const lain = ((await panggil("tim")).body.orang as Baris[]).find(
      (o) => o.nim === "1111111111",
    )!;
    expect(lain.hakOverride).toEqual({ jadwal: true });
    expect(lain.hak).toMatchObject({ jadwal: true, audit: false });
  });
});
