/**
 * Phase 14: the SeeLabs robot's queue, behind /api/session/robot and the
 * Pi's heartbeat (api/agent). The rules live in src/lib/seelabs-robot.ts.
 *
 * GET  ?kunci=1      the approved Pi key the browser seals a password to
 * GET  (none)        my connection, plus my latest jobs
 * GET  ?sesiId=      the robot's state for each group of a session
 * GET  ?baca=        the read-back's state for each group of a session (2026-10-17)
 * GET  ?sumber=1     Sumber SeeLabs (Pencipta, Admin): switch, keys, accounts, log
 * POST { aksi: "hubung", segel, sidik, bawaan }   connect my account (then an uji)
 * POST { aksi: "putus" }                           forget my seal and my waiting jobs
 * POST { aksi: "uji" }                             sign in again to check
 * POST { aksi: "ulang", tugasId }                  run a failed job again
 * POST { aksi: "token", tugasId, token }           a Token Khusus for a butuh_token job
 * POST { aksi: "kelompok" }                        pull the KLP list with my account
 * POST { aksi: "jaga" }                            register my missing Input Jaga slots
 * POST { aksi: "periksa", semua? }                 Periksa Sekarang: read SeeLabs back now
 * POST { aksi: "kirim_ulang", sesiId, kelompok }   Kirim Ulang ke SeeLabs (the scorer, Admin)
 * POST { aksi: "robot", nyala }                    the kill switch       (Pencipta, Admin)
 * POST { aksi: "kunci", setujui: sidik }           approve the Pi's key  (Pencipta, Admin)
 * POST { aksi: "alamat", alamat }                  kampus or athena      (Pencipta, Admin)
 * POST { aksi: "sufiks", sufiks }                  the Laboran default's suffix (Pencipta, Admin)
 *
 * The seal arrives RSA-OAEP-3072 to the Pi's key and is kept wrapped again
 * with AES-256-GCM (rahasia.ts); it is unwrapped only into the Pi's job.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { buka, bungkus } from "./rahasia.js";
import { muatSeelabs, sesiTot } from "./seelabs.js";
import { sidikPayload } from "../../src/lib/seelabs.js";
import { tulisSet } from "./tp.js";
import { siarkan } from "./siaran.js";
import {
  akunAktif,
  akunUntukPeriksa,
  antreBaca,
  bacaanSesi,
  bacaBukti,
  bacaSesi,
  bacaku,
  terimaBaca,
} from "./seelabs-baca.js";
import { dasarDariBaris } from "../../src/lib/seelabs-baca.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  jadwal,
  pengaturan,
  penugasanSlot,
  seelabsAkses,
  seelabsEkspor,
  seelabsTugas,
  server,
} from "../../src/lib/schema.js";
import { boleh, bolehPenuh } from "../../src/lib/hak.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  ALAMAT_SEELABS,
  BATAS_DIAMBIL_DETIK,
  GALAT_ROBOT,
  KUNCI_ROBOT,
  PRAKTIKUM_SEELABS,
  PROTOKOL_ROBOT,
  barisPerKlp,
  jenisDiambil,
  bacaInfoSeelabs,
  ringkasBukti,
  setelahGagal,
  sidikJaga,
  slotJaga,
  statusAksesSetelah,
  sufiksSah,
  type AlamatSeelabs,
  type BarisRobot,
  type JenisTugas,
  type KelompokTarik,
  type KunciRobot,
  type StatusAkses,
} from "../../src/lib/seelabs-robot.js";

type Db = ReturnType<typeof getDb>;

/** What follows the NIM in the Laboran's default SeeLabs password, unless
 *  changed. Server only: no browser bundle may carry it (2026-10-15, the
 *  site goes in front of every student through the LMS). */
export const SUFIKS_BAWAAN = "1715";

const LABEL_SEGEL = "seelabs-segel";
const KLAIM_PER_DENYUT = 5;

/* ------------------------------------------------------------ settings */

async function bacaKunci<T>(db: Db, kunci: string): Promise<T | null> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, kunci))
    .limit(1);
  return (r?.nilai as T | undefined) ?? null;
}

export async function aturanRobot(db: Db) {
  const [robot, kunci, alamat, sufiks] = await Promise.all([
    bacaKunci<{ nyala?: boolean }>(db, KUNCI_ROBOT.robot),
    bacaKunci<KunciRobot>(db, KUNCI_ROBOT.kunci),
    bacaKunci<AlamatSeelabs>(db, KUNCI_ROBOT.alamat),
    bacaKunci<{ sufiks?: string }>(db, KUNCI_ROBOT.sufiks),
  ]);
  return {
    // On unless switched off; nothing runs anyway before a key is approved.
    nyala: robot?.nyala !== false,
    kunci,
    alamat: alamat && ALAMAT_SEELABS.includes(alamat) ? alamat : ("kampus" as AlamatSeelabs),
    sufiks: sufiksSah(sufiks?.sufiks) ? sufiks.sufiks : SUFIKS_BAWAAN,
  };
}

/* --------------------------------------------------------------- queue */

interface Antre {
  jenis: JenisTugas;
  akunNim: string;
  oleh: string;
  isi?: Record<string, unknown>;
  sesiId?: number | null;
  kelompokNomor?: number | null;
  klp?: string | null;
  sidik?: string | null;
  tundaDetik?: number;
}

/** Queues one job, replacing the same thing still waiting. */
export async function antre(db: Db, a: Antre): Promise<number> {
  await db
    .update(seelabsTugas)
    .set({ status: "batal", selesai: new Date() })
    .where(
      and(
        eq(seelabsTugas.status, "antre"),
        eq(seelabsTugas.jenis, a.jenis),
        eq(seelabsTugas.akunNim, a.akunNim),
        sql`coalesce(${seelabsTugas.sesiId}, 0) = ${a.sesiId ?? 0}`,
        sql`coalesce(${seelabsTugas.kelompokNomor}, 0) = ${a.kelompokNomor ?? 0}`,
        sql`coalesce(${seelabsTugas.klp}, '') = ${a.klp ?? ""}`,
      ),
    );
  const [row] = await db
    .insert(seelabsTugas)
    .values({
      jenis: a.jenis,
      akunNim: a.akunNim,
      oleh: a.oleh,
      isi: a.isi ?? {},
      sesiId: a.sesiId ?? null,
      kelompokNomor: a.kelompokNomor ?? null,
      klp: a.klp ?? null,
      sidik: a.sidik ?? null,
      jalanPada: new Date(Date.now() + (a.tundaDetik ?? 0) * 1000),
    })
    .returning({ id: seelabsTugas.id });
  return row.id;
}

export async function aksesDari(db: Db, nim: string) {
  const [r] = await db.select().from(seelabsAkses).where(eq(seelabsAkses.nim, nim)).limit(1);
  return r ?? null;
}

export type HasilAntreNilai =
  | { antre: true; tugas: number[] }
  | {
      antre: false;
      alasan:
        | "robot_mati"
        | "sesi_tot"
        | "tanpa_akun"
        | "akun_belum_terhubung"
        | "klp_tidak_dikenal"
        | "sudah_tersimpan"
        | "tidak_ada";
    };

/**
 * After Kirim Nilai (tundaDetik 0) or a score edit after it (JEDA_SUNTING_DETIK):
 * one nilai job per SeeLabs KLP of the group, through the group's account
 * (its holder, or the lender picked). Never for a TOT session.
 */
export async function antreNilai(
  db: Db,
  sesiId: number,
  nomor: number,
  oleh: string,
  tundaDetik = 0,
  /** Kirim Ulang ke SeeLabs (2026-10-17): send even a group marked saved. */
  paksa = false,
): Promise<HasilAntreNilai> {
  const aturan = await aturanRobot(db);
  if (!aturan.nyala || !aturan.kunci) return { antre: false, alasan: "robot_mati" };
  if (await sesiTot(db, sesiId)) return { antre: false, alasan: "sesi_tot" };
  const data = await muatSeelabs(db, sesiId);
  const g = data?.kelompok.find((x) => x.nomor === nomor);
  if (!data || !g) return { antre: false, alasan: "tidak_ada" };
  if (!g.akun) return { antre: false, alasan: "tanpa_akun" };
  const akses = await aksesDari(db, g.akun);
  if (!akses || akses.status !== "aktif") return { antre: false, alasan: "akun_belum_terhubung" };
  if (g.status === "terkirim" && !paksa) return { antre: false, alasan: "sudah_tersimpan" };

  const { perKlp, tanpaKlp } = barisPerKlp(
    g.baris.map((b) => ({ nim: b.nim, klp: b.klp ?? null, skor: b.skor })),
  );
  if (tanpaKlp.length || !perKlp.size) return { antre: false, alasan: "klp_tidak_dikenal" };

  const sidik = sidikPayload(g.baris, data.sesi.modul);
  const praktikum =
    PRAKTIKUM_SEELABS[data.sesi.kelas as keyof typeof PRAKTIKUM_SEELABS] ??
    PRAKTIKUM_SEELABS.reguler;
  const tugas: number[] = [];
  for (const [klp, baris] of perKlp) {
    tugas.push(
      await antre(db, {
        jenis: "nilai",
        akunNim: g.akun,
        oleh,
        sesiId,
        kelompokNomor: nomor,
        klp,
        sidik,
        tundaDetik,
        isi: { praktikum, klp: Number(klp), modul: data.sesi.modul, baris },
      }),
    );
  }
  await siarkan(["seelabs"]);
  return { antre: true, tugas };
}

/**
 * Whether a nilai job still goes through its group's account in that
 * session: the holder's own, or the lender they picked. A group that changed
 * hands since the job was queued records only under the new account (user,
 * 2026-10-20). Other jobs are always their own account's.
 */
async function akunMasihSah(db: Db, t: typeof seelabsTugas.$inferSelect): Promise<boolean> {
  if (t.jenis !== "nilai" || !t.sesiId || !t.kelompokNomor) return true;
  const g = (await muatSeelabs(db, t.sesiId))?.kelompok.find((x) => x.nomor === t.kelompokNomor);
  return !!g && g.akun === t.akunNim;
}

/** Ends a nilai job whose group changed account and queues the group's
 *  save again through the account it has now (none when it has none). */
async function pindahAkun(db: Db, t: typeof seelabsTugas.$inferSelect, oleh: string) {
  await db
    .update(seelabsTugas)
    .set({ status: "batal", galatKode: "akun_berubah", selesai: new Date() })
    .where(eq(seelabsTugas.id, t.id));
  await writeAudit(oleh, "seelabs_akun_berubah", {
    tugas: t.id,
    sesiId: t.sesiId,
    kelompok: t.kelompokNomor,
    akun: t.akunNim,
  });
  return antreNilai(db, t.sesiId!, t.kelompokNomor!, oleh);
}

/** Seated covers (Substitute or Volunteer with a group, accepted) on a
 *  date from today on. */
const tutupanKini = () =>
  and(
    eq(penugasanSlot.status, "diterima"),
    isNotNull(penugasanSlot.kelompokNomor),
    gte(penugasanSlot.tanggal, hariIniWib()),
  );

/** The weekly slots an Asisten teaches this semester, from jadwal, and each
 *  slot they cover on a date still to come: SeeLabs takes scores on an
 *  off-shift once it's in Input Jaga, within its rules (user, 2026-10-21).
 *  A cover's slot stays registered after the date (jaga never removes). */
async function mengajar(db: Db, nim: string) {
  const [orang] = await db
    .select({ kode: asisten.kode })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  if (!orang) return [];
  const semester = semesterDariTanggal(hariIniWib());
  const [rows, tutup] = await Promise.all([
    db
      .select({
        id: jadwal.id,
        hari: jadwal.hari,
        slot: jadwal.slot,
        kelas: jadwal.kelas,
        asisten: jadwal.asisten,
        status: jadwal.status,
      })
      .from(jadwal)
      .where(eq(jadwal.semester, semester)),
    db
      .select({ jadwalId: penugasanSlot.jadwalId })
      .from(penugasanSlot)
      .where(and(eq(penugasanSlot.nim, nim), tutupanKini())),
  ]);
  const kode = orang.kode.toUpperCase();
  const ditutup = new Set(tutup.map((t) => t.jadwalId));
  return rows
    .filter(
      (r) =>
        r.status !== "kosong" &&
        (r.asisten.some((k) => k.trim().toUpperCase() === kode) || ditutup.has(r.id)),
    )
    .map((r) => ({ hari: r.hari, slot: r.slot, kelas: r.kelas }));
}

/**
 * After covers change (Jadwal, Tim › Penugasan): the jaga check for every
 * connected account seated as a cover on a date still to come, so the
 * cover's shift is in Input Jaga before their scores go out. It signs in
 * only where the wanted slots changed. Runs after the answer; a failure
 * here only logs.
 */
export async function jagaPengganti(db: Db): Promise<void> {
  try {
    const aturan = await aturanRobot(db);
    if (!aturan.nyala || !aturan.kunci) return;
    const rows = await db
      .selectDistinct({ nim: penugasanSlot.nim })
      .from(penugasanSlot)
      .innerJoin(seelabsAkses, eq(seelabsAkses.nim, penugasanSlot.nim))
      .where(and(tutupanKini(), eq(seelabsAkses.status, "aktif")));
    for (const r of rows) await antreJaga(db, r.nim, "robot", false);
  } catch (err) {
    console.error("[seelabs-robot] cover jaga check failed:", err);
  }
}

/** Input Jaga: one job per praktikum with slots, only when the wanted slots changed (or paksa). */
export async function antreJaga(db: Db, nim: string, oleh: string, paksa: boolean) {
  const akses = await aksesDari(db, nim);
  if (!akses || akses.status !== "aktif")
    return { antre: false as const, alasan: "akun_belum_terhubung" };
  const tarik =
    (await bacaKunci<{ kelompok?: Record<string, KelompokTarik[]> }>(db, KUNCI_ROBOT.kelompok))
      ?.kelompok ?? {};
  const { perPraktikum, tanpaMinggu } = slotJaga(await mengajar(db, nim), tarik);
  const sidik = sidikJaga(perPraktikum);
  if (!perPraktikum.size) return { antre: false as const, alasan: "tanpa_slot", tanpaMinggu };
  if (!paksa && akses.jagaSidik === sidik)
    return { antre: false as const, alasan: "sama", tanpaMinggu };
  // The same set already waiting or running (the sidik is kept only once
  // the Pi reports): every Jadwal or Penugasan save checks covers now.
  if (!paksa) {
    const [menunggu] = await db
      .select({ id: seelabsTugas.id })
      .from(seelabsTugas)
      .where(
        and(
          eq(seelabsTugas.jenis, "jaga"),
          eq(seelabsTugas.akunNim, nim),
          inArray(seelabsTugas.status, ["antre", "diambil"]),
          sql`${seelabsTugas.isi}->>'sidik' = ${sidik}`,
        ),
      )
      .limit(1);
    if (menunggu) return { antre: false as const, alasan: "sama", tanpaMinggu };
  }
  const tugas: number[] = [];
  for (const [praktikum, slot] of perPraktikum)
    tugas.push(
      await antre(db, {
        jenis: "jaga",
        akunNim: nim,
        oleh,
        klp: String(praktikum),
        isi: { praktikum, slot, sidik },
      }),
    );
  return { antre: true as const, tugas, tanpaMinggu };
}

/**
 * The day's robot chores, from the first beat after 06:00 WIB: pull the KLP
 * list with the account that last pulled it, then the jaga check for every
 * connected account (it signs in only where the wanted slots changed).
 */
export async function harianBilaPerlu(db: Db): Promise<void> {
  const hari = hariIniWib();
  const jam = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (jam < 6) return;
  const aturan = await aturanRobot(db);
  if (!aturan.nyala || !aturan.kunci) return;
  if ((await bacaKunci<string>(db, KUNCI_ROBOT.harian)) === hari) return;
  await tulisSet(db, KUNCI_ROBOT.harian, hari, null);

  const tarik = await bacaKunci<{ oleh?: string }>(db, KUNCI_ROBOT.kelompok);
  if (tarik?.oleh) {
    const a = await aksesDari(db, tarik.oleh);
    if (a?.status === "aktif")
      await antre(db, {
        jenis: "kelompok",
        akunNim: tarik.oleh,
        oleh: "robot",
        isi: { praktikum: [237, 238] },
      });
  }
  for (const a of await db
    .select({ nim: seelabsAkses.nim })
    .from(seelabsAkses)
    .where(eq(seelabsAkses.status, "aktif")))
    await antreJaga(db, a.nim, "robot", false);
}

/* -------------------------------------------------------- the Pi side */

/** This server's agent protocol when it is the approved robot, speaks protocol 6 and still
 *  has the approved key; else null. */
async function piRobot(db: Db, serverId: number, kunci: KunciRobot | null): Promise<number | null> {
  if (!kunci || kunci.serverId !== serverId) return null;
  const [s] = await db
    .select({ info: server.infoSistem })
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);
  const info = s?.info as { protokol?: number } | null;
  const protokol = info?.protokol ?? 0;
  return protokol >= PROTOKOL_ROBOT && bacaInfoSeelabs(info)?.sidik === kunci.sidik
    ? protokol
    : null;
}

/**
 * Jobs a Pi could take now, for the heartbeat's pace: "kerja" (a save or
 * another job someone waits on: the fast pace), "baca" (only reads, which
 * run every minute: a quarter-minute pace), or null.
 */
export async function adaTugasRobot(db: Db, serverId: number): Promise<"kerja" | "baca" | null> {
  const aturan = await aturanRobot(db);
  if (!aturan.nyala || aturan.kunci?.serverId !== serverId) return null;
  // Only kinds this agent can take, or an old agent would beat fast forever.
  const protokol = await piRobot(db, serverId, aturan.kunci);
  if (protokol === null) return null;
  const rows = await db
    .select({ jenis: seelabsTugas.jenis })
    .from(seelabsTugas)
    .where(
      and(
        inArray(seelabsTugas.status, ["antre", "diambil"]),
        inArray(seelabsTugas.jenis, jenisDiambil(protokol)),
        lte(seelabsTugas.jalanPada, new Date()),
      ),
    )
    .orderBy(sql`(${seelabsTugas.jenis} = 'baca')`)
    .limit(1);
  return rows.length ? (rows[0].jenis === "baca" ? "baca" : "kerja") : null;
}

export interface TugasPi {
  id: number;
  jenis: string;
  akun: string;
  pengguna: string;
  segel: string;
  alamat: AlamatSeelabs;
  isi: Record<string, unknown>;
  token?: string;
}

/**
 * Claims up to KLAIM_PER_DENYUT due jobs for the robot Pi, each with its
 * account's seal unwrapped. A job whose seal was made for another key, or
 * can't be unwrapped, fails here as segel_rusak and never leaves the site.
 */
export async function ambilTugas(db: Db, serverId: number): Promise<TugasPi[]> {
  const aturan = await aturanRobot(db);
  const protokol = aturan.nyala ? await piRobot(db, serverId, aturan.kunci) : null;
  if (protokol === null) return [];
  await sapuDiambil(db);

  // A job kind this agent doesn't know waits for its update (baca needs 8).
  const jenis = jenisDiambil(protokol);
  const klaimDari = async (daftar: JenisTugas[], batas: number): Promise<number[]> => {
    const klaim = await db.execute<{ id: number }>(sql`
      UPDATE seelabs_tugas SET status = 'diambil', diambil = now(), server_id = ${serverId}
      WHERE id IN (
        SELECT id FROM seelabs_tugas WHERE status = 'antre' AND jalan_pada <= now()
          AND jenis IN (${sql.join(
            daftar.map((j) => sql`${j}`),
            sql`, `,
          )})
        ORDER BY jalan_pada, id LIMIT ${batas} FOR UPDATE SKIP LOCKED
      ) RETURNING id`);
    return (
      (klaim as unknown as { rows?: { id: number }[] }).rows?.map((r) => r.id) ??
      (klaim as unknown as { id: number }[]).map((r) => r.id)
    );
  };
  // Every account is read every minute (2026-10-18): saves and the other
  // jobs go first, and a read only when this server holds none, so a save
  // never waits behind more than one read.
  const kerja = jenis.filter((j) => j !== "baca");
  const ids = kerja.length ? await klaimDari(kerja, KLAIM_PER_DENYUT) : [];
  if (jenis.includes("baca")) {
    const [dipegang] = await db
      .select({ id: seelabsTugas.id })
      .from(seelabsTugas)
      .where(
        and(
          eq(seelabsTugas.jenis, "baca"),
          eq(seelabsTugas.status, "diambil"),
          eq(seelabsTugas.serverId, serverId),
        ),
      )
      .limit(1);
    if (!dipegang) ids.push(...(await klaimDari(["baca"], 1)));
  }
  if (!ids.length) return [];

  const rows = await db
    .select({ t: seelabsTugas, a: seelabsAkses, akun: asisten.seelabsAkun })
    .from(seelabsTugas)
    .leftJoin(seelabsAkses, eq(seelabsAkses.nim, seelabsTugas.akunNim))
    .leftJoin(asisten, eq(asisten.nim, seelabsTugas.akunNim))
    .where(inArray(seelabsTugas.id, ids))
    .orderBy(sql`(${seelabsTugas.jenis} = 'baca')`, asc(seelabsTugas.id));
  const keluar: TugasPi[] = [];
  for (const { t, a, akun } of rows) {
    if (!(await akunMasihSah(db, t))) {
      await pindahAkun(db, t, t.oleh);
      continue;
    }
    const segel =
      a && a.sidikKunci === aturan.kunci!.sidik ? buka(a.segel, a.nim, LABEL_SEGEL) : null;
    if (!segel || (a!.status === "ditolak" && t.jenis !== "uji")) {
      const kode = !segel ? "segel_rusak" : "ditolak";
      await db
        .update(seelabsTugas)
        .set({ status: "gagal", galatKode: kode, selesai: new Date() })
        .where(eq(seelabsTugas.id, t.id));
      if (a && !segel)
        await db
          .update(seelabsAkses)
          .set({ status: "kunci_lain" })
          .where(eq(seelabsAkses.nim, a.nim));
      continue;
    }
    keluar.push({
      id: t.id,
      jenis: t.jenis,
      akun: t.akunNim,
      pengguna: akun || t.akunNim,
      segel,
      alamat: aturan.alamat,
      isi: t.isi,
      ...(t.token ? { token: t.token } : {}),
    });
  }
  return keluar;
}

/** A claimed job the Pi never answered goes back to the queue (or ends after its tries). */
async function sapuDiambil(db: Db): Promise<void> {
  const batas = new Date(Date.now() - BATAS_DIAMBIL_DETIK * 1000);
  const basi = await db
    .select({ id: seelabsTugas.id, percobaan: seelabsTugas.percobaan })
    .from(seelabsTugas)
    .where(and(eq(seelabsTugas.status, "diambil"), lte(seelabsTugas.diambil, batas)));
  for (const b of basi) {
    const lanjut = setelahGagal("pi_diam", b.percobaan, new Date());
    await db
      .update(seelabsTugas)
      .set({
        ...lanjut,
        galatKode: "pi_diam",
        ...(lanjut.status === "gagal" ? { selesai: new Date() } : {}),
      })
      .where(and(eq(seelabsTugas.id, b.id), eq(seelabsTugas.status, "diambil")));
  }
}

interface HasilMasuk {
  id: number;
  status: "selesai" | "gagal";
  kode?: string;
  rinci?: string;
  bukti?: Record<string, unknown>;
}

function bacaHasil(v: unknown): HasilMasuk | null {
  if (typeof v !== "object" || v === null) return null;
  const h = v as Record<string, unknown>;
  if (typeof h.id !== "number" || (h.status !== "selesai" && h.status !== "gagal")) return null;
  const kode =
    typeof h.kode === "string" && (GALAT_ROBOT as readonly string[]).includes(h.kode)
      ? h.kode
      : h.status === "gagal"
        ? "bentuk_berubah"
        : undefined;
  const bukti =
    typeof h.bukti === "object" && h.bukti !== null && !Array.isArray(h.bukti)
      ? (h.bukti as Record<string, unknown>)
      : undefined;
  if (bukti && JSON.stringify(bukti).length > 200_000) return null;
  return {
    id: h.id,
    status: h.status,
    kode,
    rinci: typeof h.rinci === "string" ? h.rinci.slice(0, 300) : undefined,
    bukti,
  };
}

/** The Pi's results from `hasilSeelabs`; returns true when anything changed. */
export async function terimaHasil(db: Db, serverId: number, masuk: unknown): Promise<boolean> {
  if (!Array.isArray(masuk) || !masuk.length) return false;
  let berubah = false;
  for (const item of masuk.slice(0, 50)) {
    const h = bacaHasil(item);
    if (!h) continue;
    const [t] = await db
      .select()
      .from(seelabsTugas)
      .where(
        and(
          eq(seelabsTugas.id, h.id),
          eq(seelabsTugas.serverId, serverId),
          eq(seelabsTugas.status, "diambil"),
        ),
      )
      .limit(1);
    if (!t) continue;
    // A read comes once a minute for each account: it wakes the pages only
    // when it changed something, or failed for good.
    if (t.jenis !== "baca") berubah = true;
    const akses = await aksesDari(db, t.akunNim);
    const sekarang = new Date();

    if (h.status === "selesai") {
      // A read's bukti is every group's scores and the whole Rekap BAP: it
      // lands in seelabs_baca, the job keeps only the counts.
      const baca = t.jenis === "baca" ? bacaBukti(h.bukti) : null;
      await db
        .update(seelabsTugas)
        .set({
          status: "selesai",
          bukti:
            t.jenis === "baca"
              ? { kelompok: baca?.nilai.length ?? 0, bap: baca?.bap?.length ?? null }
              : (h.bukti ?? {}),
          token: null,
          galatKode: null,
          galatRinci: null,
          selesai: sekarang,
        })
        .where(eq(seelabsTugas.id, t.id));
      if (akses && statusAksesSetelah(null, akses.status as StatusAkses) !== akses.status)
        berubah = true;
      if (akses)
        await db
          .update(seelabsAkses)
          .set({
            status: statusAksesSetelah(null, akses.status as StatusAkses),
            galat: null,
            berhasilPada: sekarang,
            ...(t.jenis === "uji" ? { diujiPada: sekarang } : {}),
            ...(t.jenis === "jaga" && typeof t.isi.sidik === "string"
              ? { jagaSidik: t.isi.sidik }
              : {}),
          })
          .where(eq(seelabsAkses.nim, t.akunNim));
      if (t.jenis === "nilai") await tandaiTersimpan(db, t);
      if (t.jenis === "baca") {
        if (baca) {
          const ubah = await terimaBaca(db, t, baca).catch((e) => {
            console.error("[seelabs-baca] read-back failed:", t.id, e);
            return false;
          });
          if (ubah) berubah = true;
        } else console.error("[seelabs-baca] read result has the wrong shape:", t.id);
        // Reads run every minute: finished ones go after an hour, failed
        // ones (the Admin log shows them) after two days.
        await db
          .delete(seelabsTugas)
          .where(
            and(
              eq(seelabsTugas.jenis, "baca"),
              or(
                and(
                  inArray(seelabsTugas.status, ["selesai", "batal"]),
                  lte(seelabsTugas.dibuat, new Date(sekarang.getTime() - 3_600_000)),
                ),
                and(
                  eq(seelabsTugas.status, "gagal"),
                  lte(seelabsTugas.dibuat, new Date(sekarang.getTime() - 2 * 86_400_000)),
                ),
              ),
            ),
          );
      }
      if (t.jenis === "kelompok" && h.bukti?.kelompok)
        await tulisSet(
          db,
          KUNCI_ROBOT.kelompok,
          { pada: sekarang.toISOString(), oleh: t.akunNim, kelompok: h.bukti.kelompok },
          t.oleh,
        );
      continue;
    }

    const kode = h.kode ?? "bentuk_berubah";
    const lanjut = setelahGagal(kode, t.percobaan, sekarang);
    if (lanjut.status === "gagal") berubah = true;
    await db
      .update(seelabsTugas)
      .set({
        ...lanjut,
        galatKode: kode,
        galatRinci: h.rinci ?? null,
        bukti: h.bukti ?? null,
        ...(lanjut.status === "gagal" ? { selesai: sekarang, token: null } : {}),
      })
      .where(eq(seelabsTugas.id, t.id));
    if (akses) {
      const status = statusAksesSetelah(kode, akses.status as StatusAkses);
      if (status !== akses.status) berubah = true;
      await db
        .update(seelabsAkses)
        .set({ status, galat: kode, ...(t.jenis === "uji" ? { diujiPada: sekarang } : {}) })
        .where(eq(seelabsAkses.nim, t.akunNim));
      // A refused password stops every other waiting job of that account: no retry storm.
      if (status === "ditolak")
        await db
          .update(seelabsTugas)
          .set({ status: "gagal", galatKode: "ditolak", selesai: sekarang })
          .where(and(eq(seelabsTugas.akunNim, t.akunNim), eq(seelabsTugas.status, "antre")));
    }
    // A read retries every few minutes on its own: only its last failure is logged.
    if (t.jenis !== "baca" || lanjut.status === "gagal")
      await writeAudit(t.akunNim, "seelabs_tugas", {
        tugas: t.id,
        jenis: t.jenis,
        kode,
        sesiId: t.sesiId,
        nomor: t.kelompokNomor,
      });
  }
  if (berubah) await siarkan(["seelabs", "nilai"]);
  return berubah;
}

/** A verified save marks the group saved once every KLP of that send is in. */
async function tandaiTersimpan(db: Db, t: typeof seelabsTugas.$inferSelect): Promise<void> {
  if (!t.sesiId || !t.kelompokNomor || !t.sidik) return;
  const [sisa] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seelabsTugas)
    .where(
      and(
        eq(seelabsTugas.jenis, "nilai"),
        eq(seelabsTugas.sesiId, t.sesiId),
        eq(seelabsTugas.kelompokNomor, t.kelompokNomor),
        eq(seelabsTugas.sidik, t.sidik),
        ne(seelabsTugas.status, "selesai"),
        ne(seelabsTugas.status, "batal"),
      ),
    );
  if ((sisa?.n ?? 0) > 0) return;
  const selesai = await db
    .select({ klp: seelabsTugas.klp, isi: seelabsTugas.isi })
    .from(seelabsTugas)
    .where(
      and(
        eq(seelabsTugas.sesiId, t.sesiId),
        eq(seelabsTugas.kelompokNomor, t.kelompokNomor),
        eq(seelabsTugas.sidik, t.sidik),
        eq(seelabsTugas.status, "selesai"),
      ),
    );
  const klp = selesai.map((r) => r.klp).filter(Boolean);
  // What the save put in SeeLabs: the read-back's baseline (2026-10-17).
  const dasar = dasarDariBaris(
    selesai.flatMap((r) => ((r.isi as { baris?: BarisRobot[] }).baris ?? []) as BarisRobot[]),
  );
  const modul = Number((t.isi as { modul?: number }).modul ?? 0);
  await db.insert(seelabsEkspor).values({
    sesiId: t.sesiId,
    kelompokNomor: t.kelompokNomor,
    klp: [...new Set(klp)].join(",") || null,
    modul,
    akunNim: t.akunNim,
    payloadHash: t.sidik,
    disimpanPada: new Date(),
    cara: "robot",
    nilai: dasar,
  });
  await writeAudit(t.akunNim, "seelabs_simpan", {
    sesiId: t.sesiId,
    nomor: t.kelompokNomor,
    akun: t.akunNim,
    cara: "robot",
  });
}

/* -------------------------------------------------------- the screens */

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function pengelolaRobot(nim: string): Promise<boolean> {
  const o = await muatOrang(nim);
  return !!o && bolehPenuh(o, "full");
}

function ringkasTugas(t: typeof seelabsTugas.$inferSelect) {
  return {
    id: t.id,
    jenis: t.jenis,
    akun: t.akunNim,
    sesiId: t.sesiId,
    kelompok: t.kelompokNomor,
    klp: t.klp,
    status: t.status,
    percobaan: t.percobaan,
    galat: t.galatKode,
    rinci: t.galatRinci,
    bukti: ringkasBukti(t.bukti),
    dibuat: t.dibuat.toISOString(),
    jalanPada: t.jalanPada.toISOString(),
    selesai: t.selesai?.toISOString() ?? null,
  };
}

export async function handleRobotGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  const aturan = await aturanRobot(db);

  if (req.query.kunci) {
    // Only an approved key is ever offered for sealing.
    res
      .status(200)
      .json(
        aturan.kunci
          ? { ok: true, spki: aturan.kunci.spki, sidik: aturan.kunci.sidik, sufiks: aturan.sufiks }
          : { ok: false, kode: "kunci_belum_disetujui" },
      );
    return;
  }

  if (req.query.kelompok) {
    // The last KLP pull, for Cocokkan KLP (names and NIMs only).
    const tarik = await bacaKunci<{ pada?: string; kelompok?: Record<string, KelompokTarik[]> }>(
      db,
      KUNCI_ROBOT.kelompok,
    );
    res
      .status(200)
      .json({ ok: true, pada: tarik?.pada ?? null, kelompok: tarik?.kelompok ?? null });
    return;
  }

  const baca = posInt(req.query.baca);
  if (baca) {
    // The read-back's state per group of one session (2026-10-17).
    res.status(200).json({ ok: true, kelompok: await bacaSesi(db, baca) });
    return;
  }

  const sesiId = posInt(req.query.sesiId);
  if (sesiId) {
    const rows = await db
      .select()
      .from(seelabsTugas)
      .where(and(eq(seelabsTugas.sesiId, sesiId), eq(seelabsTugas.jenis, "nilai")))
      .orderBy(desc(seelabsTugas.id));
    res
      .status(200)
      .json({ ok: true, nyala: aturan.nyala && !!aturan.kunci, tugas: rows.map(ringkasTugas) });
    return;
  }

  if (req.query.sumber) {
    if (!(await pengelolaRobot(session.nim))) {
      res.status(403).json({ ok: false, kode: "bukan_pengelola" });
      return;
    }
    const servers = await db
      .select({
        id: server.id,
        nama: server.nama,
        info: server.infoSistem,
        pada: server.infoSistemPada,
      })
      .from(server);
    const kunciPi = servers
      .map((s) => ({
        serverId: s.id,
        nama: s.nama,
        info: bacaInfoSeelabs(s.info),
        protokol: (s.info as { protokol?: number } | null)?.protokol ?? null,
        pada: s.pada?.toISOString() ?? null,
      }))
      .filter((s) => s.info);
    const akun = await db
      .select({
        nim: asisten.nim,
        kode: asisten.kode,
        nama: asisten.nama,
        status: seelabsAkses.status,
        galat: seelabsAkses.galat,
        bawaan: seelabsAkses.bawaan,
        berhasil: seelabsAkses.berhasilPada,
      })
      .from(asisten)
      .leftJoin(seelabsAkses, eq(seelabsAkses.nim, asisten.nim))
      .where(eq(asisten.status, "aktif"))
      .orderBy(asc(asisten.kode));
    // Reads run every few minutes: only a failed one belongs in the log.
    const log = await db
      .select()
      .from(seelabsTugas)
      .where(or(ne(seelabsTugas.jenis, "baca"), eq(seelabsTugas.status, "gagal")))
      .orderBy(desc(seelabsTugas.id))
      .limit(60);
    const tarik = await bacaKunci<{ pada?: string; oleh?: string }>(db, KUNCI_ROBOT.kelompok);
    res.status(200).json({
      ok: true,
      nyala: aturan.nyala,
      alamat: aturan.alamat,
      sufiks: aturan.sufiks,
      kunci: aturan.kunci
        ? {
            serverId: aturan.kunci.serverId,
            sidik: aturan.kunci.sidik,
            oleh: aturan.kunci.oleh,
            pada: aturan.kunci.pada,
          }
        : null,
      kunciPi: kunciPi.map((k) => ({
        serverId: k.serverId,
        nama: k.nama,
        sidik: k.info!.sidik,
        jangkau: k.info!.jangkau ?? null,
        protokol: k.protokol,
        pada: k.pada,
      })),
      akun,
      tarik: tarik ? { pada: tarik.pada ?? null, oleh: tarik.oleh ?? null } : null,
      log: log.map(ringkasTugas),
    });
    return;
  }

  const akses = await aksesDari(db, session.nim);
  const [orang] = await db
    .select({ akun: asisten.seelabsAkun })
    .from(asisten)
    .where(eq(asisten.nim, session.nim))
    .limit(1);
  const tugas = await db
    .select()
    .from(seelabsTugas)
    // The robot's reads are not the Asisten's jobs; they show as the read-back panels.
    .where(
      and(
        or(eq(seelabsTugas.akunNim, session.nim), eq(seelabsTugas.oleh, session.nim)),
        ne(seelabsTugas.jenis, "baca"),
      ),
    )
    .orderBy(desc(seelabsTugas.id))
    .limit(20);
  res.status(200).json({
    ok: true,
    nyala: aturan.nyala,
    kunci: aturan.kunci ? { sidik: aturan.kunci.sidik, serverId: aturan.kunci.serverId } : null,
    pengguna: orang?.akun || session.nim,
    akses: akses
      ? {
          status: akses.status,
          bawaan: akses.bawaan,
          galat: akses.galat,
          kunciSama: !!aturan.kunci && akses.sidikKunci === aturan.kunci.sidik,
          dibuatPada: akses.dibuatPada.toISOString(),
          diujiPada: akses.diujiPada?.toISOString() ?? null,
          berhasilPada: akses.berhasilPada?.toISOString() ?? null,
        }
      : null,
    tugas: tugas.map(ringkasTugas),
    bacaku: await bacaku(db, session.nim),
  });
}

export async function handleRobotPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  const db = getDb();
  const aturan = await aturanRobot(db);
  const jawab = (isi: Record<string, unknown>) => res.status(200).json(isi);

  if (aksi === "hubung") {
    const segel = typeof body.segel === "string" ? body.segel : "";
    // 3072-bit RSA gives 384 bytes, 512 base64 characters.
    if (!aturan.kunci) return jawab({ ok: false, kode: "kunci_belum_disetujui" });
    if (body.sidik !== aturan.kunci.sidik) return jawab({ ok: false, kode: "kunci_berubah" });
    if (!/^[A-Za-z0-9+/]{510,700}={0,2}$/.test(segel))
      return jawab({ ok: false, kode: "format_salah" });
    const nilai = {
      segel: bungkus(segel, session.nim, LABEL_SEGEL),
      sidikKunci: aturan.kunci.sidik,
      status: "menunggu_uji" as const,
      bawaan: body.bawaan === true,
      galat: null,
      jagaSidik: null,
      dibuatPada: new Date(),
    };
    await db
      .insert(seelabsAkses)
      .values({ nim: session.nim, ...nilai })
      .onConflictDoUpdate({ target: seelabsAkses.nim, set: nilai });
    // Jobs that failed on the old password may run again with the new one.
    await db
      .update(seelabsTugas)
      .set({ status: "batal" })
      .where(and(eq(seelabsTugas.akunNim, session.nim), eq(seelabsTugas.status, "antre")));
    const id = await antre(db, { jenis: "uji", akunNim: session.nim, oleh: session.nim });
    await writeAudit(session.nim, "seelabs_hubung", {
      bawaan: nilai.bawaan,
      sidik: aturan.kunci.sidik,
    });
    jawab({ ok: true, tugas: id });
    await siarkan(["seelabs"]);
    return;
  }

  if (aksi === "putus") {
    await db.delete(seelabsAkses).where(eq(seelabsAkses.nim, session.nim));
    await db
      .update(seelabsTugas)
      .set({ status: "batal", token: null })
      .where(and(eq(seelabsTugas.akunNim, session.nim), eq(seelabsTugas.status, "antre")));
    await writeAudit(session.nim, "seelabs_putus", {});
    jawab({ ok: true });
    await siarkan(["seelabs"]);
    return;
  }

  if (aksi === "uji" || aksi === "kelompok" || aksi === "jaga") {
    const akses = await aksesDari(db, session.nim);
    if (!akses) return jawab({ ok: false, kode: "akun_belum_terhubung" });
    if (aksi === "uji")
      return jawab({
        ok: true,
        tugas: await antre(db, { jenis: "uji", akunNim: session.nim, oleh: session.nim }),
      });
    if (akses.status !== "aktif") return jawab({ ok: false, kode: "akun_belum_terhubung" });
    if (aksi === "kelompok")
      return jawab({
        ok: true,
        tugas: await antre(db, {
          jenis: "kelompok",
          akunNim: session.nim,
          oleh: session.nim,
          isi: { praktikum: [237, 238] },
        }),
      });
    const r = await antreJaga(db, session.nim, session.nim, true);
    jawab({ ok: true, ...r });
    await siarkan(["seelabs"]);
    return;
  }

  if (aksi === "periksa") {
    // Periksa Sekarang: my account and the lenders' my groups went through,
    // plus the accounts and module of the session it was pressed on (an older
    // session's module is outside the usual 7 days); every account and the
    // whole semester for whoever sees Bayar's Admin cards.
    const o = await muatOrang(session.nim);
    const semua = body.semua === true && !!o && (bolehPenuh(o, "full") || boleh(o, "tim"));
    const dari = !semua && posInt(body.sesiId) ? await bacaanSesi(db, posInt(body.sesiId)!) : null;
    const akun = semua
      ? await akunAktif(
          db,
          (await db.select({ nim: seelabsAkses.nim }).from(seelabsAkses)).map((r) => r.nim),
        )
      : await akunAktif(db, [
          ...new Set([...(await akunUntukPeriksa(db, session.nim)), ...(dari?.akun ?? [])]),
        ]);
    const tugas: number[] = [];
    for (const nim of akun) {
      const id = await antreBaca(db, nim, session.nim, { semua, tambah: dari?.modul });
      if (id) tugas.push(id);
    }
    if (tugas.length) await siarkan(["seelabs"]);
    return jawab({ ok: true, tugas });
  }

  if (aksi === "kirim_ulang") {
    // Kirim Ulang ke SeeLabs: IRIS's values go again, even when marked saved.
    const sesi = posInt(body.sesiId);
    const nomor = posInt(body.kelompok);
    if (!sesi || !nomor) return jawab({ ok: false, kode: "format_salah" });
    const data = await muatSeelabs(db, sesi);
    const g = data?.kelompok.find((x) => x.nomor === nomor);
    if (!g) return jawab({ ok: false, kode: "tidak_ada" });
    if (g.penilai !== session.nim && !(await pengelolaRobot(session.nim))) {
      res.status(403).json({ ok: false, kode: "bukan_penilai" });
      return;
    }
    return jawab({ ok: true, ...(await antreNilai(db, sesi, nomor, session.nim, 0, true)) });
  }

  if (aksi === "ulang" || aksi === "token") {
    const id = posInt(body.tugasId);
    const [t] = id
      ? await db.select().from(seelabsTugas).where(eq(seelabsTugas.id, id)).limit(1)
      : [];
    if (!t || t.status !== "gagal") return jawab({ ok: false, kode: "tugas_tidak_ada" });
    const pengelola = await pengelolaRobot(session.nim);
    if (t.akunNim !== session.nim && t.oleh !== session.nim && !pengelola) {
      res.status(403).json({ ok: false, kode: "bukan_pemilik" });
      return;
    }
    // The group changed hands: its save goes again through the account it
    // has now, never the old one.
    if (!(await akunMasihSah(db, t))) {
      const hasil = await pindahAkun(db, t, session.nim);
      await siarkan(["seelabs"]);
      return jawab(
        hasil.antre ? { ok: true, tugas: hasil.tugas[0] } : { ok: false, kode: hasil.alasan },
      );
    }
    let token: string | null = null;
    if (aksi === "token") {
      token = typeof body.token === "string" ? body.token.trim() : "";
      if (!/^[A-Za-z0-9-]{3,40}$/.test(token)) return jawab({ ok: false, kode: "format_salah" });
    }
    // The same job again, fresh; a score edit since would have queued its own already.
    const baru = await antre(db, {
      jenis: t.jenis,
      akunNim: t.akunNim,
      oleh: session.nim,
      isi: t.isi,
      sesiId: t.sesiId,
      kelompokNomor: t.kelompokNomor,
      klp: t.klp,
      sidik: t.sidik,
    });
    if (token) await db.update(seelabsTugas).set({ token }).where(eq(seelabsTugas.id, baru));
    await db.update(seelabsTugas).set({ status: "batal" }).where(eq(seelabsTugas.id, t.id));
    jawab({ ok: true, tugas: baru });
    await siarkan(["seelabs"]);
    return;
  }

  if (aksi === "robot" || aksi === "kunci" || aksi === "alamat" || aksi === "sufiks") {
    if (!(await pengelolaRobot(session.nim))) {
      res.status(403).json({ ok: false, kode: "bukan_pengelola" });
      return;
    }
    if (aksi === "robot") {
      const nyala = body.nyala === true;
      await tulisSet(db, KUNCI_ROBOT.robot, { nyala }, session.nim);
      await writeAudit(session.nim, "seelabs_robot", { nyala });
    } else if (aksi === "alamat") {
      if (!ALAMAT_SEELABS.includes(body.alamat as AlamatSeelabs))
        return jawab({ ok: false, kode: "format_salah" });
      await tulisSet(db, KUNCI_ROBOT.alamat, body.alamat, session.nim);
      await writeAudit(session.nim, "seelabs_robot", { alamat: body.alamat });
    } else if (aksi === "sufiks") {
      // Only the suffix's shape is checked; connected accounts keep their seal.
      if (!sufiksSah(body.sufiks)) return jawab({ ok: false, kode: "format_salah" });
      await tulisSet(db, KUNCI_ROBOT.sufiks, { sufiks: body.sufiks }, session.nim);
      await writeAudit(session.nim, "seelabs_robot", { sufiks: true });
    } else {
      // Approving a key: the Pi that reports exactly this fingerprint.
      const sidik = typeof body.setujui === "string" ? body.setujui : "";
      const servers = await db.select({ id: server.id, info: server.infoSistem }).from(server);
      const cocok = servers
        .map((s) => ({ id: s.id, info: bacaInfoSeelabs(s.info) }))
        .find((s) => s.info?.sidik === sidik);
      if (!cocok?.info) return jawab({ ok: false, kode: "kunci_tidak_ada" });
      const lama = aturan.kunci;
      const kunci: KunciRobot = {
        serverId: cocok.id,
        spki: cocok.info.spki,
        sidik,
        oleh: session.nim,
        pada: new Date().toISOString(),
      };
      await tulisSet(db, KUNCI_ROBOT.kunci, kunci, session.nim);
      // Every seal made for another key is useless now; its owner connects again.
      if (!lama || lama.sidik !== sidik)
        await db
          .update(seelabsAkses)
          .set({ status: "kunci_lain" })
          .where(ne(seelabsAkses.sidikKunci, sidik));
      await writeAudit(session.nim, "seelabs_kunci", {
        serverId: cocok.id,
        sidik,
        lama: lama?.sidik ?? null,
      });
    }
    jawab({ ok: true });
    await siarkan(["seelabs"]);
    return;
  }

  res.status(400).json({ ok: false, kode: "format_salah" });
}
