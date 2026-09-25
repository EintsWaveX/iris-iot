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
  // P6.7: the expert diagnostics layer. Read-only on the Pi (no service is
  // started/stopped/restarted by any of these), routed through the agent's
  // existing whitelisted-argv command channel rather than a new one, and
  // whitelisted again on the agent side (commands.py/diagnostics.py) --
  // same "neither side trusts the other" rule as every other action here.
  "diag.ringkas",
  "diag.log",
  "diag.jaringan",
  "diag.dmesg",
] as const;
export type AksiPerintah = (typeof AKSI_PERINTAH)[number];

export function aksiValid(value: unknown): value is AksiPerintah {
  return typeof value === "string" && (AKSI_PERINTAH as readonly string[]).includes(value);
}

/**
 * P6.7: the systemd unit name `diag.log` reads, e.g. "iris-agent" or
 * "mosquitto" -- deliberately NOT restricted to LAYANAN_DIKENAL's three
 * practicum services, since the whole point of a log viewer in the expert
 * layer is to look at units the ordinary layanan.* controls never touch
 * (hostapd, chronyd, the agent itself). Still bounded: subprocess.run on
 * the agent side runs this as one argv element under shell=False, so there
 * is no shell-injection surface either way, but a short allowlist pattern
 * still keeps the argument to something that could plausibly be a real
 * systemd unit name rather than an arbitrary string landing in a log.
 */
const UNIT_DIAG_RE = /^[A-Za-z0-9@_.-]{1,64}$/;
export function unitDiagValid(value: unknown): value is string {
  return typeof value === "string" && UNIT_DIAG_RE.test(value);
}

/**
 * Auto-queues a whitelisted command for "the" Orange Pi, so starting or
 * ending a Module 4 session can turn its hotspot on/off without an
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
  // P6.1's agent stamps this centrally in kumpulkan_telemetri() (an ISO
  // timestamp of when the reading was actually collected) -- optional here
  // because an agent built before P6.1 simply never sends it, and a missing
  // value just means telemetriLog.diukurPada stays null for that row rather
  // than the whole heartbeat being rejected.
  diukurPada?: string;
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
    Number.isInteger(v.seq) &&
    (v.diukurPada === undefined ||
      (typeof v.diukurPada === "string" && !Number.isNaN(Date.parse(v.diukurPada))))
  );
}

/**
 * Upserts each row into telemetriTerkini (one row per server+modul+group,
 * what the live views poll) and appends it to telemetriLog (history, for
 * /reports). `masuk` is untrusted heartbeat input -- anything not shaped
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

    await db.insert(telemetriLog).values({
      sesiId,
      serverId,
      diukurPada: item.diukurPada ? new Date(item.diukurPada) : null,
      ...row,
    });
  }
}

/** Same probabilistic-prune pattern as pruneOldHeartbeatsOccasionally(). */
export async function pruneOldTelemetryOccasionally(): Promise<void> {
  if (Math.random() >= 0.01) return;
  const db = getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  await db.delete(telemetriLog).where(lt(telemetriLog.dicatatPada, cutoff));
}

const PERINTAH_TERKIRIM_KEDALUWARSA_MENIT = 5;
const PERINTAH_MENUNGGU_KEDALUWARSA_MENIT = 30;

/**
 * P6.2/B7: atomically claims every `menunggu` command queued for this
 * server as `terkirim`, in one statement. The pre-0006 code did a plain
 * SELECT of `menunggu` rows followed by a separate UPDATE of the same
 * WHERE clause -- a command inserted (by an assistant clicking a control)
 * in the gap between those two statements matched neither one: not the
 * SELECT, because it didn't exist yet; not the UPDATE, because by the time
 * it ran the command already existed but the UPDATE's own WHERE was built
 * from the SELECT's now-stale result, not re-evaluated. It just sat at
 * `menunggu` until the NEXT heartbeat. A single UPDATE ... RETURNING has no
 * such gap: the claim and the read of what got claimed are the same
 * statement.
 */
export async function claimPerintahMenunggu(
  serverId: number,
): Promise<Array<{ id: number; aksi: string; argumen: Record<string, string> | null }>> {
  const db = getDb();
  return db
    .update(perintah)
    .set({ status: "terkirim", terkirimPada: sql`now()` })
    .where(and(eq(perintah.serverId, serverId), eq(perintah.status, "menunggu")))
    .returning({ id: perintah.id, aksi: perintah.aksi, argumen: perintah.argumen });
}

/**
 * P6.2/B7: expires commands that were claimed but never reported back on
 * (`terkirim` for more than 5 minutes -- an agent that crashed, lost its
 * network, or was killed mid-command) and commands that were never claimed
 * at all (`menunggu` for more than 30 minutes -- queued for a Pi that
 * never checked in again). Runs across every server on every heartbeat,
 * not scoped to the one reporting in -- an assistant watching server B's
 * command log should see server A's stuck command expire without needing
 * to wait for server A itself to come back and report on it.
 */
export async function sweepPerintahKedaluwarsa(): Promise<void> {
  const db = getDb();
  const terkirimCutoff = new Date(Date.now() - PERINTAH_TERKIRIM_KEDALUWARSA_MENIT * 60_000);
  const menungguCutoff = new Date(Date.now() - PERINTAH_MENUNGGU_KEDALUWARSA_MENIT * 60_000);

  await db
    .update(perintah)
    .set({ status: "kedaluwarsa", keluaran: "agen tidak melapor" })
    .where(
      and(
        eq(perintah.status, "terkirim"),
        isNotNull(perintah.terkirimPada),
        lt(perintah.terkirimPada, terkirimCutoff),
      ),
    );
  await db
    .update(perintah)
    .set({ status: "kedaluwarsa", keluaran: "tidak pernah diambil agen" })
    .where(and(eq(perintah.status, "menunggu"), lt(perintah.dimintaPada, menungguCutoff)));
}

// -----------------------------------------------------------------------
// P6.7: server centre "Ringkasan" history -- downsampling, reboot/gap
// detection and availability, all pure functions over already-fetched rows
// so they are unit-testable without a database (the API route itself only
// wires them to a `denyut` query, see api/server/[id].ts's handleRiwayat).
// -----------------------------------------------------------------------

export const RENTANG_DETIK = { "1h": 3600, "24h": 86400, "7d": 7 * 86400 } as const;
export type RentangRiwayat = keyof typeof RENTANG_DETIK;
export const RIWAYAT_MAX_POINTS = 300;

export function rentangValid(value: unknown): value is RentangRiwayat {
  return value === "1h" || value === "24h" || value === "7d";
}

/** Evenly-spaced pick, not an average -- a spike in CPU or temperature stays
 *  visible on the chart instead of being smoothed away by a mean over the
 *  bucket, which matters more here than a perfectly uniform sample rate. */
export function downsample<T>(rows: readonly T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints || maxPoints <= 0) return rows.slice();
  const step = rows.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(rows[Math.floor(i * step)]);
  return out;
}

export interface RebootEvent {
  pada: string;
}

/** A reboot shows up as this heartbeat's uptimeSec being LOWER than the
 *  previous one's -- uptime only ever counts up between two heartbeats of
 *  the same boot. Rows must already be ordered oldest-first. */
export function detectReboots(
  rows: ReadonlyArray<{ pada: string; uptimeSec: number | null }>,
): RebootEvent[] {
  const out: RebootEvent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].uptimeSec;
    const cur = rows[i].uptimeSec;
    if (prev !== null && cur !== null && cur < prev) out.push({ pada: rows[i].pada });
  }
  return out;
}

export interface GapEvent {
  dari: string;
  sampai: string;
  detik: number;
}

/**
 * A gap between two consecutive heartbeats longer than `ambangDetik`. This
 * deliberately uses one fixed threshold for a whole history query rather
 * than batasLuringDetik()'s own per-heartbeat "was a session running"
 * logic (which needs to know each point's *next* heartbeat's own session
 * context to be exact) -- INTERVAL_IDLE_SEC plus its tolerance covers the
 * common case (a Pi silent for a full idle-cadence miss really is offline)
 * and errs toward under- rather than over-reporting gaps during a session,
 * where the faster cadence would otherwise flag normal idle-to-idle beats.
 */
export const GAP_AMBANG_DETIK = INTERVAL_IDLE_SEC + TENGGANG_LURING_SEC;

export function detectGaps(
  rows: ReadonlyArray<{ pada: string }>,
  ambangDetik: number = GAP_AMBANG_DETIK,
): GapEvent[] {
  const out: GapEvent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const dari = rows[i - 1].pada;
    const sampai = rows[i].pada;
    const detik = (new Date(sampai).getTime() - new Date(dari).getTime()) / 1000;
    if (detik > ambangDetik) out.push({ dari, sampai, detik: Math.round(detik) });
  }
  return out;
}

/** Availability % over [rentangMulai, rentangAkhir]: the whole window minus
 *  every gap found within it, minus a leading gap (server registered but
 *  silent since the window started) and a trailing one (silent since the
 *  last heartbeat), rounded to one decimal. An empty row set is 0%, not
 *  100% -- "no data" must never read as "everything was fine". */
export function hitungKetersediaan(
  rows: ReadonlyArray<{ pada: string }>,
  rentangMulai: Date,
  rentangAkhir: Date,
  ambangDetik: number = GAP_AMBANG_DETIK,
): number {
  const totalDetik = (rentangAkhir.getTime() - rentangMulai.getTime()) / 1000;
  if (totalDetik <= 0) return 100;
  if (rows.length === 0) return 0;

  const gapDetik = detectGaps(rows, ambangDetik).reduce((sum, g) => sum + g.detik, 0);
  const depanDetik = (new Date(rows[0].pada).getTime() - rentangMulai.getTime()) / 1000;
  const belakangDetik =
    (rentangAkhir.getTime() - new Date(rows[rows.length - 1].pada).getTime()) / 1000;
  const tepiHilang =
    (depanDetik > ambangDetik ? depanDetik : 0) + (belakangDetik > ambangDetik ? belakangDetik : 0);

  const tersedia = Math.max(0, totalDetik - gapDetik - tepiHilang);
  return Math.round((tersedia / totalDetik) * 1000) / 10;
}

export interface LayananTimelineEntry {
  layanan: string;
  status: string;
  dari: string;
  sampai: string;
}

/** One entry per (service, unbroken run of the same status), built from
 *  each heartbeat's `layanan` snapshot rather than stored separately --
 *  there is no dedicated status-change log, so this reconstructs one from
 *  denyut's own history. */
export function bangunTimelineLayanan(
  rows: ReadonlyArray<{ pada: string; layanan: Record<string, string> | null }>,
): LayananTimelineEntry[] {
  const out: LayananTimelineEntry[] = [];
  const current = new Map<string, { status: string; dari: string }>();

  for (const row of rows) {
    for (const [nama, status] of Object.entries(row.layanan ?? {})) {
      const c = current.get(nama);
      if (!c) {
        current.set(nama, { status, dari: row.pada });
      } else if (c.status !== status) {
        out.push({ layanan: nama, status: c.status, dari: c.dari, sampai: row.pada });
        current.set(nama, { status, dari: row.pada });
      }
    }
  }
  const akhir = rows[rows.length - 1]?.pada;
  if (akhir) {
    for (const [nama, c] of current) {
      out.push({ layanan: nama, status: c.status, dari: c.dari, sampai: akhir });
    }
  }
  return out;
}
