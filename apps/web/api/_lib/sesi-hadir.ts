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
 *      { aksi: "kehadiran", nim, status }  set an Asisten's Mangkir status by
 *        hand: tepat, mangkir_ngajar, mangkir, or "otomatis" to go back to the
 *        clock (lib/mangkir.ts). Anyone teaching the session, or with "pair".
 *      { aksi: "pindah", nim, ke } move a student to group `ke` for the rest of
 *        this session (the "pair" right). Their next action asks them to sign
 *        in again (requireCurrentPraktikanSesi), which puts them in the new
 *        group. The weekly roster is left as it is.
 *
 * An Asisten counts as present from opening the session or any action they
 * take in it (their first audit row from the session's sesi_mulai row on),
 * or from Tandai Hadir.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { cekHak, muatOrang } from "./hak.js";
import { hakDari } from "../../src/lib/hak.js";
import { muatMinggu } from "./penugasan-api.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  asisten,
  audit,
  jadwal,
  kehadiranAsisten,
  kelompok,
  percobaanMasuk,
  sesi,
  sesiAnggota,
  sesiAsisten,
  sesiKejadian,
  sesiKelompok,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import {
  MANGKIR_SEJAK,
  nilaiKehadiran,
  statusHadirValid,
  type StatusHadir,
  type StatusHadirLive,
} from "../../src/lib/mangkir.js";

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

export interface Kehadiran {
  status: StatusHadirLive;
  telatMenit: number | null;
  /** Worked out from the clock (true) or set by hand. */
  otomatis: boolean;
  oleh: string | null;
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

type SesiRow = typeof sesi.$inferSelect;

/**
 * Who teaches session `s` and when each first turned up: the slot's people
 * this date (regular, substitute, volunteer, excused), whoever opened it,
 * and anyone holding a group. `sampai` closes the audit trail of an ended
 * session.
 */
export async function muatMengajar(s: SesiRow, sampai?: Date | null): Promise<Mengajar[]> {
  const db = getDb();
  const mulai = s.mulaiPada ?? s.dibuatPada;

  // The audit rows of this session: from its own sesi_mulai row on, by row
  // order rather than by clock (the app's and the database's clocks need
  // not agree); by time only if that row can't be found.
  const starts = await db
    .select({ id: audit.id, detail: audit.detail })
    .from(audit)
    .where(eq(audit.aksi, "sesi_mulai"))
    .orderBy(desc(audit.id))
    .limit(200);
  const startId = starts.find((r) => {
    try {
      const d = JSON.parse(r.detail ?? "{}") as {
        tanggal?: string;
        mulai?: string;
        modul?: number;
      };
      return d.tanggal === s.tanggal && d.mulai === s.mulai && d.modul === s.modul;
    } catch {
      return false;
    }
  })?.id;

  const [orang, pegangRows, jejak] = await Promise.all([
    db.select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama }).from(asisten),
    db
      .select({ nim: sesiAsisten.asistenNim, nomor: kelompok.nomor })
      .from(sesiAsisten)
      .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
      .where(eq(sesiAsisten.sesiId, s.id)),
    db
      .select({ nim: audit.aktorNim, aksi: audit.aksi, detail: audit.detail, pada: audit.pada })
      .from(audit)
      .where(
        and(
          startId ? gte(audit.id, startId) : gte(audit.pada, mulai),
          sampai ? lte(audit.pada, sampai) : undefined,
        ),
      )
      .orderBy(asc(audit.id)),
  ]);

  // Assistants: first action (or Tandai Hadir) since the session started.
  // Setting someone's Mangkir status is an action of the one who sets it,
  // never a sign of the person it is about.
  const hadirOf = new Map<string, Date>();
  const tandai = (nim: string, pada: Date) => {
    if (!hadirOf.has(nim)) hadirOf.set(nim, pada);
  };
  for (const a of jejak) {
    if (a.aksi === "asisten_hadir") {
      try {
        const d = JSON.parse(a.detail ?? "{}") as { sesiId?: number; nim?: string };
        if (d.sesiId === s.id && d.nim) tandai(d.nim, a.pada);
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
  if (s.slot) {
    const [row] = await db
      .select()
      .from(jadwal)
      .where(
        and(
          eq(jadwal.semester, semesterDariTanggal(s.tanggal)),
          eq(jadwal.hari, hariDariTanggal(s.tanggal)),
          eq(jadwal.slot, s.slot),
        ),
      )
      .limit(1);
    if (row) {
      const m = (await muatMinggu(db, [row], s.tanggal)).get(row.id);
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
    .where(and(eq(sesiKejadian.sesiId, s.id), eq(sesiKejadian.jenis, "mulai")))
    .limit(1);
  if (buka && !people.has(buka.nim)) tambah(buka.nim, s.slot ? "pengganti" : "tetap");
  // Anyone holding a group without a place in the slot came in as cover.
  for (const r of pegangRows) if (!people.has(r.nim)) tambah(r.nim, "pengganti");
  return [...people.values()].sort(
    (a, b) =>
      URUT[a.jenis] - URUT[b.jenis] ||
      (a.pegang[0] ?? 99) - (b.pegang[0] ?? 99) ||
      a.kode.localeCompare(b.kode),
  );
}

/** Mangkir applies to the slot's own Asisten and substitutes: not to a
 *  volunteer, not to someone on izin. */
export function diharapkan(m: Mengajar): boolean {
  return m.jenis === "tetap" || m.jenis === "pengganti";
}

/** Each expected person's status: a stored row (by hand, or locked when the
 *  session ended) wins over the one worked out from the clock. */
async function kehadiranUntuk(
  s: SesiRow,
  mengajar: Mengajar[],
  selesai: boolean,
): Promise<Map<string, Kehadiran>> {
  const rows = await getDb()
    .select()
    .from(kehadiranAsisten)
    .where(eq(kehadiranAsisten.sesiId, s.id));
  const simpan = new Map(rows.map((r) => [r.nim, r]));
  const out = new Map<string, Kehadiran>();
  for (const m of mengajar) {
    if (!diharapkan(m)) continue;
    const r = simpan.get(m.nim);
    if (r) {
      out.set(m.nim, {
        status: r.status,
        telatMenit: r.telatMenit,
        otomatis: r.otomatis,
        oleh: r.ditandaiOleh,
      });
      continue;
    }
    const n = nilaiKehadiran(s.tanggal, s.mulai, m.hadirPada, selesai);
    out.set(m.nim, { ...n, otomatis: true, oleh: null });
  }
  return out;
}

/**
 * Locks in the statuses of an ended session: one row per expected person
 * who has none yet (a hand row stays as it is). Safe to run again; the End
 * button runs it, and so does any read of ended sessions (a session that
 * ran out on its own is ended lazily, see lib/sesi.ts).
 */
export async function kunciKehadiran(s: SesiRow): Promise<number> {
  if (s.status !== "selesai" || s.tanggal < MANGKIR_SEJAK) return 0;
  const mengajar = await muatMengajar(s, s.selesaiPada);
  const db = getDb();
  const ada = new Set(
    (
      await db
        .select({ nim: kehadiranAsisten.nim })
        .from(kehadiranAsisten)
        .where(eq(kehadiranAsisten.sesiId, s.id))
    ).map((r) => r.nim),
  );
  const baru = mengajar
    .filter((m) => diharapkan(m) && !ada.has(m.nim))
    .map((m) => {
      const n = nilaiKehadiran(s.tanggal, s.mulai, m.hadirPada, true);
      return {
        sesiId: s.id,
        nim: m.nim,
        status: n.status as StatusHadir,
        datangPada: m.hadirPada ? new Date(m.hadirPada) : null,
        telatMenit: n.telatMenit,
        otomatis: true,
      };
    });
  if (baru.length) await db.insert(kehadiranAsisten).values(baru).onConflictDoNothing();
  return baru.length;
}

/** Locks every recently ended session that has no rows yet. A session with
 *  nobody expected (a makeup run by a volunteer) is noted in Audit once,
 *  so it isn't read again. */
export async function kunciKehadiranTertinggal(hari = 120): Promise<void> {
  const db = getDb();
  const sejak = new Date(Date.now() - hari * 86_400_000);
  const rows = await db
    .select()
    .from(sesi)
    .where(
      and(
        eq(sesi.status, "selesai"),
        gte(sesi.dibuatPada, sejak),
        gte(sesi.tanggal, MANGKIR_SEJAK),
        sql`not exists (select 1 from kehadiran_asisten k where k.sesi_id = ${sesi.id})`,
        sql`not exists (select 1 from audit a where a.aksi = 'kehadiran_kunci' and a.detail = ${sesi.id}::text)`,
      ),
    )
    .limit(40);
  for (const r of rows) {
    const n = await kunciKehadiran(r);
    if (n === 0)
      await db
        .insert(audit)
        .values({ aktorNim: "sistem", aksi: "kehadiran_kunci", detail: String(r.id) });
  }
}

export async function handleHadirGet(_req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();
  if (!running) return tolak(res, "tidak_ada_sesi");
  const db = getDb();
  const jumlah = running.jumlahKelompok ?? 10;

  const [mengajar, groups, members, masuk] = await Promise.all([
    muatMengajar(running),
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
  ]);

  // Students: first sign-in per NIM for this session.
  const masukOf = new Map<string, { pada: Date; manual: boolean }>();
  for (const m of masuk)
    if (!masukOf.has(m.nim))
      masukOf.set(m.nim, { pada: m.pada, manual: m.ip.startsWith("manual:") });
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
          };
        }),
    }));

  const hadir = await kehadiranUntuk(running, mengajar, false);
  res.status(200).json({
    ok: true,
    sesiId: running.id,
    mulai: running.mulai,
    tanggal: running.tanggal,
    mengajar: mengajar.map((m) => ({ ...m, kehadiran: hadir.get(m.nim) ?? null })),
    kelompok: kelompokOut,
  });
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
  const nim = typeof body.nim === "string" ? body.nim.trim().toUpperCase() : "";
  if (!nim) return tolak(res, "format_salah");
  const running = await currentSesi();
  if (!running) return tolak(res, "tidak_ada_sesi");
  const db = getDb();

  if (aksi === "kehadiran") {
    const status = body.status;
    if (status !== "otomatis" && !statusHadirValid(status)) return tolak(res, "format_salah");
    const orang = await muatOrang(session.nim);
    const boleh =
      (orang && hakDari(orang, "pair") === true) || (await asistenMengajar(running, session.nim));
    if (!boleh) return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "pair" });
    const mengajar = await muatMengajar(running);
    const m = mengajar.find((x) => x.nim === nim);
    if (!m || !diharapkan(m)) return tolak(res, "tidak_terjadwal");
    if (status === "otomatis") {
      await db
        .delete(kehadiranAsisten)
        .where(and(eq(kehadiranAsisten.sesiId, running.id), eq(kehadiranAsisten.nim, nim)));
    } else {
      const n = nilaiKehadiran(running.tanggal, running.mulai, m.hadirPada, false);
      // Late minutes are kept from the clock when there is a sign of them.
      const telat = status === "mangkir_ngajar" ? n.telatMenit : null;
      const nilai = {
        status,
        datangPada: m.hadirPada ? new Date(m.hadirPada) : null,
        telatMenit: telat,
        otomatis: false,
        ditandaiOleh: session.nim,
        diubahPada: new Date(),
      };
      await db
        .insert(kehadiranAsisten)
        .values({ sesiId: running.id, nim, ...nilai })
        .onConflictDoUpdate({
          target: [kehadiranAsisten.sesiId, kehadiranAsisten.nim],
          set: nilai,
        });
    }
    await writeAudit(session.nim, "kehadiran_asisten", { sesiId: running.id, nim, status });
    return res.status(200).json({ ok: true });
  }

  if (aksi === "asisten") {
    const [o] = await db
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    if (!o) return tolak(res, "tidak_ada");
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
    });
    return res.status(200).json({ ok: true });
  }

  tolak(res, "format_salah");
}
