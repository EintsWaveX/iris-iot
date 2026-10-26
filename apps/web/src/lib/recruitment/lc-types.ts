/**
 * Live Coding (EXAM-ENGINE 9, prompt 12): the shapes the topic pool, a seat's
 * editor state, the compile queue and the traffic log share. Browser safe,
 * types and constants only; the rules live in the lc-*.ts modules beside it.
 */
import type { Protocol } from "./exam-types.js";
import type { RerollReason } from "./room-api.js";

/** A topic is dealt only when it is ready; a draft is being written. */
export const TOPIC_STATUS = ["draft", "ready"] as const;
export type TopicStatus = (typeof TOPIC_STATUS)[number];

/** HTTP/WebSocket seats pick one of the two in the editor (9.1). */
export const LC_VARIANTS = ["http", "ws"] as const;
export type LcVariant = (typeof LC_VARIANTS)[number];

/** The template keys: one per protocol, two for HTTP/WebSocket (9.3). */
export const TEMPLATE_KEYS = ["ble", "http", "ws", "mqtt"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Which template a seat starts from, given its protocol and variant. */
export function templateKey(protocol: Protocol, variant: LcVariant | null): TemplateKey {
  if (protocol === "httpws") return variant === "ws" ? "ws" : "http";
  return protocol;
}

/** The chips a board can be (9.3a) and the arduino-cli targets they build for. */
export const CHIPS = ["esp32", "esp32s3"] as const;
export type Chip = (typeof CHIPS)[number];
export const FQBN: Record<Chip, string> = {
  esp32: "esp32:esp32:esp32",
  esp32s3: "esp32:esp32:esp32s3",
};
/** What esptool-js reports for each chip. */
export const CHIP_NAME: Record<Chip, string> = { esp32: "ESP32", esp32s3: "ESP32-S3" };

/** The reasons a Master gives for a re-roll (11.3, a fixed list; room-api.ts owns it). */
export type RerollWhy = RerollReason;

export const CODE_MAX = 64 * 1024;
export const BOARDS_MAX = 2;

/** A topic as the pool editor and the deal see it. `hints` is for graders only. */
export interface LcTopic {
  id: number;
  title: string;
  brief: string;
  fits: Protocol[];
  parts: string[];
  libs: string[];
  hints: string;
  icon: string;
  status: TopicStatus;
  sample: boolean;
}

/** What a seat may read about its topic: never `hints`, never the pool. */
export interface LcTopicSelf {
  id: number;
  title: string;
  brief: string;
  parts: string[];
  icon: string;
}

/** One entry of the seat's spin log. */
export interface LcSpin {
  at: number;
  what: "topic" | "protocol";
  /** Topic id or protocol key */
  value: number | string;
  by: "seat" | "auto" | "master";
  /** For a re-roll: the fixed reason, shown to the seat as "oleh pengawas" */
  reason?: RerollWhy;
}

/** One board's editor state (9.3a). */
export interface LcBoard {
  n: 1 | 2;
  chip: Chip;
  code: string;
  rev: number;
  /** The hotspot the Master moved this board to, else null (the plan decides) */
  moved?: string | null;
}

/** A compile or flash the seat did; the newest 50 are kept (9.1). */
export interface LcRun {
  at: number;
  kind: "compile" | "flash";
  board: 1 | 2;
  ok: boolean;
  ms: number;
  kode?: string;
  job?: number;
  chip?: string;
}

export const RUNS_MAX = 50;

/** The seat's MQTT account; the password is sealed with rahasia.ts. */
export interface LcMqtt {
  u: string;
  p: string;
}

/** Compile job states (9.4). */
export const JOB_STATUS = ["antre", "diambil", "selesai", "gagal"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const JOB_KODE = [
  "galat_kompilasi",
  "waktu_habis",
  "berbahaya",
  "terlalu_besar",
  "agen_galat",
  "agen_diam",
] as const;
export type JobKode = (typeof JOB_KODE)[number];

/** What the agent receives (9.4). */
export interface CompileJob {
  id: number;
  sketch: string;
  fqbn: string;
  /** iris_seat.h */
  header: string;
  libs: string[];
  timeoutS: 120;
  put: { url: string; tiket: string };
}

/** What the agent answers (9.4). */
export interface CompileResult {
  id: number;
  ok: boolean;
  ms: number;
  log: string;
  bin?: { size: number; sha256: string };
  kode?: JobKode;
}

/** The queue as a seat sees it: seat numbers only, never names. */
export interface QueueChip {
  seat: number;
  board: 1 | 2;
  state: "antre" | "diambil";
  mine: boolean;
}

/** How the seat reaches the other end (9.6), the addresses with the token elided. */
export interface LcEndpoints {
  ws?: string;
  http?: string;
  mqtt?: { host: string; topicUp: string; topicDown: string };
  ble?: { name: string; service: string; tx: string; rx: string };
}

/* --------------------------------------------------------- traffic log (9.7) */

export const VIA = ["mqtt", "ws", "http", "ble"] as const;
export type Via = (typeof VIA)[number];

export interface TrafficLine {
  /** Server ms */
  t: number;
  /** Seat number (the exam seat id) */
  s: number;
  via: Via;
  dir: "up" | "down" | "sys";
  /** Topic, path, characteristic or frame */
  k: string;
  /** Real byte count */
  n: number;
  /** Text up to 1024 characters, or base64 with b64 */
  d: string;
  b64?: true;
  /** The board, 1 or 2 */
  b?: 1 | 2;
}

export const TRAFFIC_LINES_MAX = 5000;
export const TRAFFIC_PER_SEC = 20;
export const TRAFFIC_TEXT_MAX = 1024;
