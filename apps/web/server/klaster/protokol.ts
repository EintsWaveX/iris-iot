/**
 * The messages the supervisor and its workers send each other (real-time upgrade, Phase 3: several cores).
 *
 * The site runs as one supervisor (`server/supervisor.ts`) and N workers (`server/main.ts`), all on this
 * machine. Workers answer requests and hold the sockets; the supervisor holds what has to be one thing:
 * the order of live-update messages, who is in each room, the tickets already used, and who the leader is.
 * Every message is a small JSON object with an `i` that says what it is, over the IPC channel Node's
 * `cluster` gives each worker (no database, no network).
 */

/** What a socket in a room is, as every worker needs to know it (presence, "who is looking at my group"). */
export type InfoHadir =
  | { k: "a"; peran: "asisten" | "praktikan"; g: number | null; lihat: number | null }
  | { k: "u"; peran: string; s: number | null; u: string };

export interface Cincin {
  n: number;
  t: string[];
}

/** One line of the room roster the supervisor keeps: worker, room, socket number there, what it is. */
export type BarisHadir = [worker: number, ruang: string, id: number, info: InfoHadir];

/** What the supervisor can ask every worker: its status, its route numbers, or to start those numbers over. */
export type ApaTanya = "stat" | "metrik" | "ulang";

/** A worker's own numbers, for /api/sehat. */
export interface StatPekerja {
  id: number;
  gen: number;
  pemimpin: boolean;
  pid: number;
  /** Memory this worker holds, MB. */
  rssMb: number;
  jalanDetik: number;
  soket: Record<string, number>;
  kolam: unknown;
  jedaLoopMs: unknown;
  latar: number;
  sha: string | null;
}

// ---------- worker to supervisor ----------

export type DariPekerja =
  /** Booted; wants the state to start from (order of messages, rooms, leader). */
  | { i: "halo" }
  /** Listening and ready for visitors; `port` is its own door on 127.0.0.1 (the leader's quiz socket). */
  | { i: "siap"; port: number }
  /** Topics to announce to every page on every worker (the supervisor numbers them). */
  | { i: "siar"; t: string[] }
  /** A message into a room, for the sockets on the other workers (this worker already told its own). */
  | { i: "kirim"; ruang: string; m: unknown[] }
  /** Close an exam room's sockets on the other workers. */
  | { i: "tutup"; ruang: string }
  /** A socket joined (info) or left (null) a room here. */
  | { i: "hadir"; ruang: string; id: number; info: InfoHadir | null }
  /** Whatever the server remembered may be out of date: drop it on the other workers too. */
  | { i: "batal" }
  /** "Is this the first time anyone shows this ticket?" `r` matches the answer. */
  | { i: "sekali"; r: number; kunci: string; ttl: number }
  /** A page asked for something only the leader watches (a QR wall's sheet). */
  | { i: "pantau"; kunci: string; isi: unknown }
  /** A small value every worker should see for a while (who owns a build). `sampai` is when it expires (ms). */
  | { i: "taruh"; kunci: string; nilai: unknown; sampai: number }
  /** The old leader has saved and stopped its duties. */
  | { i: "lepas-ok" }
  /** A worker's answer to `tanya`. */
  | { i: "jawab"; r: number; data: unknown }
  /** Ask every worker for its numbers. */
  | { i: "tanya"; r: number; apa: ApaTanya };

// ---------- supervisor to worker ----------

export type DariUtama =
  /** The state to start from. `id` is this worker's number, `gen` its generation (a deploy raises it). */
  | {
      i: "sinkron";
      id: number;
      gen: number;
      n: number;
      e: string;
      cincin: Cincin[];
      hadir: BarisHadir[];
      kv: Array<[kunci: string, nilai: unknown, sampai: number]>;
      pemimpin: { id: number; port: number } | null;
    }
  /** Topics, numbered: every worker applies them in this order. */
  | { i: "siar"; n: number; e: string; t: string[] }
  | { i: "kirim"; ruang: string; m: unknown[] }
  | { i: "tutup"; ruang: string }
  /** A socket joined or left a room on worker `w`. */
  | { i: "hadir"; w: number; ruang: string; id: number; info: InfoHadir | null }
  /** Worker `w` is gone: forget every socket it had. */
  | { i: "pergi"; w: number }
  | { i: "batal" }
  | { i: "taruh"; kunci: string; nilai: unknown; sampai: number }
  | { i: "balas"; r: number; ok: boolean }
  /** Take up the leader's duties (the lab clock, the quiz game, the QR sheet watch). */
  | { i: "pimpin" }
  /** Put the leader's duties down and answer `lepas-ok`. */
  | { i: "lepas" }
  /** Who the leader is now and where its own door is (null while nobody is). */
  | { i: "pemimpin"; id: number | null; port: number | null }
  | { i: "pantau"; kunci: string; isi: unknown }
  | { i: "tanya"; r: number; apa: ApaTanya }
  | { i: "hasil"; r: number; data: unknown[] }
  /** Stop taking visitors and drain (a deploy replaced this worker). */
  | { i: "henti" };
