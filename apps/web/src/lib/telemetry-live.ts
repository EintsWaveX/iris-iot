/**
 * Stage 20: the real counterpart to telemetry-sim.ts. Fetches
 * GET /api/session/telemetry?modul=N&kelompok=M and converts its rows into
 * the same `Reading` shape the simulator produces, so Ladder/LayerXray/
 * GroupLive can use either source without knowing which one they got.
 *
 * The route returns the group's recent readings (not only the newest), so
 * a viewer polling every second or two sees every message the Pi relayed,
 * in order, even when a heartbeat delivers several at once. Each caller
 * keeps its own cursor (the last row id it took), so two views of the same
 * group never take each other's rows.
 *
 * Module 1's rows come from a group PC reading its central board over Web
 * Serial (serial-modul1.ts), so this returns them the same way.
 */
import type { Reading } from "./telemetry-sim";

interface TelemetryRow {
  id?: number;
  seq: number;
  tx: string | null;
  rx: string | null;
  delayMs: number | null;
  rssi: number | null;
  snr: number | null;
  nilai?: Record<string, number> | null;
  diperbaruiPada: string;
}

export interface LiveBatch {
  readings: Reading[];
  /** Pass back as `afterId` on the next call. */
  lastId: number;
}

/**
 * Every reading after `afterId` for this module/group, oldest first. Empty
 * when there is no real telemetry (no session, no agent reporting, or
 * nothing new since the last call); callers fall back to the simulator
 * then, never treating it as an error. Start with `afterId` -1.
 */
export async function fetchLiveReadings(
  modul: number,
  group: number,
  afterId: number,
): Promise<LiveBatch> {
  const none = { readings: [], lastId: afterId };
  let res: Response;
  try {
    res = await fetch(`/api/session/telemetry?modul=${modul}&kelompok=${group}`);
  } catch {
    return none;
  }
  if (!res.ok) return none;

  let body: { ok: boolean; reading: TelemetryRow | null; readings?: TelemetryRow[] };
  try {
    body = await res.json();
  } catch {
    return none;
  }
  if (!body.ok) return none;
  // An older deployment answers with `reading` only.
  const rows = body.readings ?? (body.reading ? [body.reading] : []);
  const fresh = rows.filter((r) => (r.id ?? r.seq) > afterId);
  if (!fresh.length) return none;

  return {
    lastId: Math.max(...fresh.map((r) => r.id ?? r.seq)),
    readings: fresh.map((r) => ({
      modul,
      group,
      seq: r.seq,
      tx: r.tx,
      rx: r.rx,
      delayMs: r.delayMs,
      rssi: r.rssi,
      snr: r.snr,
      nilai: r.nilai ?? null,
    })),
  };
}
