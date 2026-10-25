/**
 * Live Coding sheets against Finalkan (prompt 18, fix 3): lc-grade and
 * lc-grade-withdraw read the freeze under the score lock and refuse with
 * nilai_final while the scores are frozen; every accepted write leaves an
 * audit line. The database is a small stateful fake; the order it records
 * (the lock, then the freeze, then the write) is what keeps a sheet from
 * landing on top of a Finalkan that committed a moment earlier.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  recEdition,
  recExamRoom,
  recExamSeat,
  recLivecode,
  recRubricScore,
  recScoreFreeze,
} from "../../src/lib/schema";
import type { Rubric } from "../../src/lib/recruitment/exam-types";

process.env.SESSION_SECRET = "x".repeat(40);

type Row = Record<string, unknown>;
const nama = new Map<unknown, string>([
  [asisten, "asisten"],
  [recEdition, "edition"],
  [recExamRoom, "room"],
  [recExamSeat, "seat"],
  [recLivecode, "livecode"],
  [recRubricScore, "sheet"],
  [recScoreFreeze, "freeze"],
]);

let rows: Record<string, Row[]> = {};
let urutan: string[] = [];
let audit: { aksi: string; detail: unknown }[] = [];

function chain() {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "innerJoin", "leftJoin", "groupBy", "for", "limit"])
    p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = nama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => {
    if (tabel === "freeze") urutan.push("baca-beku");
    return ok((rows[tabel] ?? []).filter((x) => tabel !== "freeze" || x.supersededAt == null));
  };
  return p;
}
function tulisan(op: "insert" | "update" | "delete", t: unknown) {
  const tabel = nama.get(t) ?? "";
  urutan.push(`${op}:${tabel}`);
  const p: Record<string, unknown> = {};
  p.values = (v: Row) => {
    if (tabel === "sheet")
      (rows.sheet ??= []).push({
        subjectId: v.subjectId,
        grader: v.graderNim,
        graderNim: v.graderNim,
        name: v.graderNim,
        values: v.values,
        note: v.note,
        at: new Date(),
      });
    return p;
  };
  p.onConflictDoUpdate = () => p;
  p.where = () => p;
  p.then = (ok: (v: unknown) => unknown) => {
    if (op === "delete") rows[tabel] = [];
    return ok([]);
  };
  return p;
}
vi.mock("../../src/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: (t: unknown) => tulisan("insert", t),
    update: (t: unknown) => tulisan("update", t),
    delete: (t: unknown) => tulisan("delete", t),
    execute: async () => void urutan.push("kunci"),
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
vi.mock("../_lib/recruitment-rights", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  muatPelaku: async () => ({
    orang: { status: "aktif", badges: [] },
    kursi: null,
    hak: {},
    penuh: true,
  }),
}));

const RUBRIK: Rubric = {
  id: 1,
  stage: "tes_tulis",
  kind: "livecode",
  rows: [
    { key: "jalan", label: "Jalan", max: 4, weight: 3 },
    { key: "protokol", label: "Protokol", max: 4, weight: 2 },
  ],
};
vi.mock("../_lib/recruitment-lc-pool", () => ({
  muatRubrik: async () => RUBRIK,
  semaiKolam: async () => undefined,
}));
vi.mock("../_lib/recruitment-lc-common", () => ({ nomorKursi: async () => new Map() }));

const { aksiNilai } = await import("../_lib/recruitment-lc-grade");

const sesi = { role: "asisten", nim: "G1", nama: "G1", exp: 9e9 } as never;
function jalan(aksi: string, body: Record<string, unknown>) {
  const out = { status: 0, body: {} as Record<string, unknown> };
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
  const req = { method: "POST", query: { aksi }, headers: {}, body };
  return aksiNilai(req as never, res as never, sesi, aksi).then(() => out);
}

const BEKU = {
  id: 1,
  editionId: 1,
  by: "AKD",
  at: new Date(),
  supersededAt: null,
  scores: [],
  stats: [],
};
beforeEach(() => {
  urutan = [];
  audit = [];
  rows = {
    edition: [{ id: 1, year: 2026, title: "OR", status: "live" }],
    seat: [{ id: 5, editionId: 1, roomId: 3, candidateId: 11 }],
    room: [{ id: 3, editionId: 1, slotId: null, state: { runs: { livecode: { at: 1 } } } }],
    sheet: [],
    freeze: [],
    livecode: [],
    asisten: [],
  };
});

const NILAI = { jalan: 4, protokol: 3 };

describe("lc-grade and the freeze", () => {
  it("writes a sheet and an audit line while the scores are not frozen", async () => {
    const r = await jalan("lc-grade", { seatId: 5, values: NILAI, note: "rapi" });
    expect(r.status).toBe(200);
    expect(rows.sheet).toHaveLength(1);
    expect(audit).toEqual([{ aksi: "rec_lc_nilai", detail: { seatId: 5, room: 3 } }]);
  });

  it("takes the score lock, reads the freeze, and only then writes", async () => {
    await jalan("lc-grade", { seatId: 5, values: NILAI });
    const kunci = urutan.indexOf("kunci");
    const beku = urutan.indexOf("baca-beku");
    const tulis = urutan.indexOf("insert:sheet");
    expect(kunci).toBeGreaterThanOrEqual(0);
    expect(beku).toBeGreaterThan(kunci);
    expect(tulis).toBeGreaterThan(beku);
  });

  it("is refused with nilai_final while the scores are frozen, and writes nothing", async () => {
    rows.freeze = [BEKU];
    const r = await jalan("lc-grade", { seatId: 5, values: NILAI });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("nilai_final");
    expect(rows.sheet).toEqual([]);
    expect(urutan.filter((x) => x.startsWith("insert") || x.startsWith("update"))).toEqual([]);
    expect(audit).toEqual([]);
  });

  it("a third grader is still refused after the two", async () => {
    rows.sheet = [
      {
        subjectId: 5,
        grader: "A",
        graderNim: "A",
        name: "A",
        values: NILAI,
        note: "",
        at: new Date(1),
      },
      {
        subjectId: 5,
        grader: "B",
        graderNim: "B",
        name: "B",
        values: NILAI,
        note: "",
        at: new Date(2),
      },
    ];
    const r = await jalan("lc-grade", { seatId: 5, values: NILAI });
    expect(r.body.kode).toBe("sudah_dua");
    expect(audit).toEqual([]);
  });
});

describe("lc-grade-withdraw and the freeze", () => {
  it("takes the sheet back and leaves an audit line while not frozen", async () => {
    await jalan("lc-grade", { seatId: 5, values: NILAI });
    audit = [];
    urutan = [];
    const r = await jalan("lc-grade-withdraw", { seatId: 5 });
    expect(r.status).toBe(200);
    expect(rows.sheet).toEqual([]);
    expect(audit).toEqual([{ aksi: "rec_lc_nilai_tarik", detail: { seatId: 5, room: 3 } }]);
    expect(urutan.indexOf("kunci")).toBeLessThan(urutan.indexOf("delete:sheet"));
    expect(urutan.indexOf("baca-beku")).toBeLessThan(urutan.indexOf("delete:sheet"));
  });

  it("is refused with nilai_final while frozen: the sheet stays", async () => {
    await jalan("lc-grade", { seatId: 5, values: NILAI });
    rows.freeze = [BEKU];
    audit = [];
    const r = await jalan("lc-grade-withdraw", { seatId: 5 });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("nilai_final");
    expect(rows.sheet).toHaveLength(1);
    expect(audit).toEqual([]);
  });
});
