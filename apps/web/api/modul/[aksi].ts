/**
 * /api/modul/:aksi — praktikan-only. The editor's server side: draft
 * retrieval, per-blank checking, and the gated full-file download. Kept as
 * one dynamic-segment function for the same reason api/session/[aksi].ts
 * and api/auth/[aksi].ts already are: the Vercel Hobby plan's serverless
 * function ceiling (see MIGRATIONS.md's Stage 4 note).
 *
 * GET  /api/modul/draft?modul=&berkas=   — this group's saved answers for one file (isi + benar only, never the key).
 * POST /api/modul/cek    { modul, berkas, nomor, jawaban } — check one blank, persist the attempt.
 * GET  /api/modul/unduh?modul=&berkas=   — the reconstructed file, gated on every blank being correct.
 *
 * The single most important rule in this file: a correct answer string
 * never appears in any response body, bundled script, or error message.
 * checkJawaban() only ever returns a boolean plus a "why" line that exists
 * independently of the answer itself -- see answer-keys.ts's own header.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { jawaban } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { parseBlanks, soalKode, soalKodePrefix } from "../../src/lib/blanks.js";
import { checkJawaban, blankCountFor, canonicalAnswer } from "../_lib/answer-keys.js";
import { getSketchSourceForApi } from "../_lib/sketch-sources.js";
import { personalize } from "../../src/lib/group-identity.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { and, eq, like } from "drizzle-orm";

const MAX_JAWABAN_LEN = 200;

/** File extension per berkas slug, matched explicitly rather than guessed
 *  from the name -- see sketch-sources.ts for the same 8 slugs' real
 *  filenames, which this must stay in sync with by hand. */
const BERKAS_EXT: Record<string, string> = {
  modul1_ble_central: ".ino",
  modul1_ble_peripheral: ".ino",
  modul2_websocket_server: ".py",
  modul2_websocket_esp32: ".ino",
  modul3_mqtt_publish: ".py",
  modul3_mqtt_subscribe: ".py",
  modul4_hunter: ".ino",
  modul4_beacon: ".ino",
};

function parseModulBerkas(
  query: Record<string, string | string[] | undefined>,
): { modul: number; berkas: string } | null {
  const modulRaw = query.modul;
  const berkasRaw = query.berkas;
  const modul = Number(Array.isArray(modulRaw) ? modulRaw[0] : modulRaw);
  const berkas = Array.isArray(berkasRaw) ? berkasRaw[0] : berkasRaw;
  if (!Number.isInteger(modul) || modul < 1 || modul > 4) return null;
  if (!berkas || !/^[a-z0-9_]+$/.test(berkas)) return null;
  if (blankCountFor(modul, berkas) === 0) return null;
  return { modul, berkas };
}

async function handleDraft(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const parsed = parseModulBerkas(req.query);
  if (!parsed) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const kelompokId = session.reguId;
  if (!kelompokId) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const prefix = soalKodePrefix(parsed.modul, parsed.berkas);
  const db = getDb();
  const rows = await db
    .select({ soalKode: jawaban.soalKode, isi: jawaban.isi, benar: jawaban.benar })
    .from(jawaban)
    .where(and(eq(jawaban.kelompokId, kelompokId), like(jawaban.soalKode, `${prefix}%`)));

  const out: Record<string, { isi: string; benar: boolean }> = {};
  for (const row of rows) {
    const nomor = row.soalKode.slice(prefix.length);
    out[nomor] = { isi: row.isi, benar: row.benar };
  }
  // Not a secret -- a group already knows its own number, and this is the
  // signal the editor's Code step uses to show the sketch's identity line
  // (GROUP_ID, LORA_SYNC_WORD) as THIS group's own value rather than the
  // generic template's, matching what the gated download already produces.
  res.status(200).json({ ok: true, jawaban: out, nomorKelompok: session.reguNomor ?? null });
}

async function handleCek(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const berkas = typeof body.berkas === "string" ? body.berkas : "";
  const nomor = Number(body.nomor);
  const jawabanTeks = typeof body.jawaban === "string" ? body.jawaban : "";

  if (
    !Number.isInteger(modul) ||
    modul < 1 ||
    modul > 4 ||
    !/^[a-z0-9_]+$/.test(berkas) ||
    !Number.isInteger(nomor) ||
    nomor < 1 ||
    jawabanTeks.length === 0 ||
    jawabanTeks.length > MAX_JAWABAN_LEN
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const kelompokId = session.reguId;
  const nomorKelompok = session.reguNomor;
  if (!kelompokId || !nomorKelompok) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const kode = soalKode(modul, berkas, nomor);
  const result = checkJawaban(kode, jawabanTeks, { nomorKelompok });
  if (!result.ditemukan) {
    res.status(200).json({ ok: false, kode: "soal_tidak_ada" });
    return;
  }

  const running = await currentSesi();
  const db = getDb();

  // sesiId is only meaningful while a session is running (see jawaban's own
  // schema comment); practising at home writes a row with sesiId null, and
  // the table's partial unique index is what still keeps that to one row
  // per group per blank instead of growing one per attempt.
  const target = running
    ? and(
        eq(jawaban.sesiId, running.id),
        eq(jawaban.kelompokId, kelompokId),
        eq(jawaban.soalKode, kode),
      )
    : and(eq(jawaban.kelompokId, kelompokId), eq(jawaban.soalKode, kode));

  const [existing] = await db
    .select({ percobaan: jawaban.percobaan })
    .from(jawaban)
    .where(target)
    .limit(1);

  if (existing) {
    await db
      .update(jawaban)
      .set({
        isi: jawabanTeks,
        benar: result.benar,
        percobaan: existing.percobaan + 1,
        versi: 1,
        diubahOleh: session.nim,
        diubahPada: new Date(),
      })
      .where(target);
  } else {
    await db.insert(jawaban).values({
      sesiId: running?.id ?? null,
      kelompokId,
      soalKode: kode,
      isi: jawabanTeks,
      benar: result.benar,
      percobaan: 1,
      diubahOleh: session.nim,
    });
  }

  res.status(200).json({ ok: true, benar: result.benar, kenapa: result.kenapa });
}

async function handleUnduh(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const parsed = parseModulBerkas(req.query);
  if (!parsed) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const kelompokId = session.reguId;
  const nomorKelompok = session.reguNomor;
  if (!kelompokId || !nomorKelompok) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const total = blankCountFor(parsed.modul, parsed.berkas);
  const prefix = soalKodePrefix(parsed.modul, parsed.berkas);

  const db = getDb();
  const rows = await db
    .select({ soalKode: jawaban.soalKode, benar: jawaban.benar })
    .from(jawaban)
    .where(and(eq(jawaban.kelompokId, kelompokId), like(jawaban.soalKode, `${prefix}%`)));

  // The downloaded file gets each blank's as-authored canonical text, not
  // the student's raw isi -- see canonicalAnswer()'s own comment for why
  // (a normalized-equal but noisy answer would otherwise not compile).
  const answers = new Map<number, string>();
  for (const row of rows) {
    if (!row.benar) continue;
    const canonical = canonicalAnswer(row.soalKode, { nomorKelompok });
    if (canonical === undefined) continue;
    const nomor = Number(row.soalKode.slice(prefix.length));
    answers.set(nomor, canonical);
  }

  if (answers.size < total) {
    res.status(200).json({ ok: false, kode: "belum_lengkap", benar: answers.size, total });
    return;
  }

  // Reconstruct from this praktikan's own selected language track -- a
  // student working the id/ carousel gets the id/ comments back, not a
  // silently swapped-in en/ file with the same code.
  const bahasa = req.query.bahasa === "en" ? "en" : "id";
  const ext = BERKAS_EXT[parsed.berkas];
  if (!ext) {
    res.status(200).json({ ok: false, kode: "berkas_tidak_ada" });
    return;
  }
  const filename = `${parsed.berkas}${ext}`;
  const template = getSketchSourceForApi(bahasa, filename);
  if (template === undefined) {
    res.status(200).json({ ok: false, kode: "berkas_tidak_ada" });
    return;
  }

  const segments = parseBlanks(template);
  const reconstructedGeneric = segments
    .map((s) => (s.kind === "text" ? s.text : (answers.get(s.nomor) ?? "")))
    .join("");

  // The single most safety-critical line in this handler: every group's
  // download otherwise carries group 1's identity verbatim (GROUP_ID, and
  // for Module 4, LORA_SYNC_WORD too), which is not a cosmetic label -- it
  // is what keeps five groups' boards from colliding with each other over
  // the air or on the same BLE UUID / MQTT topic. See group-identity.ts's
  // own header for the concrete failure this fixes.
  const reconstructed = personalize(parsed.berkas, reconstructedGeneric, nomorKelompok);

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(reconstructed);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const session = requireRole(req, res, "praktikan");
  if (!session) return;

  const aksi = req.query.aksi;

  if (aksi === "draft") {
    if (!requireMethod(req, res, "GET")) return;
    return handleDraft(req, res, session);
  }
  if (aksi === "cek") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCek(req, res, session);
  }
  if (aksi === "unduh") {
    if (!requireMethod(req, res, "GET")) return;
    return handleUnduh(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
