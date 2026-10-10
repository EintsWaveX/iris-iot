/**
 * GET    /api/server/:id   — assistant-only. Everything the server detail
 *   view needs in one call: the server row (with lokasi, catatan and the
 *   agent info, so the Settings form starts from the saved values), its
 *   latest heartbeat, its 20 most recent commands, and the running
 *   session's module (the Ready check's default). Phase 9 dropped the
 *   device list along with the Devices tab.
 *
 * GET    /api/server/:id?aksi=perintah&sebelum=<id>  (Phase 9) — the next
 *   page of 20 commands older than command <id>, for "Semua perintah".
 *
 * DELETE /api/server/:id   — assistant-only. Removes a registered server;
 *   denyut/perangkat/perintah cascade with it (see schema.ts's onDelete).
 *   Mainly what makes agent/tools/uji_protokol.py self-cleaning: that tool
 *   registers a real, disposable server against the real database on every
 *   run, and without this route those rows would accumulate forever.
 *
 * POST   /api/server/:id   — assistant-only. Issues a fresh one-time
 *   enrollment token (30-minute TTL) and returns it once, the same shape
 *   POST /api/server gives at registration. Without it, a token that
 *   expired before the Pi was set up, or a Pi reinstalled from scratch
 *   (whose /etc/iris-agent/config.json went with it), could only be fixed
 *   by deleting the server and losing its whole history. Enrolling with
 *   the new token replaces the agent key, so an old install stops being
 *   accepted the moment the new one enrolls.
 *
 * GET    /api/server/:id?aksi=riwayat&rentang=1h|24h|7d  (P6.7) — the
 *   server centre's Ringkasan tab: a downsampled denyut series plus reboot
 *   detection, offline gaps, availability % and a per-service status
 *   timeline, all computed in server-lib.ts's pure history functions.
 *
 * GET    /api/server/konsol (Phase 9 Stage 9) — Konsol requests waiting on
 *   this DEV, for the nav's dot. GET ?aksi=konsol is one Pi's console.
 * PATCH  /api/server/:id   (P6.7) — assistant-only. Edits any subset of
 *   nama/lokasi/catatan/alamatLan (the server centre's Pengaturan tab).
 */
import { bacaRekamPasang, hapusRekamPasang } from "../_lib/pasang.js";
import { handleKonsolGet, konsolMenunggu } from "../_lib/konsol.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { cekHak } from "../_lib/hak.js";
import { jsonBody, noStore } from "../_lib/http.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { server, denyut, perintah } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import {
  generateEnrollToken,
  enrollTokenExpiry,
  sha256,
  batasLuringDetik,
  rentangValid,
  RENTANG_DETIK,
  RIWAYAT_MAX_POINTS,
  downsample,
  detectReboots,
  detectGaps,
  hitungKetersediaan,
  bangunTimelineLayanan,
  sweepPerintahKedaluwarsa,
} from "../../src/lib/server-lib.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { desc, asc, and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { denganSiaran } from "../_lib/siaran.js";
import { bundelTerbaru } from "../_lib/bundel.js";

const MAX_TEXT_LEN = 500;
const AKSI_TERAKHIR = [
  "diag.siap",
  "diag.rinci",
  "diag.journal",
  "diag.ringkas",
  "diag.jaringan",
  "diag.dmesg",
  "diag.log",
  "info.segarkan",
];
const PERINTAH_PER_HALAMAN = 20;

async function handleGet(_req: ApiRequest, res: ApiResponse, id: number) {
  const db = getDb();
  // A silent Pi runs no sweep of its own: the page that asks at a
  // command's expiry (Phase 12) sees it expired.
  await sweepPerintahKedaluwarsa();
  const [row] = await db.select().from(server).where(eq(server.id, id)).limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }

  const [denyutTerakhir] = await db
    .select()
    .from(denyut)
    .where(eq(denyut.serverId, id))
    .orderBy(desc(denyut.pada))
    .limit(1);

  const running = await currentSesi();
  const sesiMulaiPada = running ? (running.mulaiPada ?? running.dibuatPada) : null;

  const daftarPerintah = await db
    .select()
    .from(perintah)
    .where(eq(perintah.serverId, id))
    .orderBy(desc(perintah.id))
    .limit(PERINTAH_PER_HALAMAN);

  // Stage 5: each diagnostic's newest finished result (per service for
  // diag.log), so a busy command list never pushes one off the page.
  const layananArg = sql<string>`coalesce(${perintah.argumen}->>'layanan', '')`;
  const terakhir = await db
    .selectDistinctOn([perintah.aksi, layananArg])
    .from(perintah)
    .where(
      and(
        eq(perintah.serverId, id),
        inArray(perintah.aksi, AKSI_TERAKHIR),
        inArray(perintah.status, ["selesai", "gagal"]),
      ),
    )
    .orderBy(perintah.aksi, layananArg, desc(perintah.id));
  const siapRiwayat = await db
    .select()
    .from(perintah)
    .where(
      and(
        eq(perintah.serverId, id),
        eq(perintah.aksi, "diag.siap"),
        inArray(perintah.status, ["selesai", "gagal"]),
      ),
    )
    .orderBy(desc(perintah.id))
    .limit(9);

  res.status(200).json({
    ok: true,
    server: {
      id: row.id,
      nama: row.nama,
      kode: row.kode,
      alamatLan: row.alamatLan,
      lokasi: row.lokasi,
      catatan: row.catatan,
      agenVersi: row.agenVersi,
      infoSistem: row.infoSistem,
      infoSistemPada: row.infoSistemPada,
      kondisi: row.kondisi,
      kondisiPada: row.kondisiPada,
      riwayatSejak: row.riwayatSejak,
      terdaftar: row.terdaftarPada !== null,
      terdaftarPada: row.terdaftarPada,
    },
    // 2026-10-08: the one-line install's progress, for the wizard.
    pasang: await bacaRekamPasang(id),
    // Stage 5: what the Updates card compares the Pi's bundle with. Set on
    // Vercel; null in local runs, where the card shows the SHA only.
    situsIot: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    // 2026-10-07: the newest bundle CI published, what Update installs.
    bundelTerbit: await bundelTerbaru(),
    denyutTerakhir: denyutTerakhir ?? null,
    batasLuringDetik: batasLuringDetik(denyutTerakhir?.pada ?? null, sesiMulaiPada),
    perintah: daftarPerintah,
    terakhir,
    siapRiwayat,
    sesiModul: running?.modul ?? null,
  });
}

/** Phase 9: one page of older commands for "Semua perintah", keyed by id
 *  (ids only grow, so a page boundary never shifts while new commands are
 *  queued above it). `lagi` says whether another page exists. */
async function handlePerintah(_req: ApiRequest, res: ApiResponse, id: number, sebelum: number) {
  if (!Number.isInteger(sebelum) || sebelum <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(perintah)
    .where(and(eq(perintah.serverId, id), lt(perintah.id, sebelum)))
    .orderBy(desc(perintah.id))
    .limit(PERINTAH_PER_HALAMAN + 1);
  res.status(200).json({
    ok: true,
    perintah: rows.slice(0, PERINTAH_PER_HALAMAN),
    lagi: rows.length > PERINTAH_PER_HALAMAN,
  });
}

/**
 * P6.7: GET /api/server/:id?aksi=riwayat&rentang=1h|24h|7d -- the server
 * centre's Ringkasan tab. Everything is computed here from `denyut` rows
 * rather than a second query per chart: one range fetch, downsampled once
 * for the chart series, and the SAME (undownsampled) rows fed to
 * detectReboots/detectGaps/hitungKetersediaan/bangunTimelineLayanan --
 * downsampling before those would blur exactly the short reboot/gap
 * signals they exist to catch.
 */
async function handleRiwayat(_req: ApiRequest, res: ApiResponse, id: number, rentang: string) {
  if (!rentangValid(rentang)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const mulai = new Date(Date.now() - RENTANG_DETIK[rentang] * 1000);
  const akhir = new Date();
  const [srv] = await db
    .select({ sejak: server.riwayatSejak })
    .from(server)
    .where(eq(server.id, id))
    .limit(1);
  // Stage 5: events before "Kosongkan log" stay out of the lists; the
  // chart series and availability still use every row.
  const sejak = srv?.sejak?.toISOString() ?? "";

  const rows = await db
    .select({
      pada: denyut.pada,
      cpu: denyut.cpu,
      memori: denyut.memori,
      disk: denyut.disk,
      suhu: denyut.suhu,
      jaringan: denyut.jaringan,
      uptimeSec: denyut.uptimeSec,
      layanan: denyut.layanan,
    })
    .from(denyut)
    .where(and(eq(denyut.serverId, id), gte(denyut.pada, mulai)))
    .orderBy(asc(denyut.pada));

  const withIso = rows.map((r) => ({ ...r, pada: r.pada.toISOString() }));

  res.status(200).json({
    ok: true,
    rentang,
    mulai: mulai.toISOString(),
    akhir: akhir.toISOString(),
    seri: downsample(withIso, RIWAYAT_MAX_POINTS),
    reboot: detectReboots(withIso).filter((r) => r.pada >= sejak),
    gap: detectGaps(withIso).filter((g) => g.sampai >= sejak),
    ketersediaan: hitungKetersediaan(withIso, mulai, akhir),
    timelineLayanan: bangunTimelineLayanan(withIso).filter((x) => x.dari >= sejak),
  });
}

/** P6.7: PATCH /api/server/:id -- the server centre's Pengaturan tab. Any
 *  subset of the four editable fields may be present; an absent field is
 *  left alone (not cleared), a present one with an empty string clears it
 *  (catatan/lokasi/alamatLan are all nullable). */
interface ServerPatch {
  nama?: string;
  lokasi?: string | null;
  catatan?: string | null;
  alamatLan?: string | null;
}

/** Reads and validates one optional string field from the PATCH body.
 *  Returns `undefined` when absent (leave the column alone), `null` when
 *  present but blank (clear a nullable column), the trimmed string
 *  otherwise, or throws a sentinel by returning the FORMAT_SALAH symbol
 *  when the raw value isn't a string or exceeds the length cap. */
const FORMAT_SALAH = Symbol("format_salah");
function readField(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined | typeof FORMAT_SALAH {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (typeof raw !== "string" || raw.length > MAX_TEXT_LEN) return FORMAT_SALAH;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

async function handlePatch(req: ApiRequest, res: ApiResponse, id: number, aktorNim: string) {
  const body = jsonBody(req);
  const patch: ServerPatch = {};

  const nama = readField(body, "nama");
  // nama is not nullable -- an explicit blank, like an invalid value, is a
  // format error rather than a clear.
  if (nama === FORMAT_SALAH || nama === null) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (nama !== undefined) patch.nama = nama;

  for (const field of ["lokasi", "catatan", "alamatLan"] as const) {
    const value = readField(body, field);
    if (value === FORMAT_SALAH) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    if (value !== undefined) patch[field] = value;
  }

  if (Object.keys(patch).length === 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const result = await db
    .update(server)
    .set(patch)
    .where(eq(server.id, id))
    .returning({ id: server.id });
  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  await writeAudit(aktorNim, "server_ubah", { id, ...patch });
  res.status(200).json({ ok: true });
}

async function handleDelete(_req: ApiRequest, res: ApiResponse, id: number, aktorNim: string) {
  const db = getDb();
  const result = await db.delete(server).where(eq(server.id, id)).returning({ kode: server.kode });
  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  await hapusRekamPasang(id);
  await writeAudit(aktorNim, "server_hapus", { id, kode: result[0].kode });
  res.status(200).json({ ok: true });
}

async function handleTokenBaru(_req: ApiRequest, res: ApiResponse, id: number, aktorNim: string) {
  const token = generateEnrollToken();
  const db = getDb();
  const result = await db
    .update(server)
    .set({ daftarTokenHash: sha256(token), daftarTokenExp: enrollTokenExpiry() })
    .where(eq(server.id, id))
    .returning({ kode: server.kode });
  if (result.length === 0) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  await hapusRekamPasang(id);
  await writeAudit(aktorNim, "server_token_baru", { id, kode: result[0].kode });
  res.status(200).json({ ok: true, id, kode: result[0].kode, token });
}

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  // Phase 9 Stage 9: the nav's dot for DEVs, Konsol requests waiting on
  // them across every Pi (0 for everyone else).
  if (req.query.id === "konsol" && req.method === "GET") {
    res.status(200).json({ ok: true, menunggu: await konsolMenunggu(session.nim) });
    return;
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  if (req.method === "GET") {
    const aksi = req.query.aksi;
    if (aksi === "riwayat") return handleRiwayat(req, res, id, String(req.query.rentang ?? ""));
    if (aksi === "perintah") return handlePerintah(req, res, id, Number(req.query.sebelum));
    if (aksi === "konsol") return handleKonsolGet(res, id, session.nim);
    return handleGet(req, res, id);
  }
  // Phase 9: settings, removing a Pi and new enrolment tokens are the full
  // Server view (Admin and DEV).
  if (!(await cekHak(res, session.nim, "full"))) return;
  if (req.method === "PATCH") return handlePatch(req, res, id, session.nim);
  if (req.method === "DELETE") return handleDelete(req, res, id, session.nim);
  if (req.method === "POST") return handleTokenBaru(req, res, id, session.nim);

  res.setHeader("Allow", "GET, PATCH, DELETE, POST");
  res.status(405).json({ ok: false, kode: "metode_tidak_diizinkan" });
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("server", handler);
