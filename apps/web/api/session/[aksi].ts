/**
 * /api/session/:aksi — assistant-only. Merges four routes that used to be
 * their own function files (current, end, group, roster) behind one
 * dynamic segment, the same consolidation api/server/[id].ts already
 * proved for a numeric id. This one dispatches on the segment's literal
 * value instead: the Vercel Hobby plan caps a deployment at 12 Serverless
 * Functions and the project was over that ceiling at 13 with these four
 * split out alongside api/session/index.ts -- collapsing them here without
 * changing a single URL (the existing rewrites in vercel.json already map
 * /api/sesi/* onto these exact English paths) brings the count back under.
 *
 * GET  /api/session/current                        — running session + master roster.
 * POST /api/session/end     (no body)               — end the running session.
 * POST /api/session/group   { sesiId, kelompokId, aktif } — per-session group override.
 * POST /api/session/roster  { paste }                — replace the master roster.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok, anggota, sesiKelompok, sesi } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { parseRosterPaste } from "../../src/lib/roster-parser.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { eq, sql, notInArray } from "drizzle-orm";

async function handleCurrent(_req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();

  const db = getDb();
  const groups = await db.select().from(kelompok);
  const members = await db
    .select({ kelompokId: anggota.kelompokId, nim: anggota.nim, nama: anggota.nama })
    .from(anggota);
  const overrides = running
    ? await db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, running.id))
    : [];
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));

  const roster = groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => ({
      id: g.id,
      nomor: g.nomor,
      nama: g.nama,
      aktif: g.aktif,
      sesiAktif: overrideByKelompokId.get(g.id)?.aktif ?? true,
      anggota: members
        .filter((m) => m.kelompokId === g.id)
        .map((m) => ({ nim: m.nim, nama: m.nama })),
    }));

  res.status(200).json({ ok: true, sesi: running, roster });
}

async function handleEnd(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const db = getDb();
  const [updated] = await db
    .update(sesi)
    .set({
      status: "selesai",
      selesaiPada: sql`now()`,
      durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
    })
    .where(eq(sesi.id, running.id))
    .returning();

  await writeAudit(session.nim, "sesi_akhiri", { sesiId: running.id });
  res.status(200).json({ ok: true, sesi: updated });
}

async function handleGroup(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kelompokId = Number(body.kelompokId);
  const aktif = Boolean(body.aktif);

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !Number.isInteger(kelompokId) ||
    kelompokId <= 0
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();
    await db
      .insert(sesiKelompok)
      .values({ sesiId, kelompokId, aktif })
      .onConflictDoUpdate({
        target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
        set: { aktif },
      });

    await writeAudit(session.nim, "sesi_kelompok_set", { sesiId, kelompokId, aktif });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[api/session/group] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleRoster(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const paste = typeof body.paste === "string" ? body.paste : "";

  const parsed = parseRosterPaste(paste);
  if (parsed.errors.length > 0) {
    res.status(200).json({
      ok: false,
      kode: "galat_tempel",
      errors: parsed.errors,
      groups: parsed.groups.length,
      total: parsed.total,
    });
    return;
  }

  try {
    const db = getDb();

    await db.transaction(async (tx) => {
      const keepNims = parsed.groups.flatMap((g) => g.anggota.map((m) => m.nim));

      for (const g of parsed.groups) {
        const nama = g.nama || `Kelompok ${g.nomor}`;
        const [row] = await tx
          .insert(kelompok)
          .values({ nomor: g.nomor, nama, aktif: true })
          .onConflictDoUpdate({ target: kelompok.nomor, set: { nama, aktif: true } })
          .returning({ id: kelompok.id });

        for (const m of g.anggota) {
          await tx
            .insert(anggota)
            .values({ kelompokId: row.id, nim: m.nim, nama: m.nama })
            .onConflictDoUpdate({
              target: anggota.nim,
              set: { kelompokId: row.id, nama: m.nama },
            });
        }
      }

      // Full replace on members only -- see the old roster.ts header comment
      // for why groups don't get the same treatment.
      if (keepNims.length > 0) {
        await tx.delete(anggota).where(notInArray(anggota.nim, keepNims));
      } else {
        await tx.delete(anggota);
      }
    });

    await writeAudit(session.nim, "roster_set", {
      kelompok: parsed.groups.length,
      anggota: parsed.total,
    });

    res.status(200).json({ ok: true, groups: parsed.groups.length, total: parsed.total });
  } catch (err) {
    console.error("[api/session/roster] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const aksi = req.query.aksi;

  if (aksi === "current") {
    if (!requireMethod(req, res, "GET")) return;
    return handleCurrent(req, res);
  }
  if (aksi === "end") {
    if (!requireMethod(req, res, "POST")) return;
    return handleEnd(req, res, session);
  }
  if (aksi === "group") {
    if (!requireMethod(req, res, "POST")) return;
    return handleGroup(req, res, session);
  }
  if (aksi === "roster") {
    if (!requireMethod(req, res, "POST")) return;
    return handleRoster(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
