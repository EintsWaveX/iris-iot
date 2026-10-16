/**
 * Starting a session, the part that needs no person: POST /api/session
 * (api/session/index.ts) checks who may start it and calls this, and the
 * lab clock (api/_lib/jam-lab.ts) calls it to start a slot at its own time.
 * The rules are the ones that file's header lists; an automatic start
 * (`otomatis`) goes past a soft lab check by itself and logs which checks
 * failed, while a hard refusal stays a refusal.
 *
 * A session never runs past the next slot's automatic start that day
 * (akhirSesiMaks), whatever length was asked for.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { muatMinggu } from "./penugasan-api.js";
import { pgErrorCode } from "./http.js";
import { salinRosterKeSesi, type SumberRoster } from "./roster.js";
import { tutupPerburuan } from "./perburuan-sesi.js";
import { cekSiapMulai } from "./siap-mulai.js";
import { jadwalUntuk, siapkanSesiDariJadwal } from "./phase8.js";
import { catatKejadian } from "./berjalan.js";
import { isiTpSesi } from "./tp.js";
import {
  kunciSlot,
  kunciSusulan,
  muatKonteks,
  pastikanBaris,
  tanggalWib,
} from "./hadir-mengajar.js";
import type { getDb } from "../../src/lib/db.js";
import { jadwal, pengaturan, sesi } from "../../src/lib/schema.js";
import { bacaModeTot } from "../../src/lib/mode-tot.js";
import { SESI_CAP_DETIK } from "../../src/lib/jadwal.js";
import { semesterDariTanggal, hariDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  bacaJumlahKelompok,
  jendelaSlot,
  jendelaValid,
  menitSekarangWib,
} from "../../src/lib/sesi-mulai.js";
import { writeAudit } from "../../src/lib/auth.js";
import { ALASAN_PAKSA_MIN, gagalMulai } from "../../src/lib/siap-mulai.js";
import { isKelas } from "../../src/lib/kelas.js";
import { akhirSesiMaks } from "../../src/lib/hadir-mengajar.js";
import type { MingguSlot } from "../../src/lib/penugasan-minggu.js";

type Db = ReturnType<typeof getDb>;
type JadwalRow = typeof jadwal.$inferSelect;
type SesiRow = typeof sesi.$inferSelect;

/** The automatic start's reason in the audit log and the session's events. */
export const ALASAN_OTOMATIS = "Dimulai otomatis";

export interface MulaiInput {
  jenis: "reguler" | "susulan" | "tot";
  tanggal: string;
  mulai: string;
  modul: number;
  slot: number | null;
  /** A susulan draft (status terjadwal) to start instead of a new row. */
  draftId: number | null;
  /** The class type asked for, or null for the schedule's. */
  kelasDiminta: unknown;
  /** Asked length; the next slot's automatic start may cut it shorter. */
  durasiMenit: number;
  /** The group count as sent, checked here (absent: the slot's or draft's own). */
  jumlahKelompok?: unknown;
  butuhAp: boolean;
  paksa: string;
  otomatis?: boolean;
  /** The lab clock's now; a request uses the real one. */
  now?: Date;
}

export type MulaiHasil =
  | {
      ok: true;
      created: SesiRow;
      demoted: { id: number; modul: number } | undefined;
      disalin: number;
      persiapan: { kelas: string; ditugaskan: number };
      /** The slot's attendance key and who it expects, for checking the starter in. */
      hadir: { kunci: string; diharapkan: Set<string>; izin: Set<string> } | null;
    }
  | { ok: false; kode: string; extra?: Record<string, unknown> };

/** May the person asking start this scheduled slot? Asked once the slot's
 *  week is known, before the start window, as the route always did. */
export type BolehSlot = (slotRow: JadwalRow | null, minggu: MingguSlot | undefined) => boolean;

async function jendelaDefault(db: Db): Promise<number> {
  const [row] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "jendela_mulai_default"))
    .limit(1);
  return jendelaValid(row?.nilai);
}

/**
 * Starts one session. `aktor` is the NIM in the audit log and the events
 * ("otomatis" for the lab clock). A refusal names its `kode`; `bukan_slotmu`
 * comes only from `bolehSlot`. Errors other than the slot already taken
 * (`sudah_ada`) are thrown.
 */
export async function mulaiSesi(
  db: Db,
  m: MulaiInput,
  aktor: string,
  bolehSlot?: BolehSlot,
): Promise<MulaiHasil> {
  const { tanggal, mulai, modul, slot, butuhAp, kelasDiminta } = m;
  const tot = m.jenis === "tot";
  const susulan = m.jenis === "susulan";
  const now = m.now ?? new Date();
  try {
    let draft: SesiRow | null = null;
    if (m.draftId !== null) {
      [draft] = await db.select().from(sesi).where(eq(sesi.id, m.draftId)).limit(1);
      if (!draft || draft.status !== "terjadwal" || draft.jenis !== "susulan") {
        return { ok: false, kode: "draf_tidak_ada" };
      }
    }

    const slotRow = await jadwalUntuk(db, tanggal, slot);
    if (!susulan && !tot) {
      // A holiday or No Practicum slot doesn't start.
      const minggu = slotRow
        ? (await muatMinggu(db, [slotRow], tanggal)).get(slotRow.id)
        : undefined;
      if (minggu?.status === "libur") return { ok: false, kode: "slot_libur" };
      if (minggu?.status === "kosong") return { ok: false, kode: "slot_kosong" };
      if (bolehSlot && !bolehSlot(slotRow, minggu)) {
        return { ok: false, kode: "bukan_slotmu", extra: { hak: "pair" } };
      }
      // The start window, on the lab's clock.
      const jendela = slotRow?.jendelaMulaiMenit ?? (await jendelaDefault(db));
      const hariIni = tanggalWib(now);
      const j = jendelaSlot(mulai, jendela, menitSekarangWib(now));
      const posisi = tanggal === hariIni ? j.posisi : tanggal < hariIni ? "lewat" : "belum";
      if (posisi !== "buka") {
        return {
          ok: false,
          kode: "di_luar_jendela",
          extra: { jendela: { ...j, posisi, menit: jendela } },
        };
      }
    }

    // The lab check (src/lib/siap-mulai.ts). Mode TOT's side and a closed
    // module refuse outright; an offline server, a stopped service or the
    // Module 4 hotspot left off can be forced past with a reason, and the
    // lab clock forces past them by itself.
    const { cek, serverId } = await cekSiapMulai({ modul, tot, butuhAp });
    const { keras, lunak } = gagalMulai(cek);
    if (keras.length) {
      const k = keras[0].id === "tot" ? (tot ? "tot_mati" : "mode_tot") : "modul_tertutup";
      return { ok: false, kode: k, extra: { cek, serverId } };
    }
    const paksa = m.otomatis ? ALASAN_OTOMATIS : m.paksa;
    if (lunak.length && paksa.length < ALASAN_PAKSA_MIN) {
      return { ok: false, kode: "belum_siap", extra: { cek, serverId } };
    }
    const dipaksa = lunak.length ? { alasan: paksa, gagal: lunak.map((c) => c.id) } : null;

    // A TOT session has one group per division taking part (the /tot page).
    const jumlahKelompok = tot
      ? (await bacaModeTot()).atur.divisi.length
      : bacaJumlahKelompok(
          m.jumlahKelompok,
          draft?.jumlahKelompok ?? slotRow?.jumlahKelompok ?? undefined,
        );
    if (jumlahKelompok === null) return { ok: false, kode: "format_salah" };

    // Never past the next slot's automatic start (Friday's slot 3 is the
    // one where that bites).
    const mulaiPada = now;
    const durasiMenit = Math.min(m.durasiMenit, akhirSesiMaks(tanggal, slot, mulaiPada));

    const { created, demoted, disalin } = await db.transaction(async (tx) => {
      const demotedRows = await tx
        .update(sesi)
        .set({
          status: "selesai",
          selesaiPada: sql`now()`,
          durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
        })
        .where(eq(sesi.status, "berjalan"))
        .returning({ id: sesi.id, modul: sesi.modul });
      const nilai = {
        modul,
        butuhAp,
        status: "berjalan" as const,
        mulaiPada,
        durasiMenit,
        jumlahKelompok,
        jenis: tot ? ("tot" as const) : susulan ? ("susulan" as const) : ("reguler" as const),
      };
      const [row] = draft
        ? await tx.update(sesi).set(nilai).where(eq(sesi.id, draft.id)).returning()
        : await tx
            .insert(sesi)
            .values({ ...nilai, tanggal, mulai, slot })
            .returning();
      // A TOT session (like a susulan with no roster of its own) copies
      // nothing: the live roster is kept as it is and snapshotted.
      const sumber: SumberRoster =
        !susulan && !tot && slot !== null
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

    // Phase 13: TP totals graded before the session go into its table.
    await isiTpSesi(db, created.id);

    const otomatis = m.otomatis ? { otomatis: true } : {};
    await catatKejadian(
      created.id,
      "mulai",
      { modul, slot, jenis: created.jenis, ...otomatis, ...(dipaksa ? { dipaksa } : {}) },
      aktor,
    );
    await writeAudit(aktor, "sesi_mulai", {
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
      ...otomatis,
      ...(dipaksa ? { dipaksa } : {}),
    });

    // 2026-10-08: starting a session never touches the network; the hotspot
    // comes with the Asisten's Mulai Perburuan. A Module 4 session this one
    // replaced closes its hunt so its hotspot doesn't outlive it.
    if (demoted) await tutupPerburuan(demoted.id, demoted.modul, aktor);

    // Phase 18: the slot's teaching rows know their session (a TOT session
    // is never judged). Best effort, like the prefill.
    let hadir: { kunci: string; diharapkan: Set<string>; izin: Set<string> } | null = null;
    try {
      const kunci = tot
        ? null
        : susulan
          ? kunciSusulan(created.id)
          : slotRow
            ? kunciSlot(slotRow.id, tanggal)
            : null;
      const c = kunci ? await muatKonteks(db, kunci) : null;
      if (kunci && c) {
        await pastikanBaris(
          db,
          kunci,
          { tanggal, jadwalId: slotRow?.id ?? null, sesiId: created.id },
          [...c.diharapkan],
        );
        hadir = { kunci, diharapkan: c.diharapkan, izin: c.izin };
      }
    } catch (err) {
      console.error("[api/session] attendance rows failed:", err);
    }

    return { ok: true, created, demoted, disalin, persiapan, hadir };
  } catch (err) {
    // Postgres unique_violation on (tanggal, modul, mulai) -- the same
    // slot was already scheduled today.
    if (pgErrorCode(err) !== "23505") throw err;
    // Say which session holds the slot, so the console can offer the
    // right way out: show it if it is already running, or offer to
    // reopen it if it was ended early and is still inside its cap.
    const [lama] = await db
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
    return {
      ok: false,
      kode: "sudah_ada",
      extra: {
        sesiLama: lama
          ? {
              id: lama.id,
              status: lama.status,
              bisaDilanjutkan:
                lama.status === "selesai" && Date.now() - mulaiLama < SESI_CAP_DETIK * 1000,
            }
          : null,
      },
    };
  }
}
