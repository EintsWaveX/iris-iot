/**
 * Which special interview cards apply to a CaAs. First Meet comes from the attendance; angkatan 24 on the IoT
 * course and Teknik Elektro on the IoT practicum come from the form, and when the form did not say the answer is
 * null (the card still shows, with a note to ask).
 */
import { describe, expect, it } from "vitest";
import { kondisiKhusus, tandaiEdit } from "../_lib/recruitment-s4";

describe("kondisiKhusus", () => {
  it("angkatan 24 is asked only when they take the IoT course", () => {
    expect(kondisiKhusus({ angkatan: 2024, mkIot: true }, false).a24).toBe(true);
    expect(kondisiKhusus({ angkatan: 2024, mkIot: false }, false).a24).toBe(false);
    expect(kondisiKhusus({ angkatan: 2025, mkIot: true }, false).a24).toBe(false);
  });

  it("an angkatan 24 whose form did not say gets the card with a note (null)", () => {
    expect(kondisiKhusus({ angkatan: 2024 }, false).a24).toBeNull();
  });

  it("Elektro is asked only when they take the IoT practicum", () => {
    expect(kondisiKhusus({ angkatan: 2025, prodi: "te", praktikumIot: true }, false).te).toBe(true);
    expect(kondisiKhusus({ angkatan: 2025, prodi: "te", praktikumIot: false }, false).te).toBe(
      false,
    );
    expect(kondisiKhusus({ angkatan: 2025, prodi: "te", praktikumIot: null }, false).te).toBeNull();
  });

  it("another prodi is never asked the Elektro card; an unknown prodi is asked to be checked", () => {
    expect(kondisiKhusus({ angkatan: 2025, prodi: "tt", praktikumIot: true }, false).te).toBe(
      false,
    );
    expect(kondisiKhusus({ angkatan: 2025 }, false).te).toBeNull();
  });

  it("passes First Meet through", () => {
    expect(kondisiKhusus({ angkatan: 2025 }, true).fm).toBe(true);
    expect(kondisiKhusus({ angkatan: 2025 }, false).fm).toBe(false);
  });
});

describe("tandaiEdit", () => {
  const t0 = new Date("2026-11-23T00:00:00+07:00");
  const min = (n: number) => new Date(t0.getTime() + n * 60_000);

  it("the first change after sending is sitting number one", () => {
    expect(tandaiEdit({ editedAt: null, editCount: 0 }, t0)).toEqual({
      editedAt: t0,
      editCount: 1,
    });
  });

  it("autosave inside one sitting moves the time but does not count again", () => {
    const first = tandaiEdit({ editedAt: null, editCount: 0 }, t0);
    expect(tandaiEdit(first, min(3))).toEqual({ editedAt: min(3), editCount: 1 });
    expect(tandaiEdit({ editedAt: min(3), editCount: 1 }, min(12))).toEqual({
      editedAt: min(12),
      editCount: 1,
    });
  });

  it("coming back after ten minutes is a new sitting", () => {
    expect(tandaiEdit({ editedAt: t0, editCount: 1 }, min(11))).toEqual({
      editedAt: min(11),
      editCount: 2,
    });
  });
});
