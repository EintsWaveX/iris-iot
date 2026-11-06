/**
 * The two interview-sheet gates, as small decisions: a locked stage closes the sheet for writing, and a sheet
 * with levels missing cannot be sent. Free mode (practice) lifts both.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setBebasHook } from "../../src/lib/recruitment/bebas";
import { sheetBolehKirim, sheetTertutup } from "../_lib/recruitment-s4";

afterEach(() => setBebasHook(() => false));

describe("sheetTertutup", () => {
  it("closes a locked stage for writing, and only for writing", () => {
    expect(sheetTertutup(true, true)).toBe(true);
    expect(sheetTertutup(false, true)).toBe(false);
    expect(sheetTertutup(true, false)).toBe(false);
  });
  it("stays open in free mode", () => {
    setBebasHook(() => true);
    expect(sheetTertutup(true, true)).toBe(false);
  });
});

describe("sheetBolehKirim", () => {
  it("needs nothing missing", () => {
    expect(sheetBolehKirim([])).toBe(true);
    expect(sheetBolehKirim(["levels"])).toBe(false);
  });
  it("lets a sheet with levels missing go in free mode", () => {
    setBebasHook(() => true);
    expect(sheetBolehKirim(["levels", "verdict"])).toBe(true);
  });
});
