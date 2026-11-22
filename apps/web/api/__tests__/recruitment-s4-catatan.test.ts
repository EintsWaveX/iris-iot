/**
 * Which special interview cards apply to a CaAs. First Meet comes from the attendance; angkatan 24 on the IoT
 * course and Teknik Elektro on the IoT practicum come from the form, and when the form did not say the answer is
 * null (the card still shows, with a note to ask).
 */
import { describe, expect, it } from "vitest";
import { kondisiKhusus } from "../_lib/recruitment-s4";

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
