/**
 * Payments (Phase 9 Stage 6), behind /api/session/bayar.
 *
 * GET  ?semester=2026-ganjil  everyone: their own units per month, what was
 *      transferred to and from them, the rates. With the Tim right also the
 *      whole ledger, the transfers still to make and the uang kas card.
 * POST { aksi: "tandai", periode, jenis, nim, jumlah }   mark a transfer done
 *      { aksi: "batal", id }                            undo a mark
 *      { aksi: "tarif", reguler, internasional }        unit rates
 *      { aksi: "potongan", perMenit, maks }             late cut per minute and its cap
 *      { aksi: "kas", persen, berlakuMulai, alasan }    a new uang kas rate
 *      { aksi: "pengecualian", nim, persen, alasan }    a per-person rate
 *      { aksi: "hapus_pengecualian", nim }
 *      every POST needs the Tim right and writes the audit log.
 *
 * Units are rebuilt from finished sessions here, lazily: a session whose
 * scores, pairing, SeeLabs lender or sent groups changed after its last
 * rebuild gets rebuilt on the next GET (a few per request). Only a group
 * whose scores were sent (Kirim Nilai) earns a unit. A unit keeps the class rate
 * and the kas rate it was made with.
 *
 * Attendance (Phase 18): a person marked Mangkir (or a Mangkir Mengajar the
 * PJ left counted) earns no unit for that session, and each Telat is a cut
 * line (Potongan Telat) off that person's month. Only finished, non-TOT
 * sessions count.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { cekHak, muatOrang } from "./hak.js";
import { muatSeelabs } from "./seelabs.js";
import {
  kunciDariSesi,
  muatPotongan,
  statusOrang,
  uraiKunci,
  type BarisHadir,
} from "./hadir-mengajar.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  hadirMengajar,
  jabatanPemegang,
  kasPengecualian,
  kasTarif,
  nilaiKirim,
  pengaturan,
  sesi,
  transfer,
  unitBayar,
} from "../../src/lib/schema.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { boleh } from "../../src/lib/hak.js";
import { bacaPotongan, riwayatBaru, type StatusHadir } from "../../src/lib/hadir-mengajar.js";
import { writeAudit } from "../../src/lib/auth.js";
import { bacaAdmin } from "./seelabs-baca.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import {
  bacaTarifUnit,
  kasPersenValid,
  persenUntuk,
  pisah,
  sisaTransfer,
  type BarisTarif,
  type PotonganBaris,
  type TarifUnit,
} from "../../src/lib/bayar.js";

type Db = ReturnType<typeof getDb>;
const SINKRON_PER_PERMINTAAN = 25;
const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIODE_RE = /^\d{4}-\d{2}$/;
const SEMESTER_RE = /^\d{4}-(ganjil|genap)$/;

/** The first and last date of a semester ("2026-ganjil" is Aug to Jan). */
export function rentangSemester(semester: string): [string, string] {
  const [y, s] = semester.split("-");
  const n = Number(y);
  return s === "ganjil" ? [`${n}-08-01`, `${n + 1}-01-31`] : [`${n}-02-01`, `${n}-07-31`];
}

async function muatTarifUnit(db: Db): Promise<TarifUnit> {
  const [r] = await db.select().from(pengaturan).where(eq(pengaturan.kunci, "tarif_unit")).limit(1);
  return bacaTarifUnit(r?.nilai);
}

async function muatKas(db: Db) {
  const tarif = await db
    .select()
    .from(kasTarif)
    .orderBy(asc(kasTarif.berlakuMulai), asc(kasTarif.id));
  const kecuali = await db.select().from(kasPengecualian);
  return { tarif, kecuali };
}

/** Everyone's attendance standing in a session; none when it has no slot key (TOT, odd data). */
async function hadirSesi(
  db: Db,
  s: { id: number; tanggal: string; slot: number | null; jenis: string | null },
): Promise<{ kunci: string | null; rows: BarisHadir[] }> {
  const kunci = await kunciDariSesi(db, s);
  return { kunci, rows: kunci ? await statusOrang(db, kunci, new Date()) : [] };
}

/** Rebuilds one finished session's units from who scored which group. */
export async function sinkronUnit(
  db: Db,
  sesiId: number,
  ctx?: { tarifUnit: TarifUnit; kas: Awaited<ReturnType<typeof muatKas>> },
): Promise<void> {
  const data = await muatSeelabs(db, sesiId);
  const [s] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!data || !s) return;
  // Mode TOT: practice runs earn nothing.
  if (s.jenis === "tot") {
    await db.delete(unitBayar).where(eq(unitBayar.sesiId, sesiId));
    return;
  }
  const tarifUnit = ctx?.tarifUnit ?? (await muatTarifUnit(db));
  const kas = ctx?.kas ?? (await muatKas(db));
  const semester = semesterDariTanggal(s.tanggal);
  const ada = new Map(
    (await db.select().from(unitBayar).where(eq(unitBayar.sesiId, sesiId))).map((u) => [
      u.kelompokNomor,
      u,
    ]),
  );
  // A group earns its unit once its scores are sent (Kirim Nilai,
  // 2026-10-09), not at the first score typed.
  const terkirim = new Set(
    (
      await db
        .select({ nomor: nilaiKirim.kelompokNomor })
        .from(nilaiKirim)
        .where(eq(nilaiKirim.sesiId, sesiId))
    ).map((r) => r.nomor),
  );
  // Mangkir zeroes the person's units for this session (2026-10-16).
  const hadir =
    s.status === "selesai" ? await hadirSesi(db, s) : { kunci: null, rows: [] as BarisHadir[] };
  const nol = new Set(hadir.rows.filter((h) => h.nolkanUnit).map((h) => h.nim));
  const hilang = new Map<string, number>();
  const tetap = new Set<number>();
  for (const g of data.kelompok) {
    if (s.status !== "selesai" || !g.penilai || !terkirim.has(g.nomor)) continue;
    if (nol.has(g.penilai)) {
      hilang.set(g.penilai, (hilang.get(g.penilai) ?? 0) + 1);
      continue;
    }
    tetap.add(g.nomor);
    const lama = ada.get(g.nomor);
    if (lama && lama.nimPenilai === g.penilai) {
      if (lama.nimAkunSeelabs !== g.akun)
        await db
          .update(unitBayar)
          .set({ nimAkunSeelabs: g.akun, diperbaruiPada: new Date() })
          .where(eq(unitBayar.id, lama.id));
      continue;
    }
    // New, or the group now belongs to someone else: their own kas rate,
    // the class rate the unit was first made with (or today's).
    const kotor = lama?.kotor ?? tarifUnit[s.kelas];
    const persen = persenUntuk(g.penilai, semester, s.tanggal, kas.tarif, kas.kecuali);
    const p = pisah(kotor, persen);
    const nilaiBaru = {
      nimPenilai: g.penilai,
      nimAkunSeelabs: g.akun,
      kelas: s.kelas,
      tanggal: s.tanggal,
      kotor: p.kotor,
      kasPersen: persen,
      kas: p.kas,
      bersih: p.bersih,
      diperbaruiPada: new Date(),
    };
    if (lama) await db.update(unitBayar).set(nilaiBaru).where(eq(unitBayar.id, lama.id));
    else await db.insert(unitBayar).values({ sesiId, kelompokNomor: g.nomor, ...nilaiBaru });
  }
  const buang = [...ada.values()].filter((u) => !tetap.has(u.kelompokNomor)).map((u) => u.id);
  if (buang.length) await db.delete(unitBayar).where(inArray(unitBayar.id, buang));
  await simpanPotongan(db, s, hadir, hilang);
  await db.update(sesi).set({ bayarSinkronPada: new Date() }).where(eq(sesi.id, sesiId));
}

/**
 * Writes what each person's status cost onto their attendance row, with the
 * rate used, so a later rate change leaves a settled session alone and the
 * Bayar page reads cut lines from one table. `diubahPada` is left as it is:
 * this is a result of the rebuild, not a change that should trigger another.
 */
async function simpanPotongan(
  db: Db,
  s: { id: number; tanggal: string },
  hadir: { kunci: string | null; rows: BarisHadir[] },
  hilang: Map<string, number>,
) {
  if (!hadir.kunci) return;
  const tarif = await muatPotongan(db, s.tanggal);
  const k = uraiKunci(hadir.kunci);
  for (const h of hadir.rows) {
    const catat = {
      potongTercatat: h.potong,
      nolkanTercatat: h.nolkanUnit,
      unitHilang: hilang.get(h.nim) ?? 0,
      tarifTercatat: tarif,
    };
    await db
      .insert(hadirMengajar)
      .values({
        kunci: hadir.kunci,
        tanggal: s.tanggal,
        jadwalId: k?.jenis === "j" ? k.jadwalId : null,
        sesiId: s.id,
        nim: h.nim,
        diharapkan: h.diharapkan,
        ...catat,
      })
      .onConflictDoUpdate({
        target: [hadirMengajar.kunci, hadirMengajar.nim],
        set: { sesiId: s.id, ...catat },
      });
  }
}

/** Rebuilds the finished sessions of a date range whose inputs changed. */
async function sinkronYangBerubah(db: Db, dari: string, sampai: string) {
  const rows = await db.execute(sql`
    select s.id from sesi s
    where s.status = 'selesai' and s.jenis <> 'tot' and s.tanggal between ${dari} and ${sampai}
      and (
        s.bayar_sinkron_pada is null
        or s.bayar_sinkron_pada < greatest(
          s.selesai_pada,
          (select max(n.diubah_pada) from nilai n where n.sesi_id = s.id),
          (select max(a.diubah_pada) from sesi_asisten a where a.sesi_id = s.id),
          (select max(h.diubah_pada) from hadir_mengajar h where h.sesi_id = s.id),
          (select max(k.pada) from sesi_kejadian k where k.sesi_id = s.id
            and k.jenis in ('akun_seelabs', 'jam_geser', 'hadir_status', 'hadir_izin', 'hadir_tandai')),
          (select max(x.dikirim_pada) from nilai_kirim x where x.sesi_id = s.id)
        )
      )
    order by s.tanggal
    limit ${SINKRON_PER_PERMINTAAN}`);
  const ids = (rows.rows as { id: number }[]).map((r) => Number(r.id));
  if (!ids.length) return 0;
  const ctx = { tarifUnit: await muatTarifUnit(db), kas: await muatKas(db) };
  for (const id of ids) await sinkronUnit(db, id, ctx);
  return ids.length;
}

export interface PotonganSesi extends PotonganBaris {
  sesiId: number;
  slot: number | null;
  nim: string;
  menit: number | null;
  status: StatusHadir;
  /** True when the person's units for the session were set to zero. */
  nolkan: boolean;
  /** Groups that would have earned a unit, and what they were worth at today's unit rate. */
  unitHilang: number;
  hilang: number;
}

/**
 * The cut lines of a semester, read from what the last rebuild stored on the
 * attendance rows: a Telat (or an uncounted Mangkir Mengajar) is money off,
 * a Mangkir or counted Mangkir Mengajar is a zeroed session (`jumlah` 0,
 * `nolkan`). Finished non-TOT sessions only.
 */
export async function potonganSemester(
  db: Db,
  dari: string,
  sampai: string,
  tarifUnit: TarifUnit,
  nimSaja?: string,
): Promise<PotonganSesi[]> {
  const rows = await db
    .select({
      sesiId: hadirMengajar.sesiId,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      kelas: sesi.kelas,
      nim: hadirMengajar.nim,
      potong: hadirMengajar.potongTercatat,
      nolkan: hadirMengajar.nolkanTercatat,
      hilang: hadirMengajar.unitHilang,
      tarif: hadirMengajar.tarifTercatat,
      hitungMangkir: hadirMengajar.hitungMangkir,
      ubah: hadirMengajar.ubahStatus,
      hadirPada: hadirMengajar.hadirPada,
    })
    .from(hadirMengajar)
    .innerJoin(sesi, eq(sesi.id, hadirMengajar.sesiId))
    .where(
      and(
        eq(sesi.status, "selesai"),
        ne(sesi.jenis, "tot"),
        gte(sesi.tanggal, dari),
        lte(sesi.tanggal, sampai),
        or(eq(hadirMengajar.nolkanTercatat, true), gt(hadirMengajar.potongTercatat, 0)),
        nimSaja ? eq(hadirMengajar.nim, nimSaja) : undefined,
      ),
    )
    .orderBy(desc(sesi.tanggal), asc(hadirMengajar.nim));
  return rows.map((r) => {
    const nolkan = r.nolkan === true;
    const tarif = bacaPotongan(r.tarif);
    const potong = nolkan ? 0 : (r.potong ?? 0);
    // A counted Mangkir Mengajar zeroes the units, an uncounted one pays the capped cut.
    const mm = nolkan
      ? r.ubah === "mm" || (r.ubah === null && r.hadirPada !== null)
      : r.hitungMangkir === false;
    return {
      sesiId: r.sesiId as number,
      tanggal: r.tanggal,
      slot: r.slot,
      nim: r.nim,
      jumlah: potong,
      menit: nolkan
        ? null
        : mm
          ? tarif.maks
          : tarif.perMenit > 0
            ? Math.round(potong / tarif.perMenit)
            : null,
      status: (nolkan ? (mm ? "mm" : "mangkir") : mm ? "mm" : "telat") as StatusHadir,
      nolkan,
      unitHilang: r.hilang ?? 0,
      hilang: (r.hilang ?? 0) * tarifUnit[r.kelas],
    };
  });
}

async function bendahara(db: Db): Promise<string | null> {
  const [r] = await db
    .select({ nim: jabatanPemegang.nim })
    .from(jabatanPemegang)
    .where(and(eq(jabatanPemegang.kategori, "bendahara"), isNull(jabatanPemegang.selesai)))
    .limit(1);
  return r?.nim ?? null;
}

export async function handleBayarGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  const q = String(req.query.semester ?? "");
  const hari = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const semester = SEMESTER_RE.test(q) ? q : semesterDariTanggal(hari);
  const [dari, sampai] = rentangSemester(semester);
  const tersinkron = await sinkronYangBerubah(db, dari, sampai);

  const orang = await muatOrang(session.nim);
  const admin = !!orang && boleh(orang, "tim");
  const units = await db
    .select({
      id: unitBayar.id,
      sesiId: unitBayar.sesiId,
      kelompokNomor: unitBayar.kelompokNomor,
      tanggal: unitBayar.tanggal,
      nimPenilai: unitBayar.nimPenilai,
      nimAkunSeelabs: unitBayar.nimAkunSeelabs,
      kelas: unitBayar.kelas,
      kotor: unitBayar.kotor,
      kasPersen: unitBayar.kasPersen,
      kas: unitBayar.kas,
      bersih: unitBayar.bersih,
      modul: sesi.modul,
      slot: sesi.slot,
    })
    .from(unitBayar)
    .innerJoin(sesi, eq(sesi.id, unitBayar.sesiId))
    .where(
      and(
        gte(unitBayar.tanggal, dari),
        lte(unitBayar.tanggal, sampai),
        admin ? undefined : eq(unitBayar.nimPenilai, session.nim),
      ),
    )
    .orderBy(desc(unitBayar.tanggal), asc(unitBayar.kelompokNomor));
  const periodeAwal = dari.slice(0, 7);
  const periodeAkhir = sampai.slice(0, 7);
  const sudah = await db
    .select()
    .from(transfer)
    .where(
      and(
        gte(transfer.periode, periodeAwal),
        lte(transfer.periode, periodeAkhir),
        admin ? undefined : eq(transfer.nim, session.nim),
      ),
    )
    .orderBy(desc(transfer.ditransferPada));
  const kas = await muatKas(db);
  const tarifUnit = await muatTarifUnit(db);
  const persenSekarang = persenUntuk(
    session.nim,
    semester,
    hari < dari ? dari : hari,
    kas.tarif,
    kas.kecuali,
  );
  const tarifSemester = kas.tarif.filter((t) => t.semester === semester);
  const nimBendahara = await bendahara(db);
  const tarifPotongan = await muatPotongan(db);
  const potongan = await potonganSemester(
    db,
    dari,
    sampai,
    tarifUnit,
    admin ? undefined : session.nim,
  );

  res.status(200).json({
    ok: true,
    semester,
    tersinkron,
    admin,
    bendahara: nimBendahara,
    tarifUnit,
    tarifPotongan,
    potongan,
    kas: {
      persen: (tarifSemester.at(-1) ?? kas.tarif.at(-1))?.persen ?? 10,
      persenSaya: persenSekarang,
      riwayat: tarifSemester.map((t) => ({
        id: t.id,
        persen: t.persen,
        berlakuMulai: t.berlakuMulai,
        oleh: t.diubahOleh,
        alasan: t.alasan,
      })),
      pengecualian: kas.kecuali
        .filter((e) => e.semester === semester && (admin || e.nim === session.nim))
        .map((e) => ({ nim: e.nim, persen: e.persen, alasan: e.alasan })),
    },
    units,
    transfer: sudah.map((t) => ({
      id: t.id,
      periode: t.periode,
      jenis: t.jenis,
      nim: t.nim,
      jumlah: t.jumlah,
      pada: t.ditransferPada,
      oleh: t.ditandaiOleh,
    })),
    // The SeeLabs read-back's cards (2026-10-17): Admins only.
    ...(admin ? await bacaAdmin(db) : {}),
    sisa: sisaTransfer(
      units as Parameters<typeof sisaTransfer>[0],
      sudah.map((t) => ({ periode: t.periode, jenis: t.jenis, nim: t.nim, jumlah: t.jumlah })),
      nimBendahara,
      potongan.filter((c) => !c.nolkan),
    ),
  });
}

const posInt = (v: unknown, maks: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= maks ? n : null;
};
const teks = (v: unknown, maks = 200) => (typeof v === "string" ? v.trim().slice(0, maks) : "");

export async function handleBayarPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  if (!(await cekHak(res, session.nim, "tim"))) return;
  const body = jsonBody(req);
  const db = getDb();
  const salah = () => res.status(200).json({ ok: false, kode: "format_salah" });

  if (body.aksi === "tandai") {
    const periode = String(body.periode ?? "");
    const jenis = body.jenis;
    const nim = teks(body.nim, 20);
    const jumlah = posInt(body.jumlah, 100_000_000);
    if (!PERIODE_RE.test(periode) || (jenis !== "kotor" && jenis !== "balik") || !nim || !jumlah)
      return salah();
    const [o] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    if (!o) return res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    const [row] = await db
      .insert(transfer)
      .values({ periode, jenis, nim, jumlah, ditandaiOleh: session.nim })
      .returning({ id: transfer.id });
    await writeAudit(session.nim, "transfer_tandai", { id: row.id, periode, jenis, nim, jumlah });
    return res.status(200).json({ ok: true, id: row.id });
  }

  if (body.aksi === "batal") {
    const id = posInt(body.id, 2 ** 31 - 1);
    if (!id) return salah();
    const [row] = await db.delete(transfer).where(eq(transfer.id, id)).returning();
    if (!row) return res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    await writeAudit(session.nim, "transfer_batal", { ...row });
    return res.status(200).json({ ok: true });
  }

  if (body.aksi === "tarif") {
    const reguler = posInt(body.reguler, 10_000_000);
    const internasional = posInt(body.internasional, 10_000_000);
    if (!reguler || !internasional) return salah();
    const nilaiBaru = { reguler, internasional };
    await db
      .insert(pengaturan)
      .values({ kunci: "tarif_unit", nilai: nilaiBaru, diubahOleh: session.nim })
      .onConflictDoUpdate({
        target: pengaturan.kunci,
        set: { nilai: nilaiBaru, diubahOleh: session.nim, diubahPada: new Date() },
      });
    await writeAudit(session.nim, "tarif_unit", nilaiBaru);
    return res.status(200).json({ ok: true });
  }

  if (body.aksi === "potongan") {
    const perMenit = Number(body.perMenit);
    const maks = posInt(body.maks, 30);
    if (!Number.isInteger(perMenit) || perMenit < 0 || perMenit > 100_000 || !maks) return salah();
    // The rate keeps its history: today's change counts for sessions from today on.
    const [lama] = await db
      .select({ nilai: pengaturan.nilai })
      .from(pengaturan)
      .where(eq(pengaturan.kunci, "potongan_telat"))
      .limit(1);
    const hari = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const nilaiBaru = riwayatBaru(lama?.nilai, hari, { perMenit, maks });
    await db
      .insert(pengaturan)
      .values({ kunci: "potongan_telat", nilai: nilaiBaru, diubahOleh: session.nim })
      .onConflictDoUpdate({
        target: pengaturan.kunci,
        set: { nilai: nilaiBaru, diubahOleh: session.nim, diubahPada: new Date() },
      });
    await writeAudit(session.nim, "potongan_tarif", { perMenit, maks, berlakuMulai: hari });
    return res.status(200).json({ ok: true });
  }

  if (body.aksi === "kas") {
    const persen = Number(body.persen);
    const berlakuMulai = String(body.berlakuMulai ?? "");
    if (!kasPersenValid(persen) || !TANGGAL_RE.test(berlakuMulai)) return salah();
    const semester = semesterDariTanggal(berlakuMulai);
    const row: BarisTarif & { alasan: string; diubahOleh: string } = {
      semester,
      persen,
      berlakuMulai,
      alasan: teks(body.alasan),
      diubahOleh: session.nim,
    };
    await db.insert(kasTarif).values(row);
    await writeAudit(session.nim, "kas_tarif", row);
    return res.status(200).json({ ok: true, semester });
  }

  if (body.aksi === "pengecualian") {
    const persen = Number(body.persen);
    const nim = teks(body.nim, 20);
    const semester = String(body.semester ?? "");
    if (!kasPersenValid(persen) || !nim || !SEMESTER_RE.test(semester)) return salah();
    const [o] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    if (!o) return res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    const alasan = teks(body.alasan);
    await db
      .insert(kasPengecualian)
      .values({ semester, nim, persen, alasan, diubahOleh: session.nim })
      .onConflictDoUpdate({
        target: [kasPengecualian.semester, kasPengecualian.nim],
        set: { persen, alasan, diubahOleh: session.nim, dibuatPada: new Date() },
      });
    await writeAudit(session.nim, "kas_pengecualian", { semester, nim, persen, alasan });
    return res.status(200).json({ ok: true });
  }

  if (body.aksi === "hapus_pengecualian") {
    const nim = teks(body.nim, 20);
    const semester = String(body.semester ?? "");
    if (!nim || !SEMESTER_RE.test(semester)) return salah();
    const del = await db
      .delete(kasPengecualian)
      .where(and(eq(kasPengecualian.semester, semester), eq(kasPengecualian.nim, nim)))
      .returning();
    if (!del.length) return res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    await writeAudit(session.nim, "kas_pengecualian_hapus", { semester, nim });
    return res.status(200).json({ ok: true });
  }

  return salah();
}
