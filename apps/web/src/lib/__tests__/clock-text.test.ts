import { describe, it, expect } from "vitest";
import { clockTime, dayKey } from "../clock-text";
import { localeOf, tanggalPanjang } from "../app";
import type { Lang } from "../kelas";

/**
 * Performance work, Nov 2026: the navigation clock built two Intl formatters every second, and the long date
 * built one per call (1.2 to 1.5 ms each on a 6x slower CPU, 171 ms for the first). These hold the replacements
 * equal to the text the old code produced, so nothing a reader sees changes.
 */

const OLD_TIME = (d: Date) =>
  d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const OLD_DATE = (d: Date, lang: Lang) =>
  d.toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

describe("clockTime", () => {
  it("is the en-GB 24-hour text for every minute of a day, at the edges of each minute", () => {
    for (let m = 0; m < 24 * 60; m++) {
      for (const s of [0, 1, 9, 10, 59]) {
        const d = new Date(2026, 10, 19, Math.floor(m / 60), m % 60, s);
        expect(clockTime(d)).toBe(OLD_TIME(d));
      }
    }
  });

  it("writes midnight as 00:00:00, never 24:00:00", () => {
    expect(clockTime(new Date(2026, 0, 1, 0, 0, 0))).toBe("00:00:00");
    expect(clockTime(new Date(2026, 11, 31, 23, 59, 59))).toBe("23:59:59");
  });

  it("splits the way NavClock shows it: minutes first, seconds dimmed after", () => {
    const t = clockTime(new Date(2026, 10, 19, 21, 5, 9));
    expect(t.slice(0, 5)).toBe("21:05");
    expect(t.slice(5)).toBe(":09");
  });
});

describe("dayKey", () => {
  it("is the local calendar day with two-digit month and day", () => {
    expect(dayKey(new Date(2026, 0, 1, 0, 0, 0))).toBe("2026-01-01");
    expect(dayKey(new Date(2026, 10, 19, 23, 59, 59))).toBe("2026-11-19");
    expect(dayKey(new Date(2028, 1, 29, 12, 0, 0))).toBe("2028-02-29");
    expect(dayKey(new Date(2026, 11, 31, 12, 0, 0))).toBe("2026-12-31");
  });
});

describe("tanggalPanjang (one cached formatter per locale)", () => {
  it.each<Lang>(["id", "en", "zh"])(
    "is the toLocaleDateString text for %s on every day of two years",
    (lang) => {
      for (let n = 0; n < 731; n++) {
        const d = new Date(2026, 0, 1 + n);
        const iso = dayKey(d);
        expect(tanggalPanjang(iso, lang)).toBe(OLD_DATE(new Date(`${iso}T00:00:00`), lang));
      }
    },
  );

  it("still writes Kamis, 19 November 2026 for Indonesian", () => {
    expect(tanggalPanjang("2026-11-19", "id")).toBe("Kamis, 19 November 2026");
  });

  it("gives back what it was given when the date is not a date", () => {
    expect(tanggalPanjang("not a date", "id")).toBe("not a date");
  });

  it("uses a time of day only to pick the day: an ISO timestamp reads as its date", () => {
    expect(tanggalPanjang("2026-11-19T23:30:00", "id")).toBe(tanggalPanjang("2026-11-19", "id"));
  });
});
