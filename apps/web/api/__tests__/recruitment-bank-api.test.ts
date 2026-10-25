/**
 * /api/recruitment, S3: the question bank, the parts config and the
 * references (prompt 09). The database is a fake keyed by table, like
 * recruitment-room-api.test.ts; what the SQL itself must do (the version
 * guard, array_remove on the references, the running-room count) is proved
 * on the rig by rec_bank_api.mjs against real Postgres.
 *
 * What this file pins: who may call what (the `bank` right, and nobody else,
 * a candidate included), every refusal of question-save, the import's dry
 * run and apply, and that a seat reaches a reference or a picture only
 * while the draw and the running part say so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  recCandidate,
  recEdition,
  recExamConfig,
  recExamRoom,
  recPartRef,
  recQuestion,
  recQuestionLog,
  recReference,
} from "../../src/lib/schema";
import { DEFAULT_EXAM_CONFIG, type ExamConfig } from "../../src/lib/recruitment/exam-types";
import { newRoomState } from "../../src/lib/recruitment/room";
import { parseBank } from "../../src/lib/recruitment/bank-io";
import { readFileSync } from "node:fs";

process.env.SESSION_SECRET = "x".repeat(40);

type Rows = Record<string, unknown[] | ((sel: unknown) => unknown[])>;
const nama = new Map<unknown, string>([
  [asisten, "asisten"],
  [recCandidate, "candidate"],
  [recEdition, "edition"],
  [recExamConfig, "config"],
  [recExamRoom, "room"],
  [recPartRef, "partref"],
  [recQuestion, "question"],
  [recQuestionLog, "log"],
  [recReference, "reference"],
]);

let rows: Rows = {};
let kalah = 0;
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(sel?: unknown): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy", "for"])
    p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = nama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => {
    const r = rows[tabel];
    return ok(typeof r === "function" ? r(sel) : (r ?? []));
  };
  return p;
}

function tulisan(op: string, t: unknown) {
  const tabel = nama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "onConflictDoUpdate", "onConflictDoNothing", "for"]) p[m] = () => p;
  let terakhir: unknown = null;
  p.values = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    terakhir = nilai;
    return p;
  };
  p.set = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    terakhir = nilai;
    return p;
  };
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => {
    // Another editor saved first: the version guard matches nothing.
    if (op === "update" && tabel === "question" && kalah > 0) {
      kalah--;
      return ok([]);
    }
    if (op === "delete" && !tulis.some((w) => w.tabel === tabel && w.op === op))
      tulis.push({ op, tabel });
    if (op === "insert" && terakhir && !Array.isArray(terakhir))
      return ok([{ ...BARIS(), id: 99, ...(terakhir as object) }]);
    if (op === "update" && terakhir)
      return ok([
        { ...BARIS(), ...((rows.question as unknown[])[0] as object), ...(terakhir as object) },
      ]);
    const r = rows[tabel];
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
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => undefined,
}));

const SEMUA_TIDAK = Object.fromEntries(
  [
    "calendar",
    "board",
    "seatKetua",
    "candidates",
    "documents",
    "approve",
    "bank",
    "plotting",
    "plotPengawas",
    "cuttingPropose",
    "cuttingLock",
    "attendance",
    "kitLoans",
    "accept",
  ].map((k) => [k, false]),
);
const pelaku = (hak: Record<string, boolean> = {}) => ({
  orang: { status: "aktif", badges: [] },
  kursi: null,
  hak: { ...SEMUA_TIDAK, ...hak },
  penuh: false,
});
let pelakuNim: Record<string, ReturnType<typeof pelaku> | null> = {};
vi.mock("../_lib/recruitment-rights", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  muatPelaku: async (_db: unknown, _e: number, nim: string) => pelakuNim[nim] ?? null,
}));

let cfg: ExamConfig = DEFAULT_EXAM_CONFIG;
vi.mock("../_lib/recruitment-room", () => ({ muatConfig: async () => cfg }));

type Kursi = { seat: unknown; room: unknown };
let kursi: Kursi = { seat: null, room: null };
vi.mock("../_lib/recruitment-seat", () => ({ muatKursiSendiri: async () => kursi }));

const { handleBank, dep } = await import("../_lib/recruitment-bank");

const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const sesi = (nim: string, role: "asisten" | "praktikan" = "asisten") => ({
  role,
  nim,
  nama: nim,
  exp: 9e9,
});

const BARIS = () => ({
  id: 5,
  editionId: 1,
  part: "logika",
  lang: "cpp",
  format: "single",
  title: "Soal lama",
  body: {
    prompt: "Berapa?",
    options: [
      { id: "aaa111", text: "1" },
      { id: "bbb222", text: "2" },
    ],
    shuffle: true,
  },
  answer: { correct: "aaa111" },
  refs: [] as number[],
  status: "ready",
  sample: false,
  version: 3,
  shownAt: null as Date | null,
  voidedAt: null as Date | null,
  voidedBy: null,
  voidNote: null,
  createdBy: "AKD",
  updatedBy: "AKD",
  updatedAt: new Date("2026-10-25T00:00:00Z"),
});

const masuk = (o: Record<string, unknown> = {}) => ({
  part: "logika",
  lang: "cpp",
  format: "single",
  title: "Soal baru",
  status: "draft",
  body: {
    prompt: "Berapa?",
    options: [
      { id: "ccc333", text: "1" },
      { id: "ddd444", text: "2" },
    ],
    shuffle: true,
  },
  answer: { correct: "ccc333" },
  refs: [],
  ...o,
});

interface Hasil {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  teks: string;
}
function jalan(
  aksi: string,
  s: ReturnType<typeof sesi>,
  body: Record<string, unknown> | null,
  query: Record<string, string> = {},
): Promise<Hasil> {
  const out: Hasil = { status: 0, body: {}, headers: {}, teks: "" };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(k: string, v: string) {
      out.headers[k] = v;
    },
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
    },
    end(t?: string) {
      out.teks = t ?? "";
    },
  };
  const req = {
    method: body === null ? "GET" : "POST",
    query: { aksi, ...query },
    headers: {},
    body: body ?? {},
  };
  return handleBank(req as never, res as never, s as never).then(() => out);
}

const AKD = sesi("AKD");
let berjalan = false;

beforeEach(() => {
  kalah = 0;
  berjalan = false;
  tulis.length = 0;
  cfg = DEFAULT_EXAM_CONFIG;
  kursi = { seat: null, room: null };
  pelakuNim = {
    AKD: pelaku({ bank: true }),
    N1: pelaku({ candidates: true, plotting: true }),
  };
  rows = {
    edition: [EDISI],
    config: [{ lockedAt: null }],
    room: (sel) => (sel && "n" in (sel as object) ? [{ n: berjalan ? 1 : 0 }] : []),
    question: [BARIS()],
    reference: [],
    log: [],
    partref: [],
  };
  dep.simpanSiap = () => true;
  dep.kepala = async () => ({ ada: true });
});

/* ---------------------------------------------------------------- rights */

describe("who may reach the bank", () => {
  const SEMUA_ASISTEN: [string, Record<string, unknown> | null][] = [
    ["exam-config", null],
    ["exam-config-save", { config: DEFAULT_EXAM_CONFIG }],
    ["questions", null],
    ["question", null],
    ["question-save", masuk()],
    ["question-delete", { id: 5 }],
    ["bank-import", { text: "", dry: true }],
    ["bank-export", null],
    ["bank-seed", {}],
    ["media-ticket", { mime: "image/png", size: 100, sha256: "a".repeat(64) }],
    ["references", null],
    ["reference-add", { url: "https://example.org/" }],
    ["reference-refetch", { id: 1 }],
    ["reference-upload", { html: "<p>x</p>" }],
    ["reference-delete", { id: 1 }],
    ["reference-attach", { id: 1, part: "logika", on: true }],
  ];

  it("an Asisten without the bank right gets 403 on every action", async () => {
    for (const [aksi, body] of SEMUA_ASISTEN) {
      const r = await jalan(aksi, sesi("N1"), body, { id: "5" });
      expect(r.status, aksi).toBe(403);
      expect(r.body.kode, aksi).toBe("tanpa_hak");
    }
    expect(tulis).toEqual([]);
  });

  it("someone who is not on the committee gets 403 too", async () => {
    for (const [aksi, body] of SEMUA_ASISTEN) {
      const r = await jalan(aksi, sesi("ORANG"), body, { id: "5" });
      expect(r.status, aksi).toBe(403);
    }
  });

  it("a candidate gets 403 on every action but the two reads a seat may make", async () => {
    for (const [aksi, body] of SEMUA_ASISTEN) {
      const r = await jalan(aksi, sesi("1101200001", "praktikan"), body, { id: "5" });
      expect(r.status, aksi).toBe(403);
      expect(JSON.stringify(r.body), aksi).not.toContain("Berapa?");
    }
    expect(tulis).toEqual([]);
  });

  it("the bank right opens the list, and the list carries no key", async () => {
    const r = await jalan("questions", AKD, null);
    expect(r.status).toBe(200);
    const q = (r.body.questions as Record<string, unknown>[])[0];
    expect(q.title).toBe("Soal lama");
    expect(q).not.toHaveProperty("answer");
    expect(q).not.toHaveProperty("body");
  });
});

/* ----------------------------------------------------------- the config */

describe("exam-config", () => {
  it("answers the config, whether it is locked and the pools", async () => {
    rows.question = [
      { part: "logika", lang: "cpp", status: "ready", sample: true, voided: false },
      { part: "logika", lang: "cpp", status: "draft", sample: false, voided: false },
    ];
    const r = await jalan("exam-config", AKD, null);
    expect(r.status).toBe(200);
    expect(r.body.locked).toBe(false);
    const logika = (
      r.body.pools as Record<string, { lang: string; ready: number; draft: number; seed: number }[]>
    ).logika;
    expect(logika.find((c) => c.lang === "cpp")).toMatchObject({ ready: 1, draft: 1, seed: 1 });
  });

  it("saves a valid change and refuses an invalid one with the field errors", async () => {
    const ok = structuredClone(DEFAULT_EXAM_CONFIG);
    ok.parts.logika.minutes = 20;
    const r = await jalan("exam-config-save", AKD, { config: ok });
    expect(r.status).toBe(200);
    expect(tulis.some((w) => w.tabel === "config" && w.op === "update")).toBe(true);

    tulis.length = 0;
    const bad = structuredClone(DEFAULT_EXAM_CONFIG);
    bad.parts.logika.minutes = 0;
    const b = await jalan("exam-config-save", AKD, { config: bad });
    expect(b.status).toBe(400);
    expect(b.body.kode).toBe("format_salah");
    expect(b.body.errors).toBeTruthy();
    expect(tulis).toEqual([]);
  });

  it("after the first real Start only the budget may change", async () => {
    rows.config = [{ lockedAt: new Date() }];
    const budget = structuredClone(DEFAULT_EXAM_CONFIG);
    budget.budgetMin = 130;
    expect((await jalan("exam-config-save", AKD, { config: budget })).status).toBe(200);
    tulis.length = 0;
    const other = structuredClone(DEFAULT_EXAM_CONFIG);
    other.parts.fitb.minutes = 25;
    const r = await jalan("exam-config-save", AKD, { config: other });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("terkunci");
    expect(tulis).toEqual([]);
  });
});

/* ------------------------------------------------------------ save rules */

describe("question-save", () => {
  it("creates a question and logs it", async () => {
    const r = await jalan("question-save", AKD, masuk());
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe("create");
    const ins = tulis.find((w) => w.tabel === "question" && w.op === "insert")!;
    expect(ins.nilai).toMatchObject({
      title: "Soal baru",
      createdBy: "AKD",
      sample: false,
      editionId: 1,
    });
    expect(tulis.some((w) => w.tabel === "log" && w.op === "insert")).toBe(true);
  });

  it("refuses a wrong shape or key with the field errors, and writes nothing", async () => {
    const r = await jalan("question-save", AKD, masuk({ answer: { correct: "zzz999" } }));
    expect(r.status).toBe(400);
    expect(r.body.kode).toBe("format_salah");
    expect(JSON.stringify(r.body.errors)).toContain("kunci_salah");
    for (const bad of [
      masuk({ body: "x" }),
      masuk({ format: "esai" }),
      masuk({ part: "nilai" }),
      masuk({ title: "  " }),
      masuk({ status: "siap" }),
      masuk({ body: { ...masuk().body, prompt: "" } }),
    ]) {
      const b = await jalan("question-save", AKD, bad);
      expect(b.status, JSON.stringify(bad)).toBe(400);
      expect(b.body.kode).toBe("format_salah");
    }
    expect(tulis).toEqual([]);
  });

  it("takes only the languages the part counts", async () => {
    // Logika counts cpp and py, so `any` is not one of its languages.
    const r = await jalan("question-save", AKD, masuk({ part: "logika", lang: "any" }));
    expect(r.status).toBe(400);
    expect(r.body.kode).toBe("bahasa_salah");
    // Mikro counts `any`, which pools C++ and Python questions.
    expect((await jalan("question-save", AKD, masuk({ part: "mikro", lang: "cpp" }))).status).toBe(
      200,
    );
  });

  it("refuses to write a ready question while a real room runs, but lets a draft through", async () => {
    berjalan = true;
    const r = await jalan("question-save", AKD, masuk({ status: "ready" }));
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("ruang_berjalan");
    expect((await jalan("question-save", AKD, masuk({ status: "draft" }))).status).toBe(200);
  });

  it("locks the structure of a question that was shown, and asks a note for a key change", async () => {
    rows.question = [{ ...BARIS(), shownAt: new Date(), status: "draft" }];
    const fewer = masuk({
      id: 5,
      body: {
        prompt: "Berapa?",
        options: [
          { id: "aaa111", text: "1" },
          { id: "bbb222", text: "2" },
          { id: "ccc333", text: "3" },
        ],
        shuffle: true,
      },
      answer: { correct: "aaa111" },
    });
    expect((await jalan("question-save", AKD, fewer)).body.kode).toBe("struktur_terkunci");

    const key = masuk({
      id: 5,
      body: BARIS().body,
      answer: { correct: "bbb222" },
      title: "Soal lama",
    });
    const noNote = await jalan("question-save", AKD, key);
    expect(noNote.status).toBe(400);
    expect(noNote.body.kode).toBe("perlu_catatan");
    const noted = await jalan("question-save", AKD, { ...key, note: "Kunci salah hitung" });
    expect(noted.status).toBe(200);
    expect(noted.body.kind).toBe("key");
    const log = tulis.find((w) => w.tabel === "log" && w.op === "insert")!;
    expect(log.nilai).toMatchObject({ kind: "key", note: "Kunci salah hitung", who: "AKD" });
  });

  it("an edit by a person clears the Bawaan badge and raises the version", async () => {
    rows.question = [{ ...BARIS(), sample: true, status: "draft" }];
    const r = await jalan(
      "question-save",
      AKD,
      masuk({ id: 5, title: "Soal lama (baru)", body: BARIS().body, answer: BARIS().answer }),
    );
    expect(r.status).toBe(200);
    const up = tulis.find((w) => w.tabel === "question" && w.op === "update")!;
    expect(up.nilai).toMatchObject({ sample: false, version: 4, updatedBy: "AKD" });
  });

  it("an identical save writes nothing", async () => {
    rows.question = [{ ...BARIS(), status: "ready" }];
    const r = await jalan(
      "question-save",
      AKD,
      masuk({
        id: 5,
        title: "Soal lama",
        status: "ready",
        body: BARIS().body,
        answer: BARIS().answer,
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe("same");
    expect(tulis).toEqual([]);
  });

  it("the loser of two editors rereads (versi_lama)", async () => {
    rows.question = [{ ...BARIS(), status: "draft" }];
    kalah = 1;
    const r = await jalan(
      "question-save",
      AKD,
      masuk({ id: 5, title: "Lain", body: BARIS().body, answer: BARIS().answer }),
    );
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("versi_lama");
  });

  it("a question that is not in this edition is not found", async () => {
    rows.question = [];
    const r = await jalan("question-save", AKD, masuk({ id: 77 }));
    expect(r.status).toBe(404);
  });

  it("refuses a picture that is not this edition's bank folder", async () => {
    const withImg = (key: string) =>
      masuk({ body: { ...masuk().body, images: [{ id: "im1", key, alt: "a", w: 10, h: 10 }] } });
    for (const key of [
      `recruitment/2/bank/${"a".repeat(64)}.png`,
      `recruitment/1/ref/${"a".repeat(64)}.html`,
      "../../etc/passwd",
    ]) {
      const r = await jalan("question-save", AKD, withImg(key));
      expect(r.body.kode, key).toBe("gambar_hilang");
    }
    dep.kepala = async () => ({ ada: false });
    expect(
      (await jalan("question-save", AKD, withImg(`recruitment/1/bank/${"a".repeat(64)}.png`))).body
        .kode,
    ).toBe("gambar_hilang");
    dep.kepala = async () => ({ ada: true });
    expect(
      (await jalan("question-save", AKD, withImg(`recruitment/1/bank/${"a".repeat(64)}.png`)))
        .status,
    ).toBe(200);
  });
});

describe("question-delete", () => {
  it("deletes one that was never shown, refuses one that was", async () => {
    rows.question = [{ ...BARIS(), status: "draft" }];
    expect((await jalan("question-delete", AKD, { id: 5 })).status).toBe(200);
    expect(tulis.some((w) => w.tabel === "question" && w.op === "delete")).toBe(true);
    tulis.length = 0;
    rows.question = [{ ...BARIS(), shownAt: new Date() }];
    const r = await jalan("question-delete", AKD, { id: 5 });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("sudah_tampil");
    expect(tulis).toEqual([]);
  });

  it("refuses a ready one while a real room runs", async () => {
    berjalan = true;
    expect((await jalan("question-delete", AKD, { id: 5 })).body.kode).toBe("ruang_berjalan");
  });
});

/* ----------------------------------------------------------- the import */

const CONTOH = readFileSync(
  new URL("../../src/lib/__tests__/fixtures/bank-examples.md", import.meta.url),
  "utf8",
);

describe("bank-import", () => {
  it("a dry run reports every question and writes nothing", async () => {
    rows.question = [];
    const r = await jalan("bank-import", AKD, { text: CONTOH, dry: true });
    expect(r.status).toBe(200);
    expect(r.body.dry).toBe(true);
    expect(r.body.counts).toEqual({ create: 14, update: 0, same: 0, error: 0 });
    expect(tulis).toEqual([]);
  });

  it("names each broken question with its line and keeps the clean ones", async () => {
    rows.question = [];
    const text = `${CONTOH}\n---\npart: logika\nlang: cpp\nformat: single\ntitle: Rusak\n---\nTanpa jawaban\n\n- [ ] a\n- [ ] b\n`;
    const dry = await jalan("bank-import", AKD, { text, dry: true });
    expect(dry.body.counts).toMatchObject({ create: 14, error: 1 });
    const bad = (
      dry.body.items as {
        action: string;
        title: string;
        line: number;
        errors: { kode: string }[];
      }[]
    ).find((i) => i.action === "error")!;
    expect(bad.title).toBe("Rusak");
    expect(bad.line).toBeGreaterThan(300);
    expect(bad.errors.map((e) => e.kode)).toContain("kunci_salah");

    const apply = await jalan("bank-import", AKD, { text, dry: false });
    expect(apply.body.counts).toMatchObject({ create: 14, error: 1 });
    expect(tulis.filter((w) => w.tabel === "question" && w.op === "insert")).toHaveLength(14);
  });

  it("reports a reference URL the bank does not have", async () => {
    rows.question = [];
    const text = `---\npart: mikro\nlang: any\nformat: single\ntitle: R\nrefs: [https://nope.example/x]\n---\nQ\n\n- [x] a\n- [ ] b\n`;
    const r = await jalan("bank-import", AKD, { text, dry: true });
    const it0 = (r.body.items as { errors: { kode: string; detail?: string }[] }[])[0];
    expect(it0.errors[0].kode).toBe("rujukan_hilang");
    expect(it0.errors[0].detail).toBe("https://nope.example/x");
  });

  it("an id the bank does not know is an error, an unchanged question is skipped", async () => {
    rows.question = [BARIS()];
    const unknown = `---\nid: 41\npart: logika\nlang: cpp\nformat: single\ntitle: X\n---\nQ\n\n- [x] a\n- [ ] b\n`;
    expect(
      (await jalan("bank-import", AKD, { text: unknown, dry: true })).body.counts,
    ).toMatchObject({ error: 1 });
    const same = `---\nid: 5\npart: logika\nlang: cpp\nformat: single\nstatus: ready\ntitle: Soal lama\n---\nBerapa?\n\n- [x] 1\n- [ ] 2\n`;
    const r = await jalan("bank-import", AKD, { text: same, dry: true });
    expect(r.body.counts).toMatchObject({ same: 1, update: 0, error: 0 });
  });

  it("refuses the file's updates to ready questions while a real room runs", async () => {
    berjalan = true;
    rows.question = [];
    const r = await jalan("bank-import", AKD, { text: CONTOH, dry: true });
    // The examples are all ready, so none can be created now.
    expect(r.body.counts).toMatchObject({ create: 0, error: 14 });
  });

  it("refuses a file that is too large", async () => {
    const r = await jalan("bank-import", AKD, { text: "x".repeat(2_600_000), dry: true });
    expect(r.status).toBe(413);
  });
});

describe("bank-export", () => {
  it("writes markdown a person can import again, with no voided question", async () => {
    rows.question = [BARIS(), { ...BARIS(), id: 6, title: "Batal", voidedAt: new Date() }];
    const r = await jalan("bank-export", AKD, null, { part: "logika" });
    expect(r.status).toBe(200);
    expect(r.headers["Content-Type"]).toContain("text/markdown");
    expect(r.headers["Content-Disposition"]).toContain("bank-soal-logika.md");
    expect(r.teks).toContain("title: Soal lama");
    expect(r.teks).not.toContain("Batal");
    expect(parseBank(r.teks)[0].draft?.id).toBe(5);
  });
});

describe("bank-seed", () => {
  it("installs the default bank as seeds and skips what is there", async () => {
    rows.question = [];
    const r = await jalan("bank-seed", AKD, {});
    expect(r.status).toBe(200);
    expect(r.body.created).toBeGreaterThan(0);
    expect(r.body.failed).toEqual([]);
    const first = tulis.find((w) => w.tabel === "question" && w.op === "insert")!;
    expect(first.nilai).toMatchObject({ sample: true, status: "ready" });
  });
});

/* ---------------------------------------------------------------- media */

describe("media-ticket", () => {
  it("answers a PUT address for a picture, content addressed", async () => {
    dep.kepala = async () => ({ ada: false });
    dep.tiketUnggah = async (o) => ({
      url: `https://relay.example/tp/unggah?k=${o.kunci}`,
      sampai: 1,
    });
    const sha = "d".repeat(64);
    const r = await jalan("media-ticket", AKD, { mime: "image/png", size: 5000, sha256: sha });
    expect(r.status).toBe(200);
    expect(r.body.key).toBe(`recruitment/1/bank/${sha}.png`);
    expect(r.body.sama).toBe(false);
    expect(String(r.body.url)).toContain("relay.example");
  });

  it("refuses other types, huge files and bad hashes", async () => {
    const sha = "d".repeat(64);
    expect(
      (await jalan("media-ticket", AKD, { mime: "image/gif", size: 500, sha256: sha })).body.kode,
    ).toBe("format_salah");
    expect(
      (await jalan("media-ticket", AKD, { mime: "text/html", size: 500, sha256: sha })).body.kode,
    ).toBe("format_salah");
    expect(
      (await jalan("media-ticket", AKD, { mime: "image/png", size: 3_000_000, sha256: sha }))
        .status,
    ).toBe(413);
    expect(
      (await jalan("media-ticket", AKD, { mime: "image/png", size: 500, sha256: "xyz" })).body.kode,
    ).toBe("data_salah");
  });
});

/* ------------------------------------------------------------ references */

const REF_ROW = (o: Record<string, unknown> = {}) => ({
  id: 3,
  editionId: 1,
  url: "https://docs.arduino.cc/x/",
  title: "digitalWrite",
  selector: null,
  r2Key: `recruitment/1/ref/${"e".repeat(64)}.html`,
  sha256: "e".repeat(64),
  bytes: 1234,
  status: "ok",
  error: null,
  fetchedAt: new Date(),
  by: "AKD",
  ...o,
});

describe("references", () => {
  it("reference-add fetches, stores in R2 and records the row", async () => {
    const stored: string[] = [];
    dep.snapshotUrl = (async () => ({
      html: "<html></html>",
      bytes: new Uint8Array(100),
      sha256: "f".repeat(64),
      title: "Judul Halaman",
      finalUrl: "https://example.org/a",
      selector: "main",
      skipped: 0,
    })) as never;
    dep.simpan = async (k: string) => void stored.push(k);
    const r = await jalan("reference-add", AKD, { url: "https://example.org/a" });
    expect(r.status).toBe(200);
    expect(stored).toEqual([`recruitment/1/ref/${"f".repeat(64)}.html`]);
    expect(tulis.find((w) => w.tabel === "reference")!.nilai).toMatchObject({
      title: "Judul Halaman",
      status: "ok",
      by: "AKD",
    });
  });

  it("reference-add refuses a duplicate address and a forbidden one", async () => {
    rows.reference = [REF_ROW()];
    const dup = await jalan("reference-add", AKD, { url: "https://docs.arduino.cc/x/" });
    expect(dup.status).toBe(409);
    expect(dup.body.kode).toBe("sudah_ada");
    rows.reference = [];
    const { SnapshotError } = await import("../_lib/recruitment-snapshot");
    dep.snapshotUrl = (async () => {
      throw new SnapshotError("alamat_terlarang");
    }) as never;
    const r = await jalan("reference-add", AKD, { url: "http://169.254.169.254/" });
    expect(r.status).toBe(400);
    expect(r.body.kode).toBe("alamat_terlarang");
    expect(tulis.filter((w) => w.tabel === "reference")).toEqual([]);
  });

  it("a failed refetch keeps the stored page and only notes the error", async () => {
    rows.reference = [REF_ROW()];
    const { SnapshotError } = await import("../_lib/recruitment-snapshot");
    dep.snapshotUrl = (async () => {
      throw new SnapshotError("waktu_habis");
    }) as never;
    const r = await jalan("reference-refetch", AKD, { id: 3 });
    expect(r.status).toBe(502);
    const up = tulis.find((w) => w.tabel === "reference" && w.op === "update")!;
    expect(up.nilai).toEqual({ error: "waktu_habis" });
  });

  it("reference-attach needs exactly one of part and questionId", async () => {
    rows.reference = [REF_ROW()];
    expect((await jalan("reference-attach", AKD, { id: 3, on: true })).body.kode).toBe(
      "data_salah",
    );
    expect(
      (await jalan("reference-attach", AKD, { id: 3, part: "logika", questionId: 5, on: true }))
        .body.kode,
    ).toBe("data_salah");
    expect(
      (await jalan("reference-attach", AKD, { id: 3, part: "voli", on: true })).body.kode,
    ).toBe("data_salah");
    expect((await jalan("reference-attach", AKD, { id: 3, part: "logika", on: true })).status).toBe(
      200,
    );
  });

  it("reference-delete is refused while a real room runs", async () => {
    rows.reference = [REF_ROW()];
    berjalan = true;
    expect((await jalan("reference-delete", AKD, { id: 3 })).body.kode).toBe("ruang_berjalan");
  });
});

/* ------------------------------------------------------------------ ref */

const kursiBagian = (
  o: { cur?: string | null; done?: boolean; draw?: boolean; roomId?: number } = {},
) => {
  const now = Date.now();
  const state = {
    ...newRoomState(),
    stage: "parts" as const,
    cur: (o.cur === undefined ? "logika" : o.cur) as never,
    runs: {
      logika: {
        state: "running",
        durMs: 900_000,
        usedMs: 0,
        mark: now - 1000,
        extra: {},
        pausedAt: null,
        endedAt: null,
        endedBy: null,
        reopened: 0,
      },
    } as never,
  };
  return {
    seat: {
      id: 11,
      roomId: o.roomId ?? 7,
      done: o.done ? { logika: now } : {},
      draw:
        o.draw === false
          ? {}
          : {
              logika: {
                room: 7,
                at: now,
                seed: "s",
                items: [{ q: 5, lang: "cpp", v: 1, perm: null }],
              },
            },
    },
    room: { id: 7, state },
  };
};

describe("ref (a seat reads a reference)", () => {
  const cand = sesi("1101200001", "praktikan");
  beforeEach(() => {
    rows.reference = [REF_ROW()];
    rows.candidate = [{ id: 101 }];
    rows.partref = [{ r: 3 }];
    dep.ambil = async () => new Response("<html>x</html>");
  });

  it("serves a seat in its running part the strict headers", async () => {
    kursi = kursiBagian();
    const r = await jalan("ref", cand, null, { id: "3" });
    expect(r.status).toBe(200);
    expect(r.headers["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(r.headers["Content-Security-Policy"]).toContain("sandbox");
    expect(r.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(r.headers["Cache-Control"]).toBe("private, max-age=600");
  });

  it("is a plain not-found for a seat outside a running part, one that handed in, or one with no draw", async () => {
    for (const k of [
      { seat: null, room: null },
      kursiBagian({ cur: null }),
      kursiBagian({ done: true }),
      kursiBagian({ draw: false }),
      kursiBagian({ roomId: 9 }),
    ]) {
      kursi = k as never;
      const r = await jalan("ref", cand, null, { id: "3" });
      expect(r.status).toBe(404);
      expect(r.body.kode).toBe("tidak_ada");
    }
  });

  it("a reference neither on the part nor on a dealt question is not readable", async () => {
    kursi = kursiBagian();
    rows.partref = [];
    rows.question = [{ refs: [] }];
    expect((await jalan("ref", cand, null, { id: "3" })).status).toBe(404);
    rows.question = [{ refs: [3] }];
    expect((await jalan("ref", cand, null, { id: "3" })).status).toBe(200);
  });

  it("a failed reference (status gagal) is not served to a seat", async () => {
    kursi = kursiBagian();
    rows.reference = [REF_ROW({ status: "gagal" })];
    expect((await jalan("ref", cand, null, { id: "3" })).status).toBe(404);
  });

  it("an Asisten with the bank right reads any reference, one without it gets the same not-found", async () => {
    expect((await jalan("ref", AKD, null, { id: "3" })).status).toBe(200);
    const r = await jalan("ref", sesi("N1"), null, { id: "3" });
    expect(r.status).toBe(404);
    expect(r.body.kode).toBe("tidak_ada");
  });

  it("answers the same for a missing id as for a forbidden one (no probing)", async () => {
    rows.reference = [];
    const a = await jalan("ref", AKD, null, { id: "99" });
    expect(a.status).toBe(404);
    kursi = kursiBagian();
    const b = await jalan("ref", cand, null, { id: "99" });
    expect(b.status).toBe(404);
    expect(b.body).toEqual(a.body);
  });
});

describe("media (a seat loads a picture)", () => {
  const key = `recruitment/1/bank/${"a".repeat(64)}.png`;
  const cand = sesi("1101200001", "praktikan");
  beforeEach(() => {
    rows.candidate = [{ id: 101 }];
    dep.urlBaca = async () => "https://relay.example/tp/berkas?t=abc";
  });

  it("redirects a seat whose draw has a question that uses it", async () => {
    kursi = kursiBagian();
    rows.question = [{ body: { images: [{ id: "i", key, alt: "", w: 1, h: 1 }] } }];
    const r = await jalan("media", cand, null, { key });
    expect(r.status).toBe(302);
    expect(r.headers.Location).toContain("relay.example");
  });

  it("refuses a seat that was not dealt a question with it, and one with no seat", async () => {
    kursi = kursiBagian();
    rows.question = [{ body: { images: [] } }];
    expect((await jalan("media", cand, null, { key })).status).toBe(403);
    kursi = { seat: null, room: null };
    expect((await jalan("media", cand, null, { key })).status).toBe(403);
  });

  it("refuses a key outside this edition's bank folder", async () => {
    kursi = kursiBagian();
    for (const k of [
      `recruitment/2/bank/${"a".repeat(64)}.png`,
      "recruitment/1/12345678/cv/x.pdf",
      "",
    ]) {
      expect((await jalan("media", cand, null, { key: k })).status).toBe(400);
    }
  });

  it("an Asisten needs the bank right", async () => {
    expect((await jalan("media", AKD, null, { key })).status).toBe(302);
    expect((await jalan("media", sesi("N1"), null, { key })).status).toBe(403);
  });
});
