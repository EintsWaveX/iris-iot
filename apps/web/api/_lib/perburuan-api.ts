/**
 * GET /api/session/perburuan (Phase 9, ruled 2026-10-04): one group's view
 * of the Module 4 hunt for the module page's Perburuan step. A Praktikan
 * reads their own group; an Asisten reads the group they view as
 * (?kelompok=, Lihat Sebagai Praktikan).
 *
 * The hunt itself runs on the PC's scoreboard at hunt.irisiotlab.com
 * (2026-11-10: phones stay on their own mobile data, and each group's own
 * phone makes the hotspot for its Beacon and Hunter), so this only reports:
 * the state of the round, the link phones open (with today's join code, only
 * while the hunt is open), the hotspot name and password the group sets on
 * its phone, who in the group has joined, and the result.
 */
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { anggota as anggotaT, kelompok, server } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { bacaPerburuanSesi } from "./perburuan-sesi.js";
import {
  hotspotKelompok,
  keadaanPerburuan,
  penghargaanKelompok,
  perburuanBerjalan,
  saringPerburuan,
  tautanPerburuan,
  type Ringkas,
} from "../../src/lib/perburuan.js";

export async function handlePerburuan(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  res.setHeader("Cache-Control", "no-store");
  const running = await currentSesi();
  const nomor = who.kelompokNomor;
  if (!running || running.modul !== 4 || !nomor) {
    res.status(200).json({ ok: true, aktif: false });
    return;
  }

  const db = getDb();
  // The PC running the hunt is the one that reported a summary lately;
  // there is only ever one hunt at a time.
  const [srv] = await db
    .select({ perburuan: server.perburuan })
    .from(server)
    .where(
      and(
        isNotNull(server.perburuanPada),
        gte(server.perburuanPada, sql`now() - interval '2 minutes'`),
      ),
    )
    .orderBy(desc(server.perburuanPada))
    .limit(1);

  const ringkas: Ringkas | null = srv ? saringPerburuan(srv.perburuan) : null;
  // 2026-10-08: the step opens only with the Asisten's Mulai Perburuan
  const perburuan = await bacaPerburuanSesi(running.id);
  // Every member scans the same screen and types their own NIM on the phone
  // (ruled 22:49). The link carries today's join code, but only while the
  // Asisten's hunt is open: before Mulai and after Selesai nobody needs it,
  // and a code that is never shown cannot leak.
  // The code and the keys are tied to the hunt's session, so they are only
  // shown once that session exists: before it, the hunt would hand out a
  // value that changes a moment later.
  const terbuka = perburuanBerjalan(perburuan) && ringkas?.sesi != null;
  const url = tautanPerburuan(terbuka ? (ringkas?.kode ?? null) : null);
  // A group is only ever given its own board key
  const kunciPapan = terbuka ? (ringkas?.kunci[String(nomor)] ?? null) : null;

  // The same roster the PC got (sesi.ts's jadwalModul4Hari): the group's
  // members, so names and the hunt's NIMs line up.
  const nama = await db
    .select({ nim: anggotaT.nim, nama: anggotaT.nama })
    .from(anggotaT)
    .innerJoin(kelompok, eq(kelompok.id, anggotaT.kelompokId))
    .where(eq(kelompok.nomor, nomor));
  const g = ringkas?.grup.find((x) => x.grup === nomor) ?? null;
  const namaDari = new Map(nama.map((r) => [r.nim, r.nama]));
  // The web's roster names everyone; the hunt adds role and presence.
  const dariHunt = new Map((g?.anggota ?? []).map((a) => [a.nim, a]));
  const anggota = [
    ...nama.map((r) => ({
      nama: r.nama,
      aku: r.nim === who.nim,
      peran: dariHunt.get(r.nim)?.peran ?? null,
      hadir: dariHunt.get(r.nim)?.hadir ?? false,
    })),
    ...(g?.anggota ?? [])
      .filter((a) => !namaDari.has(a.nim))
      .map((a) => ({ nama: a.nim, aku: a.nim === who.nim, peran: a.peran, hadir: a.hadir })),
  ];

  res.status(200).json({
    ok: true,
    aktif: true,
    keadaan: keadaanPerburuan(ringkas, nomor, perburuan),
    pcTerhubung: !!ringkas,
    // The hunt's own roster doesn't hold this NIM (a late roster change):
    // the step says to ask the Asisten instead of showing a link that fails.
    terdaftar: who.role !== "praktikan" || !g || g.anggota.some((a) => a.nim === who.nim),
    url,
    hotspot: hotspotKelompok(nomor),
    kunciPapan,
    berjalan: ringkas?.berjalan ?? 0,
    jumlahKelompok: ringkas?.grup.length ?? 0,
    kelompok: {
      nomor,
      status: g?.status ?? null,
      heat: g?.heat ?? null,
      rank: g?.rank ?? null,
      durasi: g?.durasi ?? null,
      klaimKe: g?.klaimKe ?? null,
      anggota,
    },
    penghargaan: penghargaanKelompok(ringkas?.penghargaan ?? null, nomor),
    peristiwa: (ringkas?.peristiwa ?? []).filter((e) => e.grup === nomor),
  });
}
