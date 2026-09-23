/**
 * IRIS IoT practicum site — server/device registry (Phase 2).
 *
 * Two secrets guard the agent channel, deliberately different shapes for
 * deliberately different lifetimes:
 *
 *   enrollment token   single-use, 30-minute TTL. Handed to whoever is
 *                      physically installing the agent, so it only needs to
 *                      survive one `curl | agent enroll` command.
 *   agent key          32 random bytes, no expiry. What the agent presents
 *                      on every heartbeat for the rest of its life.
 *
 * Both are stored hashed (SHA-256), never in cleartext — the same reasoning
 * as session cookies not being the thing checked directly, just what's
 * derived from what arrived.
 */
import { randomBytes, createHash } from "node:crypto";
import { and, eq, lt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { server, denyut, perintah, telemetriTerkini, telemetriLog } from "./schema.js";
import { safeEqual } from "./auth.js";

const ENROLL_TOKEN_TTL_MIN = 30;

// The server, not the agent, knows whether a practicum session is running
// (a `sesi` row with status "berjalan") -- so the server is what decides the
// pace, rather than the agent guessing from its own local signals. 15s
// during a session keeps health/inventory fresh while an assistant might
// actually be looking at the dashboard; 10min idle matters because Neon's
// free tier suspends compute after inactivity, and a fixed 15s beat would
// hold it awake 730 hours a month for nothing.
export const INTERVAL_AKTIF_SEC = 15;
export const INTERVAL_IDLE_SEC = 600;
const TENGGANG_LURING_SEC = 60;

/**
 * How long a server may stay silent before /servers calls it offline. It
 * has to follow the interval the agent was actually told at its last beat:
 * a flat 60 seconds marked every healthy Pi "Luring" for 9 of every 10
 * idle minutes, since outside a session it only reports every 600s. A
 * beat that arrived after the running session started was answered with
 * the fast interval; anything earlier, or with no session, the idle one.
 */
export function batasLuringDetik(denyutPada: Date | null, sesiMulaiPada: Date | null): number {
  const cepat = denyutPada !== null && sesiMulaiPada !== null && denyutPada >= sesiMulaiPada;
  return (cepat ? INTERVAL_AKTIF_SEC : INTERVAL_IDLE_SEC) + TENGGANG_LURING_SEC;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A short, printable token — typed by hand if the enrollment command's
 *  clipboard doesn't survive an SSH session, so it stays short deliberately. */
export function generateEnrollToken(): string {
  return randomBytes(16).toString("base64url");
}

/** The long-lived agent key. High-entropy random, so hashing with a plain
 *  SHA-256 (rather than a password KDF like scrypt) is correct here, not a
 *  shortcut — there is no low-entropy human input to protect against
 *  brute-forcing offline. */
export function generateAgentKey(): string {
  return randomBytes(32).toString("base64url");
}

export function enrollTokenExpiry(): Date {
  return new Date(Date.now() + ENROLL_TOKEN_TTL_MIN * 60_000);
}

/** Verifies a presented agent key against the stored hash for a server row,
 *  in constant time. Returns the server row if it matches, null otherwise —
 *  never throws, the same contract readSessionCookie() follows. */
export async function verifyAgentKey(
  serverId: number,
  presentedKey: string,
): Promise<typeof server.$inferSelect | null> {
  if (!presentedKey) return null;
  const db = getDb();
  const [row] = await db.select().from(server).where(eq(server.id, serverId)).limit(1);
  if (!row || !row.agenKunciHash) return null;
  return safeEqual(sha256(presentedKey), row.agenKunciHash) ? row : null;
}

/**
 * Consumes an enrollment token atomically: the UPDATE's WHERE clause checks
 * the hash and expiry in the same statement that clears them, so a token
 * cannot be used twice even under a race between two near-simultaneous
 * enrollment attempts — whichever UPDATE's WHERE clause still matches wins,
 * and it wins by clearing the fields the other one needed to match.
 */
export async function consumeEnrollToken(
  serverId: number,
  presentedToken: string,
): Promise<boolean> {
  if (!presentedToken) return false;
  const db = getDb();
  const hash = sha256(presentedToken);

  const [row] = await db.select().from(server).where(eq(server.id, serverId)).limit(1);
  if (!row || !row.daftarTokenHash || !row.daftarTokenExp) return false;
  if (!safeEqual(hash, row.daftarTokenHash)) return false;
  if (row.daftarTokenExp.getTime() < Date.now()) return false;

  const result = await db
    .update(server)
    .set({ daftarTokenHash: null, daftarTokenExp: null, terdaftarPada: new Date() })
    .where(and(eq(server.id, serverId), eq(server.daftarTokenHash, hash)));
  return (result.rowCount ?? 0) > 0;
}

/**
 * The fixed set of actions an agent will ever run, validated here (before a
 * command is even queued) AND independently by the agent itself before it
 * maps one to an argv list. Neither side trusts the other to have been the
 * only thing enforcing this — see agent/commands.py's mirror of this list.
 */
export const AKSI_PERINTAH = [
  "layanan.mulai",
  "layanan.henti",
  "layanan.mulai_ulang",
  "ap.nyala",
  "ap.mati",
  "jam.selaraskan",
] as const;
export type AksiPerintah = (typeof AKSI_PERINTAH)[number];

export function aksiValid(value: unknown): value is AksiPerintah {
  return typeof value === "string" && (AKSI_PERINTAH as readonly string[]).includes(value);
}

/**
 * Auto-queues a whitelisted command for "the" Orange Pi, so starting or
 * ending a Module 4 Part A session can turn its hotspot on/off without an
 * assistant ever visiting /servers or touching SSH -- the same delivery path
 * (perintah row, picked up on the agent's next heartbeat) the manual button
 * already uses.
 *
 * Deliberately declines rather than guesses when zero or more than one
 * enrolled server exists: this project's own registry supports several
 * servers (the Phase 2 design allows more than one Pi/MCU), and queuing
 * "turn on the hotspot" at the wrong Pi -- or at every Pi -- would be worse
 * than not automating it at all. In either case the assistant still has the
 * manual /servers button as a fallback, so returning false here never blocks
 * the session itself from starting or ending.
 */
export async function queueSoloServerCommand(
  aksi: AksiPerintah,
  dimintaOleh: string,
): Promise<boolean> {
  const db = getDb();
  const enrolled = await db
    .select({ id: server.id })
    .from(server)
    .where(isNotNull(server.agenKunciHash));

  if (enrolled.length !== 1) return false;

  await db.insert(perintah).values({ serverId: enrolled[0].id, aksi, dimintaOleh });
  return true;
}

export const LAYANAN_DIKENAL = ["modul2-ws", "mosquitto", "modul4"] as const;
export type LayananDikenal = (typeof LAYANAN_DIKENAL)[number];

export function layananValid(value: unknown): value is LayananDikenal {
  return typeof value === "string" && (LAYANAN_DIKENAL as readonly string[]).includes(value);
}

/**
 * Best-effort vendor/type guess from a MAC's OUI (the first three octets).
 * Deliberately small and explicitly NOT authoritative — every call site
 * that uses this feeds it into an adopt flow where an assistant can
 * override the guess with one tap, per the Phase 2 plan's "auto-discover,
 * then label" decision. Extend this table as real hardware is observed on
 * site rather than guessing prefixes that were never actually verified.
 */
const OUI_ESPRESSIF = new Set([
  "24:6F:28",
  "30:AE:A4",
  "3C:71:BF",
  "8C:AA:B5",
  "AC:67:B2",
  "EC:FA:BC",
  "A4:CF:12",
  "24:0A:C4",
]);

export const JENIS_PERANGKAT = ["esp32", "pico-w", "cosmic-lora", "tidak-diketahui"] as const;
export type JenisPerangkat = (typeof JENIS_PERANGKAT)[number];

export function jenisPerangkatValid(value: unknown): value is JenisPerangkat {
  return typeof value === "string" && (JENIS_PERANGKAT as readonly string[]).includes(value);
}

export function tebakJenisPerangkat(mac: string): { vendor: string | null; jenis: string | null } {
  const oui = mac.toUpperCase().slice(0, 8);
  if (OUI_ESPRESSIF.has(oui)) {
    return { vendor: "Espressif", jenis: "esp32" };
  }
  return { vendor: null, jenis: null };
}

/**
 * Heartbeats accumulate forever unless something prunes them. Rather than a
 * cron job — a second moving part this project has no infrastructure for —
 * this runs probabilistically on write: about one heartbeat in 100 also
 * deletes anything older than 7 days. Losing a heartbeat's-worth of
 * pruning to bad luck is harmless; the next one just deletes a slightly
 * larger backlog.
 */
export async function pruneOldHeartbeatsOccasionally(): Promise<void> {
  if (Math.random() >= 0.01) return;
  const db = getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  await db.delete(denyut).where(lt(denyut.pada, cutoff));
}

/**
 * Phase 5 Stage 20: one row of real telemetry the agent observed for a
 * single group in a single module -- Module 2's journalctl parse, Module
 * 3's mosquitto_sub read, or Module 4's own /telemetri.json. `tx`/`rx` are
 * "HH:MM:SS:MS" strings copied verbatim from whatever the source already
 * prints, never computed here.
 */
export interface TelemetriMasuk {
  modul: number;
  kelompokNomor: number;
  seq: number;
  tx?: string | null;
  rx?: string | null;
  delayMs?: number | null;
  rssi?: number | null;
  snr?: number | null;
}

const TELEMETRI_MODUL_VALID = new Set([2, 3, 4]); // never Module 1 -- no real relay exists for it
const TELEMETRI_MAX_PER_DENYUT = 5; // "small rows, at most five per cycle" -- see the plan
const MAX_GRUP_ID = 5; // the practicum's fixed group count

function telemetriValid(value: unknown): value is TelemetriMasuk {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.modul === "number" &&
    TELEMETRI_MODUL_VALID.has(v.modul) &&
    typeof v.kelompokNomor === "number" &&
    Number.isInteger(v.kelompokNomor) &&
    v.kelompokNomor >= 1 &&
    v.kelompokNomor <= MAX_GRUP_ID &&
    typeof v.seq === "number" &&
    Number.isInteger(v.seq)
  );
}

/**
 * Upserts each row into telemetriTerkini (one row per server+modul+group,
 * what the live views poll) and appends it to telemetriLog (history, for
 * /history). `masuk` is untrusted heartbeat input -- anything not shaped
 * like TelemetriMasuk, or beyond the first five entries, is silently
 * dropped rather than rejecting the whole heartbeat over it.
 */
export async function rekamTelemetri(
  serverId: number,
  sesiId: number | null,
  masuk: unknown,
): Promise<void> {
  if (!Array.isArray(masuk)) return;
  const db = getDb();

  for (const item of masuk.slice(0, TELEMETRI_MAX_PER_DENYUT)) {
    if (!telemetriValid(item)) continue;

    const row = {
      modul: item.modul,
      kelompokNomor: item.kelompokNomor,
      seq: item.seq,
      tx: item.tx ?? null,
      rx: item.rx ?? null,
      delayMs: item.delayMs ?? null,
      rssi: item.rssi ?? null,
      snr: item.snr ?? null,
    };

    await db
      .insert(telemetriTerkini)
      .values({ serverId, ...row })
      .onConflictDoUpdate({
        target: [telemetriTerkini.serverId, telemetriTerkini.modul, telemetriTerkini.kelompokNomor],
        set: { ...row, diperbaruiPada: sql`now()` },
      });

    await db.insert(telemetriLog).values({ sesiId, ...row });
  }
}

/** Same probabilistic-prune pattern as pruneOldHeartbeatsOccasionally(). */
export async function pruneOldTelemetryOccasionally(): Promise<void> {
  if (Math.random() >= 0.01) return;
  const db = getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  await db.delete(telemetriLog).where(lt(telemetriLog.dicatatPada, cutoff));
}
