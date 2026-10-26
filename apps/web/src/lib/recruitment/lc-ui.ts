/**
 * Live Coding's page rules that need no React (prompt 12, EXAM-ENGINE 9, mockup
 * r3-putar and r3-lc): reading a build log into editor links, which chip esptool
 * found, the flash speeds, the reels' timing for each motion level, the TODO
 * region of a sketch, and the gateway's traffic line. Pure.
 */
import type { Protocol } from "./exam-types.js";
import type { Chip, QueueChip } from "./lc-types.js";

/* ------------------------------------------------------------- build log */

export interface BuildProblem {
  line: number;
  col: number | null;
  level: "error" | "warning";
  text: string;
}

/** gcc's `s.ino:12:5: error: ...` (the agent already cleaned the path to `sketch/`); other files are not the candidate's. */
const GCC = /(?:^|[\s/])s\.ino:(\d+)(?::(\d+))?:\s*(?:fatal )?(error|warning):\s*(.+)$/;

export function parseBuildLog(log: string): BuildProblem[] {
  const out: BuildProblem[] = [];
  for (const raw of log.split("\n")) {
    const m = GCC.exec(raw.trimEnd());
    if (!m) continue;
    out.push({
      line: Number(m[1]),
      col: m[2] ? Number(m[2]) : null,
      level: m[3] === "warning" ? "warning" : "error",
      text: m[4].slice(0, 300),
    });
  }
  return out;
}

/** Lines of the log that are errors, as indices, so the log can underline them. */
export const isProblemLine = (line: string): boolean => GCC.test(line.trimEnd());

/* ----------------------------------------------------------------- flash */

/** 921600 first, then 460800, then 115200 (EXAM-ENGINE 9.5) */
export const FLASH_BAUDS = [921600, 460800, 115200] as const;

/** The chip a detected description names; esptool-js says things like "ESP32-D0WD-V3 (revision v3.1)". */
export function chipOf(desc: string): Chip | "other" {
  if (/^ESP32-S3\b/i.test(desc)) return "esp32s3";
  if (/^ESP32(?![-\w]*\b(?:S2|S3|C2|C3|C5|C6|C61|H2|P4)\b)/i.test(desc)) return "esp32";
  return "other";
}

export const chipLabel = (c: Chip): string => (c === "esp32s3" ? "ESP32-S3" : "ESP32 DevKit V1");

/** The other chip of the two, for "Ganti ke ..." */
export const otherChip = (c: Chip): Chip => (c === "esp32" ? "esp32s3" : "esp32");

/** USB-serial filters for the port picker: CP210x, CH340, FTDI and Espressif's native USB (9.5) */
export const USB_FILTERS = [
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x0403 },
  { usbVendorId: 0x303a },
];

/* ------------------------------------------------------------------ reels */

export type ReelKind = "topic" | "protocol";
export type MotionTier = "full" | "ldm" | "reduce";

export interface ReelTiming {
  /** Window cell height in px */
  cell: number;
  /** Lever pull on the press, ms */
  press: number;
  /** Ms for a cell to pass in the steady run */
  perCell: number;
  /** Cells that pass in the steady run before an answer can land */
  steady: number;
  /** Deceleration onto the answer, ms */
  decel: number;
  /** Settle onto the cell, ms */
  settle: number;
  /** The column and the decoys blur while moving */
  blur: boolean;
  /** The landed ring runs the kit sweep */
  ring: boolean;
  /** No movement at all: jump to the answer and fade it in */
  jump: boolean;
}

export const REEL_CELL = 76;

/** The motion specs of handoffs/08c.md: full, Low Detail (ldm) and reduced motion */
export function reelTiming(kind: ReelKind, tier: MotionTier): ReelTiming {
  const base = { cell: REEL_CELL, press: 140, settle: 360 };
  if (tier === "reduce")
    return {
      ...base,
      press: 0,
      perCell: 0,
      steady: 0,
      decel: 0,
      settle: 0,
      blur: false,
      ring: false,
      jump: true,
    };
  const protocol = kind === "protocol";
  if (tier === "ldm")
    return {
      ...base,
      perCell: 45,
      steady: protocol ? 8 : 14,
      decel: protocol ? 900 : 1200,
      blur: false,
      ring: false,
      jump: false,
    };
  return {
    ...base,
    perCell: 55,
    steady: protocol ? 8 : 14,
    decel: protocol ? 1500 : 2100,
    blur: true,
    ring: true,
    jump: false,
  };
}

/** An automatic or re-rolled result plays by itself: the topic after 500 ms, the protocol 1100 ms after the topic landed. */
export const AUTO_TOPIC_MS = 500;
export const AUTO_PROTOCOL_MS = 1100;

/** The decoy glyph names, in the order the cells show them (the kit's icon names) */
export const DECOY_ICONS = [
  "lamp",
  "thermometer",
  "sliders",
  "door",
  "counter",
  "traffic",
] as const;

/** A result older than this when the page first sees it is not replayed (the candidate reloaded) */
export const REPLAY_WINDOW_MS = 30_000;

/** Whether a result should play its reel now: new to this page, and fresh or from this page's own press. */
export function shouldPlay(
  seen: ReadonlySet<string>,
  what: ReelKind,
  at: number,
  now: number,
  firstLoad: boolean,
): boolean {
  const key = `${what}:${at}`;
  if (seen.has(key)) return false;
  return !firstLoad || now - at <= REPLAY_WINDOW_MS;
}

/** Protocol names for the reel and the brief */
export const PROTOCOL_NAME: Record<Protocol, string> = {
  ble: "BLE",
  httpws: "HTTP / WebSocket",
  mqtt: "MQTT",
};

/* ----------------------------------------------------------------- editor */

export interface TodoRange {
  from: number;
  to: number;
}

/** The lines (1-based, inclusive) from a `// TODO-MULAI` to its `// TODO-SELESAI`; the editor stripes them gold. */
export function todoRanges(code: string): TodoRange[] {
  const out: TodoRange[] = [];
  let from = 0;
  code.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("// TODO-MULAI")) from = i + 1;
    else if (t.startsWith("// TODO-SELESAI") && from) {
      out.push({ from, to: i + 1 });
      from = 0;
    }
  });
  return out;
}

/* ---------------------------------------------------------------- traffic */

/** One line of the gateway's log (EXAM-ENGINE 9.7), as the page receives it */
export interface TrafficLine {
  t: number;
  s: number;
  b?: number;
  via: "ws" | "http" | "mqtt" | "ble";
  dir: "up" | "down" | "sys";
  k: string;
  n: number;
  d: string;
  b64?: true;
}

export const TRAFFIC_KEEP = 400;

/** The list newest last, capped; a line already held (same time, key and text) is not added twice. */
export function addLines(
  list: readonly TrafficLine[],
  more: readonly TrafficLine[],
): TrafficLine[] {
  if (!more.length) return list as TrafficLine[];
  const seen = new Set(list.map(lineKey));
  const fresh = more.filter((l) => !seen.has(lineKey(l)));
  if (!fresh.length) return list as TrafficLine[];
  return [...list, ...fresh].sort((a, b) => a.t - b.t).slice(-TRAFFIC_KEEP);
}

const lineKey = (l: TrafficLine) => `${l.t}|${l.s}|${l.b ?? 0}|${l.via}|${l.dir}|${l.k}|${l.d}`;

/** `HH:MM:SS` of a server ms in the viewer's zone, with ms: `[12:30:01:196]`-like, as the serial stamps */
export function clock(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${p(d.getMilliseconds(), 3)}`;
}

/** The last value seen per MQTT topic, for the panel's "topics" list */
export function lastPerTopic(
  lines: readonly TrafficLine[],
  seatId: number,
): Map<string, TrafficLine> {
  const m = new Map<string, TrafficLine>();
  for (const l of lines)
    if (l.via === "mqtt" && l.dir !== "sys" && l.k.startsWith(`rec/s${seatId}/`)) m.set(l.k, l);
  return m;
}

/** The ticket socket's address from `lc-ticket` ({ url, tiket }) */
export const socketUrl = (url: string, tiket: string): string =>
  `${url}?tiket=${encodeURIComponent(tiket)}`;

/* -------------------------------------------------------------- BLE names */

export const bleName = (seatId: number, board: number): string => `IRIS-s${seatId}-${board}`;
export const blePrefix = (seatId: number): string => `IRIS-s${seatId}-`;

/** Text out of a BLE value (UTF-8 when clean, else hex), and the base64 the log keeps for it */
export function bleText(bytes: Uint8Array): { text: string; b64: string } {
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text)) throw new Error("control");
  } catch {
    text = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join(" ");
  }
  return { text, b64: btoa(bin) };
}

/* ------------------------------------------------------------------ queue */

/** 1-based place among the waiting chips for my board, 0 while it compiles, null when it is not in line. */
export function myPlace(chips: readonly QueueChip[], board: number): number | null {
  const mine = chips.findIndex((c) => c.mine && c.board === board);
  if (mine < 0) return null;
  if (chips[mine].state === "diambil") return 0;
  return chips.slice(0, mine + 1).filter((c) => c.state === "antre").length;
}
