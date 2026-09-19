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
import { eq, lt } from "drizzle-orm";
import { getDb } from "./db.js";
import { server, denyut } from "./schema.js";
import { safeEqual } from "./auth.js";

const ENROLL_TOKEN_TTL_MIN = 30;

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
    .where(eq(server.id, serverId));
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

export const LAYANAN_DIKENAL = ["modul2-ws", "mosquitto", "hunt", "chirpstack"] as const;
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
