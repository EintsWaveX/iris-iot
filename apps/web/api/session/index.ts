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
 *
 * Phase 9 rules (src/lib/sesi-mulai.ts holds the shared ones):
 * - A scheduled slot starts only today, inside its start window: from the
 *   slot's own jadwal.jendela_mulai_menit (else the general default in
 *   pengaturan) before the slot, until 150 minutes after it. Anyone on the
 *   slot (its assistants or substitutes) may start it; the full "pair"
 *   right (Pengelola, Admin) starts any slot.
 * - A susulan has no window and needs the full "pair" right.
 * - A closed module can't be started; modules are opened in Preparation.
 *   (Before Phase 9 a start opened its module and the ones below; that
 *   undid an Asisten who had closed one on purpose.)
 * - The session runs for durasiMenit (30 to 150, default 150) with
 *   jumlahKelompok groups (1 to 10; default the slot's own count).
 * - The slot's roster (or the draft's) becomes the live roster inside the
 *   start transaction and is snapshotted (api/_lib/roster.ts).
 *
 * The class type and the one-assistant-per-group prefill still come from
 * the schedule (api/_lib/phase8.ts's siapkanSesiDariJadwal). Starting a
 * session ends whichever one was running, stamping its real end time.
 * `butuhAp` (Module 4 only) queues the hotspot on, and a replaced session
 * that had it queues it off.
 */
import { diSlotMinggu, muatMinggu } from "../_lib/penugasan-api.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { muatOrang } from "../_lib/hak.js";
import { salinRosterKeSesi, type SumberRoster } from "../_lib/roster.js";
import { getDb } from "../../src/lib/db.js";
import { pengaturan, sesi } from "../../src/lib/schema.js";
import { hariIniWib, slotToMulai, SESI_CAP_DETIK } from "../../src/lib/jadwal.js";
import { semesterDariTanggal, hariDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  bacaDurasi,
  bacaJumlahKelompok,
  jendelaSlot,
  jendelaValid,
  menitSekarangWib,
} from "../../src/lib/sesi-mulai.js";
import { bolehPenuh } from "../../src/lib/hak.js";
import { queueSoloServerCommand } from "../../src/lib/server-lib.js";
import { and, eq, ne, sql } from "drizzle-orm";
import { writeAudit } from "../../src/lib/auth.js";
import { getModulTerbuka } from "../../src/lib/akses.js";
import { isKelas } from "../../src/lib/kelas.js";
import { jadwalUntuk, siapkanSesiDariJadwal } from "../_lib/phase8.js";

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

async function jendelaDefault(db: ReturnType<typeof getDb>): Promise<number> {
  const [row] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "jendela_mulai_default"))
    .limit(1);
  return jendelaValid(row?.nilai);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  const body = jsonBody(req);
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

  const tanggal = draft?.tanggal ?? (typeof body.tanggal === "string" ? body.tanggal : "");
  const modul = body.modul != null ? Number(body.modul) : (draft?.modul ?? NaN);
  const slot = susulan ? null : body.slot == null ? null : Number(body.slot);
  const mulai = susulan
    ? (draft?.mulai ?? (typeof body.mulai === "string" ? body.mulai : ""))
    : slot !== null
      ? (slotToMulai(slot) ?? "")
      : "";

  if (
    !TANGGAL_RE.test(tanggal) ||
    !JAM_RE.test(mulai) ||
    ![1, 2, 3, 4].includes(modul) ||
    (!susulan && (slot === null || ![1, 2, 3, 4].includes(slot))) ||
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

    const slotRow = await jadwalUntuk(db, tanggal, slot);
    if (susulan) {
      if (!penuh) return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "pair" });
    } else {
      // Anyone teaching the slot that date (its pairing, a cover or a
      // volunteer, or a listed substitute) may start it; the full "pair"
      // right starts any. A holiday or No Practicum slot doesn't start.
      const minggu = slotRow
        ? (await muatMinggu(db, [slotRow], tanggal)).get(slotRow.id)
        : undefined;
      if (minggu?.status === "libur") return tolak(res, "slot_libur");
      if (minggu?.status === "kosong") return tolak(res, "slot_kosong");
      const diSlot = !!slotRow && diSlotMinggu(slotRow, minggu, orang.kode);
      if (!penuh && !diSlot) {
        return res.status(403).json({ ok: false, kode: "bukan_slotmu", hak: "pair" });
      }
      // The start window, on the lab's clock.
      const jendela = slotRow?.jendelaMulaiMenit ?? (await jendelaDefault(db));
      const hariIni = hariIniWib();
      const j = jendelaSlot(mulai, jendela, menitSekarangWib());
      const posisi = tanggal === hariIni ? j.posisi : tanggal < hariIni ? "lewat" : "belum";
      if (posisi !== "buka") {
        return tolak(res, "di_luar_jendela", { jendela: { ...j, posisi, menit: jendela } });
      }
    }

    if (!(await getModulTerbuka()).includes(modul)) return tolak(res, "modul_tertutup");

    const jumlahKelompok = bacaJumlahKelompok(
      body.jumlahKelompok,
      draft?.jumlahKelompok ?? slotRow?.jumlahKelompok ?? undefined,
    );
    if (jumlahKelompok === null) return tolak(res, "format_salah");

    const { created, demoted, disalin } = await db.transaction(async (tx) => {
      const demotedRows = await tx
        .update(sesi)
        .set({
          status: "selesai",
          selesaiPada: sql`now()`,
          durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
        })
        .where(eq(sesi.status, "berjalan"))
        .returning({ butuhAp: sesi.butuhAp });
      const nilai = {
        modul,
        butuhAp,
        status: "berjalan" as const,
        mulaiPada: new Date(),
        durasiMenit,
        jumlahKelompok,
        jenis: susulan ? ("susulan" as const) : ("reguler" as const),
      };
      const [row] = draft
        ? await tx.update(sesi).set(nilai).where(eq(sesi.id, draft.id)).returning()
        : await tx
            .insert(sesi)
            .values({ ...nilai, tanggal, mulai, slot })
            .returning();
      const sumber: SumberRoster =
        !susulan && slot !== null
          ? {
              jenis: "slot",
              semester: semesterDariTanggal(tanggal),
              hari: hariDariTanggal(tanggal),
              slot,
            }
          : { jenis: "susulan", sesiId: row.id };
      const salin = await salinRosterKeSesi(tx, row.id, sumber, jumlahKelompok);
      return { created: row, demoted: demotedRows[0], disalin: salin.disalin };
    });

    // Phase 8: class type and one-assistant-per-group prefill from the
    // schedule. Best effort -- a failure here must never undo a session
    // that already started, so it is caught and logged on its own.
    let persiapan: { kelas: string; ditugaskan: number } = { kelas: "reguler", ditugaskan: 0 };
    try {
      persiapan = await siapkanSesiDariJadwal(
        db,
        created,
        isKelas(kelasDiminta) ? kelasDiminta : null,
      );
    } catch (err) {
      console.error("[api/session] schedule prefill failed:", err);
    }

    await writeAudit(session.nim, "sesi_mulai", {
      tanggal,
      mulai,
      modul,
      slot,
      butuhAp,
      jenis: created.jenis,
      durasiMenit,
      jumlahKelompok,
      disalin,
      ...persiapan,
    });

    // Best-effort: a session that needs the hotspot should not also need an
    // assistant to separately visit /servers and click "AP nyala" by hand.
    // Never blocks session creation -- see queueSoloServerCommand's own doc
    // for why this silently no-ops rather than guessing when it can't be
    // sure which Pi to command. Reported back so the console can say so
    // when it could not be queued.
    let apDiantre: boolean | null = null;
    if (butuhAp) {
      apDiantre = await queueSoloServerCommand("ap.nyala", session.nim);
    } else if (demoted?.butuhAp) {
      // The session this one just replaced had the hotspot on -- turn it
      // back off rather than leaving the Pi stuck off campus Wi-Fi for the
      // rest of the day.
      await queueSoloServerCommand("ap.mati", session.nim);
    }

    res.status(200).json({
      ok: true,
      sesi: { ...created, kelas: persiapan.kelas },
      ditugaskan: persiapan.ditugaskan,
      disalin,
      apDiantre,
    });
  } catch (err) {
    // Postgres unique_violation on (tanggal, modul, mulai) -- the same
    // slot was already scheduled today.
    if (pgErrorCode(err) === "23505") {
      // Say which session holds the slot, so the console can offer the
      // right way out: show it if it is already running, or offer to
      // reopen it if it was ended early and is still inside its cap.
      const [lama] = await getDb()
        .select({
          id: sesi.id,
          status: sesi.status,
          mulaiPada: sesi.mulaiPada,
          dibuatPada: sesi.dibuatPada,
        })
        .from(sesi)
        .where(
          and(
            eq(sesi.tanggal, tanggal),
            eq(sesi.modul, modul),
            eq(sesi.mulai, mulai),
            ne(sesi.status, "batal"),
          ),
        )
        .limit(1);
      const mulaiLama = lama ? (lama.mulaiPada ?? lama.dibuatPada).getTime() : 0;
      res.status(200).json({
        ok: false,
        kode: "sudah_ada",
        sesiLama: lama
          ? {
              id: lama.id,
              status: lama.status,
              bisaDilanjutkan:
                lama.status === "selesai" && Date.now() - mulaiLama < SESI_CAP_DETIK * 1000,
            }
          : null,
      });
      return;
    }
    console.error("[api/session] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}
