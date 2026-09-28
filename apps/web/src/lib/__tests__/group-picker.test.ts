import { describe, it, expect } from "vitest";
import { toGroupValue } from "../group-picker";

// P7.5: the redesign plan asks for a unit test on GroupPicker. This tests
// the one real piece of behaviour it owns -- converting Radix's string-typed
// toggle value back to a group number, and refusing to forward Radix's own
// "" deselect-the-pressed-item event, which would otherwise silently desync
// the caller's controlled `value` from what looks selected on screen.

describe("toGroupValue()", () => {
  it("round-trips a group number through Radix's string value", () => {
    for (const g of [1, 2, 3, 4, 5]) {
      expect(toGroupValue(String(g))).toBe(g);
    }
  });

  it("returns null for Radix's empty-string deselect event", () => {
    expect(toGroupValue("")).toBeNull();
  });
});
