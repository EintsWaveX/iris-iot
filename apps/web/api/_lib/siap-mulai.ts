/**
 * Gathers what src/lib/siap-mulai.ts's cekMulai() needs for a session
 * start: Mode TOT, the open modules, and the enrolled PC's newest heartbeat
 * (its services and network mode). Read-only.
 */
import { desc, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { denyut, server } from "../../src/lib/schema.js";
import { getModulTerbuka } from "../../src/lib/akses.js";
import { totAktif } from "../../src/lib/mode-tot.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { batasLuringDetik } from "../../src/lib/server-lib.js";
import { cekMulai, type CekMulai, type FaktaMulai } from "../../src/lib/siap-mulai.js";

/** The enrolled PC that beat most recently (the lab has one; a spare or a
 *  test install may also be enrolled), with its newest heartbeat. */
export async function faktaPc(): Promise<(NonNullable<FaktaMulai["pc"]> & { id: number }) | null> {
  const db = getDb();
  const enrolled = await db
    .select({ id: server.id })
    .from(server)
    .where(isNotNull(server.agenKunciHash));
  if (!enrolled.length) return null;
  const ids = enrolled.map((e) => e.id);
  const [[beat], running] = await Promise.all([
    db
      .select({
        serverId: denyut.serverId,
        pada: denyut.pada,
        layanan: denyut.layanan,
        modeJaringan: denyut.modeJaringan,
      })
      .from(denyut)
      .where(inArray(denyut.serverId, ids))
      .orderBy(desc(denyut.pada))
      .limit(1),
    currentSesi(),
  ]);
  const pada = beat?.pada ?? null;
  return {
    id: beat?.serverId ?? ids[0],
    umurDetik: pada ? Math.max(0, Math.round((Date.now() - pada.getTime()) / 1000)) : null,
    batasLuringDetik: batasLuringDetik(pada, running?.mulaiPada ?? null),
    layanan: beat?.layanan ?? null,
    modeJaringan: beat?.modeJaringan ?? null,
  };
}

export async function cekSiapMulai(a: {
  modul: number;
  tot: boolean;
  butuhAp: boolean;
}): Promise<{ cek: CekMulai[]; serverId: number | null }> {
  const [modeTot, modulTerbuka, pc] = await Promise.all([totAktif(), getModulTerbuka(), faktaPc()]);
  return { cek: cekMulai({ ...a, modeTot, modulTerbuka, pc }), serverId: pc?.id ?? null };
}
