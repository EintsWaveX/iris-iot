/**
 * Session streams, the API side (Phase 12): signs the ticket a page needs to
 * enter its room (GET /api/session/aliran) and sends the data the API holds
 * into a room: PC heartbeats and readings, blank results, hands, hints.
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
const KOSONG_MS = 15_000;
/** Streams skipped while a room is empty; events always go. Only the PC
 *  room's beats: a session room is rarely empty, and skipping its readings
 *  left the first Live viewer after a quiet spell without them for 15 s. */
const ALIRAN_DERAS = new Set(["denyut"]);

/**
 * A write's topics and its room messages, to the relay in one signed
 * request (POST /kirim): one Worker request per write on the free plan.
 * Quietly does nothing when the relay is not set up or slow (the pages
 * catch up on their next refetch and the 60 s safety net).
 */
export async function kirimRelay(
  topik: readonly string[],
  ruang: Readonly<Record<string, PesanAliran[]>> = {},
): Promise<void> {
  const env = konsolEnv();
  if (!env) return;
  const kini = Date.now();
  const r: Record<string, PesanAliran[]> = {};
  for (const [k, m] of Object.entries(ruang)) {
    const sepi = (kosong.get(k) ?? 0) > kini;
    const kirim = sepi ? m.filter((x) => !ALIRAN_DERAS.has(x.j)) : m;
    if (kirim.length) r[k] = kirim;
  }
  const t = [...new Set(topik)];
  if (!t.length && !Object.keys(r).length) return;
  const body = JSON.stringify({
    ...(t.length ? { t } : {}),
    ...(Object.keys(r).length ? { r } : {}),
  });
  const ts = Math.floor(kini / 1000);
  const tanda = createHmac("sha256", env.secret).update(`kirim|${body}|${ts}`).digest("hex");
  try {
    const res = await fetch(`${env.relay.replace(/^ws/, "http")}/kirim`, {
      method: "POST",
      headers: { "x-kirim-ts": String(ts), "x-kirim-tanda": tanda },
      body,
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return;
    // Each room answers with how many sockets heard it.
    const dengar = (await res.json()) as Record<string, number>;
    for (const k of Object.keys(r)) {
      if (dengar[k] === 0) kosong.set(k, kini + KOSONG_MS);
      else kosong.delete(k);
    }
  } catch {
    /* the pages catch up on their next refetch */
  }
}

/** Into one room, on its own (outside a route's write) */
export async function terbitkan(ruang: string, m: PesanAliran[]): Promise<void> {
  if (m.length) await kirimRelay([], { [ruang]: m });
}

/** Messages a route's write puts in a room, sent with its topics once the
 *  answer is out (denganSiaran, siaran.ts) */
const ANTRE = Symbol("aliran");

export function antreAliran(res: ApiResponse, ruang: string, m: PesanAliran[]): void {
  const q = ((res as unknown as Record<symbol, Record<string, PesanAliran[]>>)[ANTRE] ??= {});
  (q[ruang] ??= []).push(...m);
}

/** Into a running session's room, with the write's topics */
export function antreSesi(
  res: ApiResponse,
  sesiId: number | null | undefined,
  m: PesanAliran[],
): void {
  if (sesiId && m.length) antreAliran(res, ruangSesi(sesiId), m);
}

/** What a route queued (and forgets it) */
export function ambilAntre(res: ApiResponse): Record<string, PesanAliran[]> {
  const o = res as unknown as Record<symbol, Record<string, PesanAliran[]> | undefined>;
  const q = o[ANTRE] ?? {};
  o[ANTRE] = undefined;
  return q;
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
 * GET /api/session/aliran?ruang=sesi|pc[&kelompok=N]
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

  if (ruangMinta === "pc") {
    const s = requireRole(req, res, "asisten");
    if (!s) return;
    const tiket = await tandaTiketAliran(
      { v: 1, p: "aliran", r: "pc", peran: "asisten", g: null, u: s.nim, exp, n: acakId() },
      env.secret,
    );
    res.status(200).json({ ok: true, url: `${env.relay}/aliran/pc`, tiket, ruang: "pc" });
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
