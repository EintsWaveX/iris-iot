/**
 * What a seat sees of Live Coding in C: the state of each dealt problem from
 * its submissions, and that nothing a candidate must not see can ride along.
 */
import { describe, expect, it } from "vitest";
import { stateOf, toSub, type SubRow } from "../recruitment/lcc-api";

const row = (o: Partial<SubRow> & { id: number }): SubRow => ({
  problemId: 1,
  kind: "submit",
  status: "selesai",
  passed: 0,
  total: 8,
  kode: null,
  requestedAt: new Date(o.id * 1000),
  outcome: null,
  ...o,
});
const done = (v: string[]) => ({
  compile: { ok: true, log: "" },
  verdicts: v.map((x) => ({ v: x as never, ms: 3, kb: 100 })),
});
const hand = [
  { id: 1, points: 400 },
  { id: 2, points: 600 },
];

describe("stateOf", () => {
  it("takes the best finished Submit and the points it gave", () => {
    const rows = [
      row({ id: 5, passed: 4, total: 8 }),
      row({ id: 3, passed: 8, total: 8 }),
      row({ id: 2, passed: 1, total: 8 }),
    ];
    const { state, total } = stateOf(hand, rows, () => null);
    expect(state[1].best).toEqual({ passed: 8, total: 8, got: 400 });
    expect(state[2].best).toBeNull();
    expect(total).toBe(400);
  });

  it("a Submit still waiting does not count yet, and shows its place in the queue", () => {
    const rows = [
      row({ id: 9, status: "antre", passed: null, total: null }),
      row({ id: 4, passed: 2, total: 8 }),
    ];
    const { state, total } = stateOf(hand, rows, (id) => (id === 9 ? 3 : null));
    expect(state[1].submit?.status).toBe("antre");
    expect(state[1].position).toBe(3);
    expect(state[1].best).toEqual({ passed: 2, total: 8, got: 100 });
    expect(total).toBe(100);
  });

  it("keeps Run Sample apart from Submit, and never scores a Run", () => {
    const rows = [
      row({ id: 8, kind: "run", passed: 2, total: 2 }),
      row({ id: 7, kind: "submit", passed: 0, total: 8, outcome: done(["wa", "wa"]) }),
    ];
    const { state, total } = stateOf(hand, rows, () => null);
    expect(state[1].run?.kind).toBe("run");
    expect(state[1].submit?.verdicts).toEqual(["wa", "wa"]);
    expect(state[1].best?.got).toBe(0);
    expect(total).toBe(0);
  });

  it("splits the rows by problem and ignores references checks", () => {
    const rows = [
      row({ id: 3, problemId: 2, passed: 10, total: 10 }),
      row({ id: 2, problemId: 9, kind: "check", passed: 10, total: 10 }),
    ];
    const { state, total } = stateOf(hand, rows, () => null);
    expect(state[1].best).toBeNull();
    expect(state[2].best?.got).toBe(600);
    expect(total).toBe(600);
  });

  it("an empty seat has empty states", () => {
    const { state, total } = stateOf(hand, [], () => null);
    expect(state[1]).toEqual({ run: null, submit: null, best: null, position: null });
    expect(total).toBe(0);
  });
});

describe("toSub", () => {
  it("shows the compiler's words only when the build failed", () => {
    const ce = toSub(
      row({ id: 1, outcome: { compile: { ok: false, log: "error: expected ';'" }, verdicts: [] } }),
    );
    expect(ce?.compileLog).toContain("expected");
    expect(ce?.verdicts).toEqual([]);
    expect(toSub(row({ id: 2, outcome: done(["ac"]) }))?.compileLog).toBeNull();
  });

  it("carries verdict codes only, never times, memory, output or code", () => {
    const s = toSub(row({ id: 3, outcome: done(["ac", "tle"]) }))!;
    expect(Object.keys(s).sort()).toEqual(
      ["at", "compileLog", "id", "kind", "kode", "passed", "status", "total", "verdicts"].sort(),
    );
    expect(s.verdicts).toEqual(["ac", "tle"]);
  });

  it("a reference check is not a seat's", () => {
    expect(toSub(row({ id: 4, kind: "check" }))).toBeNull();
  });
});
