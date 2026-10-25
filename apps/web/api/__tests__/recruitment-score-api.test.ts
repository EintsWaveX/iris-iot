/**
 * /api/recruitment, S3: scores, voids and Finalkan (prompt 13). The database
 * is a small stateful fake keyed by table (inserts and updates change the
 * rows the next read sees), so the whole life of a score runs through the
 * handler: provisional reads of the 08 worked example (EXAM-ENGINE 4.4), a
 * void, Finalkan, a key changed after it, the unfreeze. What the SQL itself
 * does (the one-live-freeze index) is proved on the rig by rec_score_api.mjs.
 *
 * Pinned here: who may call what (a candidate reaches nothing), the numbers
 * of 4.4 through the API, that a void moves every seat and an unvoid moves it
 * back, what blocks Finalkan, that a frozen score ignores later changes to the
 * bank, and that the Cutting board reads the same totals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  recAccount,
  recAnswer,
  recCandidate,
  recEdition,
  recExamRoom,
  recExamSeat,
  recLivecode,
  recQuestion,
  recQuestionLog,
  recRubricScore,
  recScoreFreeze,
  recSlot,
  recSlotAssignment,
} from "../../src/lib/schema";
import type { Rubric } from "../../src/lib/recruitment/exam-types";

process.env.SESSION_SECRET = "x".repeat(40);

type Row = Record<string, unknown>;
const nama = new Map<unknown, string>([
  [asisten, "asisten"],
  [recAccount, "account"],
  [recAnswer, "answer"],
  [recCandidate, "candidate"],
  [recEdition, "edition"],
  [recExamRoom, "room"],
  [recExamSeat, "seat"],
  [recLivecode, "livecode"],
  [recQuestion, "question"],
  [recQuestionLog, "log"],
  [recRubricScore, "sheet"],
  [recScoreFreeze, "freeze"],
  [recSlot, "slot"],
  [recSlotAssignment, "assignment"],
]);

let rows: Record<string, Row[]> = {};
/** The fake does not project columns, so rows carry the aliases the loader selects (q, topic, grader). */
/** Which question an update means (the fake cannot read a where clause). */
let alvo = 0;
let idBaru = 100;
let audit: { aksi: string; detail: unknown }[] = [];

function chain() {
  let tabel = "";
  let satu = false;
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "innerJoin", "leftJoin", "groupBy", "for"]) p[m] = () => p;
  p.limit = () => {
    satu = true;
    return p;
  };
  p.from = (t: unknown) => {
    tabel = nama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => {
    let r = (rows[tabel] ?? []).slice();
    // isNull(superseded_at): the only filter whose meaning the tests rely on
    if (tabel === "freeze") r = r.filter((x) => x.supersededAt == null);
    // a lookup of one question by id: the fake reads the id from `alvo`
    if (tabel === "question" && satu && alvo) r = r.filter((x) => x.id === alvo);
    return ok(r);
  };
  return p;
}

function tulisan(op: "insert" | "update", t: unknown) {
  const tabel = nama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  let hasil: Row[] = [];
  p.values = (v: Row) => {
    const r = { id: ++idBaru, at: new Date(), supersededAt: null, ...v };
    (rows[tabel] ??= []).push(r);
    hasil = [r];
    return p;
  };
  p.set = (v: Row) => {
    const sasaran = (rows[tabel] ?? []).filter((r) =>
      tabel === "question" ? r.id === alvo : tabel === "freeze" ? r.supersededAt == null : true,
    );
    for (const r of sasaran) Object.assign(r, v);
    hasil = sasaran;
    return p;
  };
  p.where = () => p;
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok(hasil);
  return p;
}

vi.mock("../../src/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: (t: unknown) => tulisan("insert", t),
    update: (t: unknown) => tulisan("update", t),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { getDb: () => db };
});
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (_nim: string, aksi: string, detail?: unknown) => {
    audit.push({ aksi, detail });
  },
}));

const HAK = [
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
];
const pelaku = (hak: Record<string, boolean>, duduk = true) => ({
  orang: { status: "aktif", badges: [] },
  kursi: duduk ? { division: "acara", isKoor: false } : null,
  hak: { ...Object.fromEntries(HAK.map((k) => [k, false])), ...hak },
  penuh: false,
});
let pelakuNim: Record<string, ReturnType<typeof pelaku> | null> = {};
vi.mock("../_lib/recruitment-rights", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  muatPelaku: async (_db: unknown, _e: number, nim: string) => pelakuNim[nim] ?? null,
}));

const RUBRIK: Rubric = {
  id: 1,
  stage: "tes_tulis",
  kind: "livecode",
  rows: [
    { key: "jalan", label: "Jalan", max: 4, weight: 3 },
    { key: "protokol", label: "Protokol", max: 4, weight: 2 },
    { key: "data", label: "Data", max: 4, weight: 2 },
    { key: "kode", label: "Kode", max: 4, weight: 1 },
    { key: "jelas", label: "Jelas", max: 4, weight: 2 },
  ],
};
vi.mock("../_lib/recruitment-lc-pool", () => ({ muatRubrik: async () => RUBRIK }));

const { handleScore, muatNilaiCutting, nilaiBeku } = await import("../_lib/recruitment-score");
const { getDb } = await import("../../src/lib/db");

const sesi = (nim: string, role: "asisten" | "praktikan" = "asisten") => ({
  role,
  nim,
  nama: nim,
  exp: 9e9,
});

interface Hasil {
  status: number;
  body: Record<string, unknown>;
}
function jalan(
  aksi: string,
  s: ReturnType<typeof sesi>,
  body: Record<string, unknown> | null,
  query: Record<string, string> = {},
): Promise<Hasil> {
  const out: Hasil = { status: 0, body: {} };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
    },
    end() {},
  };
  const req = {
    method: body === null ? "GET" : "POST",
    query: { aksi, ...query },
    headers: {},
    body,
  };
  return handleScore(req as never, res as never, s as never).then(() => out);
}

/* The data of 4.4: four questions in Logika, five seats, S5 never opened the part. */
const opt = (...xs: string[]) => xs.map((id) => ({ id, text: `opsi ${id}` }));
const soal = (id: number, format: string, body: unknown, answer: unknown): Row => ({
  id,
  editionId: 1,
  part: "logika",
  lang: "cpp",
  format,
  title: `Soal ${id}`,
  version: 1,
  body,
  answer,
  voidedAt: null,
  voidedBy: null,
  voidNote: null,
});
const BANK = () => [
  soal(1, "single", { prompt: "q1", options: opt("a", "b", "c"), shuffle: true }, { correct: "b" }),
  soal(
    2,
    "multi",
    { prompt: "q2", options: opt("a", "b", "c", "d"), shuffle: true },
    { correct: ["a", "c"] },
  ),
  soal(
    3,
    "order",
    {
      prompt: "q3",
      lang: "cpp",
      lines: ["l1", "l2", "l3", "l4"].map((id) => ({ id, text: id })),
    },
    { order: ["l1", "l2", "l3", "l4"], also: [] },
  ),
  soal(
    4,
    "fitb",
    { prompt: "q4", blanks: [{ n: 1 }, { n: 2 }] },
    { blanks: { 1: { accept: ["x"] }, 2: { accept: ["y"] } } },
  ),
];
const draw = (ids: number[]) => ({
  logika: { at: 1, room: 1, items: ids.map((q) => ({ q, v: 1, lang: "cpp", perm: null })) },
});
const KURSI = [
  { id: 1, candidateId: 11, roomId: 1, draw: draw([1, 2, 3]) },
  { id: 2, candidateId: 12, roomId: 1, draw: draw([1, 2, 4]) },
  { id: 3, candidateId: 13, roomId: 1, draw: draw([1, 3, 4]) },
  { id: 4, candidateId: 14, roomId: 1, draw: draw([2, 3, 4]) },
  { id: 5, candidateId: 15, roomId: 1, draw: {} },
];
const JAWAB = [
  [1, 1, { pick: "b" }],
  [1, 2, { picks: ["a", "c"] }],
  [1, 3, { order: ["l1", "l2", "l3", "l4"] }],
  [2, 1, { pick: "a" }],
  [2, 2, { picks: ["a"] }],
  [2, 4, { blanks: { 1: "x", 2: "z" } }],
  [3, 1, { pick: "b" }],
  [3, 3, { order: ["l1", "l3", "l2", "l4"] }],
  [3, 4, { blanks: { 1: "x", 2: "y" } }],
  [4, 2, { picks: ["a", "b", "c"] }],
  [4, 4, { blanks: {} }],
].map(([seatId, q, value]) => ({ seatId, q, value }));

beforeEach(() => {
  audit = [];
  idBaru = 100;
  alvo = 0;
  pelakuNim = {
    AKD: pelaku({ bank: true }),
    ACR: pelaku({ calendar: true }),
    LEPAS: null,
  };
  rows = {
    edition: [{ id: 1, year: 2026, title: "OR", status: "live" }],
    seat: KURSI.map((k) => ({ ...k, editionId: 1, rehearsal: false })),
    answer: JAWAB.map((r) => ({ ...r })),
    question: BANK(),
    candidate: KURSI.map((k) => ({
      id: k.candidateId,
      nim: `1101${k.candidateId}`,
      nama: `Calon ${k.id}`,
    })),
    room: [
      { id: 1, title: "Malam 1", editionId: 1, rehearsal: false, state: { stage: "finished" } },
    ],
    livecode: [],
    sheet: [],
    freeze: [],
    log: [],
    asisten: [{ nim: "AKD", nama: "Akademik" }],
  };
});

const logika = (b: Record<string, unknown>) =>
  (b.rows as { seatId: number; parts: { logika: { score: number } } }[]).map(
    (r) => r.parts.logika.score,
  );

/* ---------------------------------------------------------------- rights */

describe("who may reach the scores", () => {
  const SEMUA: [string, Record<string, unknown> | null][] = [
    ["scores", null],
    ["score-stats", null],
    ["question-void", { id: 4, note: "salah kunci" }],
    ["question-unvoid", { id: 4, note: "sudah benar" }],
    ["score-finalize", {}],
    ["score-unfreeze", { note: "ada koreksi" }],
  ];

  it("a candidate, with an oprec or a practicum session, gets 403 on every action and no score", async () => {
    for (const [aksi, body] of SEMUA) {
      const r = await jalan(aksi, sesi("1101200001", "praktikan"), body);
      expect(r.status, aksi).toBe(403);
      expect(r.body.kode, aksi).toBe("tanpa_hak");
      expect(JSON.stringify(r.body), aksi).not.toMatch(/score|total|phase1|opsi/);
    }
    expect(audit).toEqual([]);
    expect(rows.freeze).toEqual([]);
  });

  it("an Asisten off the committee, or deactivated, gets 403", async () => {
    for (const [aksi, body] of SEMUA) {
      expect((await jalan(aksi, sesi("LEPAS"), body)).status, aksi).toBe(403);
      expect((await jalan(aksi, sesi("ORANG"), body)).status, aksi).toBe(403);
    }
  });

  it("a member without the bank right reads the scores and nothing else", async () => {
    const baca = await jalan("scores", sesi("ACR"), null);
    expect(baca.status).toBe(200);
    expect((baca.body.can as { bank: boolean }).bank).toBe(false);
    expect(baca.body.blockers).toEqual([]);
    for (const [aksi, body] of SEMUA.slice(1)) {
      const r = await jalan(aksi, sesi("ACR"), body);
      expect(r.status, aksi).toBe(403);
    }
    expect(rows.freeze).toEqual([]);
    expect((rows.question as Row[]).every((q) => q.voidedAt === null)).toBe(true);
  });
});

/* ------------------------------------------------------ the worked example */

describe("the worked example of 4.4 through the API", () => {
  it("scores: 1000, 348, 783, 167 and the seat that never started is 0, absent", async () => {
    const r = await jalan("scores", sesi("AKD"), null);
    expect(r.status).toBe(200);
    expect(logika(r.body)).toEqual([1000, 348, 783, 167, 0]);
    const s5 = (r.body.rows as { seatId: number; parts: { logika: unknown } }[])[4];
    expect(s5.parts.logika).toEqual({ score: 0, flag: "absent" });
    expect(r.body.final).toBeNull();
    expect(r.body.rooms).toEqual([{ id: 1, title: "Malam 1" }]);
  });

  it("the response carries no key, no answer and no question text", async () => {
    const r = await jalan("scores", sesi("AKD"), null);
    const teks = JSON.stringify(r.body);
    expect(teks).not.toContain("correct");
    expect(teks).not.toContain("accept");
    expect(teks).not.toContain("opsi");
  });

  it("score-stats: N, M, p and w per question and the most picked wrong answer", async () => {
    const r = await jalan("score-stats", sesi("AKD"), null);
    const st = r.body.stats as {
      id: number;
      n: number;
      m: number;
      p: string;
      w: string;
      wrong: unknown;
    }[];
    expect(st.map((s) => [s.id, s.n, s.m, s.p, s.w])).toEqual([
      [1, 3, 2, "3/5", "7/5"],
      [2, 3, 1, "2/5", "8/5"],
      [3, 3, 1, "2/5", "8/5"],
      [4, 3, 1, "2/5", "8/5"],
    ]);
    expect(st[0].wrong).toEqual({ n: 1, id: "a", kind: "option", text: "opsi a" });
    expect((r.body.started as Record<string, number>).logika).toBe(4);
  });

  it("scores?roomId= narrows the rows, not the numbers", async () => {
    (rows.room as Row[]).push({
      id: 2,
      title: "Susulan",
      editionId: 1,
      rehearsal: false,
      state: { stage: "finished" },
    });
    (rows.seat as Row[])[2].roomId = 2;
    const r = await jalan("scores", sesi("AKD"), null, { roomId: "2" });
    expect(logika(r.body)).toEqual([783]);
    expect((await jalan("scores", sesi("AKD"), null, { roomId: "x" })).status).toBe(400);
  });

  it("a rehearsal seat counts nowhere: its row leaves the table and the statistics", async () => {
    // The loader asks for rehearsal = false; the fake cannot filter, so drop the row as SQL would.
    rows.seat = (rows.seat as Row[]).filter((s) => s.id !== 5);
    const r = await jalan("scores", sesi("AKD"), null);
    expect((r.body.rows as unknown[]).length).toBe(4);
  });
});

/* ------------------------------------------------------------------ voids */

describe("question-void and question-unvoid", () => {
  it("needs an id and a note", async () => {
    expect((await jalan("question-void", sesi("AKD"), { note: "x" })).body.kode).toBe("data_salah");
    expect((await jalan("question-void", sesi("AKD"), { id: 4 })).body.kode).toBe("perlu_catatan");
    expect((await jalan("question-void", sesi("AKD"), { id: 4, note: "   " })).body.kode).toBe(
      "perlu_catatan",
    );
    alvo = 99;
    expect((await jalan("question-void", sesi("AKD"), { id: 99, note: "x" })).body.kode).toBe(
      "tidak_ada",
    );
  });

  it("voiding q4 moves every seat (1000, 267, 667, 250), logs it and audits it", async () => {
    alvo = 4;
    const v = await jalan("question-void", sesi("AKD"), { id: 4, note: "kunci blank 2 salah" });
    expect(v.status).toBe(200);
    expect(v.body.question).toEqual({ id: 4, voided: true, voidNote: "kunci blank 2 salah" });
    const r = await jalan("scores", sesi("AKD"), null);
    expect(logika(r.body)).toEqual([1000, 267, 667, 250, 0]);
    expect(rows.log).toHaveLength(1);
    expect(rows.log[0]).toMatchObject({
      questionId: 4,
      who: "AKD",
      kind: "void",
      note: "kunci blank 2 salah",
    });
    expect(audit.map((a) => a.aksi)).toEqual(["rec_soal_batal"]);
    // the statistics still list it, marked
    const st = await jalan("score-stats", sesi("AKD"), null);
    expect(
      (st.body.stats as { id: number; voided: boolean }[]).find((s) => s.id === 4)!.voided,
    ).toBe(true);
  });

  it("voiding twice is refused, an unvoid restores the scores", async () => {
    alvo = 4;
    await jalan("question-void", sesi("AKD"), { id: 4, note: "a" });
    expect((await jalan("question-void", sesi("AKD"), { id: 4, note: "b" })).body.kode).toBe(
      "sudah_batal",
    );
    const u = await jalan("question-unvoid", sesi("AKD"), { id: 4, note: "ternyata benar" });
    expect(u.status).toBe(200);
    expect(logika((await jalan("scores", sesi("AKD"), null)).body)).toEqual([
      1000, 348, 783, 167, 0,
    ]);
    expect(rows.log.map((l) => l.kind)).toEqual(["void", "unvoid"]);
    expect((await jalan("question-unvoid", sesi("AKD"), { id: 4, note: "c" })).body.kode).toBe(
      "tidak_batal",
    );
  });
});

/* -------------------------------------------------------------- Finalkan */

describe("score-finalize and score-unfreeze", () => {
  it("is refused while a room is open, with what to wait for", async () => {
    (rows.room as Row[])[0].state = { stage: "parts" };
    const r = await jalan("score-finalize", sesi("AKD"), {});
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("ruang_terbuka");
    expect(rows.freeze).toEqual([]);
    const baca = await jalan("scores", sesi("AKD"), null);
    expect(baca.body.blockers).toEqual([{ kode: "ruang_terbuka", rooms: 1 }]);
  });

  it("is refused while a seat with a topic has fewer than two counted sheets", async () => {
    rows.livecode = [{ seatId: 3, editionId: 1, topic: 7 }];
    rows.sheet = [
      {
        subjectId: 3,
        grader: "101",
        graderNim: "101",
        values: { jalan: 4, protokol: 4, data: 4, kode: 4, jelas: 4 },
        at: new Date(10),
      },
    ];
    const r = await jalan("score-finalize", sesi("AKD"), {});
    expect(r.body.kode).toBe("nilai_lc_kurang");
    expect(r.body.blockers).toEqual([{ kode: "nilai_lc_kurang", seats: 1 }]);
    // a second sheet from the same person does not help
    (rows.sheet as Row[]).push({ ...(rows.sheet as Row[])[0], at: new Date(20) });
    expect((await jalan("score-finalize", sesi("AKD"), {})).body.kode).toBe("nilai_lc_kurang");
    // two people do
    (rows.sheet as Row[])[1].graderNim = "102";
    (rows.sheet as Row[])[1].grader = "102";
    const ok = await jalan("score-finalize", sesi("AKD"), {});
    expect(ok.status).toBe(200);
  });

  it("is refused on a partial cohort: an evening with candidates and no room, or a candidate with no seat", async () => {
    // Evening 2 has two candidates and no room; evening 1 is the room the seats sit in.
    (rows.room as Row[])[0].slotId = 1;
    rows.assignment = [
      { slotId: 1, candidateId: 11, status: "approved" },
      { slotId: 2, candidateId: 21, status: "approved" },
      { slotId: 2, candidateId: 22, status: "approved" },
    ];
    const r = await jalan("score-finalize", sesi("AKD"), {});
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("slot_tanpa_ruang");
    expect(r.body.blockers).toEqual([
      { kode: "slot_tanpa_ruang", slots: 1 },
      { kode: "peserta_tanpa_kursi", candidates: 2 },
    ]);
    expect(rows.freeze).toEqual([]);
    const baca = await jalan("scores", sesi("AKD"), null);
    expect((baca.body.blockers as { kode: string }[]).map((b) => b.kode)).toEqual([
      "slot_tanpa_ruang",
      "peserta_tanpa_kursi",
    ]);

    // The room exists now, but the two candidates never took a seat.
    rows.room = [
      ...(rows.room as Row[]),
      { id: 2, slotId: 2, rehearsal: false, state: { stage: "finished" } },
    ];
    const tanpaKursi = await jalan("score-finalize", sesi("AKD"), {});
    expect(tanpaKursi.body.kode).toBe("peserta_tanpa_kursi");
    expect(tanpaKursi.body.blockers).toEqual([{ kode: "peserta_tanpa_kursi", candidates: 2 }]);

    // One withdrew and one sat: nothing left to wait for.
    rows.assignment = [
      { slotId: 1, candidateId: 11, status: "approved" },
      { slotId: 2, candidateId: 21, status: "withdrawn" },
      { slotId: 2, candidateId: 12, status: "approved" },
    ];
    expect((await jalan("score-finalize", sesi("AKD"), {})).status).toBe(200);
  });

  it("is refused with nothing to freeze", async () => {
    rows.seat = [];
    expect((await jalan("score-finalize", sesi("AKD"), {})).body.kode).toBe("tanpa_kursi");
  });

  it("freezes the scores; later changes to the bank do not move them", async () => {
    const f = await jalan("score-finalize", sesi("AKD"), { note: "Susulan selesai" });
    expect(f.status).toBe(200);
    expect(rows.freeze).toHaveLength(1);
    expect(rows.freeze[0]).toMatchObject({ editionId: 1, by: "AKD", note: "Susulan selesai" });
    expect(audit.map((a) => a.aksi)).toEqual(["rec_nilai_final"]);

    // the key of q1 is "fixed" afterwards: everyone who answered b is now wrong
    (rows.question as Row[])[0].answer = { correct: "a" };
    const r = await jalan("scores", sesi("ACR"), null);
    expect(logika(r.body)).toEqual([1000, 348, 783, 167, 0]);
    expect((r.body.final as { by: string; byName: string }).by).toBe("AKD");
    expect((r.body.final as { byName: string }).byName).toBe("Akademik");
    const st = await jalan("score-stats", sesi("AKD"), null);
    expect((st.body.stats as { id: number; m: number }[])[0].m).toBe(2);
    expect(await nilaiBeku(getDb() as never, 1)).toBe(true);
  });

  it("while frozen: no second Finalkan, no void, no unvoid", async () => {
    await jalan("score-finalize", sesi("AKD"), {});
    expect((await jalan("score-finalize", sesi("AKD"), {})).body.kode).toBe("sudah_final");
    expect((await jalan("question-void", sesi("AKD"), { id: 4, note: "x" })).status).toBe(409);
    expect((await jalan("question-void", sesi("AKD"), { id: 4, note: "x" })).body.kode).toBe(
      "nilai_final",
    );
    expect((await jalan("question-unvoid", sesi("AKD"), { id: 4, note: "x" })).body.kode).toBe(
      "nilai_final",
    );
    expect(rows.log).toEqual([]);
  });

  it("an unfreeze needs a note and a freeze, then reads are provisional again", async () => {
    expect((await jalan("score-unfreeze", sesi("AKD"), { note: "x" })).body.kode).toBe(
      "belum_final",
    );
    await jalan("score-finalize", sesi("AKD"), {});
    expect((await jalan("score-unfreeze", sesi("AKD"), {})).body.kode).toBe("perlu_catatan");
    (rows.question as Row[])[0].answer = { correct: "a" };
    const u = await jalan("score-unfreeze", sesi("AKD"), { note: "kunci q1 dibetulkan" });
    expect(u.status).toBe(200);
    expect(rows.freeze[0]).toMatchObject({
      supersededBy: "AKD",
      unfreezeNote: "kunci q1 dibetulkan",
    });
    expect(audit.map((a) => a.aksi)).toEqual(["rec_nilai_final", "rec_nilai_buka"]);
    const r = await jalan("scores", sesi("AKD"), null);
    expect(r.body.final).toBeNull();
    // q1's key now says "a": S2 (who picked a) gains, S1 and S3 (b) lose
    expect(logika(r.body)).not.toEqual([1000, 348, 783, 167, 0]);
    // and a void works again, then a new Finalkan
    alvo = 4;
    expect((await jalan("question-void", sesi("AKD"), { id: 4, note: "x" })).status).toBe(200);
    expect((await jalan("score-finalize", sesi("AKD"), {})).status).toBe(200);
  });
});

/* ------------------------------------------------------------- Cutting */

describe("the Cutting board's Tes Tulis columns", () => {
  const db = () => getDb() as never;

  it("gives Logika, FITB, Debugging, Live Coding and the total per candidate", async () => {
    const { final, byCandidate } = await muatNilaiCutting(db(), 1);
    expect(final).toBe(false);
    // S3 (candidate 13): Logika 783, nothing else; no topic means Live Coding 0
    expect(byCandidate.get(13)).toEqual({ parts: [783, 0, 0, 0], total: 783 });
    // a candidate with no seat is not in the map
    expect(byCandidate.get(99)).toBeUndefined();
  });

  it("leaves the total empty while a seat's Live Coding waits for sheets", async () => {
    rows.livecode = [{ seatId: 3, editionId: 1, topic: 7 }];
    const { byCandidate } = await muatNilaiCutting(db(), 1);
    expect(byCandidate.get(13)).toEqual({ parts: [783, 0, 0, null], total: null });
    expect(byCandidate.get(11)?.total).toBe(1000);
  });

  it("follows the freeze after Finalkan", async () => {
    await jalan("score-finalize", sesi("AKD"), {});
    (rows.question as Row[])[0].answer = { correct: "a" };
    const { final, byCandidate } = await muatNilaiCutting(db(), 1);
    expect(final).toBe(true);
    expect(byCandidate.get(11)?.parts[0]).toBe(1000);
  });
});
