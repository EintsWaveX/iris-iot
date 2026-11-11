import { describe, expect, it } from "vitest";
import { parseSerialLine } from "../serial-lines";
import { LiveRecords, recordStats, selisihMs } from "../live-records";
import type { Reading } from "../telemetry-sim";

const pc = (o: Partial<Reading> & { seq: number }): Reading => ({
  modul: 2,
  group: 4,
  tx: null,
  rx: null,
  delayMs: null,
  rssi: null,
  snr: null,
  ...o,
});

describe("parseSerialLine", () => {
  it("reads every module's board lines in both languages", () => {
    expect(parseSerialLine(1, "[10:00:00:100] Tombol berubah, mengirim status: 1")).toMatchObject({
      k: "send",
      role: "central",
      nilai: { tombol: 1 },
    });
    expect(parseSerialLine(1, "[10:00:00:121] State from Central: 1 | LED on")).toMatchObject({
      k: "recv",
      role: "peripheral",
      nilai: { led: 1 },
    });
    expect(
      parseSerialLine(2, '[10:00:00:000] Kirim #12: {"seq":12,"temp":27.3,"hum":61.2}'),
    ).toMatchObject({ k: "send", seq: 12, nilai: { suhu: 27.3, lembap: 61.2 } });
    expect(
      parseSerialLine(
        2,
        '[10:00:00:041] Ack #12 from server: {"seq":12,"at":"10:00:00:020"} | Delay (round-trip): 41 ms',
      ),
    ).toMatchObject({ k: "echo", seq: 12, rtt: 41 });
    expect(parseSerialLine(3, "[10:00:00:000] Position 67 %, publish #12")).toMatchObject({
      k: "send",
      role: "publisher",
      seq: 12,
      nilai: { posisi: 67 },
    });
    expect(
      parseSerialLine(3, "[10:00:00:052] Topik iris/grup4/pot menerima sampel #12 | Posisi: 67 %"),
    ).toMatchObject({ k: "recv", role: "subscriber", seq: 12 });
    expect(parseSerialLine(4, "[10:00:00:000] Memancar paket #206 (kelompok 4)")).toMatchObject({
      k: "send",
      role: "beacon",
      seq: 206,
    });
    expect(
      parseSerialLine(4, "[10:00:00:090] Packet #206 | RSSI -71 dBm (smoothed -69.4) | SNR 7.5 dB"),
    ).toMatchObject({ k: "recv", seq: 206, nilai: { rssi: -71, rssiHalus: -69.4, snr: 7.5 } });
  });

  it("ignores banners and Wi-Fi dots", () => {
    expect(parseSerialLine(2, "Menyambung ke Wi-Fi.....")).toBeNull();
    expect(parseSerialLine(3, "Terhubung ke broker.")).toBeNull();
    expect(parseSerialLine(4, "Hunter kelompok 4 siap mendengarkan.")).toBeNull();
  });
});

describe("selisihMs", () => {
  it("wraps midnight and rejects nonsense", () => {
    expect(selisihMs("23:59:59:990", "00:00:00:030")).toBe(40);
    expect(selisihMs("10:00:00:100", "10:00:00:050")).toBeNull();
    expect(selisihMs(null, "10:00:00:050")).toBeNull();
  });
});

describe("LiveRecords", () => {
  it("Module 2: the ESP32's send and the PC's receive make the one-way delay", () => {
    const s = new LiveRecords(2);
    s.board(parseSerialLine(2, '[10:00:00:000] Kirim #5: {"seq":5,"temp":27.1,"hum":60}'));
    s.pc(pc({ seq: 5, rx: "10:00:00:018", nilai: { suhu: 27.1, lembap: 60 } }));
    s.board(
      parseSerialLine(2, "[10:00:00:040] Ack #5 dari server: {} | Delay (round-trip): 40 ms"),
    );
    const [r] = s.list();
    expect(r).toMatchObject({
      seq: 5,
      tx: "10:00:00:000",
      rx: "10:00:00:018",
      oneway: 18,
      rtt: 40,
    });
    expect(r.nilai).toEqual({ suhu: 27.1, lembap: 60 });
  });

  it("Module 1: send, the Peripheral's receive and the echo pair without a number", () => {
    const s = new LiveRecords(1);
    s.board(parseSerialLine(1, "[10:00:00:100] Tombol berubah, mengirim status: 1"));
    s.board(parseSerialLine(1, "[10:00:00:119] Status dari Central: 1 | LED menyala"));
    s.board(
      parseSerialLine(1, "[10:00:00:140] Echo dari Peripheral: 1 | Delay (round-trip): 40 ms"),
    );
    s.board(parseSerialLine(1, "[10:00:03:100] Tombol berubah, mengirim status: 0"));
    const rows = s.list();
    expect(rows[0]).toMatchObject({ seq: 1, oneway: 19, rtt: 40, nilai: { tombol: 1, led: 1 } });
    expect(rows[1]).toMatchObject({ seq: 2, tx: "10:00:03:100", rx: null, lost: false });
  });

  it("Module 3: publisher and subscriber by sample number, lost after two newer arrive", () => {
    const s = new LiveRecords(3);
    for (const n of [1, 2, 3]) {
      s.board(parseSerialLine(3, `[10:00:0${n}:000] Posisi ${n * 10} %, publish #${n}`));
      if (n !== 1)
        s.board(
          parseSerialLine(
            3,
            `[10:00:0${n}:050] Topik iris/grup4/pot menerima sampel #${n} | Posisi: ${n * 10} %`,
          ),
        );
    }
    const rows = s.list();
    expect(rows.map((r) => r.lost)).toEqual([true, false, false]);
    expect(rows[1].oneway).toBe(50);
    expect(recordStats(rows)).toMatchObject({ oneway: 50, lost: 33 });
  });

  it("Module 4: the PC's paired row fills in when no board is plugged in", () => {
    const s = new LiveRecords(4);
    s.pc(
      pc({
        seq: 206,
        tx: "10:00:00:000",
        rx: "10:00:00:090",
        delayMs: 90,
        rssi: -71,
        snr: 7.5,
        nilai: { rssiHalus: -69.4, jarak: 6.2 },
      }),
    );
    const [r] = s.list();
    expect(r).toMatchObject({
      oneway: 90,
      rssi: -71,
      snr: 7.5,
      nilai: { rssiHalus: -69.4, jarak: 6.2 },
    });
  });

  it("Module 4: a Hunter's own serial line gets a distance and a trend from its smoothed RSSI", () => {
    const s = new LiveRecords(4);
    for (const [seq, halus] of [
      [1, -60],
      [2, -50],
    ] as const) {
      const e = parseSerialLine(
        4,
        `[10:00:00:090] Packet #${seq} | RSSI ${halus} dBm (smoothed ${halus}) | SNR 7.5 dB`,
      );
      if (e) s.board(e);
    }
    const [a, b] = s.list();
    // -40 dBm at 1 m and n = 2: -60 dBm is 10 m, -50 dBm about 3.2 m
    expect(a.nilai.jarak).toBe(10);
    expect(b.nilai.jarak).toBe(3.2);
    expect(a.nilai.tren).toBeUndefined();
    expect(b.nilai.tren).toBe(10);
  });

  it("Module 4: the PC's calibrated distance wins over the default estimate", () => {
    const s = new LiveRecords(4);
    const e = parseSerialLine(
      4,
      "[10:00:00:090] Packet #7 | RSSI -60 dBm (smoothed -60) | SNR 7 dB",
    );
    if (e) s.board(e);
    s.pc(pc({ modul: 4, seq: 7, nilai: { rssiHalus: -60, jarak: 4.2 } }));
    expect(s.list()[0].nilai.jarak).toBe(4.2);
  });

  it("other modules get no distance", () => {
    const s = new LiveRecords(2);
    s.pc(pc({ seq: 1, nilai: { rssiHalus: -60 } }));
    expect(s.list()[0].nilai.jarak).toBeUndefined();
  });
});
