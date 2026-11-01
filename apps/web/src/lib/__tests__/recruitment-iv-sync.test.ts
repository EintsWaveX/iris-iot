import { describe, expect, it } from "vitest";
import { baseOf, mixSheet, sheetDelta, type SheetBase } from "../recruitment/iv-sync";

const empty = (): SheetBase => baseOf(null);

describe("sheetDelta", () => {
  it("sends nothing when nothing changed", () => {
    expect(sheetDelta(empty(), empty())).toBeNull();
  });

  it("sends only the answer keys that changed, never the whole map", () => {
    const old = { ...empty(), answers: { q1: "dari Bekasi", q2: "suka C" } };
    const cur = { ...old, answers: { q1: "dari Bekasi", q2: "suka C dan Python" } };
    const d = sheetDelta(old, cur);
    expect(d?.body.shared).toEqual({ answers: { q2: "suka C dan Python" } });
    expect(d?.next.answers).toEqual({ q1: "dari Bekasi", q2: "suka C dan Python" });
  });

  it("does not send a field the other examiner filled and this one never touched", () => {
    // The partner's verdict arrived (base has it), this examiner only typed an answer.
    const old = { ...empty(), verdict: "lolos" as const };
    const cur = { ...old, answers: { q1: "x" } };
    expect(sheetDelta(old, cur)?.body.shared).toEqual({ answers: { q1: "x" } });
  });

  it("sends own levels apart from the shared part", () => {
    const d = sheetDelta(empty(), { ...empty(), levels: { teknis: 3 } });
    expect(d?.body.levels).toEqual({ teknis: 3 });
    expect(d?.body.shared).toEqual({});
  });
});

describe("mixSheet", () => {
  it("takes what the partner wrote in fields not touched here", () => {
    const old = empty();
    const nu = { ...old, answers: { q1: "dari partner" }, verdict: "ragu" as const };
    const r = mixSheet(old, old, nu);
    expect(r.next.answers).toEqual({ q1: "dari partner" });
    expect(r.next.verdict).toBe("ragu");
    expect(r.changed).toBe(true);
  });

  it("keeps what is being typed here, field by field", () => {
    const old = { ...empty(), answers: { q1: "a" } };
    const loc = { ...old, answers: { q1: "a (diketik)" } };
    const nu = { ...old, answers: { q1: "a dari partner", q2: "baru" } };
    const r = mixSheet(loc, old, nu);
    expect(r.next.answers).toEqual({ q1: "a (diketik)", q2: "baru" });
  });

  it("reports no change when the server copy equals the screen", () => {
    const old = { ...empty(), other: "catatan" };
    expect(mixSheet(old, old, old).changed).toBe(false);
  });

  it("the typed field then goes up in the next delta, the partner's does not", () => {
    const old = { ...empty(), answers: { q1: "a" } };
    const loc = { ...old, answers: { q1: "a (diketik)" } };
    const nu = { ...old, answers: { q1: "a dari partner", q2: "baru" } };
    const mixed = mixSheet(loc, old, nu).next;
    const d = sheetDelta(nu, { ...mixed, levels: nu.levels });
    expect(d?.body.shared).toEqual({ answers: { q1: "a (diketik)" } });
  });
});
