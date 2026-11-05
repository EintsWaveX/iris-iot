/**
 * The QR wall's test mode (5 Nov 2026). A test scan is saved in rec_attendance with via "uji" so it needs no
 * migration, which means every other screen that reads attendance must leave it out, or a forgotten test row would
 * count as a real First Meet attendance in Cutting. These tests keep that true for readers added later.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTENDANCE_VIA } from "../recruitment/types";
import { cekQrMap, cekQrSetting, qrDengan, qrUntuk } from "../recruitment/qr-luar";

describe("the uji flag in a QR setting", () => {
  it("is kept by the checker, and only when true", () => {
    expect(cekQrSetting({ mode: "iris", link: "", sheet: "", uji: true })?.uji).toBe(true);
    expect(cekQrSetting({ mode: "iris", link: "", sheet: "", uji: "yes" })).toEqual({
      mode: "iris",
      link: "",
      sheet: "",
    });
    expect(cekQrMap({ "12": { mode: "iris", link: "", sheet: "", uji: true } })?.["12"].uji).toBe(
      true,
    );
  });

  it("makes an IRIS entry that only carries the flag worth saving, and drops it when the flag goes", () => {
    const on = qrDengan({}, 12, { mode: "iris", link: "", sheet: "", uji: true });
    expect(qrUntuk(on, 12).uji).toBe(true);
    const off = qrDengan(on, 12, { mode: "iris", link: "", sheet: "" });
    expect(off).toEqual({});
  });

  it("keeps the other events' entries when one changes", () => {
    const start = { "3": { mode: "luar" as const, link: "https://forms.gle/x", sheet: "" } };
    const map = qrDengan(start, 12, { mode: "iris", link: "", sheet: "", uji: true });
    expect(map["3"]).toEqual(start["3"]);
    expect(qrDengan(map, 12, { mode: "iris", link: "", sheet: "" })).toEqual(start);
  });

  it("is a known attendance source", () => {
    expect(ATTENDANCE_VIA).toContain("uji");
  });
});

describe("every reader of rec_attendance leaves test scans out", () => {
  const lib = join(__dirname, "..", "..", "..", "api", "_lib");
  const berkas = readdirSync(lib).filter(
    (f) => f.endsWith(".ts") && f !== "recruitment-attendance.ts",
  );
  for (const f of berkas) {
    const src = readFileSync(join(lib, f), "utf8");
    // Every `.from(recAttendance)` query has to name "uji" in the statement that follows (a ne() on via)
    const pakai = [...src.matchAll(/\.from\(recAttendance\)/g)];
    if (pakai.length === 0) continue;
    it(`${f}: ${pakai.length} attendance read(s), each excluding via "uji"`, () => {
      for (const m of pakai) {
        const awal = m.index ?? 0;
        const sampai = src.indexOf(";", awal);
        const kalimat = src.slice(awal, sampai === -1 ? undefined : sampai);
        expect(kalimat, `${f} near offset ${awal}`).toContain('ne(recAttendance.via, "uji")');
      }
    });
  }
});
