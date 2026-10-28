/**
 * Editable oprec settings (settings.ts, recruitment-settings.ts): a Panitia
 * member reads them with their defaults, only the roles in the registry (or
 * hakPenuh) change one, a bad value is refused without a write, a reset
 * deletes the row, and every change leaves an audit line with before and
 * after. The database is a fake keyed by table.
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
import {
  SETTINGS,
  DOCS_DEFAULT,
  bolehUbah,
  cuttingFor,
  CUTTING_DEFAULT,
  envelopeKey,
  isiNama,
  wordsFor,
} from "../../src/lib/recruitment/settings";

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

/** The hakPenuh Asisten's own reads, then the "is this NIM an Asisten" check. */
function sebagai(tier: string, badges: string[] = []) {
  antrean.asisten = [[orang(tier, badges)], []];
  rows.committee = [];
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

describe("the registry", () => {
  it("accepts its own defaults and refuses junk", () => {
    expect(SETTINGS.docs.check(DOCS_DEFAULT)).toEqual(DOCS_DEFAULT);
    expect(SETTINGS.docs.check([])).toBeNull();
    expect(SETTINGS.docs.check([{ ...DOCS_DEFAULT[0], maxMb: 99 }])).toBeNull();
    expect(SETTINGS.docs.check([DOCS_DEFAULT[0], DOCS_DEFAULT[0]])).toBeNull();
    const mulai = { top: 40, minScore: 1800, targetMin: 50, targetMax: 70 };
    expect(SETTINGS.cutting.check({ tes_tulis: mulai })).toEqual({ tes_tulis: mulai });
    expect(SETTINGS.cutting.check({ tubes: mulai })).toBeNull();
    expect(SETTINGS.cutting.check({ berkas: { ...mulai, top: 0 } })).toBeNull();
    expect(
      SETTINGS.cutting.check({ berkas: { ...mulai, targetMin: 90, targetMax: 80 } }),
    ).toBeNull();
    expect(SETTINGS.words.check({ berkas: { id: { lolosTitle: "" } } })).toBeNull();
    expect(SETTINGS.words.check({ berkas: { id: { sebut: "x" } } })).toBeNull();
    expect(SETTINGS.words.check({ salah: { id: { lolosTitle: "x" } } })).toBeNull();
  });
  it("keeps only the wording an editor wrote, and says which envelope it is for", () => {
    const w = SETTINGS.words.check({
      tulis: { id: { lolosTitle: "Mantap!", gagalLine: "Sampai jumpa, {nama}." }, en: {} },
    });
    expect(w).toEqual({
      tulis: { id: { lolosTitle: "Mantap!", gagalLine: "Sampai jumpa, {nama}." } },
    });
    expect(wordsFor(w!, "tes_tulis", "id").lolosTitle).toBe("Mantap!");
    expect(wordsFor(w!, "tes_tulis", "en")).toEqual({});
    expect(wordsFor(w!, "berkas", "id")).toEqual({});
    expect(envelopeKey("first_meet")).toBeNull();
    expect(isiNama("Halo {nama}, {nama}!", "Sari")).toBe("Halo Sari, Sari!");
  });
  it("starts a Cutting from the saved numbers, else the 2026 ones, and knows only two stages", () => {
    expect(cuttingFor(undefined, "tes_tulis")).toEqual(CUTTING_DEFAULT.tes_tulis);
    const mulai = { top: 40, minScore: 1800, targetMin: 50, targetMax: 70 };
    expect(cuttingFor({ tes_tulis: mulai }, "tes_tulis")).toEqual(mulai);
    expect(cuttingFor({ tes_tulis: mulai }, "berkas")).toEqual(CUTTING_DEFAULT.berkas);
    expect(cuttingFor({}, "tubes")).toBeNull();
  });
  it("lets Ketua and Admin change the document list, Akademik not", () => {
    const seat = (division: string) => ({ penuh: false, kursi: { division } });
    expect(bolehUbah("docs", seat("admin"))).toBe(true);
    expect(bolehUbah("docs", seat("akademik"))).toBe(false);
    expect(bolehUbah("cutting", seat("akademik"))).toBe(true);
    expect(bolehUbah("cutting", { penuh: true, kursi: null })).toBe(true);
    expect(bolehUbah("cutting", null)).toBe(false);
  });
});

describe("settings", () => {
  it("lists every setting with its default for a Panitia member", async () => {
    sebagai("asisten");
    rows.committee = [{ division: "acara", isKoor: false, title: null }];
    const r = await panggil("GET", "settings", { cookie: asistenCookie() });
    expect(r.code).toBe(200);
    const list = r.body.settings as { key: string; custom: boolean; canEdit: boolean }[];
    expect(list.map((x) => x.key)).toEqual(["docs", "words", "cutting"]);
    expect(list.every((x) => !x.custom && !x.canEdit)).toBe(true);
  });
  it("is closed to an Asisten with no seat", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [];
    const r = await panggil("GET", "settings", { cookie: asistenCookie() });
    expect(r.code).toBe(403);
  });
  it("saves a Cutting start for Akademik and audits before and after", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "akademik", isKoor: false, title: null }];
    const value = { tes_tulis: { top: 40, minScore: 1800, targetMin: 30, targetMax: 50 } };
    const r = await panggil("POST", "setting-save", {
      body: { key: "cutting", value },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(200);
    expect(tulis.some((w) => w.tabel === "pengaturan" && w.op === "insert")).toBe(true);
    expect(audit[0]).toMatchObject({ aksi: "rec_setting", isi: { key: "cutting", after: value } });
  });
  it("refuses a division outside the roles, and a bad value, without a write", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "logistik", isKoor: false, title: null }];
    let r = await panggil("POST", "setting-save", {
      body: { key: "docs", value: DOCS_DEFAULT },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(403);
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "ketua", isKoor: false, title: null }];
    r = await panggil("POST", "setting-save", {
      body: { key: "docs", value: [] },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(400);
    expect(tulis).toHaveLength(0);
  });
  it("resets to the default by deleting the row", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "ketua", isKoor: false, title: null }];
    const r = await panggil("POST", "setting-reset", {
      body: { key: "docs" },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(200);
    expect(audit[0]).toMatchObject({ aksi: "rec_setting", isi: { key: "docs", reset: true } });
  });
});

describe("the document rules", () => {
  it("cekParamTiket honours the size limit of the kind", async () => {
    const { cekParamTiket } = await import("../_lib/recruitment-unggah");
    const body = { kind: "cv", ukuran: 2 * 1024 * 1024, sha256: "a".repeat(64) };
    expect(cekParamTiket(body).ok).toBe(true);
    expect(cekParamTiket(body, () => 1024 * 1024)).toEqual({ ok: false, kode: "terlalu_besar" });
  });
  it("aturanDokumen reads the saved list, else the 2026 defaults", async () => {
    const { aturanDokumen } = await import("../_lib/recruitment-settings");
    const { getDb } = await import("../../src/lib/db");
    const d = await aturanDokumen(getDb());
    expect(d.required).toEqual(["biodata", "cv", "vision", "khs", "ksm", "ktm"]);
    expect(d.semua).toContain("portofolio");
    expect(d.batas("cv")).toBe(5 * 1024 * 1024);
    rows.pengaturan = [
      {
        nilai: DOCS_DEFAULT.map((x) => (x.kind === "cv" ? { ...x, required: false, maxMb: 2 } : x)),
      },
    ];
    const e = await aturanDokumen(getDb());
    expect(e.required).not.toContain("cv");
    expect(e.batas("cv")).toBe(2 * 1024 * 1024);
  });
});
