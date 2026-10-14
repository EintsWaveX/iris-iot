/**
 * POST /api/session/ubah {modul?, kelas?} (Ada Masalah?, 2026-10-10): fix a
 * session started with the wrong module or class type, without starting
 * a new one. Session control only (the [aksi] router checks it).
 *
 * - The module changes only while no blank in the session is right yet.
 *   Its wrong answers, hint requests and journal captures belong to the
 *   old module's code and go with it; the roster, attendance and pairings
 *   stay. A Module 4 hunt that was started is closed first. The lab check
 *   for the new module runs and its warnings come back (the session is
 *   already running, so they never block). A closed module is refused,
 *   except in a TOT session, which may use any.
 * - The class type changes only before any scores were sent, since a sent
 *   group already counts toward pay at the old rate.
 */
import { and, eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, pgErrorCode } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  jawaban,
  jurnalTangkapan,
  nilaiKirim,
  petunjukMinta,
  sesi,
  sesiKejadian,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { isKelas } from "../../src/lib/kelas.js";
import { gagalMulai } from "../../src/lib/siap-mulai.js";
import { cekSiapMulai } from "./siap-mulai.js";
import { tutupPerburuan } from "./perburuan-sesi.js";
import { pindahKursiModul } from "./phase8.js";

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

export async function handleUbahSesi(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = body.modul == null ? null : Number(body.modul);
  const kelas = body.kelas == null ? null : body.kelas;
  if (
    (modul === null && kelas === null) ||
    (modul !== null && ![1, 2, 3, 4].includes(modul)) ||
    (kelas !== null && !isKelas(kelas))
  )
    return tolak(res, "format_salah");
  const running = await currentSesi();
  if (!running) return tolak(res, "sesi_tidak_ada");
  const db = getDb();
  const tot = running.jenis === "tot";
  let peringatan: { id: string; layanan?: string }[] = [];

  if (modul !== null && modul !== running.modul) {
    const [benar] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jawaban)
      .where(and(eq(jawaban.sesiId, running.id), eq(jawaban.benar, true)));
    if ((benar?.n ?? 0) > 0) return tolak(res, "ada_benar", { benar: benar.n });
    const { cek } = await cekSiapMulai({ modul, tot, butuhAp: false });
    const { keras, lunak } = gagalMulai(cek);
    if (keras.some((c) => c.id !== "tot")) return tolak(res, "modul_tertutup");
    peringatan = lunak;
    await tutupPerburuan(running.id, running.modul, session.nim);
    try {
      await db.transaction(async (tx) => {
        await tx.delete(jawaban).where(eq(jawaban.sesiId, running.id));
        await tx.delete(petunjukMinta).where(eq(petunjukMinta.sesiId, running.id));
        await tx.delete(jurnalTangkapan).where(eq(jurnalTangkapan.sesiId, running.id));
        await tx.update(sesi).set({ modul, butuhAp: false }).where(eq(sesi.id, running.id));
        await tx.insert(sesiKejadian).values({
          sesiId: running.id,
          jenis: "modul",
          detail: { dari: running.modul, ke: modul },
          aktorNim: session.nim,
        });
      });
    } catch (err) {
      // The same module at the same date and time is another session.
      if (pgErrorCode(err) === "23505") return tolak(res, "sudah_ada");
      throw err;
    }
    // A semester paired per module: the groups follow the new module's list.
    const pindah = tot ? 0 : await pindahKursiModul(db, running, running.modul, modul, session.nim);
    await writeAudit(session.nim, "sesi_modul", {
      sesiId: running.id,
      dari: running.modul,
      ke: modul,
      ...(pindah ? { kursiPindah: pindah } : {}),
    });
  }

  if (kelas !== null && kelas !== running.kelas) {
    const [kirim] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(nilaiKirim)
      .where(eq(nilaiKirim.sesiId, running.id));
    if ((kirim?.n ?? 0) > 0) return tolak(res, "sudah_kirim");
    await db.update(sesi).set({ kelas }).where(eq(sesi.id, running.id));
    await db.insert(sesiKejadian).values({
      sesiId: running.id,
      jenis: "kelas",
      detail: { dari: running.kelas, ke: kelas },
      aktorNim: session.nim,
    });
    await writeAudit(session.nim, "sesi_kelas", {
      sesiId: running.id,
      dari: running.kelas,
      ke: kelas,
    });
  }

  res.status(200).json({
    ok: true,
    peringatan: peringatan.map((c) => ({ id: c.id, layanan: c.layanan ?? null })),
  });
}
