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
  /** 0 for the newest run of message numbers, -1 for the one before a board restart, and so on */
  run: number;
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

/** A number this far below the highest one seen in a run is a board that restarted, not a late row. */
const RESTART_MARGIN = 5;

/** Local run index of each number, in arrival order: a number far below the run's highest starts the next run. */
function runsOf(seqs: number[]): number[] {
  let run = 0;
  let top = -Infinity;
  return seqs.map((n, i) => {
    if (i > 0 && n < top - RESTART_MARGIN) {
      run += 1;
      top = n;
    } else top = Math.max(top, n);
    return run;
  });
}

/** The scoreboard's own defaults (apps/modul4/server.py RSSI_AT_1M, PATH_LOSS_N and
 *  MAX_RANGE_M): RSSI at 1 m, path-loss exponent for open ground, the farthest it reports. */
const RSSI_1M = -40;
const PATH_LOSS_N = 2;
const MAX_JARAK_M = 2000;

/** Log-distance estimate in metres from a smoothed RSSI, to one decimal, like the scoreboard's. */
export function jarakDariRssi(halus: number, rssi1m = RSSI_1M, n = PATH_LOSS_N): number {
  const d = 10 ** ((rssi1m - halus) / (10 * n));
  return Math.round(Math.min(MAX_JARAK_M, Math.max(0.1, d)) * 10) / 10;
}

/**
 * A Hunter's serial line carries RSSI and smoothed RSSI but no distance or trend,
 * so a record that came only from this laptop's board left "Estimated Distance"
 * and the distance table empty. The PC's own figures (they follow the lab's
 * calibration) are already on the record when the PC has the row; this only fills
 * what is still missing, from the smoothed RSSI with the scoreboard's defaults.
 */
function isiJarakDariRssi(rows: LiveRecord[]) {
  let sebelum: number | undefined;
  let run: number | undefined;
  for (const r of rows) {
    if (r.run !== run) {
      run = r.run;
      sebelum = undefined;
    }
    const halus = r.nilai.rssiHalus;
    if (halus === undefined) continue;
    if (r.nilai.jarak === undefined) r.nilai.jarak = jarakDariRssi(halus);
    if (r.nilai.tren === undefined && sebelum !== undefined)
      r.nilai.tren = Math.round((halus - sebelum) * 10) / 10;
    sebelum = halus;
  }
}

type BoardEvent = Extract<NonNullable<SerialEvent>, { k: "send" | "recv" | "echo" }>;
type Op = { k: "pc"; x: Reading } | { k: "board"; e: BoardEvent };

/**
 * Records are rebuilt from the operations fed to them, so the two sources can be lined up by run:
 * each source numbers its own restarts, and the newest run of each is the current one (a source
 * whose history was cut still ends in the same run as the other).
 */
export class LiveRecords {
  private ops: Op[] = [];

  constructor(private modul: number) {}

  board(e: SerialEvent): void {
    if (!e || (e.k !== "send" && e.k !== "recv" && e.k !== "echo")) return;
    this.ops.push({ k: "board", e });
  }

  /** A row from the PC (or the simulator). Board lines win for the fields
   *  they carry; the PC fills the rest. Module 1's rows came from a group
   *  PC's Central, whose rx is the echo time, so they keep their own delay. */
  pc(x: Reading): void {
    this.ops.push({ k: "pc", x });
  }

  /** Global run of each operation, newest run of its source = 0. Module 1 numbers itself: one run. */
  private runsOfOps(): number[] {
    if (this.modul === 1) return this.ops.map(() => 0);
    const seqOf = (o: Op) => (o.k === "pc" ? o.x.seq : o.e.seq);
    const out: number[] = new Array(this.ops.length).fill(0);
    for (const kind of ["pc", "board"] as const) {
      const idx = this.ops
        .map((o, i) => (o.k === kind && seqOf(o) !== null ? i : -1))
        .filter((i) => i >= 0);
      const local = runsOf(idx.map((i) => seqOf(this.ops[i]) as number));
      const last = local.length ? local[local.length - 1] : 0;
      idx.forEach((i, j) => {
        out[i] = local[j] - last;
      });
    }
    return out;
  }

  /** Oldest first. A record with a send and no receive counts as lost once
   *  two newer ones have arrived. */
  list(): LiveRecord[] {
    const bySeq = new Map<string, LiveRecord>();
    let m1Seq = 0;
    const key = (run: number, seq: number) => `${run}:${seq}`;
    const get = (run: number, seq: number): LiveRecord => {
      let r = bySeq.get(key(run, seq));
      if (!r) {
        r = {
          run,
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
        bySeq.set(key(run, seq), r);
        if (bySeq.size > MAX) {
          // The oldest run goes first, and inside a run the lowest number: never the newest arrival.
          let oldest: LiveRecord | null = null;
          for (const c of bySeq.values())
            if (!oldest || c.run < oldest.run || (c.run === oldest.run && c.seq < oldest.seq))
              oldest = c;
          if (oldest) bySeq.delete(key(oldest.run, oldest.seq));
        }
      }
      return r;
    };
    /** Module 1's newest record still waiting for this kind of line. */
    const m1Open = (field: "rx" | "rtt"): LiveRecord | null => {
      for (let n = m1Seq; n > 0 && n > m1Seq - 3; n--) {
        const r = bySeq.get(key(0, n));
        if (r && r[field] === null) return r;
      }
      return null;
    };
    const settle = (r: LiveRecord) => {
      const d = selisihMs(r.tx, r.rx);
      if (d !== null) r.oneway = d;
      if (r.rx !== null || r.rtt !== null) r.lost = false;
    };

    const runs = this.runsOfOps();
    this.ops.forEach((o, i) => {
      if (o.k === "board") {
        const e = o.e;
        let r: LiveRecord | null;
        if (this.modul === 1) {
          if (e.k === "send") {
            m1Seq += 1;
            r = get(0, m1Seq);
          } else r = m1Open(e.k === "echo" ? "rtt" : "rx");
          if (!r) return;
        } else {
          if (e.seq === null) return;
          r = get(runs[i], e.seq);
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
        settle(r);
      } else {
        const x = o.x;
        if (this.modul === 1) m1Seq = Math.max(m1Seq, x.seq);
        const r = get(runs[i], x.seq);
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
        settle(r);
      }
    });

    const rows = [...bySeq.values()].sort((a, b) => a.run - b.run || a.seq - b.seq);
    const done = (r: LiveRecord) => r.rx !== null || r.rtt !== null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!done(r)) r.lost = r.lost || rows.slice(i + 1).filter(done).length >= 2;
    }
    const out = rows.map((r) => ({ ...r, nilai: { ...r.nilai } }));
    if (this.modul === 4) isiJarakDariRssi(out);
    return out;
  }

  clear() {
    this.ops = [];
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
