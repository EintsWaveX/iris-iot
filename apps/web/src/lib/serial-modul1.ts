/**
 * Module 1's real data source: the central ESP32's own Serial output, read
 * in the group PC's browser over Web Serial. BLE runs only between the two
 * boards, so nothing else in the room can observe it; the central already
 * prints both halves of every exchange, in either language:
 *
 *   [12:30:01:196] Tombol berubah, mengirim status: 1
 *   [12:30:01:234] Echo dari Peripheral: 1 | Delay (round-trip): 38 ms
 *
 * The sketches are the finalized handbook's, so this only reads what they
 * already print. Pure functions here; the port itself is useSerialBoard.
 */
import type { Reading } from "./telemetry-sim";

export type Modul1Line =
  | { kind: "prompt" } // waiting for the PC's time
  | { kind: "retry" } // the time it got was malformed
  | { kind: "synced" } // it took the time
  | { kind: "send"; ts: string; value: string }
  | { kind: "echo"; ts: string; value: string; delayMs: number }
  | { kind: "peripheral" } // a line only the peripheral prints
  | null;

const TS = String.raw`\[(\d{2}:\d{2}:\d{2}:\d{3})\]`;
const SEND_RE = new RegExp(
  `^${TS} (?:Tombol berubah, mengirim status|Button changed, sending state): (.*)$`,
);
const ECHO_RE = new RegExp(
  `^${TS} (?:Echo dari Peripheral|Echo from Peripheral): (.*?) \\| Delay \\(round[- ]trip\\): (\\d+) ms$`,
);
const PERIPHERAL_RE = new RegExp(`^${TS} (?:Status dari Central|State from Central)`);

export function parseModul1Line(raw: string): Modul1Line {
  const line = raw.trim();
  if (/^(Menunggu waktu PC|Waiting for PC time)/.test(line)) return { kind: "prompt" };
  if (/^(Format tidak dikenali|Format not recognised)/.test(line)) return { kind: "retry" };
  if (/^(Waktu tersinkron|Clock synchronised)/.test(line)) return { kind: "synced" };
  let m = SEND_RE.exec(line);
  if (m) return { kind: "send", ts: m[1], value: m[2] };
  m = ECHO_RE.exec(line);
  if (m) return { kind: "echo", ts: m[1], value: m[2], delayMs: Number(m[3]) };
  if (PERIPHERAL_RE.test(line) || /^(Peripheral siap|Peripheral ready)/.test(line)) {
    return { kind: "peripheral" };
  }
  return null;
}

/** The exact text syncTimeFromSerial() in both sketches scans for. */
export function pcTimeString(d = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

/**
 * Turns send/echo lines into Readings. A send with no echo before the next
 * send is a lost message (the sketch itself drops the wait at that point).
 */
export class Modul1Pairer {
  private pending: string | null = null;
  private value: string | null = null;
  private seq = 0;

  constructor(private group: number) {}

  push(line: Modul1Line): Reading[] {
    if (!line) return [];
    const out: Reading[] = [];
    if (line.kind === "send") {
      if (this.pending) out.push(this.reading(this.pending, null, null));
      this.pending = line.ts;
      this.value = line.value;
    } else if (line.kind === "echo") {
      out.push(this.reading(this.pending, line.ts, line.delayMs, line.value));
      this.pending = null;
    }
    return out;
  }

  private reading(
    tx: string | null,
    rx: string | null,
    delayMs: number | null,
    echo?: string,
  ): Reading {
    this.seq += 1;
    // The button state the Central sent, and the LED state the Peripheral
    // echoed back (the same 0/1 when the link is healthy).
    const n = (v: string | null | undefined) =>
      v != null && /^[01]$/.test(v.trim()) ? Number(v) : null;
    const tombol = n(this.value);
    const led = n(echo);
    const nilai: Record<string, number> = {};
    if (tombol !== null) nilai.tombol = tombol;
    if (led !== null) nilai.led = led;
    return {
      modul: 1,
      group: this.group,
      seq: this.seq,
      tx,
      rx,
      delayMs,
      rssi: null,
      snr: null,
      nilai: Object.keys(nilai).length ? nilai : null,
    };
  }
}

/** Splits a text stream into lines, keeping the unfinished tail. */
export class LineBuffer {
  private tail = "";

  push(chunk: string): string[] {
    const parts = (this.tail + chunk).split(/\r?\n/);
    this.tail = parts.pop() ?? "";
    return parts;
  }
}
