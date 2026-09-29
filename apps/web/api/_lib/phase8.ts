/**
 * Phase 8 handlers, dispatched from api/session/[aksi].ts (so the function
 * count stays at 9; files under api/_lib are not functions). Route names
 * are English, like every other API path:
 *
 * GET  /api/session/assignment?sesiId=            — asisten. Group -> assistant for one session, plus the slot's substitutes.
 * POST /api/session/assignment { sesiId, kelompokId, asistenNim|null, alasan } — asisten. Assign, claim, take over or clear.
 * POST /api/session/help { aktif }                 — praktikan. Raise or lower the group's hand in the running session.
 * POST /api/session/help { sesiId, kelompokId }    — asisten. Mark a raised hand as handled.
 * POST /api/session/feedback { asistenNim, ratingAsisten, ... } — praktikan. Once per student per session.
 * GET  /api/session/feedback?scope=mine|lab&sesiId= — asisten. Own Asisten ratings, or everyone's Lab ratings. Never a NIM.
 * GET  /api/session/results                         — praktikan. Own scores for the session in the cookie, once it ended.
 * GET  /api/session/schedule?semester=              — asisten. The imported teaching schedule.
 * POST /api/session/schedule { semester, teksDefault, teksPengganti?, simpan? } — asisten. Preview or replace a semester.
 * POST /api/session/schedule { semester, hari, slot, ubah } — asisten. Edit one slot.
 */
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  anggota,
  jadwal,
  kelompok,
  nilai,
  percobaanMasuk,
  sesi,
  sesiAsisten,
  sesiKelompok,
  umpanBalik,
  NILAI_KOMPONEN,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { bagiKelompok } from "../../src/lib/penugasan.js";
import {
  buildJadwal,
  hariDariTanggal,
  semesterDariTanggal,
  type TagPengganti,
} from "../../src/lib/jadwal-parser.js";
import { validasiUmpanBalik, ringkas } from "../../src/lib/umpan-balik.js";
import { isKelas, type Kelas } from "../../src/lib/kelas.js";
import { and, eq, asc, desc, inArray } from "drizzle-orm";

type Db = ReturnType<typeof getDb>;

function badRequest(res: ApiResponse) {
  res.status(200).json({ ok: false, kode: "format_salah" });
}

function posInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------ schedule */

/** The schedule slot a session occupies, if one was imported. */
export async function jadwalUntuk(db: Db, tanggal: string, slot: number | null) {
  if (slot === null) return null;
  const hari = hariDariTanggal(tanggal);
  const [row] = await db
    .select()
    .from(jadwal)
    .where(
      and(
        eq(jadwal.semester, semesterDariTanggal(tanggal)),
        eq(jadwal.hari, hari),
        eq(jadwal.slot, slot),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Called right after a session is created: take its class type from the
 * schedule (unless the assistant chose one explicitly) and prefill one
 * assistant per group from the slot's default codes. Best effort: a slot
 * with no schedule row simply starts unassigned, exactly like before
 * Phase 8.
 */
export async function siapkanSesiDariJadwal(
  db: Db,
  created: { id: number; tanggal: string; slot: number | null },
  kelasDiminta: Kelas | null,
): Promise<{ kelas: Kelas; ditugaskan: number }> {
  const slotRow = await jadwalUntuk(db, created.tanggal, created.slot);
  const kelas: Kelas = kelasDiminta ?? (slotRow?.kelas as Kelas | undefined) ?? "reguler";
  await db.update(sesi).set({ kelas }).where(eq(sesi.id, created.id));
  if (!slotRow || slotRow.status !== "aktif" || slotRow.asisten.length === 0) {
    return { kelas, ditugaskan: 0 };
  }
  const kodeKeNim = new Map(
    (
      await db
        .select({ nim: asisten.nim, kode: asisten.kode })
        .from(asisten)
        .where(inArray(asisten.kode, slotRow.asisten))
    ).map((r) => [r.kode.toUpperCase(), r.nim]),
  );
  const nims = slotRow.asisten
    .map((k) => kodeKeNim.get(k.toUpperCase()))
    .filter((n): n is string => !!n);
  const groups = await db
    .select({ id: kelompok.id })
    .from(kelompok)
    .where(eq(kelompok.aktif, true))
    .orderBy(asc(kelompok.nomor));
  const peta = bagiKelompok(
    nims,
    groups.map((g) => g.id),
  );
  if (peta.size === 0) return { kelas, ditugaskan: 0 };
  await db
    .insert(sesiAsisten)
    .values(
      [...peta.entries()].map(([kelompokId, asistenNim]) => ({
        sesiId: created.id,
        kelompokId,
        asistenNim,
      })),
    )
    .onConflictDoNothing();
  return { kelas, ditugaskan: peta.size };
}

export async function handleScheduleGet(req: ApiRequest, res: ApiResponse) {
  const semester = typeof req.query.semester === "string" ? req.query.semester : "";
  const db = getDb();
  const rows = await db
    .select()
    .from(jadwal)
    .where(semester ? eq(jadwal.semester, semester) : undefined)
    .orderBy(asc(jadwal.hari), asc(jadwal.slot));
  const daftarAsisten = await db
    .select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama })
    .from(asisten)
    .orderBy(asc(asisten.kode));
  res.status(200).json({ ok: true, jadwal: rows, asisten: daftarAsisten });
}

const SEMESTER_RE = /^\d{4}-(ganjil|genap)$/;

export async function handleSchedulePost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const semester = typeof body.semester === "string" ? body.semester : "";
  if (!SEMESTER_RE.test(semester)) return badRequest(res);
  const db = getDb();

  // One-slot edit
  if (body.ubah && typeof body.ubah === "object") {
    const hari = posInt(body.hari);
    const slot = posInt(body.slot);
    const ubah = body.ubah as Record<string, unknown>;
    if (!hari || hari > 6 || !slot || slot > 4) return badRequest(res);
    const patch: Partial<typeof jadwal.$inferInsert> = { diubahPada: new Date() };
    if (ubah.kelas !== undefined) {
      if (!isKelas(ubah.kelas)) return badRequest(res);
      patch.kelas = ubah.kelas;
    }
    if (ubah.status !== undefined) {
      if (ubah.status !== "aktif" && ubah.status !== "segera") return badRequest(res);
      patch.status = ubah.status;
    }
    if (ubah.asisten !== undefined) {
      if (!Array.isArray(ubah.asisten) || !ubah.asisten.every((k) => typeof k === "string"))
        return badRequest(res);
      patch.asisten = (ubah.asisten as string[]).map((k) => k.toUpperCase());
    }
    if (ubah.pengganti !== undefined) {
      const p = ubah.pengganti;
      const tags: TagPengganti[] = ["fit", "a24", null];
      if (
        !Array.isArray(p) ||
        !p.every((x) => x && typeof x.kode === "string" && tags.includes(x.tag ?? null))
      )
        return badRequest(res);
      patch.pengganti = p.map((x) => ({ kode: String(x.kode).toUpperCase(), tag: x.tag ?? null }));
    }
    await db
      .insert(jadwal)
      .values({ semester, hari, slot, ...patch })
      .onConflictDoUpdate({ target: [jadwal.semester, jadwal.hari, jadwal.slot], set: patch });
    await writeAudit(session.nim, "jadwal_ubah", { semester, hari, slot, ubah });
    res.status(200).json({ ok: true });
    return;
  }

  // Paste import (preview, or replace the whole semester when simpan)
  const teksDefault = typeof body.teksDefault === "string" ? body.teksDefault : "";
  const teksPengganti = typeof body.teksPengganti === "string" ? body.teksPengganti : "";
  if (!teksDefault.trim() || teksDefault.length > 50_000 || teksPengganti.length > 50_000)
    return badRequest(res);
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
    await tx.insert(jadwal).values(hasil.slot.map((s) => ({ semester, ...s })));
  });
  await writeAudit(session.nim, "jadwal_impor", { semester, slot: hasil.slot.length });
  res.status(200).json({ ok: true, disimpan: hasil.slot.length, pratinjau: hasil });
}

/* ---------------------------------------------------------- assignment */

/** Group id -> assigned assistant NIM for one session. */
export async function pemilikKelompok(db: Db, sesiId: number): Promise<Map<number, string>> {
  const rows = await db
    .select({ kelompokId: sesiAsisten.kelompokId, asistenNim: sesiAsisten.asistenNim })
    .from(sesiAsisten)
    .where(eq(sesiAsisten.sesiId, sesiId));
  return new Map(rows.map((r) => [r.kelompokId, r.asistenNim]));
}

export async function handleAssignmentGet(req: ApiRequest, res: ApiResponse) {
  const sesiId = posInt(req.query.sesiId);
  if (!sesiId) return badRequest(res);
  const db = getDb();
  const [s] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const rows = await db
    .select({
      kelompokId: sesiAsisten.kelompokId,
      asistenNim: sesiAsisten.asistenNim,
      kode: asisten.kode,
      nama: asisten.nama,
      diubahPada: sesiAsisten.diubahPada,
    })
    .from(sesiAsisten)
    .innerJoin(asisten, eq(asisten.nim, sesiAsisten.asistenNim))
    .where(eq(sesiAsisten.sesiId, sesiId));
  const slotRow = await jadwalUntuk(db, s.tanggal, s.slot);
  const daftarAsisten = await db
    .select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama })
    .from(asisten)
    .orderBy(asc(asisten.kode));
  res.status(200).json({
    ok: true,
    kelas: s.kelas,
    penugasan: rows,
    jadwal: slotRow
      ? { asisten: slotRow.asisten, pengganti: slotRow.pengganti, kelas: slotRow.kelas }
      : null,
    asisten: daftarAsisten,
  });
}

const ALASAN = new Set(["ubah", "klaim", "ambil_alih", "hapus"]);

export async function handleAssignmentPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const sesiId = posInt(body.sesiId);
  const kelompokId = posInt(body.kelompokId);
  const alasan = typeof body.alasan === "string" ? body.alasan : "ubah";
  const asistenNim =
    alasan === "klaim" || alasan === "ambil_alih"
      ? session.nim
      : typeof body.asistenNim === "string" && body.asistenNim.trim()
        ? body.asistenNim.trim()
        : null;
  if (!sesiId || !kelompokId || !ALASAN.has(alasan) || (alasan !== "hapus" && !asistenNim)) {
    return badRequest(res);
  }
  const db = getDb();
  const [s] = await db.select({ id: sesi.id }).from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const sebelum = (await pemilikKelompok(db, sesiId)).get(kelompokId) ?? null;
  // A claim only takes a free group; taking over an owned one is its own,
  // explicitly confirmed action so it can never happen by accident.
  if (alasan === "klaim" && sebelum && sebelum !== session.nim) {
    res.status(200).json({ ok: false, kode: "sudah_dipegang", pemilik: sebelum });
    return;
  }
  if (alasan === "hapus") {
    await db
      .delete(sesiAsisten)
      .where(and(eq(sesiAsisten.sesiId, sesiId), eq(sesiAsisten.kelompokId, kelompokId)));
  } else {
    const [ada] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, asistenNim!))
      .limit(1);
    if (!ada) {
      res.status(200).json({ ok: false, kode: "asisten_tidak_ada" });
      return;
    }
    await db
      .insert(sesiAsisten)
      .values({ sesiId, kelompokId, asistenNim: asistenNim! })
      .onConflictDoUpdate({
        target: [sesiAsisten.sesiId, sesiAsisten.kelompokId],
        set: { asistenNim: asistenNim!, diubahPada: new Date() },
      });
  }
  await writeAudit(
    session.nim,
    alasan === "ambil_alih" ? "penugasan_ambil_alih" : "penugasan_ubah",
    {
      sesiId,
      kelompokId,
      dari: sebelum,
      ke: asistenNim,
    },
  );
  res.status(200).json({ ok: true, pemilik: asistenNim });
}

/* -------------------------------------------------------- raise a hand */

export async function handleHelpPraktikan(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const running = await currentSesi();
  if (!running || session.sesiId !== running.id || !session.kelompokId) {
    res.status(200).json({ ok: false, kode: "sesi_berganti" });
    return;
  }
  const aktif = Boolean(jsonBody(req).aktif);
  const pada = aktif ? new Date() : null;
  const db = getDb();
  await db
    .insert(sesiKelompok)
    .values({ sesiId: running.id, kelompokId: session.kelompokId, mintaBantuanPada: pada })
    .onConflictDoUpdate({
      target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
      set: { mintaBantuanPada: pada },
    });
  res.status(200).json({ ok: true, mintaBantuanPada: pada?.toISOString() ?? null });
}

export async function handleHelpAsisten(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const sesiId = posInt(body.sesiId);
  const kelompokId = posInt(body.kelompokId);
  if (!sesiId || !kelompokId) return badRequest(res);
  await getDb()
    .update(sesiKelompok)
    .set({ mintaBantuanPada: null })
    .where(and(eq(sesiKelompok.sesiId, sesiId), eq(sesiKelompok.kelompokId, kelompokId)));
  await writeAudit(session.nim, "bantuan_selesai", { sesiId, kelompokId });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ feedback */

/** Sessions this student attended (signed in to while it ran), newest
 *  first. The same attendance rule as akses.ts's modulDiikuti. */
async function sesiDiikuti(nim: string) {
  return getDb()
    .selectDistinct({
      id: sesi.id,
      modul: sesi.modul,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      status: sesi.status,
      kelas: sesi.kelas,
    })
    .from(percobaanMasuk)
    .innerJoin(sesi, eq(sesi.id, percobaanMasuk.sesiId))
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
        inArray(sesi.status, ["berjalan", "selesai"]),
      ),
    )
    .orderBy(desc(sesi.tanggal), desc(sesi.id));
}

/** The session a student's request is about: an explicit sesiId they
 *  attended, else the one their cookie belongs to, else their latest. */
async function sesiPraktikan(session: SessionPayload, diminta?: unknown) {
  const id = diminta === undefined || diminta === null || diminta === "" ? null : posInt(diminta);
  if (id === null && session.sesiId) {
    const [s] = await getDb().select().from(sesi).where(eq(sesi.id, session.sesiId)).limit(1);
    if (s) return s;
  }
  const ikut = await sesiDiikuti(session.nim);
  const pilih = id === null ? ikut[0] : ikut.find((x) => x.id === id);
  if (!pilih) return null;
  const [s] = await getDb().select().from(sesi).where(eq(sesi.id, pilih.id)).limit(1);
  return s ?? null;
}

/** GET /api/session/mine — praktikan: every practicum they attended, with
 *  their scores once it ended and whether they gave feedback. Feedback
 *  stays open for any ended practicum, at any later time. */
export async function handleMine(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const ikut = await sesiDiikuti(session.nim);
  const ids = ikut.map((x) => x.id);
  const db = getDb();
  const [fb, skor] = ids.length
    ? await Promise.all([
        db
          .select({ sesiId: umpanBalik.sesiId })
          .from(umpanBalik)
          .where(and(eq(umpanBalik.nim, session.nim), inArray(umpanBalik.sesiId, ids))),
        db
          .select({ sesiId: nilai.sesiId, komponen: nilai.komponen, skor: nilai.skor })
          .from(nilai)
          .where(and(eq(nilai.nim, session.nim), inArray(nilai.sesiId, ids))),
      ])
    : [[], []];
  const sudah = new Set(fb.map((r) => r.sesiId));
  const praktikum = ikut.map((x) => {
    const mine = skor.filter((r) => r.sesiId === x.id);
    const isi = mine.map((r) => r.skor);
    return {
      sesiId: x.id,
      modul: x.modul,
      tanggal: x.tanggal,
      slot: x.slot,
      status: x.status,
      kelas: x.kelas,
      sudahUmpanBalik: sudah.has(x.id),
      rataRata:
        x.status === "selesai" && isi.length
          ? Math.round(isi.reduce((a, b) => a + b, 0) / isi.length)
          : null,
    };
  });
  res.status(200).json({ ok: true, praktikum });
}

export async function handleFeedbackPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const s = await sesiPraktikan(session, body.sesiId);
  if (!s || s.status === "batal" || s.status === "terjadwal") {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  // Feedback is about a practicum the student has finished.
  if (s.status !== "selesai") {
    res.status(200).json({ ok: false, kode: "belum_selesai" });
    return;
  }
  const db = getDb();
  // The form sends the assistant's code, never their NIM (a NIM is the
  // assistant's login name, so students are never shown one).
  if (typeof body.asistenKode === "string" && body.asistenNim === undefined) {
    const [k] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.kode, body.asistenKode.trim().toUpperCase()))
      .limit(1);
    body.asistenNim = k?.nim ?? "";
  }
  const v = validasiUmpanBalik(body);
  if (!v.ok) return badRequest(res);
  const [ada] = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(eq(asisten.nim, v.nilai.asistenNim))
    .limit(1);
  if (!ada) {
    res.status(200).json({ ok: false, kode: "asisten_tidak_ada" });
    return;
  }
  const inserted = await db
    .insert(umpanBalik)
    .values({ sesiId: s.id, nim: session.nim, ...v.nilai })
    .onConflictDoNothing()
    .returning({ id: umpanBalik.id });
  if (inserted.length === 0) {
    res.status(200).json({ ok: false, kode: "sudah_dikirim" });
    return;
  }
  res.status(200).json({ ok: true });
}

export async function handleFeedbackGet(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const scope = req.query.scope === "lab" ? "lab" : "mine";
  const sesiId = req.query.sesiId === undefined ? null : posInt(req.query.sesiId);
  if (req.query.sesiId !== undefined && !sesiId) return badRequest(res);
  const db = getDb();
  const kondisi = [
    scope === "mine" ? eq(umpanBalik.asistenNim, session.nim) : undefined,
    sesiId ? eq(umpanBalik.sesiId, sesiId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db
    .select({
      ratingAsisten: umpanBalik.ratingAsisten,
      komentarAsisten: umpanBalik.komentarAsisten,
      chipsAsisten: umpanBalik.chipsAsisten,
      ratingLab: umpanBalik.ratingLab,
      komentarLab: umpanBalik.komentarLab,
      chipsLab: umpanBalik.chipsLab,
      pada: umpanBalik.dibuatPada,
    })
    .from(umpanBalik)
    .where(kondisi.length ? and(...kondisi) : undefined);
  // Never select nim; Lab scope never exposes the Asisten half.
  const ringkasan =
    scope === "mine"
      ? ringkas(
          rows.map((r) => ({
            rating: r.ratingAsisten,
            komentar: r.komentarAsisten,
            chips: r.chipsAsisten,
            pada: r.pada,
          })),
        )
      : ringkas(
          rows.map((r) => ({
            rating: r.ratingLab,
            komentar: r.komentarLab,
            chips: r.chipsLab,
            pada: r.pada,
          })),
        );
  res.status(200).json({ ok: true, scope, ringkasan });
}

/* ------------------------------------------------------------- results */

export async function handleResults(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const s = await sesiPraktikan(session, req.query.sesiId);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const db = getDb();
  const [fb] = await db
    .select({ id: umpanBalik.id })
    .from(umpanBalik)
    .where(and(eq(umpanBalik.sesiId, s.id), eq(umpanBalik.nim, session.nim)))
    .limit(1);
  let pemilik: { kode: string } | null = null;
  if (session.kelompokId) {
    const [p] = await db
      .select({ kode: asisten.kode })
      .from(sesiAsisten)
      .innerJoin(asisten, eq(asisten.nim, sesiAsisten.asistenNim))
      .where(and(eq(sesiAsisten.sesiId, s.id), eq(sesiAsisten.kelompokId, session.kelompokId)))
      .limit(1);
    pemilik = p?.kode ? { kode: p.kode } : null;
  }
  // Who the student can credit: the session's assigned assistants and anyone
  // who graded in it; when neither exists yet, every assistant with a code.
  const [ditugaskan, penilai] = await Promise.all([
    db
      .select({ nim: sesiAsisten.asistenNim })
      .from(sesiAsisten)
      .where(eq(sesiAsisten.sesiId, s.id)),
    db.selectDistinct({ nim: nilai.diubahOleh }).from(nilai).where(eq(nilai.sesiId, s.id)),
  ]);
  const terlibat = [
    ...new Set([...ditugaskan, ...penilai].map((r) => r.nim).filter((n): n is string => !!n)),
  ];
  const kodeRows = await db
    .select({ kode: asisten.kode })
    .from(asisten)
    .where(terlibat.length ? inArray(asisten.nim, terlibat) : undefined);
  const pilihanAsisten = [
    ...new Set(kodeRows.map((r) => r.kode?.toUpperCase()).filter((k): k is string => !!k)),
  ].sort();
  const base = {
    ok: true,
    sesi: { id: s.id, modul: s.modul, status: s.status, kelas: s.kelas },
    asisten: pemilik,
    pilihanAsisten,
    sudahUmpanBalik: Boolean(fb),
  };
  // Scores are only shown once the session has ended.
  if (s.status !== "selesai") {
    res.status(200).json({ ...base, skor: null });
    return;
  }
  const rows = await db
    .select({ komponen: nilai.komponen, skor: nilai.skor })
    .from(nilai)
    .where(and(eq(nilai.sesiId, s.id), eq(nilai.nim, session.nim)));
  const skor: Partial<Record<(typeof NILAI_KOMPONEN)[number], number>> = {};
  for (const r of rows) skor[r.komponen] = r.skor;
  const isi = NILAI_KOMPONEN.filter((k) => skor[k] != null);
  const rata = isi.length
    ? Math.round(isi.reduce((a, k) => a + (skor[k] ?? 0), 0) / isi.length)
    : null;
  res
    .status(200)
    .json({ ...base, skor, rataRata: rata, lengkap: isi.length === NILAI_KOMPONEN.length });
}

/* --------------------------------------------- helpers for other actions */

/** Raised hands for a session, for the board (group id -> ISO time). */
export async function tanganTerangkat(db: Db, sesiId: number): Promise<Record<number, string>> {
  const rows = await db
    .select({ kelompokId: sesiKelompok.kelompokId, pada: sesiKelompok.mintaBantuanPada })
    .from(sesiKelompok)
    .where(eq(sesiKelompok.sesiId, sesiId));
  const out: Record<number, string> = {};
  for (const r of rows) if (r.pada) out[r.kelompokId] = r.pada.toISOString();
  return out;
}

/** The member row for a NIM (its group), used by the score ownership check. */
export async function kelompokDariNim(db: Db, nim: string): Promise<number | null> {
  const [m] = await db
    .select({ kelompokId: anggota.kelompokId })
    .from(anggota)
    .where(eq(anggota.nim, nim))
    .limit(1);
  return m?.kelompokId ?? null;
}
