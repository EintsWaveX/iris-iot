import { describe, expect, it } from "vitest";
import { batasNilai, kurangCatat, langkahKelompok, pengingatNilai } from "../lupa-nilai.js";

const at = (iso: string) => new Date(iso);

describe("pengingatNilai", () => {
  it("steps through the day and past the deadline", () => {
    expect(pengingatNilai("2026-10-01", at("2026-10-01T14:55:00+07:00"))).toBe("akhir");
    expect(pengingatNilai("2026-10-01", at("2026-10-01T19:59:59+07:00"))).toBe("akhir");
    expect(pengingatNilai("2026-10-01", at("2026-10-01T20:00:00+07:00"))).toBe("malam");
    expect(pengingatNilai("2026-10-01", at("2026-10-01T22:30:00+07:00"))).toBe("terakhir");
    expect(pengingatNilai("2026-10-01", at("2026-10-01T23:00:00+07:00"))).toBe("robot");
    expect(pengingatNilai("2026-10-01", at("2026-10-01T23:59:59+07:00"))).toBe("robot");
    expect(pengingatNilai("2026-10-01", at("2026-10-02T00:00:00+07:00"))).toBe("lewat");
  });
  it("puts the deadline at 23:59:59 WIB", () => {
    expect(batasNilai("2026-10-01").toISOString()).toBe("2026-10-01T16:59:59.000Z");
  });
});

describe("langkahKelompok", () => {
  const dasar = { lengkap: true, terkirim: false, tersimpan: false, robot: null, butuhAkun: false };
  it("is done when sent and saved", () => {
    expect(langkahKelompok({ ...dasar, terkirim: true, tersimpan: true })).toEqual({
      selesai: true,
      kurang: [],
    });
  });
  it("lacks only SeeLabs when sent and the robot failed", () => {
    const r = langkahKelompok({ ...dasar, terkirim: true, robot: "gagal" });
    expect(r.selesai).toBe(false);
    expect(r.kurang).toEqual(["seelabs"]);
  });
  it("starts with the account for a group without a lender", () => {
    const r = langkahKelompok({ ...dasar, butuhAkun: true });
    expect(r.kurang[0]).toBe("akun");
    expect(r.kurang).toEqual(["akun", "kirim", "seelabs"]);
  });
  it("starts with incomplete scores before anything is sent", () => {
    expect(langkahKelompok({ ...dasar, lengkap: false }).kurang[0]).toBe("lengkap");
    expect(langkahKelompok({ ...dasar, lengkap: false, terkirim: true }).kurang).toEqual([
      "seelabs",
    ]);
  });
  it("records only the two steps that count", () => {
    expect(kurangCatat({ terkirim: false, tersimpan: false })).toEqual(["kirim", "seelabs"]);
    expect(kurangCatat({ terkirim: true, tersimpan: false })).toEqual(["seelabs"]);
  });
});
