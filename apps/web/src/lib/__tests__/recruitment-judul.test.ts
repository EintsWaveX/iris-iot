import { describe, expect, it } from "vitest";
import { judulAcara } from "../../components/recruitment/judul";
import { EVENT_SEED, PICK_SEED } from "../recruitment/seed";

describe("event titles in English and Mandarin", () => {
  it("translates every stock title, the Pilih Jadwal events included", () => {
    // Mandarin never keeps the Indonesian title, so it shows which ones are stock.
    for (const e of [...EVENT_SEED, ...PICK_SEED])
      expect(judulAcara(e, "zh"), e.title).not.toBe(e.title);
    expect(judulAcara({ title: "Pilih Jadwal Tes Tulis" }, "en")).toBe("Written Test Slot Picking");
    expect(judulAcara({ title: "Pilih Jadwal Wawancara" }, "zh")).toBe("面试选时段");
  });

  it("leaves a title a Panitia member typed as typed", () => {
    expect(judulAcara({ title: "Pilih Jadwal Ulang" }, "en")).toBe("Pilih Jadwal Ulang");
  });
});
