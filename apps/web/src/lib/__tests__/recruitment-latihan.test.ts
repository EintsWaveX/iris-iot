/**
 * Mode Latihan, the pure parts: the cookie, the year, and moving the live
 * calendar so the practice one starts today. The request context is proved
 * here too, since every reader of the practice edition depends on it.
 */
import { describe, expect, it } from "vitest";
import {
  LATIHAN_COOKIE,
  bacaModeLatihan,
  cookieLatihan,
  geseranKalender,
  geserTanggal,
  latihanTahun,
  modeDariCookie,
  selisihHari,
} from "../recruitment/latihan";
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

  it("starts the practice calendar today, whatever order the events come in", () => {
    const geser = geseranKalender(["2026-11-09", "2026-10-25", "2026-11-17"], "2026-12-01");
    expect(geserTanggal("2026-10-25", geser)).toBe("2026-12-01");
    // The spacing between events is kept.
    expect(selisihHari(geserTanggal("2026-10-25", geser), geserTanggal("2026-11-17", geser))).toBe(
      selisihHari("2026-10-25", "2026-11-17"),
    );
    expect(geseranKalender([], "2026-12-01")).toBe(0);
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
