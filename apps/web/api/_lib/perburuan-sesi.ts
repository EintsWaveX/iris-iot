/**
 * Mulai and Selesai Perburuan (2026-10-08): the Asisten's switch for the
 * Module 4 hunt in a running session. Starting a Module 4 session no longer
 * touches the network; Mulai turns the IRIS_IOT hotspot and modul4.service
 * on (queued for the one enrolled PC), unlocks the Praktikan's Perburuan
 * step, and Selesai (or ending the session) turns both off again.
 *
 * POST /api/session/perburuan { langkah: "mulai" | "selesai" }  (Asisten)
 *
 * One record per session in `pengaturan` (no migration).
 */
import { eq } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { pengaturan } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { queueSoloServerCommand } from "../../src/lib/server-lib.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { bacaPerburuanSesi as baca, type PerburuanSesi } from "../../src/lib/perburuan.js";

export function kunciPerburuan(sesiId: number): string {
  return `perburuan_sesi_${sesiId}`;
}

export async function bacaPerburuanSesi(sesiId: number): Promise<PerburuanSesi | null> {
  const [r] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, kunciPerburuan(sesiId)))
    .limit(1);
  return baca(r?.nilai);
}

async function simpan(sesiId: number, nilai: PerburuanSesi, nim: string): Promise<void> {
  await getDb()
    .insert(pengaturan)
    .values({ kunci: kunciPerburuan(sesiId), nilai, diubahOleh: nim })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: nim, diubahPada: new Date() },
    });
}

/** The hotspot and the scoreboard off; true when the PC could be chosen. */
async function matikan(nim: string): Promise<boolean> {
  const ap = await queueSoloServerCommand("ap.mati", nim);
  await queueSoloServerCommand("layanan.henti", nim, { layanan: "modul4" });
  return ap;
}

/**
 * A session that ends (or is cancelled, or replaced) closes its hunt and
 * turns the hotspot and the scoreboard off, whether or not Mulai was ever
 * pressed: an old hotspot must never outlive its session.
 */
export async function tutupPerburuan(sesiId: number, modul: number, nim: string): Promise<void> {
  if (modul !== 4) return;
  const p = await bacaPerburuanSesi(sesiId);
  if (p?.mulai && !p.selesai) {
    await simpan(sesiId, { ...p, selesai: new Date().toISOString() }, nim);
  }
  await matikan(nim);
}

export async function handlePerburuanPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
): Promise<void> {
  const body = jsonBody(req);
  const langkah = body.langkah;
  if (langkah !== "mulai" && langkah !== "selesai") {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const running = await currentSesi();
  if (!running || running.status !== "berjalan") {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  if (running.modul !== 4) {
    res.status(200).json({ ok: false, kode: "bukan_modul4" });
    return;
  }

  const lama = await bacaPerburuanSesi(running.id);
  const kini = new Date().toISOString();

  if (langkah === "mulai") {
    // Pressed again while it runs: send the commands again (a PC that missed
    // them), keep the first start time.
    const nilai: PerburuanSesi = {
      mulai: lama?.mulai && !lama.selesai ? lama.mulai : kini,
      selesai: null,
      oleh: session.nim,
    };
    await simpan(running.id, nilai, session.nim);
    const diantre = await queueSoloServerCommand("ap.nyala", session.nim);
    if (diantre) await queueSoloServerCommand("layanan.mulai", session.nim, { layanan: "modul4" });
    await writeAudit(session.nim, "perburuan_mulai", { sesiId: running.id, diantre });
    res.status(200).json({ ok: true, perburuan: nilai, diantre });
    return;
  }

  if (!lama?.mulai) {
    res.status(200).json({ ok: false, kode: "belum_mulai" });
    return;
  }
  const nilai: PerburuanSesi = { ...lama, selesai: lama.selesai ?? kini };
  await simpan(running.id, nilai, session.nim);
  const diantre = await matikan(session.nim);
  await writeAudit(session.nim, "perburuan_selesai", { sesiId: running.id, diantre });
  res.status(200).json({ ok: true, perburuan: nilai, diantre });
}
