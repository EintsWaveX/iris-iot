/**
 * POST /api/session -- assistant-only: start a session.
 *
 * Body:
 *   { tanggal, modul, slot, kelas?, durasiMenit?, jumlahKelompok?, butuhAp? }
 *     a scheduled slot (jenis reguler, the default)
 *   { jenis: "susulan", tanggal, mulai, modul, kelas?, durasiMenit?, jumlahKelompok?, butuhAp? }
 *   { jenis: "susulan", sesiId, ... }
 *     a Praktikum Susulan: its own date and time, or a draft made in
 *     Preparation or by "Siapkan Sesi Berikutnya" (status terjadwal)
 *   { jenis: "tot", modul, kelas?, durasiMenit?, butuhAp? }
 *   Any of these may add `paksa: "<reason>"` to start past the lab check.
 *     a TOT session (2026-10-05): today, now, the six division groups of
 *     dummy Praktikan Mode TOT put in the live roster (src/lib/tot.ts)
 *
 * Phase 9 rules (src/lib/sesi-mulai.ts holds the shared ones):
 * - A scheduled slot starts only today, inside its start window: from the
 *   slot's own jadwal.jendela_mulai_menit (else the general default in
 *   pengaturan) before the slot, until 150 minutes after it. Anyone on the
 *   slot (its assistants or substitutes) may start it; the full "pair"
 *   right (Pengelola, Admin) starts any slot.
 * - A susulan has no window and needs the full "pair" right.
 * - Mode TOT: while it is on only a TOT session starts, and a TOT session
 *   starts only while it is on (same "pair" right as a susulan). It may use
 *   a closed module, and copies no roster: the live one already holds the
 *   dummies, so it is only snapshotted.
 * - The lab check (src/lib/siap-mulai.ts): the Pi online, the module's
 *   service running and, for Module 4, the hotspot on or queued. Any of
 *   those failing answers `belum_siap` with the checks, and `paksa` (a
 *   reason, 5+ characters) starts anyway; the reason goes to the audit
 *   log and the session's events.
 * - A closed module can't be started; modules are opened in Preparation.
 *   (Before Phase 9 a start opened its module and the ones below; that
 *   undid an Asisten who had closed one on purpose.)
 * - The session runs for durasiMenit (30 to 150, default 150, and never
 *   past the next slot's automatic start that day) with jumlahKelompok
 *   groups (1 to 10; default the slot's own count).
 * - The slot's roster (or the draft's) becomes the live roster inside the
 *   start transaction and is snapshotted (api/_lib/roster.ts).
 * - Phase 18: starting a slot you teach checks you in for it.
 *
 * The class type and the one-assistant-per-group prefill still come from
 * the schedule (api/_lib/phase8.ts's siapkanSesiDariJadwal). Starting a
 * session ends whichever one was running, stamping its real end time.
 * `butuhAp` (Module 4 only) marks a session that runs the hunt; since
 * 2026-10-08 the hotspot itself waits for the Asisten's Mulai Perburuan
 * (api/_lib/perburuan-sesi.ts), and a replaced Module 4 session closes its
 * hunt so the hotspot goes off. The start itself is api/_lib/mulai-sesi.ts,
 * shared with the lab clock's automatic start.
 */
import { diSlotMinggu } from "../_lib/penugasan-api.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { muatOrang } from "../_lib/hak.js";
import { getDb } from "../../src/lib/db.js";
import { sesi } from "../../src/lib/schema.js";
import { hariIniWib, slotToMulai } from "../../src/lib/jadwal.js";
import { bacaDurasi, menitSekarangWib } from "../../src/lib/sesi-mulai.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../src/lib/auth.js";
import { isKelas } from "../../src/lib/kelas.js";
import { denganSiaran } from "../_lib/siaran.js";
import { mulaiSesi } from "../_lib/mulai-sesi.js";
import { masuk } from "../_lib/hadir-mengajar.js";

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
  const tot = body.jenis === "tot";
  const susulan = body.jenis === "susulan";
  const draftId = susulan && body.sesiId != null ? Number(body.sesiId) : null;
  const butuhAp = Boolean(body.butuhAp);
  const kelasDiminta = body.kelas === undefined || body.kelas === null ? null : body.kelas;
  const durasiMenit = bacaDurasi(body.durasiMenit);
  const db = getDb();

  // A susulan draft brings its own date, time and module.
  let draft: typeof sesi.$inferSelect | null = null;
  if (draftId !== null) {
    if (!Number.isInteger(draftId) || draftId <= 0) return tolak(res, "format_salah");
    [draft] = await db.select().from(sesi).where(eq(sesi.id, draftId)).limit(1);
    if (!draft || draft.status !== "terjadwal" || draft.jenis !== "susulan") {
      return tolak(res, "draf_tidak_ada");
    }
  }

  const menitKini = menitSekarangWib();
  const tanggal = tot
    ? hariIniWib()
    : (draft?.tanggal ?? (typeof body.tanggal === "string" ? body.tanggal : ""));
  const modul = body.modul != null ? Number(body.modul) : (draft?.modul ?? NaN);
  const slot = susulan || tot ? null : body.slot == null ? null : Number(body.slot);
  const mulai = tot
    ? `${String(Math.floor(menitKini / 60)).padStart(2, "0")}:${String(menitKini % 60).padStart(2, "0")}`
    : susulan
      ? (draft?.mulai ?? (typeof body.mulai === "string" ? body.mulai : ""))
      : slot !== null
        ? (slotToMulai(slot) ?? "")
        : "";

  if (
    !TANGGAL_RE.test(tanggal) ||
    !JAM_RE.test(mulai) ||
    ![1, 2, 3, 4].includes(modul) ||
    (!susulan && !tot && (slot === null || ![1, 2, 3, 4].includes(slot))) ||
    (butuhAp && modul !== 4) ||
    (kelasDiminta !== null && !isKelas(kelasDiminta)) ||
    durasiMenit === null
  ) {
    return tolak(res, "format_salah");
  }

  try {
    const orang = await muatOrang(session.nim);
    if (!orang) return tolak(res, "tanpa_hak");
    const penuh = bolehPenuh(orang, "pair");
    if ((susulan || tot) && !penuh) {
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "pair" });
    }

    const r = await mulaiSesi(
      db,
      {
        jenis: tot ? "tot" : susulan ? "susulan" : "reguler",
        tanggal,
        mulai,
        modul,
        slot,
        draftId: draft?.id ?? null,
        kelasDiminta,
        durasiMenit,
        jumlahKelompok: body.jumlahKelompok,
        butuhAp,
        paksa: typeof body.paksa === "string" ? body.paksa.trim().slice(0, 300) : "",
      },
      session.nim,
      // Anyone teaching the slot that date (its pairing, a cover or a
      // volunteer, or a listed substitute) may start it; the full "pair"
      // right starts any.
      (slotRow, minggu) => penuh || (!!slotRow && diSlotMinggu(slotRow, minggu, orang.kode)),
    );
    if (!r.ok) {
      const status = r.kode === "bukan_slotmu" ? 403 : 200;
      return res.status(status).json({ ok: false, kode: r.kode, ...(r.extra ?? {}) });
    }

    // Phase 18: starting the slot you teach is arriving for it. Best
    // effort: the session already started.
    const h = r.hadir;
    if (h && h.diharapkan.has(session.nim) && !h.izin.has(session.nim)) {
      try {
        const m = await masuk(db, session.nim, h.kunci);
        if (m.ok) {
          await writeAudit(session.nim, "hadir_masuk", {
            kunci: h.kunci,
            hadirPada: m.hadirPada,
            via: "mulai",
          });
        }
      } catch (err) {
        console.error("[api/session] check-in on start failed:", err);
      }
    }

    res.status(200).json({
      ok: true,
      sesi: { ...r.created, kelas: r.persiapan.kelas },
      ditugaskan: r.persiapan.ditugaskan,
      disalin: r.disalin,
    });
  } catch (err) {
    console.error("[api/session] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("session", handler);
