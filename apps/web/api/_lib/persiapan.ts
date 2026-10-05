/**
 * Preparation's roster (Phase 9 Stage 3, mockup c-prep), behind
 * /api/session/{rosterslot, praktikan, susulan}:
 *
 * GET  rosterslot?hari=&slot=     a weekly slot's roster: its group count and
 *                                 size, each group's running flag and SeeLabs
 *                                 KLP, and who sits where
 * GET  rosterslot?sesiId=         a Praktikum Susulan draft's roster
 * POST rosterslot { hari, slot | sesiId, jumlahKelompok, anggotaPerKelompok,
 *                   kelompok: [{ nomor, aktif, klp }], anggota: [{ nim, nomor }] }
 *                                 replaces that roster
 * GET  praktikan                  the semester's Praktikan list, each with
 *                                 the slot and group they sit in
 * POST praktikan { rows: [{ nim, nama, kelas }] }
 *                                 adds people (by hand, pasted or from an
 *                                 XLSX read in the browser); existing NIMs and
 *                                 bad rows are skipped and reported
 * GET  susulan                    the open susulan drafts
 * POST susulan { tanggal, mulai, modul, jumlahKelompok }
 *                                 a new draft (status terjadwal)
 * POST susulan { tanggal, mulai, lanjutanDari, kelompok: [nomor] }
 *                                 (c-next) the groups of an ended session
 *                                 that didn't finish carry on: their
 *                                 members, numbered from 1 in the order
 *                                 given, and the module of that session
 *
 * Rosters belong to the slot and are reused every week; a Praktikan sits in
 * one slot per semester. Editing a slot's roster takes the Jadwal right or
 * being on that slot; drafts take the full "pair" right, like starting one.
 */
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang, type OrangHak } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  audit,
  jadwal,
  praktikan,
  rosterKelompok,
  rosterSlot,
  rosterSusulan,
  sesi,
  sesiAnggota,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { boleh, bolehPenuh } from "../../src/lib/hak.js";
import { hariIniWib, KELOMPOK_MAKS } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { isKelas, type Kelas } from "../../src/lib/kelas.js";

export const NIM_PRAKTIKAN_RE = /^\d{10}(\d{2})?$/;
const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

const semesterIni = () => semesterDariTanggal(hariIniWib());

async function slotRow(hari: number, slot: number) {
  const [row] = await getDb()
    .select()
    .from(jadwal)
    .where(and(eq(jadwal.semester, semesterIni()), eq(jadwal.hari, hari), eq(jadwal.slot, slot)))
    .limit(1);
  return row ?? null;
}

function diSlot(o: OrangHak, row: typeof jadwal.$inferSelect): boolean {
  const k = o.kode.toUpperCase();
  return (
    row.asisten.some((x) => x.toUpperCase() === k) ||
    row.pengganti.some((p) => p.kode.toUpperCase() === k)
  );
}

async function draftRow(id: number) {
  const [row] = await getDb().select().from(sesi).where(eq(sesi.id, id)).limit(1);
  return row && row.status === "terjadwal" && row.jenis === "susulan" ? row : null;
}

/* ----------------------------------------------------------- roster GET */

export async function handleRosterSlotGet(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const q = req.query;
  if (q.sesiId != null) {
    const d = await draftRow(Number(q.sesiId));
    if (!d) return tolak(res, "draf_tidak_ada");
    const anggota = await db
      .select({
        nim: rosterSusulan.nim,
        nama: rosterSusulan.nama,
        nomor: rosterSusulan.kelompokNomor,
        urutan: rosterSusulan.urutan,
      })
      .from(rosterSusulan)
      .where(eq(rosterSusulan.sesiId, d.id))
      .orderBy(asc(rosterSusulan.kelompokNomor), asc(rosterSusulan.urutan));
    return res.status(200).json({
      ok: true,
      jumlahKelompok: d.jumlahKelompok,
      anggotaPerKelompok: 4,
      kelompok: [],
      anggota,
    });
  }
  const hari = Number(q.hari);
  const slot = Number(q.slot);
  if (!Number.isInteger(hari) || hari < 1 || hari > 6 || ![1, 2, 3, 4].includes(slot)) {
    return tolak(res, "format_salah");
  }
  const row = await slotRow(hari, slot);
  if (!row) return tolak(res, "slot_tidak_ada");
  const semester = semesterIni();
  const [kelompok, anggota, versi] = await Promise.all([
    db
      .select({
        nomor: rosterKelompok.nomor,
        aktif: rosterKelompok.aktif,
        klp: rosterKelompok.klpSeelabs,
      })
      .from(rosterKelompok)
      .where(
        and(
          eq(rosterKelompok.semester, semester),
          eq(rosterKelompok.hari, hari),
          eq(rosterKelompok.slot, slot),
        ),
      ),
    db
      .select({
        nim: rosterSlot.nim,
        nama: praktikan.nama,
        nomor: rosterSlot.kelompokNomor,
        urutan: rosterSlot.urutan,
      })
      .from(rosterSlot)
      .innerJoin(praktikan, eq(praktikan.nim, rosterSlot.nim))
      .where(
        and(
          eq(rosterSlot.semester, semester),
          eq(rosterSlot.hari, hari),
          eq(rosterSlot.slot, slot),
        ),
      )
      .orderBy(asc(rosterSlot.kelompokNomor), asc(rosterSlot.urutan)),
    versiRoster(db, hari, slot),
  ]);
  res.status(200).json({
    ok: true,
    versi,
    kelas: row.kelas,
    jumlahKelompok: row.jumlahKelompok,
    anggotaPerKelompok: row.anggotaPerKelompok,
    kelompok,
    anggota,
  });
}

/**
 * A slot roster's version: its newest "roster_slot" audit row. The editor
 * sends back the one it loaded; a newer one means someone saved after it
 * opened, and the save stops with `versi_berubah` (the 409 view).
 */
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
async function versiRoster(db: Db | Tx, hari: number, slot: number) {
  const [v] = await db
    .select({ pada: audit.pada, nim: audit.aktorNim, nama: asisten.nama, kode: asisten.kode })
    .from(audit)
    .leftJoin(asisten, eq(asisten.nim, audit.aktorNim))
    .where(
      and(
        eq(audit.aksi, "roster_slot"),
        sql`(${audit.detail})::jsonb->>'hari' = ${String(hari)}`,
        sql`(${audit.detail})::jsonb->>'slot' = ${String(slot)}`,
      ),
    )
    .orderBy(desc(audit.pada), desc(audit.id))
    .limit(1);
  return v ? { pada: v.pada.toISOString(), nim: v.nim, nama: v.nama, kode: v.kode } : null;
}

/* ---------------------------------------------------------- roster POST */

interface Isian {
  jumlahKelompok: number;
  anggotaPerKelompok: number;
  kelompok: { nomor: number; aktif: boolean; klp: string | null }[];
  anggota: { nim: string; nomor: number }[];
}

function bacaIsian(body: Record<string, unknown>): Isian | null {
  const jumlah = Number(body.jumlahKelompok);
  const per = Number(body.anggotaPerKelompok);
  if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > KELOMPOK_MAKS) return null;
  if (!Number.isInteger(per) || per < 1 || per > 8) return null;
  if (!Array.isArray(body.anggota) || !Array.isArray(body.kelompok ?? [])) return null;
  const anggota: Isian["anggota"] = [];
  const seen = new Set<string>();
  for (const a of body.anggota as unknown[]) {
    const x = a as { nim?: unknown; nomor?: unknown };
    const nim = typeof x.nim === "string" ? x.nim : "";
    const nomor = Number(x.nomor);
    if (!/^\d{5,15}$/.test(nim) || seen.has(nim)) return null;
    if (!Number.isInteger(nomor) || nomor < 1 || nomor > jumlah) return null;
    seen.add(nim);
    anggota.push({ nim, nomor });
  }
  const kelompok: Isian["kelompok"] = [];
  for (const k of (body.kelompok ?? []) as unknown[]) {
    const x = k as { nomor?: unknown; aktif?: unknown; klp?: unknown };
    const nomor = Number(x.nomor);
    if (!Number.isInteger(nomor) || nomor < 1 || nomor > jumlah) return null;
    const klp = typeof x.klp === "string" ? x.klp.trim().slice(0, 20) : "";
    kelompok.push({ nomor, aktif: x.aktif !== false, klp: klp || null });
  }
  return { jumlahKelompok: jumlah, anggotaPerKelompok: per, kelompok, anggota };
}

export async function handleRosterSlotPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const isian = bacaIsian(body);
  if (!isian) return tolak(res, "format_salah");
  const orang = await muatOrang(session.nim);
  if (!orang) return tolak(res, "tanpa_hak");
  const db = getDb();
  const semester = semesterIni();

  // A susulan draft: its own one-off roster.
  if (body.sesiId != null) {
    const d = await draftRow(Number(body.sesiId));
    if (!d) return tolak(res, "draf_tidak_ada");
    if (!bolehPenuh(orang, "pair")) {
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "pair" });
    }
    const nims = isian.anggota.map((a) => a.nim);
    const nama = new Map(
      nims.length
        ? (
            await db
              .select({ nim: praktikan.nim, nama: praktikan.nama })
              .from(praktikan)
              .where(inArray(praktikan.nim, nims))
          ).map((p) => [p.nim, p.nama])
        : [],
    );
    if (isian.anggota.some((a) => !nama.has(a.nim))) return tolak(res, "praktikan_tidak_ada");
    await db.transaction(async (tx) => {
      await tx.delete(rosterSusulan).where(eq(rosterSusulan.sesiId, d.id));
      if (isian.anggota.length) {
        await tx.insert(rosterSusulan).values(
          isian.anggota.map((a, i) => ({
            sesiId: d.id,
            kelompokNomor: a.nomor,
            nim: a.nim,
            nama: nama.get(a.nim)!,
            urutan: i,
          })),
        );
      }
      await tx.update(sesi).set({ jumlahKelompok: isian.jumlahKelompok }).where(eq(sesi.id, d.id));
    });
    await writeAudit(session.nim, "roster_susulan", {
      sesiId: d.id,
      jumlahKelompok: isian.jumlahKelompok,
      praktikan: isian.anggota.length,
    });
    return res.status(200).json({ ok: true });
  }

  const hari = Number(body.hari);
  const slot = Number(body.slot);
  if (!Number.isInteger(hari) || hari < 1 || hari > 6 || ![1, 2, 3, 4].includes(slot)) {
    return tolak(res, "format_salah");
  }
  const row = await slotRow(hari, slot);
  if (!row) return tolak(res, "slot_tidak_ada");
  if (!boleh(orang, "jadwal") && !diSlot(orang, row)) {
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
  }

  const nims = isian.anggota.map((a) => a.nim);
  // `versi` is what the editor loaded (null for a roster never saved);
  // `paksa` is "Simpan Versiku" after comparing.
  const dimuat = typeof body.versi === "string" || body.versi === null ? body.versi : undefined;
  const hasil = await db.transaction(async (tx) => {
    if (dimuat !== undefined && body.paksa !== true) {
      const kini = await versiRoster(tx, hari, slot);
      if ((kini?.pada ?? null) !== dimuat) {
        return { ok: false as const, kode: "versi_berubah", versi: kini };
      }
    }
    if (nims.length) {
      // Everyone must be on the semester's list, and in no other slot.
      const ada = await tx
        .select({ nim: praktikan.nim })
        .from(praktikan)
        .where(inArray(praktikan.nim, nims));
      if (ada.length !== nims.length) return { ok: false as const, kode: "praktikan_tidak_ada" };
      const bentrok = await tx
        .select({ nim: rosterSlot.nim, hari: rosterSlot.hari, slot: rosterSlot.slot })
        .from(rosterSlot)
        .where(
          and(
            eq(rosterSlot.semester, semester),
            inArray(rosterSlot.nim, nims),
            or(ne(rosterSlot.hari, hari), ne(rosterSlot.slot, slot)),
          ),
        );
      if (bentrok.length) return { ok: false as const, kode: "di_slot_lain", bentrok };
    }
    const where = and(
      eq(rosterSlot.semester, semester),
      eq(rosterSlot.hari, hari),
      eq(rosterSlot.slot, slot),
    );
    await tx.delete(rosterSlot).where(where);
    if (isian.anggota.length) {
      const urut = new Map<number, number>();
      await tx.insert(rosterSlot).values(
        isian.anggota.map((a) => {
          const u = urut.get(a.nomor) ?? 0;
          urut.set(a.nomor, u + 1);
          return { semester, hari, slot, kelompokNomor: a.nomor, nim: a.nim, urutan: u };
        }),
      );
    }
    await tx
      .delete(rosterKelompok)
      .where(
        and(
          eq(rosterKelompok.semester, semester),
          eq(rosterKelompok.hari, hari),
          eq(rosterKelompok.slot, slot),
        ),
      );
    if (isian.kelompok.length) {
      await tx.insert(rosterKelompok).values(
        isian.kelompok.map((k) => ({
          semester,
          hari,
          slot,
          nomor: k.nomor,
          aktif: k.aktif,
          klpSeelabs: k.klp,
        })),
      );
    }
    await tx
      .update(jadwal)
      .set({
        jumlahKelompok: isian.jumlahKelompok,
        anggotaPerKelompok: isian.anggotaPerKelompok,
      })
      .where(eq(jadwal.id, row.id));
    // The audit row is the new version, so it is written in the same
    // transaction as the roster.
    const [a] = await tx
      .insert(audit)
      .values({
        aktorNim: session.nim,
        aksi: "roster_slot",
        detail: JSON.stringify({
          hari,
          slot,
          jumlahKelompok: isian.jumlahKelompok,
          praktikan: isian.anggota.length,
          ...(body.paksa === true ? { paksa: true } : {}),
        }),
      })
      .returning({ pada: audit.pada });
    return { ok: true as const, versi: a.pada.toISOString() };
  });
  if (!hasil.ok) return res.status(200).json(hasil);
  res.status(200).json({ ok: true, versi: hasil.versi });
}

/* ------------------------------------------------------------- praktikan */

export async function handlePraktikanGet(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const semester = semesterIni();
  const rows = await db
    .select({
      nim: praktikan.nim,
      nama: praktikan.nama,
      kelas: praktikan.kelas,
      hari: rosterSlot.hari,
      slot: rosterSlot.slot,
      nomor: rosterSlot.kelompokNomor,
    })
    .from(praktikan)
    .leftJoin(rosterSlot, and(eq(rosterSlot.nim, praktikan.nim), eq(rosterSlot.semester, semester)))
    .where(eq(praktikan.semester, semester))
    .orderBy(asc(praktikan.nama));
  res.status(200).json({
    ok: true,
    praktikan: rows.map((r) => ({
      nim: r.nim,
      nama: r.nama,
      kelas: r.kelas,
      tempat: r.hari ? { hari: r.hari, slot: r.slot, nomor: r.nomor } : null,
    })),
  });
}

export async function handlePraktikanPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 2000) {
    return tolak(res, "format_salah");
  }
  const db = getDb();
  const semester = semesterIni();
  const terima: { nim: string; nama: string; kelas: Kelas }[] = [];
  const dilewati: { nim: string; alasan: string }[] = [];
  const seen = new Set<string>();
  for (const r of body.rows as unknown[]) {
    const x = r as { nim?: unknown; nama?: unknown; kelas?: unknown };
    const nim = typeof x.nim === "string" ? x.nim.trim() : "";
    const nama = typeof x.nama === "string" ? x.nama.trim().replace(/\s+/g, " ") : "";
    const kelas: Kelas = isKelas(x.kelas) ? x.kelas : "reguler";
    if (!NIM_PRAKTIKAN_RE.test(nim)) dilewati.push({ nim, alasan: "nim_salah" });
    else if (nama.length < 2 || nama.length > 120) dilewati.push({ nim, alasan: "nama_kosong" });
    else if (seen.has(nim)) dilewati.push({ nim, alasan: "ganda" });
    else {
      seen.add(nim);
      terima.push({ nim, nama, kelas });
    }
  }
  let ditambah = 0;
  if (terima.length) {
    const ada = new Set(
      (
        await db
          .select({ nim: praktikan.nim })
          .from(praktikan)
          .where(
            inArray(
              praktikan.nim,
              terima.map((t) => t.nim),
            ),
          )
      ).map((r) => r.nim),
    );
    const baru = terima.filter((t) => {
      if (ada.has(t.nim)) dilewati.push({ nim: t.nim, alasan: "sudah_ada" });
      return !ada.has(t.nim);
    });
    if (baru.length) {
      await db
        .insert(praktikan)
        .values(baru.map((b) => ({ ...b, semester, dibuatOleh: session.nim })))
        .onConflictDoNothing();
      ditambah = baru.length;
    }
  }
  await writeAudit(session.nim, "praktikan_tambah", { ditambah, dilewati: dilewati.length });
  res.status(200).json({ ok: true, ditambah, dilewati });
}

/* --------------------------------------------------------------- susulan */

export async function handleSusulanGet(_req: ApiRequest, res: ApiResponse) {
  const rows = await getDb()
    .select({
      id: sesi.id,
      tanggal: sesi.tanggal,
      mulai: sesi.mulai,
      modul: sesi.modul,
      jumlahKelompok: sesi.jumlahKelompok,
      lanjutanDari: sesi.lanjutanDari,
    })
    .from(sesi)
    .where(and(eq(sesi.status, "terjadwal"), eq(sesi.jenis, "susulan")))
    .orderBy(asc(sesi.tanggal), asc(sesi.mulai));
  res.status(200).json({ ok: true, draf: rows });
}

export async function handleSusulanPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const tanggal = typeof body.tanggal === "string" ? body.tanggal : "";
  const mulai = typeof body.mulai === "string" ? body.mulai : "";
  // Carrying groups over from an ended session (c-next).
  const dari = Number(body.lanjutanDari);
  const lanjut = Number.isInteger(dari) && dari > 0;
  const pilih = Array.isArray(body.kelompok)
    ? [...new Set(body.kelompok.map(Number))].filter(
        (n) => Number.isInteger(n) && n >= 1 && n <= KELOMPOK_MAKS,
      )
    : [];
  let asal: { modul: number; status: string; jenis: string } | null = null;
  if (lanjut) {
    [asal] = await getDb()
      .select({ modul: sesi.modul, status: sesi.status, jenis: sesi.jenis })
      .from(sesi)
      .where(eq(sesi.id, dari))
      .limit(1);
    if (!asal || asal.status !== "selesai") return tolak(res, "sesi_tidak_ada");
    if (asal.jenis === "tot") return tolak(res, "sesi_tot");
    if (pilih.length === 0) return tolak(res, "format_salah");
  }
  const modul = asal ? asal.modul : Number(body.modul);
  const jumlah = lanjut ? pilih.length : Number(body.jumlahKelompok ?? 5);
  if (
    !TANGGAL_RE.test(tanggal) ||
    !JAM_RE.test(mulai) ||
    ![1, 2, 3, 4].includes(modul) ||
    !Number.isInteger(jumlah) ||
    jumlah < 1 ||
    jumlah > KELOMPOK_MAKS
  ) {
    return tolak(res, "format_salah");
  }
  const orang = await muatOrang(session.nim);
  if (!orang || !bolehPenuh(orang, "pair")) {
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "pair" });
  }
  try {
    const db = getDb();
    const { id, disalin } = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sesi)
        .values({
          tanggal,
          mulai,
          modul,
          status: "terjadwal",
          jenis: "susulan",
          jumlahKelompok: jumlah,
          lanjutanDari: lanjut ? dari : null,
        })
        .returning({ id: sesi.id });
      if (!lanjut) return { id: row.id, disalin: 0 };
      const orang = await tx
        .select({ nim: sesiAnggota.nim, nama: sesiAnggota.nama, nomor: sesiAnggota.kelompokNomor })
        .from(sesiAnggota)
        .where(and(eq(sesiAnggota.sesiId, dari), inArray(sesiAnggota.kelompokNomor, pilih)))
        .orderBy(asc(sesiAnggota.kelompokNomor), asc(sesiAnggota.nim));
      if (orang.length) {
        await tx.insert(rosterSusulan).values(
          orang.map((o, i) => ({
            sesiId: row.id,
            kelompokNomor: pilih.indexOf(o.nomor) + 1,
            nim: o.nim,
            nama: o.nama,
            urutan: i,
          })),
        );
      }
      return { id: row.id, disalin: orang.length };
    });
    await writeAudit(session.nim, "susulan_draf", {
      sesiId: id,
      tanggal,
      mulai,
      modul,
      ...(lanjut ? { lanjutanDari: dari, kelompok: pilih } : {}),
    });
    res.status(200).json({ ok: true, id, disalin });
  } catch {
    tolak(res, "sudah_ada");
  }
}
