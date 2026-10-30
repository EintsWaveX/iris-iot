/**
 * The judge's database side (B7.3). The database is a scripted fake: each read
 * or write takes the next prepared answer and the calls it saw are kept, so the
 * tests pin what is written and when, not how SQL is spelled. What the real
 * queries do (the claim with SKIP LOCKED) is proved on the rig.
 */
import { describe, expect, it } from "vitest";
import { kirimKode, terimaHasilJudge } from "../recruitment-lc-judge";
import type { Db } from "../recruitment-data";

type Call = { op: string; set?: unknown; values?: unknown };

function scripted(answers: unknown[][]) {
  const calls: Call[] = [];
  const next = () => answers.shift() ?? [];
  const chain = (op: string) => {
    const c: Call = { op };
    calls.push(c);
    const t: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy"]) t[m] = () => t;
    t.set = (v: unknown) => ((c.set = v), t);
    t.values = (v: unknown) => ((c.values = v), t);
    t.returning = () => t;
    t.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(res, rej);
    return t;
  };
  const db = {
    select: () => chain("select"),
    update: () => chain("update"),
    insert: () => chain("insert"),
    execute: () => Promise.resolve(next()),
  } as unknown as Db;
  return { db, calls };
}

const problem = {
  id: 7,
  samples: [{ input: "1 2\n", output: "3\n" }],
  tests: [
    { input: "1 2\n", output: "3\n" },
    { input: "5 5\n", output: "10\n" },
    { input: "0 0\n", output: "0\n" },
  ],
};
const job = (over: Record<string, unknown> = {}) => ({
  id: 41,
  kind: "submit",
  seatId: 3,
  problemId: 7,
  status: "diambil",
  serverId: 9,
  ...over,
});

describe("terimaHasilJudge", () => {
  it("decides accepted and wrong itself and keeps the pass count", async () => {
    const { db, calls } = scripted([[job()], [problem], [{ id: 41 }]]);
    const done = await terimaHasilJudge(db, 9, [
      {
        id: 41,
        compile: { ok: true },
        runs: [
          { st: "ok", out: "3\n", ms: 2, kb: 800 },
          { st: "ok", out: "11\n" },
          { st: "ok", out: "0" },
        ],
      },
    ]);
    expect(done).toEqual([41]);
    const w = calls.find((c) => c.op === "update")!.set as Record<string, unknown>;
    expect(w).toMatchObject({ status: "selesai", passed: 2, total: 3 });
    expect((w.outcome as { verdicts: { v: string }[] }).verdicts.map((v) => v.v)).toEqual([
      "ac",
      "wa",
      "ac",
    ]);
  });

  it("scores a Run Sample against the samples, not the hidden tests", async () => {
    const { db, calls } = scripted([[job({ kind: "run" })], [problem], [{ id: 41 }]]);
    await terimaHasilJudge(db, 9, [
      { id: 41, compile: { ok: true }, runs: [{ st: "ok", out: "3" }] },
    ]);
    const w = calls.find((c) => c.op === "update")!.set as Record<string, unknown>;
    expect(w).toMatchObject({ passed: 1, total: 1 });
  });

  it("a compile error finishes the job with no verdicts and zero passed", async () => {
    const { db, calls } = scripted([[job()], [problem], [{ id: 41 }]]);
    await terimaHasilJudge(db, 9, [{ id: 41, compile: { ok: false, log: "error: expected ';'" } }]);
    const w = calls.find((c) => c.op === "update")!.set as Record<string, unknown>;
    expect(w).toMatchObject({ status: "selesai", passed: 0, total: 3 });
    expect((w.outcome as { compile: { ok: boolean } }).compile.ok).toBe(false);
  });

  it("an answer for a job already finished changes nothing", async () => {
    const { db, calls } = scripted([[job({ status: "selesai" })]]);
    const done = await terimaHasilJudge(db, 9, [{ id: 41, compile: { ok: true }, runs: [] }]);
    expect(done).toEqual([41]);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("an answer for a job of another agent is ignored", async () => {
    const { db, calls } = scripted([[]]);
    const done = await terimaHasilJudge(db, 9, [{ id: 99, compile: { ok: true }, runs: [] }]);
    expect(done).toEqual([]);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("a reference check records whether the reference passed every test", async () => {
    const { db, calls } = scripted([
      [job({ kind: "check", seatId: null })],
      [problem],
      [{ id: 41 }],
      [],
    ]);
    await terimaHasilJudge(db, 9, [
      {
        id: 41,
        compile: { ok: true },
        runs: [
          { st: "ok", out: "3" },
          { st: "ok", out: "10" },
          { st: "ok", out: "0" },
        ],
      },
    ]);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(2);
    expect(updates[1].set).toMatchObject({ checkOk: true });
  });

  it("junk is skipped", async () => {
    const { db } = scripted([]);
    expect(await terimaHasilJudge(db, 9, "nope")).toEqual([]);
    expect(await terimaHasilJudge(db, 9, [null, 5, { id: "x" }])).toEqual([]);
  });
});

describe("kirimKode", () => {
  const base = { kind: "submit" as const, seatId: 3, roomId: 1, problemId: 7, runLimit: 0 };

  it("refuses empty or oversize code before it touches the database", async () => {
    const { db, calls } = scripted([]);
    expect(await kirimKode(db, { ...base, code: "  \n" })).toEqual({
      ok: false,
      kode: "kode_kosong",
    });
    expect(await kirimKode(db, { ...base, code: "x".repeat(40_000) })).toEqual({
      ok: false,
      kode: "kode_terlalu_besar",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses a problem that does not exist", async () => {
    const { db } = scripted([[]]);
    expect(await kirimKode(db, { ...base, code: "int main(){}" })).toEqual({
      ok: false,
      kode: "soal_tidak_ada",
    });
  });

  it("replaces a waiting job of the same seat, problem and kind instead of adding one", async () => {
    const { db, calls } = scripted([[{ id: 7 }], [{ id: 55 }]]);
    const r = await kirimKode(db, { ...base, code: "int main(){return 0;}" });
    expect(r).toEqual({ ok: true, id: 55, replaced: true });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("adds a new job when none is waiting", async () => {
    const { db, calls } = scripted([[{ id: 7 }], [], [{ id: 56 }]]);
    const r = await kirimKode(db, { ...base, code: "int main(){return 0;}" });
    expect(r).toEqual({ ok: true, id: 56, replaced: false });
    expect(calls.find((c) => c.op === "insert")!.values).toMatchObject({
      kind: "submit",
      seatId: 3,
      problemId: 7,
    });
  });

  it("stops at the run limit when one is set, and never for the Akademik's check", async () => {
    const limited = scripted([[{ id: 7 }], [], [{ n: 5 }]]);
    expect(await kirimKode(limited.db, { ...base, runLimit: 5, code: "int main(){}" })).toEqual({
      ok: false,
      kode: "batas_run",
    });
    const check = scripted([[{ id: 7 }], [], [{ id: 60 }]]);
    expect(
      await kirimKode(check.db, {
        ...base,
        kind: "check",
        seatId: null,
        runLimit: 5,
        code: "int main(){}",
      }),
    ).toEqual({ ok: true, id: 60, replaced: false });
  });
});
