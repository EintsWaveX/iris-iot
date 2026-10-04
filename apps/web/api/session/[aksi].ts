/**
 * /api/session/:aksi — assistant-only. Merges four routes that used to be
 * their own function files (current, end, group, roster) behind one
 * dynamic segment, the same consolidation api/server/[id].ts already
 * proved for a numeric id. This one dispatches on the segment's literal
 * value instead: the Vercel Hobby plan caps a deployment at 12 Serverless
 * Functions and the project was over that ceiling at 13 with these four
 * split out alongside api/session/index.ts -- collapsing them here without
 * changing a single URL (the existing rewrites in vercel.json already map
 * /api/sesi/* onto these exact English paths) brings the count back under.
 *
 * GET  /api/session/now                             — asisten OR praktikan. Module/timing/broadcast only, no roster.
 * GET  /api/session/current                        — running session + master roster.
 * POST /api/session/end     (no body)               — end the running session.
 * POST /api/session/group   { sesiId, kelompokId, aktif } — per-session group override.
 * POST /api/session/roster  { paste }                — replace the master roster.
 * POST /api/session/cancel  { sesiId }               — mark a session "batal", freeing its slot.
 * GET  /api/session/laporan (Stage 10)               — per-group progress, attendance and the stuck list.
 * POST /api/session/siarkan { pesan } (Stage 10)     — set or clear the running session's broadcast.
 * POST /api/session/catatan { sesiId, kelompokId, catatan, peran } (Stage 10) — per-group note/role.
 * GET  /api/session/telemetry?modul=N&kelompok=M (Stage 20)          — asisten OR praktikan. The Ladder/LayerXray/GroupLive views' live-data source.
 * POST /api/session/telemetry { readings }          — praktikan. Module 1's readings from the group PC's Web Serial link.
 * POST /api/session/lanjutkan { sesiId }             — reopen an ended session until 150 minutes after its start.
 * POST /api/session/durasi { menit }                 — (Phase 9) Extend the running session (api/_lib/berjalan.ts).
 * GET  /api/session/kejadian?sesiId=                 — (Phase 9) pairing and length changes, oldest first.
 * GET  /api/session/akses (P6.5)                     — public, cacheable. Which modules students may open.
 * POST /api/session/akses { terbuka: number[] } (P6.5) — asisten-only, sets the open-module list directly.
 * GET  /api/session/laporan?sesiId= (P6.8)            — same shape as plain /laporan, for any session by id, not only the running one.
 * GET  /api/session/riwayat?modul=&dari=&sampai=&status= (P6.8) — the /reports session list.
 * GET  /api/session/ringkasan (P6.8)                  — module overview across every session ever run.
 * GET  /api/session/audit?aksiLog=&aktor=&dari= (P6.8) — the audit log viewer's data source.
 * GET  /api/session/nilai?sesiId=&sejak= (Stage 12, P8) — roster + scores + each group's owner; `sejak` (ISO) returns only rows changed since, for the 5 s live poll.
 * POST /api/session/nilai { sesiId, nim, komponen, skor } (Stage 12, P8) — one field; refused with bukan_pemilik unless the caller holds that group.
 * Phase 8 actions (assignment, help, feedback, results, schedule) are documented in api/_lib/phase8.ts.
 * Phase 9: tim (api/_lib/tim.ts), beranda and jendela (api/_lib/beranda.ts),
 * schedule and penugasan (api/_lib/penugasan-api.ts),
 * rosterslot, praktikan and susulan (api/_lib/persiapan.ts), brief (api/_lib/brief.ts),
 * lab (api/_lib/lab.ts, public).
 */
import { handlePerburuan } from "../_lib/perburuan-api.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { cekHak } from "../_lib/hak.js";
import { handleTimGet, handleTimJejak, handleTimPost } from "../_lib/tim.js";
import { handleBerandaGet, handleJendelaPost } from "../_lib/beranda.js";
import { handleBriefGet, handleBriefPost } from "../_lib/brief.js";
import { handleLab } from "../_lib/lab.js";
import {
  handlePraktikanGet,
  handlePraktikanPost,
  handleRosterSlotGet,
  handleRosterSlotPost,
  handleSusulanGet,
  handleSusulanPost,
} from "../_lib/persiapan.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import {
  requireRole,
  requireAnyRole,
  currentSession,
  requireCurrentPraktikanSesi,
} from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import {
  kelompok,
  anggota,
  sesiKelompok,
  sesi,
  jawaban,
  percobaanMasuk,
  telemetriLog,
  nilai,
  NILAI_KOMPONEN,
  asisten,
  sesiAnggota,
} from "../../src/lib/schema.js";
import type { NilaiKomponen } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import {
  getModulTerbuka,
  getModulTerbukaMeta,
  jurnalBolehDibuka,
  setModulTerbuka,
} from "../../src/lib/akses.js";
import { parseRosterPaste } from "../../src/lib/roster-parser.js";
import { hilangPersen, selisihJamMs } from "../../src/lib/telemetri-ringkas.js";
import { nomorWakil, wakilKelompok } from "../_lib/wakil.js";
import { asistenMengajar, handleHadirGet, handleHadirPost } from "../_lib/sesi-hadir.js";
import { queueSoloServerCommand, nilaiOrNull } from "../../src/lib/server-lib.js";
import {
  handleCerminGet,
  handleCerminPost,
  handleTangkapanGet,
  handleTangkapanPost,
} from "../_lib/tangkapan.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { blankCountForModul } from "../_lib/answer-keys.js";
import { SESI_CAP_DETIK, SESI_CAP_MENIT, durasiSesi } from "../../src/lib/jadwal.js";
import { bolehIsiNilai } from "../../src/lib/penugasan.js";
import { catatKejadian, handleDurasi, handleKit } from "../_lib/berjalan.js";
import {
  handleKejadianDaftar,
  handleKejadianPost,
  handleRekapGet,
  handleAuditLaporan,
  handleRekapPost,
  handleRiwayatLaporan,
} from "../_lib/laporan-data.js";
import { handleDokumenGet, handleDokumenPost } from "../_lib/dokumen.js";
import { handleBayarGet, handleBayarPost } from "../_lib/bayar.js";
import { handleSeelabsGet, handleSeelabsPost } from "../_lib/seelabs.js";
import {
  handlePenugasanGet,
  handlePenugasanPost,
  handleScheduleGet,
  handleSchedulePost,
} from "../_lib/penugasan-api.js";
import {
  handleAssignmentGet,
  handleAssignmentPost,
  handleHelpPraktikan,
  handleHelpAsisten,
  handleFeedbackPost,
  handleFeedbackGet,
  handleResults,
  handleMine,
  pemilikKelompok,
  tanganTerangkat,
  kelompokDariNim,
} from "../_lib/phase8.js";
import { eq, and, or, gte, like, sql, notInArray, isNull, desc, asc } from "drizzle-orm";

const PESAN_MAX_LEN = 200;
const CATATAN_MAX_LEN = 300;
const PERAN_VALID = new Set(["beacon", "hunter"]);

/** GET /api/session/now — the narrow session banner endpoint. Module,
 *  timing and AP-mode flag only; never the roster, since a praktikan's
 *  browser can reach this and a route it can reach must never return
 *  another student's NIM even as a side effect (see publicRoster()'s own
 *  header comment for the same rule). */
async function handleNow(req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: true, sesi: null });
    return;
  }
  // P8: a praktikan also learns whether their own group's hand is up, so the
  // mini-bar's "Minta bantuan" button survives a reload. Only their group.
  const who = currentSession(req);
  let mintaBantuanPada: string | null = null;
  if (who?.role === "praktikan" && who.kelompokId && who.sesiId === running.id) {
    const [row] = await getDb()
      .select({ pada: sesiKelompok.mintaBantuanPada })
      .from(sesiKelompok)
      .where(and(eq(sesiKelompok.sesiId, running.id), eq(sesiKelompok.kelompokId, who.kelompokId)))
      .limit(1);
    mintaBantuanPada = row?.pada?.toISOString() ?? null;
  }
  res.status(200).json({
    ok: true,
    sesi: {
      modul: running.modul,
      tanggal: running.tanggal,
      mulai: running.mulai,
      mulaiPada: running.mulaiPada,
      slot: running.slot,
      butuhAp: running.butuhAp,
      pengumuman: running.pengumuman,
      pengumumanPada: running.pengumumanPada,
      kelas: running.kelas,
      durasiMenit: durasiSesi(running),
      jumlahKelompok: running.jumlahKelompok,
      jenis: running.jenis,
      mintaBantuanPada,
      // A praktikan whose cookie belongs to an earlier session has to sign
      // in again to be counted in this one (the mini-bar asks them to).
      milikSaya: who?.role === "praktikan" ? who.sesiId === running.id : null,
      // An Asisten teaching it gets the "Sesimu berjalan" bar on every page.
      mengajar: who?.role === "asisten" ? await asistenMengajar(running, who.nim) : null,
    },
  });
}

/** GET /api/session/telemetry?modul=N&kelompok=M -- asisten OR praktikan,
 *  Stage 20's live-data source for Ladder/LayerXray/GroupLive. Group
 *  numbers, protocol figures and the reading's own values only (seq, tx,
 *  rx, delay, rssi, snr, nilai) --
 *  same privacy rule publicRoster() already follows: a route a student's
 *  browser can reach must never return another student's NIM, and
 *  telemetry never carried one to begin with. `reading: null` means no
 *  real telemetry has arrived yet for that module/group (no session, no
 *  agent, or just not started) -- the caller falls back to the simulator
 *  rather than treating that as an error.
 *
 *  Cache-Control invites Vercel's CDN to serve one shared response to every
 *  visitor polling the same module+group for a few seconds rather than
 *  hitting Neon per poll -- verifying that actually happens in production
 *  (x-vercel-cache: HIT) is part of this stage's own gate and waits on a
 *  real deploy, since no local environment can exercise Vercel's edge cache. */
async function handleTelemetry(req: ApiRequest, res: ApiResponse) {
  const modul = Number(req.query.modul);
  const kelompok = Number(req.query.kelompok);

  if (![1, 2, 3, 4].includes(modul) || !Number.isInteger(kelompok) || kelompok < 1) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  // One URL per module and group, so the CDN serves every viewer of a group
  // the same response; clients merge the list by `id`.
  res.setHeader("Cache-Control", "public, s-maxage=2, stale-while-revalidate=4");

  // Module 1 has no Pi: its rows come from the group PC's browser (see
  // handleTelemetryModul1) and carry no seq of their own, so the log id is
  // its seq. Modules 2 to 4 keep the board's own seq.
  const running = await currentSesi();
  if (modul === 1 && (!running || running.modul !== 1)) {
    res.status(200).json({ ok: true, reading: null, readings: [] });
    return;
  }
  const rows = await db
    .select({
      id: telemetriLog.id,
      seq: telemetriLog.seq,
      tx: telemetriLog.tx,
      rx: telemetriLog.rx,
      delayMs: telemetriLog.delayMs,
      rssi: telemetriLog.rssi,
      snr: telemetriLog.snr,
      nilai: telemetriLog.nilai,
      diperbaruiPada: telemetriLog.dicatatPada,
    })
    .from(telemetriLog)
    .where(
      and(
        // During a session its rows carry its id (the indexed path); outside
        // one, a dry run's rows have none.
        running ? eq(telemetriLog.sesiId, running.id) : isNull(telemetriLog.sesiId),
        eq(telemetriLog.modul, modul),
        eq(telemetriLog.kelompokNomor, kelompok),
        // Anything older than a few heartbeats is no longer live.
        gte(telemetriLog.dicatatPada, sql`now() - interval '2 minutes'`),
      ),
    )
    .orderBy(desc(telemetriLog.id))
    .limit(TELEMETRI_BACA_MAKS);

  const readings = rows.reverse().map((r) => (modul === 1 ? { ...r, seq: r.id } : r));
  res.status(200).json({ ok: true, reading: readings.at(-1) ?? null, readings });
}

const TELEMETRI_BACA_MAKS = 60;

const MODUL1_BATCH_MAX = 50;
const MODUL1_TS_RE = /^\d{2}:\d{2}:\d{2}:\d{3}$/;

/** POST /api/session/telemetry { readings: [{ tx, rx, delayMs }] } --
 *  praktikan only. Module 1's readings, parsed from the central board's
 *  Serial output in the group PC's browser (src/lib/serial-modul1.ts).
 *  Accepted only into the running Module 1 session the student signed in
 *  to, and always under the student's own group. */
async function handleTelemetryModul1(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  const running = await currentSesi();
  if (!running || running.modul !== 1 || who.sesiId !== running.id || !who.kelompokNomor) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  const body = jsonBody(req);
  const readings = Array.isArray(body.readings) ? body.readings : null;
  if (!readings || readings.length === 0 || readings.length > MODUL1_BATCH_MAX) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const ts = (v: unknown) => (typeof v === "string" && MODUL1_TS_RE.test(v) ? v : null);
  const rows = [];
  for (const r of readings as Record<string, unknown>[]) {
    const delay = r?.delayMs;
    const delayMs =
      Number.isInteger(delay) && (delay as number) >= 0 && (delay as number) <= 600_000
        ? (delay as number)
        : null;
    const tx = ts(r?.tx);
    const rx = ts(r?.rx);
    if (!tx && !rx) continue;
    rows.push({
      sesiId: running.id,
      serverId: null,
      modul: 1,
      kelompokNomor: who.kelompokNomor,
      seq: 0,
      tx,
      rx,
      delayMs: rx ? delayMs : null,
      nilai: nilaiOrNull(r?.nilai),
      diukurPada: new Date(),
    });
  }
  if (rows.length) await getDb().insert(telemetriLog).values(rows);
  res.status(200).json({ ok: true, diterima: rows.length });
}

async function handleCancel(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [row] = await db
    .select({ status: sesi.status, butuhAp: sesi.butuhAp })
    .from(sesi)
    .where(eq(sesi.id, sesiId))
    .limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  if (row.status === "selesai" || row.status === "batal") {
    res.status(200).json({ ok: false, kode: "sudah_selesai" });
    return;
  }

  await db.update(sesi).set({ status: "batal" }).where(eq(sesi.id, sesiId));
  await catatKejadian(sesiId, "batal", {}, session.nim);
  await writeAudit(session.nim, "sesi_batal", { sesiId });

  // Same as handleEnd: a cancelled hotspot session must not leave the Pi
  // stuck as a hotspot, off campus Wi-Fi, for the rest of the day.
  if (row.status === "berjalan" && row.butuhAp) {
    await queueSoloServerCommand("ap.mati", session.nim);
  }
  res.status(200).json({ ok: true });
}

async function handleCurrent(_req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  // Independent reads, so one round trip instead of four in a row: this
  // call gates the whole console, and a cold start already costs enough.
  const [running, groups, members] = await Promise.all([
    currentSesi(),
    // A group left out of the last roster save is archived (aktif false):
    // it keeps its history but is no longer part of the roster.
    db.select().from(kelompok).where(eq(kelompok.aktif, true)),
    db
      .select({ kelompokId: anggota.kelompokId, nim: anggota.nim, nama: anggota.nama })
      .from(anggota),
  ]);
  const overrides = running
    ? await db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, running.id))
    : [];
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));

  const roster = groups
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => ({
      id: g.id,
      nomor: g.nomor,
      nama: g.nama,
      aktif: g.aktif,
      sesiAktif: overrideByKelompokId.get(g.id)?.aktif ?? true,
      anggota: members
        .filter((m) => m.kelompokId === g.id)
        .map((m) => ({ nim: m.nim, nama: m.nama })),
    }));

  res.status(200).json({ ok: true, sesi: running, roster });
}

async function handleEnd(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const db = getDb();
  const [updated] = await db
    .update(sesi)
    .set({
      status: "selesai",
      selesaiPada: sql`now()`,
      durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
    })
    .where(eq(sesi.id, running.id))
    .returning();

  await catatKejadian(running.id, "akhiri", {}, session.nim);
  await writeAudit(session.nim, "sesi_akhiri", { sesiId: running.id });

  // Mirror of the auto-queue in api/session/index.ts: a session that turned
  // the hotspot on when it started should turn it back off when it ends,
  // without needing an assistant to remember the manual /servers button.
  if (running.butuhAp) {
    await queueSoloServerCommand("ap.mati", session.nim);
  }

  res.status(200).json({ ok: true, sesi: updated });
}

async function handleGroup(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kelompokId = Number(body.kelompokId);
  const aktif = Boolean(body.aktif);

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !Number.isInteger(kelompokId) ||
    kelompokId <= 0
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();
    await db
      .insert(sesiKelompok)
      .values({ sesiId, kelompokId, aktif })
      .onConflictDoUpdate({
        target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
        set: { aktif },
      });

    await writeAudit(session.nim, "sesi_kelompok_set", { sesiId, kelompokId, aktif });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[api/session/group] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleRoster(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const paste = typeof body.paste === "string" ? body.paste : "";

  const parsed = parseRosterPaste(paste);
  if (parsed.errors.length > 0) {
    res.status(200).json({
      ok: false,
      kode: "galat_tempel",
      errors: parsed.errors,
      groups: parsed.groups.length,
      total: parsed.total,
    });
    return;
  }

  try {
    const db = getDb();

    let diarsipkan = 0;
    await db.transaction(async (tx) => {
      const keepNims = parsed.groups.flatMap((g) => g.anggota.map((m) => m.nim));
      const keepNomor = parsed.groups.map((g) => g.nomor);

      for (const g of parsed.groups) {
        const nama = g.nama || `Kelompok ${g.nomor}`;
        const [row] = await tx
          .insert(kelompok)
          .values({ nomor: g.nomor, nama, aktif: true })
          .onConflictDoUpdate({ target: kelompok.nomor, set: { nama, aktif: true } })
          .returning({ id: kelompok.id });

        for (const m of g.anggota) {
          await tx
            .insert(anggota)
            .values({ kelompokId: row.id, nim: m.nim, nama: m.nama })
            .onConflictDoUpdate({
              target: anggota.nim,
              set: { kelompokId: row.id, nama: m.nama },
            });
        }
      }

      // Members are replaced outright. A group left out of the paste is
      // archived rather than deleted: its answers, scores and sessions
      // cascade from it, so deleting would erase history. Archived groups
      // drop out of the roster, sign-in and the console, and come back
      // (with that history) the next time their number is pasted.
      if (keepNims.length > 0) {
        await tx.delete(anggota).where(notInArray(anggota.nim, keepNims));
      } else {
        await tx.delete(anggota);
      }
      const archived = await tx
        .update(kelompok)
        .set({ aktif: false })
        .where(
          keepNomor.length > 0
            ? and(eq(kelompok.aktif, true), notInArray(kelompok.nomor, keepNomor))
            : eq(kelompok.aktif, true),
        )
        .returning({ id: kelompok.id });
      diarsipkan = archived.length;
    });

    await writeAudit(session.nim, "roster_set", {
      kelompok: parsed.groups.length,
      anggota: parsed.total,
      diarsipkan,
    });

    res
      .status(200)
      .json({ ok: true, groups: parsed.groups.length, total: parsed.total, diarsipkan });
  } catch (err) {
    console.error("[api/session/roster] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * GET /api/session/laporan (Stage 10; extended P6.8 with ?sesiId=) —
 * everything the console's live tiles and stuck list need in one call for
 * the running session, and (with ?sesiId=) the same shape for /reports to
 * build a full per-session report from any session, running or long over.
 * Scoped to jawaban/percobaanMasuk rows from that session itself, not any
 * earlier home-practice activity under the same groups -- see jawaban's
 * own schema comment for why a row's sesiId can be null.
 */
async function handleLaporan(req: ApiRequest, res: ApiResponse) {
  const sesiIdParam = req.query.sesiId;
  const db = getDb();

  let running: NonNullable<Awaited<ReturnType<typeof currentSesi>>>;
  if (sesiIdParam != null) {
    const sesiId = Number(sesiIdParam);
    if (!Number.isInteger(sesiId) || sesiId <= 0) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    const [row] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
    if (!row) {
      res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
      return;
    }
    running = row;
  } else {
    const found = await currentSesi();
    if (!found) {
      res.status(200).json({ ok: true, sesi: null, kelompok: [], stuck: [] });
      return;
    }
    running = found;
  }

  const prefix = `m${running.modul}.`;
  const startedAt = running.mulaiPada ?? running.dibuatPada;
  // Every read below depends only on the session, so they go out together
  // (the console polls this every 6 s; seven round trips in a row made its
  // first paint wait on the slowest chain, not the slowest query).
  const [groups, members, overrides, jawabanRows, masukRows, telemetriRows, tangan, pemilikMap] =
    await Promise.all([
      db.select().from(kelompok).where(eq(kelompok.aktif, true)),
      db
        .select({ kelompokId: anggota.kelompokId, nim: anggota.nim, nama: anggota.nama })
        .from(anggota),
      db.select().from(sesiKelompok).where(eq(sesiKelompok.sesiId, running.id)),
      db
        .select({
          kelompokId: jawaban.kelompokId,
          soalKode: jawaban.soalKode,
          benar: jawaban.benar,
          percobaan: jawaban.percobaan,
          diubahPada: jawaban.diubahPada,
        })
        .from(jawaban)
        .where(and(eq(jawaban.sesiId, running.id), like(jawaban.soalKode, `${prefix}%`))),
      // P6.2/B9: a row written from this exact session (sesiId set by
      // verifyPraktikanLogin's own recordAttempt call, since 0006) is
      // authoritative. The time-window OR branch is only a fallback for rows
      // written before that migration -- sesiId IS NULL on every one of them --
      // so login attempts recorded before P6.2 still count toward attendance
      // instead of silently vanishing from a report the day this shipped.
      db
        .select({ nim: percobaanMasuk.nim })
        .from(percobaanMasuk)
        .where(
          and(
            eq(percobaanMasuk.jenis, "praktikan"),
            eq(percobaanMasuk.berhasil, true),
            or(
              eq(percobaanMasuk.sesiId, running.id),
              and(isNull(percobaanMasuk.sesiId), gte(percobaanMasuk.pada, startedAt)),
            ),
          ),
        ),
      // P6.8: per-group telemetry count and delays for the report. Module 1
      // rows come from the group PC (Web Serial), 2 to 4 from the Pi.
      db
        .select({
          kelompokNomor: telemetriLog.kelompokNomor,
          delayMs: telemetriLog.delayMs,
          seq: telemetriLog.seq,
          tx: telemetriLog.tx,
          rx: telemetriLog.rx,
        })
        .from(telemetriLog)
        .where(eq(telemetriLog.sesiId, running.id)),
      // P8: raised hands and group owners, so the board needs one poll only.
      tanganTerangkat(db, running.id),
      pemilikKelompok(db, running.id),
    ]);
  const overrideByKelompokId = new Map(overrides.map((o) => [o.kelompokId, o]));
  const hadirNims = new Set(masukRows.map((r) => r.nim));
  const telemetriByKelompokNomor = new Map<number, number[]>();
  const telemetriCountByKelompokNomor = new Map<number, number>();
  // Phase 9: every module's one-way delay (the Pi's own delayMs, else the
  // board's send and receive stamps) and the seq range, for the inspector's
  // per-group delay and lost-message charts.
  const seqByKelompokNomor = new Map<number, number[]>();
  for (const r of telemetriRows) {
    telemetriCountByKelompokNomor.set(
      r.kelompokNomor,
      (telemetriCountByKelompokNomor.get(r.kelompokNomor) ?? 0) + 1,
    );
    const d = r.delayMs ?? selisihJamMs(r.tx, r.rx);
    if (d != null) {
      const arr = telemetriByKelompokNomor.get(r.kelompokNomor) ?? [];
      arr.push(d);
      telemetriByKelompokNomor.set(r.kelompokNomor, arr);
    }
    const sq = seqByKelompokNomor.get(r.kelompokNomor) ?? [];
    sq.push(r.seq);
    seqByKelompokNomor.set(r.kelompokNomor, sq);
  }

  const total = blankCountForModul(running.modul);
  const daftarKelompok = groups
    .filter((g) => g.nomor <= (running.jumlahKelompok ?? 10))
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => {
      const override = overrideByKelompokId.get(g.id);
      const anggotaKelompok = members.filter((m) => m.kelompokId === g.id);
      const jawabanKelompok = jawabanRows.filter((r) => r.kelompokId === g.id);
      const benar = jawabanKelompok.filter((r) => r.benar).length;
      const hadir = anggotaKelompok.filter((m) => hadirNims.has(m.nim)).length;
      const delays = telemetriByKelompokNomor.get(g.nomor) ?? [];
      return {
        id: g.id,
        nomor: g.nomor,
        nama: g.nama,
        sesiAktif: override?.aktif ?? true,
        catatan: override?.catatan ?? null,
        peran: override?.peran ?? null,
        anggotaTotal: anggotaKelompok.length,
        hadir,
        benar,
        total,
        // P6.6: member names for the Kelompok tab's tiles -- this route is
        // asisten-only already (handleCurrent's own roster carries the same
        // NIMs), so adding names here breaks no new ground privacy-wise.
        anggota: anggotaKelompok.map((m) => ({
          nim: m.nim,
          nama: m.nama,
          hadir: hadirNims.has(m.nim),
        })),
        // P6.8: per-blank attempts for the session report -- the live
        // console only ever needed the aggregate `benar` count above, but a
        // report needs to show which specific blanks a group struggled with.
        blankRinci: jawabanKelompok.map((r) => ({
          soalKode: r.soalKode,
          benar: r.benar,
          percobaan: r.percobaan,
          diubahPada: r.diubahPada,
        })),
        // P6.8: telemetri_log summary for this session's report. delayMs is
        // only ever populated for Module 4 (see telemetriLog's own schema
        // comment) -- min/median/max come back null for Modules 2-3, which
        // the report renders as "from your serial output", same wording the
        // live Ladder/GroupLive views already use for the same gap.
        telemetri: {
          count: telemetriCountByKelompokNomor.get(g.nomor) ?? 0,
          delayMinMs: delays.length ? Math.min(...delays) : null,
          delayMedianMs: median(delays),
          delayMaxMs: delays.length ? Math.max(...delays) : null,
          delayRataMs: delays.length
            ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
            : null,
          hilangPct: hilangPersen(seqByKelompokNomor.get(g.nomor) ?? []),
        },
      };
    });

  const kelompokNomorById = new Map(groups.map((g) => [g.id, g.nomor]));
  const stuck = jawabanRows
    .filter((r) => !r.benar && r.percobaan > 0)
    .map((r) => ({
      kelompokId: r.kelompokId,
      nomor: kelompokNomorById.get(r.kelompokId) ?? null,
      soalKode: r.soalKode,
      percobaan: r.percobaan,
    }))
    .sort((a, b) => b.percobaan - a.percobaan);

  // A "berjalan" session has no durasiDetik yet (only set on end/cancel), so
  // the report computes it live; any other status without one (batal, most
  // often) genuinely has no meaningful duration rather than "how long ago it
  // was cancelled", so it reports 0 instead of a nonsensical elapsed time.
  const durasiDetik =
    running.durasiDetik ??
    (running.status === "berjalan" ? Math.round((Date.now() - startedAt.getTime()) / 1000) : 0);

  const pemilik = Object.fromEntries(pemilikMap);

  res.status(200).json({
    ok: true,
    sesi: {
      id: running.id,
      modul: running.modul,
      tanggal: running.tanggal,
      mulai: running.mulai,
      status: running.status,
      kelas: running.kelas,
      durasiDetik,
      // The hand-over's kit count (Siapkan Sesi Berikutnya).
      kit: running.kit ?? null,
    },
    kelompok: daftarKelompok,
    stuck,
    tangan,
    pemilik,
  });
}

const NILAI_KOMPONEN_SET: ReadonlySet<string> = new Set(NILAI_KOMPONEN);
const SKOR_MIN = 0;
const SKOR_MAX = 100;

/**
 * GET /api/session/nilai?sesiId= (Stage 12) — the grading tab's data source.
 * Keyed by sesiId (an explicit, given session), not "the currently running
 * session" the way most of this file's other actions are: a session's
 * grades are entered any time after it ends, often well after a new session
 * has started, so there is no "rollover" for this endpoint to guard
 * against the way praktikan cookies need one -- the id in the query string
 * IS the whole address, nothing implicit to go stale.
 */
async function handleNilaiGet(req: ApiRequest, res: ApiResponse) {
  const sesiId = Number(req.query.sesiId);
  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [running] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const pemilik = Object.fromEntries(await pemilikKelompok(db, sesiId));

  // P8 live poll: with ?sejak=<ISO> only the fields changed since then come
  // back (plus who changed them), so several assistants polling every 5 s
  // stay cheap and the grid can flash exactly the cells another one typed.
  const sejakParam = typeof req.query.sejak === "string" ? req.query.sejak : "";
  if (sejakParam) {
    const sejak = new Date(sejakParam);
    if (Number.isNaN(sejak.getTime())) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    const berubah = await db
      .select({
        nim: nilai.nim,
        komponen: nilai.komponen,
        skor: nilai.skor,
        diubahOleh: nilai.diubahOleh,
        diubahPada: nilai.diubahPada,
      })
      .from(nilai)
      .where(and(eq(nilai.sesiId, sesiId), gte(nilai.diubahPada, sejak)));
    res.status(200).json({ ok: true, berubah, pemilik, server: new Date().toISOString() });
    return;
  }

  const groups = await db.select().from(kelompok).where(eq(kelompok.aktif, true));
  const members = await db
    .select({ kelompokId: anggota.kelompokId, nim: anggota.nim, nama: anggota.nama })
    .from(anggota);
  const nilaiRows = await db.select().from(nilai).where(eq(nilai.sesiId, sesiId));
  const nilaiByNim = new Map<string, Partial<Record<NilaiKomponen, number>>>();
  for (const r of nilaiRows) {
    const entry = nilaiByNim.get(r.nim) ?? {};
    entry[r.komponen] = r.skor;
    nilaiByNim.set(r.nim, entry);
  }

  const daftarKelompok = groups
    .filter((g) => g.nomor <= (running.jumlahKelompok ?? 10))
    .sort((a, b) => a.nomor - b.nomor)
    .map((g) => {
      const anggotaKelompok = members.filter((m) => m.kelompokId === g.id);
      return {
        id: g.id,
        nomor: g.nomor,
        nama: g.nama,
        anggota: anggotaKelompok.map((m) => {
          const skor = nilaiByNim.get(m.nim) ?? {};
          const diisi = NILAI_KOMPONEN.filter((k) => skor[k] != null).length;
          return {
            nim: m.nim,
            nama: m.nama,
            skor,
            total: NILAI_KOMPONEN.reduce((acc, k) => acc + (skor[k] ?? 0), 0),
            lengkap: diisi === NILAI_KOMPONEN.length,
          };
        }),
      };
    });

  res.status(200).json({
    ok: true,
    sesi: { id: running.id, modul: running.modul, tanggal: running.tanggal },
    komponen: NILAI_KOMPONEN,
    kelompok: daftarKelompok,
    pemilik,
    server: new Date().toISOString(),
  });
}

/** POST /api/session/nilai { sesiId, nim, komponen, skor } (Stage 12) — one
 *  field, one save: the grading tab autosaves on blur rather than batching a
 *  whole row, the same granularity BlankEditor's draft save already uses for
 *  code blanks, for the same reason (a lost connection mid-entry should
 *  cost at most one field, not a whole student's row). */
async function handleNilaiPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const nim = typeof body.nim === "string" ? body.nim.trim() : "";
  const komponen = typeof body.komponen === "string" ? body.komponen : "";
  const skor = Number(body.skor);

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !nim ||
    !NILAI_KOMPONEN_SET.has(komponen) ||
    !Number.isInteger(skor) ||
    skor < SKOR_MIN ||
    skor > SKOR_MAX
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [target] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!target) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  // Phase 9: the session's own roster snapshot decides the student's group,
  // so scores of a past session stay editable after the roster moved on.
  // Sessions from before the snapshot fall back to the master roster.
  const [snap] = await db
    .select({ kelompokId: kelompok.id })
    .from(sesiAnggota)
    .innerJoin(kelompok, eq(kelompok.nomor, sesiAnggota.kelompokNomor))
    .where(and(eq(sesiAnggota.sesiId, sesiId), eq(sesiAnggota.nim, nim)))
    .limit(1);
  const [member] = snap
    ? [null]
    : await db.select().from(anggota).where(eq(anggota.nim, nim)).limit(1);
  if (!snap && !member) {
    res.status(200).json({ ok: false, kode: "nim_tidak_ada" });
    return;
  }
  // P8: one assistant per group. Only the group's holder may write its
  // scores; an unassigned group stays open to anyone.
  const pemilik = await pemilikKelompok(db, sesiId);
  const kelompokId = snap?.kelompokId ?? (await kelompokDariNim(db, nim)) ?? member!.kelompokId;
  if (!bolehIsiNilai(pemilik, kelompokId, session.nim)) {
    res.status(200).json({ ok: false, kode: "bukan_pemilik", pemilik: pemilik.get(kelompokId) });
    return;
  }

  await db
    .insert(nilai)
    .values({
      sesiId,
      nim,
      komponen: komponen as NilaiKomponen,
      skor,
      diubahOleh: session.nim,
    })
    .onConflictDoUpdate({
      target: [nilai.sesiId, nilai.nim, nilai.komponen],
      set: { skor, diubahOleh: session.nim, diubahPada: new Date() },
    });

  await writeAudit(session.nim, "nilai_set", { sesiId, nim, komponen, skor });
  res.status(200).json({ ok: true });
}

/** POST /api/session/siarkan { pesan } (Stage 10) — an empty/whitespace-only
 *  pesan clears the broadcast rather than being rejected, since "take down
 *  what I just said" is a normal thing an assistant does with this. */
async function handleSiarkan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }

  const body = jsonBody(req);
  const pesanMentah = typeof body.pesan === "string" ? body.pesan.trim() : "";
  if (pesanMentah.length > PESAN_MAX_LEN) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const pesan = pesanMentah.length > 0 ? pesanMentah : null;

  const db = getDb();
  await db
    .update(sesi)
    .set({ pengumuman: pesan, pengumumanPada: new Date() })
    .where(eq(sesi.id, running.id));

  if (pesan) await catatKejadian(running.id, "siarkan", { pesan }, session.nim);
  await writeAudit(session.nim, "sesi_siarkan", { sesiId: running.id, pesan });
  res.status(200).json({ ok: true });
}

/** POST /api/session/catatan { sesiId, kelompokId, catatan, peran } (Stage
 *  10) — the per-group note and role sesi_kelompok has carried since
 *  migration 0002 with nothing ever writing to either column until now.
 *  Deliberately separate from handleGroup's aktif toggle: two different
 *  assistant intentions ("exclude this group" vs. "leave a note") sharing
 *  one action would mean every note-only save has to first re-read and
 *  resend whatever aktif already was, just to avoid clobbering it. */
async function handleCatatan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const sesiId = Number(body.sesiId);
  const kelompokId = Number(body.kelompokId);
  const catatanMentah = typeof body.catatan === "string" ? body.catatan.trim() : "";
  const peranMentah = typeof body.peran === "string" ? body.peran : null;

  if (
    !Number.isInteger(sesiId) ||
    sesiId <= 0 ||
    !Number.isInteger(kelompokId) ||
    kelompokId <= 0 ||
    catatanMentah.length > CATATAN_MAX_LEN ||
    (peranMentah !== null && !PERAN_VALID.has(peranMentah))
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const catatan = catatanMentah.length > 0 ? catatanMentah : null;
  const peran = peranMentah as "beacon" | "hunter" | null;

  const db = getDb();
  await db
    .insert(sesiKelompok)
    .values({ sesiId, kelompokId, catatan, peran })
    .onConflictDoUpdate({
      target: [sesiKelompok.sesiId, sesiKelompok.kelompokId],
      set: { catatan, peran },
    });

  await writeAudit(session.nim, "sesi_kelompok_catatan", { sesiId, kelompokId, catatan, peran });
  res.status(200).json({ ok: true });
}

/** POST /api/session/lanjutkan { sesiId } -- reopens a session that was
 *  ended, as long as 150 minutes (the most a session may run) have not
 *  passed since it started. A session that ran its own shorter length
 *  comes back with the full 150, since an assistant who resumes it means
 *  to keep going. An ended
 *  session keeps holding its slot (sesi_slot_unik), so before this one
 *  stray "Akhiri sesi" left no way back: re-creating the same slot failed
 *  with "sudah_ada" and cancelling refused an ended session. Reopening
 *  keeps the same id, so every answer and attendance row already recorded
 *  under it still counts. */
async function handleLanjutkan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const sesiId = Number(jsonBody(req).sesiId);
  if (!Number.isInteger(sesiId) || sesiId <= 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const db = getDb();
  const [row] = await db.select().from(sesi).where(eq(sesi.id, sesiId)).limit(1);
  if (!row) {
    res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
    return;
  }
  if (row.status !== "selesai") {
    res.status(200).json({ ok: false, kode: "tidak_bisa_dilanjutkan" });
    return;
  }
  const startedAt = row.mulaiPada ?? row.dibuatPada;
  if (Date.now() - startedAt.getTime() >= SESI_CAP_DETIK * 1000) {
    res.status(200).json({ ok: false, kode: "sudah_lewat" });
    return;
  }

  const demoted = await db.transaction(async (tx) => {
    const demotedRows = await tx
      .update(sesi)
      .set({
        status: "selesai",
        selesaiPada: sql`now()`,
        durasiDetik: sql`extract(epoch from now() - coalesce(${sesi.mulaiPada}, ${sesi.dibuatPada}))::int`,
      })
      .where(eq(sesi.status, "berjalan"))
      .returning({ butuhAp: sesi.butuhAp });
    const habis = Date.now() - startedAt.getTime() >= durasiSesi(row) * 60_000;
    await tx
      .update(sesi)
      .set({
        status: "berjalan",
        selesaiPada: null,
        durasiDetik: null,
        ...(habis ? { durasiMenit: SESI_CAP_MENIT } : {}),
      })
      .where(eq(sesi.id, sesiId));
    return demotedRows[0];
  });

  await catatKejadian(sesiId, "lanjutkan", {}, session.nim);
  await writeAudit(session.nim, "sesi_lanjutkan", { sesiId });

  if (row.butuhAp) {
    await queueSoloServerCommand("ap.nyala", session.nim);
  } else if (demoted?.butuhAp) {
    await queueSoloServerCommand("ap.mati", session.nim);
  }
  res.status(200).json({ ok: true });
}

/** GET /api/session/akses (P6.5) — public: a logged-out visitor sees the
 *  same lock state a student does, since the module cards on / and
 *  /modules render before anyone has signed in. Cached at the edge for
 *  15s, same idea as the CDN caching Stage 20 already uses for the
 *  telemetry route -- this changes only when an assistant opens a module
 *  or starts a session, never per request. */
async function handleAksesGet(_req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  const terbuka = await getModulTerbuka();
  res.status(200).json({ ok: true, terbuka });
}

/** GET /api/session/akses?meta=1 (P6.6) -- asisten-only, uncached: the same
 *  array plus who changed it and when, for the session console's Modul tab.
 *  A separate branch rather than growing handleAksesGet's own response,
 *  since that one is deliberately public and CDN-cached -- varying its
 *  shape by role would risk an assistant-shaped response (carrying an
 *  assistant's own identifier) being served back to an anonymous visitor
 *  from the same cache entry. */
async function handleAksesMeta(_req: ApiRequest, res: ApiResponse) {
  const meta = await getModulTerbukaMeta();
  res.status(200).json({ ok: true, ...meta });
}

/** POST /api/session/akses (P6.5) — an assistant's direct, explicit choice
 *  of which modules are open (Preparation, Module Access). Phase 9: this is
 *  the only way a module opens; a closed module can't be started. */
async function handleAksesPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  if (!Array.isArray(body.terbuka)) {
    res.status(400).json({ ok: false, kode: "terbuka_tidak_valid" });
    return;
  }
  const terbuka = await setModulTerbuka(body.terbuka as unknown[] as number[], session.nim);
  await writeAudit(session.nim, "modul_akses_ubah", { terbuka });
  res.status(200).json({ ok: true, terbuka });
}

/** GET /api/session/asisten (Phase 9): every Asisten's NIM, code and full
 *  name, so islands can write people as "Full Name (CODE)" (people.ts). */
async function handleAsistenDirectory(res: ApiResponse) {
  const rows = await getDb()
    .select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama })
    .from(asisten)
    .orderBy(asc(asisten.kode));
  res.status(200).json({ ok: true, asisten: rows });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);

  const aksi = req.query.aksi;

  // "akses" GET is public (no noStore override -- it sets its own
  // Cache-Control above); POST is asisten-only, checked inline since it
  // shares the segment with a public GET rather than the blanket guard
  // every action below this point goes through.
  if (aksi === "akses") {
    if (req.method === "POST") {
      const session = requireRole(req, res, "asisten");
      if (!session) return;
      if (!(await cekHak(res, session.nim, "jadwal"))) return;
      return handleAksesPost(req, res, session);
    }
    if (!requireMethod(req, res, "GET")) return;
    if (req.query.meta === "1") {
      const session = requireRole(req, res, "asisten");
      if (!session) return;
      return handleAksesMeta(req, res);
    }
    return handleAksesGet(req, res);
  }

  // "now" is the one action either role can call -- checked before the
  // blanket asisten-only guard below, not as an exception carved into it.
  if (aksi === "now") {
    if (!requireMethod(req, res, "GET")) return;
    if (!requireAnyRole(req, res, ["asisten", "praktikan"])) return;
    return handleNow(req, res);
  }
  if (aksi === "telemetry") {
    if (req.method === "POST") {
      // An Asisten writing for the group they hold (Lihat Sebagai Praktikan).
      const wakil = nomorWakil(req, jsonBody(req));
      const who = wakil
        ? await wakilKelompok(req, res, wakil, true)
        : await requireCurrentPraktikanSesi(req, res);
      if (!who) return;
      return handleTelemetryModul1(req, res, who);
    }
    if (!requireMethod(req, res, "GET")) return;
    if (!requireAnyRole(req, res, ["asisten", "praktikan"])) return;
    return handleTelemetry(req, res);
  }

  // Phase 9: the Module 4 Perburuan step (the hunt on the Pi, as one group
  // sees it). An Asisten reads the group they view as.
  if (aksi === "perburuan") {
    if (!requireMethod(req, res, "GET")) return;
    const wakil = nomorWakil(req);
    const who = wakil
      ? await wakilKelompok(req, res, wakil, false)
      : await requireCurrentPraktikanSesi(req, res);
    if (!who) return;
    return handlePerburuan(req, res, who);
  }

  // Phase 9 (7f): journal captures and the serial mirror.
  if (aksi === "tangkapan") {
    if (req.method === "POST") {
      // An Asisten writing for the group they hold (Lihat Sebagai Praktikan).
      const wakil = nomorWakil(req, jsonBody(req));
      const who = wakil
        ? await wakilKelompok(req, res, wakil, true)
        : await requireCurrentPraktikanSesi(req, res);
      if (!who) return;
      return handleTangkapanPost(req, res, who);
    }
    if (!requireMethod(req, res, "GET")) return;
    const who = requireAnyRole(req, res, ["asisten", "praktikan"]);
    if (!who) return;
    return handleTangkapanGet(req, res, who);
  }
  if (aksi === "cermin") {
    if (req.method === "POST") {
      // An Asisten writing for the group they hold (Lihat Sebagai Praktikan).
      const wakil = nomorWakil(req, jsonBody(req));
      const who = wakil
        ? await wakilKelompok(req, res, wakil, true)
        : await requireCurrentPraktikanSesi(req, res);
      if (!who) return;
      return handleCerminPost(req, res, who);
    }
    if (!requireMethod(req, res, "GET")) return;
    if (!requireRole(req, res, "asisten")) return;
    return handleCerminGet(req, res);
  }

  // P8 actions a praktikan can call (each checks the role it needs).
  if (aksi === "help") {
    if (!requireMethod(req, res, "POST")) return;
    const who = requireAnyRole(req, res, ["asisten", "praktikan"]);
    if (!who) return;
    return who.role === "praktikan"
      ? handleHelpPraktikan(req, res, who)
      : handleHelpAsisten(req, res, who);
  }
  if (aksi === "feedback") {
    if (req.method === "POST") {
      const who = requireRole(req, res, "praktikan");
      if (!who) return;
      return handleFeedbackPost(req, res, who);
    }
    if (!requireMethod(req, res, "GET")) return;
    const who = requireRole(req, res, "asisten");
    if (!who) return;
    return handleFeedbackGet(req, res, who);
  }
  if (aksi === "mine") {
    if (!requireMethod(req, res, "GET")) return;
    const who = requireRole(req, res, "praktikan");
    if (!who) return;
    return handleMine(req, res, who);
  }
  // Which journals the viewer may open (Phase 8). Anyone may ask; a
  // visitor who is not signed in simply gets none.
  if (aksi === "jurnal") {
    if (!requireMethod(req, res, "GET")) return;
    const who = currentSession(req);
    const jurnal = who ? await jurnalBolehDibuka(who) : [];
    res.status(200).json({ ok: true, jurnal });
    return;
  }
  if (aksi === "results") {
    if (!requireMethod(req, res, "GET")) return;
    // Projector mode: an Asisten reads the group they hold, as its Praktikan.
    const wakil = nomorWakil(req);
    const who = wakil
      ? await wakilKelompok(req, res, wakil, true)
      : requireRole(req, res, "praktikan");
    if (!who) return;
    return handleResults(req, res, who);
  }

  // Phase 9: Home's "In the lab now" counts are public.
  if (aksi === "lab") {
    if (!requireMethod(req, res, "GET")) return;
    return handleLab(req, res);
  }

  // Phase 9: the Asisten's Module Brief is public to read.
  if (aksi === "brief" && req.method === "GET") return handleBriefGet(req, res);

  const session = requireRole(req, res, "asisten");
  if (!session) return;

  if (aksi === "brief") {
    if (!requireMethod(req, res, "POST")) return;
    return handleBriefPost(req, res, session);
  }
  if (aksi === "rosterslot") {
    if (req.method === "POST") return handleRosterSlotPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleRosterSlotGet(req, res);
  }
  if (aksi === "praktikan") {
    if (req.method === "POST") return handlePraktikanPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handlePraktikanGet(req, res);
  }
  if (aksi === "susulan") {
    if (req.method === "POST") return handleSusulanPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleSusulanGet(req, res);
  }
  if (aksi === "beranda") {
    if (!requireMethod(req, res, "GET")) return;
    return handleBerandaGet(req, res, session);
  }
  if (aksi === "jendela") {
    if (!requireMethod(req, res, "POST")) return;
    return handleJendelaPost(req, res, session);
  }
  if (aksi === "tim") {
    if (req.method === "POST") return handleTimPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    if (typeof req.query.nim === "string") return handleTimJejak(req, res);
    return handleTimGet(req, res, session);
  }
  if (aksi === "asisten") {
    if (!requireMethod(req, res, "GET")) return;
    return handleAsistenDirectory(res);
  }
  // Phase 9: the running session's Preparation view (who teaches, who is here).
  if (aksi === "hadir") {
    if (req.method === "POST") return handleHadirPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleHadirGet(req, res);
  }
  if (aksi === "assignment") {
    if (req.method === "POST") return handleAssignmentPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleAssignmentGet(req, res);
  }
  if (aksi === "penugasan") {
    if (req.method === "POST") return handlePenugasanPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handlePenugasanGet(req, res, session);
  }
  if (aksi === "schedule") {
    if (req.method === "POST") {
      if (!(await cekHak(res, session.nim, "jadwal"))) return;
      return handleSchedulePost(req, res, session);
    }
    if (!requireMethod(req, res, "GET")) return;
    return handleScheduleGet(req, res);
  }
  if (aksi === "current") {
    if (!requireMethod(req, res, "GET")) return;
    return handleCurrent(req, res);
  }
  if (aksi === "end") {
    if (!requireMethod(req, res, "POST")) return;
    return handleEnd(req, res, session);
  }
  if (aksi === "group") {
    if (!requireMethod(req, res, "POST")) return;
    return handleGroup(req, res, session);
  }
  if (aksi === "roster") {
    if (!requireMethod(req, res, "POST")) return;
    return handleRoster(req, res, session);
  }
  if (aksi === "cancel") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCancel(req, res, session);
  }
  if (aksi === "laporan") {
    if (!requireMethod(req, res, "GET")) return;
    return handleLaporan(req, res);
  }
  if (aksi === "riwayat") {
    if (!requireMethod(req, res, "GET")) return;
    return handleRiwayatLaporan(req, res);
  }
  if (aksi === "rekap") {
    if (req.method === "POST") return handleRekapPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleRekapGet(req, res, session);
  }
  if (aksi === "dokumen") {
    if (req.method === "POST") return handleDokumenPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleDokumenGet(req, res, session);
  }
  if (aksi === "audit") {
    if (!requireMethod(req, res, "GET")) return;
    return handleAuditLaporan(req, res);
  }
  if (aksi === "siarkan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleSiarkan(req, res, session);
  }
  if (aksi === "catatan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCatatan(req, res, session);
  }
  if (aksi === "durasi") {
    if (!requireMethod(req, res, "POST")) return;
    return handleDurasi(req, res, session);
  }
  if (aksi === "kit") {
    if (!requireMethod(req, res, "POST")) return;
    return handleKit(req, res, session);
  }
  if (aksi === "kejadian") {
    if (req.method === "POST") return handleKejadianPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleKejadianDaftar(req, res);
  }
  if (aksi === "lanjutkan") {
    if (!requireMethod(req, res, "POST")) return;
    return handleLanjutkan(req, res, session);
  }
  if (aksi === "seelabs") {
    if (req.method === "POST") return handleSeelabsPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleSeelabsGet(req, res, session);
  }
  if (aksi === "bayar") {
    if (req.method === "POST") return handleBayarPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleBayarGet(req, res, session);
  }
  if (aksi === "nilai") {
    if (req.method === "POST") return handleNilaiPost(req, res, session);
    if (!requireMethod(req, res, "GET")) return;
    return handleNilaiGet(req, res);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}
