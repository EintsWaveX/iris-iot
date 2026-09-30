/**
 * Stage 20: the real counterpart to telemetry-sim.ts. Fetches
 * GET /api/session/telemetry?modul=N&kelompok=M and converts its row into
 * the same `Reading` shape the simulator produces, so Ladder/LayerXray/
 * GroupLive can use either source without knowing which one they got.
 *
 * Module 1's rows come from a group PC reading its central board over Web
 * Serial (serial-modul1.ts), so this returns them the same way.
 */
import type { Reading } from "./telemetry-sim";

interface TelemetryRow {
  seq: number;
  tx: string | null;
  rx: string | null;
  delayMs: number | null;
  rssi: number | null;
  snr: number | null;
  diperbaruiPada: string;
}

// Per (modul, group) key, the highest seq already turned into a Reading --
// so a poll that finds nothing new (the same row still sitting in
// telemetri_terkini) doesn't get replayed into the ladder's history as a
// duplicate hop, and LayerXray doesn't flicker on an unchanged value.
const lastSeqSeen = new Map<string, number>();

/**
 * Returns null when there is no real telemetry yet for this module/group
 * (no session, no agent reporting, or genuinely nothing new since the last
 * call) -- callers fall back to the simulator in that case, never treating
 * null as an error.
 */
export async function fetchLiveReading(modul: number, group: number): Promise<Reading | null> {
  let res: Response;
  try {
    res = await fetch(`/api/session/telemetry?modul=${modul}&kelompok=${group}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: { ok: boolean; reading: TelemetryRow | null };
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (!body.ok || !body.reading) return null;

  const key = `${modul}:${group}`;
  if (body.reading.seq === lastSeqSeen.get(key)) return null; // nothing new
  lastSeqSeen.set(key, body.reading.seq);

  return {
    modul,
    group,
    seq: body.reading.seq,
    tx: body.reading.tx,
    rx: body.reading.rx,
    delayMs: body.reading.delayMs,
    rssi: body.reading.rssi,
    snr: body.reading.snr,
  };
}

/** Clears the de-dup memory for one module/group -- called when a
 *  component switches which group it's showing, so the first poll after a
 *  switch always surfaces whatever is already there instead of treating it
 *  as "unchanged" against a different group's last-seen seq. */
export function resetLiveReadingMemory(modul: number, group: number): void {
  lastSeqSeen.delete(`${modul}:${group}`);
}
