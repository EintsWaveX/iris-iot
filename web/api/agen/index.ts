/**
 * POST /api/agen   { kode, token }                                (enroll)
 *                | { serverId, agenKunci, cpu, memori, disk, suhu,
 *                    uptimeSec, jamSelaras, modeJaringan, layanan,
 *                    perangkat, hasilPerintah }                   (heartbeat)
 *
 * Two very different operations sharing one file, dispatched on whether
 * `token` is present -- an enrollment body always has one, a heartbeat
 * body never does, so there is no ambiguity. Merged here rather than kept
 * as api/agen/daftar.ts + api/agen/denyut.ts purely because the Vercel
 * Hobby plan caps a deployment at 12 serverless functions (see
 * api/tindakan.ts's header for the other half of this consolidation, and
 * the same note on splitting them back apart later).
 *
 * Enroll: exchanges a one-time token for the long-lived agent key the
 * agent presents on every heartbeat afterward. No session cookie -- this
 * runs once, from the Pi itself, before the agent has any other credential.
 *
 * Heartbeat: one round trip does four things -- records this cycle's
 * health, upserts whatever devices the agent discovered, reports the
 * outcome of any commands it ran since the last beat, and hands back
 * whatever is queued for it now. No inbound port on the Pi is ever needed
 * -- the agent always calls out, and commands ride the response of the
 * call it was always going to make anyway.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { getDb } from "../../src/lib/db.js";
import { server, denyut, perangkat, perintah } from "../../src/lib/schema.js";
import {
  consumeEnrollToken,
  generateAgentKey,
  sha256,
  verifyAgentKey,
  pruneOldHeartbeatsOccasionally,
} from "../../src/lib/server-lib.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { eq, and, sql } from "drizzle-orm";

// The server, not the agent, knows whether a practicum session is running
// (a `sesi` row with status "berjalan") -- so the server is what decides the
// pace, rather than the agent guessing from its own local signals. 15s
// during a session keeps health/inventory fresh while an assistant might
// actually be looking at the dashboard; 10min idle matters because Neon's
// free tier suspends compute after inactivity, and a fixed 15s beat would
// hold it awake 730 hours a month for nothing.
const INTERVAL_AKTIF_SEC = 15;
const INTERVAL_IDLE_SEC = 600;

interface PerangkatMasuk {
  mac: string;
  ip?: string;
  vendor?: string | null;
  jenis?: string | null;
  sumber: string;
}

interface HasilPerintahMasuk {
  id: number;
  status: "selesai" | "gagal";
  keluaran?: string;
}

const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;

async function handleDaftar(req: ApiRequest, res: ApiResponse) {
  const body = jsonBody(req);
  const kode = typeof body.kode === "string" ? body.kode.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!kode || !token) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ id: server.id })
      .from(server)
      .where(eq(server.kode, kode))
      .limit(1);
    if (!row) {
      res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
      return;
    }

    const consumed = await consumeEnrollToken(row.id, token);
    if (!consumed) {
      res.status(200).json({ ok: false, kode: "token_tidak_sah" });
      return;
    }

    const agenKunci = generateAgentKey();
    await db
      .update(server)
      .set({ agenKunciHash: sha256(agenKunci) })
      .where(eq(server.id, row.id));

    res.status(200).json({ ok: true, serverId: row.id, agenKunci });
  } catch (err) {
    console.error("[api/agen daftar] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleDenyut(req: ApiRequest, res: ApiResponse) {
  const body = jsonBody(req);
  const serverId = Number(body.serverId);
  const agenKunci = typeof body.agenKunci === "string" ? body.agenKunci : "";

  if (!Number.isInteger(serverId) || serverId <= 0 || !agenKunci) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const row = await verifyAgentKey(serverId, agenKunci);
  if (!row) {
    res.status(401).json({ ok: false, kode: "kunci_tidak_sah" });
    return;
  }

  try {
    const db = getDb();

    await db.insert(denyut).values({
      serverId,
      cpu: numOrNull(body.cpu),
      memori: numOrNull(body.memori),
      disk: numOrNull(body.disk),
      suhu: numOrNull(body.suhu),
      uptimeSec: numOrNull(body.uptimeSec),
      jamSelaras: body.jamSelaras === true,
      modeJaringan: typeof body.modeJaringan === "string" ? body.modeJaringan : null,
      layanan: isPlainObject(body.layanan) ? body.layanan : null,
    });

    const perangkatMasuk = Array.isArray(body.perangkat) ? (body.perangkat as unknown[]) : [];
    for (const item of perangkatMasuk) {
      if (!isPerangkatMasuk(item) || !MAC_RE.test(item.mac)) continue;
      const mac = item.mac.toUpperCase();

      await db
        .insert(perangkat)
        .values({
          serverId,
          mac,
          ip: item.ip ?? null,
          vendor: item.vendor ?? null,
          jenis: item.jenis ?? null,
          sumber: item.sumber,
        })
        .onConflictDoUpdate({
          target: [perangkat.serverId, perangkat.mac],
          set: {
            ip: sql`excluded.ip`,
            sumber: sql`excluded.sumber`,
            terakhirTerlihat: sql`now()`,
            // An assistant's adoption (which sets vendor/jenis by hand) must
            // survive rediscovery -- only overwrite the guess while the
            // device is still unadopted.
            vendor: sql`CASE WHEN ${perangkat.diadopsi} THEN ${perangkat.vendor} ELSE excluded.vendor END`,
            jenis: sql`CASE WHEN ${perangkat.diadopsi} THEN ${perangkat.jenis} ELSE excluded.jenis END`,
          },
        });
    }

    const hasilMasuk = Array.isArray(body.hasilPerintah) ? (body.hasilPerintah as unknown[]) : [];
    for (const item of hasilMasuk) {
      if (!isHasilPerintahMasuk(item)) continue;
      await db
        .update(perintah)
        .set({
          status: item.status,
          selesaiPada: new Date(),
          keluaran: item.keluaran ?? null,
        })
        .where(and(eq(perintah.id, item.id), eq(perintah.serverId, serverId)));
    }

    const pending = await db
      .select({ id: perintah.id, aksi: perintah.aksi, argumen: perintah.argumen })
      .from(perintah)
      .where(and(eq(perintah.serverId, serverId), eq(perintah.status, "menunggu")));

    if (pending.length > 0) {
      await db
        .update(perintah)
        .set({ status: "terkirim" })
        .where(and(eq(perintah.serverId, serverId), eq(perintah.status, "menunggu")));
    }

    await pruneOldHeartbeatsOccasionally();

    const sesiAktif = await currentSesi();
    const intervalDetik = sesiAktif ? INTERVAL_AKTIF_SEC : INTERVAL_IDLE_SEC;

    res.status(200).json({ ok: true, perintah: pending, intervalDetik });
  } catch (err) {
    console.error("[api/agen denyut] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const body = jsonBody(req);
  if (typeof body.token === "string") return handleDaftar(req, res);
  return handleDenyut(req, res);
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPerangkatMasuk(value: unknown): value is PerangkatMasuk {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.mac === "string" && typeof v.sumber === "string";
}

function isHasilPerintahMasuk(value: unknown): value is HasilPerintahMasuk {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "number" && (v.status === "selesai" || v.status === "gagal");
}
