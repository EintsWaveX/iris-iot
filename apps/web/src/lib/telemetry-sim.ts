import type { Lang } from "./kelas";
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
  /** HH:MM:SS:MS, the sending side's clock -- null for real Module 2/3
   *  telemetry, since the Pi only ever observes the arrival side (see
   *  telemetry-live.ts). Always set for simulated readings and for real
   *  Module 4 data, which exchanges both timestamps over LoRa directly. */
  tx: string | null;
  /** HH:MM:SS:MS, or null if this message never arrived. */
  rx: string | null;
  delayMs: number | null;
  /** null for real Module 2/3 telemetry (WiFi signal strength was never
   *  measured for those, real or simulated -- only Module 4's LoRa link
   *  carries a real RSSI figure). Always set when simulated. */
  rssi: number | null;
  snr: number | null;
  /** Phase 9: the reading itself, per module (telemetri_log.nilai):
   *  M1 {led, tombol}, M2 {suhu, lembap}, M3 {posisi},
   *  M4 {rssiHalus, jarak, tren, hilang}. Absent from an older source. */
  nilai?: Record<string, number> | null;
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

// Slow per-group values for the Live cards: a room's temperature and
// humidity, and a potentiometer someone turns now and then.
const nilaiSim = new Map<string, Record<string, number>>();
const r1 = (x: number) => Math.round(x * 10) / 10;

function simNilai(modul: number, group: number, rssi: number, metres: number) {
  const key = `${modul}:${group}`;
  const prev = nilaiSim.get(key);
  let next: Record<string, number>;
  if (modul === 1) {
    const led = prev ? (Math.random() < 0.3 ? 1 - prev.led : prev.led) : 0;
    next = { led, tombol: led };
  } else if (modul === 2) {
    next = {
      suhu: r1(Math.max(24, Math.min(32, (prev?.suhu ?? 27 + group * 0.3) + gauss(0, 0.15)))),
      lembap: r1(Math.max(45, Math.min(80, (prev?.lembap ?? 60 + group) + gauss(0, 0.4)))),
    };
  } else if (modul === 3) {
    const p = prev?.posisi ?? 20 + group * 10;
    next = {
      posisi: Math.round(Math.max(0, Math.min(100, p + (Math.random() < 0.3 ? gauss(0, 12) : 0)))),
    };
  } else {
    const halus = prev ? prev.rssiHalus * 0.75 + rssi * 0.25 : rssi;
    next = {
      rssiHalus: r1(halus),
      jarak: r1(metres),
      tren: r1(prev ? halus - prev.rssiHalus : 0),
      hilang: prev?.hilang ?? 0,
    };
  }
  nilaiSim.set(key, next);
  return next;
}

/** One simulated reading for this module/group. About 4% loss, matching
 * fake_hunt.py's own rate, so the ladder has something real to show broken. */
export function nextReading(modul: number, group: number): Reading {
  const seq = nextSeq(modul, group);
  const metres = driftFor(modul, group);
  const rssi = rssiAt(metres);
  const tx = timestamp();
  if (Math.random() < 0.04) {
    if (modul === 4) {
      const n = nilaiSim.get("4:" + group);
      if (n) n.hilang += 1;
    }
    return { modul, group, seq, tx, rx: null, delayMs: null, rssi, snr: null };
  }
  const nilai = simNilai(modul, group, rssi, metres);
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
    nilai,
  };
}

/** The live value passing through each of the five layers right now, in the
 * same order as a module's content `lapisan` array (application, transport,
 * network, data link, physical). Generalizes apps/modul4/src/ui-layers.js's
 * per-layer composition across all four modules, per the plan's own table
 * of what each layer means for each protocol. */
export function describeLayers(reading: Reading, lang: Lang = "id"): string[] {
  const { modul, seq, rssi, snr, delayMs } = reading;
  const lost = reading.rx === null;
  const pick = <T>(id: T, en: T, zh: T): T => (lang === "zh" ? zh : lang === "en" ? en : id);
  // Real Module 2/3 telemetry has arrived (not lost) but carries no delay
  // figure at all -- the Pi only ever observes the arrival side, never the
  // ESP32/Pico W's own send time. Simulated readings and Module 4's real
  // data always have one when not lost.
  const delayText = (satuan: string) =>
    delayMs !== null
      ? `${delayMs} ${satuan}`
      : pick("lihat output serial", "see the serial output", "看串口输出");
  const sinyal = rssi !== null ? `${rssi} dBm` : pick("sinyal WiFi", "WiFi signal", "Wi-Fi 信号");
  switch (modul) {
    case 1:
      return pick(
        [
          `Notify #${seq}${lost ? " (tidak diterima)" : ""}`,
          lost ? "belum diterima" : `diterima ${delayText("ms")} setelah dikirim`,
          "tidak ada lapisan jaringan pada BLE",
          `interval koneksi aktif, paket #${seq}`,
          `2,4 GHz, ${sinyal}`,
        ],
        [
          `Notify #${seq}${lost ? " (not received)" : ""}`,
          lost ? "not received yet" : `received ${delayText("ms")} after sending`,
          "BLE has no network layer",
          `connection interval active, packet #${seq}`,
          `2.4 GHz, ${sinyal}`,
        ],
        [
          `Notify #${seq}${lost ? "（未收到）" : ""}`,
          lost ? "还没收到" : `发送后 ${delayText("ms")} 收到`,
          "BLE 没有网络层",
          `连接间隔进行中，数据包 #${seq}`,
          `2.4 GHz，${sinyal}`,
        ],
      );
    case 2:
      return pick(
        [
          `payload JSON, paket #${seq}${lost ? " (tidak sampai)" : ""}`,
          lost ? "koneksi TCP terputus" : `terkirim lewat TCP, ${delayText("ms")}`,
          "IP satu hop menuju Orange Pi",
          "tersambung lewat WiFi 802.11",
          `2,4 GHz, ${sinyal}`,
        ],
        [
          `JSON payload, packet #${seq}${lost ? " (did not arrive)" : ""}`,
          lost ? "TCP connection dropped" : `sent over TCP, ${delayText("ms")}`,
          "one IP hop to the Orange Pi",
          "connected over WiFi 802.11",
          `2.4 GHz, ${sinyal}`,
        ],
        [
          `JSON 数据，数据包 #${seq}${lost ? "（没送到）" : ""}`,
          lost ? "TCP 连接断了" : `通过 TCP 发送，${delayText("ms")}`,
          "一跳 IP 到 Orange Pi",
          "通过 Wi-Fi 802.11 连接",
          `2.4 GHz，${sinyal}`,
        ],
      );
    case 3:
      return pick(
        [
          `topic modul3, QoS 0, paket #${seq}${lost ? " (hilang)" : ""}`,
          lost ? "tidak diteruskan broker" : `diteruskan broker, ${delayText("ms")}`,
          "IP lewat broker Mosquitto",
          "tersambung lewat WiFi 802.11",
          `2,4 GHz, ${sinyal}`,
        ],
        [
          `topic modul3, QoS 0, packet #${seq}${lost ? " (lost)" : ""}`,
          lost ? "not forwarded by the broker" : `forwarded by the broker, ${delayText("ms")}`,
          "IP through the Mosquitto broker",
          "connected over WiFi 802.11",
          `2.4 GHz, ${sinyal}`,
        ],
        [
          `topic modul3，QoS 0，数据包 #${seq}${lost ? "（丢失）" : ""}`,
          lost ? "broker 没有转发" : `broker 已转发，${delayText("ms")}`,
          "IP 经过 Mosquitto broker",
          "通过 Wi-Fi 802.11 连接",
          `2.4 GHz，${sinyal}`,
        ],
      );
    case 4:
    default:
      return pick(
        [
          `peringkat sementara, paket #${seq}`,
          "tidak ada lapisan transport pada LoRa P2P",
          "tidak ada lapisan jaringan pada LoRa P2P",
          `sync word cocok, urutan ${seq}${lost ? ", hilang" : ""}`,
          `920 MHz, ${sinyal}${snr !== null ? `, SNR ${snr} dB` : ""}`,
        ],
        [
          `provisional ranking, packet #${seq}`,
          "LoRa P2P has no transport layer",
          "LoRa P2P has no network layer",
          `sync word matches, sequence ${seq}${lost ? ", lost" : ""}`,
          `920 MHz, ${sinyal}${snr !== null ? `, SNR ${snr} dB` : ""}`,
        ],
        [
          `暂定排名，数据包 #${seq}`,
          "LoRa P2P 没有传输层",
          "LoRa P2P 没有网络层",
          `sync word 匹配，序号 ${seq}${lost ? "，丢失" : ""}`,
          `920 MHz，${sinyal}${snr !== null ? `，SNR ${snr} dB` : ""}`,
        ],
      );
  }
}
