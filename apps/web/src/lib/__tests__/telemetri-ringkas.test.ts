import { describe, expect, it } from "vitest";
import { hilangPersen, selisihJamMs } from "../telemetri-ringkas";

describe("selisihJamMs", () => {
  it("subtracts send from receive", () => {
    expect(selisihJamMs("11:54:43:709", "11:54:43:910")).toBe(201);
  });
  it("crosses midnight", () => {
    expect(selisihJamMs("23:59:59:900", "00:00:00:100")).toBe(200);
  });
  it("refuses bad stamps and absurd gaps", () => {
    expect(selisihJamMs(null, "11:00:00:000")).toBeNull();
    expect(selisihJamMs("11:00", "11:00:00:000")).toBeNull();
    expect(selisihJamMs("11:00:00:000", "10:59:59:000")).toBeNull();
    expect(selisihJamMs("11:00:00:000", "11:05:00:000")).toBeNull();
  });
});

describe("hilangPersen", () => {
  it("is the share missing from the seq range", () => {
    expect(hilangPersen([1, 2, 3, 5])).toBe(20);
    expect(hilangPersen([10, 11, 12, 13])).toBe(0);
  });
  it("ignores repeats and needs two rows", () => {
    expect(hilangPersen([1, 1, 2, 4])).toBe(25);
    expect(hilangPersen([7])).toBeNull();
  });
});
