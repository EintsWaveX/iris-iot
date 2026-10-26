/**
 * Phase 9 (Stage 7e): one record per message, with every field the journal
 * table asks for, built from whatever the Live room can see:
 *
 * - board events from Web Serial on this laptop (serial-lines.ts);
 * - the PC's rows for this group (telemetry-live.ts), or the simulator's.
 *
 * Records are keyed by the message number (seq). Module 1's boards print
 * no number, so a Central send opens the next record and the Peripheral's
 * receive and the Central's echo land on the newest open one.
 *
 *   send time   M1 Central, M2 ESP32, M3 Publisher, M4 Beacon (or the PC's tx)
 *   receive     M1 Peripheral, M2 the PC, M3 Subscriber, M4 Hunter (or the PC's rx)
 *   one-way     receive minus send, when both are known
 *   round-trip  M1 and M2 echo lines
 */
import type { Reading } from "./telemetry-sim";
import type { SerialEvent } from "./serial-lines";

export interface LiveRecord {
  seq: number;
  tx: string | null;
  rx: string | null;
  /** One-way delay (ms): the board's own figure from the PC, else rx minus tx. */
  oneway: number | null;
  rtt: number | null;
  rssi: number | null;
  snr: number | null;
  nilai: Record<string, number>;
  /** A newer message arrived and this one never did. */
  lost: boolean;
}

/** "HH:MM:SS:MS" to milliseconds since midnight, or null. */
export function jamMs(t: string | null): number | null {
  const m = t ? /^(\d{2}):(\d{2}):(\d{2}):(\d{3})$/.exec(t) : null;
  if (!m) return null;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]);
}

/** b minus a in ms, across midnight; null when either is missing or the
 *  gap is not a plausible delay (negative after wrapping, or over a minute). */
export function selisihMs(a: string | null, b: string | null): number | null {
  const x = jamMs(a);
  const y = jamMs(b);
  if (x === null || y === null) return null;
  let d = y - x;
  if (d < -43_200_000) d += 86_400_000;
  if (d < 0 || d > 60_000) return null;
  return d;
}

const MAX = 120;

export class LiveRecords {
  private bySeq = new Map<number, LiveRecord>();
  private m1Seq = 0;

  constructor(private modul: number) {}

  private get(seq: number): LiveRecord {
    let r = this.bySeq.get(seq);
    if (!r) {
      r = {
        seq,
        tx: null,
        rx: null,
        oneway: null,
        rtt: null,
        rssi: null,
        snr: null,
        nilai: {},
        lost: false,
      };
      this.bySeq.set(seq, r);
      if (this.bySeq.size > MAX) {
        const oldest = Math.min(...this.bySeq.keys());
        this.bySeq.delete(oldest);
      }
    }
    return r;
  }

  /** Module 1's newest record still waiting for this kind of line. */
  private m1Open(field: "rx" | "rtt"): LiveRecord | null {
    for (let s = this.m1Seq; s > 0 && s > this.m1Seq - 3; s--) {
      const r = this.bySeq.get(s);
      if (r && r[field] === null) return r;
    }
    return null;
  }

  board(e: SerialEvent): void {
    if (!e || (e.k !== "send" && e.k !== "recv" && e.k !== "echo")) return;
    let r: LiveRecord | null;
    if (this.modul === 1) {
      if (e.k === "send") {
        this.m1Seq += 1;
        r = this.get(this.m1Seq);
      } else r = this.m1Open(e.k === "echo" ? "rtt" : "rx");
      if (!r) return;
    } else {
      if (e.seq === null) return;
      r = this.get(e.seq);
    }
    if (e.k === "send") r.tx = e.ts;
    else if (e.k === "recv") r.rx = e.ts;
    else r.rtt = e.rtt;
    if (e.k !== "echo") {
      const { rssi, snr, ...rest } = e.nilai;
      if (rssi !== undefined) r.rssi = rssi;
      if (snr !== undefined) r.snr = snr;
      Object.assign(r.nilai, rest);
    }
    this.settle(r);
  }

  /** A row from the PC (or the simulator). Board lines win for the fields
   *  they carry; the PC fills the rest. Module 1's rows came from a group
   *  PC's Central, whose rx is the echo time, so they keep their own delay. */
  pc(x: Reading): void {
    if (this.modul === 1) {
      this.m1Seq = Math.max(this.m1Seq, x.seq);
    }
    const r = this.get(x.seq);
    r.tx ??= x.tx;
    if (this.modul === 1) {
      r.rtt ??= x.delayMs;
      if (x.rx === null) r.lost = true;
    } else {
      r.rx ??= x.rx;
      if (x.delayMs !== null && r.oneway === null) r.oneway = x.delayMs;
    }
    r.rssi ??= x.rssi;
    r.snr ??= x.snr;
    for (const [k, v] of Object.entries(x.nilai ?? {})) if (!(k in r.nilai)) r.nilai[k] = v;
    this.settle(r);
  }

  private settle(r: LiveRecord) {
    const d = selisihMs(r.tx, r.rx);
    if (d !== null) r.oneway = d;
    if (r.rx !== null || r.rtt !== null) r.lost = false;
  }

  /** Oldest first. A record with a send and no receive counts as lost once
   *  two newer ones have arrived. */
  list(): LiveRecord[] {
    const rows = [...this.bySeq.values()].sort((a, b) => a.seq - b.seq);
    const done = (r: LiveRecord) => r.rx !== null || r.rtt !== null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!done(r)) r.lost = r.lost || rows.slice(i + 1).filter(done).length >= 2;
    }
    return rows.map((r) => ({ ...r, nilai: { ...r.nilai } }));
  }

  clear() {
    this.bySeq.clear();
    this.m1Seq = 0;
  }
}

/** Average one-way, round-trip and jitter, loss %, over complete records. */
export function recordStats(rows: LiveRecord[]) {
  const ow = rows.map((r) => r.oneway).filter((x): x is number => x !== null);
  const rt = rows.map((r) => r.rtt).filter((x): x is number => x !== null);
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  let jit: number | null = null;
  if (ow.length > 1) {
    let s = 0;
    for (let i = 1; i < ow.length; i++) s += Math.abs(ow[i] - ow[i - 1]);
    jit = Math.round(s / (ow.length - 1));
  }
  const lost = rows.length
    ? Math.round((rows.filter((r) => r.lost).length / rows.length) * 100)
    : 0;
  return { oneway: avg(ow), rtt: avg(rt), jitter: jit, lost };
}
