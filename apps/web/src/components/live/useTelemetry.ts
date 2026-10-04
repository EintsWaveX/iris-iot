/**
 * One telemetry stream per (module, group) for the live workspace (Phase 8).
 * The flow, the readings table, the stats strip and the layer panel all read
 * this instead of each polling on its own, so a hidden panel costs nothing.
 *
 * Same source rules as before: every module polls the real relay first
 * (telemetry-live.ts) and uses the simulator only until the first real
 * reading arrives. That first real batch replaces the simulated history,
 * so the two never share a table. A board connected to this very PC
 * (`local`, Module 1's Web Serial link) wins over both.
 */
import { useEffect, useState } from "react";
import { startPolling } from "../../scripts/polling";
import { fetchLiveReadings } from "../../lib/telemetry-live";
import { nextReading, type Reading } from "../../lib/telemetry-sim";

const HISTORY_MAX = 80;

export interface Telemetry {
  history: Reading[];
  live: boolean;
  updatedAt: number | null;
}

export function useTelemetry(
  modul: number,
  group: number,
  paused: boolean,
  ms = 1000,
  local: Telemetry | null = null,
  /** False keeps the simulator out (the console inspector shows only real rows). */
  sim = true,
): Telemetry {
  const [state, setState] = useState<Telemetry>({ history: [], live: false, updatedAt: null });

  useEffect(() => {
    setState({ history: [], live: false, updatedAt: null });
  }, [modul, group]);

  const polling = !paused && local === null;
  useEffect(() => {
    if (!polling) return;
    let live = false;
    let cursor = -1;
    // A poll still in flight when the group or module changes must not
    // land in the new group's history.
    let cancelled = false;
    const push = (rows: Reading[], isLive: boolean) => {
      if (cancelled || !rows.length) return;
      setState((prev) => ({
        history: [...(isLive && !prev.live ? [] : prev.history), ...rows].slice(-HISTORY_MAX),
        live: prev.live || isLive,
        updatedAt: Date.now(),
      }));
    };
    const stop = startPolling(async () => {
      const batch = await fetchLiveReadings(modul, group, cursor);
      if (cancelled) return;
      cursor = batch.lastId;
      if (batch.readings.length) {
        live = true;
        push(batch.readings, true);
        return;
      }
      if (live || !sim) return; // real data has started; a quiet poll just means nothing new yet
      push([nextReading(modul, group)], false);
    }, ms);
    return () => {
      cancelled = true;
      stop();
    };
  }, [modul, group, polling, ms, sim]);

  return local ?? state;
}

export interface FlowStats {
  avg: number | null;
  loss: number;
  jitter: number | null;
  rssi: number | null;
  snr: number | null;
  /** Mean gap between consecutive arrivals (ms), from the receive times. */
  interval: number | null;
  /** Mean change between consecutive gaps (ms). */
  intervalJitter: number | null;
}

/** "HH:MM:SS:MS" to milliseconds since midnight, or null. */
export function jamKeMs(t: string | null): number | null {
  const m = t ? /^(\d{2}):(\d{2}):(\d{2}):(\d{3})$/.exec(t) : null;
  if (!m) return null;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]);
}

/** Gap to the previous received row, per row (null for the first, for a
 *  lost row, or across a bad timestamp). Wraps past midnight. */
export function selangMs(rows: Reading[]): (number | null)[] {
  let prev: number | null = null;
  return rows.map((r) => {
    const t = jamKeMs(r.rx);
    if (t === null) return null;
    let gap: number | null = null;
    if (prev !== null) {
      gap = t - prev;
      if (gap < 0) gap += 86_400_000;
    }
    prev = t;
    return gap;
  });
}

function meanAndJitter(xs: number[]): [number | null, number | null] {
  if (!xs.length) return [null, null];
  const avg = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  if (xs.length < 2) return [avg, null];
  let sum = 0;
  for (let i = 1; i < xs.length; i++) sum += Math.abs(xs[i] - xs[i - 1]);
  return [avg, Math.round((sum / (xs.length - 1)) * 10) / 10];
}

/** Seq numbers skipped between consecutive rows. A seq that goes down (the
 *  board restarted) or jumps absurdly far starts a fresh run, not a loss. */
function missingSeqs(rows: Reading[]): number {
  let missing = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].seq - rows[i - 1].seq - 1;
    if (gap > 0 && gap < 500) missing += gap;
  }
  return missing;
}

/** Average delay, loss %, jitter (mean change between consecutive delays),
 *  the latest signal figures and the arrival interval, over the last `n`
 *  readings. `seqGaps`: the relay saw every message (Modules 2 and 3), so a
 *  skipped seq is a lost message too, not only a row with no receive time. */
export function flowStats(history: Reading[], n = 40, seqGaps = false): FlowStats {
  const rows = history.slice(-n);
  const d = rows.map((r) => r.delayMs).filter((x): x is number => x !== null);
  const [avg, jitter] = meanAndJitter(d);
  const gaps = selangMs(rows).filter((x): x is number => x !== null);
  const [interval, intervalJitter] = meanAndJitter(gaps);
  const lost = rows.filter((r) => r.rx === null).length + (seqGaps ? missingSeqs(rows) : 0);
  const expected = rows.length + (seqGaps ? missingSeqs(rows) : 0);
  const last = [...rows].reverse();
  return {
    avg,
    loss: expected ? Math.round((lost / expected) * 100) : 0,
    jitter,
    rssi: last.find((r) => r.rssi !== null)?.rssi ?? null,
    snr: last.find((r) => r.snr !== null)?.snr ?? null,
    interval,
    intervalJitter,
  };
}
