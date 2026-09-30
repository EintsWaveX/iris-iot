import { describe, it, expect } from "vitest";
import { LineBuffer, Modul1Pairer, parseModul1Line, pcTimeString } from "../serial-modul1";

describe("parseModul1Line", () => {
  it("reads the Indonesian central's send and echo lines", () => {
    expect(parseModul1Line("[12:30:01:196] Tombol berubah, mengirim status: 1")).toEqual({
      kind: "send",
      ts: "12:30:01:196",
      value: "1",
    });
    expect(
      parseModul1Line("[12:30:01:234] Echo dari Peripheral: 1 | Delay (round-trip): 38 ms\r"),
    ).toEqual({ kind: "echo", ts: "12:30:01:234", value: "1", delayMs: 38 });
  });

  it("reads the English central's send and echo lines", () => {
    expect(parseModul1Line("[00:00:05:010] Button changed, sending state: 0")).toMatchObject({
      kind: "send",
      ts: "00:00:05:010",
    });
    expect(
      parseModul1Line("[00:00:05:051] Echo from Peripheral: 0 | Delay (round trip): 41 ms"),
    ).toMatchObject({ kind: "echo", delayMs: 41 });
  });

  it("spots the time prompt, a retry, and the peripheral", () => {
    expect(
      parseModul1Line("Menunggu waktu PC (YYYY-MM-DD HH:MM:SS.mmm), maksimal 10 detik..."),
    ).toEqual({ kind: "prompt" });
    expect(
      parseModul1Line("Waiting for PC time (YYYY-MM-DD HH:MM:SS.mmm), up to 10 seconds..."),
    ).toEqual({ kind: "prompt" });
    expect(parseModul1Line("Format not recognised, send again: YYYY-MM-DD HH:MM:SS.mmm")).toEqual({
      kind: "retry",
    });
    expect(parseModul1Line("Waktu tersinkron dari PC sampai milidetik.")).toEqual({
      kind: "synced",
    });
    expect(parseModul1Line("[12:00:00:000] Status dari Central: 1 | LED MENYALA")).toEqual({
      kind: "peripheral",
    });
    expect(parseModul1Line("Peripheral ready, waiting for Central...")).toEqual({
      kind: "peripheral",
    });
  });

  it("ignores everything else", () => {
    expect(parseModul1Line("Terhubung ke Peripheral!")).toBeNull();
    expect(parseModul1Line("")).toBeNull();
  });
});

describe("Modul1Pairer", () => {
  it("pairs a send with its echo", () => {
    const p = new Modul1Pairer(3);
    expect(p.push(parseModul1Line("[10:00:00:100] Tombol berubah, mengirim status: 1"))).toEqual(
      [],
    );
    const [r] = p.push(
      parseModul1Line("[10:00:00:140] Echo dari Peripheral: 1 | Delay (round-trip): 40 ms"),
    );
    expect(r).toEqual({
      modul: 1,
      group: 3,
      seq: 1,
      tx: "10:00:00:100",
      rx: "10:00:00:140",
      delayMs: 40,
      rssi: null,
      snr: null,
    });
  });

  it("counts a send that never got an echo as lost", () => {
    const p = new Modul1Pairer(1);
    p.push(parseModul1Line("[10:00:00:100] Tombol berubah, mengirim status: 1"));
    const lost = p.push(parseModul1Line("[10:00:01:100] Tombol berubah, mengirim status: 0"));
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ seq: 1, tx: "10:00:00:100", rx: null, delayMs: null });
    const [ok] = p.push(
      parseModul1Line("[10:00:01:130] Echo dari Peripheral: 0 | Delay (round-trip): 30 ms"),
    );
    expect(ok).toMatchObject({ seq: 2, tx: "10:00:01:100", delayMs: 30 });
  });
});

describe("pcTimeString", () => {
  it("matches the sketch's YYYY-MM-DD HH:MM:SS.mmm", () => {
    expect(pcTimeString(new Date(2026, 8, 30, 7, 5, 3, 9))).toBe("2026-09-30 07:05:03.009");
  });
});

describe("LineBuffer", () => {
  it("joins lines split across chunks", () => {
    const b = new LineBuffer();
    expect(b.push("[10:00:00:100] Tombol ber")).toEqual([]);
    expect(b.push("ubah, mengirim status: 1\r\nEcho")).toEqual([
      "[10:00:00:100] Tombol berubah, mengirim status: 1",
    ]);
  });
});
