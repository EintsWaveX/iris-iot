/**
 * /api/recruitment, S3: the candidate's runner (prompt 10). The database is a
 * fake keyed by table, like recruitment-room-api.test.ts; what the SQL itself
 * must do (the draw written once, the answer upsert, the seat's own rows) is
 * proved on the rig by rec_runner_api.mjs against real Postgres. Here: who may
 * reach what, what is refused and with which kode, and that nothing a seat
 * gets carries a key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recAnswer,
  recCandidate,
  recEdition,
  recExamConfig,
  recExamRoom,
  recExamSeat,
  recPartRef,
  recQuestion,
  recReference,
  recSlot,
  recSlotAssignment,
  recStrike,
} from "../../src/lib/schema";
import { newRoomState } from "../../src/lib/recruitment/room";
import {
  DEFAULT_EXAM_CONFIG,
  type PartRun,
  type RoomState,
} from "../../src/lib/recruitment/exam-types";

process.env.SESSION_SECRET = "x".repeat(40);

type Rows = Record<string, unknown[] | (() => unknown[])>;
const nama = new Map<unknown, string>([
  [recAnswer, "answer"],
  [recCandidate, "candidate"],
  [recEdition, "edition"],
  [recExamConfig, "config"],
  [recExamRoom, "room"],
  [recExamSeat, "seat"],
  [recPartRef, "partref"],
  [recQuestion, "question"],
  [recReference, "reference"],
  [recSlot, "slot"],
  [recSlotAssignment, "assignment"],
  [recStrike, "strike"],
]);

let rows: Rows = {};
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(): unknown {
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
    return ok(typeof r === "function" ? r() : (r ?? []));
  };
  return p;
}
function tulisan(op: string, t: unknown) {
  const tabel = nama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "onConflictDoUpdate", "onConflictDoNothing", "for"]) p[m] = () => p;
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
    if (op === "insert" && tabel === "answer") return ok([{ rev: 1 }]);
    const r = rows[`w:${tabel}`] ?? rows[tabel];
    return ok(typeof r === "function" ? r() : (r ?? []));
  };
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
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => undefined,
}));

const { handleSeat } = await import("../_lib/recruitment-seat");
const { ambilAntre } = await import("../_lib/aliran");

const MIN = 60_000;
const EDISI = { id: 1, year: 2026, title: "OR", status: "live" };
const sesi = (nim = "R1") => ({ role: "praktikan" as const, nim, nama: "Calon", exp: 9e9 });

let state: RoomState;
const run = (o: Partial<PartRun> = {}): PartRun => ({
  durMs: 15 * MIN,
  usedMs: 0,
  mark: Date.now() - MIN,
  state: "running",
  pausedAt: null,
  extra: {},
  startedAt: Date.now() - MIN,
  endedAt: null,
  endedBy: null,
  leftAtSkip: 0,
  reopened: 0,
  ...o,
});
const kamar = () => ({
  id: 7,
  editionId: 1,
  slotId: 3,
  title: "Ruang A",
  rehearsal: false,
  state,
  masterSeenAt: null,
  topicNext: 0,
  hotspots: [] as unknown[],
  createdBy: "X",
  createdAt: new Date(),
  updatedAt: new Date(),
});
const SOAL = (id: number) => ({
  id,
  editionId: 1,
  part: "logika",
  lang: "cpp",
  format: "single",
  title: "T",
  body: {
    prompt: "p",
    shuffle: true,
    options: [
      { id: "aa", text: "x" },
      { id: "bb", text: "y" },
    ],
  },
  answer: { correct: "aa" },
  refs: [] as number[],
  status: "ready",
  sample: false,
  version: 1,
  shownAt: null,
  voidedAt: null,
});
const seat = (o: Record<string, unknown> = {}) => ({
  id: 5,
  editionId: 1,
  roomId: 7,
  candidateId: 11,
  rehearsal: false,
  checkin: { fullscreen: 1, connection: { at: 1 }, name: 1 },
  draw: {
    logika: {
      at: 1,
      room: 7,
      items: [{ q: 101, v: 1, lang: "cpp", perm: { options: ["bb", "aa"] } }],
    },
  },
  done: {},
  tab: null,
  tabAt: null,
  createdAt: new Date(),
  lastSeenAt: null,
  ...o,
});

function jalan(aksi: string, body: Record<string, unknown> | null, nim = "R1") {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => undefined,
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
    },
  };
  const req = {
    method: body === null ? "GET" : "POST",
    query: { aksi },
    headers: {},
    body: body ?? {},
  };
  return handleSeat(req as never, res as never, sesi(nim) as never).then(() => ({
    ...out,
    antre: ambilAntre(res as never),
  }));
}

beforeEach(() => {
  state = {
    ...newRoomState(),
    stage: "parts",
    cur: "logika",
    runs: { logika: run() },
    startedAt: Date.now() - MIN,
  };
  tulis.length = 0;
  rows = {
    edition: [EDISI],
    candidate: [{ id: 11 }],
    seat: [seat()],
    assignment: [{ slotId: 3 }],
    room: [kamar()],
    slot: [{ id: 3, startsAt: new Date(), endsAt: new Date(Date.now() + 3 * 3600_000) }],
    config: [{ salt: "ab".repeat(32), config: DEFAULT_EXAM_CONFIG }],
    question: [SOAL(101)],
    answer: [],
  };
});

describe("who reaches the runner", () => {
  it("an account that is no candidate is refused: bukan_peserta", async () => {
    rows.candidate = [];
    const r = await jalan("test", null);
    expect(r.status).toBe(403);
    expect(r.body.kode).toBe("bukan_peserta");
  });
  it("an unknown action is 404", async () => {
    const r = await jalan("test-nothing", null);
    expect(r.status).toBe(404);
  });
});

describe("test-answer", () => {
  const body = (o: Record<string, unknown> = {}) => ({
    part: "logika",
    q: 101,
    value: { pick: "aa" },
    rev: 0,
    tab: "tab-aaaa",
    ...o,
  });
  it("stores a right shape for a question in the seat's draw", async () => {
    const r = await jalan("test-answer", body());
    expect(r.status).toBe(200);
    expect(r.body.rev).toBe(1);
    expect(tulis.some((w) => w.tabel === "answer" && w.op === "insert")).toBe(true);
  });
  it("refuses a question that is not in the seat's draw (IDOR): soal_tak_dikenal", async () => {
    const r = await jalan("test-answer", body({ q: 999 }));
    expect(r.status).toBe(404);
    expect(r.body.kode).toBe("soal_tak_dikenal");
    expect(tulis.some((w) => w.tabel === "answer")).toBe(false);
  });
  it("refuses a part the seat never drew: soal_tak_dikenal", async () => {
    const r = await jalan("test-answer", body({ part: "fitb" }));
    expect(r.body.kode).toBe("soal_tak_dikenal");
  });
  it("refuses an option the question lacks: nilai_salah", async () => {
    const r = await jalan("test-answer", body({ value: { pick: "zz" } }));
    expect(r.status).toBe(400);
    expect(r.body.kode).toBe("nilai_salah");
  });
  it("refuses another format's shape: nilai_salah", async () => {
    const r = await jalan("test-answer", body({ value: { picks: ["aa"] } }));
    expect(r.body.kode).toBe("nilai_salah");
  });
  it("refuses a bad tab id", async () => {
    const r = await jalan("test-answer", body({ tab: "x" }));
    expect(r.status).toBe(400);
  });
  it("refuses once the part ended and its grace is over: waktu_habis", async () => {
    state = {
      ...state,
      runs: {
        logika: run({
          state: "ended",
          mark: null,
          usedMs: 15 * MIN,
          endedAt: Date.now() - 30_000,
          endedBy: "skip",
        }),
      },
    };
    rows.room = [kamar()];
    const r = await jalan("test-answer", body());
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("waktu_habis");
  });
  it("still takes it inside the 5 s grace", async () => {
    state = {
      ...state,
      runs: {
        logika: run({
          state: "ended",
          mark: null,
          usedMs: 15 * MIN,
          endedAt: Date.now() - 2000,
          endedBy: "skip",
        }),
      },
    };
    rows.room = [kamar()];
    const r = await jalan("test-answer", body());
    expect(r.status).toBe(200);
  });
  it("a seat with extra time keeps writing after the room's time", async () => {
    state = {
      ...state,
      runs: { logika: run({ mark: Date.now() - 16 * MIN, extra: { "5": 5 * MIN } }) },
    };
    rows.room = [kamar()];
    const r = await jalan("test-answer", body());
    expect(r.status).toBe(200);
  });
  it("refuses after Kumpulkan: sudah_kumpul", async () => {
    rows.seat = [seat({ done: { logika: Date.now() } })];
    const r = await jalan("test-answer", body());
    expect(r.body.kode).toBe("sudah_kumpul");
  });
  it("refuses a part started in another room: bagian_ruang_lain", async () => {
    rows.seat = [
      seat({
        draw: { logika: { at: 1, room: 8, items: [{ q: 101, v: 1, lang: "cpp", perm: null }] } },
      }),
    ];
    const r = await jalan("test-answer", body());
    expect(r.body.kode).toBe("bagian_ruang_lain");
  });
  it("refuses a voided question: soal_batal", async () => {
    rows.question = [{ ...SOAL(101), voidedAt: new Date() }];
    const r = await jalan("test-answer", body());
    expect(r.body.kode).toBe("soal_batal");
  });
  it("refuses a seat that has not checked in: belum_masuk", async () => {
    rows.seat = [seat({ checkin: { fullscreen: 1 } })];
    const r = await jalan("test-answer", body());
    expect(r.status).toBe(403);
    expect(r.body.kode).toBe("belum_masuk");
  });
  it("warns when another tab wrote within a minute, and tells the pengawas", async () => {
    rows.seat = [seat({ tab: "tab-bbbb", tabAt: new Date(Date.now() - 5000) })];
    rows["w:strike"] = [{ id: 1 }];
    const r = await jalan("test-answer", body());
    expect(r.body.warn).toBe("tab_lain");
    expect(JSON.stringify(r.antre)).toContain("pelanggaran");
  });
  it("says nothing of another tab after a minute", async () => {
    rows.seat = [seat({ tab: "tab-bbbb", tabAt: new Date(Date.now() - 2 * MIN) })];
    const r = await jalan("test-answer", body());
    expect(r.body.warn).toBeUndefined();
  });
});

describe("test-strike", () => {
  it("a page cannot report ganda", async () => {
    const r = await jalan("test-strike", { id: "stk-0001", kinds: ["ganda"], at: Date.now() });
    expect(r.status).toBe(400);
  });
  it("an unknown kind is refused", async () => {
    const r = await jalan("test-strike", { id: "stk-0001", kinds: ["zzz"], at: Date.now() });
    expect(r.status).toBe(400);
  });
  it("stores a good one and sends it to the pengawas", async () => {
    rows.strike = [];
    const r = await jalan("test-strike", {
      id: "stk-0001",
      kinds: ["layar", "fokus"],
      at: Date.now() - 2000,
      back: Date.now(),
    });
    expect(r.status).toBe(200);
    expect(tulis.some((w) => w.tabel === "strike" && w.op === "insert")).toBe(true);
    expect(JSON.stringify(r.antre)).toContain("pelanggaran");
  });
  it("before the parts run it records nothing", async () => {
    state = { ...newRoomState(), stage: "prep" };
    rows.room = [kamar()];
    const r = await jalan("test-strike", { id: "stk-0001", kinds: ["layar"], at: Date.now() });
    expect(r.status).toBe(200);
    expect(tulis.some((w) => w.tabel === "strike")).toBe(false);
  });
  it("stops at 50 records for a part", async () => {
    // the first read looks for this id (none), the second counts the part's records
    let n = 0;
    rows.strike = () => (n++ === 0 ? [] : [{ n: 50 }]);
    const r = await jalan("test-strike", { id: "stk-0009", kinds: ["tab"], at: Date.now() });
    expect(r.body.capped).toBe(true);
    expect(tulis.some((w) => w.tabel === "strike")).toBe(false);
  });
  it("a reload closes what was left open", async () => {
    rows["w:strike"] = [{ id: 1, clientId: "a" }];
    const r = await jalan("test-strike", { resume: true });
    expect(r.status).toBe(200);
    expect(r.body.closed).toBe(1);
  });
});

describe("test-submit and test-checkin", () => {
  it("Kumpulkan before the part started: soal_tak_dikenal", async () => {
    rows.seat = [seat({ draw: {} })];
    const r = await jalan("test-submit", { part: "logika" });
    expect(r.body.kode).toBe("soal_tak_dikenal");
  });
  it("Kumpulkan after the end: waktu_habis", async () => {
    state = {
      ...state,
      runs: {
        logika: run({
          state: "ended",
          mark: null,
          usedMs: 15 * MIN,
          endedAt: Date.now() - 30_000,
          endedBy: "time",
        }),
      },
    };
    rows.room = [kamar()];
    const r = await jalan("test-submit", { part: "logika" });
    expect(r.body.kode).toBe("waktu_habis");
  });
  it("check-in before the room opens: ruang_belum_dibuka", async () => {
    state = newRoomState();
    rows.room = [kamar()];
    rows.seat = [];
    const r = await jalan("test-checkin", { step: "fullscreen", tab: "tab-aaaa" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("ruang_belum_dibuka");
  });
  it("the name before the other two steps: langkah_belum", async () => {
    rows.seat = [seat({ checkin: {} })];
    const r = await jalan("test-checkin", { step: "name", tab: "tab-aaaa" });
    expect(r.body.kode).toBe("langkah_belum");
  });
  it("a check-in with no room at all: ruang_belum_dibuka", async () => {
    rows.seat = [];
    rows.assignment = [];
    rows.room = [];
    const r = await jalan("test-checkin", { step: "fullscreen", tab: "tab-aaaa" });
    expect(r.body.kode).toBe("ruang_belum_dibuka");
  });
});

describe("GET test", () => {
  it("never carries a key, the Master or another seat", async () => {
    const r = await jalan("test", null);
    expect(r.status).toBe(200);
    const txt = JSON.stringify(r.body);
    expect(txt).not.toMatch(/correct|"answer"|master|"ask"/);
    expect((r.body.part as { items: unknown[] }).items).toHaveLength(1);
  });
  it("gives the questions in the seat's own shuffle", async () => {
    const r = await jalan("test", null);
    const v = (r.body.part as { items: { view: { options: { id: string }[] } }[] }).items[0].view;
    expect(v.options.map((o) => o.id)).toEqual(["bb", "aa"]);
  });
  it("gives no part to a seat that handed it in", async () => {
    rows.seat = [seat({ done: { logika: 1 } })];
    const r = await jalan("test", null);
    expect(r.body.part).toBeNull();
  });
  it("gives no part to a seat that is not checked in", async () => {
    rows.seat = [seat({ checkin: { fullscreen: 1 } })];
    const r = await jalan("test", null);
    expect(r.body.part).toBeNull();
  });
  it("gives no part once the seat's own time is over", async () => {
    state = { ...state, runs: { logika: run({ mark: Date.now() - 16 * MIN }) } };
    rows.room = [kamar()];
    const r = await jalan("test", null);
    expect(r.body.part).toBeNull();
  });
  it("a voided question comes as withdrawn, with no body", async () => {
    rows.question = [{ ...SOAL(101), voidedAt: new Date() }];
    const r = await jalan("test", null);
    const it = (r.body.part as { items: { voided: boolean; view: unknown }[] }).items[0];
    expect(it.voided).toBe(true);
    expect(it.view).toBeNull();
  });
  it("a candidate with no room sees an empty view", async () => {
    rows.seat = [];
    rows.assignment = [];
    rows.room = [];
    const r = await jalan("test", null);
    expect(r.body.room).toBeNull();
    expect(r.body.seat).toBeNull();
  });
  it("the seat's own hotspot comes back as its SSID only", async () => {
    rows.room = [
      {
        ...kamar(),
        hotspots: [
          {
            id: "kursi-5",
            owner: { seat: 5 },
            ssid: "HP Calon",
            pass: "g1.sealed",
            cap: 0,
            by: "cand",
          },
        ],
      },
    ];
    const r = await jalan("test", null);
    expect(r.body.hotspot).toEqual({ ssid: "HP Calon" });
    expect(JSON.stringify(r.body)).not.toContain("g1.sealed");
  });
});
