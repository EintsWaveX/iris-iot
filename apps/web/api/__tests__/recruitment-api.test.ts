/**
 * /api/recruitment through the real dispatcher: who may call what, what a
 * visitor and a Praktikan can never read, and the calendar's confirmation
 * rule. The database is a fake keyed by table; the SQL itself is proved on
 * the rig (rig/rec_api_probe.mjs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  pengaturan,
  praktikan,
  recCandidate,
  recCommittee,
  recDocument,
  recEdition,
  recEvent,
  recEventLog,
} from "../../src/lib/schema";
import { EVENT_SEED } from "../../src/lib/recruitment/seed";
import { DOC_REQUIRED } from "../../src/lib/recruitment/types";
import { buatTiketRek } from "../_lib/recruitment-unggah";

type Rows = Record<string, unknown[] | ((sel: unknown) => unknown[])>;
const tabelNama = new Map<unknown, string>([
  [asisten, "asisten"],
  [pengaturan, "pengaturan"],
  [praktikan, "praktikan"],
  [recCandidate, "candidate"],
  [recCommittee, "committee"],
  [recDocument, "document"],
  [recEdition, "edition"],
  [recEvent, "event"],
  [recEventLog, "eventlog"],
]);

let rows: Rows = {};
let cookie: Record<string, unknown> | null = null;
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(sel?: unknown): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy"]) p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = tabelNama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => {
    const r = rows[tabel];
    return ok(typeof r === "function" ? r(sel) : (r ?? []));
  };
  return p;
}

function tulisan(op: string, t: unknown) {
  const tabel = tabelNama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "onConflictDoUpdate"]) p[m] = () => p;
  p.values = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    return p;
  };
  p.set = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    return p;
  };
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => {
    const r = rows[tabel];
    if (op === "delete" && !tulis.some((w) => w.tabel === tabel && w.op === op))
      tulis.push({ op, tabel });
    return ok(typeof r === "function" ? r(undefined) : (r ?? []));
  };
  return p;
}

vi.mock("../../src/lib/db", () => {
  const db = {
    select: (sel?: unknown) => chain(sel),
    insert: (t: unknown) => tulisan("insert", t),
    update: (t: unknown) => tulisan("update", t),
    delete: (t: unknown) => tulisan("delete", t),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { getDb: () => db };
});
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_r: string, h: unknown) => h }));
// The in-IRIS sign-up and application, as they run once the Google Form is dropped (2026-10-25).
vi.mock("../../src/lib/recruitment/formulir", () => ({ FORMULIR: null }));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readSessionCookie: () => cookie,
  writeAudit: async () => undefined,
}));
// A candidate is signed in by their oprec account, apart from the practicum cookie.
let oprec: Record<string, unknown> | null = null;
vi.mock("../_lib/recruitment-akun", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sesiOprec: async () => oprec,
  wajibOprec: async (
    _q: unknown,
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => {
    if (!oprec) res.status(401).json({ ok: false, kode: "belum_masuk_oprec" });
    return oprec;
  },
}));

const { default: handler } = await import("../recruitment/[aksi]");

const SEMBUNYI = "x".repeat(40);
const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const EVENT_ROWS = EVENT_SEED.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}));
const BIODATA = {
  angkatan: 2025,
  kelas: "EL-48-01",
  phone: "081234567890",
  lineId: "raka_x",
  address: "Jl. Telekomunikasi No. 1, Bandung",
  motivation: "Mau belajar bareng",
};
const KANDIDAT = (nim = "101022300001", status = "applied") => ({
  id: 7,
  editionId: 1,
  nim,
  anggotaId: null,
  biodata: BIODATA,
  status,
  currentStage: "berkas",
  appliedAt: new Date("2026-10-26T03:00:00Z"),
  consentAt: new Date("2026-10-26T03:00:00Z"),
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
});
const ORANG = (nim: string, over: Record<string, unknown> = {}) => ({
  nim,
  kode: "ABC",
  nama: "Asisten Uji",
  tier: "asisten",
  divisi: "ADC",
  badges: [],
  hakOverride: {},
  status: "aktif",
  ...over,
});
const KURSI = (division: string, isKoor = false) => ({ division, isKoor, title: null });

const sebagaiAsisten = (nim = "101022300900") => {
  cookie = { role: "asisten", nim, nama: "Asisten Uji", exp: 9e9 };
  oprec = null;
};
/** Signed in with an oprec account (the practicum cookie never counts here). */
const sebagaiPraktikan = (nim = "101022300001") => {
  cookie = null;
  oprec = { role: "praktikan", nim, nama: "Raka", exp: 9e9 };
};
/** Only the practicum's Praktikan cookie: a visitor on the recruitment pages. */
const sebagaiPraktikumSaja = (nim = "101022300001") => {
  cookie = { role: "praktikan", nim, nama: "Raka", exp: 9e9 };
  oprec = null;
};

async function panggil(
  method: "GET" | "POST",
  aksi: string,
  o: { query?: Record<string, string>; body?: unknown } = {},
) {
  const res = {
    code: 200,
    statusCode: 200,
    body: undefined as unknown as Record<string, unknown>,
    headers: {} as Record<string, string>,
    headersSent: false,
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
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method, query: { aksi, ...o.query }, body: o.body ?? {}, headers: {} } as never,
    res as never,
  );
  return res;
}

const pada = (s: string) => vi.setSystemTime(new Date(`${s}+07:00`));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  pada("2026-10-28T12:00:00");
  process.env.SESSION_SECRET = SEMBUNYI;
  process.env.KONSOL_RELAY_URL = "wss://relay.test";
  process.env.KONSOL_RELAY_SECRET = "k".repeat(40);
  cookie = null;
  oprec = null;
  tulis.length = 0;
  rows = { edition: [EDISI], event: EVENT_ROWS };
});
afterEach(() => vi.useRealTimers());

describe("banner and edition are open to a visitor, with no names in them", () => {
  it("answers dates and a title", async () => {
    const r = await panggil("GET", "banner");
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      kind: "visitor",
      opens: "2026-10-25",
      daftarOpen: true,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/nim|nama|phone|Pleno|Cutting/i);
  });
  it("answers the edition with no rights", async () => {
    const r = await panggil("GET", "edition");
    expect(r.body).toMatchObject({ ok: true, viewer: "visitor", rights: null, seat: null });
  });
  it("answers none when no edition is live", async () => {
    rows.edition = [];
    const r = await panggil("GET", "banner");
    expect(r.body).toEqual({ ok: true, kind: "none", segera: false });
  });
});

describe("the calendar", () => {
  it("shows a visitor the public events and none of the internal ones", async () => {
    const r = await panggil("GET", "calendar");
    expect(r.code).toBe(200);
    const t = (r.body.events as { title: string }[]).map((e) => e.title);
    expect(t).toContain("Open Recruitment");
    expect(t).not.toContain("Pleno Tes Tulis");
    expect(t).not.toContain("Cutting Tes Tulis");
  });
  it("hides internal events from a Praktikan", async () => {
    sebagaiPraktikan();
    const r = await panggil("GET", "calendar");
    const t = (r.body.events as { title: string }[]).map((e) => e.title);
    expect(t).toContain("Open Recruitment");
    expect(t).not.toContain("Pleno Tes Tulis");
    expect(t).not.toContain("Tes Tulis & Program");
  });
  it("shows an Asisten who is not Panitia the public events only", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    const t = ((await panggil("GET", "calendar")).body.events as { title: string }[]).map(
      (e) => e.title,
    );
    expect(t).not.toContain("Cutting Tes Tulis");
  });
  it("shows the Panitia everything", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("acara")];
    const r = await panggil("GET", "calendar");
    expect(r.body.events).toHaveLength(EVENT_ROWS.length);
  });
});

describe("a Praktikan never reaches the Panitia's side", () => {
  it.each([
    ["GET", "candidates"],
    ["GET", "candidate"],
    ["GET", "committee"],
    ["POST", "review"],
    ["POST", "event-save"],
    ["POST", "event-move"],
    ["POST", "event-delete"],
    ["POST", "seat"],
    ["POST", "unseat"],
    ["POST", "account-reset"],
  ] as const)("%s %s is 403 with the practicum cookie, 401 with an oprec one", async (m, aksi) => {
    sebagaiPraktikumSaja();
    const opt = { query: { id: "7" }, body: { id: 7, nim: "101022300900" } };
    const r = await panggil(m, aksi, opt);
    expect(r.code).toBe(403);
    expect(r.body).toMatchObject({ ok: false, kode: "peran_salah" });
    sebagaiPraktikan();
    const o = await panggil(m, aksi, opt);
    expect(o.code).toBe(401);
    expect(o.body).toMatchObject({ ok: false, kode: "belum_masuk" });
  });
  it.each([
    ["GET", "candidates"],
    ["GET", "candidate"],
    ["POST", "review"],
    ["POST", "apply"],
    ["GET", "me"],
  ] as const)("%s %s is 401 for a visitor", async (m, aksi) => {
    const r = await panggil(m, aksi);
    expect(r.code).toBe(401);
  });
  it("keeps an Asisten with no seat out of the list", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    const r = await panggil("GET", "candidates");
    expect(r.code).toBe(403);
    expect(r.body).toMatchObject({ kode: "tanpa_hak", hak: "candidates" });
  });
  it("hands the Asisten pool to whoever may seat people, and to nobody else", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const ketua = await panggil("GET", "committee");
    expect(ketua.code).toBe(200);
    expect(ketua.body.pool).toBeDefined();
    rows.committee = [KURSI("akademik")];
    const biasa = await panggil("GET", "committee");
    expect(biasa.code).toBe(200);
    expect(biasa.body).not.toHaveProperty("pool");
  });
  it("keeps a stranger out of the committee list", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    expect((await panggil("GET", "committee")).code).toBe(403);
  });
});

describe("the candidate list and detail follow the documents right", () => {
  const detail = (cand: unknown) => (sel: unknown) =>
    sel && typeof sel === "object" && "k" in sel ? [{ k: cand, nama: "Raka" }] : [cand];

  it("shows every Panitia member the list, without contact details", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("pdd")];
    rows.candidate = [
      {
        id: 7,
        nim: "101022300001",
        nama: "Raka",
        status: "applied",
        stage: "berkas",
        appliedAt: new Date(),
        biodata: BIODATA,
      },
    ];
    const r = await panggil("GET", "candidates");
    expect(r.code).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).toContain("Raka");
    expect(text).not.toContain("081234567890");
    expect(text).not.toContain("raka_x");
    expect(text).not.toContain("Telekomunikasi");
  });
  it("gives Akademik the candidate without biodata or documents", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("akademik")];
    rows.candidate = detail(KANDIDAT());
    const r = await panggil("GET", "candidate", { query: { id: "7" } });
    expect(r.code).toBe(200);
    expect(r.body.biodata).toBeNull();
    expect(r.body.documents).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain("081234567890");
  });
  it("gives Admin the biodata and the documents", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    rows.candidate = detail(KANDIDAT());
    rows.document = [{ id: 3, kind: "cv", size: 10, uploadedAt: new Date(), note: null }];
    const r = await panggil("GET", "candidate", { query: { id: "7" } });
    expect(r.body.biodata).toMatchObject({ phone: "081234567890" });
    expect(r.body.documents).toHaveLength(1);
  });
  it("answers 404 for a candidate of no edition", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    rows.candidate = () => [];
    expect((await panggil("GET", "candidate", { query: { id: "99" } })).code).toBe(404);
  });
});

describe("me is the signed in NIM's own row", () => {
  it("returns nothing when the row read back belongs to another NIM", async () => {
    sebagaiPraktikan("101022300001");
    rows.candidate = [KANDIDAT("101022300777")];
    rows.document = [{ id: 3, kind: "cv", size: 10, uploadedAt: new Date(), note: null }];
    const r = await panggil("GET", "me");
    expect(r.code).toBe(200);
    expect(r.body.candidate).toBeNull();
    expect(r.body.documents).toEqual([]);
    expect(JSON.stringify(r.body)).not.toContain("101022300777");
  });
  it("returns the own row, with the ids of its own documents only", async () => {
    sebagaiPraktikan("101022300001");
    rows.candidate = [KANDIDAT("101022300001")];
    rows.document = [
      { id: 3, kind: "cv", size: 10, uploadedAt: new Date("2026-10-26T03:00:00Z"), note: null },
    ];
    const r = await panggil("GET", "me");
    expect(r.body.candidate).toMatchObject({ status: "applied", stage: "berkas" });
    // The id is what berkas needs to open it; berkas itself answers 404 for anyone else's.
    expect(r.body.documents).toEqual([
      { id: 3, kind: "cv", size: 10, uploadedAt: "2026-10-26T03:00:00.000Z", note: null },
    ]);
    expect(r.body.daftarOpen).toBe(true);
  });
});

describe("document reads (IDOR)", () => {
  const DOK = {
    kind: "cv",
    r2Key: "recruitment/1/101022300001/cv/" + "a".repeat(64) + ".pdf",
    nim: "101022300001",
    editionId: 1,
  };

  it("sends a Praktikan to their own file", async () => {
    sebagaiPraktikan("101022300001");
    rows.document = [DOK];
    const r = await panggil("GET", "berkas", { query: { id: "3" } });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toMatch(/^https:\/\/relay\.test\/tp\/berkas\?t=/);
  });
  it("makes another candidate's file look like no file", async () => {
    sebagaiPraktikan("101022300002");
    rows.document = [DOK];
    const r = await panggil("GET", "berkas", { query: { id: "3" } });
    expect(r.code).toBe(404);
    expect(r.headers.location).toBeUndefined();
  });
  it("refuses the Panitia without the documents right", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("acara")];
    rows.document = [DOK];
    const r = await panggil("GET", "berkas", { query: { id: "3" } });
    expect(r.code).toBe(403);
    expect(r.headers.location).toBeUndefined();
  });
  it("lets Admin read it", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    rows.document = [DOK];
    expect((await panggil("GET", "berkas", { query: { id: "3" } })).statusCode).toBe(302);
  });
  it("needs a session and a real id", async () => {
    expect((await panggil("GET", "berkas", { query: { id: "3" } })).code).toBe(401);
    sebagaiPraktikan();
    expect((await panggil("GET", "berkas", { query: { id: "abc" } })).code).toBe(400);
    rows.document = [];
    expect((await panggil("GET", "berkas", { query: { id: "3" } })).code).toBe(404);
  });
});

describe("applying", () => {
  const berkas = { kind: "cv", tiket: "x" };
  const sah = {
    biodata: BIODATA,
    docs: DOC_REQUIRED.map((kind) => ({ ...berkas, kind })),
    consent: true,
  };

  it("is closed outside the registration days", async () => {
    sebagaiPraktikan();
    pada("2026-11-05T12:00:00");
    const r = await panggil("POST", "apply", { body: sah });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("jendela_tutup");
  });
  it("closes at 00.00 WIB on 3 November", async () => {
    sebagaiPraktikan();
    rows.praktikan = [{ nim: "101022300001" }];
    pada("2026-11-02T23:59:00");
    expect((await panggil("POST", "apply", { body: sah })).body.kode).toBe("tiket_salah");
    pada("2026-11-03T00:00:00");
    expect((await panggil("POST", "apply", { body: sah })).body.kode).toBe("jendela_tutup");
  });
  it("needs the consent, a good form and the three documents", async () => {
    sebagaiPraktikan();
    expect(
      (await panggil("POST", "apply", { body: { ...sah, consent: false } })).body,
    ).toMatchObject({ kode: "data_salah", field: "consent" });
    expect(
      (await panggil("POST", "apply", { body: { ...sah, biodata: { ...BIODATA, phone: "1" } } }))
        .body,
    ).toMatchObject({ field: "phone" });
    expect(
      (await panggil("POST", "apply", { body: { ...sah, docs: sah.docs.slice(1) } })).body,
    ).toMatchObject({ field: "docs" });
    expect(
      (
        await panggil("POST", "apply", {
          body: { ...sah, docs: [...sah.docs.slice(1), sah.docs[1]] },
        })
      ).body,
    ).toMatchObject({ field: "docs" });
  });
  it("takes someone who is not on the Praktikan roster (batch 25 and 26)", async () => {
    sebagaiPraktikan("102022500001");
    rows.praktikan = [];
    expect((await panggil("POST", "apply", { body: sah })).body.kode).toBe("tiket_salah");
  });
  it("never takes the practicum cookie alone", async () => {
    sebagaiPraktikumSaja();
    rows.praktikan = [{ nim: "101022300001" }];
    for (const [m, aksi] of [
      ["GET", "me"],
      ["POST", "ticket"],
      ["POST", "apply"],
      ["POST", "document"],
      ["POST", "withdraw"],
      ["GET", "envelopes"],
      ["POST", "envelope-open"],
      ["POST", "attend"],
      ["POST", "slot-pick"],
      ["POST", "slot-change"],
    ] as const) {
      const r = await panggil(m, aksi, { body: sah });
      expect(r.code, aksi).toBe(401);
      expect(r.body.kode, aksi).toBe("belum_masuk_oprec");
    }
    expect((await panggil("GET", "slots")).code).toBe(401);
    expect((await panggil("GET", "berkas", { query: { id: "3" } })).code).toBe(401);
  });
  it("refuses a second application", async () => {
    sebagaiPraktikan();
    rows.praktikan = [{ nim: "101022300001" }];
    rows.candidate = [KANDIDAT("101022300001")];
    expect((await panggil("POST", "apply", { body: sah })).body.kode).toBe("sudah_daftar");
  });
  it("refuses a ticket that is not signed", async () => {
    sebagaiPraktikan();
    rows.praktikan = [{ nim: "101022300001" }];
    rows.candidate = [];
    const r = await panggil("POST", "apply", { body: sah });
    expect(r.code).toBe(400);
    expect(r.body).toMatchObject({ kode: "tiket_salah", kind: DOC_REQUIRED[0] });
    expect(tulis.filter((w) => w.tabel === "candidate")).toEqual([]);
  });
  it("refuses a ticket minted for another NIM", async () => {
    sebagaiPraktikan("101022300001");
    rows.praktikan = [{ nim: "101022300001" }];
    rows.candidate = [];
    const sha = "a".repeat(64);
    const milikLain = await buatTiketRek(SEMBUNYI, {
      k: `recruitment/1/101022300002/cv/${sha}.pdf`,
      n: 100,
      s: sha,
      h: 1,
      nim: "101022300002",
      ed: 1,
      kind: "cv",
    });
    const body = { ...sah, docs: sah.docs.map((d) => ({ ...d, tiket: milikLain })) };
    const r = await panggil("POST", "apply", { body });
    expect(r.body.kode).toBe("tiket_salah");
  });
});

describe("tickets and withdrawing", () => {
  const sha = "d".repeat(64);
  const param = { kind: "cv", ukuran: 2048, sha256: sha, halaman: 2 };

  it("hands a PUT address and a ticket for this NIM during Open", async () => {
    sebagaiPraktikan("101022300001");
    const r = await panggil("POST", "ticket", { body: param });
    expect(r.code).toBe(200);
    expect(r.body.sama).toBe(false);
    expect(String(r.body.url)).toMatch(/^https:\/\/relay\.test\/tp\/unggah\?t=/);
    const { bacaTiketRek } = await import("../_lib/recruitment-unggah");
    const t = await bacaTiketRek(r.body.tiket, SEMBUNYI);
    expect(t).toMatchObject({ nim: "101022300001", ed: 1, kind: "cv", n: 2048 });
    expect(t!.k).toBe(`recruitment/1/101022300001/cv/${sha}.pdf`);
  });
  it("refuses a ticket outside the registration days", async () => {
    sebagaiPraktikan();
    pada("2026-11-05T12:00:00");
    expect((await panggil("POST", "ticket", { body: param })).body.kode).toBe("jendela_tutup");
  });
  it("lets a candidate with a revision upload again after registration closed", async () => {
    sebagaiPraktikan();
    pada("2026-11-05T12:00:00");
    rows.candidate = [KANDIDAT("101022300001", "revision")];
    expect((await panggil("POST", "ticket", { body: param })).code).toBe(200);
  });
  it("refuses a file over 5 MB and a withdrawn candidate", async () => {
    sebagaiPraktikan();
    expect(
      (await panggil("POST", "ticket", { body: { ...param, ukuran: 6 * 1024 * 1024 } })).body.kode,
    ).toBe("terlalu_besar");
    rows.candidate = [KANDIDAT("101022300001", "withdrawn")];
    expect((await panggil("POST", "ticket", { body: param })).body.kode).toBe("status_salah");
  });
  it("confirms no document with a ticket made for another kind or NIM", async () => {
    sebagaiPraktikan("101022300001");
    rows.candidate = [KANDIDAT("101022300001")];
    const t = await buatTiketRek(SEMBUNYI, {
      k: `recruitment/1/101022300001/cv/${sha}.pdf`,
      n: 10,
      s: sha,
      h: 1,
      nim: "101022300001",
      ed: 1,
      kind: "cv",
    });
    expect(
      (await panggil("POST", "document", { body: { kind: "letter", tiket: t } })).body.kode,
    ).toBe("tiket_salah");
    sebagaiPraktikan("101022300002");
    rows.candidate = [KANDIDAT("101022300002")];
    expect((await panggil("POST", "document", { body: { kind: "cv", tiket: t } })).body.kode).toBe(
      "tiket_salah",
    );
  });
  it("withdraws an applied candidate and refuses it twice", async () => {
    sebagaiPraktikan("101022300001");
    rows.candidate = [KANDIDAT("101022300001")];
    const r = await panggil("POST", "withdraw");
    expect(r.body).toEqual({ ok: true, status: "withdrawn" });
    expect(tulis.some((w) => w.op === "update" && w.tabel === "candidate")).toBe(true);
    rows.candidate = [KANDIDAT("101022300001", "withdrawn")];
    expect((await panggil("POST", "withdraw")).body.kode).toBe("status_salah");
  });
});

describe("review", () => {
  it("needs the approve right: Akademik is refused, Admin is not", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("akademik")];
    expect((await panggil("POST", "review", { body: { id: 7, decision: "approve" } })).code).toBe(
      403,
    );
    rows.committee = [KURSI("admin")];
    expect(
      (await panggil("POST", "review", { body: { id: 7, decision: "bad" } })).body,
    ).toMatchObject({ kode: "data_salah", field: "decision" });
  });
  it("asks for a note with a revision", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    expect(
      (await panggil("POST", "review", { body: { id: 7, decision: "revision" } })).body,
    ).toMatchObject({ field: "note" });
  });
  it("bounces a candidate back with a note and records who", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    rows.candidate = [KANDIDAT()];
    const r = await panggil("POST", "review", {
      body: { id: 7, decision: "revision", note: "CV buram, unggah ulang" },
    });
    expect(r.body).toEqual({ ok: true, status: "revision" });
    expect(tulis.find((w) => w.tabel === "candidate")?.nilai).toMatchObject({
      status: "revision",
      reviewNote: "CV buram, unggah ulang",
      reviewedBy: "101022300900",
    });
  });
  it("will not approve a file set that is not complete", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("admin")];
    rows.candidate = [KANDIDAT()];
    rows.document = [];
    expect(
      (await panggil("POST", "review", { body: { id: 7, decision: "approve" } })).body.kode,
    ).toBe("berkas_kurang");
  });
});

describe("the calendar editor", () => {
  const EDIT = {
    kind: "test",
    title: "Tes Baru",
    startsOn: "2026-12-30",
    endsOn: "2026-12-31",
  };

  it("belongs to the Ketua and Acara", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    for (const d of ["akademik", "admin", "logistik", "pdd", "wakil"]) {
      rows.committee = [KURSI(d)];
      expect((await panggil("POST", "event-save", { body: EDIT })).code, d).toBe(403);
    }
    rows.committee = [KURSI("acara")];
    expect(
      (await panggil("POST", "event-save", { body: { ...EDIT, kind: "party" } })).body,
    ).toMatchObject({ kode: "data_salah", field: "kind" });
  });
  it("saves a new event in a stage that has not started without asking", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("acara")];
    const r = await panggil("POST", "event-save", { body: { ...EDIT, stage: "mengajar" } });
    expect(r.code).toBe(200);
    expect(r.body.logged).toBe(false);
    expect(tulis.some((w) => w.op === "insert" && w.tabel === "event")).toBe(true);
    expect(tulis.some((w) => w.tabel === "eventlog")).toBe(false);
  });
  it("asks to confirm moving an event whose stage has started, and logs it", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    pada("2026-11-18T12:00:00");
    const cutting = EVENT_ROWS.find((e) => e.title === "Cutting Tes Tulis")!;
    const geser = { id: cutting.id, startsOn: "2026-11-28", endsOn: "2026-11-29" };
    const tanya = await panggil("POST", "event-move", { body: geser });
    expect(tanya.code).toBe(409);
    expect(tanya.body).toMatchObject({
      kode: "perlu_konfirmasi",
      event: { title: "Cutting Tes Tulis" },
    });
    expect(tulis).toEqual([]);

    const jadi = await panggil("POST", "event-move", { body: { ...geser, confirm: true } });
    expect(jadi.code).toBe(200);
    expect(jadi.body.logged).toBe(true);
    expect(tulis.some((w) => w.op === "update" && w.tabel === "event")).toBe(true);
    expect(tulis.find((w) => w.tabel === "eventlog")?.nilai).toMatchObject({
      eventId: cutting.id,
      who: "101022300900",
    });
  });
  it("moves an event of a stage that has not started without a prompt", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const mengajar = EVENT_ROWS.find((e) => e.title === "Tes Mengajar")!;
    const r = await panggil("POST", "event-move", {
      body: { id: mengajar.id, startsOn: "2026-12-23", endsOn: "2026-12-25" },
    });
    expect(r.code).toBe(200);
    expect(r.body.logged).toBe(false);
  });
  it("asks to confirm deleting a started event", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const open = EVENT_ROWS.find((e) => e.title === "Open Recruitment")!;
    expect((await panggil("POST", "event-delete", { body: { id: open.id } })).body.kode).toBe(
      "perlu_konfirmasi",
    );
    expect(
      (await panggil("POST", "event-delete", { body: { id: open.id, confirm: true } })).body,
    ).toMatchObject({ ok: true, event: null, logged: true });
  });
  it("answers 404 for an event that does not exist", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    expect((await panggil("POST", "event-delete", { body: { id: 9999 } })).code).toBe(404);
  });
  it("refuses a bad move before touching anything", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const r = await panggil("POST", "event-move", {
      body: { id: 1, startsOn: "2026-12-05", endsOn: "2026-12-01" },
    });
    expect(r.body).toMatchObject({ kode: "data_salah", field: "endsOn" });
  });
});

describe("seating the Panitia", () => {
  it("lets the Ketua seat others but never the Ketua", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const r = await panggil("POST", "seat", { body: { nim: "101022300111", division: "ketua" } });
    expect(r.code).toBe(403);
    expect(r.body).toMatchObject({ hak: "seatKetua" });
  });
  it("refuses everyone but the Ketua the board, and Admin tier may seat the Ketua", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("akademik", true)];
    expect(
      (await panggil("POST", "seat", { body: { nim: "101022300111", division: "acara" } })).code,
    ).toBe(403);
    rows.asisten = [ORANG("101022300900", { tier: "admin", divisi: null })];
    rows.committee = [];
    // The target is looked up in the same fake table: an active Asisten.
    const r = await panggil("POST", "seat", { body: { nim: "101022300900", division: "ketua" } });
    expect(r.code).toBe(200);
    expect(tulis.find((w) => w.tabel === "committee")?.nilai).toMatchObject({
      division: "ketua",
      isKoor: false,
    });
  });
  it("refuses a seat for someone who is not an active Asisten", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900", { tier: "admin", divisi: null })];
    rows.committee = [];
    const first = ORANG("101022300900", { tier: "admin", divisi: null });
    rows.asisten = [{ ...first, status: "nonaktif" }];
    // The acting person is checked first and a deactivated Admin has no rights.
    expect(
      (await panggil("POST", "seat", { body: { nim: "101022300111", division: "acara" } })).code,
    ).toBe(403);
  });
  it("seats an Asisten on leave like any other, with their rights (user, 2026-10-23)", async () => {
    sebagaiAsisten();
    rows.asisten = [{ ...ORANG("101022300900", { tier: "admin", divisi: null }), status: "cuti" }];
    rows.committee = [];
    // The same fake row is the one acting and the one seated.
    const r = await panggil("POST", "seat", { body: { nim: "101022300900", division: "acara" } });
    expect(r.code).toBe(200);
    expect(tulis.find((w) => w.tabel === "committee")?.nilai).toMatchObject({
      division: "acara",
    });
  });
  it("checks the fields", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900", { tier: "admin", divisi: null })];
    expect(
      (await panggil("POST", "seat", { body: { nim: "../x", division: "acara" } })).body,
    ).toMatchObject({ field: "nim" });
    expect(
      (await panggil("POST", "seat", { body: { nim: "101022300111", division: "boss" } })).body,
    ).toMatchObject({ field: "division" });
    expect(
      (
        await panggil("POST", "seat", {
          body: { nim: "101022300111", division: "acara", title: "x".repeat(41) },
        })
      ).body,
    ).toMatchObject({ field: "title" });
  });
  it("lets only hakPenuh unseat the Ketua", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("ketua")];
    const r = await panggil("POST", "unseat", { body: { nim: "101022300111" } });
    expect(r.code).toBe(403);
  });
});

describe("Sembunyikan Oprec", () => {
  beforeEach(() => {
    rows.pengaturan = [{ nilai: true }];
    pada("2026-10-26T12:00:00"); // registration is open on the calendar
  });
  it("shows a visitor and a Praktikan nothing, even with registration open", async () => {
    for (const siapa of [() => (cookie = null), () => sebagaiPraktikan()]) {
      siapa();
      rows.praktikan = [{ nim: "101022300001" }];
      expect((await panggil("GET", "banner")).body).toEqual({
        ok: true,
        kind: "none",
        segera: false,
      });
      expect((await panggil("GET", "edition")).body).toMatchObject({ edition: null });
      expect((await panggil("GET", "calendar")).code).toBe(404);
      expect((await panggil("POST", "ticket", { body: {} })).code).toBe(404);
      expect((await panggil("POST", "apply", { body: {} })).code).toBe(404);
    }
    sebagaiPraktikan();
    expect((await panggil("GET", "me")).body).toMatchObject({ edition: null, candidate: null });
  });
  it("keeps the oprec account doors shut, so nobody learns an edition runs", async () => {
    cookie = null;
    const n = tulis.length;
    const akun = { nim: "103022500901", nama: "Ayu Kirana", sandi: "rahasia-oprec-25" };
    expect((await panggil("POST", "account-signup", { body: akun })).code).toBe(404);
    expect((await panggil("POST", "account-signin", { body: akun })).code).toBe(404);
    expect(tulis.length, "nothing written").toBe(n);
    sebagaiPraktikan();
    expect((await panggil("GET", "account")).body).toEqual({ ok: true, account: null });
  });
  it("leaves the Asisten everything, and tells them it is hidden", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("acara")];
    const e = await panggil("GET", "edition");
    expect(e.body).toMatchObject({ edition: { id: 1 }, hidden: true, canHide: false });
    expect((await panggil("GET", "calendar")).body.events).toHaveLength(EVENT_ROWS.length);
  });
  it("is shown when no row says otherwise", async () => {
    rows.pengaturan = [];
    expect((await panggil("GET", "banner")).body.kind).toBe("visitor");
  });
  it("only the Ketua and the full rights flip it", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    rows.committee = [KURSI("acara")];
    expect((await panggil("POST", "visibility", { body: { hidden: false } })).code).toBe(403);
    rows.committee = [KURSI("ketua")];
    expect((await panggil("POST", "visibility", { body: { hidden: "ya" } })).code).toBe(400);
    const r = await panggil("POST", "visibility", { body: { hidden: false } });
    expect(r.body).toEqual({ ok: true, hidden: false });
    expect(tulis.find((w) => w.tabel === "pengaturan")?.nilai).toMatchObject({
      kunci: "rec_sembunyi",
      nilai: false,
    });
    sebagaiPraktikan();
    expect((await panggil("POST", "visibility", { body: { hidden: false } })).code).toBe(404);
  });
});

describe("unknown actions and methods", () => {
  it("answers 404 for an action it does not have", async () => {
    sebagaiAsisten();
    rows.asisten = [ORANG("101022300900")];
    expect((await panggil("GET", "nope")).code).toBe(404);
    expect((await panggil("POST", "nope")).code).toBe(404);
  });
});
