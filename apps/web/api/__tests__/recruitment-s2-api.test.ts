/**
 * /api/recruitment, slice S2: Cutting and the envelope gate, QR attendance,
 * Pilih Jadwal. The database is a fake keyed by table, like
 * recruitment-api.test.ts; what the SQL itself must do (the row lock that
 * lets one of two racing candidates win the last seat, Auto Isi against real
 * counts) is proved on the rig by rec_s2_flows.mjs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  praktikan,
  recAttendance,
  recCandidate,
  recCommittee,
  recDocument,
  recEdition,
  recEvent,
  recEventLog,
  recSlot,
  recSlotAssignment,
  recSlotChange,
  recStageResult,
} from "../../src/lib/schema";
import { EVENT_SEED, PICK_SEED } from "../../src/lib/recruitment/seed";

type Rows = Record<string, unknown[] | ((sel: unknown) => unknown[])>;
const tabelNama = new Map<unknown, string>([
  [asisten, "asisten"],
  [praktikan, "praktikan"],
  [recCandidate, "candidate"],
  [recCommittee, "committee"],
  [recDocument, "document"],
  [recEdition, "edition"],
  [recEvent, "event"],
  [recEventLog, "eventlog"],
  [recStageResult, "result"],
  [recAttendance, "attendance"],
  [recSlot, "slot"],
  [recSlotAssignment, "assignment"],
  [recSlotChange, "change"],
]);

let rows: Rows = {};
let cookie: Record<string, unknown> | null = null;
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(sel?: unknown): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy", "for"])
    p[m] = () => p;
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
  for (const m of ["where", "onConflictDoUpdate", "onConflictDoNothing"]) p[m] = () => p;
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
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readSessionCookie: () => cookie,
  writeAudit: async () => undefined,
}));
// A candidate is signed in by their oprec account (2026-10-24), apart from the practicum cookie.
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
const { buatToken, bacaToken, kodeKetik } = await import("../_lib/recruitment-attendance");
const { periodAt } = await import("../../src/lib/recruitment/qr");

const SEMBUNYI = "x".repeat(40);
const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const SEMUA = [...EVENT_SEED, ...PICK_SEED];
const EVENT_ROWS = SEMUA.map((e, i) => ({
  ...e,
  id: i + 1,
  editionId: 1,
  updatedBy: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}));
const idAcara = (judul: string) => EVENT_ROWS.find((e) => e.title === judul)!.id;
const FIRST_MEET = idAcara("First Meet");
const TES = idAcara("Tes Tulis & Program");

const BIODATA = {
  angkatan: 2025,
  kelas: "EL-48-01",
  phone: "081234567890",
  lineId: "raka_x",
  address: "Jl. Telekomunikasi No. 1, Bandung",
  motivation: "Mau belajar bareng",
};
/** One row that answers a candidate lookup, the board's pool query and the list alike. */
const KANDIDAT = (id = 7, nim = "101022300001", status = "approved", stage = "berkas") => ({
  id,
  editionId: 1,
  nim,
  nama: `Calon ${id}`,
  anggotaId: null,
  biodata: BIODATA,
  status,
  stage,
  currentStage: stage,
  score: null,
  berkasScore: null,
  appliedAt: new Date("2026-10-26T03:00:00Z"),
  consentAt: new Date("2026-10-26T03:00:00Z"),
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
});
const HASIL = (over: Record<string, unknown> = {}) => ({
  id: 1,
  candidateId: 7,
  stage: "berkas",
  proposal: "lolos",
  proposedBy: "101022300900",
  note: null,
  locked: true,
  lockedBy: "101022300901",
  lockedAt: new Date("2026-11-10T10:00:00+07:00"),
  revealAt: new Date("2026-11-11T12:00:00+07:00"),
  openedAt: null,
  ...over,
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
const KURSI = (division: string) => ({ division, isKoor: false, title: null });
const SLOT = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  editionId: 1,
  stage: "tes_tulis",
  eventId: TES,
  room: `R${id}`,
  startsAt: new Date("2026-11-17T18:30:00+07:00"),
  endsAt: new Date("2026-11-17T21:00:00+07:00"),
  capacity: 3,
  ...over,
});

const sebagaiAsisten = (nim = "101022300900") => {
  cookie = { role: "asisten", nim, nama: "Asisten Uji", exp: 9e9 };
  oprec = null;
};
/** Signed in with an oprec account (the practicum cookie never counts here). */
const sebagaiPraktikan = (nim = "101022300001") => {
  cookie = null;
  oprec = { role: "praktikan", nim, nama: "Raka", exp: 9e9 };
};
const panitia = (division: string) => {
  sebagaiAsisten();
  rows.asisten = [ORANG("101022300900")];
  rows.committee = [KURSI(division)];
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
  pada("2026-11-11T13:00:00");
  process.env.SESSION_SECRET = SEMBUNYI;
  process.env.KONSOL_RELAY_URL = "wss://relay.test";
  process.env.KONSOL_RELAY_SECRET = "k".repeat(40);
  cookie = null;
  oprec = null;
  tulis.length = 0;
  rows = { edition: [EDISI], event: EVENT_ROWS };
});
afterEach(() => vi.useRealTimers());

describe("who may reach the Cutting board", () => {
  it("never answers a candidate, with or without a result", async () => {
    sebagaiPraktikan();
    rows.candidate = [KANDIDAT()];
    rows.result = [HASIL()];
    for (const aksi of ["results", "qr-events", "qr-token", "attendance"]) {
      const r = await panggil("GET", aksi, { query: { stage: "berkas", event: "1" } });
      expect(r.code, aksi).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(r.body), aksi).not.toMatch(/lolos|gagal|Calon/);
    }
    for (const aksi of [
      "propose",
      "lock",
      "unlock",
      "attend-manual",
      "slot-set",
      "slot-decide",
      "slot-autofill",
    ]) {
      const r = await panggil("POST", aksi, { body: { stage: "berkas", items: [] } });
      expect(r.code, aksi).toBeGreaterThanOrEqual(400);
    }
  });

  it("gives the board to the proposers and not to the candidate list readers", async () => {
    panitia("wakil");
    expect((await panggil("GET", "results", { query: { stage: "berkas" } })).code).toBe(403);
    panitia("pdd");
    rows.candidate = [KANDIDAT()];
    rows.result = [];
    expect((await panggil("GET", "results", { query: { stage: "berkas" } })).code).toBe(200);
  });

  it("lets only the Ketua lock or unlock", async () => {
    panitia("acara");
    for (const aksi of ["lock", "unlock"])
      expect((await panggil("POST", aksi, { body: { stage: "berkas" } })).code, aksi).toBe(403);
  });

  it("refuses a stage the journey has no Cutting for", async () => {
    panitia("ketua");
    expect(
      (await panggil("GET", "results", { query: { stage: "first_meet" } })).body,
    ).toMatchObject({ kode: "data_salah", field: "stage" });
  });
});

describe("proposing", () => {
  const pasang = () => {
    panitia("akademik");
    rows.candidate = [KANDIDAT(7), KANDIDAT(8, "101022300002")];
    rows.result = [];
  };

  it("records a proposal with who made it", async () => {
    pasang();
    const r = await panggil("POST", "propose", {
      body: { stage: "berkas", items: [{ id: 7, proposal: "lolos", note: "CV rapi" }] },
    });
    expect(r.body).toMatchObject({ ok: true, changed: 1, overwrote: [] });
    expect(tulis.find((w) => w.tabel === "result")?.nilai).toMatchObject({
      candidateId: 7,
      stage: "berkas",
      proposal: "lolos",
      proposedBy: "101022300900",
      note: "CV rapi",
    });
  });

  it("says whose proposal it replaced", async () => {
    pasang();
    rows.result = [
      HASIL({
        locked: false,
        lockedBy: null,
        revealAt: null,
        proposal: "gagal",
        proposedBy: "101022300777",
      }),
    ];
    rows.asisten = [{ ...ORANG("101022300900"), nim: "101022300777", kode: "RGA" }];
    const r = await panggil("POST", "propose", {
      body: { stage: "berkas", items: [{ id: 7, proposal: "lolos" }] },
    });
    expect(r.body.overwrote).toEqual([{ id: 7, by: "RGA" }]);
  });

  it("refuses everything once the stage is locked", async () => {
    pasang();
    rows.result = [HASIL(), HASIL({ id: 2, candidateId: 8 })];
    const r = await panggil("POST", "propose", {
      body: { stage: "berkas", items: [{ id: 7, proposal: "gagal" }] },
    });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("terkunci");
    expect(tulis.some((w) => w.tabel === "result")).toBe(false);
  });

  it("refuses a candidate who is not on the board and a malformed call", async () => {
    pasang();
    expect(
      (
        await panggil("POST", "propose", {
          body: { stage: "berkas", items: [{ id: 99, proposal: "lolos" }] },
        })
      ).code,
    ).toBe(404);
    for (const items of [
      [],
      [{ id: 7, proposal: "mungkin" }],
      [
        { id: 7, proposal: "lolos" },
        { id: 7, proposal: "gagal" },
      ],
    ])
      expect((await panggil("POST", "propose", { body: { stage: "berkas", items } })).code).toBe(
        400,
      );
  });
});

describe("locking and the reveal time", () => {
  const siap = (proposal: string | null = "lolos") => {
    panitia("ketua");
    rows.candidate = [KANDIDAT(7), KANDIDAT(8, "101022300002")];
    rows.result = [
      HASIL({ locked: false, lockedBy: null, revealAt: null, proposal }),
      HASIL({
        id: 2,
        candidateId: 8,
        locked: false,
        lockedBy: null,
        revealAt: null,
        proposal: "gagal",
      }),
    ];
  };

  it("needs a proposal for everyone", async () => {
    siap(null);
    const r = await panggil("POST", "lock", { body: { stage: "berkas" } });
    expect(r.code).toBe(409);
    expect(r.body).toMatchObject({ kode: "belum_lengkap", missing: 1 });
  });

  it("copies the reveal time from the Pengumuman, 12.00 WIB that day", async () => {
    siap();
    pada("2026-11-10T10:00:00");
    const r = await panggil("POST", "lock", { body: { stage: "berkas" } });
    expect(r.body).toMatchObject({ ok: true, locked: true });
    expect(r.body.revealAt).toBe(new Date("2026-11-11T12:00:00+07:00").toISOString());
    expect(tulis.find((w) => w.tabel === "result")?.nilai).toMatchObject({ locked: true });
  });

  it("lets the Ketua bring a rehearsal reveal forward but never into the past", async () => {
    siap();
    const dua = new Date(Date.now() + 120_000).toISOString();
    expect(
      (await panggil("POST", "lock", { body: { stage: "berkas", revealAt: dua } })).body.revealAt,
    ).toBe(dua);
    expect(
      (
        await panggil("POST", "lock", {
          body: { stage: "berkas", revealAt: "2026-01-01T00:00:00Z" },
        })
      ).body,
    ).toMatchObject({ kode: "data_salah", field: "revealAt" });
  });

  it("will not lock a stage that has no Pengumuman", async () => {
    siap();
    expect((await panggil("POST", "lock", { body: { stage: "tubes" } })).body.kode).toMatch(
      /tanpa_pengumuman|belum_lengkap/,
    );
  });

  it("unlocks only before the reveal", async () => {
    panitia("ketua");
    rows.candidate = [KANDIDAT(7)];
    rows.result = [HASIL()];
    pada("2026-11-11T11:59:59");
    expect((await panggil("POST", "unlock", { body: { stage: "berkas" } })).body).toMatchObject({
      ok: true,
      locked: false,
    });
    pada("2026-11-11T12:00:00");
    const r = await panggil("POST", "unlock", { body: { stage: "berkas" } });
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("lewat_waktu");
  });

  it("says so when there is nothing to unlock", async () => {
    panitia("ketua");
    rows.candidate = [KANDIDAT(7)];
    rows.result = [HASIL({ locked: false, lockedBy: null, revealAt: null })];
    expect((await panggil("POST", "unlock", { body: { stage: "berkas" } })).body.kode).toBe(
      "belum_dikunci",
    );
  });
});

describe("the envelope never shows early", () => {
  const dikunci = (revealAt: string, over: Record<string, unknown> = {}) => {
    sebagaiPraktikan();
    rows.candidate = [KANDIDAT()];
    rows.result = [HASIL({ revealAt: new Date(`${revealAt}+07:00`), ...over })];
  };

  it("lists a locked result as pending with no result in it before the time", async () => {
    dikunci("2026-11-11T12:00:00");
    pada("2026-11-11T11:59:59");
    const r = await panggil("GET", "envelopes");
    expect(r.body.envelopes).toEqual([]);
    expect(r.body.pending).toEqual([
      { stage: "berkas", revealAt: new Date("2026-11-11T12:00:00+07:00").toISOString() },
    ]);
    expect(JSON.stringify(r.body)).not.toMatch(/lolos|gagal/);
  });

  it("shows a sealed envelope from the exact instant, still carrying no result", async () => {
    dikunci("2026-11-11T12:00:00");
    pada("2026-11-11T12:00:00");
    const r = await panggil("GET", "envelopes");
    expect(r.body.envelopes).toMatchObject([{ stage: "berkas", opened: false, result: null }]);
    expect(JSON.stringify(r.body)).not.toMatch(/lolos|gagal/);
    expect((await panggil("GET", "me")).body.envelopes).toMatchObject([
      { opened: false, result: null },
    ]);
  });

  it("shows nothing for an unlocked proposal, however late", async () => {
    dikunci("2026-11-11T12:00:00", { locked: false });
    pada("2026-12-31T00:00:00");
    expect((await panggil("GET", "envelopes")).body).toMatchObject({ envelopes: [], pending: [] });
  });

  it("opens only after the time, and stamps it once", async () => {
    dikunci("2026-11-11T12:00:00");
    pada("2026-11-11T11:59:59");
    expect((await panggil("POST", "envelope-open", { body: { stage: "berkas" } })).code).toBe(404);
    expect(tulis.some((w) => w.tabel === "result")).toBe(false);
    pada("2026-11-11T12:00:05");
    const r = await panggil("POST", "envelope-open", { body: { stage: "berkas" } });
    expect(r.body).toMatchObject({ ok: true, stage: "berkas", result: "lolos" });
    expect(tulis.find((w) => w.tabel === "result")?.nilai).toHaveProperty("openedAt");
  });

  it("names the event after the announcement as next, not the announcement or registration", async () => {
    dikunci("2026-11-11T12:00:00");
    pada("2026-11-11T12:00:05");
    expect(
      (await panggil("POST", "envelope-open", { body: { stage: "berkas" } })).body.next,
    ).toMatchObject({ title: "First Meet" });
    // Registration stretched past the announcement still is not what comes next.
    rows.event = EVENT_ROWS.map((e) => (e.title === "Extend" ? { ...e, endsOn: "2026-11-30" } : e));
    expect(
      (await panggil("POST", "envelope-open", { body: { stage: "berkas" } })).body.next,
    ).toMatchObject({ title: "First Meet" });
  });

  it("does not stamp again when it is opened a second time", async () => {
    dikunci("2026-11-11T12:00:00", { openedAt: new Date("2026-11-11T12:01:00+07:00") });
    pada("2026-11-11T13:00:00");
    const r = await panggil("POST", "envelope-open", { body: { stage: "berkas" } });
    expect(r.body.openedAt).toBe(new Date("2026-11-11T12:01:00+07:00").toISOString());
    expect(tulis.some((w) => w.tabel === "result")).toBe(false);
  });

  it("holds the journey and the banner until the envelope is opened", async () => {
    dikunci("2026-11-11T12:00:00", { proposal: "gagal" });
    pada("2026-11-11T13:00:00");
    const me = (await panggil("GET", "me")).body.candidate as Record<string, unknown>;
    expect(me).toMatchObject({ status: "approved", stage: "berkas" });
    expect((await panggil("GET", "banner")).body).toMatchObject({
      kind: "candidate",
      envelope: true,
    });
    dikunci("2026-11-11T12:00:00", {
      proposal: "gagal",
      openedAt: new Date("2026-11-11T12:30:00+07:00"),
    });
    const dibuka = [rows.result as unknown[]][0] as unknown[];
    // The thank-you line asks for the latest opened Gagal's reveal time.
    rows.result = (sel) =>
      sel && "at" in (sel as object) ? [{ at: new Date("2026-11-11T12:00:00+07:00") }] : dibuka;
    expect(((await panggil("GET", "me")).body.candidate as Record<string, unknown>).status).toBe(
      "out",
    );
    expect((await panggil("GET", "banner")).body.kind).toBe("cut");
  });

  it("never lets one candidate open another's envelope", async () => {
    sebagaiPraktikan("101022300002");
    rows.candidate = [KANDIDAT(8, "101022300002")];
    rows.result = [];
    pada("2026-11-11T13:00:00");
    expect((await panggil("POST", "envelope-open", { body: { stage: "berkas" } })).code).toBe(404);
  });
});

describe("QR attendance", () => {
  const malam = () => pada("2026-11-12T19:00:00");
  const lolosBerkas = () => {
    sebagaiPraktikan();
    rows.candidate = [KANDIDAT()];
    rows.result = [HASIL()];
    rows.attendance = [];
  };
  const tokenKini = (eventId = FIRST_MEET) => buatToken(eventId, periodAt(Date.now()));

  it("signs tokens that nothing else can forge", () => {
    process.env.SESSION_SECRET = SEMBUNYI;
    const t = buatToken(5, 100);
    expect(bacaToken(t)).toEqual({ eventId: 5, period: 100 });
    expect(bacaToken(t.replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAA"))).toBeNull();
    expect(bacaToken("5.100")).toBeNull();
    expect(bacaToken("../etc")).toBeNull();
    expect(bacaToken(5)).toBeNull();
    // A token for another event does not verify as this one.
    expect(bacaToken(t.replace(/^5\./, "6."))).toBeNull();
    expect(kodeKetik(5, 100)).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(kodeKetik(5, 100)).not.toBe(kodeKetik(5, 101));
  });

  it("marks an eligible candidate present", async () => {
    malam();
    lolosBerkas();
    const r = await panggil("POST", "attend", { body: { token: tokenKini() } });
    expect(r.body).toMatchObject({ ok: true, sudah: false, event: { title: "First Meet" } });
    expect(tulis.find((w) => w.tabel === "attendance")?.nilai).toMatchObject({
      candidateId: 7,
      eventId: FIRST_MEET,
      via: "qr",
    });
  });

  it("answers sudah for a second scan and writes nothing more", async () => {
    malam();
    lolosBerkas();
    rows.attendance = [{ id: 1, candidateId: 7, eventId: FIRST_MEET, via: "qr" }];
    const r = await panggil("POST", "attend", { body: { token: tokenKini() } });
    expect(r.body).toMatchObject({ ok: true, sudah: true });
    expect(tulis.some((w) => w.tabel === "attendance")).toBe(false);
  });

  it("refuses a token from an older period, and accepts the one just before", async () => {
    malam();
    lolosBerkas();
    const p = periodAt(Date.now());
    const lama = await panggil("POST", "attend", { body: { token: buatToken(FIRST_MEET, p - 2) } });
    expect(lama.code).toBe(409);
    expect(lama.body.kode).toBe("qr_berganti");
    expect(
      (await panggil("POST", "attend", { body: { token: buatToken(FIRST_MEET, p - 1) } })).body.ok,
    ).toBe(true);
  });

  it("refuses a forged token", async () => {
    malam();
    lolosBerkas();
    expect(
      (
        await panggil("POST", "attend", {
          body: { token: `${FIRST_MEET}.${periodAt(Date.now())}.AAAAAAAAAAAAAAAA` },
        })
      ).body.kode,
    ).toBe("qr_berganti");
    expect(tulis.some((w) => w.tabel === "attendance")).toBe(false);
  });

  it("takes the typed code of this period", async () => {
    malam();
    lolosBerkas();
    const kode = kodeKetik(FIRST_MEET, periodAt(Date.now())).toLowerCase();
    expect(
      (await panggil("POST", "attend", { body: { code: `${kode.slice(0, 3)} ${kode.slice(3)}` } }))
        .body.ok,
    ).toBe(true);
    tulis.length = 0;
    expect((await panggil("POST", "attend", { body: { code: "AAAAAA" } })).body.kode).toBe(
      "qr_berganti",
    );
  });

  it("counts only a candidate whose stage includes the event", async () => {
    malam();
    lolosBerkas();
    rows.result = [];
    const r = await panggil("POST", "attend", { body: { token: tokenKini() } });
    expect(r.code).toBe(403);
    expect(r.body.kode).toBe("bukan_tahapmu");
    lolosBerkas();
    rows.result = [HASIL({ proposal: "gagal", openedAt: null })];
    expect((await panggil("POST", "attend", { body: { token: tokenKini() } })).body.kode).toBe(
      "bukan_tahapmu",
    );
    expect(tulis.some((w) => w.tabel === "attendance")).toBe(false);
  });

  it("refuses an event that is not running, and a non candidate", async () => {
    lolosBerkas();
    pada("2026-11-12T22:00:00");
    expect((await panggil("POST", "attend", { body: { token: tokenKini() } })).body.kode).toBe(
      "jendela_tutup",
    );
    sebagaiPraktikan("101022300055");
    rows.candidate = [];
    malam();
    expect((await panggil("POST", "attend", { body: { token: tokenKini() } })).code).toBe(404);
  });

  it("on a test evening counts only the evening the candidate holds a slot for", async () => {
    pada("2026-11-17T19:00:00");
    lolosBerkas();
    const hasilTes = [
      HASIL(),
      HASIL({ id: 2, stage: "tes_tulis", proposal: null, locked: false, revealAt: null }),
    ];
    rows.result = hasilTes;
    rows.assignment = [];
    const salah = await panggil("POST", "attend", { body: { token: tokenKini(TES) } });
    expect(salah.code).toBe(403);
    expect(salah.body.kode).toBe("bukan_jadwalmu");
    rows.assignment = [
      { c: 7, slotId: 1, eventId: TES, startsAt: new Date("2026-11-18T18:30:00+07:00") },
    ];
    expect((await panggil("POST", "attend", { body: { token: tokenKini(TES) } })).body.kode).toBe(
      "bukan_jadwalmu",
    );
    rows.assignment = [
      { c: 7, slotId: 1, eventId: TES, startsAt: new Date("2026-11-17T18:30:00+07:00") },
    ];
    expect((await panggil("POST", "attend", { body: { token: tokenKini(TES) } })).body.ok).toBe(
      true,
    );
  });

  it("gives the projector a token to Panitia with the right and to no one else", async () => {
    malam();
    panitia("acara");
    rows.candidate = [];
    const r = await panggil("GET", "qr-token", { query: { event: String(FIRST_MEET) } });
    expect(r.body).toMatchObject({ ok: true, event: { title: "First Meet" } });
    expect(bacaToken(r.body.token)).toMatchObject({ eventId: FIRST_MEET });
    expect(r.body.code).toBe(kodeKetik(FIRST_MEET, periodAt(Date.now())));
    panitia("akademik");
    expect((await panggil("GET", "qr-token", { query: { event: String(FIRST_MEET) } })).code).toBe(
      403,
    );
  });

  it("lists only the evenings people come to on the projector, not a pick window running at the same time", async () => {
    malam();
    panitia("acara");
    rows.candidate = [];
    const r = await panggil("GET", "qr-events");
    const lijst = (r.body as { events: { title: string }[] }).events;
    expect(lijst.map((e) => e.title)).toEqual(["First Meet"]);
    const pick = EVENT_ROWS.find((e) => e.kind === "pick")!;
    const t = await panggil("GET", "qr-token", { query: { event: String(pick.id) } });
    expect(t.body.kode).toBe("jendela_tutup");
  });

  it("will not issue a token for an event that is not running or is internal", async () => {
    panitia("ketua");
    rows.candidate = [];
    pada("2026-11-12T22:00:00");
    expect(
      (await panggil("GET", "qr-token", { query: { event: String(FIRST_MEET) } })).body.kode,
    ).toBe("jendela_tutup");
  });

  it("lets Admin mark by hand, and take only a hand mark back", async () => {
    malam();
    panitia("admin");
    rows.candidate = [KANDIDAT()];
    rows.attendance = [];
    const r = await panggil("POST", "attend-manual", {
      body: { id: 7, event: FIRST_MEET, reason: "HP mati" },
    });
    expect(r.body).toMatchObject({ ok: true, present: true });
    expect(tulis.find((w) => w.tabel === "attendance")?.nilai).toMatchObject({
      via: "manual",
      by: "101022300900",
      reason: "HP mati",
    });
    rows.attendance = [{ id: 1, candidateId: 7, eventId: FIRST_MEET, via: "qr" }];
    const batal = await panggil("POST", "attend-manual", {
      body: { id: 7, event: FIRST_MEET, undo: true },
    });
    expect(batal.code).toBe(409);
    expect(batal.body.kode).toBe("tidak_bisa_batal");
    rows.attendance = [{ id: 1, candidateId: 7, eventId: FIRST_MEET, via: "manual" }];
    expect(
      (await panggil("POST", "attend-manual", { body: { id: 7, event: FIRST_MEET, undo: true } }))
        .body.present,
    ).toBe(false);
  });
});

describe("Pilih Jadwal", () => {
  const lolos = () => [HASIL()];
  const peserta = () => {
    sebagaiPraktikan();
    rows.candidate = [KANDIDAT()];
    rows.result = lolos();
    rows.slot = [SLOT(1)];
    rows.assignment = (sel) => (sel && "n" in (sel as object) ? [{ n: 0 }] : []);
    rows.change = [];
  };
  const pick = (slotId = 1) => panggil("POST", "slot-pick", { body: { slotId } });

  it("takes a seat while the window is open", async () => {
    peserta();
    pada("2026-11-11T19:00:00");
    const r = await pick();
    expect(r.body).toMatchObject({ ok: true, slotId: 1 });
    expect(tulis.find((w) => w.tabel === "assignment")?.nilai).toMatchObject({
      slotId: 1,
      candidateId: 7,
      stage: "tes_tulis",
      via: "self",
    });
  });

  it("refuses before 19.00 and after the window", async () => {
    peserta();
    pada("2026-11-11T18:59:59");
    expect((await pick()).body.kode).toBe("jendela_tutup");
    pada("2026-11-15T00:00:00");
    const r = await pick();
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("jendela_tutup");
    expect(tulis.some((w) => w.tabel === "assignment")).toBe(false);
  });

  it("refuses a candidate who is not in the stage", async () => {
    peserta();
    pada("2026-11-11T19:30:00");
    rows.result = [];
    const r = await pick();
    expect(r.code).toBe(403);
    expect(r.body.kode).toBe("bukan_peserta");
    rows.result = [HASIL({ proposal: "gagal" })];
    expect((await pick()).body.kode).toBe("bukan_peserta");
  });

  it("refuses a full slot, and a second pick", async () => {
    peserta();
    pada("2026-11-11T19:30:00");
    rows.assignment = (sel) => (sel && "n" in (sel as object) ? [{ n: 3 }] : []);
    expect((await pick()).body.kode).toBe("penuh");
    peserta();
    rows.assignment = (sel) => (sel && "n" in (sel as object) ? [{ n: 0 }] : [{ id: 9 }]);
    pada("2026-11-11T19:30:00");
    expect((await pick()).body.kode).toBe("sudah_pilih");
  });

  it("refuses a slot that does not exist or sits in another stage", async () => {
    peserta();
    pada("2026-11-11T19:30:00");
    rows.slot = [];
    expect((await pick(9)).body.kode).toBe("slot_salah");
    // A slot of another stage is judged by that stage: this candidate is not in Wawancara.
    rows.slot = [SLOT(1, { stage: "wawancara" })];
    expect((await pick()).body.kode).toBe("bukan_peserta");
  });

  it("shows a candidate seat counts and never another candidate", async () => {
    peserta();
    pada("2026-11-12T10:00:00");
    rows.assignment = (sel) =>
      sel && "n" in (sel as object)
        ? [{ slotId: 1, n: 2 }]
        : [{ id: 5, slotId: 1, candidateId: 7, stage: "tes_tulis", via: "self", at: new Date() }];
    rows.slot = [SLOT(1), SLOT(2)];
    const r = await panggil("GET", "slots");
    const teks = JSON.stringify(r.body);
    expect(teks).not.toMatch(/Calon|101022300002|nim|nama/);
    expect(r.body.stages).toHaveLength(1);
    const st = (r.body.stages as Record<string, unknown>[])[0];
    expect(st).toMatchObject({ mine: { slotId: 1, via: "self" }, canChange: true });
    expect(st.window).toMatchObject({ open: true });
  });

  it("hides the stage from someone who is not in it", async () => {
    peserta();
    rows.result = [];
    pada("2026-11-12T10:00:00");
    expect((await panggil("GET", "slots")).body.stages).toEqual([]);
  });

  describe("a change request", () => {
    const sudahPilih = () => {
      peserta();
      // The fake answers every slot lookup with these rows, so the target comes first; the slot held comes through the assignment join.
      rows.slot = [
        SLOT(2, {
          startsAt: new Date("2026-11-18T18:30:00+07:00"),
          endsAt: new Date("2026-11-18T21:00:00+07:00"),
        }),
      ];
      rows.assignment = (sel) =>
        sel && "n" in (sel as object)
          ? [{ n: 0 }]
          : [
              {
                a: { id: 5, slotId: 1, candidateId: 7, stage: "tes_tulis" },
                slot: SLOT(1),
                id: 5,
                slotId: 1,
              },
            ];
    };
    const minta = (toSlot = 2, reason = "Bentrok dengan kuis lain") =>
      panggil("POST", "slot-change", { body: { toSlot, reason } });

    it("is recorded before H-1", async () => {
      sudahPilih();
      pada("2026-11-16T23:59:00");
      const r = await minta();
      expect(r.body).toMatchObject({ ok: true, status: "open" });
      expect(tulis.find((w) => w.tabel === "change")?.nilai).toMatchObject({
        candidateId: 7,
        fromSlot: 1,
        toSlot: 2,
      });
    });

    it("is refused from the start of the slot's own day", async () => {
      sudahPilih();
      pada("2026-11-17T00:00:00");
      const r = await minta();
      expect(r.code).toBe(409);
      expect(r.body.kode).toBe("lewat_batas");
      expect(tulis.some((w) => w.tabel === "change")).toBe(false);
    });

    it("is refused when one is already open", async () => {
      sudahPilih();
      pada("2026-11-14T10:00:00");
      rows.change = [{ id: 3, status: "open" }];
      expect((await minta()).body.kode).toBe("sudah_ada_permintaan");
    });

    it("needs a real reason and refuses the slot already held", async () => {
      sudahPilih();
      pada("2026-11-14T10:00:00");
      expect((await minta(2, "singkat")).body).toMatchObject({
        kode: "data_salah",
        field: "reason",
      });
      rows.slot = [SLOT(1)];
      expect((await minta(1)).body.kode).toBe("slot_sama");
    });

    it("is refused for a full target", async () => {
      sudahPilih();
      pada("2026-11-14T10:00:00");
      rows.assignment = (sel) =>
        sel && "n" in (sel as object)
          ? [{ n: 3 }]
          : [{ a: { id: 5, slotId: 1 }, slot: SLOT(1), id: 5, slotId: 1 }];
      expect((await minta()).body.kode).toBe("penuh");
    });

    it("can be withdrawn by the candidate", async () => {
      sudahPilih();
      rows.change = [{ id: 3, status: "open" }];
      const r = await panggil("POST", "slot-change", { body: { withdraw: true } });
      expect(r.body).toMatchObject({ ok: true, status: "withdrawn" });
    });
  });
});

describe("Plotting", () => {
  it("belongs to the Plotting right: Ketua, Akademik and Admin", async () => {
    for (const d of ["acara", "logistik", "pdd", "wakil"]) {
      panitia(d);
      expect((await panggil("GET", "slots", { query: { stage: "tes_tulis" } })).code, d).toBe(403);
      expect((await panggil("POST", "slot-set", { body: { op: "delete", id: 1 } })).code, d).toBe(
        403,
      );
    }
    for (const d of ["ketua", "akademik", "admin"]) {
      panitia(d);
      rows.slot = [];
      rows.candidate = [];
      rows.change = [];
      expect((await panggil("GET", "slots", { query: { stage: "tes_tulis" } })).code, d).toBe(200);
    }
  });

  it("will not set capacity below the seats taken, nor delete a slot with people in it", async () => {
    panitia("akademik");
    rows.slot = [SLOT(1)];
    rows.assignment = (sel) => (sel && "n" in (sel as object) ? [{ n: 2 }] : []);
    const bawah = await panggil("POST", "slot-set", { body: { op: "edit", id: 1, capacity: 1 } });
    expect(bawah.code).toBe(409);
    expect(bawah.body).toMatchObject({ kode: "slot_terisi", taken: 2 });
    expect(
      (await panggil("POST", "slot-set", { body: { op: "edit", id: 1, capacity: 2 } })).body.ok,
    ).toBe(true);
    expect((await panggil("POST", "slot-set", { body: { op: "delete", id: 1 } })).body.kode).toBe(
      "slot_terisi",
    );
  });

  it("creates a slot on the stage's test event and validates the form", async () => {
    panitia("akademik");
    rows.slot = [SLOT(9)];
    const ok = await panggil("POST", "slot-set", {
      body: {
        op: "create",
        stage: "tes_tulis",
        room: "TULT 301",
        startsAt: "2026-11-17T18:30:00+07:00",
        endsAt: "2026-11-17T21:00:00+07:00",
        capacity: 30,
      },
    });
    expect(ok.body.ok).toBe(true);
    expect(tulis.find((w) => w.tabel === "slot")?.nilai).toMatchObject({
      stage: "tes_tulis",
      eventId: TES,
      capacity: 30,
    });
    for (const salah of [
      {
        op: "create",
        stage: "tes_tulis",
        room: "",
        startsAt: "2026-11-17T18:30:00+07:00",
        endsAt: "2026-11-17T21:00:00+07:00",
        capacity: 3,
      },
      {
        op: "create",
        stage: "tes_tulis",
        room: "A",
        startsAt: "2026-11-17T21:00:00+07:00",
        endsAt: "2026-11-17T18:30:00+07:00",
        capacity: 3,
      },
      {
        op: "create",
        stage: "tes_tulis",
        room: "A",
        startsAt: "2026-11-17T18:30:00+07:00",
        endsAt: "2026-11-17T21:00:00+07:00",
        capacity: -1,
      },
      { op: "nope" },
    ])
      expect((await panggil("POST", "slot-set", { body: salah })).code).toBe(400);
  });

  it("moves anyone, and a full slot needs the over capacity confirmation", async () => {
    panitia("ketua");
    rows.candidate = [KANDIDAT()];
    rows.slot = [SLOT(1, { capacity: 1 })];
    rows.assignment = (sel) => (sel && "n" in (sel as object) ? [{ n: 1 }] : []);
    const penuh = await panggil("POST", "slot-set", {
      body: { op: "move", candidateId: 7, stage: "tes_tulis", toSlot: 1 },
    });
    expect(penuh.code).toBe(409);
    expect(penuh.body.kode).toBe("penuh");
    const lewat = await panggil("POST", "slot-set", {
      body: { op: "move", candidateId: 7, stage: "tes_tulis", toSlot: 1, over: true },
    });
    expect(lewat.body.ok).toBe(true);
    expect(tulis.find((w) => w.tabel === "assignment" && w.op === "insert")?.nilai).toMatchObject({
      via: "panitia",
      by: "101022300900",
    });
  });

  it("closes and extends the window through the calendar, logged", async () => {
    panitia("akademik");
    pada("2026-11-12T10:00:00");
    const tutup = await panggil("POST", "slot-set", {
      body: { op: "window", stage: "tes_tulis", mode: "close" },
    });
    expect(tutup.body).toMatchObject({ ok: true, endsOn: "2026-11-12", dayEnd: "10:00" });
    expect(tulis.some((w) => w.tabel === "eventlog")).toBe(true);
    const buka = await panggil("POST", "slot-set", {
      body: { op: "window", stage: "tes_tulis", mode: "extend" },
    });
    expect(buka.body).toMatchObject({ ok: true, endsOn: "2026-11-15", dayEnd: "23:59" });
  });

  it("will not close a window that has not opened", async () => {
    panitia("akademik");
    pada("2026-11-11T18:00:00");
    expect(
      (
        await panggil("POST", "slot-set", {
          body: { op: "window", stage: "tes_tulis", mode: "close" },
        })
      ).body.kode,
    ).toBe("jendela_tutup");
  });

  it("decides a request: declines with a note, and asks before going over capacity", async () => {
    panitia("admin");
    const permintaan = {
      m: { id: 3, candidateId: 7, stage: "tes_tulis", fromSlot: 1, toSlot: 2, status: "open" },
      edisi: 1,
    };
    rows.change = [permintaan];
    const tolakIni = await panggil("POST", "slot-decide", {
      body: { id: 3, approve: false, note: "Slot itu khusus kelas lain" },
    });
    expect(tolakIni.body).toMatchObject({ ok: true, status: "declined" });
    expect(tulis.find((w) => w.tabel === "change")?.nilai).toMatchObject({
      status: "declined",
      note: "Slot itu khusus kelas lain",
      decidedBy: "101022300900",
    });

    tulis.length = 0;
    rows.slot = [SLOT(2, { capacity: 1 })];
    rows.assignment = (sel) =>
      sel && "n" in (sel as object) ? [{ n: 1 }] : [{ id: 5, slotId: 1 }];
    const penuh = await panggil("POST", "slot-decide", { body: { id: 3, approve: true } });
    expect(penuh.code).toBe(409);
    expect(penuh.body.kode).toBe("penuh");
    const lewat = await panggil("POST", "slot-decide", {
      body: { id: 3, approve: true, over: true },
    });
    expect(lewat.body).toMatchObject({ ok: true, status: "approved" });
    expect(tulis.find((w) => w.tabel === "assignment")?.nilai).toMatchObject({
      slotId: 2,
      via: "panitia",
    });
  });

  it("will not decide a request that is already closed", async () => {
    panitia("admin");
    rows.change = [
      {
        m: {
          id: 3,
          candidateId: 7,
          stage: "tes_tulis",
          fromSlot: 1,
          toSlot: 2,
          status: "approved",
        },
        edisi: 1,
      },
    ];
    expect(
      (await panggil("POST", "slot-decide", { body: { id: 3, approve: false } })).body.kode,
    ).toBe("status_salah");
  });

  it("runs Auto Isi for those who did not pick, leaving picks alone", async () => {
    panitia("akademik");
    pada("2026-11-15T09:00:00");
    rows.candidate = [
      KANDIDAT(7, "101022300001", "approved"),
      KANDIDAT(8, "101022300002", "approved"),
    ];
    rows.result = [HASIL(), HASIL({ id: 2, candidateId: 8 })];
    rows.slot = [SLOT(1), SLOT(2)];
    rows.assignment = (sel) => {
      if (sel && "n" in (sel as object)) return [{ slotId: 1, n: 1 }];
      if (sel && "c" in (sel as object)) return [{ c: 7 }];
      return [];
    };
    const r = await panggil("POST", "slot-autofill", { body: { stage: "tes_tulis" } });
    expect(r.body).toMatchObject({ ok: true, placed: 1, left: 0 });
    const masuk = tulis.filter((w) => w.tabel === "assignment" && w.op === "insert");
    expect(masuk).toHaveLength(1);
    expect(masuk[0].nilai).toEqual([
      expect.objectContaining({ candidateId: 8, slotId: 2, via: "auto" }),
    ]);
  });

  it("gives the board to Panitia with names, and the candidate's list never carries them", async () => {
    panitia("akademik");
    pada("2026-11-12T10:00:00");
    rows.slot = [SLOT(1)];
    rows.candidate = [KANDIDAT()];
    rows.result = lolosHasil();
    rows.assignment = (sel) =>
      sel && "n" in (sel as object)
        ? [{ slotId: 1, n: 1 }]
        : [{ slotId: 1, candidateId: 7, via: "self", nim: "101022300001", nama: "Calon 7" }];
    rows.change = [];
    const r = await panggil("GET", "slots", { query: { stage: "tes_tulis" } });
    expect(r.body).toMatchObject({ ok: true, stage: "tes_tulis" });
    expect(JSON.stringify(r.body)).toContain("Calon 7");
  });
});

function lolosHasil() {
  return [HASIL()];
}
