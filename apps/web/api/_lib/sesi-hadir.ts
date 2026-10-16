/**
 * The running session's Preparation view (Phase 9, mockup c-run ›
 * Persiapan): who teaches this slot and whether they are here, and each
 * group's members with the time they signed in.
 *
 * GET  /api/session/hadir                         Asisten: { mengajar, kelompok }
 * POST /api/session/hadir { aksi: "praktikan", nim }  mark a student present: a
 *        sign-in row for this session (ip "manual:<NIM of the Asisten>"),
 *        so every attendance count reads it like a real sign-in.
 *      { aksi: "asisten", nim }    mark an Asisten present (audit asisten_hadir).
 *      { aksi: "pindah", nim, ke, alasan } move a student to group `ke` for
 *        the rest of this session only (the "pair" right). Their next action
 *        asks them to sign in again (requireCurrentPraktikanSesi), which puts
 *        them in the new group. Rosters are final (user, 2026-10-07): a move
 *        is a temporary exception, so it needs a reason, is logged as an
 *        incident, shows as Sementara with the group it came from, and the
 *        live roster goes back when the session ends or is cancelled
 *        (kembalikanPindahan; Lanjutkan applies it again). The weekly
 *        roster (roster_slot) is never touched.
 *      { aksi: "tambah", nim, ke, nama? } (2026-10-06) put a student who isn't
 *        in this session into group `ke` (the "pair" right), so they can sign
 *        in: a late or misplaced Praktikan used to be told "tidak terdaftar"
 *        with no way in short of ending the session. A NIM not yet among the
 *        semester's Praktikan needs `nama` and is added to them too. Already
 *        in a group: answered `sudah_di_kelompok` (use pindah). The weekly
 *        roster is left as it is.
 *
 * An Asisten counts as present from opening the session or any action they
 * take in it (their first audit row from the session's sesi_mulai row on),
 * or from Tandai Hadir.
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { cekHak, muatOrang } from "./hak.js";
import {
  bolehPj,
  handleHadirPj,
  hadirUntukKunci,
  kunciDariSesi,
  muatKonteks,
  tandaiHadir,
} from "./hadir-mengajar.js";
import { ALASAN_MIN, catatKejadian } from "./berjalan.js";
import { muatMinggu } from "./penugasan-api.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  asisten,
  audit,
  jadwal,
  kelompok,
  percobaanMasuk,
  praktikan,
  sesiAnggota,
  sesiAsisten,
  sesiKejadian,
  sesiKelompok,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { KODE_PERCOBAAN, statusKode, writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";

export type JenisMengajar = "tetap" | "pengganti" | "sukarela" | "izin";

export interface Mengajar {
  nim: string;
  kode: string;
  nama: string;
  jenis: JenisMengajar;
  /** Group numbers this person holds in this session. */
  pegang: number[];
  /** First sign of them in this session (ISO), or null. */
  hadirPada: string | null;
  /** Izin: the reason given. */
  alasan?: string | null;
  /** Sukarela: the offer and its state, for Terima and Tolak. */
  tugasId?: number;
  status?: "diminta" | "diterima" | "ditolak";
}

export interface AnggotaHadir {
  nim: string;
  nama: string;
  masukPada: string | null;
  manual: boolean;
}

export interface KelompokHadir {
  id: number;
  nomor: number;
  nama: string;
  aktif: boolean;
  anggota: AnggotaHadir[];
}

const URUT: Record<JenisMengajar, number> = { tetap: 0, pengganti: 1, sukarela: 2, izin: 3 };

function tolak(res: ApiResponse, kode: string, status = 200) {
  res.status(status).json({ ok: false, kode });
}

export async function handleHadirGet(_req: ApiRequest, res: ApiResponse, session?: SessionPayload) {
  const running = await currentSesi();
  if (!running) return tolak(res, "tidak_ada_sesi");
  const db = getDb();
  const mulai = running.mulaiPada ? new Date(running.mulaiPada) : new Date(running.dibuatPada);
  const jumlah = running.jumlahKelompok ?? 10;

  // The audit rows of this session: from its own sesi_mulai row on, by row
  // order rather than by clock (the app's and the database's clocks need
  // not agree); by time only if that row can't be found.
  const starts = await db
    .select({ id: audit.id, detail: audit.detail })
    .from(audit)
    .where(eq(audit.aksi, "sesi_mulai"))
    .orderBy(desc(audit.id))
    .limit(50);
  const startId = starts.find((r) => {
    try {
      const d = JSON.parse(r.detail ?? "{}") as {
        tanggal?: string;
        mulai?: string;
        modul?: number;
      };
      return (
        d.tanggal === running.tanggal && d.mulai === running.mulai && d.modul === running.modul
      );
    } catch {
      return false;
    }
  })?.id;

  const [orang, groups, members, masuk, pegangRows, jejak] = await Promise.all([
    db.select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama }).from(asisten),
    db
      .select({
        id: kelompok.id,
        nomor: kelompok.nomor,
        nama: kelompok.nama,
        aktif: kelompok.aktif,
        sesiAktif: sesiKelompok.aktif,
      })
      .from(kelompok)
      .leftJoin(
        sesiKelompok,
        and(eq(sesiKelompok.kelompokId, kelompok.id), eq(sesiKelompok.sesiId, running.id)),
      )
      .where(eq(kelompok.aktif, true))
      .orderBy(asc(kelompok.nomor)),
    db
      .select({ nim: anggota.nim, nama: anggota.nama, kelompokId: anggota.kelompokId })
      .from(anggota)
      .orderBy(asc(anggota.nama)),
    db
      .select({ nim: percobaanMasuk.nim, pada: percobaanMasuk.pada, ip: percobaanMasuk.ip })
      .from(percobaanMasuk)
      .where(
        and(
          eq(percobaanMasuk.sesiId, running.id),
          eq(percobaanMasuk.jenis, "praktikan"),
          eq(percobaanMasuk.berhasil, true),
        ),
      )
      .orderBy(asc(percobaanMasuk.pada)),
    db
      .select({ nim: sesiAsisten.asistenNim, nomor: kelompok.nomor })
      .from(sesiAsisten)
      .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
      .where(eq(sesiAsisten.sesiId, running.id)),
    db
      .select({ nim: audit.aktorNim, aksi: audit.aksi, detail: audit.detail, pada: audit.pada })
      .from(audit)
      .where(startId ? gte(audit.id, startId) : gte(audit.pada, mulai))
      .orderBy(asc(audit.id)),
  ]);

  // Students: first sign-in per NIM for this session.
  const masukOf = new Map<string, { pada: Date; manual: boolean }>();
  for (const m of masuk)
    if (!masukOf.has(m.nim))
      masukOf.set(m.nim, { pada: m.pada, manual: m.ip.startsWith("manual:") });
  // Temporary moves this session: the group each moved student came from.
  const asalOf = new Map<string, number>();
  for (const a of jejak) {
    if (a.aksi !== "praktikan_pindah") continue;
    try {
      const d = JSON.parse(a.detail ?? "{}") as { sesiId?: number; nim?: string; dari?: number };
      if (d.sesiId === running.id && d.nim && d.dari && !asalOf.has(d.nim))
        asalOf.set(d.nim, d.dari);
    } catch {
      // A malformed audit line just isn't a move.
    }
  }
  const kelompokOut: KelompokHadir[] = groups
    .filter((g) => g.nomor <= jumlah)
    .map((g) => ({
      id: g.id,
      nomor: g.nomor,
      nama: g.nama,
      aktif: g.sesiAktif ?? true,
      anggota: members
        .filter((m) => m.kelompokId === g.id)
        .map((m) => {
          const x = masukOf.get(m.nim);
          return {
            nim: m.nim,
            nama: m.nama,
            masukPada: x ? x.pada.toISOString() : null,
            manual: x?.manual ?? false,
            ...(asalOf.has(m.nim) && asalOf.get(m.nim) !== g.nomor
              ? { asal: asalOf.get(m.nim) }
              : {}),
          };
        }),
    }));

  // Assistants: first action (or Tandai Hadir) since the session started.
  const hadirOf = new Map<string, Date>();
  const tandai = (nim: string, pada: Date) => {
    if (!hadirOf.has(nim)) hadirOf.set(nim, pada);
  };
  for (const a of jejak) {
    if (a.aksi === "asisten_hadir") {
      try {
        const d = JSON.parse(a.detail ?? "{}") as { sesiId?: number; nim?: string };
        if (d.sesiId === running.id && d.nim) tandai(d.nim, a.pada);
      } catch {
        /* a malformed row marks nobody */
      }
    } else tandai(a.nim, a.pada);
  }

  const byNim = new Map(orang.map((o) => [o.nim, o]));
  const byKode = new Map(orang.map((o) => [o.kode.toUpperCase(), o]));
  const pegangOf = new Map<string, number[]>();
  for (const r of pegangRows) pegangOf.set(r.nim, [...(pegangOf.get(r.nim) ?? []), r.nomor]);

  const people = new Map<string, Mengajar>();
  const tambah = (nim: string, jenis: JenisMengajar, extra: Partial<Mengajar> = {}) => {
    const o = byNim.get(nim);
    if (!o) return;
    const cur = people.get(nim);
    // The schedule's kind wins over "pengganti" from the pairing alone,
    // and an izin only stands when the person isn't teaching after all.
    if (cur && URUT[cur.jenis] <= URUT[jenis]) return;
    people.set(nim, {
      nim,
      kode: o.kode.toUpperCase(),
      nama: o.nama,
      jenis,
      pegang: (pegangOf.get(nim) ?? []).sort((a, b) => a - b),
      hadirPada: hadirOf.get(nim)?.toISOString() ?? null,
      ...extra,
    });
  };

  // The weekly slot this session runs in, when it has one.
  if (running.slot) {
    const [row] = await db
      .select()
      .from(jadwal)
      .where(
        and(
          eq(jadwal.semester, semesterDariTanggal(running.tanggal)),
          eq(jadwal.hari, hariDariTanggal(running.tanggal)),
          eq(jadwal.slot, running.slot),
        ),
      )
      .limit(1);
    if (row) {
      const m = (await muatMinggu(db, [row], running.tanggal)).get(row.id);
      if (m) {
        for (const k of m.kursi) {
          const o = k.kode ? byKode.get(k.kode.toUpperCase()) : undefined;
          if (o)
            tambah(
              o.nim,
              k.kode === k.tetap ? "tetap" : k.jenis === "sukarela" ? "sukarela" : "pengganti",
            );
        }
        for (const t of m.tugas)
          if (t.jenis === "sukarela" && t.status !== "ditolak")
            tambah(t.nim, "sukarela", { tugasId: t.id, status: t.status });
        for (const x of m.izin)
          if (x.status !== "dibatalkan" && !people.has(x.nim))
            tambah(x.nim, "izin", { alasan: x.alasan });
      }
    }
  }
  // Whoever opened the session teaches it, slot or not (a makeup session
  // has no slot at all).
  const [buka] = await db
    .select({ nim: sesiKejadian.aktorNim })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, running.id), eq(sesiKejadian.jenis, "mulai")))
    .limit(1);
  if (buka && !people.has(buka.nim)) tambah(buka.nim, running.slot ? "pengganti" : "tetap");
  // Anyone holding a group without a place in the slot came in as cover.
  for (const r of pegangRows) if (!people.has(r.nim)) tambah(r.nim, "pengganti");
  const mengajar = [...people.values()].sort(
    (a, b) =>
      URUT[a.jenis] - URUT[b.jenis] ||
      (a.pegang[0] ?? 99) - (b.pegang[0] ?? 99) ||
      a.kode.localeCompare(b.kode),
  );

  // Phase 18: each person's standing against the slot's clock, and who may
  // change it (null for a TOT session, which is never judged).
  const kunci = await kunciDariSesi(db, running);
  const hadir = kunci
    ? await hadirUntukKunci(db, kunci, session ? await muatOrang(session.nim) : null)
    : null;

  res.status(200).json({ ok: true, sesiId: running.id, mengajar, kelompok: kelompokOut, hadir });
}

/** Whether `nim` teaches the running session `running`: they hold a group
 *  in it, opened it, or have a seat (or an accepted volunteer place) in its
 *  weekly slot without an izin. Drives the Asisten's "Sesimu berjalan" bar
 *  on every page (mockup G6) through /api/session/now. */
export async function asistenMengajar(
  running: { id: number; slot: number | null; tanggal: string },
  nim: string,
): Promise<boolean> {
  const db = getDb();
  const [pegang] = await db
    .select({ id: sesiAsisten.id })
    .from(sesiAsisten)
    .where(and(eq(sesiAsisten.sesiId, running.id), eq(sesiAsisten.asistenNim, nim)))
    .limit(1);
  if (pegang) return true;
  const [buka] = await db
    .select({ nim: sesiKejadian.aktorNim })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, running.id), eq(sesiKejadian.jenis, "mulai")))
    .limit(1);
  if (buka?.nim === nim) return true;
  if (!running.slot) return false;
  const [row] = await db
    .select()
    .from(jadwal)
    .where(
      and(
        eq(jadwal.semester, semesterDariTanggal(running.tanggal)),
        eq(jadwal.hari, hariDariTanggal(running.tanggal)),
        eq(jadwal.slot, running.slot),
      ),
    )
    .limit(1);
  if (!row) return false;
  const m = (await muatMinggu(db, [row], running.tanggal)).get(row.id);
  if (!m) return false;
  if (m.izin.some((x) => x.nim === nim && x.status !== "dibatalkan")) return false;
  const [saya] = await db
    .select({ kode: asisten.kode })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  const kode = saya?.kode.toUpperCase();
  return (
    (!!kode && m.kursi.some((k) => k.kode?.toUpperCase() === kode)) ||
    m.tugas.some((t) => t.nim === nim && t.jenis === "sukarela" && t.status === "diterima")
  );
}

export async function handleHadirPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  // Phase 18: the PJ's status, clock shift and Ambil Alih answers name their
  // slot by key and work before the session exists.
  if (aksi === "status" || aksi === "geser" || aksi === "aa")
    return handleHadirPj(req, res, session);
  const nim = typeof body.nim === "string" ? body.nim.trim().toUpperCase() : "";
  if (!nim) return tolak(res, "format_salah");
  const running = await currentSesi();
  if (!running) return tolak(res, "tidak_ada_sesi");
  const db = getDb();

  if (aksi === "tambah") return tambahPraktikan(res, session, running, nim, body);

  // Buka Kunci (Ada Masalah?, 2026-10-09): lift a NIM's session code lock
  // so it can try again at once.
  if (aksi === "bukakunci") {
    const st = await statusKode(nim, running.id);
    if (st.sisaDetik <= 0 && st.sisaPercobaan === KODE_PERCOBAAN)
      return tolak(res, "tidak_terkunci");
    await db.insert(percobaanMasuk).values({
      nim,
      ip: `asisten:${session.nim}`,
      jenis: "buka",
      berhasil: true,
      sesiId: running.id,
    });
    await writeAudit(session.nim, "kode_buka", { sesiId: running.id, nim });
    return res.status(200).json({ ok: true });
  }

  if (aksi === "asisten") {
    const [o] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    if (!o) return tolak(res, "tidak_ada");
    // Tandai Hadir is the PJ's: it stamps the arrival the clock judges.
    const kunci = await kunciDariSesi(db, running);
    if (kunci) {
      const c = await muatKonteks(db, kunci);
      const orang = await muatOrang(session.nim);
      if (!orang || !c || !bolehPj(orang, { pj: c.pj, pembuat: c.pembuat }))
        return tolak(res, "tanpa_hak", 403);
      await tandaiHadir(db, { kunci, nim, oleh: session.nim });
    }
    await writeAudit(session.nim, "asisten_hadir", { sesiId: running.id, nim });
    return res.status(200).json({ ok: true });
  }

  // The student must be in one of this session's running groups.
  const [m] = await db
    .select({ nim: anggota.nim, kelompokId: anggota.kelompokId, nomor: kelompok.nomor })
    .from(anggota)
    .innerJoin(kelompok, eq(kelompok.id, anggota.kelompokId))
    .where(and(eq(anggota.nim, nim), eq(kelompok.aktif, true)))
    .limit(1);
  if (!m || m.nomor > (running.jumlahKelompok ?? 10)) return tolak(res, "tidak_terdaftar");

  if (aksi === "praktikan") {
    const sudah = await db
      .select({ id: percobaanMasuk.id })
      .from(percobaanMasuk)
      .where(
        and(
          eq(percobaanMasuk.sesiId, running.id),
          eq(percobaanMasuk.nim, nim),
          eq(percobaanMasuk.jenis, "praktikan"),
          eq(percobaanMasuk.berhasil, true),
        ),
      )
      .limit(1);
    if (sudah.length === 0) {
      await db.insert(percobaanMasuk).values({
        nim,
        ip: `manual:${session.nim}`,
        jenis: "praktikan",
        berhasil: true,
        sesiId: running.id,
      });
      await writeAudit(session.nim, "praktikan_hadir", { sesiId: running.id, nim });
    }
    return res.status(200).json({ ok: true });
  }

  if (aksi === "pindah") {
    if (!(await cekHak(res, session.nim, "pair"))) return;
    const alasan = typeof body.alasan === "string" ? body.alasan.trim().slice(0, 300) : "";
    if (alasan.length < ALASAN_MIN) return tolak(res, "alasan_kosong");
    const ke = Number(body.ke);
    if (!Number.isInteger(ke) || ke < 1 || ke > (running.jumlahKelompok ?? 10))
      return tolak(res, "format_salah");
    if (ke === m.nomor) return res.status(200).json({ ok: true });
    const [g] = await db
      .select({ id: kelompok.id })
      .from(kelompok)
      .where(and(eq(kelompok.nomor, ke), eq(kelompok.aktif, true)))
      .limit(1);
    if (!g) return tolak(res, "kelompok_tidak_diketahui");
    const [aktif] = await db
      .select({ aktif: sesiKelompok.aktif })
      .from(sesiKelompok)
      .where(and(eq(sesiKelompok.sesiId, running.id), eq(sesiKelompok.kelompokId, g.id)))
      .limit(1);
    if (aktif && !aktif.aktif) return tolak(res, "kelompok_mati");
    await db.update(anggota).set({ kelompokId: g.id }).where(eq(anggota.nim, nim));
    await db
      .update(sesiAnggota)
      .set({ kelompokNomor: ke })
      .where(and(eq(sesiAnggota.sesiId, running.id), eq(sesiAnggota.nim, nim)));
    await writeAudit(session.nim, "praktikan_pindah", {
      sesiId: running.id,
      nim,
      dari: m.nomor,
      ke,
      alasan,
    });
    await catatKejadian(running.id, "pindah", { nim, dari: m.nomor, ke, alasan }, session.nim);
    return res.status(200).json({ ok: true });
  }

  tolak(res, "format_salah");
}

const NIM_PRAKTIKAN = /^\d{10}(\d{2})?$/;

async function tambahPraktikan(
  res: ApiResponse,
  session: SessionPayload,
  running: NonNullable<Awaited<ReturnType<typeof currentSesi>>>,
  nim: string,
  body: Record<string, unknown>,
) {
  if (!(await cekHak(res, session.nim, "pair"))) return;
  const ke = Number(body.ke);
  if (!Number.isInteger(ke) || ke < 1 || ke > (running.jumlahKelompok ?? 10))
    return tolak(res, "format_salah");
  const db = getDb();

  const [sudah] = await db
    .select({ nomor: kelompok.nomor, aktif: kelompok.aktif })
    .from(anggota)
    .innerJoin(kelompok, eq(kelompok.id, anggota.kelompokId))
    .where(eq(anggota.nim, nim))
    .limit(1);
  if (sudah?.aktif)
    return res.status(200).json({ ok: false, kode: "sudah_di_kelompok", nomor: sudah.nomor });

  const [g] = await db
    .select({ id: kelompok.id })
    .from(kelompok)
    .where(and(eq(kelompok.nomor, ke), eq(kelompok.aktif, true)))
    .limit(1);
  if (!g) return tolak(res, "kelompok_tidak_diketahui");
  const [mati] = await db
    .select({ aktif: sesiKelompok.aktif })
    .from(sesiKelompok)
    .where(and(eq(sesiKelompok.sesiId, running.id), eq(sesiKelompok.kelompokId, g.id)))
    .limit(1);
  if (mati && !mati.aktif) return tolak(res, "kelompok_mati");

  // Their name: the semester's Praktikan list, else the one typed in.
  const [p] = await db
    .select({ nama: praktikan.nama })
    .from(praktikan)
    .where(eq(praktikan.nim, nim))
    .limit(1);
  let nama = p?.nama ?? "";
  if (!p) {
    // Only a new NIM is checked for its shape; one on the list is theirs.
    if (!NIM_PRAKTIKAN.test(nim)) return tolak(res, "nim_salah");
    nama = typeof body.nama === "string" ? body.nama.trim().replace(/\s+/g, " ") : "";
    if (nama.length < 2 || nama.length > 120)
      return res.status(200).json({ ok: false, kode: "perlu_nama" });
    await db
      .insert(praktikan)
      .values({
        nim,
        nama,
        kelas: running.kelas,
        semester: semesterDariTanggal(running.tanggal),
        dibuatOleh: session.nim,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(anggota)
    .values({ kelompokId: g.id, nim, nama })
    .onConflictDoUpdate({ target: anggota.nim, set: { kelompokId: g.id, nama } });
  await db
    .insert(sesiAnggota)
    .values({ sesiId: running.id, kelompokNomor: ke, nim, nama })
    .onConflictDoUpdate({
      target: [sesiAnggota.sesiId, sesiAnggota.nim],
      set: { kelompokNomor: ke },
    });
  await writeAudit(session.nim, "praktikan_tambah_sesi", {
    sesiId: running.id,
    nim,
    ke,
    baru: !p,
  });
  return res.status(200).json({ ok: true, nama, nomor: ke });
}

/**
 * A session's temporary moves, undone or done again (2026-10-07). The live
 * roster (`anggota`) is what sign-in reads, so a move lingered after its
 * session until the next one rebuilt it. Ending or cancelling puts each
 * moved student back in the group they started in; Lanjutkan moves them
 * again from the session's own snapshot. Best effort: a failure here must
 * not stop the end itself.
 */
export async function kembalikanPindahan(sesiId: number, arah: "pulih" | "ulang"): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({ detail: audit.detail })
      .from(audit)
      .where(
        and(
          eq(audit.aksi, "praktikan_pindah"),
          sql`(${audit.detail}::jsonb ->> 'sesiId')::int = ${sesiId}`,
        ),
      )
      .orderBy(asc(audit.id));
    const asal = new Map<string, number>();
    for (const r of rows) {
      try {
        const d = JSON.parse(r.detail ?? "{}") as { nim?: string; dari?: number };
        if (d.nim && d.dari && !asal.has(d.nim)) asal.set(d.nim, d.dari);
      } catch {
        // skip
      }
    }
    if (!asal.size) return;
    const ids = new Map(
      (await db.select({ id: kelompok.id, nomor: kelompok.nomor }).from(kelompok)).map((k) => [
        k.nomor,
        k.id,
      ]),
    );
    const snap = new Map(
      (
        await db
          .select({ nim: sesiAnggota.nim, nomor: sesiAnggota.kelompokNomor })
          .from(sesiAnggota)
          .where(eq(sesiAnggota.sesiId, sesiId))
      ).map((x) => [x.nim, x.nomor]),
    );
    for (const [nim, dari] of asal) {
      const nomor = arah === "pulih" ? dari : snap.get(nim);
      const id = nomor === undefined ? undefined : ids.get(nomor);
      if (id) await db.update(anggota).set({ kelompokId: id }).where(eq(anggota.nim, nim));
    }
  } catch (err) {
    console.error("[pindah] restoring the live roster failed:", sesiId, err);
  }
}
