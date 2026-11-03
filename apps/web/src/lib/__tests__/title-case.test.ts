import { describe, expect, it } from "vitest";
import { titleCase } from "../title-case";

describe("titleCase (the mockup's P9.title)", () => {
  it("capitalises each word but keeps the small joining words down", () => {
    expect(titleCase("Semua kandidat")).toBe("Semua Kandidat");
    expect(titleCase("semua format")).toBe("Semua Format");
    expect(titleCase("Tes Tulis dan Program")).toBe("Tes Tulis dan Program");
    expect(titleCase("Every candidate in the list")).toBe("Every Candidate in the List");
  });
  it("starts with a capital even for a joining word, and after a colon", () => {
    expect(titleCase("dan lainnya")).toBe("Dan Lainnya");
    expect(titleCase("Catatan: yang penting")).toBe("Catatan: Yang Penting");
  });
  it("leaves words with digits, slashes and dots, and Chinese text, alone", () => {
    expect(titleCase("TULT 0604 · 18.30")).toBe("TULT 0604 · 18.30");
    expect(titleCase("hasil.xlsx baru")).toBe("hasil.xlsx Baru");
    expect(titleCase("全部考生")).toBe("全部考生");
  });
});
