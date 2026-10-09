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
 * The schedule (GET/POST /api/session/schedule) moved to penugasan-api.ts in Phase 9.
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
  jawaban,
  jurnalTangkapan,
  kelompok,
  nilai,
  nilaiKirim,
  percobaanMasuk,
  sesi,
  sesiAnggota,
  sesiAsisten,
  sesiKelompok,
  telemetriLog,
  umpanBalik,
  NILAI_KOMPONEN,
} from "../../src/lib/schema.js";
import { jumlahCelahModul, kodeModul } from "./kode-aktif.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { validasiUmpanBalik, ringkas, sejakBulanLalu } from "../../src/lib/umpan-balik.js";
import type { Kelas } from "../../src/lib/kelas.js";
import { muatMinggu } from "./penugasan-api.js";
import { and, eq, asc, desc, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ALASAN_MIN, catatKejadian, catatPasangan, cekPasangan } from "./berjalan.js";

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
 * May this person run a session: end, extend, cancel, resume, announce,
 * write group notes (2026-10-07: an Asisten off the slot could end someone
 * else's class)? The same people as pairing changes: the slot's own
 * Asisten and substitutes, anyone holding a group in it, and the full
 * `pair` right. A TOT session is everyone's practice. `sesiId` null means
 * the running session; no session lets the action answer for itself.
 */
export async function cekKendaliSesi(
  res: ApiResponse,
  nim: string,
  sesiId: number | null,
): Promise<boolean> {
  const hak = await hakKendaliSesi(nim, sesiId);
  if (hak === "ok") return true;
  res.status(403).json({ ok: false, kode: hak, hak: "pair" });
  return false;
}

/** cekKendaliSesi without the answer, for screens that hide the controls. */
export async function hakKendaliSesi(
  nim: string,
  sesiId: number | null,
): Promise<"ok" | "tanpa_hak" | "bukan_slotmu"> {
  const db = getDb();
  const s =
    sesiId === null
      ? await currentSesi()
      : (
          await db
            .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot, jenis: sesi.jenis })
            .from(sesi)
            .where(eq(sesi.id, sesiId))
            .limit(1)
        )[0];
  if (!s || s.jenis === "tot") return "ok";
  const slotRow = await jadwalUntuk(db, s.tanggal, s.slot);
  return cekPasangan(db, nim, s.id, (kode) => {
    const k = kode.toUpperCase();
    return (
      !!slotRow &&
      (slotRow.asisten.some((x) => x.toUpperCase() === k) ||
        slotRow.pengganti.some((p) => p.kode.toUpperCase() === k))
    );
  });
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
  if (!slotRow) return { kelas, ditugaskan: 0 };
  // That date's seats: the semester pairing with its izin and covers
  // (Phase 9), group by group; groups past the slot's count stay open.
  const m = (await muatMinggu(db, [slotRow], created.tanggal)).get(slotRow.id);
  if (!m || m.status !== "aktif") return { kelas, ditugaskan: 0 };
  const groups = await db
    .select({ id: kelompok.id, nomor: kelompok.nomor })
    .from(kelompok)
    .where(eq(kelompok.aktif, true))
    .orderBy(asc(kelompok.nomor));
  const kursi = m.kursi;
  const kode = [...new Set(kursi.map((k) => k.kode).filter((k): k is string => !!k))];
  if (kode.length === 0) return { kelas, ditugaskan: 0 };
  const kodeKeNim = new Map(
    (
      await db
        .select({ nim: asisten.nim, kode: asisten.kode })
        .from(asisten)
        .where(inArray(asisten.kode, kode))
    ).map((r) => [r.kode.toUpperCase(), r.nim]),
  );
  const peta = new Map<number, string>();
  for (const g of groups) {
    const k = kursi[g.nomor - 1]?.kode;
    const nim = k ? kodeKeNim.get(k) : undefined;
    if (nim) peta.set(g.id, nim);
  }
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
  const [s] = await db
    .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot, jenis: sesi.jenis })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  // Phase 9: the "pair" right. Own slot for an Asisten, any for the rest.
  // A TOT session has no slot and is everyone's practice: any Asisten may
  // take a group in it (Mode TOT, 2026-10-05).
  const slotRow = await jadwalUntuk(db, s.tanggal, s.slot);
  const hak = await cekPasangan(db, session.nim, sesiId, (kode) => {
    const k = kode.toUpperCase();
    if (s.jenis === "tot") return true;
    return (
      !!slotRow &&
      (slotRow.asisten.some((x) => x.toUpperCase() === k) ||
        slotRow.pengganti.some((p) => p.kode.toUpperCase() === k))
    );
  });
  if (hak !== "ok") {
    res.status(403).json({ ok: false, kode: hak, hak: "pair" });
    return;
  }
  const sebelum = (await pemilikKelompok(db, sesiId)).get(kelompokId) ?? null;
  // A claim only takes a free group; taking over an owned one is its own,
  // explicitly confirmed action so it can never happen by accident.
  if (alasan === "klaim" && sebelum && sebelum !== session.nim) {
    res.status(200).json({ ok: false, kode: "sudah_dipegang", pemilik: sebelum });
    return;
  }
  const ke = alasan === "hapus" ? null : asistenNim;
  // A group losing the assistant it had needs a reason (Phase 9, c-run).
  const catatan = typeof body.catatan === "string" ? body.catatan.trim().slice(0, 300) : "";
  const berubah = sebelum !== ke;
  if (berubah && sebelum && catatan.length < ALASAN_MIN) {
    res.status(200).json({ ok: false, kode: "alasan_kosong" });
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
    if (alasan === "klaim") {
      // Two Asisten pressing Pegang at once both read the group as free
      // (2026-10-07); only the insert decides, the other is told who won.
      const masuk = await db
        .insert(sesiAsisten)
        .values({ sesiId, kelompokId, asistenNim: session.nim })
        .onConflictDoNothing()
        .returning({ id: sesiAsisten.id });
      if (!masuk.length) {
        const kini = (await pemilikKelompok(db, sesiId)).get(kelompokId) ?? null;
        res
          .status(200)
          .json(
            kini === session.nim
              ? { ok: true, pemilik: kini }
              : { ok: false, kode: "sudah_dipegang", pemilik: kini },
          );
        return;
      }
    } else
      await db
        .insert(sesiAsisten)
        .values({ sesiId, kelompokId, asistenNim: asistenNim! })
        .onConflictDoUpdate({
          target: [sesiAsisten.sesiId, sesiAsisten.kelompokId],
          set: { asistenNim: asistenNim!, diubahPada: new Date() },
        });
  }
  if (berubah) {
    await catatPasangan(db, {
      sesiId,
      kelompokId,
      dari: sebelum,
      ke,
      alasan: catatan || null,
      aktorNim: session.nim,
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
      ...(catatan ? { alasan: catatan } : {}),
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
  const db = getDb();
  if (aktif) {
    // One line per raised hand, and the first raise keeps its time: two
    // members pressing at once both saw it down and logged twice (2026-10-07).
    const naik = await db
      .insert(sesiKelompok)
      .values({ sesiId: running.id, kelompokId: session.kelompokId, mintaBantuanPada: new Date() })
      .onConflictDoUpdate({
        target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
        set: { mintaBantuanPada: new Date() },
        setWhere: isNull(sesiKelompok.mintaBantuanPada),
      })
      .returning({ pada: sesiKelompok.mintaBantuanPada });
    if (naik.length) {
      const [g] = await db
        .select({ nomor: kelompok.nomor })
        .from(kelompok)
        .where(eq(kelompok.id, session.kelompokId))
        .limit(1);
      await catatKejadian(
        running.id,
        "tangan",
        { kelompokId: session.kelompokId, nomor: g?.nomor ?? null },
        session.nim,
      );
    }
    const [kini] = await db
      .select({ pada: sesiKelompok.mintaBantuanPada })
      .from(sesiKelompok)
      .where(
        and(eq(sesiKelompok.sesiId, running.id), eq(sesiKelompok.kelompokId, session.kelompokId)),
      )
      .limit(1);
    res.status(200).json({ ok: true, mintaBantuanPada: kini?.pada?.toISOString() ?? null });
    return;
  }
  await db
    .insert(sesiKelompok)
    .values({ sesiId: running.id, kelompokId: session.kelompokId, mintaBantuanPada: null })
    .onConflictDoUpdate({
      target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
      set: { mintaBantuanPada: null },
    });
  res.status(200).json({ ok: true, mintaBantuanPada: null });
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
  const [naik] = await getDb()
    .select({ pada: sesiKelompok.mintaBantuanPada, nomor: kelompok.nomor })
    .from(sesiKelompok)
    .innerJoin(kelompok, eq(kelompok.id, sesiKelompok.kelompokId))
    .where(and(eq(sesiKelompok.sesiId, sesiId), eq(sesiKelompok.kelompokId, kelompokId)))
    .limit(1);
  if (naik?.pada) {
    await catatKejadian(
      sesiId,
      "tangan_jawab",
      {
        kelompokId,
        nomor: naik.nomor,
        detik: Math.max(0, Math.round((Date.now() - naik.pada.getTime()) / 1000)),
      },
      session.nim,
    );
  }
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
export async function sesiDiikuti(nim: string) {
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
  const [fb, skor, kirim, grup] = ids.length
    ? await Promise.all([
        db
          .select({ sesiId: umpanBalik.sesiId })
          .from(umpanBalik)
          .where(and(eq(umpanBalik.nim, session.nim), inArray(umpanBalik.sesiId, ids))),
        db
          .select({ sesiId: nilai.sesiId, komponen: nilai.komponen, skor: nilai.skor })
          .from(nilai)
          .where(and(eq(nilai.nim, session.nim), inArray(nilai.sesiId, ids))),
        db
          .select({ sesiId: nilaiKirim.sesiId, nomor: nilaiKirim.kelompokNomor })
          .from(nilaiKirim)
          .where(inArray(nilaiKirim.sesiId, ids)),
        db
          .select({ sesiId: sesiAnggota.sesiId, nomor: sesiAnggota.kelompokNomor })
          .from(sesiAnggota)
          .where(and(eq(sesiAnggota.nim, session.nim), inArray(sesiAnggota.sesiId, ids))),
      ])
    : [[], [], [], []];
  const sudah = new Set(fb.map((r) => r.sesiId));
  // Their group in each session (the roster snapshot, else today's group),
  // and whether its Asisten sent the scores (Kirim Nilai, 2026-10-09).
  const grupDi = new Map(grup.map((r) => [r.sesiId, r.nomor]));
  const terkirim = (sesiId: number) => {
    const nomor = grupDi.get(sesiId) ?? session.kelompokNomor ?? null;
    return kirim.some((k) => k.sesiId === sesiId && (nomor === null || k.nomor === nomor));
  };
  const praktikum = ikut.map((x) => {
    const kirimDi = terkirim(x.id);
    const mine = kirimDi ? skor.filter((r) => r.sesiId === x.id) : [];
    const isi = mine.map((r) => r.skor);
    return {
      sesiId: x.id,
      modul: x.modul,
      tanggal: x.tanggal,
      slot: x.slot,
      status: x.status,
      kelas: x.kelas,
      sudahUmpanBalik: sudah.has(x.id),
      terkirim: kirimDi,
      // Only their own row, never a groupmate's.
      skor: kirimDi ? Object.fromEntries(mine.map((r) => [r.komponen, r.skor])) : null,
      rataRata: isi.length ? Math.round(isi.reduce((a, b) => a + b, 0) / isi.length) : null,
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
  if (!v.ok) {
    if (v.kode === "butuh_alasan") {
      res.status(200).json({ ok: false, kode: v.kode, bagian: v.bagian });
      return;
    }
    return badRequest(res);
  }
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
  // Reports › Lab Feedback: the sessions the filter bar shows.
  const sesiIds =
    typeof req.query.sesiIds === "string"
      ? req.query.sesiIds.split(",").filter(Boolean).map(posInt)
      : null;
  if (sesiIds && (sesiIds.length > 1000 || sesiIds.some((x) => !x))) return badRequest(res);
  const db = getDb();
  const kondisi = [
    scope === "mine" ? eq(umpanBalik.asistenNim, session.nim) : undefined,
    sesiId ? eq(umpanBalik.sesiId, sesiId) : undefined,
    sesiIds ? inArray(umpanBalik.sesiId, sesiIds.length ? (sesiIds as number[]) : [0]) : undefined,
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
      modul: sesi.modul,
    })
    .from(umpanBalik)
    .leftJoin(sesi, eq(sesi.id, umpanBalik.sesiId))
    .where(kondisi.length ? and(...kondisi) : undefined);
  // Never select nim; Lab scope never exposes the Asisten half.
  const milik = rows.map((r) => ({
    rating: r.ratingAsisten,
    komentar: r.komentarAsisten,
    chips: r.chipsAsisten,
    pada: r.pada,
    modul: r.modul,
  }));
  const ringkasan =
    scope === "mine"
      ? { ...ringkas(milik), sejakBulanLalu: sejakBulanLalu(milik) }
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
  // Phase 9 (7g): the student's group in THIS session comes from the
  // session's roster snapshot; the cookie's group is the fallback.
  const [snap] = await db
    .select({ nomor: sesiAnggota.kelompokNomor })
    .from(sesiAnggota)
    .where(and(eq(sesiAnggota.sesiId, s.id), eq(sesiAnggota.nim, session.nim)))
    .limit(1);
  let kelompokId = session.sesiId === s.id ? (session.kelompokId ?? null) : null;
  let kelompokNomor = session.sesiId === s.id ? (session.kelompokNomor ?? null) : null;
  if (snap) {
    const [k] = await db
      .select({ id: kelompok.id })
      .from(kelompok)
      .where(eq(kelompok.nomor, snap.nomor))
      .limit(1);
    kelompokId = k?.id ?? kelompokId;
    kelompokNomor = snap.nomor;
  }
  let pemilik: { kode: string; nama: string } | null = null;
  if (kelompokId) {
    const [p] = await db
      .select({ kode: asisten.kode, nama: asisten.nama })
      .from(sesiAsisten)
      .innerJoin(asisten, eq(asisten.nim, sesiAsisten.asistenNim))
      .where(and(eq(sesiAsisten.sesiId, s.id), eq(sesiAsisten.kelompokId, kelompokId)))
      .limit(1);
    pemilik = p?.kode ? { kode: p.kode, nama: p.nama } : null;
  }
  // Groupmates' names only (never a NIM), the blanks, and the timeline.
  const [teman, isian, masuk, tangkap, tunda, dataPertama, bantuan] = await Promise.all([
    kelompokNomor
      ? db
          .select({ nama: sesiAnggota.nama })
          .from(sesiAnggota)
          .where(and(eq(sesiAnggota.sesiId, s.id), eq(sesiAnggota.kelompokNomor, kelompokNomor)))
          .orderBy(asc(sesiAnggota.nama))
      : Promise.resolve([] as { nama: string }[]),
    kelompokId
      ? db
          .select({
            benar: jawaban.benar,
            percobaan: jawaban.percobaan,
            pada: jawaban.diubahPada,
          })
          .from(jawaban)
          .where(and(eq(jawaban.sesiId, s.id), eq(jawaban.kelompokId, kelompokId)))
      : Promise.resolve([] as { benar: boolean; percobaan: number; pada: Date }[]),
    db
      .select({ pada: percobaanMasuk.pada })
      .from(percobaanMasuk)
      .where(
        and(
          eq(percobaanMasuk.sesiId, s.id),
          eq(percobaanMasuk.nim, session.nim),
          eq(percobaanMasuk.jenis, "praktikan"),
          eq(percobaanMasuk.berhasil, true),
        ),
      )
      .orderBy(asc(percobaanMasuk.pada))
      .limit(1),
    kelompokId
      ? db
          .select({ pada: jurnalTangkapan.dibuatPada, jenis: jurnalTangkapan.jenis })
          .from(jurnalTangkapan)
          .where(and(eq(jurnalTangkapan.sesiId, s.id), eq(jurnalTangkapan.kelompokId, kelompokId)))
          .orderBy(asc(jurnalTangkapan.id))
      : Promise.resolve([] as { pada: Date; jenis: string }[]),
    kelompokNomor
      ? db
          .select({ rata: sql<number | null>`round(avg(${telemetriLog.delayMs}))::int` })
          .from(telemetriLog)
          .where(
            and(
              eq(telemetriLog.sesiId, s.id),
              eq(telemetriLog.kelompokNomor, kelompokNomor),
              isNotNull(telemetriLog.delayMs),
            ),
          )
      : Promise.resolve([] as { rata: number | null }[]),
    // Phase 10's session log: the group's first reading and a raised hand.
    kelompokNomor
      ? db
          .select({ pada: sql<Date | null>`min(${telemetriLog.dicatatPada})` })
          .from(telemetriLog)
          .where(and(eq(telemetriLog.sesiId, s.id), eq(telemetriLog.kelompokNomor, kelompokNomor)))
      : Promise.resolve([] as { pada: Date | null }[]),
    kelompokId
      ? db
          .select({ pada: sesiKelompok.mintaBantuanPada })
          .from(sesiKelompok)
          .where(and(eq(sesiKelompok.sesiId, s.id), eq(sesiKelompok.kelompokId, kelompokId)))
          .limit(1)
      : Promise.resolve([] as { pada: Date | null }[]),
  ]);
  const benar = isian.filter((x) => x.benar);
  const total = jumlahCelahModul(await kodeModul(s.modul));
  const linimasa: { pada: string; jenis: string; n?: number; dari?: number; teks?: string }[] = [];
  const iso = (d: Date | string) => new Date(d).toISOString();
  if (s.mulaiPada) linimasa.push({ pada: iso(s.mulaiPada), jenis: "mulai" });
  if (masuk[0]) linimasa.push({ pada: masuk[0].pada.toISOString(), jenis: "masuk" });
  // Every right blank in the order it came: "1 of 5", "2 of 5", ...
  [...benar]
    .sort((a, b) => a.pada.getTime() - b.pada.getTime())
    .forEach((b, i) =>
      linimasa.push({ pada: b.pada.toISOString(), jenis: "blank", n: i + 1, dari: total }),
    );
  for (const x of isian)
    if (!x.benar && x.percobaan > 0) linimasa.push({ pada: x.pada.toISOString(), jenis: "salah" });
  if (dataPertama[0]?.pada) linimasa.push({ pada: iso(dataPertama[0].pada), jenis: "data" });
  if (s.pengumuman && s.pengumumanPada)
    linimasa.push({ pada: iso(s.pengumumanPada), jenis: "info", teks: s.pengumuman });
  if (bantuan[0]?.pada) linimasa.push({ pada: iso(bantuan[0].pada), jenis: "bantu" });
  for (const t of tangkap)
    linimasa.push({ pada: t.pada.toISOString(), jenis: t.jenis === "jarak" ? "jarak" : "tangkap" });
  if (s.selesaiPada) linimasa.push({ pada: s.selesaiPada.toISOString(), jenis: "selesai" });
  linimasa.sort((a, b) => a.pada.localeCompare(b.pada));
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
    .select({ kode: asisten.kode, nama: asisten.nama })
    .from(asisten)
    .where(terlibat.length ? inArray(asisten.nim, terlibat) : undefined);
  const namaKode = new Map<string, string>();
  for (const r of kodeRows) if (r.kode) namaKode.set(r.kode.toUpperCase(), r.nama);
  const pilihanAsisten = [...namaKode.keys()].sort();
  // Phase 9: the feedback picker shows "Full Name (CODE)".
  const pilihanOrang = pilihanAsisten.map((kode) => ({ kode, nama: namaKode.get(kode) ?? kode }));
  const base = {
    ok: true,
    sesi: {
      id: s.id,
      modul: s.modul,
      status: s.status,
      kelas: s.kelas,
      tanggal: s.tanggal,
      selesaiPada: s.selesaiPada,
    },
    asisten: pemilik,
    pilihanAsisten,
    pilihanOrang,
    sudahUmpanBalik: Boolean(fb),
    kelompok: kelompokNomor ? { nomor: kelompokNomor, anggota: teman.map((x) => x.nama) } : null,
    blank: { benar: benar.length, total },
    tangkapan: tangkap.filter((x) => x.jenis === "paket").length,
    delayRata: tunda[0]?.rata ?? null,
    linimasa,
  };
  // Scores show once the group's Asisten sent them (Kirim Nilai,
  // 2026-10-09), while the session runs or after; only the caller's own.
  const [kirim] = kelompokNomor
    ? await db
        .select({ id: nilaiKirim.id })
        .from(nilaiKirim)
        .where(and(eq(nilaiKirim.sesiId, s.id), eq(nilaiKirim.kelompokNomor, kelompokNomor)))
        .limit(1)
    : [];
  if (!kirim) {
    res.status(200).json({ ...base, terkirim: false, skor: null });
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
  res.status(200).json({
    ...base,
    terkirim: true,
    skor,
    rataRata: rata,
    lengkap: isi.length === NILAI_KOMPONEN.length,
  });
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
