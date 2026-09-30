/**
 * One telemetry stream per (module, group) for the live workspace (Phase 8).
 * The flow, the readings table, the stats strip and the layer panel all read
 * this instead of each polling on its own, so a hidden panel costs nothing.
 *
 * Same source rules as before: every module polls the real relay first
 * (telemetry-live.ts) and uses the simulator only until the first real
 * reading arrives, never mixing the two afterwards. A board connected to
 * this very PC (`local`, Module 1's Web Serial link) wins over both.
 */
import { useEffect, useState } from "react";
import { startPolling } from "../../scripts/polling";
import { fetchLiveReading, resetLiveReadingMemory } from "../../lib/telemetry-live";
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
): Telemetry {
  const [state, setState] = useState<Telemetry>({ history: [], live: false, updatedAt: null });

  useEffect(() => {
    setState({ history: [], live: false, updatedAt: null });
    resetLiveReadingMemory(modul, group);
  }, [modul, group]);

  const polling = !paused && local === null;
  useEffect(() => {
    if (!polling) return;
    let live = false;
    // A poll still in flight when the group or module changes must not
    // land in the new group's history.
    let cancelled = false;
    const push = (r: Reading, isLive: boolean) => {
      if (cancelled) return;
      setState((prev) => ({
        history: [...prev.history, r].slice(-HISTORY_MAX),
        live: prev.live || isLive,
        updatedAt: Date.now(),
      }));
    };
    const stop = startPolling(async () => {
      const real = await fetchLiveReading(modul, group);
      if (real) {
        live = true;
        push(real, true);
        return;
      }
      if (live) return; // real data has started; a quiet poll just means nothing new yet
      push(nextReading(modul, group), false);
    }, ms);
    return () => {
      cancelled = true;
      stop();
    };
  }, [modul, group, polling, ms]);

  return local ?? state;
}

export interface FlowStats {
  avg: number | null;
  loss: number;
  jitter: number | null;
  rssi: number | null;
  snr: number | null;
}

/** Average delay, loss %, jitter (mean change between consecutive delays)
 *  and the latest signal figures, over the last `n` readings. */
export function flowStats(history: Reading[], n = 40): FlowStats {
  const rows = history.slice(-n);
  const d = rows.map((r) => r.delayMs).filter((x): x is number => x !== null);
  const avg = d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
  let jitter: number | null = null;
  if (d.length > 1) {
    let sum = 0;
    for (let i = 1; i < d.length; i++) sum += Math.abs(d[i] - d[i - 1]);
    jitter = Math.round((sum / (d.length - 1)) * 10) / 10;
  }
  const lost = rows.filter((r) => r.rx === null).length;
  const last = [...rows].reverse();
  return {
    avg,
    loss: rows.length ? Math.round((lost / rows.length) * 100) : 0,
    jitter,
    rssi: last.find((r) => r.rssi !== null)?.rssi ?? null,
    snr: last.find((r) => r.snr !== null)?.snr ?? null,
  };
}
