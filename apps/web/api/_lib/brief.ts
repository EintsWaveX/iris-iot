/**
 * The Asisten's own Module Brief (Ringkasan), per module and language
 * (Phase 9 Stage 3), behind /api/session/brief:
 *
 * GET   every saved brief (public, like the module pages that show it),
 *       with the editor's display name, since a guest can't read the
 *       Asisten directory. Edge-cached; `?segar=1` skips the cache, for
 *       the editors, which read back right after a save
 * POST  { modul, bahasa, ringkasan, langkah: string[] }   Jadwal right;
 *       an empty ringkasan with no steps removes the override, so the
 *       handbook's own text shows again
 */
import { eq, and } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { cekHak } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import { asisten, modulBrief } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";

const BAHASA = ["id", "en", "zh"];

export async function handleBriefGet(req: ApiRequest, res: ApiResponse) {
  res.setHeader(
    "Cache-Control",
    req.query.segar === "1"
      ? "no-store"
      : "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
  );
  const rows = await getDb()
    .select({ brief: modulBrief, nama: asisten.nama, kode: asisten.kode })
    .from(modulBrief)
    .leftJoin(asisten, eq(asisten.nim, modulBrief.diubahOleh));
  const brief = rows.map((r) => ({
    ...r.brief,
    diubahOlehNama: r.nama ? `${r.nama}${r.kode ? ` (${r.kode.trim().toUpperCase()})` : ""}` : null,
  }));
  res.status(200).json({ ok: true, brief });
}

export async function handleBriefPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const bahasa = typeof body.bahasa === "string" ? body.bahasa : "";
  const ringkasan = typeof body.ringkasan === "string" ? body.ringkasan.trim().slice(0, 4000) : "";
  const langkah = Array.isArray(body.langkah)
    ? body.langkah
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 20)
    : null;
  if (![1, 2, 3, 4].includes(modul) || !BAHASA.includes(bahasa) || langkah === null) {
    return res.status(200).json({ ok: false, kode: "format_salah" });
  }
  if (!(await cekHak(res, session.nim, "jadwal"))) return;
  const db = getDb();
  if (!ringkasan && langkah.length === 0) {
    await db
      .delete(modulBrief)
      .where(and(eq(modulBrief.modul, modul), eq(modulBrief.bahasa, bahasa)));
  } else {
    await db
      .insert(modulBrief)
      .values({ modul, bahasa, isi: { ringkasan, langkah }, diubahOleh: session.nim })
      .onConflictDoUpdate({
        target: [modulBrief.modul, modulBrief.bahasa],
        set: { isi: { ringkasan, langkah }, diubahOleh: session.nim, diubahPada: new Date() },
      });
  }
  await writeAudit(session.nim, "modul_brief", {
    modul,
    bahasa,
    hapus: !ringkasan && !langkah.length,
  });
  res.status(200).json({ ok: true });
}
