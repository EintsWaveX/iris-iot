import { describe, it, expect } from "vitest";
import { RAILS, nextReading } from "../telemetry-sim";

// P7.5: FlowDiagram.tsx (live/FlowDiagram.tsx) renders one lane header per
// RAILS[modul] entry and falls back to RAILS[1] for an unknown module
// number -- this is the actual "lane mapping" the redesign plan calls out
// for a test, since FlowDiagram itself has no other lane logic of its own.
// Module 3 is the one case with a middle lane (its real broker), which is
// exactly the shape a future edit could accidentally collapse back to two.

describe("RAILS (FlowDiagram's lane mapping)", () => {
  it("gives every module 1-4 a non-empty set of lane labels", () => {
    for (const modul of [1, 2, 3, 4]) {
      expect(RAILS[modul]?.length).toBeGreaterThan(0);
    }
  });

  it("gives Module 3 three lanes (publisher, broker, subscriber), unlike every other module", () => {
    expect(RAILS[3]).toHaveLength(3);
    for (const modul of [1, 2, 4]) {
      expect(RAILS[modul]).toHaveLength(2);
    }
  });

  it("has no duplicate lane labels within a module", () => {
    for (const modul of [1, 2, 3, 4]) {
      const lanes = RAILS[modul];
      expect(new Set(lanes).size).toBe(lanes.length);
    }
  });

  it("has no entry for an unknown module, so FlowDiagram's RAILS[modul] ?? RAILS[1] fallback is reachable", () => {
    expect(RAILS[5]).toBeUndefined();
    expect(RAILS[0]).toBeUndefined();
  });
});

describe("nextReading() (the Module 1-4 simulator FlowDiagram polls as its fallback)", () => {
  it("produces a strictly increasing sequence number per module/group pair", () => {
    for (const modul of [1, 2, 3, 4]) {
      const first = nextReading(modul, 1);
      const second = nextReading(modul, 1);
      expect(second.seq).toBeGreaterThan(first.seq);
    }
  });

  it("keeps separate sequences for different groups of the same module", () => {
    const a1 = nextReading(2, 1);
    const b1 = nextReading(2, 2);
    const a2 = nextReading(2, 1);
    expect(a2.seq).toBe(a1.seq + 1);
    // group 2's own sequence is independent of group 1's -- it should not
    // have been bumped by group 1's second call.
    expect(b1.seq).toBeLessThanOrEqual(a2.seq);
  });
});
