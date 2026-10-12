/**
 * The Schedule and who teaches each slot (Phase 9 Stage 4, mockups s-week,
 * s-slot, t-assign and the Console home's Saya Bantu).
 *
 * GET  /api/session/schedule?semester=[&geser=]   the week grid, the
 *      people, and for the current semester each slot's next date (or the
 *      date `geser` weeks after it, Tim › Penugasan Slot's week picker): its
 *      status that date, each group's seat (penugasan-minggu.ts), helpers,
 *      requests and izin. Plus the start-window settings.
 * POST /api/session/schedule (the "jadwal" right, checked by the caller)
 *      { semester, hari, slot, ubah, geser? }  one slot (made when it isn't
 *          there yet): class, status (aktif, segera, kosong with
 *          warnaKosong, or libur for that date only), group count, the
 *          semester's Asisten per group (from now on: sessions already
 *          held keep who taught them), ranked substitutes, start window,
 *          and `minggu`: each group's kind on that date (tetap, pengganti,
 *          sukarela, izin) and who covers.
 *      { semester, pindah: { dari: {hari, slot}, ke: {hari, slot} } }
 *          moves a slot to a free day and session (2026-10-12): its roster,
 *          and its holidays, covers and izin still to come, go along.
 *      { semester, teksDefault, ... }      the paste import (unchanged).
 *
 * GET  /api/session/penugasan             my side of it: today's slots that
 *      need help (Saya Bantu), requests to me, offers waiting for me to
 *      confirm, and my own offers.
 * POST /api/session/penugasan { aksi }
 *      minta      { jadwalId, kelompok, nim }  ask someone to cover a group
 *      umumkan    { jadwalId, nim }            an izin looks for cover in
 *                                              everyone's Saya Bantu
 *      bantu      { jadwalId }                 I offer to help (Sukarela)
 *      jawab      { id, terima }               I answer a request to me
 *      konfirmasi { id, terima }               the slot's Asisten (or the
 *                                              jadwal right) answers an offer
 *      batal      { id }                       I take back my own offer
 *      pengaturan { default, min, max }        start-window settings (the
 *                                              jadwal right)
 *
 * Every change writes `audit`. Accepting a cover fills the izin and seats
 * the person in the open group.
 */
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  izin,
  jadwal,
  pengaturan,
  penugasanSlot,
  rosterKelompok,
  rosterSlot,
  sesi,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { boleh } from "../../src/lib/hak.js";
import { isKelas } from "../../src/lib/kelas.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { KELOMPOK_MAKS } from "../../src/lib/jadwal.js";
import {
  buildJadwal,
  hariDariTanggal,
  semesterDariTanggal,
  type TagPengganti,
} from "../../src/lib/jadwal-parser.js";
import {
  aturLibur,
  daftarLibur,
  GESER_MAKS,
  geserDari,
  orangTanggal,
  pasanganTanggal,
  statusSlotTanggal,
  tanggalMinggu,
  type IzinInfo,
  type MingguSlot,
  type TugasInfo,
} from "../../src/lib/penugasan-minggu.js";
import {
  JENDELA_DEFAULT,
  JENDELA_MAX,
  JENDELA_MIN,
  jendelaValid,
} from "../../src/lib/sesi-mulai.js";

type Db = ReturnType<typeof getDb>;
type JadwalRow = typeof jadwal.$inferSelect;

const SEMESTER_RE = /^\d{4}-(ganjil|genap)$/;

function tolak(res: ApiResponse, kode: string, status = 200) {
  res.status(status).json({ ok: false, kode });
}

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Weeks past the next date (0 = the next date), or null when out of range */
const bacaGeser = (v: unknown) => {
  const n = v === undefined || v === "" ? 0 : Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 0 && n <= GESER_MAKS ? n : null;
};

/* -------------------------------------------------------------- settings */

export interface PengaturanJendela {
  default: number;
  min: number;
  max: number;
}

export async function muatPengaturanJendela(db: Db): Promise<PengaturanJendela> {
  const rows = await db
    .select()
    .from(pengaturan)
    .where(inArray(pengaturan.kunci, ["jendela_mulai_default", "jendela_mulai_batas"]));
  const def = rows.find((r) => r.kunci === "jendela_mulai_default")?.nilai;
  const batas = rows.find((r) => r.kunci === "jendela_mulai_batas")?.nilai as
    { min?: unknown; max?: unknown } | undefined;
  const min = jendelaValid(batas?.min, JENDELA_MIN);
  const max = Math.max(min, jendelaValid(batas?.max, JENDELA_MAX));
  return { default: Math.min(max, Math.max(min, jendelaValid(def, JENDELA_DEFAULT))), min, max };
}

/* ------------------------------------------------------------ the week */

/** For each slot row: its next date (or the one `geser` weeks after it)
 *  and who teaches it then. */
export async function muatMinggu(
  db: Db,
  rows: JadwalRow[],
  hariIni = hariIniWib(),
  geser = 0,
): Promise<Map<number, MingguSlot>> {
  const out = new Map<number, MingguSlot>();
  if (rows.length === 0) return out;
  const tanggalOf = new Map(rows.map((j) => [j.id, tanggalMinggu(j.hari, hariIni, geser)]));
  const ids = rows.map((j) => j.id);
  const orang = await db.select({ nim: asisten.nim, kode: asisten.kode }).from(asisten);
  const kodeOf = new Map(orang.map((o) => [o.nim, o.kode.toUpperCase()]));
  const tugasRows = await db
    .select()
    .from(penugasanSlot)
    .where(inArray(penugasanSlot.jadwalId, ids))
    .orderBy(asc(penugasanSlot.id));
  const izinRows = await db
    .select()
    .from(izin)
    .where(inArray(izin.jadwalId, ids))
    .orderBy(asc(izin.id));
  for (const j of rows) {
    const tanggal = tanggalOf.get(j.id)!;
    const tugas: TugasInfo[] = tugasRows
      .filter((t) => t.jadwalId === j.id && t.tanggal === tanggal)
      .map((t) => ({
        id: t.id,
        nim: t.nim,
        kode: kodeOf.get(t.nim) ?? t.nim,
        kelompokNomor: t.kelompokNomor,
        jenis: t.jenis,
        status: t.status,
        tag: t.tag,
        dimintaOleh: t.dimintaOleh,
        dikonfirmasiOleh: t.dikonfirmasiOleh,
      }));
    const iz: IzinInfo[] = izinRows
      .filter((x) => x.jadwalId === j.id && x.tanggal === tanggal)
      .map((x) => ({
        id: x.id,
        nim: x.nim,
        kode: kodeOf.get(x.nim) ?? x.nim,
        status: x.status,
        alasan: x.alasan,
        penggantiNim: x.penggantiNim,
      }));
    out.set(j.id, {
      tanggal,
      status: statusSlotTanggal(j, tanggal),
      kursi: pasanganTanggal(j.asisten, j.jumlahKelompok, tugas, iz),
      tugas,
      izin: iz,
    });
  }
  return out;
}

/** Whether `kode` teaches (or helps) the slot on its next date, or is one
 *  of its listed substitutes. Used for start and start-window rights. */
export function diSlotMinggu(j: JadwalRow, m: MingguSlot | undefined, kode: string): boolean {
  const k = kode.toUpperCase();
  if (j.pengganti.some((p) => p.kode.toUpperCase() === k)) return true;
  if (!m) return j.asisten.some((x) => x.toUpperCase() === k);
  return orangTanggal(m.kursi, m.tugas).has(k);
}

/* ------------------------------------------------------------- GET */

export async function handleScheduleGet(req: ApiRequest, res: ApiResponse) {
  const semester = typeof req.query.semester === "string" ? req.query.semester : "";
  const geser = bacaGeser(req.query.geser);
  if (geser === null) return tolak(res, "format_salah", 400);
  const db = getDb();
  const rows = await db
    .select()
    .from(jadwal)
    .where(semester ? eq(jadwal.semester, semester) : undefined)
    .orderBy(asc(jadwal.hari), asc(jadwal.slot));
  const daftarAsisten = await db
    .select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama, status: asisten.status })
    .from(asisten)
    .orderBy(asc(asisten.kode));
  const kini = semesterDariTanggal(hariIniWib());
  const minggu =
    !semester || semester === kini
      ? Object.fromEntries(
          await muatMinggu(
            db,
            rows.filter((r) => r.semester === kini),
            hariIniWib(),
            geser,
          ),
        )
      : {};
  res.status(200).json({
    ok: true,
    jadwal: rows,
    asisten: daftarAsisten,
    minggu,
    jendela: await muatPengaturanJendela(db),
  });
}

/* ------------------------------------------------------------- POST */

type KindKursi = "tetap" | "pengganti" | "sukarela" | "izin";
interface KursiBaru {
  nomor: number;
  jenis: KindKursi;
  /** The cover for pengganti, sukarela or izin (a code; "" for none). */
  kode: string;
}

function bacaKursi(v: unknown, n: number): KursiBaru[] | null {
  if (!Array.isArray(v)) return null;
  const out: KursiBaru[] = [];
  for (const x of v) {
    const r = x as { nomor?: unknown; jenis?: unknown; kode?: unknown };
    const nomor = posInt(r.nomor);
    if (!nomor || nomor > n) return null;
    if (!["tetap", "pengganti", "sukarela", "izin"].includes(r.jenis as string)) return null;
    out.push({
      nomor,
      jenis: r.jenis as KindKursi,
      kode: typeof r.kode === "string" ? r.kode.trim().toUpperCase() : "",
    });
  }
  return out;
}

export async function handleSchedulePost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const semester = typeof body.semester === "string" ? body.semester : "";
  if (!SEMESTER_RE.test(semester)) return tolak(res, "format_salah", 400);
  const db = getDb();

  if (body.ubah && typeof body.ubah === "object") {
    return ubahSlot(res, db, session, semester, body);
  }
  if (body.pindah && typeof body.pindah === "object") {
    return pindahSlot(res, db, session, semester, body.pindah as Record<string, unknown>);
  }

  // Paste import (preview, or replace the whole semester when simpan).
  const teksDefault = typeof body.teksDefault === "string" ? body.teksDefault : "";
  const teksPengganti = typeof body.teksPengganti === "string" ? body.teksPengganti : "";
  if (!teksDefault.trim() || teksDefault.length > 50_000 || teksPengganti.length > 50_000)
    return tolak(res, "format_salah", 400);
  const kode = (await db.select({ kode: asisten.kode }).from(asisten)).map((r) => r.kode);
  const hasil = buildJadwal(teksDefault, teksPengganti, kode);
  if (!body.simpan) {
    res.status(200).json({ ok: true, pratinjau: hasil });
    return;
  }
  if (hasil.slot.length === 0) {
    res.status(200).json({ ok: false, kode: "jadwal_kosong", pratinjau: hasil });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(jadwal).where(eq(jadwal.semester, semester));
    await tx
      .insert(jadwal)
      .values(hasil.slot.map((s) => ({ semester, ...s, diubahOleh: session.nim })));
  });
  await writeAudit(session.nim, "jadwal_impor", { semester, slot: hasil.slot.length });
  res.status(200).json({ ok: true, disimpan: hasil.slot.length, pratinjau: hasil });
}

async function ubahSlot(
  res: ApiResponse,
  db: Db,
  session: SessionPayload,
  semester: string,
  body: Record<string, unknown>,
) {
  const hari = posInt(body.hari);
  const slot = posInt(body.slot);
  const geser = bacaGeser(body.geser);
  const ubah = body.ubah as Record<string, unknown>;
  if (!hari || hari > 6 || !slot || slot > 4 || geser === null)
    return tolak(res, "format_salah", 400);
  const patch: Partial<typeof jadwal.$inferInsert> = {
    diubahPada: new Date(),
    diubahOleh: session.nim,
  };
  const kini = semesterDariTanggal(hariIniWib());
  const tanggal = tanggalMinggu(hari, hariIniWib(), geser);

  if (ubah.kelas !== undefined) {
    if (!isKelas(ubah.kelas)) return tolak(res, "format_salah", 400);
    patch.kelas = ubah.kelas;
  }
  let libur: boolean | null = null;
  if (ubah.status !== undefined) {
    const st = ubah.status;
    if (st === "libur") {
      if (semester !== kini) return tolak(res, "format_salah", 400);
      libur = true;
    } else if (st === "aktif" || st === "segera" || st === "kosong") {
      patch.status = st;
      libur = false;
    } else return tolak(res, "format_salah", 400);
    if (st === "kosong") {
      const w = ubah.warnaKosong;
      if (w !== "oranye" && w !== "merah") return tolak(res, "format_salah", 400);
      patch.warnaKosong = w;
    }
  }
  if (ubah.jumlahKelompok !== undefined) {
    const n = posInt(ubah.jumlahKelompok);
    if (!n || n > KELOMPOK_MAKS) return tolak(res, "format_salah", 400);
    patch.jumlahKelompok = n;
  }
  if (ubah.asisten !== undefined) {
    if (
      !Array.isArray(ubah.asisten) ||
      ubah.asisten.length > KELOMPOK_MAKS ||
      !ubah.asisten.every((k) => typeof k === "string")
    )
      return tolak(res, "format_salah", 400);
    patch.asisten = (ubah.asisten as string[]).map((k) => k.trim().toUpperCase());
  }
  if (ubah.pengganti !== undefined) {
    const p = ubah.pengganti;
    const tags: TagPengganti[] = ["fit", "a24", null];
    if (
      !Array.isArray(p) ||
      !p.every((x) => x && typeof x.kode === "string" && tags.includes(x.tag ?? null))
    )
      return tolak(res, "format_salah", 400);
    patch.pengganti = p.map((x) => ({ kode: String(x.kode).toUpperCase(), tag: x.tag ?? null }));
  }
  if (ubah.jendela !== undefined) {
    if (ubah.jendela === null) {
      patch.jendelaMulaiMenit = null;
      patch.jendelaDiaturOleh = null;
    } else {
      const m = Number(ubah.jendela);
      if (!Number.isInteger(m) || m < JENDELA_MIN || m > JENDELA_MAX)
        return tolak(res, "format_salah", 400);
      patch.jendelaMulaiMenit = m;
      patch.jendelaDiaturOleh = session.nim;
    }
  }

  // Codes must be known people, and none of them on leave or inactive.
  const orang = await db
    .select({ nim: asisten.nim, kode: asisten.kode, status: asisten.status })
    .from(asisten);
  const byKode = new Map(orang.map((o) => [o.kode.toUpperCase(), o]));
  for (const k of patch.asisten ?? []) {
    if (!k) continue;
    const o = byKode.get(k);
    if (!o) return tolak(res, "kode_tidak_dikenal");
  }

  const [row] = await db
    .insert(jadwal)
    .values({ semester, hari, slot, ...patch })
    .onConflictDoUpdate({ target: [jadwal.semester, jadwal.hari, jadwal.slot], set: patch })
    .returning();

  // The holiday, for that date only (each week can have its own).
  if (libur !== null) {
    const liburTanggal = aturLibur(row.liburTanggal, tanggal, libur, hariIniWib());
    // A holiday on a No Practicum slot makes it a running slot again.
    const status = libur && row.status === "kosong" ? "aktif" : row.status;
    if (liburTanggal !== row.liburTanggal || status !== row.status)
      await db.update(jadwal).set({ liburTanggal, status }).where(eq(jadwal.id, row.id));
  }

  // The next date's seats.
  if (ubah.minggu !== undefined && semester === kini) {
    const kursi = bacaKursi((ubah.minggu as { kursi?: unknown })?.kursi, row.jumlahKelompok);
    if (!kursi) return tolak(res, "format_salah", 400);
    // Optional: the helpers without a group, as the whole list (Tim's
    // slot board); absent, they're left as they are.
    const bantuRaw = (ubah.minggu as { bantu?: unknown })?.bantu;
    let bantu: { kode: string; jenis: "pengganti" | "sukarela" }[] | null = null;
    if (bantuRaw !== undefined) {
      if (!Array.isArray(bantuRaw)) return tolak(res, "format_salah", 400);
      bantu = [];
      for (const x of bantuRaw) {
        const r = x as { kode?: unknown; jenis?: unknown };
        if (typeof r.kode !== "string" || (r.jenis !== "pengganti" && r.jenis !== "sukarela"))
          return tolak(res, "format_salah", 400);
        bantu.push({ kode: r.kode.trim().toUpperCase(), jenis: r.jenis });
      }
    }
    for (const kode of [...kursi.map((k) => k.kode), ...(bantu ?? []).map((b) => b.kode)]) {
      if (!kode) continue;
      const o = byKode.get(kode);
      if (!o) return tolak(res, "kode_tidak_dikenal");
      if (o.status !== "aktif") return tolak(res, "orang_tidak_aktif");
    }
    await simpanMinggu(db, session.nim, row, geser, kursi, byKode, bantu);
  }

  await writeAudit(session.nim, "jadwal_ubah", { semester, hari, slot, ubah, tanggal });
  res.status(200).json({ ok: true, tanggal, id: row.id });
}

/** Moves a slot to a free day and session of the same semester. A target
 *  holding a No Practicum row with no roster gives way; one that runs, or
 *  a slot whose session is running now, refuses. */
async function pindahSlot(
  res: ApiResponse,
  db: Db,
  session: SessionPayload,
  semester: string,
  pindah: Record<string, unknown>,
) {
  const sel = (v: unknown) => {
    const x = (v ?? {}) as { hari?: unknown; slot?: unknown };
    const hari = posInt(x.hari);
    const slot = posInt(x.slot);
    return hari && hari <= 6 && slot && slot <= 4 ? { hari, slot } : null;
  };
  const dari = sel(pindah.dari);
  const ke = sel(pindah.ke);
  if (!dari || !ke) return tolak(res, "format_salah", 400);
  if (dari.hari === ke.hari && dari.slot === ke.slot) return tolak(res, "format_salah", 400);
  const di = (h: number, s: number) =>
    and(eq(jadwal.semester, semester), eq(jadwal.hari, h), eq(jadwal.slot, s));
  const [asal] = await db.select().from(jadwal).where(di(dari.hari, dari.slot)).limit(1);
  if (!asal) return tolak(res, "slot_tidak_ada");
  const [tuju] = await db.select().from(jadwal).where(di(ke.hari, ke.slot)).limit(1);
  const rosterDi = (h: number, s: number) =>
    db
      .select({ id: rosterSlot.id })
      .from(rosterSlot)
      .where(and(eq(rosterSlot.semester, semester), eq(rosterSlot.hari, h), eq(rosterSlot.slot, s)))
      .limit(1);
  if (tuju && (tuju.status !== "kosong" || (await rosterDi(ke.hari, ke.slot)).length))
    return tolak(res, "slot_terisi");
  const hariIni = hariIniWib();
  const kini = semesterDariTanggal(hariIni);
  if (semester === kini) {
    const jalan = await db
      .select({ tanggal: sesi.tanggal })
      .from(sesi)
      .where(and(eq(sesi.status, "berjalan"), eq(sesi.slot, dari.slot)));
    if (jalan.some((x) => hariDariTanggal(x.tanggal) === dari.hari))
      return tolak(res, "sesi_berjalan");
  }

  // A date still to come keeps its week: the next date's covers go to the
  // new day's next date, and so on.
  const geserKe = (tgl: string) => {
    const g = geserDari(dari.hari, hariIni, tgl);
    return g === null ? null : tanggalMinggu(ke.hari, hariIni, g);
  };
  await db.transaction(async (tx) => {
    if (tuju) {
      await tx.delete(jadwal).where(eq(jadwal.id, tuju.id));
      await tx
        .delete(rosterKelompok)
        .where(
          and(
            eq(rosterKelompok.semester, semester),
            eq(rosterKelompok.hari, ke.hari),
            eq(rosterKelompok.slot, ke.slot),
          ),
        );
    }
    const libur = daftarLibur(asal.liburTanggal)
      .map(geserKe)
      .filter((x): x is string => !!x);
    await tx
      .update(jadwal)
      .set({
        hari: ke.hari,
        slot: ke.slot,
        liburTanggal: libur.length ? libur.sort().join(",") : null,
        diubahPada: new Date(),
        diubahOleh: session.nim,
      })
      .where(eq(jadwal.id, asal.id));
    await tx
      .update(rosterSlot)
      .set({ hari: ke.hari, slot: ke.slot })
      .where(
        and(
          eq(rosterSlot.semester, semester),
          eq(rosterSlot.hari, dari.hari),
          eq(rosterSlot.slot, dari.slot),
        ),
      );
    await tx
      .update(rosterKelompok)
      .set({ hari: ke.hari, slot: ke.slot })
      .where(
        and(
          eq(rosterKelompok.semester, semester),
          eq(rosterKelompok.hari, dari.hari),
          eq(rosterKelompok.slot, dari.slot),
        ),
      );
    // Covers and izin still to come follow the slot; the past stays.
    const tugas = await tx
      .select({ id: penugasanSlot.id, tanggal: penugasanSlot.tanggal })
      .from(penugasanSlot)
      .where(and(eq(penugasanSlot.jadwalId, asal.id), gte(penugasanSlot.tanggal, hariIni)));
    for (const x of tugas) {
      const baru = geserKe(x.tanggal);
      if (baru)
        await tx.update(penugasanSlot).set({ tanggal: baru }).where(eq(penugasanSlot.id, x.id));
      else await tx.delete(penugasanSlot).where(eq(penugasanSlot.id, x.id));
    }
    const iz = await tx
      .select({ id: izin.id, tanggal: izin.tanggal })
      .from(izin)
      .where(and(eq(izin.jadwalId, asal.id), gte(izin.tanggal, hariIni)));
    for (const x of iz) {
      const baru = geserKe(x.tanggal);
      if (baru) await tx.update(izin).set({ tanggal: baru }).where(eq(izin.id, x.id));
      else await tx.delete(izin).where(eq(izin.id, x.id));
    }
  });
  await writeAudit(session.nim, "jadwal_pindah", { semester, dari, ke });
  res.status(200).json({ ok: true, id: asal.id });
}

/** Writes one date's seats: izin rows for excused Asisten, accepted cover
 *  rows for the seats taken by someone else, and clears what no longer
 *  applies. Volunteer offers still waiting are left alone. */
async function simpanMinggu(
  db: Db,
  oleh: string,
  j: JadwalRow,
  geser: number,
  kursi: KursiBaru[],
  byKode: Map<string, { nim: string; kode: string; status: string }>,
  bantu: { kode: string; jenis: "pengganti" | "sukarela" }[] | null = null,
) {
  const m = (await muatMinggu(db, [j], hariIniWib(), geser)).get(j.id)!;
  const tanggal = m.tanggal;
  const tetapOf = new Map(m.kursi.map((k) => [k.nomor, k.tetap]));
  const izinKode = new Set<string>();
  const duduk = new Map<string, { nomor: number; jenis: "pengganti" | "sukarela" }>();
  for (const k of kursi) {
    if (k.jenis === "izin") {
      const t = tetapOf.get(k.nomor);
      if (t) izinKode.add(t);
      if (k.kode) duduk.set(k.kode, { nomor: k.nomor, jenis: "pengganti" });
    } else if ((k.jenis === "pengganti" || k.jenis === "sukarela") && k.kode) {
      duduk.set(k.kode, { nomor: k.nomor, jenis: k.jenis });
    }
  }

  await db.transaction(async (tx) => {
    // izin: open for the excused, cancelled for the rest.
    for (const kode of izinKode) {
      const o = byKode.get(kode);
      if (!o) continue;
      const cover = [...duduk.entries()].find(
        ([, d]) => d.jenis === "pengganti" && tetapOf.get(d.nomor) === kode,
      )?.[0];
      const penggantiNim = cover ? (byKode.get(cover)?.nim ?? null) : null;
      // Still looking for cover keeps the broadcast ("dicari").
      const lama = m.izin.find((x) => x.nim === o.nim);
      const status = !penggantiNim && lama?.status === "dicari" ? "dicari" : "aktif";
      await tx
        .insert(izin)
        .values({ nim: o.nim, jadwalId: j.id, tanggal, status, penggantiNim, dibuatOleh: oleh })
        .onConflictDoUpdate({
          target: [izin.nim, izin.jadwalId, izin.tanggal],
          set: { status, penggantiNim },
        });
    }
    for (const x of m.izin) {
      if (!izinKode.has(x.kode) && x.status !== "dibatalkan")
        await tx.update(izin).set({ status: "dibatalkan" }).where(eq(izin.id, x.id));
    }

    // Seats: accepted rows for everyone seated by this edit.
    const seatedNim = new Set<string>();
    for (const [kode, d] of duduk) {
      const o = byKode.get(kode);
      if (!o) continue;
      seatedNim.add(o.nim);
      // Nobody else keeps that seat.
      await tx
        .update(penugasanSlot)
        .set({ kelompokNomor: null })
        .where(
          and(
            eq(penugasanSlot.jadwalId, j.id),
            eq(penugasanSlot.tanggal, tanggal),
            eq(penugasanSlot.kelompokNomor, d.nomor),
            ne(penugasanSlot.nim, o.nim),
          ),
        );
      await tx
        .insert(penugasanSlot)
        .values({
          jadwalId: j.id,
          tanggal,
          kelompokNomor: d.nomor,
          nim: o.nim,
          jenis: d.jenis,
          status: "diterima",
          dimintaOleh: oleh,
          dikonfirmasiOleh: oleh,
        })
        .onConflictDoUpdate({
          target: [penugasanSlot.jadwalId, penugasanSlot.tanggal, penugasanSlot.nim],
          set: {
            kelompokNomor: d.nomor,
            jenis: d.jenis,
            status: "diterima",
            dikonfirmasiOleh: oleh,
          },
        });
    }
    // Accepted covers this edit no longer seats: substitutes go, volunteers
    // stay as helpers without a group.
    for (const t of m.tugas) {
      if (t.status !== "diterima" || seatedNim.has(t.nim) || t.kelompokNomor == null) continue;
      if (t.jenis === "sukarela")
        await tx
          .update(penugasanSlot)
          .set({ kelompokNomor: null })
          .where(eq(penugasanSlot.id, t.id));
      else await tx.delete(penugasanSlot).where(eq(penugasanSlot.id, t.id));
    }
    // The helpers without a group, when the caller sent the whole list.
    if (bantu) {
      const mau = new Map(
        bantu
          .map((b) => [byKode.get(b.kode)?.nim, b.jenis] as const)
          .filter((x): x is [string, "pengganti" | "sukarela"] => !!x[0] && !seatedNim.has(x[0])),
      );
      for (const t of m.tugas)
        if (t.status === "diterima" && t.kelompokNomor == null && !mau.has(t.nim))
          await tx.delete(penugasanSlot).where(eq(penugasanSlot.id, t.id));
      for (const [nim, jenis] of mau)
        await tx
          .insert(penugasanSlot)
          .values({
            jadwalId: j.id,
            tanggal,
            kelompokNomor: null,
            nim,
            jenis,
            status: "diterima",
            dimintaOleh: oleh,
            dikonfirmasiOleh: oleh,
          })
          .onConflictDoUpdate({
            target: [penugasanSlot.jadwalId, penugasanSlot.tanggal, penugasanSlot.nim],
            set: { kelompokNomor: null, jenis, status: "diterima", dikonfirmasiOleh: oleh },
          });
    }
  });
}

/* ------------------------------------------------- penugasan (my side) */

interface SlotBantu {
  jadwalId: number;
  hari: number;
  slot: number;
  kelas: string;
  tanggal: string;
  /** Open groups that date (an izin without cover, or an empty seat). */
  kosong: number[];
  izin: { kode: string; nim: string; status: string }[];
  saya: "diminta" | "diterima" | "ditolak" | null;
  /** Who answered my offer. */
  oleh: string | null;
}

export async function handlePenugasanGet(
  _req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const db = getDb();
  const me = await muatOrang(session.nim);
  if (!me) return tolak(res, "tanpa_hak", 403);
  const hariIni = hariIniWib();
  const semester = semesterDariTanggal(hariIni);
  const rows = await db
    .select()
    .from(jadwal)
    .where(eq(jadwal.semester, semester))
    .orderBy(asc(jadwal.hari), asc(jadwal.slot));
  const minggu = await muatMinggu(db, rows, hariIni);
  const kodeSaya = me.kode.toUpperCase();

  // Saya Bantu: today's running slots that need someone.
  const bantu: SlotBantu[] = [];
  for (const j of rows) {
    const m = minggu.get(j.id)!;
    if (m.tanggal !== hariIni || m.status !== "aktif") continue;
    const kosong = m.kursi.filter((k) => !k.kode).map((k) => k.nomor);
    const cari = m.izin.filter((x) => x.status !== "dibatalkan" && !x.penggantiNim);
    // My own offer stays listed whatever came of it, so I see the answer.
    const tugasSaya = m.tugas.find((t) => t.nim === me.nim && t.jenis === "sukarela");
    const saya = tugasSaya?.status ?? null;
    if (!saya) {
      if (kosong.length === 0 && cari.length === 0) continue;
      if (orangTanggal(m.kursi, m.tugas).has(kodeSaya)) continue;
      if (m.kursi.some((k) => k.tetap === kodeSaya)) continue;
    }
    bantu.push({
      jadwalId: j.id,
      hari: j.hari,
      slot: j.slot,
      kelas: j.kelas,
      tanggal: m.tanggal,
      kosong,
      izin: cari.map((x) => ({ kode: x.kode, nim: x.nim, status: x.status })),
      saya,
      oleh: tugasSaya?.dikonfirmasiOleh ?? null,
    });
  }

  // Requests to me, offers I may confirm, my own offers.
  const permintaan: (TugasInfo & {
    jadwalId: number;
    hari: number;
    slot: number;
    tanggal: string;
  })[] = [];
  const tawaran: typeof permintaan = [];
  const milikku: typeof permintaan = [];
  const izinList: (IzinInfo & { jadwalId: number; hari: number; slot: number; tanggal: string })[] =
    [];
  for (const j of rows) {
    const m = minggu.get(j.id)!;
    const ctx = { jadwalId: j.id, hari: j.hari, slot: j.slot, tanggal: m.tanggal };
    const bolehKonfirmasi =
      boleh(me, "jadwal") || m.kursi.some((k) => k.kode === kodeSaya || k.tetap === kodeSaya);
    for (const t of m.tugas) {
      if (t.status !== "diminta") continue;
      if (t.nim === me.nim && t.dimintaOleh !== me.nim) permintaan.push({ ...t, ...ctx });
      else if (t.nim === me.nim) milikku.push({ ...t, ...ctx });
      else if (t.dimintaOleh === t.nim && bolehKonfirmasi) tawaran.push({ ...t, ...ctx });
    }
    if (boleh(me, "jadwal"))
      for (const x of m.izin) if (x.status !== "dibatalkan") izinList.push({ ...x, ...ctx });
  }
  res.status(200).json({ ok: true, hariIni, bantu, permintaan, tawaran, milikku, izin: izinList });
}

export async function handlePenugasanPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  const db = getDb();
  const me = await muatOrang(session.nim);
  if (!me) return tolak(res, "tanpa_hak", 403);
  const hariIni = hariIniWib();
  const semester = semesterDariTanggal(hariIni);

  if (aksi === "pengaturan") {
    if (!boleh(me, "jadwal"))
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
    const min = Number(body.min);
    const max = Number(body.max);
    const def = Number(body.default);
    const ok = (n: number) => Number.isInteger(n) && n >= JENDELA_MIN && n <= JENDELA_MAX;
    if (!ok(min) || !ok(max) || !ok(def) || min > def || def > max)
      return tolak(res, "format_salah");
    await db
      .insert(pengaturan)
      .values({ kunci: "jendela_mulai_default", nilai: def })
      .onConflictDoUpdate({ target: pengaturan.kunci, set: { nilai: def } });
    await db
      .insert(pengaturan)
      .values({ kunci: "jendela_mulai_batas", nilai: { min, max } })
      .onConflictDoUpdate({ target: pengaturan.kunci, set: { nilai: { min, max } } });
    await writeAudit(session.nim, "jadwal_pengaturan", { default: def, min, max });
    res.status(200).json({ ok: true });
    return;
  }

  // Everything else is about one slot's next date.
  const muatSlot = async (jadwalId: number) => {
    const [j] = await db.select().from(jadwal).where(eq(jadwal.id, jadwalId)).limit(1);
    if (!j || j.semester !== semester) return null;
    return { j, m: (await muatMinggu(db, [j], hariIni)).get(j.id)! };
  };
  const urusSlot = (m: MingguSlot) =>
    boleh(me, "jadwal") ||
    m.kursi.some((k) => k.kode === me.kode.toUpperCase() || k.tetap === me.kode.toUpperCase());

  if (aksi === "bantu") {
    const s = await muatSlot(posInt(body.jadwalId) ?? 0);
    if (!s) return tolak(res, "tidak_ditemukan");
    if (me.status !== "aktif") return tolak(res, "orang_tidak_aktif");
    if (s.m.status !== "aktif") return tolak(res, "slot_tidak_aktif");
    if (orangTanggal(s.m.kursi, s.m.tugas).has(me.kode.toUpperCase()))
      return tolak(res, "sudah_di_slot");
    await db
      .insert(penugasanSlot)
      .values({
        jadwalId: s.j.id,
        tanggal: s.m.tanggal,
        nim: me.nim,
        jenis: "sukarela",
        status: "diminta",
        dimintaOleh: me.nim,
      })
      .onConflictDoUpdate({
        target: [penugasanSlot.jadwalId, penugasanSlot.tanggal, penugasanSlot.nim],
        set: { status: "diminta", jenis: "sukarela", dimintaOleh: me.nim, kelompokNomor: null },
      });
    await writeAudit(session.nim, "penugasan_bantu", { jadwalId: s.j.id, tanggal: s.m.tanggal });
    res.status(200).json({ ok: true });
    return;
  }

  if (aksi === "minta") {
    const s = await muatSlot(posInt(body.jadwalId) ?? 0);
    const kelompokNomor = posInt(body.kelompok);
    const nim = typeof body.nim === "string" ? body.nim : "";
    if (!s) return tolak(res, "tidak_ditemukan");
    if (!urusSlot(s.m))
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
    const target = nim ? await muatOrang(nim) : null;
    if (!target || !kelompokNomor || kelompokNomor > s.j.jumlahKelompok)
      return tolak(res, "format_salah");
    if (target.status !== "aktif") return tolak(res, "orang_tidak_aktif");
    if (orangTanggal(s.m.kursi, s.m.tugas).has(target.kode.toUpperCase()))
      return tolak(res, "sudah_di_slot");
    await db
      .insert(penugasanSlot)
      .values({
        jadwalId: s.j.id,
        tanggal: s.m.tanggal,
        kelompokNomor,
        nim: target.nim,
        jenis: "pengganti",
        status: "diminta",
        dimintaOleh: me.nim,
      })
      .onConflictDoUpdate({
        target: [penugasanSlot.jadwalId, penugasanSlot.tanggal, penugasanSlot.nim],
        set: { kelompokNomor, jenis: "pengganti", status: "diminta", dimintaOleh: me.nim },
      });
    await writeAudit(session.nim, "penugasan_minta", {
      jadwalId: s.j.id,
      tanggal: s.m.tanggal,
      kelompokNomor,
      nim: target.nim,
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (aksi === "umumkan") {
    const s = await muatSlot(posInt(body.jadwalId) ?? 0);
    const nim = typeof body.nim === "string" ? body.nim : "";
    if (!s) return tolak(res, "tidak_ditemukan");
    if (!urusSlot(s.m))
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
    const x = s.m.izin.find((i) => i.nim === nim && i.status !== "dibatalkan");
    if (!x) return tolak(res, "izin_tidak_ada");
    await db.update(izin).set({ status: "dicari" }).where(eq(izin.id, x.id));
    await writeAudit(session.nim, "izin_umumkan", { jadwalId: s.j.id, tanggal: s.m.tanggal, nim });
    res.status(200).json({ ok: true });
    return;
  }

  if (aksi === "jawab" || aksi === "konfirmasi" || aksi === "batal") {
    const id = posInt(body.id);
    if (!id) return tolak(res, "format_salah");
    const [t] = await db.select().from(penugasanSlot).where(eq(penugasanSlot.id, id)).limit(1);
    if (!t || t.status !== "diminta") return tolak(res, "tidak_ditemukan");
    const s = await muatSlot(t.jadwalId);
    if (!s || s.m.tanggal !== t.tanggal) return tolak(res, "tidak_ditemukan");

    if (aksi === "batal") {
      if (t.nim !== me.nim) return res.status(403).json({ ok: false, kode: "tanpa_hak" });
      await db.delete(penugasanSlot).where(eq(penugasanSlot.id, t.id));
      await writeAudit(session.nim, "penugasan_batal", { id });
      res.status(200).json({ ok: true });
      return;
    }
    // jawab: the asked person answers; konfirmasi: the slot answers an offer.
    if (aksi === "jawab" && (t.nim !== me.nim || t.dimintaOleh === me.nim))
      return res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (aksi === "konfirmasi" && (t.dimintaOleh !== t.nim || !urusSlot(s.m)))
      return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
    const terima = body.terima === true;
    if (!terima) {
      await db
        .update(penugasanSlot)
        .set({ status: "ditolak", dikonfirmasiOleh: me.nim })
        .where(eq(penugasanSlot.id, t.id));
    } else {
      // Seat them: the asked group if it's still open, else the first open
      // group, else as a helper without one.
      const terbuka = s.m.kursi.filter((k) => !k.kode).map((k) => k.nomor);
      const kursi =
        t.kelompokNomor != null && terbuka.includes(t.kelompokNomor)
          ? t.kelompokNomor
          : (terbuka[0] ?? null);
      await db
        .update(penugasanSlot)
        .set({ status: "diterima", kelompokNomor: kursi, dikonfirmasiOleh: me.nim })
        .where(eq(penugasanSlot.id, t.id));
      // The izin of whoever held that seat is now covered.
      const tetap = kursi != null ? s.m.kursi[kursi - 1]?.tetap : null;
      const x = tetap ? s.m.izin.find((i) => i.kode === tetap && !i.penggantiNim) : null;
      if (x)
        await db
          .update(izin)
          .set({ penggantiNim: t.nim, status: "aktif" })
          .where(eq(izin.id, x.id));
    }
    await writeAudit(session.nim, aksi === "jawab" ? "penugasan_jawab" : "penugasan_konfirmasi", {
      id,
      terima,
    });
    res.status(200).json({ ok: true });
    return;
  }

  tolak(res, "format_salah");
}
