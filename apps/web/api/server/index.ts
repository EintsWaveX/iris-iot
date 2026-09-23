/**
 * POST /api/server   { nama, kode }   — assistant-only. Registers a new Pi
 *   and returns a one-time enrollment token (30-minute TTL) to hand to
 *   whoever is installing the agent. The token is shown exactly once here;
 *   it is never retrievable again, only re-issued via POST /api/server/:id.
 *
 * GET  /api/server   — assistant-only. Every registered Pi with its most
 *   recent heartbeat, for the server list view.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { server, denyut } from "../../src/lib/schema.js";
import {
  generateEnrollToken,
  enrollTokenExpiry,
  sha256,
  batasLuringDetik,
} from "../../src/lib/server-lib.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";
import { desc, eq } from "drizzle-orm";

const KODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

async function handlePost(req: ApiRequest, res: ApiResponse) {
  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  const kode = typeof body.kode === "string" ? body.kode.trim().toLowerCase() : "";

  if (!nama || nama.length > 60 || !KODE_RE.test(kode)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const token = generateEnrollToken();

  try {
    const db = getDb();
    const [row] = await db
      .insert(server)
      .values({
        nama,
        kode,
        daftarTokenHash: sha256(token),
        daftarTokenExp: enrollTokenExpiry(),
      })
      .returning({ id: server.id, kode: server.kode });

    await writeAudit(session.nim, "server_daftar", { serverId: row.id, kode: row.kode });
    res.status(200).json({ ok: true, id: row.id, kode: row.kode, token });
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      res.status(200).json({ ok: false, kode: "kode_dipakai" });
      return;
    }
    console.error("[api/server] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const db = getDb();
  const rows = await db
    .select({
      id: server.id,
      nama: server.nama,
      kode: server.kode,
      alamatLan: server.alamatLan,
      terdaftarPada: server.terdaftarPada,
      dibuatPada: server.dibuatPada,
    })
    .from(server)
    .orderBy(server.dibuatPada);

  const running = await currentSesi();
  const sesiMulaiPada = running ? (running.mulaiPada ?? running.dibuatPada) : null;

  // Latest heartbeat per server, one query per row is fine at this scale
  // (one Pi today, a handful even at full Phase 2 scope) -- a lateral join
  // would be the right call at a size this project will not reach.
  const daftar = await Promise.all(
    rows.map(async (s) => {
      const [latest] = await db
        .select()
        .from(denyut)
        .where(eq(denyut.serverId, s.id))
        .orderBy(desc(denyut.pada))
        .limit(1);
      return {
        ...s,
        terdaftar: s.terdaftarPada !== null,
        denyutTerakhir: latest ?? null,
        batasLuringDetik: batasLuringDetik(latest?.pada ?? null, sesiMulaiPada),
      };
    }),
  );

  res.status(200).json({ ok: true, server: daftar });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);
  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ ok: false, kode: "metode_tidak_diizinkan" });
}
