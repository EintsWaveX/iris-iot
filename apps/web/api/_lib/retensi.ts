/**
 * Data retention (2026-10-10, src/lib/retensi.ts): everything dated before a
 * cut-off is deleted, the whole semester at once. GET/POST
 * /api/session/retensi.
 *
 * - Automatic: on the first sign-in check of a new semester (handleMe calls
 *   jalankanOtomatis), everything before that semester's first day goes.
 *   One run per semester, held by an advisory lock and `pengaturan.retensi`.
 * - By hand: the Admin tier may delete a finished semester (the current
 *   one included) before the turnover, typing its name to confirm. Refused
 *   while a session runs.
 *
 * What goes: sessions and all that hangs off them (attendance, answers,
 * hints, scores, feedback, captures, serial lines, pay units, events),
 * sign-in attempts, the schedule and its rosters, the Praktikan list,
 * uang kas rates, transfers, written reports with their files, the audit
 * log, closed role history, Konsol Pi records, Pi commands, heartbeats and
 * devices, and Phase 13's TP records (pointers, scores, typed answers,
 * extensions, the files in R2). What stays: the Asisten accounts, the groups' names, module
 * content and settings, and the Lab Profile on Home (api/_lib/profil.ts). The newest uang kas rate is carried into the next
 * semester so pay keeps its rate.
 */
import { del } from "@vercel/blob";
import { and, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { PRAKTIKAN_TOT } from "../../src/lib/tot.js";
import { hapusAwalan } from "./tp-simpan.js";
import { awalanSemester } from "../../src/lib/tp-r2.js";
import {
  retensiPada,
  semesterSebelum,
  semesterSelesai,
  urutSemester,
} from "../../src/lib/retensi.js";
import {
  anggota,
  asisten,
  audit,
  denyut,
  jabatanPemegang,
  jadwal,
  jawaban,
  jurnalTangkapan,
  kasPengecualian,
  kasTarif,
  konsolPi,
  laporan,
  laporanLampiran,
  pengaturan,
  percobaanMasuk,
  perangkat,
  perintah,
  petunjukMinta,
  praktikan,
  rosterKelompok,
  rosterSlot,
  serahTerima,
  sesi,
  sesiAnggota,
  telemetriLog,
  telemetriTerkini,
  tpKiriman,
  tpJejak,
  tpUnggah,
  tpNilai,
  tpPerpanjang,
  transfer,
} from "../../src/lib/schema.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const KUNCI = "retensi";
/** Any constant: one deletion at a time across every function instance */
const KUNCI_LOCK = 270_2026;

export interface CatatanRetensi {
  /** Everything dated before this day was deleted */
  batas: string;
  pada: string;
  oleh: string;
  otomatis: boolean;
  hitung: Record<string, number>;
}

// ---------- Deletion ----------
// ---------- Deletion ----------
// ---------- Deletion ----------

/** Deletes everything dated before `batas` (ISO date) in one transaction */
export async function hapusSebelum(batas: string): Promise<Record<string, number>> {
  const lampiran: string[] = [];
  const semesterLama: string[] = [];
  const hitung = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_LOCK})`);
    const n: Record<string, number> = {};
    const kena = async (nama: string, q: Promise<unknown[]>) => {
      n[nama] = (await q).length;
    };
    const waktu = new Date(`${batas}T00:00:00+07:00`);

    // Sessions first: their attendance, answers, scores, feedback, captures,
    // pay units and events go with them (ON DELETE CASCADE).
    await kena("sesi", tx.delete(sesi).where(lt(sesi.tanggal, batas)).returning({ id: sesi.id }));
    // Work done outside a session (home practice) and orphaned telemetry.
    await kena(
      "jawaban",
      tx
        .delete(jawaban)
        .where(and(isNull(jawaban.sesiId), lt(jawaban.diubahPada, waktu)))
        .returning({ id: jawaban.id }),
    );
    await kena(
      "petunjuk",
      tx
        .delete(petunjukMinta)
        .where(and(isNull(petunjukMinta.sesiId), lt(petunjukMinta.dimintaPada, waktu)))
        .returning({ id: petunjukMinta.id }),
    );
    await kena(
      "tangkapan",
      tx
        .delete(jurnalTangkapan)
        .where(and(isNull(jurnalTangkapan.sesiId), lt(jurnalTangkapan.dibuatPada, waktu)))
        .returning({ id: jurnalTangkapan.id }),
    );
    await kena(
      "telemetri",
      tx
        .delete(telemetriLog)
        .where(lt(telemetriLog.dicatatPada, waktu))
        .returning({ id: telemetriLog.id }),
    );
    await kena(
      "telemetriTerkini",
      tx
        .delete(telemetriTerkini)
        .where(lt(telemetriTerkini.diperbaruiPada, waktu))
        .returning({ id: telemetriTerkini.id }),
    );
    await kena(
      "percobaanMasuk",
      tx
        .delete(percobaanMasuk)
        .where(lt(percobaanMasuk.pada, waktu))
        .returning({ id: percobaanMasuk.id }),
    );

    // Everything kept per semester: the schedule (its izin and assignments
    // cascade), the slot rosters, the Praktikan list and the kas rates.
    const kunci = await kunciSemester(tx);
    const lama = semesterSebelum(kunci, batas);
    semesterLama.push(...lama);
    if (lama.length) {
      await bawaTarifKas(tx, lama, batas);
      await kena(
        "jadwal",
        tx.delete(jadwal).where(inArray(jadwal.semester, lama)).returning({ id: jadwal.id }),
      );
      await kena(
        "rosterSlot",
        tx
          .delete(rosterSlot)
          .where(inArray(rosterSlot.semester, lama))
          .returning({ id: rosterSlot.id }),
      );
      await kena(
        "rosterKelompok",
        tx
          .delete(rosterKelompok)
          .where(inArray(rosterKelompok.semester, lama))
          .returning({ id: rosterKelompok.id }),
      );
      // Phase 13: TP pointers, scores, typed answers, extensions and the
      // uploads' rows (their files in R2 go below; the server PC drops its
      // copies when the semester is gone from its list).
      for (const [nama, t] of [
        ["tpKiriman", tpKiriman],
        ["tpJejak", tpJejak],
        ["tpNilai", tpNilai],
        ["tpPerpanjang", tpPerpanjang],
        ["tpUnggah", tpUnggah],
      ] as const)
        await kena(nama, tx.delete(t).where(inArray(t.semester, lama)).returning({ id: t.id }));
      await kena(
        "praktikan",
        tx
          .delete(praktikan)
          .where(inArray(praktikan.semester, lama))
          .returning({ nim: praktikan.nim }),
      );
      await kena(
        "kasTarif",
        tx.delete(kasTarif).where(inArray(kasTarif.semester, lama)).returning({ id: kasTarif.id }),
      );
      await kena(
        "kasPengecualian",
        tx
          .delete(kasPengecualian)
          .where(inArray(kasPengecualian.semester, lama))
          .returning({ id: kasPengecualian.id }),
      );
    }

    // The live group roster keeps only people of a session or list still
    // here, and Mode TOT's dummies (they are not anyone's data).
    const masih = sql`(select nim from ${praktikan} union select nim from ${sesiAnggota})`;
    await kena(
      "anggota",
      tx
        .delete(anggota)
        .where(
          and(
            sql`${anggota.nim} not in ${masih}`,
            notInArray(
              anggota.nim,
              PRAKTIKAN_TOT.map((p) => p.nim),
            ),
          ),
        )
        .returning({ id: anggota.id }),
    );

    // Pay transfers by month, written reports (their files after commit).
    await kena(
      "transfer",
      tx
        .delete(transfer)
        .where(lt(transfer.periode, batas.slice(0, 7)))
        .returning({ id: transfer.id }),
    );
    const lap = await tx
      .select({ id: laporan.id })
      .from(laporan)
      .where(lt(laporan.dibuatPada, waktu));
    if (lap.length) {
      const ids = lap.map((r) => r.id);
      const berkas = await tx
        .select({ url: laporanLampiran.url })
        .from(laporanLampiran)
        .where(inArray(laporanLampiran.laporanId, ids));
      lampiran.push(...berkas.map((b) => b.url));
      await kena(
        "laporan",
        tx.delete(laporan).where(inArray(laporan.id, ids)).returning({ id: laporan.id }),
      );
    }

    // Logs: the audit trail, closed role history, consoles, the Pi's side.
    await kena("audit", tx.delete(audit).where(lt(audit.pada, waktu)).returning({ id: audit.id }));
    await kena(
      "jabatan",
      tx
        .delete(jabatanPemegang)
        .where(lt(jabatanPemegang.selesai, waktu))
        .returning({ id: jabatanPemegang.id }),
    );
    await kena(
      "serahTerima",
      tx
        .delete(serahTerima)
        .where(and(ne(serahTerima.status, "menunggu"), lt(serahTerima.dibuatPada, waktu)))
        .returning({ id: serahTerima.id }),
    );
    await kena(
      "konsol",
      tx
        .delete(konsolPi)
        .where(
          and(
            lt(konsolPi.dimintaPada, waktu),
            notInArray(konsolPi.status, ["diminta", "disetujui", "aktif"]),
          ),
        )
        .returning({ id: konsolPi.id }),
    );
    await kena(
      "perintah",
      tx
        .delete(perintah)
        .where(
          and(
            lt(perintah.dimintaPada, waktu),
            notInArray(perintah.status, ["menunggu", "terkirim"]),
          ),
        )
        .returning({ id: perintah.id }),
    );
    await kena(
      "denyut",
      tx.delete(denyut).where(lt(denyut.pada, waktu)).returning({ id: denyut.id }),
    );
    await kena(
      "perangkat",
      tx
        .delete(perangkat)
        .where(lt(perangkat.terakhirTerlihat, waktu))
        .returning({ id: perangkat.id }),
    );
    return n;
  });

  // Report files live in Blob storage, outside the transaction. A file that
  // will not delete is left for the next run to retry; the rows are gone.
  for (const url of lampiran) {
    try {
      await del(url);
    } catch (e) {
      console.warn("[WARN] retensi: lampiran tetap ada", url, e);
    }
  }
  hitung.berkas = lampiran.length;
  // TP files (2026-10-21) live in R2: a whole semester at once.
  hitung.berkasTp = 0;
  for (const s of semesterLama) {
    try {
      hitung.berkasTp += await hapusAwalan(awalanSemester(s));
    } catch (e) {
      console.warn("[WARN] retensi: berkas TP tetap ada", s, e);
    }
  }
  return hitung;
}

/** Every semester key the per-semester tables hold */
async function kunciSemester(tx: Tx): Promise<string[]> {
  const rows = await tx.execute<{ semester: string }>(sql`
    select semester from ${jadwal} union select semester from ${praktikan}
    union select semester from ${rosterSlot} union select semester from ${rosterKelompok}
    union select semester from ${kasTarif} union select semester from ${kasPengecualian}`);
  return (rows.rows ?? (rows as unknown as { semester: string }[])).map((r) => r.semester);
}

/** Keeps the newest kas rate alive when its semester is deleted and the
 *  next one has none of its own yet (pay falls back to the newest rate). */
async function bawaTarifKas(tx: Tx, lama: string[], batas: string): Promise<void> {
  const semua = await tx.select().from(kasTarif);
  const sisa = semua.filter((t) => !lama.includes(t.semester));
  if (sisa.length) return;
  const terakhir = semua
    .filter((t) => lama.includes(t.semester))
    .sort(
      (a, b) =>
        urutSemester(a.semester, b.semester) || a.berlakuMulai.localeCompare(b.berlakuMulai),
    )
    .at(-1);
  if (!terakhir) return;
  await tx.insert(kasTarif).values({
    semester: semesterDariTanggal(batas),
    persen: terakhir.persen,
    berlakuMulai: batas,
    diubahOleh: terakhir.diubahOleh,
    alasan: "Dibawa dari semester sebelumnya saat datanya dihapus",
  });
}

// ---------- Records ----------
// ---------- Records ----------
// ---------- Records ----------

async function bacaCatatan(): Promise<CatatanRetensi | null> {
  const [r] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI))
    .limit(1);
  const v = r?.nilai as CatatanRetensi | undefined;
  return v && typeof v.batas === "string" ? v : null;
}

async function tulisCatatan(c: CatatanRetensi): Promise<void> {
  await getDb()
    .insert(pengaturan)
    .values({ kunci: KUNCI, nilai: c, diubahOleh: c.otomatis ? null : c.oleh })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: c, diubahOleh: c.otomatis ? null : c.oleh, diubahPada: new Date() },
    });
}

// ---------- Automatic ----------
// ---------- Automatic ----------
// ---------- Automatic ----------

/** The cut-off this function instance already saw done */
let sudah: string | null = null;

/** Runs the semester turnover once; cheap after the first call. Never throws. */
export async function jalankanOtomatis(): Promise<void> {
  const { batas } = retensiPada(hariIniWib());
  if (sudah === batas) return;
  try {
    const c = await bacaCatatan();
    if (c && c.batas >= batas) {
      sudah = batas;
      return;
    }
    const hitung = await hapusSebelum(batas);
    await tulisCatatan({
      batas,
      pada: new Date().toISOString(),
      oleh: "sistem",
      otomatis: true,
      hitung,
    });
    await writeAudit("sistem", "retensi_otomatis", { batas, hitung });
    console.warn(`[INFO] retensi: data sebelum ${batas} dihapus`, hitung);
    sudah = batas;
  } catch (e) {
    console.error("[ERROR] retensi otomatis gagal", e);
  }
}

// ---------- Handlers ----------
// ---------- Handlers ----------
// ---------- Handlers ----------

/** Whether this person may delete by hand: the Admin tier or the Pencipta */
async function bolehHapus(nim: string): Promise<boolean> {
  const [o] = await getDb()
    .select({ tier: asisten.tier, badges: asisten.badges })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  return Boolean(o && (o.tier === "admin" || o.badges.includes("pencipta")));
}

/** The semesters that still hold records, oldest first */
async function semesterAda(): Promise<string[]> {
  const db = getDb();
  const kunci = await db.transaction((tx) => kunciSemester(tx));
  const tgl = await db.execute<{ t: string }>(
    sql`select distinct ${sesi.tanggal} as t from ${sesi}`,
  );
  const dariSesi = (tgl.rows ?? (tgl as unknown as { t: string }[])).map((r) =>
    semesterDariTanggal(r.t),
  );
  return [...new Set([...kunci, ...dariSesi])].sort(urutSemester);
}

/** GET /api/session/retensi: the rule, the last run and what is held now */
export async function handleRetensiGet(
  _req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const r = retensiPada(hariIniWib());
  res.status(200).json({
    ok: true,
    ...r,
    terakhir: await bacaCatatan(),
    semester: await semesterAda(),
    sekarang: r.semester,
    boleh: await bolehHapus(session.nim),
  });
}

/** POST /api/session/retensi { semester, konfirmasi }: deletes that semester
 *  and everything before it. `konfirmasi` must repeat the semester key. */
export async function handleRetensiPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  if (!(await bolehHapus(session.nim))) {
    res.status(403).json({ ok: false, kode: "tidak_berhak" });
    return;
  }
  const body = jsonBody(req);
  const semester = typeof body.semester === "string" ? body.semester : "";
  if (!/^\d{4}-(ganjil|genap)$/.test(semester) || body.konfirmasi !== semester) {
    res.status(200).json({ ok: false, kode: "konfirmasi_salah" });
    return;
  }
  const { semester: kini } = retensiPada(hariIniWib());
  if (urutSemester(semester, kini) > 0) {
    res.status(200).json({ ok: false, kode: "semester_mendatang" });
    return;
  }
  const [jalan] = await getDb()
    .select({ id: sesi.id })
    .from(sesi)
    .where(eq(sesi.status, "berjalan"))
    .limit(1);
  if (jalan) {
    res.status(200).json({ ok: false, kode: "sesi_berjalan" });
    return;
  }
  const batas = semesterSelesai(semester);
  const hitung = await hapusSebelum(batas);
  const c: CatatanRetensi = {
    batas,
    pada: new Date().toISOString(),
    oleh: session.nim,
    otomatis: false,
    hitung,
  };
  await tulisCatatan(c);
  await writeAudit(session.nim, "retensi_manual", { semester, batas, hitung });
  res.status(200).json({ ok: true, ...c });
}
