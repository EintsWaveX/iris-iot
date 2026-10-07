/**
 * The Console home's data (Phase 9 Stage 3, mockup c-home), in one call so
 * the page draws at once:
 *
 * GET  /api/session/beranda
 *   today (WIB) and its four slots from the schedule, each with its own or
 *   the default start window and its roster size; this Asisten's slots
 *   this week; the open modules; the active slides; the server's last Ready
 *   check; and the ended sessions where one of this Asisten's groups still
 *   has a Praktikan with no score.
 *
 * POST /api/session/jendela { hari, slot, menit | null }
 *   a slot's own start window (5 to 30 minutes; null goes back to the
 *   default). The slot's own Asisten may set it, and so may anyone with
 *   the Jadwal right.
 */
import { diSlotMinggu, muatMinggu, muatPengaturanJendela } from "./penugasan-api.js";
import { orangTanggal } from "../../src/lib/penugasan-minggu.js";
import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  denyut,
  jadwal,
  pengaturan,
  perintah,
  presentasi,
  rosterSlot,
  server,
  sesi,
  sesiAnggota,
  sesiAsisten,
  kelompok,
  nilai,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { boleh } from "../../src/lib/hak.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { getModulTerbuka } from "../../src/lib/akses.js";
import { bacaHasilSiap } from "../../src/lib/server-shared.js";
import { JENDELA_MAX, JENDELA_MIN, jendelaValid } from "../../src/lib/sesi-mulai.js";

/** Ended sessions older than this no longer ask for scores on the home. */
const PERLU_NILAI_HARI = 21;

export async function handleBerandaGet(
  _req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const db = getDb();
  const tanggal = hariIniWib();
  const hari = hariDariTanggal(tanggal);
  const semester = semesterDariTanggal(tanggal);
  const saya = await muatOrang(session.nim);
  const kode = (saya?.kode ?? "").toUpperCase();

  const [minggu, [jendelaRow], terbuka, [slide], srv, rosterHitung] = await Promise.all([
    db
      .select()
      .from(jadwal)
      .where(eq(jadwal.semester, semester))
      .orderBy(asc(jadwal.hari), asc(jadwal.slot)),
    db
      .select({ nilai: pengaturan.nilai })
      .from(pengaturan)
      .where(eq(pengaturan.kunci, "jendela_mulai_default"))
      .limit(1),
    getModulTerbuka(),
    db
      .select({ nama: presentasi.namaBerkas, jenis: presentasi.jenis })
      .from(presentasi)
      .where(eq(presentasi.aktif, true))
      // The PDF first, like /api/presentasi/aktif, so this names the deck
      // the Praktikan see.
      .orderBy(sql`case when ${presentasi.jenis} = 'berkas' then 0 else 1 end`)
      .limit(1),
    db.select({ id: server.id, nama: server.nama }).from(server).orderBy(asc(server.id)).limit(1),
    db
      .select({
        slot: rosterSlot.slot,
        kelompok: sql<number>`count(distinct ${rosterSlot.kelompokNomor})::int`,
        praktikan: sql<number>`count(*)::int`,
      })
      .from(rosterSlot)
      .where(and(eq(rosterSlot.semester, semester), eq(rosterSlot.hari, hari)))
      .groupBy(rosterSlot.slot),
  ]);

  // The server's last heartbeat and its last finished Ready check.
  let serverInfo: {
    id: number;
    nama: string;
    denyutPada: string | null;
    siap: { lulus: boolean; gagal: number; waktu: string | null } | null;
  } | null = null;
  if (srv[0]) {
    const [[beat], [cek]] = await Promise.all([
      db
        .select({ pada: denyut.pada })
        .from(denyut)
        .where(eq(denyut.serverId, srv[0].id))
        .orderBy(desc(denyut.pada))
        .limit(1),
      db
        .select({ keluaran: perintah.keluaran, selesaiPada: perintah.selesaiPada })
        .from(perintah)
        .where(
          and(
            eq(perintah.serverId, srv[0].id),
            eq(perintah.aksi, "diag.siap"),
            eq(perintah.status, "selesai"),
          ),
        )
        .orderBy(desc(perintah.selesaiPada))
        .limit(1),
    ]);
    const hasil = bacaHasilSiap(cek?.keluaran);
    serverInfo = {
      // The Ready check links straight to this server (2026-10-06).
      id: srv[0].id,
      nama: srv[0].nama,
      denyutPada: beat?.pada?.toISOString() ?? null,
      siap: hasil
        ? {
            lulus: hasil.lulus,
            gagal: hasil.gagal,
            waktu: cek?.selesaiPada?.toISOString() ?? hasil.waktu,
          }
        : null,
    };
  }

  // Sessions that still need scores: ended in the last three weeks, in a
  // group this Asisten holds, with a member who has no score at all.
  const sejak = new Date(Date.now() - PERLU_NILAI_HARI * 86_400_000);
  const kurang = await db
    .select({
      sesiId: sesi.id,
      modul: sesi.modul,
      tanggal: sesi.tanggal,
      slot: sesi.slot,
      mulai: sesi.mulai,
      nomor: sesiAnggota.kelompokNomor,
      tanpaNilai: sql<number>`count(*) filter (where not exists (
        select 1 from ${nilai} n where n.sesi_id = ${sesi.id} and n.nim = ${sesiAnggota.nim}))::int`,
    })
    .from(sesiAsisten)
    .innerJoin(sesi, eq(sesi.id, sesiAsisten.sesiId))
    .innerJoin(kelompok, eq(kelompok.id, sesiAsisten.kelompokId))
    .innerJoin(
      sesiAnggota,
      and(eq(sesiAnggota.sesiId, sesi.id), eq(sesiAnggota.kelompokNomor, kelompok.nomor)),
    )
    .where(
      and(
        eq(sesiAsisten.asistenNim, session.nim),
        eq(sesi.status, "selesai"),
        ne(sesi.jenis, "tot"),
        gte(sesi.dibuatPada, sejak),
      ),
    )
    .groupBy(sesi.id, sesi.modul, sesi.tanggal, sesi.slot, sesi.mulai, sesiAnggota.kelompokNomor)
    .orderBy(desc(sesi.tanggal), asc(sesiAnggota.kelompokNomor));
  const perluNilai: {
    sesiId: number;
    modul: number;
    tanggal: string;
    slot: number | null;
    mulai: string;
    kelompok: { nomor: number; tanpaNilai: number }[];
  }[] = [];
  for (const r of kurang) {
    if (r.tanpaNilai === 0) continue;
    let s = perluNilai.find((x) => x.sesiId === r.sesiId);
    if (!s) {
      s = {
        sesiId: r.sesiId,
        modul: r.modul,
        tanggal: r.tanggal,
        slot: r.slot,
        mulai: r.mulai,
        kelompok: [],
      };
      perluNilai.push(s);
    }
    s.kelompok.push({ nomor: r.nomor, tanpaNilai: r.tanpaNilai });
  }

  const roster = Object.fromEntries(rosterHitung.map((r) => [r.slot, r]));
  // Today's seats: the pairing with today's izin, covers and volunteers.
  const hariIniRows = minggu.filter((j) => j.hari === hari);
  const kursiHariIni = await muatMinggu(db, hariIniRows, tanggal);
  res.status(200).json({
    ok: true,
    tanggal,
    hari,
    semester,
    jendelaDefault: jendelaValid(jendelaRow?.nilai),
    hariIni: minggu
      .filter((j) => j.hari === hari)
      .map((j) => {
        const m = kursiHariIni.get(j.id)!;
        const bantu = [...orangTanggal(m.kursi, m.tugas)].filter(
          (k) => !m.kursi.some((x) => x.kode === k),
        );
        return {
          slot: j.slot,
          kelas: j.kelas,
          status: m.status,
          // One code per group today ("" for an open seat), then helpers.
          asisten: m.kursi.map((x) => x.kode ?? ""),
          bantu,
          izin: m.izin.filter((x) => x.status !== "dibatalkan").map((x) => x.kode),
          pengganti: j.pengganti,
          jumlahKelompok: j.jumlahKelompok,
          jendelaMulaiMenit: j.jendelaMulaiMenit,
          jendelaDiaturOleh: j.jendelaDiaturOleh,
          roster: roster[j.slot] ?? { kelompok: 0, praktikan: 0 },
        };
      }),
    mingguSaya: minggu
      .filter((j) => j.status === "aktif" && j.asisten.some((k) => k.toUpperCase() === kode))
      .map((j) => ({
        hari: j.hari,
        slot: j.slot,
        kelas: j.kelas,
        kelompok: j.asisten
          .map((k, i) => (k.toUpperCase() === kode ? i + 1 : 0))
          .filter((n) => n > 0),
      })),
    terbuka,
    presentasiAktif: slide ?? null,
    server: serverInfo,
    perluNilai,
  });
}

export async function handleJendelaPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const hari = Number(body.hari);
  const slot = Number(body.slot);
  const menit = body.menit === null ? null : Number(body.menit);
  if (
    !Number.isInteger(hari) ||
    hari < 1 ||
    hari > 6 ||
    ![1, 2, 3, 4].includes(slot) ||
    (menit !== null && (!Number.isInteger(menit) || menit < JENDELA_MIN || menit > JENDELA_MAX))
  ) {
    return res.status(200).json({ ok: false, kode: "format_salah" });
  }
  const db = getDb();
  const semester = semesterDariTanggal(hariIniWib());
  const [row] = await db
    .select()
    .from(jadwal)
    .where(and(eq(jadwal.semester, semester), eq(jadwal.hari, hari), eq(jadwal.slot, slot)))
    .limit(1);
  if (!row) return res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
  const orang = await muatOrang(session.nim);
  const m = (await muatMinggu(db, [row])).get(row.id);
  const diSlot = !!orang && diSlotMinggu(row, m, orang.kode);
  if (!orang || (!diSlot && !boleh(orang, "jadwal"))) {
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "jadwal" });
  }
  // The slot's own Asisten stay inside the bounds from Schedule Settings.
  if (menit !== null && !boleh(orang, "jadwal")) {
    const b = await muatPengaturanJendela(db);
    if (menit < b.min || menit > b.max)
      return res.status(200).json({ ok: false, kode: "di_luar_batas", batas: b });
  }
  await db
    .update(jadwal)
    .set({ jendelaMulaiMenit: menit, jendelaDiaturOleh: menit === null ? null : session.nim })
    .where(eq(jadwal.id, row.id));
  await writeAudit(session.nim, "jadwal_jendela", { hari, slot, menit });
  res.status(200).json({ ok: true });
}
