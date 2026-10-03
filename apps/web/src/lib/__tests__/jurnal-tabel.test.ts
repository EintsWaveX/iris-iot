import { describe, expect, it } from "vitest";
import { JURNAL, barisJurnal, rataJurnal, tsvJarak, tsvJurnal } from "../jurnal-tabel";
import type { LiveRecord } from "../live-records";

const rec = (o: Partial<LiveRecord> & { seq: number }): LiveRecord => ({
  tx: null,
  rx: null,
  oneway: null,
  rtt: null,
  rssi: null,
  snr: null,
  nilai: {},
  lost: false,
  ...o,
});

describe("jurnal tables", () => {
  it("every module's columns match its keys, and the footer spans the rest", () => {
    for (const m of [1, 2, 3, 4]) {
      const d = JURNAL[m];
      for (const l of ["id", "en"] as const) {
        expect(d[l].cols).toHaveLength(d.keys.length);
        const avgCols = d.keys.filter((k) => k === "oneway" || k === "rtt").length;
        expect(d[l].span + avgCols).toBe(d.keys.length);
      }
    }
  });

  it("takes the last five complete records, skipping lost and unanswered ones", () => {
    const rs = [
      ...Array.from({ length: 6 }, (_, i) =>
        rec({
          seq: i + 1,
          tx: "10:00:00:000",
          rx: "10:00:00:040",
          oneway: 40 + i,
          nilai: { suhu: 27 + i, lembap: 60 },
        }),
      ),
      rec({ seq: 7, lost: true }),
      rec({ seq: 8, tx: "10:00:01:000" }),
    ];
    const rows = barisJurnal(2, rs);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.trial)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]).toMatchObject({ temp: 28, hum: 60, oneway: 41 });
    expect(Object.keys(rows[0])).toEqual(JURNAL[2].keys);
    expect(rataJurnal(2, rows)).toEqual([43, null]);
  });

  it("Module 1 counts an echo as complete and reads the LED from the button", () => {
    const rows = barisJurnal(1, [
      rec({ seq: 1, tx: "09:00:00:000", rtt: 80, nilai: { tombol: 1 } }),
    ]);
    expect(rows[0]).toMatchObject({ led: 1, rtt: 80, rx: null });
  });

  it("copies as tab separated cells with the footer's averages", () => {
    const rows = barisJurnal(3, [
      rec({ seq: 12, tx: "10:00:00:000", rx: "10:00:00:030", oneway: 30, nilai: { posisi: 50 } }),
      rec({ seq: 13, tx: "10:00:01:000", rx: "10:00:01:050", oneway: 50, nilai: { posisi: 51 } }),
    ]);
    const lines = tsvJurnal(3, "en", rows).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0].split("\t")[0]).toBe("Trial no. ...");
    expect(lines[1].split("\t")).toEqual(["1.", "12", "50", "10:00:00:000", "10:00:00:030", "30"]);
    expect(lines[3].split("\t")).toEqual(["Average one-way delay (ms)", "", "", "", "", "40"]);
  });

  it("the distance table keeps blanks blank and says yes or no", () => {
    const t = tsvJarak("id", [
      { real: "1", halus: -48.6, est: 1.2, obs: false },
      { real: "", halus: null, est: null, obs: null },
    ]).split("\n");
    expect(t[1].split("\t")).toEqual(["Dekat", "1", "-48.6", "1.2", "tidak"]);
    expect(t[2].split("\t")).toEqual(["Sedang", "", "", "", ""]);
    expect(t[3].split("\t")[0]).toBe("Jauh");
  });
});
