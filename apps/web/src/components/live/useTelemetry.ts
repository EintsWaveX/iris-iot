/**
 * One telemetry stream per (module, group) for the live workspace (Phase 8).
 * The flow, the readings table, the stats strip and the layer panel all read
 * this instead of each polling on its own, so a hidden panel costs nothing.
 *
 * Same source rules as before: real readings first, the simulator only
 * until the first real reading arrives. Since Phase 12 the readings come
 * through the session's stream room as they land (the Pi's after each
 * heartbeat, a group laptop's as its board prints them); the API's copy
 * fills in on open and after a reconnect, and is polled only while the
 * room is down. That first real batch replaces the simulated history,
 * so the two never share a table. A board connected to this very PC
 * (`local`, Module 1's Web Serial link) wins over both.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAliran, useCadangan, useLihat } from "../../lib/aliran-ruang";
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
  /** The running session: its stream room brings readings as they land */
  sesiId: number | null = null,
): Telemetry {
  const [state, setState] = useState<Telemetry>({ history: [], live: false, updatedAt: null });
  const seen = useRef(new Set<string>());
  const cursor = useRef(-1);
  const real = useRef(false);
  const grupRef = useRef(`${modul}:${group}`);
  grupRef.current = `${modul}:${group}`;

  useEffect(() => {
    setState({ history: [], live: false, updatedAt: null });
    seen.current = new Set();
    cursor.current = -1;
    real.current = false;
  }, [modul, group]);

  const aktif = !paused && local === null;

  /** Adds readings not seen before; the first real batch replaces the simulated history */
  const push = useCallback(
    (rows: Reading[], isLive: boolean) => {
      const baru = isLive
        ? rows.filter((r) => {
            const k = kunciBacaan(modul, r);
            if (seen.current.has(k)) return false;
            seen.current.add(k);
            return true;
          })
        : rows;
      // Remember a few hundred keys only (the history keeps 80 rows).
      if (seen.current.size > 800) seen.current = new Set([...seen.current].slice(-400));
      if (!baru.length) return;
      if (isLive) real.current = true;
      setState((prev) => ({
        history: [...(isLive && !prev.live ? [] : prev.history), ...baru].slice(-HISTORY_MAX),
        live: prev.live || isLive,
        updatedAt: Date.now(),
      }));
    },
    [modul],
  );

  // What the API kept: on open, after a reconnect, and while the room is down.
  const ambil = useCallback(async () => {
    const g = `${modul}:${group}`;
    const batch = await fetchLiveReadings(modul, group, cursor.current);
    // A fetch from before a switch of group or module lands nowhere.
    if (g !== grupRef.current) return;
    cursor.current = batch.lastId;
    push(batch.readings, true);
  }, [modul, group, push]);

  const opsi = { ruang: "sesi" as const, sesiId, aktif: aktif && sesiId !== null };
  const status = useAliran(
    opsi,
    ["tel"],
    (m) => {
      if (m.g !== group || !Array.isArray(m.d)) return;
      push(
        (m.d as BarisTelemetri[]).map((r) => ({
          modul,
          group,
          ...(r.id !== undefined ? { id: r.id } : {}),
          seq: r.seq ?? r.id ?? 0,
          tx: r.tx ?? null,
          rx: r.rx ?? null,
          delayMs: r.delayMs ?? null,
          rssi: r.rssi ?? null,
          snr: r.snr ?? null,
          nilai: r.nilai ?? null,
        })),
        true,
      );
    },
    () => void ambil(),
  );
  useLihat(opsi, group);

  useEffect(() => {
    if (aktif) void ambil();
  }, [aktif, ambil]);
  useCadangan(() => void ambil(), ms, aktif && status !== "live");

  // The simulator stands in until the first real reading (no fetch).
  useEffect(() => {
    if (!aktif || !sim) return;
    const id = setInterval(() => {
      if (!real.current && !document.hidden) push([nextReading(modul, group)], false);
    }, ms);
    return () => clearInterval(id);
  }, [aktif, sim, modul, group, ms, push]);

  return local ?? state;
}

/** A Pi's reading by its log id; a Module 1 reading (a laptop's, stored
 *  or not) by its own times, which both copies share */
function kunciBacaan(modul: number, r: Reading): string {
  if (modul !== 1 && r.id !== undefined) return `i${r.id}`;
  return `t${r.tx ?? ""}|${r.rx ?? ""}|${r.delayMs ?? ""}`;
}

interface BarisTelemetri {
  id?: number;
  seq?: number;
  tx?: string | null;
  rx?: string | null;
  delayMs?: number | null;
  rssi?: number | null;
  snr?: number | null;
  nilai?: Record<string, number> | null;
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
