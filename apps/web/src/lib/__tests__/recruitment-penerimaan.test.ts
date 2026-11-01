import { describe, expect, it } from "vitest";
import {
  cekKode,
  normKode,
  simpanSampai,
  tutupOtomatis,
  usulKode,
} from "../recruitment/penerimaan";

describe("usulKode", () => {
  it("takes the first letters of three words", () => {
    expect(usulKode("Nue Immanuel Tarigan", new Set())).toBe("NIT");
  });

  it("takes the first three letters of a one or two word name", () => {
    expect(usulKode("Sari", new Set())).toBe("SAR");
    expect(usulKode("Sarah", new Set())).toBe("SAR");
    expect(usulKode("Budi Santoso", new Set())).toBe("BUD");
  });

  it("moves on when the code is taken", () => {
    const taken = new Set(["BUD"]);
    const c = usulKode("Budi Santoso", taken);
    expect(c).toMatch(/^[A-Z]{3}$/);
    expect(taken.has(c!)).toBe(false);
    expect(c).toBe("BSA");
  });

  it("drops accents and punctuation", () => {
    expect(usulKode("Éric O'Neil Ramos", new Set())).toBe("EON");
  });

  it("is null when the name has under three letters", () => {
    expect(usulKode("Al", new Set())).toBeNull();
  });

  it("always finds a free code while the name has room", () => {
    const taken = new Set(["ANA", "ABN", "AAN", "NAA"]);
    const c = usulKode("Anna Bana", taken);
    expect(c).not.toBeNull();
    expect(taken.has(c!)).toBe(false);
  });
});

describe("cekKode", () => {
  const taken = new Set(["NAT", "DES"]);

  it("passes three free letters", () => {
    expect(cekKode([{ id: 1, code: "abc" }], taken)).toEqual([
      { id: 1, code: "ABC", problem: null },
    ]);
  });

  it("names each problem", () => {
    const r = cekKode(
      [
        { id: 1, code: "" },
        { id: 2, code: "AB1" },
        { id: 3, code: "XYZ" },
        { id: 4, code: "xyz" },
        { id: 5, code: "nat" },
        { id: 6, code: null },
      ],
      taken,
    );
    expect(r.map((x) => x.problem)).toEqual([
      "kosong",
      "format",
      "ganda",
      "ganda",
      "dipakai",
      "kosong",
    ]);
  });

  it("normalises", () => {
    expect(normKode(" abc ")).toBe("ABC");
    expect(normKode(5)).toBe("");
  });
});

describe("closing", () => {
  it("closes N days after the reveal", () => {
    const r = new Date("2027-01-06T05:00:00Z");
    expect(tutupOtomatis(r, 30)?.toISOString()).toBe("2027-02-05T05:00:00.000Z");
    expect(tutupOtomatis(null, 30)).toBeNull();
  });

  it("keeps the data six months after closing", () => {
    expect(simpanSampai(new Date("2027-02-05T05:00:00Z"), 6).toISOString()).toBe(
      "2027-08-05T05:00:00.000Z",
    );
  });
});
