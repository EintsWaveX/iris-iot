/**
 * The SeeLabs read-back (2026-10-17, spec 2026-10-17-seelabs-two-way-sync):
 * queueing the robot's read-only `baca` job for each connected account, and
 * taking its results into IRIS. The rules live in src/lib/seelabs-baca.ts.
 *
 * The rhythm: every 5 minutes from 06:30 WIB until the day's last session
 * ends, hourly otherwise, one nightly pass over every module of the
 * semester, and at once from Periksa Sekarang.
 */
import { and, desc, eq, gte, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  nilai,
  nilaiKirim,
  pengaturan,
  seelabsAkses,
  seelabsBaca,
  seelabsBapBeda,
  seelabsEkspor,
  seelabsLepas,
  seelabsTugas,
  sesi,
  sesiAnggota,
  unitBayar,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import { sidikPayload } from "../../src/lib/seelabs.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  akunPerluBaca,
  bacakuUntuk,
  bandingkanBap,
  barisBap,
  jedaBaca,
  nilaiTersimpan,
  rencanaTerima,
  waktunyaMalam,
  type BarisBaca,
  type CalonSesi,
  type KeadaanKelompok,
  type KelompokBaca,
} from "../../src/lib/seelabs-baca.js";
import { KUNCI_ROBOT, PRAKTIKUM_SEELABS } from "../../src/lib/seelabs-robot.js";
import { aksesDari, antre, aturanRobot } from "./seelabs-robot.js";
import { muatSeelabs } from "./seelabs.js";
import { tulisSet } from "./tp.js";

type Db = ReturnType<typeof getDb>;

/** pengaturan seelabs_baca_jadwal: when each account's read was last queued, and the night pass. */
export interface JadwalBaca {
  terakhir: Record<string, string>;
  malam: string | null;
}

async function bacaJadwal(db: Db): Promise<JadwalBaca> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_ROBOT.baca))
    .limit(1);
  const v = r?.nilai as Partial<JadwalBaca> | undefined;
  return { terakhir: v?.terakhir ?? {}, malam: v?.malam ?? null };
}

const tambahHari = (tanggal: string, n: number) =>
  new Date(Date.parse(`${tanggal}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Modules with a session (no TOT, not cancelled) in the last 7 days, or the whole semester. */
export async function modulAktif(db: Db, semua: boolean): Promise<number[]> {
  const hari = hariIniWib();
  const semester = semesterDariTanggal(hari);
  const rows = await db
    .select({ modul: sesi.modul, tanggal: sesi.tanggal })
    .from(sesi)
    .where(
      and(
        ne(sesi.jenis, "tot"),
        ne(sesi.status, "batal"),
        gte(sesi.tanggal, semua ? "0000-00-00" : tambahHari(hari, -7)),
      ),
    );
  const modul = rows
    .filter((r) => r.tanggal <= hari && semesterDariTanggal(r.tanggal) === semester)
    .map((r) => r.modul);
  return [...new Set(modul)].sort((a, b) => a - b);
}

/** Today's sessions (no TOT, not cancelled) as start and end instants. */
async function sesiHariIni(db: Db): Promise<{ mulai: string; akhir: string }[]> {
  const hari = hariIniWib();
  const rows = await db
    .select({ mulai: sesi.mulai, durasi: sesi.durasiMenit })
    .from(sesi)
    .where(and(eq(sesi.tanggal, hari), ne(sesi.jenis, "tot"), ne(sesi.status, "batal")));
  return rows.map((r) => {
    const mulai = Date.parse(`${hari}T${r.mulai}:00+07:00`);
    return {
      mulai: new Date(mulai).toISOString(),
      akhir: new Date(mulai + r.durasi * 60_000).toISOString(),
    };
  });
}

/**
 * One read of an account's saves (both classes, the active modules, Rekap
 * BAP). Null when the robot is off, the account isn't connected, or no
 * module has a session to compare with yet.
 */
export async function antreBaca(
  db: Db,
  akunNim: string,
  oleh: string,
  /** semua: the whole semester's modules; tambah: one more module to read. */
  opsi: { semua?: boolean; modul?: number[]; tambah?: number } = {},
): Promise<number | null> {
  const aturan = await aturanRobot(db);
  if (!aturan.nyala || !aturan.kunci) return null;
  const akses = await aksesDari(db, akunNim);
  if (!akses || akses.status !== "aktif") return null;
  // A read still waiting is replaced, so its modules come along (a press of
  // Periksa Sekarang never narrows a queued whole-semester read).
  const menunggu = await db
    .select({ isi: seelabsTugas.isi })
    .from(seelabsTugas)
    .where(
      and(
        eq(seelabsTugas.jenis, "baca"),
        eq(seelabsTugas.akunNim, akunNim),
        eq(seelabsTugas.status, "antre"),
      ),
    );
  const modul = [
    ...new Set([
      ...(opsi.modul ?? (await modulAktif(db, !!opsi.semua))),
      ...(opsi.tambah ? [opsi.tambah] : []),
      ...menunggu.flatMap((t) =>
        ((t.isi as { modul?: number[] }).modul ?? []).filter(Number.isInteger),
      ),
    ]),
  ].sort((a, b) => a - b);
  if (!modul.length) return null;
  return antre(db, {
    jenis: "baca",
    akunNim,
    oleh,
    isi: { praktikum: Object.values(PRAKTIKUM_SEELABS), modul, bap: true },
  });
}

/** The heartbeat's hook: queues the reads that are due (never throws). */
export async function bacaBilaPerlu(db: Db, sekarang = new Date()): Promise<void> {
  try {
    const aturan = await aturanRobot(db);
    if (!aturan.nyala || !aturan.kunci) return;
    const jadwal = await bacaJadwal(db);
    const akun = await db
      .select({ nim: seelabsAkses.nim, status: seelabsAkses.status })
      .from(seelabsAkses);
    const malam = waktunyaMalam(sekarang, jadwal.malam);
    const nims = malam
      ? akun.filter((a) => a.status === "aktif").map((a) => a.nim)
      : akunPerluBaca({
          akun,
          terakhir: jadwal.terakhir,
          jedaMs: jedaBaca({ sekarang, sesiHariIni: await sesiHariIni(db) }),
          sekarang,
        });
    if (!nims.length) return;
    const modul = await modulAktif(db, malam);
    if (!modul.length) return;
    for (const nim of nims) await antreBaca(db, nim, "robot", { modul });
    const pada = sekarang.toISOString();
    await tulisSet(
      db,
      KUNCI_ROBOT.baca,
      {
        terakhir: { ...jadwal.terakhir, ...Object.fromEntries(nims.map((n) => [n, pada])) },
        malam: malam ? hariIniWib() : jadwal.malam,
      } satisfies JadwalBaca,
      null,
    );
  } catch (e) {
    console.error("[api/seelabs-baca] queueing reads failed:", e);
  }
}

/** Accounts read for one press of Periksa Sekarang (Task 7 widens it to lent accounts). */
export async function akunAktif(db: Db, nims: string[]): Promise<string[]> {
  if (!nims.length) return [];
  const rows = await db
    .select({ nim: seelabsAkses.nim })
    .from(seelabsAkses)
    .where(and(inArray(seelabsAkses.nim, nims), eq(seelabsAkses.status, "aktif")));
  return rows.map((r) => r.nim);
}

/* ------------------------------------------------- taking a read in */

export interface BuktiBaca {
  nilai: KelompokBaca[];
  bap: { praktikum: number; hari: string; shift: string; tanggal: string }[] | null;
}

const angka = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The Pi's bukti, checked; null when its shape is wrong. */
export function bacaBukti(v: unknown): BuktiBaca | null {
  const b = v as Partial<BuktiBaca> | null;
  if (!b || !Array.isArray(b.nilai)) return null;
  const nilaiBaca: KelompokBaca[] = [];
  for (const g of b.nilai) {
    if (!g || !angka(g.praktikum) || !angka(g.klp) || !angka(g.modul) || !Array.isArray(g.baris))
      return null;
    const baris: BarisBaca[] = [];
    for (const r of g.baris) {
      if (!r || typeof r.nim !== "string") return null;
      if (![r.tp, r.ta, r.praktikum, r.jurnal].every(angka)) return null;
      baris.push({
        nim: r.nim,
        presensi: !!r.presensi,
        tp: r.tp,
        ta: r.ta,
        praktikum: r.praktikum,
        jurnal: r.jurnal,
      });
    }
    nilaiBaca.push({ praktikum: g.praktikum, klp: g.klp, modul: g.modul, baris });
  }
  const bap = Array.isArray(b.bap)
    ? b.bap.filter(
        (x) =>
          !!x && angka(x.praktikum) && typeof x.shift === "string" && typeof x.tanggal === "string",
      )
    : null;
  return { nilai: nilaiBaca, bap };
}

/** "praktikum|klp" of the semester's KLPs, from the robot's last Kelompok pull. */
async function klpSemester(db: Db): Promise<Set<string>> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_ROBOT.kelompok))
    .limit(1);
  const tarik = (r?.nilai as { kelompok?: Record<string, { klp: number }[]> } | undefined)
    ?.kelompok;
  const out = new Set<string>();
  for (const [praktikum, daftar] of Object.entries(tarik ?? {}))
    for (const g of daftar ?? []) out.add(`${praktikum}|${g.klp}`);
  return out;
}

const kunciGrup = (sesiId: number | null, nomor: number | null) => `${sesiId}|${nomor}`;

/**
 * A finished baca job: copies the TP and TA SeeLabs changed into IRIS,
 * records each group's read state and the rows with nowhere to land, and
 * returns whether anything changed. Never queues a nilai job (no echo).
 */
export async function terimaBaca(
  db: Db,
  tugas: { id: number; akunNim: string; isi: Record<string, unknown> },
  bukti: BuktiBaca,
): Promise<boolean> {
  const akun = tugas.akunNim;
  const modulDibaca = Array.isArray(tugas.isi.modul)
    ? (tugas.isi.modul as unknown[]).filter(angka)
    : [...new Set(bukti.nilai.map((g) => g.modul))];
  if (!modulDibaca.length) return false;
  const semester = semesterDariTanggal(hariIniWib());

  // This account's verified saves in the modules read (to tell one gone).
  const simpan = await db
    .select()
    .from(seelabsEkspor)
    .where(
      and(
        eq(seelabsEkspor.akunNim, akun),
        inArray(seelabsEkspor.modul, modulDibaca),
        eq(seelabsEkspor.cara, "robot"),
      ),
    )
    .orderBy(desc(seelabsEkspor.id));

  // Every session the Praktikan read (or this account's saves) sit in.
  const nims = [...new Set(bukti.nilai.flatMap((g) => g.baris.map((b) => b.nim)))];
  const lewatNim = nims.length
    ? await db
        .select({ sesiId: sesiAnggota.sesiId })
        .from(sesiAnggota)
        .innerJoin(sesi, eq(sesi.id, sesiAnggota.sesiId))
        .where(
          and(
            inArray(sesiAnggota.nim, nims),
            inArray(sesi.modul, modulDibaca),
            ne(sesi.jenis, "tot"),
            ne(sesi.status, "batal"),
          ),
        )
    : [];
  const sesiIds = [...new Set([...lewatNim.map((r) => r.sesiId), ...simpan.map((s) => s.sesiId)])];
  const data = (await Promise.all(sesiIds.map((id) => muatSeelabs(db, id)))).filter(
    (d): d is NonNullable<typeof d> =>
      !!d && d.sesi.jenis !== "tot" && semesterDariTanggal(d.sesi.tanggal) === semester,
  );
  const sesiOf = new Map(data.map((d) => [d.sesi.id, d]));

  const [kirim, antre, ekspor] = sesiIds.length
    ? await Promise.all([
        db
          .select({ sesiId: nilaiKirim.sesiId, nomor: nilaiKirim.kelompokNomor })
          .from(nilaiKirim)
          .where(inArray(nilaiKirim.sesiId, sesiIds)),
        db
          .select({ sesiId: seelabsTugas.sesiId, nomor: seelabsTugas.kelompokNomor })
          .from(seelabsTugas)
          .where(
            and(
              eq(seelabsTugas.jenis, "nilai"),
              inArray(seelabsTugas.sesiId, sesiIds),
              inArray(seelabsTugas.status, ["antre", "diambil"]),
            ),
          ),
        db
          .select()
          .from(seelabsEkspor)
          .where(and(inArray(seelabsEkspor.sesiId, sesiIds), isNotNull(seelabsEkspor.disimpanPada)))
          .orderBy(desc(seelabsEkspor.id)),
      ])
    : [[], [], []];
  const terkirim = new Set(kirim.map((r) => kunciGrup(r.sesiId, r.nomor)));
  const menunggu = new Set(antre.map((r) => kunciGrup(r.sesiId, r.nomor)));
  const terakhir = new Map<string, (typeof ekspor)[number]>();
  for (const e of ekspor) {
    const k = kunciGrup(e.sesiId, e.kelompokNomor);
    if (!terakhir.has(k)) terakhir.set(k, e);
  }

  const calon: Record<string, CalonSesi[]> = {};
  const keadaan: Record<string, KeadaanKelompok> = {};
  for (const d of data)
    for (const g of d.kelompok) {
      const k = kunciGrup(d.sesi.id, g.nomor);
      keadaan[k] = {
        dasar: terakhir.get(k)?.nilai ?? null,
        iris: Object.fromEntries(g.baris.map((b) => [b.nim, b.skor])),
        terkirim: terkirim.has(k),
        menunggu: menunggu.has(k),
      };
      for (const b of g.baris)
        (calon[`${b.nim}|${d.sesi.modul}`] ??= []).push({
          sesiId: d.sesi.id,
          kelompokNomor: g.nomor,
          akun: g.akun,
          tanggal: d.sesi.tanggal,
          mulai: d.sesi.mulai,
        });
    }

  const rencana = rencanaTerima({
    akunBaca: akun,
    bacaan: bukti.nilai,
    calon,
    keadaan,
    klpSemester: await klpSemester(db),
    tersimpan: simpan
      .filter((s) => sesiOf.has(s.sesiId))
      .map((s) => ({
        sesiId: s.sesiId,
        kelompokNomor: s.kelompokNomor,
        praktikum:
          PRAKTIKUM_SEELABS[sesiOf.get(s.sesiId)!.sesi.kelas as keyof typeof PRAKTIKUM_SEELABS] ??
          PRAKTIKUM_SEELABS.reguler,
        modul: s.modul,
        klp: (s.klp ?? "").split(",").map(Number).filter(Boolean),
      })),
    modulDibaca,
  });

  const sekarang = new Date();
  for (const c of rencana.salin) {
    await db
      .insert(nilai)
      .values({
        sesiId: c.sesiId,
        nim: c.nim,
        komponen: c.komponen,
        skor: c.skor,
        diubahOleh: "seelabs",
      })
      .onConflictDoUpdate({
        target: [nilai.sesiId, nilai.nim, nilai.komponen],
        set: { skor: c.skor, diubahOleh: "seelabs", diubahPada: sekarang },
      });
    await writeAudit(akun, "nilai_set", {
      sesiId: c.sesiId,
      nim: c.nim,
      komponen: c.komponen,
      skor: c.skor,
      sumber: "seelabs",
      sebelum: c.sebelum,
      ...(c.mentah !== c.skor ? { mentah: c.mentah } : {}),
    });
  }

  for (const k of rencana.kelompok) {
    await db
      .insert(seelabsBaca)
      .values({
        sesiId: k.sesiId,
        kelompokNomor: k.kelompokNomor,
        akunNim: akun,
        status: k.status,
        seelabs: k.seelabs,
        dibacaPada: sekarang,
      })
      .onConflictDoUpdate({
        target: [seelabsBaca.sesiId, seelabsBaca.kelompokNomor],
        set: { akunNim: akun, status: k.status, seelabs: k.seelabs, dibacaPada: sekarang },
      });
    if (!k.dasarBaru) continue;
    // What SeeLabs holds now, and IRIS's scores (after the copies) match it:
    // the strip reads Tersimpan and nothing is sent back.
    const d = await muatSeelabs(db, k.sesiId);
    const g = d?.kelompok.find((x) => x.nomor === k.kelompokNomor);
    if (!d || !g) continue;
    await db.insert(seelabsEkspor).values({
      sesiId: k.sesiId,
      kelompokNomor: k.kelompokNomor,
      klp: [...new Set(g.baris.map((b) => b.klp).filter(Boolean))].join(",") || null,
      modul: d.sesi.modul,
      akunNim: akun,
      payloadHash: sidikPayload(g.baris, d.sesi.modul),
      disimpanPada: sekarang,
      cara: "robot",
      nilai: k.seelabs,
    });
  }

  await db
    .delete(seelabsLepas)
    .where(and(eq(seelabsLepas.akunNim, akun), inArray(seelabsLepas.modul, modulDibaca)));
  for (const l of rencana.lepas)
    await db
      .insert(seelabsLepas)
      .values({ akunNim: akun, ...l, dibacaPada: sekarang })
      .onConflictDoUpdate({
        target: [
          seelabsLepas.akunNim,
          seelabsLepas.praktikum,
          seelabsLepas.modul,
          seelabsLepas.nim,
        ],
        set: { klp: l.klp, nilai: l.nilai, dibacaPada: sekarang },
      });

  const hitung = (s: string) => rencana.kelompok.filter((k) => k.status === s).length;
  await writeAudit(akun, "seelabs_baca", {
    tugas: tugas.id,
    sama: hitung("sama"),
    beda: rencana.kelompok.length - hitung("sama"),
    salin: rencana.salin.length,
    lepas: rencana.lepas.length,
  });
  await periksaBap(db, akun, bukti.bap);
  return rencana.salin.length > 0 || rencana.kelompok.length > 0 || rencana.lepas.length > 0;
}

/* ------------------------------------------------- Rekap BAP and the screens */

/**
 * One account's Rekap BAP against IRIS's pay units through it (the units of
 * the semester up to today): replaces that account's flags per praktikum.
 * Flags only; Bayar never changes from it.
 */
export async function periksaBap(db: Db, akunNim: string, bap: BuktiBaca["bap"]): Promise<void> {
  if (!bap) return;
  const hari = hariIniWib();
  const semester = semesterDariTanggal(hari);
  const units = await db
    .select({
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      kelas: unitBayar.kelas,
      penilai: unitBayar.nimPenilai,
    })
    .from(unitBayar)
    .innerJoin(sesi, eq(sesi.id, unitBayar.sesiId))
    .where(
      and(
        sql`coalesce(${unitBayar.nimAkunSeelabs}, ${unitBayar.nimPenilai}) = ${akunNim}`,
        ne(sesi.jenis, "tot"),
      ),
    );
  const sekarang = new Date();
  for (const [kelas, praktikum] of Object.entries(PRAKTIKUM_SEELABS)) {
    const { baris, takTerbaca } = barisBap(bap, praktikum);
    // A row it cannot read (a new date layout) would flag every unit as
    // hanya_iris: keep the last flags and say so in the log instead.
    if (takTerbaca) {
      console.warn("[seelabs-baca] Rekap BAP rows not read:", akunNim, praktikum, takTerbaca);
      continue;
    }
    const iris = units
      .filter(
        (u) =>
          u.kelas === kelas &&
          u.slot !== null &&
          u.tanggal <= hari &&
          semesterDariTanggal(u.tanggal) === semester,
      )
      .map((u) => ({ tanggal: u.tanggal, shift: u.slot!, penilai: u.penilai }));
    const beda = bandingkanBap(
      iris,
      baris.filter((b) => semesterDariTanggal(b.tanggal) === semester),
    );
    await db
      .delete(seelabsBapBeda)
      .where(and(eq(seelabsBapBeda.akunNim, akunNim), eq(seelabsBapBeda.praktikum, praktikum)));
    if (beda.length)
      await db
        .insert(seelabsBapBeda)
        .values(beda.map((b) => ({ akunNim, praktikum, ...b, dibacaPada: sekarang })));
  }
}

/** What a Periksa Sekarang pressed on one session adds: its module (this
 *  semester's only) and the accounts its groups were read or paid through. */
export async function bacaanSesi(
  db: Db,
  sesiId: number,
): Promise<{ modul?: number; akun: string[] }> {
  const [s] = await db
    .select({ modul: sesi.modul, tanggal: sesi.tanggal, jenis: sesi.jenis })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (
    !s ||
    s.jenis === "tot" ||
    semesterDariTanggal(s.tanggal) !== semesterDariTanggal(hariIniWib())
  )
    return { akun: [] };
  const [dibaca, dibayar] = await Promise.all([
    db
      .select({ akun: seelabsBaca.akunNim })
      .from(seelabsBaca)
      .where(eq(seelabsBaca.sesiId, sesiId)),
    db
      .select({ akun: sql<string>`coalesce(${unitBayar.nimAkunSeelabs}, ${unitBayar.nimPenilai})` })
      .from(unitBayar)
      .where(eq(unitBayar.sesiId, sesiId)),
  ]);
  return { modul: s.modul, akun: [...new Set([...dibaca, ...dibayar].map((r) => r.akun))] };
}

/** The accounts one press of Periksa Sekarang reads: mine, and every account
 *  my groups of the last 14 days were paid through (a lender's). */
export async function akunUntukPeriksa(db: Db, nim: string): Promise<string[]> {
  const sejak = tambahHari(hariIniWib(), -14);
  const lewat = await db
    .select({ akun: unitBayar.nimAkunSeelabs })
    .from(unitBayar)
    .where(and(eq(unitBayar.nimPenilai, nim), gte(unitBayar.tanggal, sejak)));
  const nims = [nim, ...lewat.map((r) => r.akun).filter((a): a is string => !!a)];
  return akunAktif(db, [...new Set(nims)]);
}

/** Every group's read state for one session, beside IRIS's own values (Penilaian). */
export async function bacaSesi(db: Db, sesiId: number) {
  const [rows, data] = await Promise.all([
    db.select().from(seelabsBaca).where(eq(seelabsBaca.sesiId, sesiId)),
    muatSeelabs(db, sesiId),
  ]);
  return rows.map((r) => {
    const g = data?.kelompok.find((x) => x.nomor === r.kelompokNomor);
    return {
      nomor: r.kelompokNomor,
      status: r.status,
      akunNim: r.akunNim,
      dibacaPada: r.dibacaPada.toISOString(),
      seelabs: r.seelabs,
      iris: Object.fromEntries((g?.baris ?? []).map((b) => [b.nim, nilaiTersimpan(b.skor)])),
      nama: Object.fromEntries((g?.baris ?? []).map((b) => [b.nim, b.nama])),
    };
  });
}

/** My inbox's read-back rows: flagged groups I score, and Rekap BAP flags
 *  where I hold the account or scored a unit. */
export async function bacaku(db: Db, nim: string) {
  const flag = await db.select().from(seelabsBaca).where(ne(seelabsBaca.status, "sama"));
  const sesiIds = [...new Set(flag.map((f) => f.sesiId))];
  const data = (await Promise.all(sesiIds.map((id) => muatSeelabs(db, id)))).filter(
    (d): d is NonNullable<typeof d> => !!d,
  );
  const sesiOf = new Map(data.map((d) => [d.sesi.id, d]));
  const grup = flag
    .filter((f) => sesiOf.has(f.sesiId))
    .map((f) => {
      const d = sesiOf.get(f.sesiId)!;
      return {
        sesiId: f.sesiId,
        kelompokNomor: f.kelompokNomor,
        modul: d.sesi.modul,
        tanggal: d.sesi.tanggal,
        status: f.status,
        dibacaPada: f.dibacaPada.toISOString(),
        penilai: d.kelompok.find((g) => g.nomor === f.kelompokNomor)?.penilai ?? null,
      };
    });
  const bap = await db
    .select()
    .from(seelabsBapBeda)
    .where(or(eq(seelabsBapBeda.akunNim, nim), sql`${nim} = any(${seelabsBapBeda.penilai})`));
  return {
    beda: bacakuUntuk(grup, nim),
    bap: bap.map((b) => ({ ...b, dibacaPada: b.dibacaPada.toISOString() })),
  };
}

/** Bayar's Admin cards: every Rekap BAP flag and every unplaced SeeLabs score. */
export async function bacaAdmin(db: Db) {
  const [bap, lepas] = await Promise.all([
    db.select().from(seelabsBapBeda),
    db.select().from(seelabsLepas),
  ]);
  return {
    bedaBap: bap.map((b) => ({ ...b, dibacaPada: b.dibacaPada.toISOString() })),
    lepas: lepas.map((l) => ({ ...l, dibacaPada: l.dibacaPada.toISOString() })),
  };
}
