/**
 * Konsol Pi (Phase 9 Stage 9; rooms and joining since 2026-10-05): the API
 * side. Rules and tickets live in src/lib/konsol.ts; this file is the
 * database and the flow.
 *
 * GET  /api/server/:id?aksi=konsol   any Asisten: the open console with who
 *      is in it, their own request and their place in the open console; the
 *      Pencipta, the Inti and DEV also get the requests waiting for them and
 *      the recent history.
 * POST /api/action { tipe: "konsol_minta" | "konsol_setujui" | "konsol_tolak"
 *      | "konsol_batal" | "konsol_tiket" | "konsol_putus" | "konsol_keberatan"
 *      | "konsol_gabung" | "konsol_gabung_jawab" | "konsol_gabung_batal"
 *      | "konsol_kendali" }
 * Heartbeat: the agent reports `konsol: [{kanal, status, ...}]` from the Pi
 * bridge (mulai when the Pi joined the relay, selesai with the transcript).
 *
 * Who: every active Asisten may ask for a console or to join an open one.
 * The Pencipta, the Inti (Admin tier) and DEV do both without an approver
 * (the others of them are told, and can ask or reject); anyone else waits
 * for one of them, or, to join, for the console's owner. Inside the room one
 * person controls at a time, which the relay keeps (konsol_kendali only
 * writes the hand-over to Audit).
 *
 * Nothing here talks to the Pi directly: opening queues the agent command
 * `konsol.buka` (delivered on the next heartbeat), and cutting off asks the
 * relay to close the room, which ends the bridge on the Pi.
 */
import { createHmac } from "node:crypto";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { clientIp, jsonBody } from "./http.js";
import { muatOrang, type OrangHak } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  konsolKeberatan,
  konsolPeserta,
  konsolPi,
  konsolTiketNonce,
  perintah,
  server,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { bacaKondisi } from "../../src/lib/server-shared.js";
import { verifyAsistenLogin, writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  BATAS_MENIT,
  TIKET_PI_DETIK,
  TIKET_WEB_DETIK,
  TRANSKRIP_MAKS,
  acakId,
  bolehKonsol,
  bolehSetujui,
  istimewaKonsol,
  sisaDetikKonsol,
  statusEfektif,
  tandaTiket,
  targetBuka,
  type KonsolStatus,
} from "../../src/lib/konsol.js";

const TERBUKA: KonsolStatus[] = ["diminta", "disetujui", "aktif"];
const BERJALAN: KonsolStatus[] = ["disetujui", "aktif"];

/** The relay's address and the shared secret, or null when not set up. */
export function konsolEnv(): { relay: string; secret: string } | null {
  const relay = process.env.KONSOL_RELAY_URL?.trim();
  const secret = process.env.KONSOL_RELAY_SECRET?.trim();
  if (!relay || !secret || secret.length < 32 || !/^wss?:\/\//.test(relay)) return null;
  return { relay: relay.replace(/\/+$/, ""), secret };
}

type Row = typeof konsolPi.$inferSelect;
type Peserta = typeof konsolPeserta.$inferSelect;

/** Brings a row's status up to date (expiry, the 60 minute cap). */
async function segarkan(r: Row): Promise<Row> {
  const s = statusEfektif(r);
  if (s === r.status) return r;
  const set = {
    status: s,
    selesai: r.selesai ?? new Date(),
    alasanSelesai: r.alasanSelesai ?? (s === "selesai" ? "batas_waktu" : "kedaluwarsa"),
  };
  await getDb().update(konsolPi).set(set).where(eq(konsolPi.id, r.id));
  if (s === "selesai") await tutupRelay(r.kanal);
  return { ...r, ...set };
}

/** Asks the relay to close a room (cut off, reject, the cap). */
async function tutupRelay(kanal: string): Promise<boolean> {
  const env = konsolEnv();
  if (!env) return false;
  const ts = Math.floor(Date.now() / 1000);
  const tanda = createHmac("sha256", env.secret).update(`tutup|${kanal}|${ts}`).digest("hex");
  try {
    const r = await fetch(`${env.relay.replace(/^ws/, "http")}/tutup/${kanal}`, {
      method: "POST",
      headers: { "x-konsol-ts": String(ts), "x-konsol-tanda": tanda },
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function nama(nims: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(nims.filter((n): n is string => !!n))];
  if (!list.length) return new Map();
  const rows = await getDb()
    .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
    .from(asisten)
    .where(inArray(asisten.nim, list));
  return new Map(rows.map((r) => [r.nim, r.kode ? `${r.nama} (${r.kode})` : r.nama]));
}

function publik(r: Row, n: Map<string, string>) {
  return {
    id: r.id,
    target: r.target,
    alasan: r.alasan,
    status: r.status,
    oleh: r.nim,
    olehNama: n.get(r.nim) ?? r.nim,
    disetujuiOleh: r.disetujuiOleh ? (n.get(r.disetujuiOleh) ?? r.disetujuiOleh) : null,
    tanpaPersetujuan: r.tanpaPersetujuan,
    paksa: r.overrideSesiOleh
      ? { oleh: n.get(r.overrideSesiOleh) ?? "", alasan: r.overrideAlasan }
      : null,
    dimintaPada: r.dimintaPada,
    mulai: r.mulai,
    selesai: r.selesai,
    alasanSelesai: r.alasanSelesai,
    diputusOleh: r.diputusOleh ? (n.get(r.diputusOleh) ?? r.diputusOleh) : null,
    transkripBytes: r.transkripBytes,
    sisaDetik: r.status === "aktif" || r.status === "disetujui" ? sisaDetikKonsol(r) : null,
  };
}

function publikPeserta(p: Peserta, n: Map<string, string>) {
  return {
    id: p.id,
    konsolId: p.konsolId,
    nim: p.nim,
    nama: n.get(p.nim) ?? p.nim,
    status: p.status,
    alasan: p.alasan,
    tanpaPersetujuan: p.tanpaPersetujuan,
    disetujuiOleh: p.disetujuiOleh ? (n.get(p.disetujuiOleh) ?? p.disetujuiOleh) : null,
    dimintaPada: p.dimintaPada,
  };
}

async function sesiBerjalan() {
  const s = await currentSesi();
  return s ? { modul: s.modul, slot: s.slot, tanggal: s.tanggal, mulai: s.mulai } : null;
}

async function pesertaDari(konsolIds: number[]): Promise<Peserta[]> {
  if (!konsolIds.length) return [];
  return getDb()
    .select()
    .from(konsolPeserta)
    .where(inArray(konsolPeserta.konsolId, konsolIds))
    .orderBy(konsolPeserta.dimintaPada);
}

/** May answer a join request to console `r`: its owner, or the Pencipta,
 *  the Inti and DEV (never the asker). */
function bolehJawabGabung(o: OrangHak, r: Row, p: Peserta): boolean {
  if (p.nim === o.nim) return false;
  return r.nim === o.nim || istimewaKonsol(o);
}

/* ---------------------------------------------------------------- GET */

export async function handleKonsolGet(res: ApiResponse, serverId: number, nim: string) {
  const db = getDb();
  const orang = await muatOrang(nim);
  const istimewa = orang ? istimewaKonsol(orang) : false;
  const boleh = orang ? bolehKonsol(orang) : false;
  const rows = await Promise.all(
    (
      await db
        .select()
        .from(konsolPi)
        .where(eq(konsolPi.serverId, serverId))
        .orderBy(desc(konsolPi.id))
        .limit(20)
    ).map(segarkan),
  );
  const aktifRow = rows.find((r) => BERJALAN.includes(r.status)) ?? null;
  const peserta = await pesertaDari(
    rows.filter((r) => TERBUKA.includes(r.status)).map((r) => r.id),
  );
  const n = await nama([
    ...rows.flatMap((r) => [r.nim, r.disetujuiOleh, r.overrideSesiOleh, r.diputusOleh]),
    ...peserta.flatMap((p) => [p.nim, p.disetujuiOleh]),
  ]);
  const diAktif = aktifRow ? peserta.filter((p) => p.konsolId === aktifRow.id) : [];
  const sayaDiAktif = diAktif.find((p) => p.nim === nim) ?? null;
  const aktif = aktifRow
    ? {
        ...publik(aktifRow, n),
        peserta: diAktif.filter((p) => p.status === "disetujui").map((p) => publikPeserta(p, n)),
      }
    : null;
  // Whether the Pi said it can show its own screen (2026-10-07); null when
  // an older agent never said.
  const [srv] = await db
    .select({ kondisi: server.kondisi })
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);
  const base = {
    ok: true,
    siap: konsolEnv() !== null,
    layar: bacaKondisi(srv?.kondisi)?.layar ?? null,
    // Old name, still read by the page: "joins and opens without asking".
    dev: istimewa,
    istimewa,
    boleh,
    aktif,
    // My place in the open console.
    saya: !aktifRow
      ? null
      : aktifRow.nim === nim
        ? { peran: "pemilik" as const }
        : sayaDiAktif
          ? {
              peran:
                sayaDiAktif.status === "disetujui"
                  ? ("peserta" as const)
                  : sayaDiAktif.status === "diminta"
                    ? ("diminta" as const)
                    : ("ditolak" as const),
              pesertaId: sayaDiAktif.id,
            }
          : { peran: null },
  };
  const mine =
    rows.find((r) => r.nim === nim && (TERBUKA.includes(r.status) || r === rows[0])) ?? null;
  // Join requests I can answer, on any open console of this Pi.
  const gabung = orang
    ? peserta
        .filter((p) => p.status === "diminta")
        .filter((p) => {
          const r = rows.find((x) => x.id === p.konsolId);
          return r && BERJALAN.includes(r.status) && bolehJawabGabung(orang, r, p);
        })
        .map((p) => {
          const r = rows.find((x) => x.id === p.konsolId)!;
          return { ...publikPeserta(p, n), target: r.target, pemilikNama: n.get(r.nim) ?? r.nim };
        })
    : [];
  if (!istimewa) {
    res.status(200).json({
      ...base,
      sesi: await sesiBerjalan(),
      pemeriksa: await pemeriksa(nim),
      milikku: mine ? publik(mine, n) : null,
      untukku: [],
      gabungUntukku: gabung,
      riwayat: rows
        .filter((r) => r.nim === nim && !TERBUKA.includes(r.status))
        .slice(0, 8)
        .map((r) => publik(r, n)),
    });
    return;
  }
  const ids = rows.map((r) => r.id);
  const keb = ids.length
    ? await db.select().from(konsolKeberatan).where(inArray(konsolKeberatan.konsolId, ids))
    : [];
  const kn = await nama(keb.map((k) => k.nim));
  res.status(200).json({
    ...base,
    sesi: await sesiBerjalan(),
    pemeriksa: await pemeriksa(nim),
    milikku: mine ? publik(mine, n) : null,
    // Waiting for me: someone else's request, or a console one of us opened
    // without an approver that I haven't answered yet.
    untukku: rows
      .filter(
        (r) =>
          r.nim !== nim &&
          (r.status === "diminta" ||
            (r.tanpaPersetujuan &&
              BERJALAN.includes(r.status) &&
              !keb.some((k) => k.konsolId === r.id && k.nim === nim))),
      )
      .map((r) => publik(r, n)),
    gabungUntukku: gabung,
    keberatan: keb.map((k) => ({
      konsolId: k.konsolId,
      jenis: k.jenis,
      teks: k.teks,
      olehNama: kn.get(k.nim) ?? k.nim,
      pada: k.dibuatPada,
    })),
    riwayat: rows
      .filter((r) => !TERBUKA.includes(r.status))
      .slice(0, 8)
      .map((r) => publik(r, n)),
  });
}

/** Who can answer a request: the Pencipta, the Inti and DEV, still active. */
async function pemeriksa(nim: string) {
  const rows = await getDb()
    .select({
      nim: asisten.nim,
      nama: asisten.nama,
      kode: asisten.kode,
      badges: asisten.badges,
      tier: asisten.tier,
    })
    .from(asisten)
    .where(eq(asisten.status, "aktif"));
  return rows
    .filter((d) => d.nim !== nim && istimewaKonsol(d))
    .map((d) => ({ kode: d.kode, nama: d.kode ? `${d.nama} (${d.kode})` : d.nama }));
}

/** For the nav dot: what waits for this person on any Pi. The Pencipta,
 *  the Inti and DEV: requests to answer, and consoles one of them opened
 *  that they haven't looked at. Anyone: requests to join a console they
 *  own (or, for those three, any console). */
export async function konsolMenunggu(nim: string): Promise<number> {
  const orang = await muatOrang(nim);
  if (!orang) return 0;
  const istimewa = istimewaKonsol(orang);
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60_000);
  const rows = await db
    .select()
    .from(konsolPi)
    .where(and(inArray(konsolPi.status, TERBUKA), gte(konsolPi.dimintaPada, since)));
  let n = 0;
  if (istimewa) {
    const terbuka = rows.filter((r) => {
      if (r.nim === nim) return false;
      const s = statusEfektif(r);
      return s === "diminta" || (r.tanpaPersetujuan && (s === "aktif" || s === "disetujui"));
    });
    if (terbuka.length) {
      const sudah = await db
        .select({ konsolId: konsolKeberatan.konsolId })
        .from(konsolKeberatan)
        .where(
          and(
            eq(konsolKeberatan.nim, nim),
            inArray(
              konsolKeberatan.konsolId,
              terbuka.map((r) => r.id),
            ),
          ),
        );
      n += terbuka.filter(
        (r) => r.status === "diminta" || !sudah.some((k) => k.konsolId === r.id),
      ).length;
    }
  }
  const berjalan = rows.filter((r) => BERJALAN.includes(statusEfektif(r)));
  if (berjalan.length) {
    const minta = await db
      .select()
      .from(konsolPeserta)
      .where(
        and(
          eq(konsolPeserta.status, "diminta"),
          ne(konsolPeserta.nim, nim),
          inArray(
            konsolPeserta.konsolId,
            berjalan.map((r) => r.id),
          ),
        ),
      );
    n += minta.filter((p) => {
      const r = berjalan.find((x) => x.id === p.konsolId)!;
      return bolehJawabGabung(orang, r, p);
    }).length;
  }
  return n;
}

/* ---------------------------------------------------------- actions */

type Body = Record<string, unknown>;

async function muatRow(id: unknown): Promise<Row | null> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const [r] = await getDb().select().from(konsolPi).where(eq(konsolPi.id, n)).limit(1);
  return r ? segarkan(r) : null;
}

function teks(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Step up: the password again, and a real one (not the starting one). */
async function sandiLagi(req: ApiRequest, nim: string, sandi: unknown): Promise<string | null> {
  const cek = await verifyAsistenLogin(nim, String(sandi ?? ""), clientIp(req));
  if (!cek.ok) return cek.kode === "terkunci" ? "terkunci" : "sandi_salah";
  if (cek.perluAturSandi) return "perlu_sandi_asli";
  return null;
}

export async function handleKonsolAksi(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
  tipe: string,
) {
  const body: Body = jsonBody(req);
  const orang = await muatOrang(session.nim);
  if (!orang || !bolehKonsol(orang)) {
    res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "konsol" });
    return;
  }
  const istimewa = istimewaKonsol(orang);
  const db = getDb();

  if (tipe === "konsol_minta") {
    const serverId = Number(body.serverId);
    const target = body.target;
    const alasan = teks(body.alasan);
    if (!Number.isInteger(serverId) || !targetBuka(target) || alasan.length < 5)
      return void res
        .status(200)
        .json({ ok: false, kode: alasan.length < 5 ? "alasan_kosong" : "format_salah" });
    const [srv] = await db
      .select({ id: server.id })
      .from(server)
      .where(eq(server.id, serverId))
      .limit(1);
    if (!srv) return void res.status(200).json({ ok: false, kode: "server_tidak_ada" });
    const salah = await sandiLagi(req, session.nim, body.sandi);
    if (salah) return void res.status(200).json({ ok: false, kode: salah });
    const open = await Promise.all(
      (
        await db
          .select()
          .from(konsolPi)
          .where(and(eq(konsolPi.serverId, serverId), inArray(konsolPi.status, TERBUKA)))
      ).map(segarkan),
    );
    if (open.some((r) => TERBUKA.includes(r.status)))
      return void res.status(200).json({ ok: false, kode: "sudah_ada" });
    const sesi = await sesiBerjalan();
    const paksa = teks(body.paksa);
    if (sesi && paksa.length < 5)
      return void res.status(200).json({ ok: false, kode: "ada_sesi", sesi });
    const [row] = await db
      .insert(konsolPi)
      .values({
        serverId,
        nim: session.nim,
        target,
        alasan,
        kanal: acakId(),
        status: istimewa ? "disetujui" : "diminta",
        tanpaPersetujuan: istimewa,
        disetujuiPada: istimewa ? new Date() : null,
        overrideSesiOleh: sesi ? session.nim : null,
        overrideAlasan: sesi ? paksa : null,
      })
      .returning();
    await writeAudit(session.nim, "konsol_minta", {
      id: row.id,
      serverId,
      target,
      alasan,
      tanpaPersetujuan: istimewa,
    });
    if (sesi) await writeAudit(session.nim, "konsol_paksa", { id: row.id, sesi, alasan: paksa });
    const n = await nama([row.nim, row.overrideSesiOleh]);
    return void res.status(200).json({ ok: true, konsol: publik(row, n) });
  }

  if (tipe === "konsol_gabung_jawab") {
    const pid = Number(body.pesertaId);
    const [p] = Number.isInteger(pid)
      ? await db.select().from(konsolPeserta).where(eq(konsolPeserta.id, pid)).limit(1)
      : [];
    if (!p) return void res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    const r = await muatRow(p.konsolId);
    if (!r || !BERJALAN.includes(r.status))
      return void res.status(200).json({ ok: false, kode: "sudah_selesai" });
    if (!bolehJawabGabung(orang, r, p))
      return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "konsol" });
    if (p.status !== "diminta")
      return void res.status(200).json({ ok: false, kode: "sudah_dijawab" });
    const setuju = body.setuju === true;
    await db
      .update(konsolPeserta)
      .set({
        status: setuju ? "disetujui" : "ditolak",
        disetujuiOleh: session.nim,
        dijawabPada: new Date(),
      })
      .where(and(eq(konsolPeserta.id, p.id), eq(konsolPeserta.status, "diminta")));
    await writeAudit(session.nim, setuju ? "konsol_gabung_setujui" : "konsol_gabung_tolak", {
      id: r.id,
      nim: p.nim,
    });
    return void res.status(200).json({ ok: true });
  }

  const r = await muatRow(body.id);
  if (!r) return void res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
  const [sayaPeserta] = await db
    .select()
    .from(konsolPeserta)
    .where(and(eq(konsolPeserta.konsolId, r.id), eq(konsolPeserta.nim, session.nim)))
    .limit(1);
  const pemilik = r.nim === session.nim;
  const diDalam = pemilik || sayaPeserta?.status === "disetujui";

  if (tipe === "konsol_setujui" || tipe === "konsol_tolak") {
    if (!bolehSetujui(orang, r))
      return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "konsol" });
    if (r.status !== "diminta")
      return void res.status(200).json({ ok: false, kode: "sudah_dijawab", status: r.status });
    const setuju = tipe === "konsol_setujui";
    const catatan = teks(body.catatan);
    const hasil = await db
      .update(konsolPi)
      .set(
        setuju
          ? { status: "disetujui", disetujuiOleh: session.nim, disetujuiPada: new Date() }
          : {
              status: "ditolak",
              disetujuiOleh: session.nim,
              selesai: new Date(),
              alasanSelesai: catatan || "ditolak",
            },
      )
      .where(and(eq(konsolPi.id, r.id), eq(konsolPi.status, "diminta")))
      .returning();
    if (!hasil.length) return void res.status(200).json({ ok: false, kode: "sudah_dijawab" });
    await writeAudit(session.nim, setuju ? "konsol_setujui" : "konsol_tolak", {
      id: r.id,
      catatan,
    });
    return void res.status(200).json({ ok: true });
  }

  if (tipe === "konsol_batal") {
    if (!pemilik) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (r.status !== "diminta" && r.status !== "disetujui")
      return void res.status(200).json({ ok: false, kode: "tidak_bisa_dibatalkan" });
    await db
      .update(konsolPi)
      .set({ status: "selesai", selesai: new Date(), alasanSelesai: "dibatalkan" })
      .where(eq(konsolPi.id, r.id));
    await writeAudit(session.nim, "konsol_batal", { id: r.id });
    return void res.status(200).json({ ok: true });
  }

  if (tipe === "konsol_gabung") {
    if (pemilik) return void res.status(200).json({ ok: false, kode: "sudah_di_dalam" });
    if (!BERJALAN.includes(r.status))
      return void res.status(200).json({ ok: false, kode: "sudah_selesai" });
    if (sayaPeserta?.status === "disetujui") return void res.status(200).json({ ok: true });
    if (sayaPeserta?.status === "diminta")
      return void res.status(200).json({ ok: false, kode: "sudah_diminta" });
    const alasan = teks(body.alasan);
    if (!istimewa && alasan.length < 5)
      return void res.status(200).json({ ok: false, kode: "alasan_kosong" });
    const salah = await sandiLagi(req, session.nim, body.sandi);
    if (salah) return void res.status(200).json({ ok: false, kode: salah });
    const nilai = {
      status: istimewa ? ("disetujui" as const) : ("diminta" as const),
      alasan: alasan || null,
      tanpaPersetujuan: istimewa,
      disetujuiOleh: null,
      dimintaPada: new Date(),
      dijawabPada: istimewa ? new Date() : null,
    };
    await db
      .insert(konsolPeserta)
      .values({ konsolId: r.id, nim: session.nim, ...nilai })
      .onConflictDoUpdate({ target: [konsolPeserta.konsolId, konsolPeserta.nim], set: nilai });
    await writeAudit(session.nim, istimewa ? "konsol_gabung" : "konsol_minta_gabung", {
      id: r.id,
      alasan,
    });
    return void res.status(200).json({ ok: true, masuk: istimewa });
  }

  if (tipe === "konsol_gabung_batal") {
    if (sayaPeserta?.status !== "diminta")
      return void res.status(200).json({ ok: false, kode: "tidak_bisa_dibatalkan" });
    await db.delete(konsolPeserta).where(eq(konsolPeserta.id, sayaPeserta.id));
    return void res.status(200).json({ ok: true });
  }

  if (tipe === "konsol_tiket") {
    if (!diDalam) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (r.status !== "disetujui" && r.status !== "aktif")
      return void res.status(200).json({ ok: false, kode: "belum_disetujui", status: r.status });
    const env = konsolEnv();
    if (!env) return void res.status(200).json({ ok: false, kode: "relay_belum_diatur" });
    const now = Math.floor(Date.now() / 1000);
    const mulai = r.mulai ?? new Date();
    const end = Math.floor(mulai.getTime() / 1000) + BATAS_MENIT * 60;
    const webNonce = acakId();
    const web = await tandaTiket(
      {
        v: 1,
        p: "web",
        k: r.kanal,
        s: r.serverId,
        u: session.nim,
        nm: orang.kode ? `${orang.nama} (${orang.kode})` : orang.nama,
        pk: pemilik,
        t: r.target as "terminal",
        exp: now + TIKET_WEB_DETIK,
        end,
        n: webNonce,
      },
      env.secret,
    );
    await db.insert(konsolTiketNonce).values({ nonce: webNonce, konsolId: r.id, peran: "web" });
    // The Pi joins once, when the owner first opens the console, or again
    // when someone in the room says the Pi side is gone (ulangPi).
    let antre = false;
    if ((r.status === "disetujui" && pemilik) || body.ulangPi === true) {
      const piNonce = acakId();
      const pi = await tandaTiket(
        {
          v: 1,
          p: "pi",
          k: r.kanal,
          s: r.serverId,
          u: "",
          t: r.target as "terminal",
          exp: now + TIKET_PI_DETIK,
          end,
          n: piNonce,
        },
        env.secret,
      );
      await db.insert(konsolTiketNonce).values({ nonce: piNonce, konsolId: r.id, peran: "pi" });
      await db.insert(perintah).values({
        serverId: r.serverId,
        aksi: "konsol.buka",
        argumen: { kanal: r.kanal, relay: env.relay, tiket: pi, target: r.target },
        dimintaOleh: session.nim,
      });
      antre = true;
      if (r.status === "disetujui")
        await db.update(konsolPi).set({ status: "aktif", mulai }).where(eq(konsolPi.id, r.id));
      await writeAudit(session.nim, "konsol_buka", { id: r.id, target: r.target });
    }
    return void res.status(200).json({
      ok: true,
      url: `${env.relay}/web/${r.kanal}?tiket=${encodeURIComponent(web)}`,
      target: r.target,
      antre,
      sisaDetik: end - now,
    });
  }

  if (tipe === "konsol_kendali") {
    // The relay moved control; this only writes it down.
    if (!diDalam) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    const ke = teks(body.ke, 20);
    if (!/^\d{5,15}$/.test(ke))
      return void res.status(200).json({ ok: false, kode: "format_salah" });
    await writeAudit(session.nim, "konsol_kendali", { id: r.id, ke });
    return void res.status(200).json({ ok: true });
  }

  if (tipe === "konsol_putus") {
    const admin = orang.tier === "admin";
    if (!pemilik && !istimewa && !admin)
      return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (!TERBUKA.includes(r.status))
      return void res.status(200).json({ ok: false, kode: "sudah_selesai" });
    const alasan = teks(body.alasan) || (pemilik ? "diakhiri" : "diputus");
    await db
      .update(konsolPi)
      .set({
        status: pemilik ? "selesai" : "diputus",
        selesai: new Date(),
        alasanSelesai: alasan,
        diputusOleh: pemilik ? null : session.nim,
      })
      .where(eq(konsolPi.id, r.id));
    const relay = await tutupRelay(r.kanal);
    await writeAudit(session.nim, pemilik ? "konsol_akhiri" : "konsol_putus", {
      id: r.id,
      alasan,
      relay,
    });
    return void res.status(200).json({ ok: true, relay });
  }

  if (tipe === "konsol_keberatan") {
    if (!istimewa || pemilik) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    const jenis = body.jenis;
    if (jenis !== "oke" && jenis !== "tanya" && jenis !== "tolak")
      return void res.status(200).json({ ok: false, kode: "format_salah" });
    const isi = teks(body.teks);
    if (jenis !== "oke" && isi.length < 5)
      return void res.status(200).json({ ok: false, kode: "alasan_kosong" });
    await db
      .insert(konsolKeberatan)
      .values({ konsolId: r.id, nim: session.nim, jenis, teks: isi || null });
    await writeAudit(session.nim, `konsol_${jenis}`, { id: r.id, teks: isi });
    if (jenis === "tolak" && TERBUKA.includes(r.status)) {
      await db
        .update(konsolPi)
        .set({
          status: "diputus",
          selesai: new Date(),
          alasanSelesai: isi,
          diputusOleh: session.nim,
        })
        .where(eq(konsolPi.id, r.id));
      await tutupRelay(r.kanal);
    }
    return void res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: false, kode: "format_salah" });
}

/* -------------------------------------------------- heartbeat reports */

interface LaporanKonsol {
  kanal: string;
  status: "mulai" | "selesai";
  bytes?: number;
  transkrip?: string;
  alasan?: string;
}

function laporanValid(v: unknown): v is LaporanKonsol {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.kanal === "string" &&
    /^[A-Za-z0-9_-]{16,64}$/.test(o.kanal) &&
    (o.status === "mulai" || o.status === "selesai")
  );
}

/** The agent's `konsol` field: the bridge joined, or it ended (with the
 *  transcript). Only rows of this server are touched. */
export async function terimaLaporanKonsol(serverId: number, raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const db = getDb();
  for (const item of raw.slice(0, 5)) {
    if (!laporanValid(item)) continue;
    const [r] = await db
      .select()
      .from(konsolPi)
      .where(and(eq(konsolPi.kanal, item.kanal), eq(konsolPi.serverId, serverId)))
      .limit(1);
    if (!r) continue;
    if (item.status === "mulai") {
      if (r.status === "disetujui")
        await db
          .update(konsolPi)
          .set({ status: "aktif", mulai: r.mulai ?? new Date() })
          .where(eq(konsolPi.id, r.id));
      continue;
    }
    const transkrip =
      typeof item.transkrip === "string" ? item.transkrip.slice(-TRANSKRIP_MAKS) : null;
    const bytes = Number.isFinite(item.bytes)
      ? Math.max(0, Math.round(item.bytes as number))
      : null;
    const tetap = r.status === "diputus" || r.status === "ditolak";
    await db
      .update(konsolPi)
      .set({
        ...(tetap
          ? {}
          : {
              status: "selesai" as const,
              alasanSelesai: r.alasanSelesai ?? teks(item.alasan, 60),
            }),
        selesai: r.selesai ?? new Date(),
        transkrip,
        transkripBytes: bytes,
      })
      .where(eq(konsolPi.id, r.id));
    await writeAudit(r.nim, "konsol_selesai", {
      id: r.id,
      serverId,
      target: r.target,
      alasan: teks(item.alasan, 60),
      bytes,
      transkrip: transkrip?.slice(-64 * 1024) ?? null,
    });
  }
}

/** A request, an approved or an open console on this Pi keeps the agent
 *  on the fast beat: "Open" doesn't wait for the idle minute, and the
 *  bridge's end-of-console report lands within seconds. */
export async function konsolSiaga(serverId: number): Promise<boolean> {
  const rows = await getDb()
    .select({ id: konsolPi.id })
    .from(konsolPi)
    .where(and(eq(konsolPi.serverId, serverId), inArray(konsolPi.status, TERBUKA)))
    .limit(1);
  return rows.length > 0;
}
