/**
 * Phase 9 (Stage 7e): every module's board output, read over Web Serial on
 * the group laptop. The sketches are the finalized handbook's, in either
 * language, so this only reads what they already print:
 *
 *   M1 Central     [12:30:01:196] Tombol berubah, mengirim status: 1
 *                  [12:30:01:234] Echo dari Peripheral: 1 | Delay (round-trip): 38 ms
 *   M1 Peripheral  [12:30:01:215] Status dari Central: 1 | LED menyala
 *   M2 ESP32       [12:30:01:000] Kirim #12: {"seq":12,"temp":27.3,"hum":61.2}
 *                  [12:30:01:041] Ack #12 dari server: {"seq":12,"at":"..."} | Delay (round-trip): 41 ms
 *   M3 Publisher   [12:30:01:000] Posisi 67 %, publish #12
 *   M3 Subscriber  [12:30:01:052] Topik iris/grup4/pot menerima sampel #12 | Posisi: 67 %
 *   M4 Beacon      [12:30:01:000] Memancar paket #206 (kelompok 4)
 *   M4 Hunter      [12:30:01:090] Paket #206 | RSSI -71 dBm (halus -69.4) | SNR 7.5 dB
 *
 * Module 1's time sync prompt lines are still parsed by serial-modul1.ts.
 */
import { parseModul1Line } from "./serial-modul1";

export type BoardRole =
  "central" | "peripheral" | "esp32" | "publisher" | "subscriber" | "beacon" | "hunter";

export type SerialEvent =
  | { k: "prompt" }
  | { k: "retry" }
  | { k: "synced" }
  | { k: "send"; role: BoardRole; ts: string; seq: number | null; nilai: Record<string, number> }
  | { k: "recv"; role: BoardRole; ts: string; seq: number | null; nilai: Record<string, number> }
  | { k: "echo"; role: BoardRole; ts: string; seq: number | null; rtt: number }
  | { k: "info"; role: BoardRole }
  | null;

const TS = String.raw`\[(\d{2}:\d{2}:\d{2}:\d{3})\]`;
const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

const M1_RECV = new RegExp(
  `^${TS} (?:Status dari Central|State from Central): (\\d) \\| LED (?:menyala|padam|on|off)$`,
);
const M2_SEND = new RegExp(`^${TS} (?:Kirim|Send) #(\\d+): (\\{.*\\})$`);
const M2_ACK = new RegExp(
  `^${TS} Ack #(\\d+) (?:dari server|from server): .*\\| Delay \\(round[- ]trip\\): (\\d+) ms$`,
);
const M3_PUB = new RegExp(`^${TS} (?:Posisi|Position) (\\d+) %, publish #(\\d+)$`);
const M3_SUB = new RegExp(
  `^${TS} (?:Topik|Topic) \\S+ (?:menerima sampel|received sample) #(\\d+) \\| (?:Posisi|Position): (\\d+) %$`,
);
const M4_TX = new RegExp(
  `^${TS} (?:Memancar paket|Transmitted packet) #(\\d+) \\((?:kelompok|group) \\d+\\)$`,
);
const M4_RX = new RegExp(
  `^${TS} (?:Paket|Packet) #(\\d+) \\| RSSI (-?\\d+) dBm \\((?:halus|smoothed) ${NUM}\\) \\| SNR ${NUM} dB$`,
);

function jsonNilai(text: string): Record<string, number> {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, number> = {};
    if (typeof o.temp === "number") out.suhu = o.temp;
    if (typeof o.hum === "number") out.lembap = o.hum;
    return out;
  } catch {
    return {};
  }
}

/** One line of a board's output as an event, or null when it carries no
 *  reading (Wi-Fi dots, banners, errors). */
export function parseSerialLine(modul: number, raw: string): SerialEvent {
  const line = raw.trim();
  if (!line) return null;
  if (modul === 1) {
    const p = parseModul1Line(line);
    if (p?.kind === "prompt") return { k: "prompt" };
    if (p?.kind === "retry") return { k: "retry" };
    if (p?.kind === "synced") return { k: "synced" };
    if (p?.kind === "send") {
      const v = Number(p.value);
      return {
        k: "send",
        role: "central",
        ts: p.ts,
        seq: null,
        nilai: Number.isFinite(v) ? { tombol: v } : {},
      };
    }
    if (p?.kind === "echo")
      return { k: "echo", role: "central", ts: p.ts, seq: null, rtt: p.delayMs };
    const m = M1_RECV.exec(line);
    if (m)
      return { k: "recv", role: "peripheral", ts: m[1], seq: null, nilai: { led: Number(m[2]) } };
    if (p?.kind === "peripheral") return { k: "info", role: "peripheral" };
    return null;
  }
  let m: RegExpExecArray | null;
  if (modul === 2) {
    if ((m = M2_SEND.exec(line)))
      return { k: "send", role: "esp32", ts: m[1], seq: Number(m[2]), nilai: jsonNilai(m[3]) };
    if ((m = M2_ACK.exec(line)))
      return { k: "echo", role: "esp32", ts: m[1], seq: Number(m[2]), rtt: Number(m[3]) };
    return null;
  }
  if (modul === 3) {
    if ((m = M3_PUB.exec(line)))
      return {
        k: "send",
        role: "publisher",
        ts: m[1],
        seq: Number(m[3]),
        nilai: { posisi: Number(m[2]) },
      };
    if ((m = M3_SUB.exec(line)))
      return {
        k: "recv",
        role: "subscriber",
        ts: m[1],
        seq: Number(m[2]),
        nilai: { posisi: Number(m[3]) },
      };
    return null;
  }
  if (modul === 4) {
    if ((m = M4_TX.exec(line)))
      return { k: "send", role: "beacon", ts: m[1], seq: Number(m[2]), nilai: {} };
    if ((m = M4_RX.exec(line)))
      return {
        k: "recv",
        role: "hunter",
        ts: m[1],
        seq: Number(m[2]),
        nilai: { rssi: Number(m[3]), rssiHalus: Number(m[4]), snr: Number(m[5]) },
      };
    return null;
  }
  return null;
}

/** The board roles a module uses, in the order the Live room lists them.
 *  `optional`: Module 4's Beacon (the PC already forwards its send time). */
export const BOARDS: Record<number, { role: BoardRole; optional?: boolean }[]> = {
  1: [{ role: "central" }, { role: "peripheral" }],
  2: [{ role: "esp32" }],
  3: [{ role: "publisher" }, { role: "subscriber" }],
  4: [{ role: "beacon", optional: true }, { role: "hunter" }],
};
