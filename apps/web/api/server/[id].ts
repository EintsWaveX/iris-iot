/**
 * GET    /api/server/:id   — assistant-only. Everything the server detail
 *   view needs in one call: the server row, its latest heartbeat, every
 *   known device (adopted and not), and its 20 most recent commands.
 *
 * DELETE /api/server/:id   — assistant-only. Removes a registered server;
 *   denyut/perangkat/perintah cascade with it (see schema.ts's onDelete).
 *   Mainly what makes agent/tools/uji_protokol.py self-cleaning: that tool
 *   registers a real, disposable server against the real database on every
 *   run, and without this route those rows would accumulate forever.
 *
 * POST   /api/server/:id   — assistant-only. Issues a fresh one-time
 *   enrollment token (30-minute TTL) and returns it once, the same shape
 *   POST /api/server gives at registration. Without it, a token that
 *   expired before the Pi was set up, or a Pi reinstalled from scratch
 *   (whose /etc/iris-agent/config.json went with it), could only be fixed
 *   by deleting the server and losing its whole history. Enrolling with
 *   the new token replaces the agent key, so an old install stops being
 *   accepted the moment the new one enrolls.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { server, denyut, perangkat, perintah } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import {
  generateEnrollToken,
  enrollTokenExpiry,
  sha256,
  batasLuringDetik,
} from "../../src/lib/server-lib.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { desc, eq } from "drizzle-orm";

async function handleGet(_req: ApiRequest, res: ApiResponse, id: number) {
  const db = getDb();
  const [row] = await db.select().from(server).where(eq(server.id, id)).limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }

  const [denyutTerakhir] = await db
    .select()
    .from(denyut)
    .where(eq(denyut.serverId, id))
    .orderBy(desc(denyut.pada))
    .limit(1);

  const daftarPerangkat = await db
    .select()
    .from(perangkat)
    .where(eq(perangkat.serverId, id))
    .orderBy(desc(perangkat.terakhirTerlihat));

  const running = await currentSesi();
  const sesiMulaiPada = running ? (running.mulaiPada ?? running.dibuatPada) : null;

  const daftarPerintah = await db
    .select()
    .from(perintah)
    .where(eq(perintah.serverId, id))
    .orderBy(desc(perintah.dimintaPada))
    .limit(20);

  res.status(200).json({
    ok: true,
    server: {
      id: row.id,
      nama: row.nama,
      kode: row.kode,
      alamatLan: row.alamatLan,
      terdaftar: row.terdaftarPada !== null,
    },
    denyutTerakhir: denyutTerakhir ?? null,
    batasLuringDetik: batasLuringDetik(denyutTerakhir?.pada ?? null, sesiMulaiPada),
    perangkat: daftarPerangkat,
    perintah: daftarPerintah,
  });
}

async function handleDelete(_req: ApiRequest, res: ApiResponse, id: number, aktorNim: string) {
  const db = getDb();
  const result = await db.delete(server).where(eq(server.id, id)).returning({ kode: server.kode });
  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  await writeAudit(aktorNim, "server_hapus", { id, kode: result[0].kode });
  res.status(200).json({ ok: true });
}

async function handleTokenBaru(_req: ApiRequest, res: ApiResponse, id: number, aktorNim: string) {
  const token = generateEnrollToken();
  const db = getDb();
  const result = await db
    .update(server)
    .set({ daftarTokenHash: sha256(token), daftarTokenExp: enrollTokenExpiry() })
    .where(eq(server.id, id))
    .returning({ kode: server.kode });
  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  await writeAudit(aktorNim, "server_token_baru", { id, kode: result[0].kode });
  res.status(200).json({ ok: true, id, kode: result[0].kode, token });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  if (req.method === "GET") return handleGet(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id, session.nim);
  if (req.method === "POST") return handleTokenBaru(req, res, id, session.nim);

  res.setHeader("Allow", "GET, DELETE, POST");
  res.status(405).json({ ok: false, kode: "metode_tidak_diizinkan" });
}
