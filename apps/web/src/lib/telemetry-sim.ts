/**
 * Stage 11's simulator: plausible per-group message traffic for all four
 * modules, generated entirely client-side. Modelled on the RSSI-with-noise,
 * occasional-loss approach `apps/modul4/tools/fake_hunt.py` already uses to drive
 * the Orange Pi scoreboard without real boards, generalized here across
 * BLE/WebSocket/MQTT/LoRa rather than LoRa alone. Nothing in this file talks
 * to a server -- Stage 11's own gate is "renders and animates from the
 * simulator with no server"; a real telemetry relay is Stage 15's job, and
 * every page that uses this says plainly that what it shows is simulated.
 */

export interface Reading {
  modul: number;
  group: number;
  seq: number;
  /** HH:MM:SS:MS, the sending side's clock. */
  tx: string;
  /** HH:MM:SS:MS, or null if this message never arrived. */
  rx: string | null;
  delayMs: number | null;
  rssi: number;
  snr: number | null;
}

// Two rails per module except MQTT's three -- the broker in the middle is
// real, and drawing it as two rails would teach the wrong shape (the plan's
// own words for this stage). Order is source to destination.
export const RAILS: Record<number, string[]> = {
  1: ["Central", "Peripheral"],
  2: ["ESP32", "Server"],
  3: ["Publisher", "Broker", "Subscriber"],
  4: ["Hunter", "Target"],
};

function timestamp(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`;
}

const NOISE_FLOOR_DBM = -123;

/** Box-Muller, the same noise shape fake_hunt.py's random.gauss produces. */
function gauss(mean: number, sd: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-distance path loss with the multipath spikes a real room has,
 * bottoming out at the SX1276's own noise floor rather than falling
 * forever -- see fake_hunt.py's rssi_at() for the original of this. */
function rssiAt(metres: number): number {
  const base = -40 - 22 * Math.log10(Math.max(metres, 0.5));
  const value = base + gauss(0, 3.5) + (Math.random() < 0.25 ? -8 : 0);
  return Math.round(Math.max(value, NOISE_FLOOR_DBM));
}

// Per-group simulated distance that wanders slowly, like fake_hunt.py's
// hunters, so a group's own successive readings tell one continuous story
// rather than reading as independent noise. Keyed by module too, since a
// group's board pair moves independently per module.
const drift = new Map<string, { distance: number; velocity: number }>();

function driftFor(modul: number, group: number): number {
  const key = `${modul}:${group}`;
  let state = drift.get(key);
  if (!state) {
    state = { distance: 3 + group * 4 + Math.random() * 8, velocity: 0 };
    drift.set(key, state);
  }
  state.velocity = Math.max(-1, Math.min(1, state.velocity + gauss(0, 0.15)));
  state.distance = Math.max(1, Math.min(60, state.distance + state.velocity));
  return state.distance;
}

const seqCounters = new Map<string, number>();

function nextSeq(modul: number, group: number): number {
  const key = `${modul}:${group}`;
  const next = (seqCounters.get(key) ?? 0) + 1;
  seqCounters.set(key, next);
  return next;
}

/** One simulated reading for this module/group. About 4% loss, matching
 * fake_hunt.py's own rate, so the ladder has something real to show broken. */
export function nextReading(modul: number, group: number): Reading {
  const seq = nextSeq(modul, group);
  const rssi = rssiAt(driftFor(modul, group));
  const tx = timestamp();
  if (Math.random() < 0.04) {
    return { modul, group, seq, tx, rx: null, delayMs: null, rssi, snr: null };
  }
  const delayMs = Math.round(8 + Math.random() * 40 + (modul === 4 ? 20 : 0));
  return {
    modul,
    group,
    seq,
    tx,
    rx: timestamp(delayMs),
    delayMs,
    rssi,
    snr: modul === 4 ? Math.round((4 + Math.random() * 7) * 10) / 10 : null,
  };
}

/** The live value passing through each of the five layers right now, in the
 * same order as a module's content `lapisan` array (application, transport,
 * network, data link, physical). Generalizes apps/modul4/src/ui-layers.js's
 * per-layer composition across all four modules, per the plan's own table
 * of what each layer means for each protocol. */
export function describeLayers(reading: Reading): string[] {
  const { modul, seq, rssi, snr, delayMs } = reading;
  const lost = reading.rx === null;
  switch (modul) {
    case 1:
      return [
        `Notify #${seq}${lost ? " (tidak diterima)" : ""}`,
        lost ? "belum diterima" : `diterima ${delayMs} ms setelah dikirim`,
        "tidak ada lapisan jaringan pada BLE",
        `interval koneksi aktif, paket #${seq}`,
        `2,4 GHz, ${rssi} dBm`,
      ];
    case 2:
      return [
        `payload JSON, paket #${seq}${lost ? " (tidak sampai)" : ""}`,
        lost ? "koneksi TCP terputus" : `terkirim lewat TCP, ${delayMs} ms`,
        "IP satu hop menuju Orange Pi",
        "tersambung lewat WiFi 802.11",
        `2,4 GHz, ${rssi} dBm`,
      ];
    case 3:
      return [
        `topic modul3, QoS 0, paket #${seq}${lost ? " (hilang)" : ""}`,
        lost ? "tidak diteruskan broker" : `diteruskan broker, ${delayMs} ms`,
        "IP lewat broker Mosquitto",
        "tersambung lewat WiFi 802.11",
        `2,4 GHz, ${rssi} dBm`,
      ];
    case 4:
    default:
      return [
        `peringkat sementara, paket #${seq}`,
        "tidak ada lapisan transport pada LoRa P2P",
        "tidak ada lapisan jaringan pada LoRa P2P",
        `sync word cocok, urutan ${seq}${lost ? ", hilang" : ""}`,
        `920 MHz, ${rssi} dBm${snr !== null ? `, SNR ${snr} dB` : ""}`,
      ];
  }
}
