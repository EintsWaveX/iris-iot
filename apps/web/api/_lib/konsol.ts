/**
 * Konsol Pi (Phase 9 Stage 9): the API side. Rules and tickets live in
 * src/lib/konsol.ts; this file is the database and the flow.
 *
 * GET  /api/server/:id?aksi=konsol   anyone with Server access: the open
 *      console's banner; DEV and the Pencipta also get their own request,
 *      the ones waiting for them and the recent history.
 * POST /api/action { tipe: "konsol_minta" | "konsol_setujui" | "konsol_tolak"
 *      | "konsol_batal" | "konsol_tiket" | "konsol_putus" | "konsol_keberatan" }
 * Heartbeat: the agent reports `konsol: [{kanal, status, ...}]` from the Pi
 * bridge (mulai when the Pi joined the relay, selesai with the transcript).
 *
 * Nothing here talks to the Pi directly: opening queues the agent command
 * `konsol.buka` (delivered on the next heartbeat), and cutting off asks the
 * relay to close the room, which ends the bridge on the Pi.
 */
import { createHmac } from "node:crypto";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { clientIp, jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  konsolKeberatan,
  konsolPi,
  konsolTiketNonce,
  perintah,
  server,
} from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { verifyAsistenLogin, writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  BATAS_MENIT,
  TIKET_PI_DETIK,
  TIKET_WEB_DETIK,
  TRANSKRIP_MAKS,
  acakId,
  bolehKonsol,
  bolehSetujui,
  sisaDetikKonsol,
  statusEfektif,
  tandaTiket,
  targetValid,
  type KonsolStatus,
} from "../../src/lib/konsol.js";

const TERBUKA: KonsolStatus[] = ["diminta", "disetujui", "aktif"];

/** The relay's address and the shared secret, or null when not set up. */
export function konsolEnv(): { relay: string; secret: string } | null {
  const relay = process.env.KONSOL_RELAY_URL?.trim();
  const secret = process.env.KONSOL_RELAY_SECRET?.trim();
  if (!relay || !secret || secret.length < 32 || !/^wss?:\/\//.test(relay)) return null;
  return { relay: relay.replace(/\/+$/, ""), secret };
}

type Row = typeof konsolPi.$inferSelect;

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

async function sesiBerjalan() {
  const s = await currentSesi();
  return s ? { modul: s.modul, slot: s.slot, tanggal: s.tanggal, mulai: s.mulai } : null;
}

/* ---------------------------------------------------------------- GET */

export async function handleKonsolGet(res: ApiResponse, serverId: number, nim: string) {
  const db = getDb();
  const orang = await muatOrang(nim);
  const dev = orang ? bolehKonsol(orang) : false;
  const rows = await Promise.all(
    (
      await db
        .select()
        .from(konsolPi)
        .where(eq(konsolPi.serverId, serverId))
        .orderBy(desc(konsolPi.id))
        .limit(dev ? 20 : 5)
    ).map(segarkan),
  );
  const n = await nama(
    rows.flatMap((r) => [r.nim, r.disetujuiOleh, r.overrideSesiOleh, r.diputusOleh]),
  );
  const aktif = rows.find((r) => r.status === "aktif" || r.status === "disetujui") ?? null;
  const base = {
    ok: true,
    siap: konsolEnv() !== null,
    dev,
    aktif: aktif ? publik(aktif, n) : null,
  };
  if (!dev) {
    res.status(200).json(base);
    return;
  }
  const mine =
    rows.find((r) => r.nim === nim && (TERBUKA.includes(r.status) || r === rows[0])) ?? null;
  const ids = rows.map((r) => r.id);
  const keb = ids.length
    ? await db.select().from(konsolKeberatan).where(inArray(konsolKeberatan.konsolId, ids))
    : [];
  const kn = await nama(keb.map((k) => k.nim));
  // Who else can answer: the other DEVs and the Pencipta, still active.
  const devs = await db
    .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode, badges: asisten.badges })
    .from(asisten)
    .where(eq(asisten.status, "aktif"));
  res.status(200).json({
    ...base,
    sesi: await sesiBerjalan(),
    pemeriksa: devs
      .filter((d) => d.nim !== nim && bolehKonsol(d))
      .map((d) => ({ kode: d.kode, nama: d.kode ? `${d.nama} (${d.kode})` : d.nama })),
    milikku: mine ? publik(mine, n) : null,
    // Waiting for me: someone else's request, or a console the Pencipta
    // opened that I haven't answered yet.
    untukku: rows
      .filter(
        (r) =>
          r.nim !== nim &&
          (r.status === "diminta" ||
            (r.tanpaPersetujuan &&
              (r.status === "aktif" || r.status === "disetujui") &&
              !keb.some((k) => k.konsolId === r.id && k.nim === nim))),
      )
      .map((r) => publik(r, n)),
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

/** For the nav dot: what waits for this DEV on any Pi, a request to answer
 *  or a console the Pencipta opened that they haven't looked at yet. */
export async function konsolMenunggu(nim: string): Promise<number> {
  const orang = await muatOrang(nim);
  if (!orang || !bolehKonsol(orang)) return 0;
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60_000);
  const rows = await db
    .select()
    .from(konsolPi)
    .where(
      and(
        ne(konsolPi.nim, nim),
        inArray(konsolPi.status, TERBUKA),
        gte(konsolPi.dimintaPada, since),
      ),
    );
  const terbuka = rows.filter((r) => {
    const s = statusEfektif(r);
    return s === "diminta" || (r.tanpaPersetujuan && (s === "aktif" || s === "disetujui"));
  });
  if (!terbuka.length) return 0;
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
  return terbuka.filter((r) => r.status === "diminta" || !sudah.some((k) => k.konsolId === r.id))
    .length;
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

export async function handleKonsolAksi(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
  tipe: string,
) {
  const body: Body = jsonBody(req);
  const orang = await muatOrang(session.nim);
  if (!orang) {
    res.status(403).json({ ok: false, kode: "tanpa_hak" });
    return;
  }
  const dev = bolehKonsol(orang);
  const db = getDb();

  if (tipe === "konsol_minta") {
    if (!dev) return void res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "konsol" });
    const serverId = Number(body.serverId);
    const target = body.target;
    const alasan = teks(body.alasan);
    if (!Number.isInteger(serverId) || !targetValid(target) || alasan.length < 5)
      return void res
        .status(200)
        .json({ ok: false, kode: alasan.length < 5 ? "alasan_kosong" : "format_salah" });
    const [srv] = await db
      .select({ id: server.id })
      .from(server)
      .where(eq(server.id, serverId))
      .limit(1);
    if (!srv) return void res.status(200).json({ ok: false, kode: "server_tidak_ada" });
    // Step up: the password again, and a real one (not the starting password).
    const cek = await verifyAsistenLogin(session.nim, String(body.sandi ?? ""), clientIp(req));
    if (!cek.ok)
      return void res
        .status(200)
        .json({ ok: false, kode: cek.kode === "terkunci" ? "terkunci" : "sandi_salah" });
    if (cek.perluAturSandi)
      return void res.status(200).json({ ok: false, kode: "perlu_sandi_asli" });
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
    const pencipta = orang.badges.includes("pencipta");
    const [row] = await db
      .insert(konsolPi)
      .values({
        serverId,
        nim: session.nim,
        target,
        alasan,
        kanal: acakId(),
        status: pencipta ? "disetujui" : "diminta",
        tanpaPersetujuan: pencipta,
        disetujuiPada: pencipta ? new Date() : null,
        overrideSesiOleh: sesi ? session.nim : null,
        overrideAlasan: sesi ? paksa : null,
      })
      .returning();
    await writeAudit(session.nim, "konsol_minta", {
      id: row.id,
      serverId,
      target,
      alasan,
      pencipta,
    });
    if (sesi) await writeAudit(session.nim, "konsol_paksa", { id: row.id, sesi, alasan: paksa });
    const n = await nama([row.nim, row.overrideSesiOleh]);
    return void res.status(200).json({ ok: true, konsol: publik(row, n) });
  }

  const r = await muatRow(body.id);
  if (!r) return void res.status(200).json({ ok: false, kode: "tidak_ditemukan" });

  if (tipe === "konsol_setujui" || tipe === "konsol_tolak") {
    if (!bolehSetujui({ nim: session.nim, badges: orang.badges }, r))
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
    if (r.nim !== session.nim) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (r.status !== "diminta" && r.status !== "disetujui")
      return void res.status(200).json({ ok: false, kode: "tidak_bisa_dibatalkan" });
    await db
      .update(konsolPi)
      .set({ status: "selesai", selesai: new Date(), alasanSelesai: "dibatalkan" })
      .where(eq(konsolPi.id, r.id));
    await writeAudit(session.nim, "konsol_batal", { id: r.id });
    return void res.status(200).json({ ok: true });
  }

  if (tipe === "konsol_tiket") {
    if (r.nim !== session.nim) return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
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
        t: r.target as "terminal",
        exp: now + TIKET_WEB_DETIK,
        end,
        n: webNonce,
      },
      env.secret,
    );
    await db.insert(konsolTiketNonce).values({ nonce: webNonce, konsolId: r.id, peran: "web" });
    // The Pi joins once, when the console first opens, or again when the
    // page says the Pi side is gone (ulangPi).
    let antre = false;
    if (r.status === "disetujui" || body.ulangPi === true) {
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

  if (tipe === "konsol_putus") {
    const milik = r.nim === session.nim;
    const admin = orang.tier === "admin";
    if (!milik && !dev && !admin)
      return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
    if (!TERBUKA.includes(r.status))
      return void res.status(200).json({ ok: false, kode: "sudah_selesai" });
    const alasan = teks(body.alasan) || (milik ? "diakhiri" : "diputus");
    await db
      .update(konsolPi)
      .set({
        status: milik ? "selesai" : "diputus",
        selesai: new Date(),
        alasanSelesai: alasan,
        diputusOleh: milik ? null : session.nim,
      })
      .where(eq(konsolPi.id, r.id));
    const relay = await tutupRelay(r.kanal);
    await writeAudit(session.nim, milik ? "konsol_akhiri" : "konsol_putus", {
      id: r.id,
      alasan,
      relay,
    });
    return void res.status(200).json({ ok: true, relay });
  }

  if (tipe === "konsol_keberatan") {
    if (!dev || r.nim === session.nim)
      return void res.status(403).json({ ok: false, kode: "tanpa_hak" });
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
