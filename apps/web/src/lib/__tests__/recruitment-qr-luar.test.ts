import { describe, expect, it } from "vitest";
import {
  bacaSheet,
  cekLinkQr,
  cekQrMap,
  parseCsv,
  qrUntuk,
  scanTerbaru,
  sheetCsvUrl,
} from "../recruitment/qr-luar";

const ID = "1BF1XJhtLKDLst0G225aRZMQ64hjfjQkllS6FVLIXfSs";

describe("qr-luar links", () => {
  it("accepts web links and rejects the rest", () => {
    expect(cekLinkQr("https://forms.gle/abc123")).toBe("https://forms.gle/abc123");
    expect(cekLinkQr("javascript:alert(1)")).toBeNull();
    expect(cekLinkQr("forms.gle/abc")).toBeNull();
    expect(cekLinkQr("https://a.b/with space")).toBeNull();
  });
  it("reads only Google Sheets links and builds the CSV address itself", () => {
    const s = bacaSheet(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=472834596#gid=472834596`);
    expect(s).toEqual({ id: ID, gid: "472834596" });
    expect(sheetCsvUrl(s!)).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=472834596`,
    );
    expect(bacaSheet("https://evil.example/spreadsheets/d/" + ID)).toBeNull();
    expect(bacaSheet(`https://docs.google.com.evil.io/spreadsheets/d/${ID}`)).toBeNull();
  });
  it("cleans the setting map", () => {
    const ok = cekQrMap({ "12": { mode: "luar", link: "https://forms.gle/x", sheet: "" } });
    expect(ok?.["12"].mode).toBe("luar");
    expect(cekQrMap({ "12": { mode: "luar", link: "", sheet: "" } })).toBeNull();
    expect(cekQrMap({ abc: { mode: "iris", link: "", sheet: "" } })).toBeNull();
    expect(qrUntuk(ok!, 99).mode).toBe("iris");
  });
});

describe("qr-luar sheet reading", () => {
  const csv = [
    '"Timestamp","Nama","NIM"',
    '"11/6/2026 13:01:05","Ayu","1"',
    '"11/6/2026 13:02:10","Budi, S.","2"',
    '"11/6/2026 13:03:00","Citra ""C""","3"',
    '"11/6/2026 13:04:30","Dewa","4"',
    '"11/6/2026 13:05:59","Eka","5"',
    "",
  ].join("\r\n");
  it("parses quotes, commas and CRLF", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(6);
    expect(rows[2][1]).toBe("Budi, S.");
    expect(rows[3][1]).toBe('Citra "C"');
  });
  it("returns the last four, newest first, with the clock time", () => {
    expect(scanTerbaru(parseCsv(csv))).toEqual([
      { nama: "Eka", jam: "13:05" },
      { nama: "Dewa", jam: "13:04" },
      { nama: 'Citra "C"', jam: "13:03" },
      { nama: "Budi, S.", jam: "13:02" },
    ]);
  });
  it("is empty with only a header", () => {
    expect(scanTerbaru(parseCsv('"Timestamp","Nama"\n'))).toEqual([]);
  });
});
