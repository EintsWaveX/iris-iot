/**
 * Session streams, the API side (Phase 12): signs the ticket a page needs to
 * enter its room (GET /api/session/aliran) and sends the data the API holds
 * into a room: Pi heartbeats and readings, blank results, hands, hints.
 * The plain topic signals (siaran.ts) still go out as well, for pages that
 * are not in the room.
 */
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { noStore } from "./http.js";
import { konsolEnv } from "./konsol.js";
import { currentSession, requireCurrentPraktikanSesi, requireRole } from "./session.js";
import { nomorWakil, wakilKelompok } from "./wakil.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { acakId } from "../../src/lib/tanda.js";
import {
  ALIRAN_TIKET_DETIK,
  ruangSesi,
  tandaTiketAliran,
  type PesanAliran,
} from "../../src/lib/aliran.js";

// ---------- Sending ----------
// ---------- Sending ----------
// ---------- Sending ----------

/** Rooms that had nobody in them, until when (ms), on this warm instance */
const kosong = new Map<string, number>();
const KOSONG_MS = 30_000;
/** Streams skipped while a room is empty; events always go */
const ALIRAN_DERAS = new Set(["tel", "denyut"]);

/** Sends messages into a room; quietly does nothing when the relay is not
 *  set up or slow (the topic signal and the 60 s safety net catch up) */
export async function terbitkan(ruang: string, m: PesanAliran[]): Promise<void> {
  const env = konsolEnv();
  if (!env || !m.length) return;
  const sepi = (kosong.get(ruang) ?? 0) > Date.now();
  const kirim = sepi ? m.filter((x) => !ALIRAN_DERAS.has(x.j)) : m;
  if (!kirim.length) return;
  const body = JSON.stringify({ m: kirim });
  const ts = Math.floor(Date.now() / 1000);
  const tanda = createHmac("sha256", env.secret)
    .update(`aliran|${ruang}|${body}|${ts}`)
    .digest("hex");
  try {
    const r = await fetch(`${env.relay.replace(/^ws/, "http")}/aliran/${ruang}/kirim`, {
      method: "POST",
      headers: { "x-aliran-ts": String(ts), "x-aliran-tanda": tanda },
      body,
      signal: AbortSignal.timeout(1500),
    });
    // The room answers with how many sockets heard it.
    if (r.ok && (await r.text()) === "0") kosong.set(ruang, Date.now() + KOSONG_MS);
    else kosong.delete(ruang);
  } catch {
    /* the pages catch up on the topic signal */
  }
}

/** Into a running session's room */
export async function terbitkanSesi(
  sesiId: number | null | undefined,
  m: PesanAliran[],
): Promise<void> {
  if (sesiId) await terbitkan(ruangSesi(sesiId), m);
}

/** A group's number from its id (rooms filter by number) */
export async function nomorDariId(kelompokId: number): Promise<number | null> {
  const [g] = await getDb()
    .select({ nomor: kelompok.nomor })
    .from(kelompok)
    .where(eq(kelompok.id, kelompokId))
    .limit(1);
  return g?.nomor ?? null;
}

// ---------- Tickets ----------
// ---------- Tickets ----------
// ---------- Tickets ----------

/**
 * GET /api/session/aliran?ruang=sesi|pi[&kelompok=N]
 * A ticket for the running session's room (Asisten, or a Praktikan signed
 * in to it, who gets their own group), or for the Server pages' room
 * (Asisten). `kelompok`: an Asisten holding that group (Lihat Sebagai
 * Praktikan) also sends its laptop's lines.
 */
export async function handleAliranGet(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const env = konsolEnv();
  if (!env) {
    res.status(200).json({ ok: false, kode: "relay_belum_diatur" });
    return;
  }
  const ruangMinta = req.query.ruang;
  const exp = Math.floor(Date.now() / 1000) + ALIRAN_TIKET_DETIK;

  if (ruangMinta === "pi") {
    const s = requireRole(req, res, "asisten");
    if (!s) return;
    const tiket = await tandaTiketAliran(
      { v: 1, p: "aliran", r: "pi", peran: "asisten", g: null, u: s.nim, exp, n: acakId() },
      env.secret,
    );
    res.status(200).json({ ok: true, url: `${env.relay}/aliran/pi`, tiket, ruang: "pi" });
    return;
  }
  if (ruangMinta !== "sesi") {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const s = currentSession(req);
  let peran: "asisten" | "praktikan";
  let g: number | null = null;
  let nim: string;
  if (s?.role === "asisten") {
    peran = "asisten";
    nim = s.nim;
    const wakil = nomorWakil(req);
    if (wakil) {
      const who = await wakilKelompok(req, res, wakil, true);
      if (!who) return;
      g = wakil;
    }
  } else {
    const who = await requireCurrentPraktikanSesi(req, res);
    if (!who) return;
    peran = "praktikan";
    nim = who.nim;
    g = who.kelompokNomor ?? null;
  }
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  const ruang = ruangSesi(running.id);
  const tiket = await tandaTiketAliran(
    { v: 1, p: "aliran", r: ruang, peran, g, u: nim, exp, n: acakId() },
    env.secret,
  );
  res
    .status(200)
    .json({ ok: true, url: `${env.relay}/aliran/${ruang}`, tiket, ruang, sesiId: running.id, g });
}
