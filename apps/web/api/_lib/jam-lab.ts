/**
 * The lab clock (Phase 18): once a minute, with no browser open, IRIS starts
 * each of today's slots at its attendance clock (five minutes before the
 * slot, Friday's slot 3 at 13:00, a PJ's shift moving it) and each Susulan
 * draft at its own start minus five, as if its Asisten pressed Mulai. A
 * slot that cannot start (module closed, Mode TOT, no module known) is
 * written to the audit log once, which the Asisten's banner reads.
 *
 * Two clocks call it: the relay's minute cron (POST /api/tp/detak) and the
 * PC Server's heartbeat. jamLabBilaPerlu lets one of them through per
 * minute, and a start that loses a race meets `sesi_slot_unik` and starts
 * nothing (api/_lib/mulai-sesi.ts).
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { mulaiSesi } from "./mulai-sesi.js";
import { kunciSlot, kunciSusulan, modulHari, tanggalWib } from "./hadir-mengajar.js";
import { siarkan } from "./siaran.js";
import type { getDb } from "../../src/lib/db.js";
import { audit, hadirJam, jadwal, pengaturan, sesi } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import { SESI_CAP_MENIT, SLOT_MULAI } from "../../src/lib/jadwal.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { statusSlotTanggal } from "../../src/lib/penugasan-minggu.js";
import { menitDariJam, menitSekarangWib } from "../../src/lib/sesi-mulai.js";
import { baseSlot, baseSusulan, instanWib } from "../../src/lib/hadir-mengajar.js";
import type { Topik } from "../../src/lib/siaran-topik.js";

type Db = ReturnType<typeof getDb>;

/** The system actor in the audit log and the session's events. */
export const AKTOR_OTOMATIS = "otomatis";
/** pengaturan key holding the last minute the lab clock ran. */
export const KUNCI_JAM_LAB = "jam_lab_terakhir";

/** Inside [base, the start window's close): the window closes SESI_CAP_MENIT after the slot. */
function waktunya(now: Date, tanggal: string, base: number, mulai: string): boolean {
  const t = now.getTime();
  const tutup = menitDariJam(mulai) + SESI_CAP_MENIT;
  return t >= instanWib(tanggal, base).getTime() && t < instanWib(tanggal, tutup).getTime();
}

/**
 * Today's scheduled slots due to start now: active, not a holiday, past
 * their clock (a shift in `geser`, by key, moves it) and still inside the
 * start window, with no session of any status for that slot today, so a
 * slot ended early or cancelled is never started again.
 */
export function slotPerluMulai(x: {
  now: Date;
  tanggal: string;
  slots: { jadwalId: number; slot: number; status: string; libur: boolean }[];
  sesiHariIni: { slot: number | null; status: string }[];
  geser: Map<string, number>;
}): { jadwalId: number; slot: number }[] {
  const ada = new Set(x.sesiHariIni.map((s) => s.slot));
  return x.slots
    .filter((s) => {
      const mulai = SLOT_MULAI[s.slot];
      if (!mulai || s.status !== "aktif" || s.libur || ada.has(s.slot)) return false;
      const base = x.geser.get(kunciSlot(s.jadwalId, x.tanggal)) ?? baseSlot(x.tanggal, s.slot);
      return waktunya(x.now, x.tanggal, base, mulai);
    })
    .map((s) => ({ jadwalId: s.jadwalId, slot: s.slot }));
}

/** Today's Susulan drafts due to start now, by the same clock from their own start. */
export function susulanPerluMulai(x: {
  now: Date;
  tanggal: string;
  draf: { id: number; tanggal: string; mulai: string; status: string; jenis: string }[];
  geser: Map<string, number>;
}): number[] {
  return x.draf
    .filter((d) => {
      if (d.jenis !== "susulan" || d.status !== "terjadwal" || d.tanggal !== x.tanggal)
        return false;
      if (!Number.isFinite(menitDariJam(d.mulai))) return false;
      const base = x.geser.get(kunciSusulan(d.id)) ?? baseSusulan(d.mulai);
      return waktunya(x.now, x.tanggal, base, d.mulai);
    })
    .map((d) => d.id);
}

/** A refusal, written once per slot, date and reason; true when it is new. */
async function catatTolak(
  db: Db,
  t: {
    kunci: string;
    jadwalId: number | null;
    sesiId: number | null;
    tanggal: string;
    kode: string;
  },
): Promise<boolean> {
  const [ada] = await db
    .select({ id: audit.id })
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "sesi_otomatis_tolak"),
        gte(audit.pada, instanWib(t.tanggal, 0)),
        sql`${audit.detail}::jsonb ->> 'kunci' = ${t.kunci}`,
        sql`${audit.detail}::jsonb ->> 'kode' = ${t.kode}`,
      ),
    )
    .limit(1);
  if (ada) return false;
  await writeAudit(AKTOR_OTOMATIS, "sesi_otomatis_tolak", {
    jadwalId: t.jadwalId,
    tanggal: t.tanggal,
    kode: t.kode,
    kunci: t.kunci,
    ...(t.sesiId !== null ? { sesiId: t.sesiId } : {}),
  });
  return true;
}

/**
 * Starts whatever is due now. `mulai` lists the sessions started, `tolak`
 * the slots that could not start (a slot someone else just started is
 * neither). Never starts a TOT session; while Mode TOT is on a slot is
 * refused (`mode_tot`).
 */
export async function mulaiOtomatis(
  db: Db,
  now: Date,
): Promise<{ mulai: number[]; tolak: { jadwalId: number | null; kode: string }[] }> {
  const out: { mulai: number[]; tolak: { jadwalId: number | null; kode: string }[] } = {
    mulai: [],
    tolak: [],
  };
  const tanggal = tanggalWib(now);
  const rows = await db
    .select()
    .from(jadwal)
    .where(
      and(
        eq(jadwal.semester, semesterDariTanggal(tanggal)),
        eq(jadwal.hari, hariDariTanggal(tanggal)),
      ),
    );
  const hariSesi = await db
    .select({
      id: sesi.id,
      tanggal: sesi.tanggal,
      mulai: sesi.mulai,
      slot: sesi.slot,
      status: sesi.status,
      jenis: sesi.jenis,
    })
    .from(sesi)
    .where(eq(sesi.tanggal, tanggal));
  const draf = hariSesi.filter((s) => s.jenis === "susulan" && s.status === "terjadwal");
  const kunci = [
    ...rows.map((r) => kunciSlot(r.id, tanggal)),
    ...draf.map((d) => kunciSusulan(d.id)),
  ];
  const geser = new Map(
    kunci.length
      ? (
          await db
            .select({ kunci: hadirJam.kunci, baseMenit: hadirJam.baseMenit })
            .from(hadirJam)
            .where(inArray(hadirJam.kunci, kunci))
        ).map((g) => [g.kunci, g.baseMenit])
      : [],
  );

  const slots = slotPerluMulai({
    now,
    tanggal,
    slots: rows.map((r) => ({
      jadwalId: r.id,
      slot: r.slot,
      status: r.status,
      libur: statusSlotTanggal(r, tanggal) === "libur",
    })),
    sesiHariIni: hariSesi.filter((s) => s.jenis === "reguler"),
    geser,
  });
  const susulan = susulanPerluMulai({ now, tanggal, draf, geser });
  if (slots.length === 0 && susulan.length === 0) return out;

  const topik = new Set<Topik>();
  const tolak = async (k: string, jadwalId: number | null, sesiId: number | null, kode: string) => {
    out.tolak.push({ jadwalId, kode });
    if (await catatTolak(db, { kunci: k, jadwalId, sesiId, tanggal, kode })) topik.add("hadir");
  };
  const dasar = {
    tanggal,
    kelasDiminta: null,
    durasiMenit: SESI_CAP_MENIT,
    paksa: "",
    otomatis: true,
    now,
  };

  // The date's module, read once and only when a slot is due.
  let modul: number | null | undefined;
  for (const s of slots) {
    const k = kunciSlot(s.jadwalId, tanggal);
    try {
      if (modul === undefined) modul = await modulHari(db, tanggal);
      if (modul === null) {
        await tolak(k, s.jadwalId, null, "modul_tidak_diketahui");
        continue;
      }
      const r = await mulaiSesi(
        db,
        {
          ...dasar,
          jenis: "reguler",
          mulai: SLOT_MULAI[s.slot],
          modul,
          slot: s.slot,
          draftId: null,
          // Every Module 4 session may run the hunt (AsistenHome's start does the same).
          butuhAp: modul === 4,
        },
        AKTOR_OTOMATIS,
      );
      if (r.ok) {
        out.mulai.push(r.created.id);
        topik.add("sesi").add("jadwal").add("hadir");
      } else if (r.kode !== "sudah_ada") await tolak(k, s.jadwalId, null, r.kode);
    } catch (err) {
      console.error("[jam-lab] slot start failed:", s, err);
    }
  }
  for (const id of susulan) {
    const d = draf.find((x) => x.id === id)!;
    const k = kunciSusulan(id);
    try {
      const [row] = await db
        .select({ modul: sesi.modul })
        .from(sesi)
        .where(eq(sesi.id, id))
        .limit(1);
      if (!row) continue;
      const r = await mulaiSesi(
        db,
        {
          ...dasar,
          jenis: "susulan",
          mulai: d.mulai,
          modul: row.modul,
          slot: null,
          draftId: id,
          butuhAp: row.modul === 4,
        },
        AKTOR_OTOMATIS,
      );
      if (r.ok) {
        out.mulai.push(r.created.id);
        topik.add("sesi").add("jadwal").add("hadir");
      } else if (r.kode !== "sudah_ada" && r.kode !== "draf_tidak_ada")
        await tolak(k, null, id, r.kode);
    } catch (err) {
      console.error("[jam-lab] susulan start failed:", id, err);
    }
  }
  // Pages hear it as if the route had answered (the route's own topics).
  if (topik.size) await siarkan([...topik]);
  return out;
}

/** Everything the lab clock does in one minute. Never throws. */
export async function jamLab(db: Db, now: Date): Promise<void> {
  try {
    const r = await mulaiOtomatis(db, now);
    if (r.mulai.length || r.tolak.length) console.warn("[INFO] jam-lab:", JSON.stringify(r));
  } catch (err) {
    console.error("[jam-lab] auto-start failed:", err);
  }
}

/**
 * Runs the lab clock unless it already ran this minute: the minute is
 * claimed in one statement (the row only changes when it holds another
 * minute), so the relay and the heartbeat in the same minute run it once.
 */
export async function jamLabBilaPerlu(db: Db, now: Date = new Date()): Promise<boolean> {
  try {
    const menit = now.toISOString().slice(0, 16);
    const [r] = await db
      .insert(pengaturan)
      .values({ kunci: KUNCI_JAM_LAB, nilai: menit, diubahPada: now })
      .onConflictDoUpdate({
        target: pengaturan.kunci,
        set: { nilai: menit, diubahPada: now },
        setWhere: sql`"pengaturan"."nilai" IS DISTINCT FROM excluded."nilai"`,
      })
      .returning({ kunci: pengaturan.kunci });
    if (!r) return false;
  } catch (err) {
    console.error("[jam-lab] minute claim failed:", err);
    return false;
  }
  await jamLab(db, now);
  return true;
}

/** WIB minutes the relay's timer keeps a minute beat: 05:50 to 00:15. */
const BANGUN = 5 * 60 + 50;
const TIDUR = 15;

/**
 * The relay's sleep (from tidurDetik) cut for the lab clock: at most a
 * minute through the practicum day and just past midnight, and in the
 * quiet hours never past 05:50.
 */
export function batasTidurJamLab(detik: number, now: Date = new Date()): number {
  const m = menitSekarangWib(now);
  if (m >= BANGUN || m < TIDUR) return Math.min(detik, 60);
  const sampai = Math.floor((instanWib(tanggalWib(now), BANGUN).getTime() - now.getTime()) / 1000);
  return Math.max(60, Math.min(detik, sampai));
}
