/**
 * Reports data (Phase 9 Stage 6b, mockups r-home and r-session), behind
 * /api/session/:aksi. Asisten only.
 *
 * GET  /api/session/riwayat            every held session (running or
 *      finished) with what each Reports tab sums: pairing, attendance,
 *      scores, blanks, lab feedback, delays, covers. Filters run in the
 *      browser (src/lib/laporan.ts), so one fetch serves every tab.
 * GET  /api/session/kejadian?sesiId=   one session's incident log, or
 *      ?sesiIds=1,2,3 for several (oldest first).
 * POST /api/session/kejadian           Asisten notes in that log:
 *      { aksi: "tambah", sesiId, teks, jam? }   jam "HH:MM" on the session day
 *      { aksi: "ubah", id, teks }
 *      { aksi: "hapus", id }                    the audit log keeps a copy
 *      { aksi: "pulih", sesiId, teks, pada, penulis }   Undo of a delete
 *      System lines (start, pairing, SeeLabs account, raised hands) can't
 *      be changed.
 * GET  /api/session/rekap?sesiId=      one session's page: the session,
 *      each group's holder, SeeLabs account and status, attendance, blanks
 *      and delays, the session's written note, the score change log, and
 *      the feedback (Lab for everyone, "your rating" only for a holder).
 * POST /api/session/rekap { sesiId, teks }   saves the session's written
 *      note (one per session, shared, the last writer shown).
 * GET  /api/session/audit?jenis=&aktor=&dari=&sampai=&sebelum=
 *      the audit log, newest first, 100 lines a page (sebelum = the last
 *      id seen). jenis is a Reports › Audit tab (src/lib/audit-jenis.ts).
 *      Each page carries the sessions, groups, slots and servers its lines
 *      point at, so the browser can write them as sentences.
 */
import { and, asc, desc, eq, gte, inArray, isNull, like, lt, lte, not, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { jumlahCelahModul, jumlahCelahPer, kodeModul } from "./kode-aktif.js";
import { muatSeelabs } from "./seelabs.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  audit,
  jadwal,
  jawaban,
  kelompok,
  laporan,
  nilai,
  penugasanSlot,
  percobaanMasuk,
  sesi,
  sesiAnggota,
  sesiAsisten,
  server,
  sesiKejadian,
  telemetriLog,
  umpanBalik,
} from "../../src/lib/schema.js";
import { AKSI_PER_JENIS, isJenisAudit } from "../../src/lib/audit-jenis.js";
import { ringkas } from "../../src/lib/umpan-balik.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { SesiLaporan } from "../../src/lib/laporan.js";

type Db = ReturnType<typeof getDb>;

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const KEJADIAN_TEKS_MAKS = 1000;
export const CATATAN_SESI_MAKS = 20_000;

/** Members per session: the snapshot taken at start, or for older
 *  sessions without one, today's master roster. */
async function anggotaPerSesi(db: Db, ids: number[]) {
  const snap = ids.length
    ? await db
        .select({
          sesiId: sesiAnggota.sesiId,
          nomor: sesiAnggota.kelompokNomor,
          nim: sesiAnggota.nim,
        })
        .from(sesiAnggota)
        .where(inArray(sesiAnggota.sesiId, ids))
    : [];
  const per = new Map<number, { nomor: number; nim: string }[]>();
  for (const r of snap) per.set(r.sesiId, [...(per.get(r.sesiId) ?? []), r]);
  if (ids.some((id) => !per.has(id))) {
    const master = await db
      .select({ nomor: kelompok.nomor, nim: anggota.nim })
      .from(anggota)
      .innerJoin(kelompok, eq(kelompok.id, anggota.kelompokId));
    for (const id of ids) if (!per.has(id)) per.set(id, master);
  }
  return per;
}

export async function handleRiwayatLaporan(req: ApiRequest, res: ApiResponse) {
  const dari = typeof req.query.dari === "string" ? req.query.dari : null;
  if (dari && !TANGGAL_RE.test(dari)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(sesi)
    .where(
      and(
        inArray(sesi.status, ["berjalan", "selesai"]),
        dari ? gte(sesi.tanggal, dari) : undefined,
      ),
    )
    .orderBy(desc(sesi.tanggal), desc(sesi.mulai));
  const ids = rows.map((r) => r.id);
  if (!ids.length) {
    res.status(200).json({ ok: true, sesi: [] });
    return;
  }

  const mulaiPaling = rows.reduce<Date | null>((a, r) => {
    const m = r.mulaiPada ?? r.dibuatPada;
    return !a || m < a ? m : a;
  }, null);
  const [tugas, member, masuk, masukLama, skor, blank, delay, lab, pasangan, tutup] =
    await Promise.all([
      db
        .select({ sesiId: sesiAsisten.sesiId, nomor: kelompok.nomor, nim: sesiAsisten.asistenNim })
        .from(sesiAsisten)
        .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
        .where(inArray(sesiAsisten.sesiId, ids)),
      anggotaPerSesi(db, ids),
      db
        .selectDistinct({ sesiId: percobaanMasuk.sesiId, nim: percobaanMasuk.nim })
        .from(percobaanMasuk)
        .where(
          and(
            eq(percobaanMasuk.jenis, "praktikan"),
            eq(percobaanMasuk.berhasil, true),
            inArray(percobaanMasuk.sesiId, ids),
          ),
        ),
      // Logins recorded before attempts carried a session (P6.2): matched
      // to a session by time.
      db
        .select({ nim: percobaanMasuk.nim, pada: percobaanMasuk.pada })
        .from(percobaanMasuk)
        .where(
          and(
            eq(percobaanMasuk.jenis, "praktikan"),
            eq(percobaanMasuk.berhasil, true),
            isNull(percobaanMasuk.sesiId),
            mulaiPaling ? gte(percobaanMasuk.pada, mulaiPaling) : undefined,
          ),
        ),
      db
        .select({ sesiId: nilai.sesiId, nim: nilai.nim, skor: nilai.skor })
        .from(nilai)
        .where(inArray(nilai.sesiId, ids)),
      db
        .select({
          sesiId: jawaban.sesiId,
          benar: sql<number>`count(*) filter (where ${jawaban.benar})::int`,
        })
        .from(jawaban)
        .where(inArray(jawaban.sesiId, ids))
        .groupBy(jawaban.sesiId),
      db
        .select({
          sesiId: telemetriLog.sesiId,
          jumlah: sql<number>`coalesce(sum(${telemetriLog.delayMs}), 0)::float`,
          n: sql<number>`count(${telemetriLog.delayMs})::int`,
        })
        .from(telemetriLog)
        .where(inArray(telemetriLog.sesiId, ids))
        .groupBy(telemetriLog.sesiId),
      db
        .select({
          sesiId: umpanBalik.sesiId,
          jumlah: sql<number>`sum(${umpanBalik.ratingLab})::int`,
          n: sql<number>`count(*)::int`,
        })
        .from(umpanBalik)
        .where(inArray(umpanBalik.sesiId, ids))
        .groupBy(umpanBalik.sesiId),
      db
        .select({ sesiId: sesiKejadian.sesiId, detail: sesiKejadian.detail })
        .from(sesiKejadian)
        .where(and(inArray(sesiKejadian.sesiId, ids), eq(sesiKejadian.jenis, "pasangan"))),
      db
        .select({
          tanggal: penugasanSlot.tanggal,
          nim: penugasanSlot.nim,
          slot: jadwal.slot,
          nomor: penugasanSlot.kelompokNomor,
        })
        .from(penugasanSlot)
        .innerJoin(jadwal, eq(jadwal.id, penugasanSlot.jadwalId))
        .where(
          and(
            inArray(penugasanSlot.jenis, ["pengganti", "sukarela"]),
            eq(penugasanSlot.status, "diterima"),
            inArray(penugasanSlot.tanggal, [...new Set(rows.map((r) => r.tanggal))]),
          ),
        ),
    ]);

  const group = <T extends { sesiId: number | null }>(xs: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of xs) if (x.sesiId != null) m.set(x.sesiId, [...(m.get(x.sesiId) ?? []), x]);
    return m;
  };
  const tugasPer = group(tugas);
  const masukPer = group(masuk);
  const skorPer = group(skor);
  const pasanganPer = group(pasangan);
  const blankPer = new Map(blank.map((b) => [b.sesiId, b.benar]));
  const delayPer = new Map(delay.map((d) => [d.sesiId, d]));
  const labPer = new Map(lab.map((l) => [l.sesiId, l]));

  const celahPer = await jumlahCelahPer(rows.map((r) => r.modul));
  const out: SesiLaporan[] = rows.map((r) => {
    const mem = member.get(r.id) ?? [];
    const nims = new Set(mem.map((m) => m.nim));
    const hadir = new Set((masukPer.get(r.id) ?? []).map((x) => x.nim));
    const awal = r.mulaiPada ?? r.dibuatPada;
    const akhir = r.selesaiPada ?? new Date();
    for (const x of masukLama) if (x.pada >= awal && x.pada <= akhir) hadir.add(x.nim);
    const skorRows = skorPer.get(r.id) ?? [];
    const dinilai = new Set(skorRows.map((x) => x.nim));
    const nomorKelompok = new Set(mem.map((m) => m.nomor));
    const pas = (tugasPer.get(r.id) ?? [])
      .map((t) => ({ nomor: t.nomor, nim: t.nim }))
      .sort((a, b) => a.nomor - b.nomor);
    const ganti = new Set<string>();
    for (const p of pasanganPer.get(r.id) ?? []) {
      const d = p.detail as { ke?: string | null; awal?: string | null };
      if (d.ke && d.ke !== d.awal) ganti.add(d.ke);
    }
    for (const c of tutup) if (c.tanggal === r.tanggal && c.slot === r.slot) ganti.add(c.nim);
    const d = delayPer.get(r.id);
    const l = labPer.get(r.id);
    return {
      id: r.id,
      tanggal: r.tanggal,
      mulai: r.mulai,
      slot: r.slot,
      modul: r.modul,
      kelas: r.kelas,
      status: r.status as "berjalan" | "selesai",
      jenis: r.jenis,
      durasiDetik: r.durasiDetik,
      pasangan: pas,
      hadir: [[...hadir].filter((n) => nims.has(n)).length, nims.size],
      dinilai: [[...dinilai].filter((n) => nims.has(n)).length, nims.size],
      skor: { jumlah: skorRows.reduce((a, x) => a + x.skor, 0), n: skorRows.length },
      blank: [blankPer.get(r.id) ?? 0, (celahPer.get(r.modul) ?? 0) * nomorKelompok.size],
      lab: { jumlah: l?.jumlah ?? 0, n: l?.n ?? 0 },
      delay: { jumlah: Number(d?.jumlah ?? 0), n: d?.n ?? 0 },
      ganti: [...ganti],
    };
  });
  res.status(200).json({ ok: true, sesi: out });
}

/* ------------------------------------------------------------ incidents */

export async function handleKejadianDaftar(req: ApiRequest, res: ApiResponse) {
  const raw =
    typeof req.query.sesiIds === "string"
      ? req.query.sesiIds.split(",")
      : req.query.sesiId != null
        ? [String(req.query.sesiId)]
        : [];
  const ids = raw.map(posInt);
  if (!ids.length || ids.length > 500 || ids.some((x) => x === null)) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const rows = await getDb()
    .select()
    .from(sesiKejadian)
    .where(inArray(sesiKejadian.sesiId, ids as number[]))
    .orderBy(asc(sesiKejadian.pada), asc(sesiKejadian.id));
  res.status(200).json({ ok: true, kejadian: rows });
}

/** "HH:MM" on the session's day, in WIB, as an instant. */
function jamSesi(tanggal: string, jam: string): Date {
  return new Date(`${tanggal}T${jam}:00+07:00`);
}

export async function handleKejadianPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const teks = typeof body.teks === "string" ? body.teks.trim() : "";
  const db = getDb();
  if (body.aksi === "tambah") {
    const sesiId = posInt(body.sesiId);
    const jam = typeof body.jam === "string" && JAM_RE.test(body.jam) ? body.jam : null;
    if (!sesiId || teks.length < 4 || teks.length > KEJADIAN_TEKS_MAKS) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    const [s] = await db
      .select({ tanggal: sesi.tanggal, status: sesi.status })
      .from(sesi)
      .where(eq(sesi.id, sesiId))
      .limit(1);
    if (!s) {
      res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
      return;
    }
    const [row] = await db
      .insert(sesiKejadian)
      .values({
        sesiId,
        jenis: "catatan",
        detail: { teks },
        aktorNim: session.nim,
        pada: jam ? jamSesi(s.tanggal, jam) : new Date(),
      })
      .returning();
    await writeAudit(session.nim, "kejadian_tambah", { sesiId, id: row.id, teks });
    res.status(200).json({ ok: true, kejadian: row });
    return;
  }
  if (body.aksi === "ubah" || body.aksi === "hapus") {
    const id = posInt(body.id);
    if (!id || (body.aksi === "ubah" && (teks.length < 4 || teks.length > KEJADIAN_TEKS_MAKS))) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    const [k] = await db.select().from(sesiKejadian).where(eq(sesiKejadian.id, id)).limit(1);
    if (!k) {
      res.status(200).json({ ok: false, kode: "tidak_ada" });
      return;
    }
    if (k.jenis !== "catatan") {
      res.status(200).json({ ok: false, kode: "baris_sistem" });
      return;
    }
    const lama = (k.detail as { teks?: string }).teks ?? "";
    if (body.aksi === "hapus") {
      await db.delete(sesiKejadian).where(eq(sesiKejadian.id, id));
      // The Audit copy is also what Undo restores from: the client never
      // says who wrote the note or when.
      await writeAudit(session.nim, "kejadian_hapus", {
        sesiId: k.sesiId,
        id,
        teks: lama,
        penulis: k.aktorNim,
        pada: k.pada.toISOString(),
        detail: k.detail,
      });
      res.status(200).json({ ok: true });
      return;
    }
    const detail = {
      ...(k.detail as Record<string, unknown>),
      teks,
      diubahOleh: session.nim,
      diubahPada: new Date().toISOString(),
    };
    const [row] = await db
      .update(sesiKejadian)
      .set({ detail })
      .where(eq(sesiKejadian.id, id))
      .returning();
    await writeAudit(session.nim, "kejadian_ubah", { sesiId: k.sesiId, id, dari: lama, ke: teks });
    res.status(200).json({ ok: true, kejadian: row });
    return;
  }
  if (body.aksi === "pulih") return pulihkan(body, res, session);
  res.status(200).json({ ok: false, kode: "format_salah" });
}

/** How long Undo stays possible after a delete. */
const PULIH_MENIT = 15;

/**
 * Undo after deleting a note. The client sends only the deleted note's id;
 * the text, author, time and edit mark come back from the Audit copy the
 * delete wrote. Only the person who deleted it can undo, once, within
 * PULIH_MENIT minutes.
 */
async function pulihkan(body: Record<string, unknown>, res: ApiResponse, session: SessionPayload) {
  const id = posInt(body.id);
  if (!id) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const sejak = new Date(Date.now() - PULIH_MENIT * 60_000);
  const [hapus] = await db
    .select()
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "kejadian_hapus"),
        eq(audit.aktorNim, session.nim),
        gte(audit.pada, sejak),
        sql`(${audit.detail})::jsonb ->> 'id' = ${String(id)}`,
      ),
    )
    .orderBy(desc(audit.id))
    .limit(1);
  if (!hapus?.detail) {
    res.status(200).json({ ok: false, kode: "tidak_bisa_dipulihkan" });
    return;
  }
  const [sudah] = await db
    .select({ id: audit.id })
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "kejadian_pulih"),
        sql`(${audit.detail})::jsonb ->> 'dari' = ${String(id)}`,
      ),
    )
    .limit(1);
  if (sudah) {
    res.status(200).json({ ok: false, kode: "sudah_dipulihkan" });
    return;
  }
  const salinan = JSON.parse(hapus.detail) as {
    sesiId: number;
    teks: string;
    penulis: string;
    pada?: string;
    detail?: Record<string, unknown>;
  };
  const pada = salinan.pada ? new Date(salinan.pada) : hapus.pada;
  const [row] = await db
    .insert(sesiKejadian)
    .values({
      sesiId: salinan.sesiId,
      jenis: "catatan",
      detail: salinan.detail ?? { teks: salinan.teks },
      aktorNim: salinan.penulis,
      pada,
    })
    .returning();
  await writeAudit(session.nim, "kejadian_pulih", { sesiId: salinan.sesiId, id: row.id, dari: id });
  res.status(200).json({ ok: true, kejadian: row });
}

/* ------------------------------------------------------ one session page */

/** The session's written note: a sent `laporan` row marked in konteks. */
async function catatanSesi(db: Db, sesiId: number) {
  const [row] = await db
    .select()
    .from(laporan)
    .where(sql`${laporan.konteks}->>'catatanSesi' = ${String(sesiId)}`)
    .limit(1);
  return row ?? null;
}

export async function handleRekapGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const sesiId = posInt(req.query.sesiId);
  if (!sesiId) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [s] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const [seelabs, member, tugas, masuk, blanks, delays, catatan, nilaiLog, lab, saya] =
    await Promise.all([
      muatSeelabs(db, sesiId),
      anggotaPerSesi(db, [sesiId]).then((m) => m.get(sesiId) ?? []),
      db
        .select({ nomor: kelompok.nomor, nama: kelompok.nama, nim: sesiAsisten.asistenNim })
        .from(sesiAsisten)
        .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
        .where(eq(sesiAsisten.sesiId, sesiId)),
      db
        .selectDistinct({ nim: percobaanMasuk.nim })
        .from(percobaanMasuk)
        .where(
          and(
            eq(percobaanMasuk.sesiId, sesiId),
            eq(percobaanMasuk.jenis, "praktikan"),
            eq(percobaanMasuk.berhasil, true),
          ),
        ),
      db
        .select({
          nomor: kelompok.nomor,
          benar: sql<number>`count(*) filter (where ${jawaban.benar})::int`,
        })
        .from(jawaban)
        .innerJoin(kelompok, eq(kelompok.id, jawaban.kelompokId))
        .where(eq(jawaban.sesiId, sesiId))
        .groupBy(kelompok.nomor),
      db
        .select({ nomor: telemetriLog.kelompokNomor, delayMs: telemetriLog.delayMs })
        .from(telemetriLog)
        .where(and(eq(telemetriLog.sesiId, sesiId), sql`${telemetriLog.delayMs} is not null`)),
      catatanSesi(db, sesiId),
      db
        .select({ pada: audit.pada, aktorNim: audit.aktorNim, detail: audit.detail })
        .from(audit)
        .where(and(eq(audit.aksi, "nilai_set"), like(audit.detail, `{"sesiId":${sesiId},%`)))
        .orderBy(desc(audit.pada))
        .limit(200),
      db
        .select({
          rating: umpanBalik.ratingLab,
          komentar: umpanBalik.komentarLab,
          chips: umpanBalik.chipsLab,
          pada: umpanBalik.dibuatPada,
        })
        .from(umpanBalik)
        .where(eq(umpanBalik.sesiId, sesiId)),
      db
        .select({
          rating: umpanBalik.ratingAsisten,
          komentar: umpanBalik.komentarAsisten,
          chips: umpanBalik.chipsAsisten,
          pada: umpanBalik.dibuatPada,
        })
        .from(umpanBalik)
        .where(and(eq(umpanBalik.sesiId, sesiId), eq(umpanBalik.asistenNim, session.nim))),
    ]);

  const hadir = new Set(masuk.map((m) => m.nim));
  const perBlank = jumlahCelahModul(await kodeModul(s.modul));
  const nomor = [...new Set([...member.map((m) => m.nomor), ...tugas.map((t) => t.nomor)])].sort(
    (a, b) => a - b,
  );
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };
  const kelompokOut = nomor.map((n) => {
    const mem = member.filter((m) => m.nomor === n);
    const sl = seelabs?.kelompok.find((k) => k.nomor === n);
    const ds = delays.filter((d) => d.nomor === n).map((d) => d.delayMs as number);
    return {
      nomor: n,
      nama: tugas.find((t) => t.nomor === n)?.nama ?? null,
      pemegang: tugas.find((t) => t.nomor === n)?.nim ?? null,
      akunSeelabs: sl?.akun ?? null,
      statusSeelabs: sl?.status ?? null,
      hadir: [mem.filter((m) => hadir.has(m.nim)).length, mem.length],
      blank: [blanks.find((b) => b.nomor === n)?.benar ?? 0, perBlank],
      delay: { median: median(ds), n: ds.length },
      // Students and their scores, from the session's own roster.
      anggota: (sl?.baris ?? []).map((b) => ({ nim: b.nim, nama: b.nama, skor: b.skor })),
    };
  });
  const held = tugas.some((t) => t.nim === session.nim);
  const log = nilaiLog.map((r) => {
    let d: { nim?: string; komponen?: string } = {};
    try {
      d = JSON.parse(r.detail ?? "{}");
    } catch {
      // a malformed audit line still counts as one change
    }
    return {
      pada: r.pada.toISOString(),
      oleh: r.aktorNim,
      nim: d.nim ?? null,
      komponen: d.komponen ?? null,
    };
  });
  const teks = Array.isArray(catatan?.blok)
    ? ((catatan!.blok[0] as { v?: unknown } | undefined)?.v ?? "")
    : "";
  res.status(200).json({
    ok: true,
    sesi: {
      id: s.id,
      tanggal: s.tanggal,
      mulai: s.mulai,
      slot: s.slot,
      modul: s.modul,
      kelas: s.kelas,
      status: s.status,
      jenis: s.jenis,
      durasiDetik: s.durasiDetik,
      mulaiPada: s.mulaiPada?.toISOString() ?? null,
    },
    hadir: [member.filter((m) => hadir.has(m.nim)).length, member.length],
    kelompok: kelompokOut,
    catatan: catatan
      ? {
          id: catatan.id,
          teks: typeof teks === "string" ? teks : "",
          oleh: catatan.penulisNim,
          pada: catatan.diubahPada.toISOString(),
        }
      : null,
    nilaiLog: log,
    lab: ringkas(lab),
    saya: held ? ringkas(saya) : null,
    pegang: tugas.filter((t) => t.nim === session.nim).map((t) => t.nomor),
  });
}

export async function handleRekapPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = posInt(body.sesiId);
  const teks = typeof body.teks === "string" ? body.teks : "";
  if (!sesiId || teks.length > CATATAN_SESI_MAKS) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [s] = await db
    .select({ id: sesi.id, tanggal: sesi.tanggal, modul: sesi.modul })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!s) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  const ada = await catatanSesi(db, sesiId);
  const blok = [{ id: "catatan", k: "p", v: teks }];
  const now = new Date();
  if (ada) {
    await db
      .update(laporan)
      .set({ blok, penulisNim: session.nim, diubahPada: now })
      .where(eq(laporan.id, ada.id));
  } else {
    await db.insert(laporan).values({
      judul: `sesi-${sesiId}`,
      jenis: "sesi",
      status: "terkirim",
      blok,
      konteks: { catatanSesi: sesiId, sesiId },
      penulisNim: session.nim,
      dikirimPada: now,
    });
  }
  // One audit line per writer per session per hour, not per keystroke save.
  const [baru] = await db
    .select({ id: audit.id })
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "catatan_sesi"),
        eq(audit.aktorNim, session.nim),
        gte(audit.pada, new Date(now.getTime() - 3600_000)),
        eq(audit.detail, JSON.stringify({ sesiId })),
      ),
    )
    .limit(1);
  if (!baru) await writeAudit(session.nim, "catatan_sesi", { sesiId });
  res.status(200).json({ ok: true, pada: now.toISOString(), oleh: session.nim });
}

/* ------------------------------------------------------------------ audit */

export const AUDIT_HALAMAN = 100;

export async function handleAuditLaporan(req: ApiRequest, res: ApiResponse) {
  const q = req.query;
  const jenis = typeof q.jenis === "string" && q.jenis !== "all" ? q.jenis : null;
  const aktor = typeof q.aktor === "string" && q.aktor ? q.aktor : null;
  const dari = typeof q.dari === "string" ? q.dari : null;
  const sampai = typeof q.sampai === "string" ? q.sampai : null;
  const sebelum = q.sebelum != null ? posInt(q.sebelum) : null;
  if (
    (jenis && !isJenisAudit(jenis)) ||
    (dari && !TANGGAL_RE.test(dari)) ||
    (sampai && !TANGGAL_RE.test(sampai)) ||
    (q.sebelum != null && !sebelum)
  ) {
    res.status(400).json({ ok: false, kode: "format_salah" });
    return;
  }
  const hakLike = like(audit.detail, '%"hakOverride"%');
  const kondisi = [
    jenis
      ? inArray(audit.aksi, [...AKSI_PER_JENIS[jenis as keyof typeof AKSI_PER_JENIS]])
      : undefined,
    jenis === "hak" ? hakLike : undefined,
    jenis === "tim"
      ? sql`not (${audit.aksi} = 'tim_ubah' and coalesce(${audit.detail}, '') like '%"hakOverride"%')`
      : undefined,
    aktor ? eq(audit.aktorNim, aktor) : undefined,
    dari ? gte(audit.pada, new Date(`${dari}T00:00:00+07:00`)) : undefined,
    sampai ? lte(audit.pada, new Date(`${sampai}T23:59:59.999+07:00`)) : undefined,
    sebelum ? lt(audit.id, sebelum) : undefined,
    // Sign-ins are not actions on the practicum.
    not(eq(audit.aksi, "masuk_asisten")),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const db = getDb();
  const rows = await db
    .select()
    .from(audit)
    .where(and(...kondisi))
    .orderBy(desc(audit.id))
    .limit(AUDIT_HALAMAN + 1);
  const lagi = rows.length > AUDIT_HALAMAN;
  const page = rows.slice(0, AUDIT_HALAMAN);

  const ids = {
    sesi: new Set<number>(),
    kelompok: new Set<number>(),
    jadwal: new Set<number>(),
    server: new Set<number>(),
  };
  for (const r of page) {
    let d: Record<string, unknown> = {};
    try {
      d = JSON.parse(r.detail ?? "{}") ?? {};
    } catch {
      continue;
    }
    const n = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
    const sId = n(d.sesiId);
    if (sId) ids.sesi.add(sId);
    const kId = n(d.kelompokId);
    if (kId) ids.kelompok.add(kId);
    const jId = n(d.jadwalId);
    if (jId) ids.jadwal.add(jId);
    const srv = n(d.serverId) ?? (r.aksi.startsWith("server_") ? n(d.id) : null);
    if (srv) ids.server.add(srv);
  }
  const [sesiRows, kelRows, jadRows, srvRows] = await Promise.all([
    ids.sesi.size
      ? db
          .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot, modul: sesi.modul })
          .from(sesi)
          .where(inArray(sesi.id, [...ids.sesi]))
      : [],
    ids.kelompok.size
      ? db
          .select({ id: kelompok.id, nomor: kelompok.nomor })
          .from(kelompok)
          .where(inArray(kelompok.id, [...ids.kelompok]))
      : [],
    ids.jadwal.size
      ? db
          .select({ id: jadwal.id, hari: jadwal.hari, slot: jadwal.slot })
          .from(jadwal)
          .where(inArray(jadwal.id, [...ids.jadwal]))
      : [],
    ids.server.size
      ? db
          .select({ id: server.id, nama: server.nama, kode: server.kode })
          .from(server)
          .where(inArray(server.id, [...ids.server]))
      : [],
  ]);
  res.status(200).json({
    ok: true,
    audit: page,
    lagi,
    konteks: { sesi: sesiRows, kelompok: kelRows, jadwal: jadRows, server: srvRows },
  });
}
