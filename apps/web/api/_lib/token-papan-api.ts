/**
 * GET /api/session/tokenpapan (2026-11-14): the Asisten token for the scoreboard's Mission Control,
 * so nobody has to dig it out of the PC's module log. The route only lets a signed-in Asisten in
 * (requireRole in api/session/[aksi].ts); handlePerburuan, which Praktikan read, never carries it.
 *
 * The token is handed out only while a Module 4 session is running, and never cached by anyone.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { tokenAsisten } from "./perburuan-api.js";

export async function handleTokenPapanGet(_req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const running = await currentSesi();
  if (!running || running.modul !== 4) {
    res.status(200).json({ ok: true, token: null, sesiModul4: false });
    return;
  }
  res.status(200).json({ ok: true, token: await tokenAsisten(), sesiModul4: true });
}
