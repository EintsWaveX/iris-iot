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
 * GET  /api/session/now                             — asisten OR praktikan. Module/timing/broadcast only, no roster.
 * GET  /api/session/current                        — running session + master roster.
 * POST /api/session/end     (no body)               — end the running session.
 * POST /api/session/group   { sesiId, kelompokId, aktif } — per-session group override.
 * POST /api/session/roster  { paste }                — replace the master roster.
 * POST /api/session/cancel  { sesiId }               — mark a session "batal", freeing its slot.
 * GET  /api/session/laporan (Stage 10)               — per-group progress, attendance and the stuck list.
 * POST /api/session/siarkan { pesan } (Stage 10)     — set or clear the running session's broadcast.
 * POST /api/session/catatan { sesiId, kelompokId, catatan, peran } (Stage 10) — per-group note/role.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole, requireAnyRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import {
  kelompok,
  anggota,
  sesiKelompok,
  sesi,
  jawaban,
  percobaanMasuk,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { parseRosterPaste } from "../../src/lib/roster-parser.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { blankCountForModul } from "../_lib/answer-keys.js";
import { eq, and, gte, like, sql, notInArray } from "drizzle-orm";

const PESAN_MAX_LEN = 200;
const CATATAN_MAX_LEN = 300;
const PERAN_VALID = new Set(["beacon", "hunter"]);

/** GET /api/session/now — the narrow session banner endpoint. Module,
 *  timing and AP-mode flag only; never the roster, since a praktikan's
 *  browser can reach this and a route it can reach must never return
 *  another student's NIM even as a side effect (see publicRoster()'s own
 *  header comment for the same rule). */
async function handleNow(_req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: true, sesi: null });
    return;
  }
  res.status(200).json({
    ok: true,
    sesi: {
      modul: running.modul,
      tanggal: running.tanggal,
      mulai: running.mulai,
      mulaiPada: running.mulaiPada,
      slot: running.slot,
      butuhAp: running.butuhAp,
      pengumuman: running.pengumuman,
      pengumumanPada: running.pengumumanPada,
    },
  });
}

async function handleCancel(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [row] = await db
    .select({ status: sesi.status })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  if (row.status === "selesai" || row.status === "batal") {
    res.status(200).json({ ok: false, kode: "sudah_selesai" });
    return;
  }

  await db.update(sesi).set({ status: "batal" }).where(eq(sesi.id, sesiId));
  await writeAudit(session.nim, "sesi_batal", { sesiId });
  res.status(200).json({ ok: true });
}

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

/**
 * GET /api/session/laporan (Stage 10) — everything the console's live
 * tiles and stuck list need in one call, the same "one call, everything"
 * shape handleCurrent already uses for the roster paste box. Scoped to
 * jawaban/percobaanMasuk rows from the running session itself, not any
 * earlier home-practice activity under the same groups -- see jawaban's
 * own schema comment for why a row's sesiId can be null.
 */
async function handleLaporan(_req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: true, sesi: null, kelompok: [], stuck: [] });
    return;
  }

  const db = getDb();
  const groups = await db.select().from(kelompok).where(eq(kelompok.aktif, true));
  const members = await db
    .select({ kelompokId: anggota.kelompokId, nim: anggota.nim })
    .from(anggota);
  const overrides = await db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, running.id));
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));

  const prefix = `m${running.modul}.`;
  const jawabanRows = await db
    .select({
      kelompokId: jawaban.kelompokId,
      soalKode: jawaban.soalKode,
      benar: jawaban.benar,
      percobaan: jawaban.percobaan,
    })
    .from(jawaban)
    .where(and(eq(jawaban.sesiId, running.id), like(jawaban.soalKode, `${prefix}%`)));

  const startedAt = running.mulaiPada ?? running.dibuatPada;
  const masukRows = await db
    .select({ nim: percobaanMasuk.nim })
    .from(percobaanMasuk)
    .where(
      and(
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
        gte(percobaanMasuk.pada, startedAt),
      ),
    );
  const hadirNims = new Set(masukRows.map((r) => r.nim));

  const total = blankCountForModul(running.modul);
  const daftarKelompok = groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => {
      const override = overrideByKelompokId.get(g.id);
      const anggotaKelompok = members.filter((m) => m.kelompokId === g.id);
      const benar = jawabanRows.filter((r) => r.kelompokId === g.id && r.benar).length;
      const hadir = anggotaKelompok.filter((m) => hadirNims.has(m.nim)).length;
      return {
        id: g.id,
        nomor: g.nomor,
        nama: g.nama,
        sesiAktif: override?.aktif ?? true,
        catatan: override?.catatan ?? null,
        peran: override?.peran ?? null,
        anggotaTotal: anggotaKelompok.length,
        hadir,
        benar,
        total,
      };
    });

  const kelompokNomorById = new Map(groups.map((g) => [g.id, g.nomor]));
  const stuck = jawabanRows
    .filter((r) => !r.benar && r.percobaan > 0)
    .map((r) => ({
      kelompokId: r.kelompokId,
      nomor: kelompokNomorById.get(r.kelompokId) ?? null,
      soalKode: r.soalKode,
      percobaan: r.percobaan,
    }))
    .sort((a, b) => b.percobaan - a.percobaan);

  res.status(200).json({
    ok: true,
    sesi: { id: running.id, modul: running.modul, tanggal: running.tanggal, mulai: running.mulai },
    kelompok: daftarKelompok,
    stuck,
  });
}

/** POST /api/session/siarkan { pesan } (Stage 10) — an empty/whitespace-only
 *  pesan clears the broadcast rather than being rejected, since "take down
 *  what I just said" is a normal thing an assistant does with this. */
async function handleSiarkan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const body = jsonBody(req);
  const pesanMentah = typeof body.pesan === "string" ? body.pesan.trim() : "";
  if (pesanMentah.length > PESAN_MAX_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const pesan = pesanMentah.length > 0 ? pesanMentah : null;

  const db = getDb();
  await db
    .update(sesi)
    .set({ pengumuman: pesan, pengumumanPada: new Date() })
    .where(eq(sesi.id, running.id));

  await writeAudit(session.nim, "sesi_siarkan", { sesiId: running.id, pesan });
  res.status(200).json({ ok: true });
}

/** POST /api/session/catatan { sesiId, kelompokId, catatan, peran } (Stage
 *  10) — the per-group note and role sesi_kelompok has carried since
 *  migration 0002 with nothing ever writing to either column until now.
 *  Deliberately separate from handleGroup's aktif toggle: two different
 *  assistant intentions ("exclude this group" vs. "leave a note") sharing
 *  one action would mean every note-only save has to first re-read and
 *  resend whatever aktif already was, just to avoid clobbering it. */
async function handleCatatan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kelompokId = Number(body.kelompokId);
  const catatanMentah = typeof body.catatan === "string" ? body.catatan.trim() : "";
  const peranMentah = typeof body.peran === "string" ? body.peran : null;

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !Number.isInteger(kelompokId) ||
    kelompokId <= 0 ||
    catatanMentah.length > CATATAN_MAX_LEN ||
    (peranMentah !== null && !PERAN_VALID.has(peranMentah))
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const catatan = catatanMentah.length > 0 ? catatanMentah : null;
  const peran = peranMentah as "beacon" | "hunter" | null;

  const db = getDb();
  await db
    .insert(sesiKelompok)
    .values({ sesiId, kelompokId, catatan, peran })
    .onConflictDoUpdate({
      target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
      set: { catatan, peran },
    });

  await writeAudit(session.nim, "sesi_kelompok_catatan", { sesiId, kelompokId, catatan, peran });
  res.status(200).json({ ok: true });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const aksi = req.query.aksi;

  // "now" is the one action either role can call -- checked before the
  // blanket asisten-only guard below, not as an exception carved into it.
  if (aksi === "now") {
    if (!requireMethod(req, res, "GET")) return;
    if (!requireAnyRole(req, res, ["asisten", "praktikan"])) return;
    return handleNow(req, res);
  }

  const session = requireRole(req, res, "asisten");
  if (!session) return;

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
  if (aksi === "cancel") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCancel(req, res, session);
  }
  if (aksi === "laporan") {
    if (!requireMethod(req, res, "GET")) return;
    return handleLaporan(req, res);
  }
  if (aksi === "siarkan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleSiarkan(req, res, session);
  }
  if (aksi === "catatan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCatatan(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
