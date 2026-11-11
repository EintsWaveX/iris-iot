/**
 * GET/POST /api/session/jaringan (2026-11-11): which network Module 4's hunt
 * runs on, IRIS_IOT (the PC's hotspot) or the internet (phone hotspots).
 *
 * Any Asisten reads it. Any Asisten may switch it, but only before the hunt
 * starts: the boards are flashed before Mulai Perburuan with the network's
 * Wi-Fi name and scoreboard address, so a switch while the hunt runs would
 * strand them ("hunt_berjalan"). Switching while a Module 4 session is open
 * but not started is allowed; the answer says so, because Praktikan who
 * already downloaded a sketch must download it again.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { jaringanValid } from "../../src/lib/jaringan.js";
import { bacaJaringanHunt, tulisJaringanHunt } from "../../src/lib/jaringan-hunt.js";
import { perburuanBerjalan } from "../../src/lib/perburuan.js";
import { bacaPerburuanSesi } from "./perburuan-sesi.js";

/** What the Module 4 session in progress means for a switch right now. */
async function keadaanSesi(): Promise<{ sesiModul4: boolean; huntBerjalan: boolean }> {
  const running = await currentSesi();
  if (!running || running.modul !== 4) return { sesiModul4: false, huntBerjalan: false };
  const p = await bacaPerburuanSesi(running.id);
  return { sesiModul4: true, huntBerjalan: perburuanBerjalan(p) };
}

export async function handleJaringanGet(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const [jaringan, k] = await Promise.all([bacaJaringanHunt(), keadaanSesi()]);
  res.status(200).json({ ok: true, jaringan, terkunci: k.huntBerjalan, sesiModul4: k.sesiModul4 });
}

export async function handleJaringanPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
): Promise<void> {
  const body = jsonBody(req);
  if (!jaringanValid(body.jaringan)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const k = await keadaanSesi();
  if (k.huntBerjalan) {
    res.status(200).json({ ok: false, kode: "hunt_berjalan" });
    return;
  }
  const lama = await bacaJaringanHunt();
  if (lama !== body.jaringan) {
    await tulisJaringanHunt(body.jaringan, session.nim);
    await writeAudit(session.nim, "jaringan_hunt", { dari: lama, ke: body.jaringan });
  }
  // sesiModul4: the Praktikan who already downloaded a sketch need the new one
  res.status(200).json({ ok: true, jaringan: body.jaringan, sesiModul4: k.sesiModul4 });
}
