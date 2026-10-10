import { describe, expect, it } from "vitest";
import {
  retensiPada,
  semesterBerikut,
  semesterMulai,
  semesterSebelum,
  semesterSelesai,
} from "../retensi";

describe("semester dates", () => {
  it("starts ganjil in August and genap in February", () => {
    expect(semesterMulai("2026-ganjil")).toBe("2026-08-01");
    expect(semesterMulai("2027-genap")).toBe("2027-02-01");
  });

  it("follows ganjil with the next year's genap", () => {
    expect(semesterBerikut("2026-ganjil")).toBe("2027-genap");
    expect(semesterBerikut("2027-genap")).toBe("2027-ganjil");
    expect(semesterSelesai("2026-ganjil")).toBe("2027-02-01");
  });
});

describe("retention", () => {
  it("keeps only the semester of today", () => {
    expect(retensiPada("2026-10-10")).toEqual({
      semester: "2026-ganjil",
      batas: "2026-08-01",
      berikut: "2027-02-01",
    });
    expect(retensiPada("2027-01-31").semester).toBe("2026-ganjil");
    expect(retensiPada("2027-02-01")).toEqual({
      semester: "2027-genap",
      batas: "2027-02-01",
      berikut: "2027-08-01",
    });
  });

  it("turns over in genap too, with no practicum in it", () => {
    expect(retensiPada("2027-08-01").batas).toBe("2027-08-01");
    expect(semesterSebelum(["2027-genap"], "2027-08-01")).toEqual(["2027-genap"]);
  });

  it("lists only semesters that ended by the cut-off, oldest first", () => {
    expect(
      semesterSebelum(["2026-ganjil", "2026-genap", "2025-ganjil", "2026-genap"], "2026-08-01"),
    ).toEqual(["2025-ganjil", "2026-genap"]);
    // A roster imported early for the next semester stays.
    expect(semesterSebelum(["2027-genap"], "2026-08-01")).toEqual([]);
  });
});
