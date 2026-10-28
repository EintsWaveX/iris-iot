/**
 * Tambah CaAs (2026-10-25) through the real dispatcher: only hakPenuh adds a
 * candidate, the account gets the password the Panitia typed (hashed, never
 * in the audit), a self-made account is not overwritten, a correction keeps
 * the password unless a new one comes, the PDFs go under the candidate's NIM,
 * and while the Google Form is the way in nobody signs up or applies
 * themselves. The database is a fake keyed by table; a table may answer a
 * queue of results, one per read.
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
} from "../../src/lib/schema";
import { EVENT_SEED } from "../../src/lib/recruitment/seed";
import { createSessionCookie, verifyPasswordHash } from "../../src/lib/auth";
import { cekBiodataFormulir } from "../../src/lib/recruitment/validate";

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
const { buatTiketRek } = await import("../_lib/recruitment-unggah");

const NIM = "102022500001";
const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const EVENT_ROWS = EVENT_SEED.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}));
const SHA = "c".repeat(64);
const BIODATA = {
  angkatan: 2025,
  prodi: "tt",
  kelas: "tt-49-03",
  phone: "0812 3456 7890",
  lineId: "sari.dewi",
  mkIot: true,
  praktikumIot: true,
};
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

describe("the form's answers", () => {
  it("take 2024 to 2026, TE, TT or TB, and ask the practicum of TE only", () => {
    expect(cekBiodataFormulir(BIODATA)).toEqual({
      ok: true,
      biodata: { ...BIODATA, kelas: "TT-49-03", phone: "081234567890", praktikumIot: null },
    });
    expect(cekBiodataFormulir({ ...BIODATA, angkatan: 2023 })).toMatchObject({ field: "angkatan" });
    expect(cekBiodataFormulir({ ...BIODATA, prodi: "ti" })).toMatchObject({ field: "prodi" });
    expect(cekBiodataFormulir({ ...BIODATA, mkIot: "ya" })).toMatchObject({ field: "mkIot" });
    expect(cekBiodataFormulir({ ...BIODATA, prodi: "te", praktikumIot: null })).toMatchObject({
      field: "praktikumIot",
    });
    expect(cekBiodataFormulir({ ...BIODATA, prodi: "te", kelas: "TE-48-01" })).toMatchObject({
      ok: true,
      biodata: { praktikumIot: true },
    });
    expect(cekBiodataFormulir({ ...BIODATA, phone: "12" })).toMatchObject({ field: "phone" });
  });
});

describe("candidate-add", () => {
  const body = { nim: NIM, nama: "Sari Dewi", sandi: "rahasia12", biodata: BIODATA };

  it("is for the Ketua and Admin seats and hakPenuh, not other divisions", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "logistik", isKoor: false, title: null }];
    const r = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(r.code).toBe(403);
    expect(tulis).toHaveLength(0);
  });
  it("needs an Asisten session, not an oprec one", async () => {
    const r = await panggil("POST", "candidate-add", { body });
    expect(r.code).toBe(401);
  });
  it("makes the account with the typed password and the candidate with the form's answers", async () => {
    sebagai("asisten", ["pencipta"]);
    rows["candidate:insert"] = [{ id: 7 }];
    const r = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(r.code).toBe(200);
    expect(r.body.candidate).toEqual({ id: 7, nim: NIM, nama: "Sari Dewi" });
    const akun = tulis.find((w) => w.tabel === "account")?.nilai as { passHash: string };
    expect(verifyPasswordHash("rahasia12", akun.passHash)).toBe(true);
    expect(tulis.find((w) => w.tabel === "candidate")?.nilai).toMatchObject({
      editionId: 1,
      nim: NIM,
      biodata: { prodi: "tt", kelas: "TT-49-03", praktikumIot: null },
    });
    expect(JSON.stringify(audit)).not.toContain("rahasia12");
    expect(audit[0]).toMatchObject({ aksi: "rec_kandidat_tambah", isi: { nim: NIM, id: 7 } });
  });
  it("works for the Admin tier too", async () => {
    sebagai("admin");
    rows["candidate:insert"] = [{ id: 8 }];
    const r = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(r.code).toBe(200);
  });
  it("needs a password of 8 or more for a new candidate", async () => {
    sebagai("admin");
    const r = await panggil("POST", "candidate-add", {
      body: { ...body, sandi: "pendek" },
      cookie: asistenCookie(),
    });
    expect(r.body).toMatchObject({ kode: "data_salah", field: "sandi" });
  });
  it("refuses an Asisten's NIM", async () => {
    antrean.asisten = [[orang("admin")], [{ nim: NIM }]];
    rows.committee = [];
    const r = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("nim_asisten");
  });
  it("does not add the same NIM twice, nor take over an account its owner made", async () => {
    sebagai("admin");
    rows.candidate = [{ id: 3, nim: NIM, biodata: BIODATA, status: "applied" }];
    const dua = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(dua.body).toMatchObject({ kode: "sudah_daftar", id: 3 });
    sebagai("admin");
    rows.candidate = [];
    rows.account = [{ nim: NIM, nama: "Sari", passHash: "h", versi: 1 }];
    const milik = await panggil("POST", "candidate-add", { body, cookie: asistenCookie() });
    expect(milik.body.kode).toBe("akun_ada");
    expect(tulis).toHaveLength(0);
  });
  it("corrects a candidate and keeps the password when none comes", async () => {
    sebagai("admin");
    rows.candidate = [
      { id: 3, nim: NIM, biodata: { ...BIODATA, address: "Jl. A" }, status: "applied" },
    ];
    rows.account = [{ nim: NIM, nama: "Sari", passHash: "h", versi: 1 }];
    const r = await panggil("POST", "candidate-add", {
      body: { ...body, sandi: "", ubah: true, biodata: { ...BIODATA, lineId: "baru" } },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(200);
    const akun = tulis.find((w) => w.tabel === "account")?.nilai as Record<string, unknown>;
    expect(akun).toEqual({ nama: "Sari Dewi" });
    expect(tulis.find((w) => w.tabel === "candidate")?.nilai).toMatchObject({
      biodata: { lineId: "baru", address: "Jl. A" },
    });
  });
  it("a new password on a correction signs every device out", async () => {
    sebagai("admin");
    rows.candidate = [{ id: 3, nim: NIM, biodata: BIODATA, status: "applied" }];
    rows.account = [{ nim: NIM, nama: "Sari", passHash: "h", versi: 1 }];
    await panggil("POST", "candidate-add", {
      body: { ...body, sandi: "barulagi12", ubah: true },
      cookie: asistenCookie(),
    });
    const akun = tulis.find((w) => w.tabel === "account")?.nilai as Record<string, unknown>;
    expect(verifyPasswordHash("barulagi12", akun.passHash as string)).toBe(true);
    expect(akun).toHaveProperty("versi");
    expect(akun.klaimHash).toBeNull();
  });
});

describe("the Panitia's uploads", () => {
  it("hand a ticket under the candidate's NIM, for the form's kinds only", async () => {
    antrean.asisten = [[orang("admin")]];
    rows.committee = [];
    rows.candidate = [{ id: 3, nim: NIM, status: "applied" }];
    const r = await panggil("POST", "candidate-ticket", {
      body: { id: 3, kind: "ktm", ukuran: 2048, sha256: SHA },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(200);
    expect(r.body.url).toContain(`recruitment/1/${NIM}/ktm/${SHA}.pdf`);
    antrean.asisten = [[orang("admin")]];
    const lama = await panggil("POST", "candidate-ticket", {
      body: { id: 3, kind: "letter", ukuran: 2048, sha256: SHA },
      cookie: asistenCookie(),
    });
    expect(lama.body.kode).toBe("format_salah");
  });
  it("are refused to a division without the documents right", async () => {
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "acara", isKoor: false, title: null }];
    const r = await panggil("POST", "candidate-ticket", {
      body: { id: 3, kind: "ktm", ukuran: 2048, sha256: SHA },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(403);
  });
  it("keep a checked PDF as the candidate's document and ask Admin to look again", async () => {
    antrean.asisten = [[orang("admin")]];
    rows.committee = [];
    rows.candidate = [{ id: 3, nim: NIM, status: "approved" }];
    rows["document:insert"] = [
      { id: 9, kind: "khs", size: 2048, uploadedAt: new Date(), note: null },
    ];
    const tiket = await buatTiketRek("x".repeat(40), {
      k: `recruitment/1/${NIM}/khs/${SHA}.pdf`,
      n: 2048,
      s: SHA,
      h: 1,
      nim: NIM,
      ed: 1,
      kind: "khs",
    });
    const r = await panggil("POST", "candidate-document", {
      body: { id: 3, kind: "khs", tiket },
      cookie: asistenCookie(),
    });
    expect(r.code).toBe(200);
    expect(r.body.status).toBe("applied");
    expect(r.body.document).toMatchObject({ id: 9, kind: "khs" });
  });
  it("never take another candidate's ticket", async () => {
    antrean.asisten = [[orang("admin")]];
    rows.committee = [];
    rows.candidate = [{ id: 3, nim: NIM, status: "applied" }];
    const tiket = await buatTiketRek("x".repeat(40), {
      k: `recruitment/1/102022500002/khs/${SHA}.pdf`,
      n: 2048,
      s: SHA,
      h: 1,
      nim: "102022500002",
      ed: 1,
      kind: "khs",
    });
    const r = await panggil("POST", "candidate-document", {
      body: { id: 3, kind: "khs", tiket },
      cookie: asistenCookie(),
    });
    expect(r.body.kode).toBe("tiket_salah");
  });
});

describe("while the Google Form is the way in", () => {
  it("nobody makes an oprec account themselves", async () => {
    rows.asisten = [];
    rows.account = [];
    const r = await panggil("POST", "account-signup", {
      body: { nim: NIM, nama: "Sari", sandi: "rahasia12" },
    });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("daftar_lewat_formulir");
    expect(r.body.url).toMatch(/^https:\/\/forms\.gle\//);
  });
  it("the edition tells hakPenuh, the Ketua and the Admin seat it may add, nobody else", async () => {
    antrean.asisten = [[orang("admin")]];
    rows.committee = [];
    const a = await panggil("GET", "edition", { cookie: asistenCookie() });
    expect(a.body.canAdd).toBe(true);
    for (const division of ["ketua", "admin"]) {
      antrean.asisten = [[orang("asisten")]];
      rows.committee = [{ division, isKoor: false, title: null }];
      const k = await panggil("GET", "edition", { cookie: asistenCookie() });
      expect(k.body.canAdd).toBe(true);
    }
    antrean.asisten = [[orang("asisten")]];
    rows.committee = [{ division: "acara", isKoor: false, title: null }];
    const b = await panggil("GET", "edition", { cookie: asistenCookie() });
    expect(b.body.canAdd).toBe(false);
  });
});
