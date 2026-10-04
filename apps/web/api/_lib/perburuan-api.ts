/**
 * GET /api/session/perburuan (Phase 9, ruled 2026-10-04): one group's view
 * of the Module 4 hunt for the module page's Perburuan step. A Praktikan
 * reads their own group; an Asisten reads the group they view as
 * (?kelompok=, Lihat Sebagai Praktikan).
 *
 * The hunt itself lives on the Pi's offline hotspot, so this only reports:
 * the state of the round, where phones join (hotspot or lab LAN address,
 * the same rule as the Console's session bar), the Wi-Fi to join (SSID and
 * passphrase the agent read from the Pi at run time; shown only while the
 * hotspot is on), who in the group has joined, and the result.
 */
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { anggota as anggotaT, denyut, kelompok, server } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { hotspotMenyala } from "../../src/lib/server-shared.js";
import {
  keadaanPerburuan,
  penghargaanKelompok,
  saringPerburuan,
  wifiQr,
  type Ringkas,
} from "../../src/lib/perburuan.js";

const PORT_HUNT = 8080;
const ALAMAT_HOTSPOT = "192.168.4.1";

export async function handlePerburuan(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  res.setHeader("Cache-Control", "no-store");
  const running = await currentSesi();
  const nomor = who.kelompokNomor;
  if (!running || running.modul !== 4 || !nomor) {
    res.status(200).json({ ok: true, aktif: false });
    return;
  }

  const db = getDb();
  // The Pi running the hunt is the one that reported a summary lately;
  // there is only ever one hunt at a time.
  const [srv] = await db
    .select({
      id: server.id,
      perburuan: server.perburuan,
      hotspot: server.hotspot,
      alamatLan: server.alamatLan,
    })
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
  let ap = true;
  if (srv) {
    const [d] = await db
      .select({ modeJaringan: denyut.modeJaringan })
      .from(denyut)
      .where(eq(denyut.serverId, srv.id))
      .orderBy(desc(denyut.pada))
      .limit(1);
    ap = hotspotMenyala(d?.modeJaringan);
  }
  const host = !ap && srv?.alamatLan ? srv.alamatLan : ALAMAT_HOTSPOT;
  const nimParam = who.role === "praktikan" ? `?nim=${encodeURIComponent(who.nim)}` : "";
  const url = `http://${host}:${PORT_HUNT}/${nimParam}`;
  const wifi = ap && srv?.hotspot ? srv.hotspot : null;

  // The same roster the Pi got (sesi.ts's jadwalModul4Hari): the group's
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
    keadaan: keadaanPerburuan(ringkas, nomor),
    piTerhubung: !!ringkas,
    // The hunt's own roster doesn't hold this NIM (a late roster change):
    // the step says to ask the Asisten instead of showing a link that fails.
    terdaftar: who.role !== "praktikan" || !g || g.anggota.some((a) => a.nim === who.nim),
    url,
    lan: !ap,
    wifi: wifi ? { ssid: wifi.ssid, sandi: wifi.sandi, qr: wifiQr(wifi.ssid, wifi.sandi) } : null,
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
