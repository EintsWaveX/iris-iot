/**
 * GET/POST /api/session/beacons (2026-11-13): how many Beacons Module 4's hunt has, and which groups
 * each serves (src/lib/beacon-bersama.ts). With a Beacon per group (the default) nothing is shared;
 * with fewer, a Beacon serves several groups and the build and the download of a Beacon's file carry
 * them.
 *
 * Any Asisten reads it and may change it, but only before the hunt starts: the boards are flashed
 * before Mulai Perburuan, so a change while it runs would strand them ("hunt_berjalan"). Changing it
 * while a Module 4 session is open but not started is allowed; the answer says so, because a Beacon
 * that was already flashed must be flashed again.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { KELOMPOK_DEFAULT } from "../../src/lib/jadwal.js";
import { BEACON_MAKS, bacaBeacon, type PengaturanBeacon } from "../../src/lib/beacon-bersama.js";
import { bacaBeaconHunt, tulisBeaconHunt } from "../../src/lib/beacon-hunt.js";
import { perburuanBerjalan } from "../../src/lib/perburuan.js";
import { bacaPerburuanSesi } from "./perburuan-sesi.js";

async function keadaanSesi(): Promise<{
  sesiModul4: boolean;
  huntBerjalan: boolean;
  jumlahKelompok: number;
}> {
  const running = await currentSesi();
  if (!running || running.modul !== 4)
    return { sesiModul4: false, huntBerjalan: false, jumlahKelompok: KELOMPOK_DEFAULT };
  const p = await bacaPerburuanSesi(running.id);
  return {
    sesiModul4: true,
    huntBerjalan: perburuanBerjalan(p),
    jumlahKelompok: running.jumlahKelompok,
  };
}

export async function handleBeaconGet(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const [p, k] = await Promise.all([bacaBeaconHunt(), keadaanSesi()]);
  res.status(200).json({
    ok: true,
    jumlah: p.jumlah,
    pola: p.pola,
    jumlahKelompok: k.jumlahKelompok,
    terkunci: k.huntBerjalan,
    sesiModul4: k.sesiModul4,
  });
}

/** The posted layout, or null when it is not one: jumlah null or a whole number from 1 to BEACON_MAKS, pola one of the two */
function bacaBody(body: Record<string, unknown>): PengaturanBeacon | null {
  const j = body.jumlah;
  if (j !== null && !(typeof j === "number" && Number.isInteger(j) && j >= 1 && j <= BEACON_MAKS))
    return null;
  if (body.pola !== "selang" && body.pola !== "berurutan") return null;
  return bacaBeacon({ jumlah: j, pola: body.pola });
}

export async function handleBeaconPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
): Promise<void> {
  const baru = bacaBody(jsonBody(req));
  if (!baru) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const k = await keadaanSesi();
  if (k.huntBerjalan) {
    res.status(200).json({ ok: false, kode: "hunt_berjalan" });
    return;
  }
  const lama = await bacaBeaconHunt();
  if (lama.jumlah !== baru.jumlah || lama.pola !== baru.pola) {
    await tulisBeaconHunt(baru, session.nim);
    await writeAudit(session.nim, "beacon_hunt", { dari: lama, ke: baru });
  }
  res
    .status(200)
    .json({ ok: true, jumlah: baru.jumlah, pola: baru.pola, sesiModul4: k.sesiModul4 });
}
