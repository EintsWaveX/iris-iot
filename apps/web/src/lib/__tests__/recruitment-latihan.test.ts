/**
 * Mode Latihan, the pure parts: the cookie, the year and the date helpers. The request context is proved
 * here too, since every reader of the practice edition depends on it.
 */
import { describe, expect, it } from "vitest";
import {
  LATIHAN_COOKIE,
  bacaModeLatihan,
  contohBiodata,
  cookieLatihan,
  geserTanggal,
  latihanTahun,
  modeDariCookie,
  selisihHari,
  tahapHariIni,
} from "../recruitment/latihan";
import type { StageKey } from "../recruitment/types";
import { jalankanLatihan, konteksLatihan } from "../../../api/_lib/recruitment-latihan-ctx";

describe("mode", () => {
  it("accepts only the two sides", () => {
    expect(bacaModeLatihan("asisten")).toBe("asisten");
    expect(bacaModeLatihan("caas")).toBe("caas");
    expect(bacaModeLatihan("panitia")).toBeNull();
    expect(bacaModeLatihan(undefined)).toBeNull();
    expect(bacaModeLatihan("")).toBeNull();
  });

  it("reads the mode from a cookie header, among other cookies", () => {
    expect(modeDariCookie(`a=1; ${LATIHAN_COOKIE}=caas; b=2`)).toBe("caas");
    expect(modeDariCookie(`${LATIHAN_COOKIE}=asisten`)).toBe("asisten");
    expect(modeDariCookie(`x${LATIHAN_COOKIE}=caas`)).toBeNull();
    expect(modeDariCookie(`${LATIHAN_COOKIE}=hacker`)).toBeNull();
    expect(modeDariCookie("")).toBeNull();
  });

  it("sets and clears the cookie", () => {
    expect(cookieLatihan("caas")).toContain(`${LATIHAN_COOKIE}=caas`);
    expect(cookieLatihan("caas")).toContain("Max-Age=43200");
    expect(cookieLatihan(null)).toContain("Max-Age=0");
    // Readable by the page, which only draws the bar from it.
    expect(cookieLatihan("asisten")).not.toContain("HttpOnly");
  });
});

describe("year and dates", () => {
  it("keeps the practice year apart from the live one", () => {
    expect(latihanTahun(2026)).toBe(3026);
    expect(latihanTahun(2026)).not.toBe(2026);
  });

  it("counts whole days across a month end and a leap day", () => {
    expect(selisihHari("2026-10-25", "2026-11-02")).toBe(8);
    expect(selisihHari("2028-02-28", "2028-03-01")).toBe(2);
    expect(selisihHari("2026-11-05", "2026-11-01")).toBe(-4);
  });

  it("moves a date by days in both directions", () => {
    expect(geserTanggal("2026-10-30", 3)).toBe("2026-11-02");
    expect(geserTanggal("2026-01-02", -3)).toBe("2025-12-30");
    expect(geserTanggal("2026-05-05", 0)).toBe("2026-05-05");
  });

  it("jumping a stage puts its first day on today and keeps the spacing between events", () => {
    // lompatLatihan moves every event by today minus the stage's first public day.
    const tubesAwal = "2026-12-12";
    const hariIni = "2026-11-05";
    const geser = selisihHari(tubesAwal, hariIni);
    expect(geserTanggal(tubesAwal, geser)).toBe(hariIni);
    const a = "2026-10-25";
    const b = "2027-01-06";
    expect(selisihHari(geserTanggal(a, geser), geserTanggal(b, geser))).toBe(selisihHari(a, b));
    // Jumping back to a stage that already opened moves the calendar forward again.
    expect(selisihHari("2026-11-02", hariIni)).toBe(3);
  });
});

describe("the stage a fresh practice stands at (tahapHariIni)", () => {
  const e = (stage: StageKey | null, startsOn: string, endsOn: string, internal = false) => ({
    stage,
    startsOn,
    endsOn,
    internal,
  });
  const jalan = [
    e("berkas", "2026-10-25", "2026-11-02"),
    e("first_meet", "2026-11-09", "2026-11-09"),
    e("tes_tulis", "2026-11-14", "2026-11-15"),
    e("wawancara", "2026-11-23", "2026-11-27"),
  ];

  it("is the stage of the earliest event that has not ended", () => {
    expect(tahapHariIni(jalan, "2026-10-30")).toBe("berkas");
    expect(tahapHariIni(jalan, "2026-11-02")).toBe("berkas"); // the last day still counts
    expect(tahapHariIni(jalan, "2026-11-05")).toBe("first_meet");
    expect(tahapHariIni(jalan, "2026-11-15")).toBe("tes_tulis");
  });

  it("is the last stage once everything is over, and Berkas with no stages", () => {
    expect(tahapHariIni(jalan, "2027-03-01")).toBe("wawancara");
    expect(tahapHariIni([], "2026-11-05")).toBe("berkas");
    expect(tahapHariIni([e(null, "2026-11-05", "2026-11-06")], "2026-11-05")).toBe("berkas");
  });

  it("ignores the Panitia's internal events and does not depend on the order given", () => {
    const campur = [
      e("tes_tulis", "2026-11-14", "2026-11-15"),
      e("tubes", "2026-11-01", "2026-12-30", true), // internal: never decides where CaAs stand
      e("berkas", "2026-10-25", "2026-11-02"),
    ];
    expect(tahapHariIni(campur, "2026-11-05")).toBe("tes_tulis");
    // after a jump the calendar was moved, so the jumped stage is the one that starts today
    const lompat = jalan.map((x) => ({
      ...x,
      startsOn: geserTanggal(x.startsOn, selisihHari("2026-11-23", "2026-11-05")),
      endsOn: geserTanggal(x.endsOn, selisihHari("2026-11-23", "2026-11-05")),
    }));
    expect(tahapHariIni(lompat, "2026-11-05")).toBe("wawancara");
  });
});

describe("a sample CaAs' biodata (contohBiodata)", () => {
  it("looks like a real one: year, class, phone and Line id", () => {
    const b = contohBiodata("1202244011", "Budi Santoso");
    expect(b.angkatan).toBe(2024);
    expect(b.kelas).toMatch(/^TT-\d\d-\d\d$/);
    expect(b.phone).toMatch(/^0812\d{8}$/);
    expect(b.lineId).toBe("budi.santoso");
  });

  it("never changes for the same person, and differs between people", () => {
    expect(contohBiodata("1202244011", "Budi Santoso")).toEqual(
      contohBiodata("1202244011", "Budi Santoso"),
    );
    expect(contohBiodata("1202244011", "A").phone).not.toBe(contohBiodata("1202254022", "A").phone);
  });

  it("falls back to safe values for an odd NIM or name", () => {
    const b = contohBiodata("x", "***");
    expect(b.angkatan).toBe(2025);
    expect(b.lineId).toBe("latihan");
    expect(b.phone).toMatch(/^0812\d{8}$/);
  });
});

describe("request context", () => {
  const edisi = { id: 7, year: 3026, title: "Latihan", status: "latihan" as const };

  it("is empty outside a practice request", () => {
    expect(konteksLatihan()).toBeUndefined();
  });

  it("is visible through awaits inside the request and gone after it", async () => {
    const dalam = await jalankanLatihan({ mode: "caas", nim: "1", nama: "A", edisi }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return konteksLatihan();
    });
    expect(dalam?.edisi.id).toBe(7);
    expect(dalam?.mode).toBe("caas");
    expect(konteksLatihan()).toBeUndefined();
  });

  it("keeps two requests apart", async () => {
    const a = jalankanLatihan({ mode: "asisten", nim: "1", nama: "A", edisi }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return konteksLatihan()?.nim;
    });
    const b = jalankanLatihan({ mode: "caas", nim: "2", nama: "B", edisi }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return konteksLatihan()?.nim;
    });
    expect(await Promise.all([a, b])).toEqual(["1", "2"]);
  });
});
