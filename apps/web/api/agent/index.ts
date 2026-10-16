/**
 * POST /api/agent   { kode, token }                                (enroll)
 *                | { serverId, agenKunci, cpu, memori, disk, suhu,
 *                    uptimeSec, jamSelaras, modeJaringan, layanan,
 *                    telemetri, hasilPerintah,
 *                    agenVersi?, infoSistem?, alamatLan?,
 *                    perburuan?, hotspot?, jamPi?, hasilSeelabs? } (heartbeat)
 *                | { serverId, agenKunci, bundel: sha256 }       (fetch, 2026-10-07)
 *                | { serverId, agenKunci, tpDaftar: true }       (TP mirror list)
 *                | { serverId, agenKunci, tpUnduh: { id, i } }   (one TP file, bytes)
 *                | { tipe: "bundel_pasang", kode, token, ringkas? } (one-line install)
 *                | { tipe: "pasang_kabar", kode, token, tahap, ulang?, gagal? }
 *                  (the install's progress, for the wizard)
 *                | { tipe: "bundel_terbit", aso, iot, sha256, isi, tanda }
 *                  with Authorization: Bearer BUNDEL_TERBIT       (CI publish)
 *
 * Two very different operations sharing one file, dispatched on whether
 * `token` is present -- an enrollment body always has one, a heartbeat
 * body never does, so there is no ambiguity. Merged here rather than kept
 * as api/agent/daftar.ts + api/agent/denyut.ts purely because the Vercel
 * Hobby plan caps a deployment at 12 serverless functions (see
 * api/action.ts's header for the other half of this consolidation, and
 * the same note on splitting them back apart later).
 *
 * Enroll: exchanges a one-time token for the long-lived agent key the
 * agent presents on every heartbeat afterward. No session cookie -- this
 * runs once, from the Pi itself, before the agent has any other credential.
 *
 * Heartbeat: one round trip does five things -- records this cycle's
 * health (Phase 9 stopped storing the devices the agent still lists under
 * `perangkat`; the Devices tab is gone and the field is ignored), records whatever
 * real telemetry it collected (Stage 20 -- Module 2's journalctl parse,
 * Module 3's mosquitto_sub read, or Module 4's own /telemetri.json),
 * reports the outcome of any commands it ran since the last beat, hands
 * back whatever is queued for it now (claimed atomically -- see
 * claimPerintahMenunggu()'s own comment for the race this closes, P6.2/B7 --
 * and swept for anything that expired since the last beat, from ANY
 * server, not just this one), and -- only on a day with a Module 4
 * session -- today's schedule (`jadwal`, see sesi.ts's jadwalModul4Hari())
 * so the scoreboard's roster reaches the Pi before the hotspot ever has to
 * go up. `agenVersi`/`infoSistem` (P6.2, sent by an agent built from P6.1
 * onward) are stored on the server row when present and simply omitted
 * otherwise, so an older agent's heartbeat needs no special casing here.
 * `alamatLan` (Phase 9) works the same way, and so do `perburuan` (the
 * Module 4 hunt's /ringkas.json) and `hotspot` (the SSID and passphrase the
 * agent reads from the Pi's own hostapd file), both for the Perburuan step.
 * No inbound port on the Pi is ever needed -- the agent always calls out,
 * and commands ride the response of the call it was always going to make
 * anyway. Each reply carries the site's clock (`waktu`), and `jamPi` (the
 * Pi's) becomes kondisi.selisihDetik, so a Pi with a wrong clock is shown
 * as such and its Konsol still gets the full time.
 *
 * The TP mirror (2026-10-14): an agent that sends `tpCermin` (its folder,
 * counts and the stamp it last saw) gets `tpCermin.segarkan` when a TP file
 * changed since, then asks for the list (`tpDaftar`) and fetches each new
 * file (`tpUnduh`, the raw bytes). See _lib/tp-cermin.ts.
 *
 * The Updates card (2026-10-07): CI publishes the signed bundle here, and
 * the agent fetches it here when someone presses Update (see
 * _lib/bundel.ts). Both ride this route for the same 12-function cap.
 */
import { konsolSiaga, terimaLaporanKonsol } from "../_lib/konsol.js";
import { ambilBundel, bundelUntukPasang, terbitkan } from "../_lib/bundel.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { denganGalat } from "../_lib/galat.js";
import { siarkan } from "../_lib/siaran.js";
import { waitUntil } from "@vercel/functions";
import { Readable } from "node:stream";
import { bacaSet, sinkronBilaPerlu } from "../_lib/tp.js";
import { ambilIsiTp, kirimTertunda } from "../_lib/tp-unggah.js";
import {
  daftarCermin,
  saringCermin,
  simpanStatusCermin,
  stempelCermin,
} from "../_lib/tp-cermin.js";
import { otomatisLmsBilaPerlu } from "../_lib/lms-otomatis.js";
import { jamLabBilaPerlu } from "../_lib/jam-lab.js";
import { adaTugasRobot, ambilTugas, harianBilaPerlu, terimaHasil } from "../_lib/seelabs-robot.js";
import { kirimRelay } from "../_lib/aliran.js";
import { ruangSesi } from "../../src/lib/aliran.js";
import type { PesanAliran } from "../../src/lib/aliran.js";
import { catatKabar } from "../_lib/pasang.js";
import type { Topik } from "../../src/lib/siaran-topik.js";
import { requireMethod, jsonBody, noStore } from "../_lib/http.js";
import { getDb } from "../../src/lib/db.js";
import { server, denyut, perintah, tpKiriman } from "../../src/lib/schema.js";
import {
  consumeEnrollToken,
  generateAgentKey,
  sha256,
  verifyAgentKey,
  pruneOldHeartbeatsOccasionally,
  rekamTelemetri,
  pruneOldTelemetryOccasionally,
  claimPerintahMenunggu,
  sweepPerintahKedaluwarsa,
  INTERVAL_AKTIF_SEC,
  INTERVAL_IDLE_SEC,
  INTERVAL_SIAGA_SEC,
  INTERVAL_TELEMETRI_SEC,
  MODUL_TELEMETRI_PI,
  adaPerintahBaru,
  batasLuringDetik,
} from "../../src/lib/server-lib.js";
import { currentSesi, jadwalModul4Hari } from "../../src/lib/sesi.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { bacaKondisi, saringKondisi } from "../../src/lib/server-shared.js";
import { saringHotspot, saringPerburuan } from "../../src/lib/perburuan.js";
import { eq, and } from "drizzle-orm";

interface HasilPerintahMasuk {
  id: number;
  status: "selesai" | "gagal";
  keluaran?: string;
}

// The Pi's LAN address as the agent saw it (its default route's source
// address). An IPv4 or IPv6 literal, nothing else.
const ALAMAT_LAN_RE = /^[0-9A-Fa-f:.]{2,45}$/;

async function handleDaftar(req: ApiRequest, res: ApiResponse) {
  const body = jsonBody(req);
  const kode = typeof body.kode === "string" ? body.kode.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!kode || !token) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ id: server.id })
      .from(server)
      .where(eq(server.kode, kode))
      .limit(1);
    if (!row) {
      res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
      return;
    }

    const consumed = await consumeEnrollToken(row.id, token);
    if (!consumed) {
      res.status(200).json({ ok: false, kode: "token_tidak_sah" });
      return;
    }

    const agenKunci = generateAgentKey();
    await db
      .update(server)
      .set({ agenKunciHash: sha256(agenKunci) })
      .where(eq(server.id, row.id));

    res.status(200).json({ ok: true, serverId: row.id, agenKunci });
    // The wizard's Activate step turns green on this.
    await siarkan(["server"]);
  } catch (err) {
    console.error("[api/agent daftar] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handleDenyut(req: ApiRequest, res: ApiResponse) {
  const body = jsonBody(req);
  const serverId = Number(body.serverId);
  const agenKunci = typeof body.agenKunci === "string" ? body.agenKunci : "";

  if (!Number.isInteger(serverId) || serverId <= 0 || !agenKunci) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  const row = await verifyAgentKey(serverId, agenKunci);
  if (!row) {
    res.status(401).json({ ok: false, kode: "kunci_tidak_sah" });
    return;
  }

  try {
    const db = getDb();

    // Phase 9: the network rate (in + out) gets a series like CPU and memory.
    const net = bacaKondisi(body.kondisi)?.jaringan;
    const [beat] = await db
      .insert(denyut)
      .values({
        serverId,
        jaringan: net ? Math.round(net.masuk + net.keluar) : null,
        cpu: numOrNull(body.cpu),
        memori: numOrNull(body.memori),
        disk: numOrNull(body.disk),
        suhu: numOrNull(body.suhu),
        uptimeSec: numOrNull(body.uptimeSec),
        jamSelaras: body.jamSelaras === true,
        modeJaringan: typeof body.modeJaringan === "string" ? body.modeJaringan : null,
        layanan: isPlainObject(body.layanan) ? body.layanan : null,
      })
      .returning();

    // What this beat changed that a page shows, broadcast once it is
    // answered (2026-10-07). A beat that changes nothing sends nothing.
    const berubah = new Set<Topik>();

    // The Pi's clock against the site's, measured here on every beat.
    const jamPi = typeof body.jamPi === "number" && Number.isFinite(body.jamPi) ? body.jamPi : null;
    const kondisi = saringKondisi({
      ...(isPlainObject(body.kondisi) ? body.kondisi : {}),
      selisihDetik: jamPi === null ? null : Math.round(jamPi - Date.now() / 1000),
    });

    // Phase 12: the readings first, then the beat and the readings go to the
    // Server pages and the session's Live rooms at once, in one request,
    // before the rest of the beat's work (commands, sweeps, state).
    const sesiAktif = await currentSesi();
    const bacaan = await rekamTelemetri(serverId, sesiAktif?.id ?? null, body.telemetri);
    const perGrup = new Map<number, typeof bacaan>();
    for (const r of bacaan)
      perGrup.set(r.kelompokNomor, [...(perGrup.get(r.kelompokNomor) ?? []), r]);
    const kamar: Record<string, PesanAliran[]> = {
      pi: [
        {
          j: "denyut",
          g: null,
          d: { serverId, denyut: beat, ...(kondisi ? { kondisi, kondisiPada: new Date() } : {}) },
        },
      ],
    };
    if (sesiAktif && perGrup.size)
      kamar[ruangSesi(sesiAktif.id)] = [...perGrup].map(([g, rows]) => ({ j: "tel", g, d: rows }));
    const terbitAwal = kirimRelay([], kamar);
    // Silent past the idle cadence's grace: the Pi was offline until now.
    const terakhir = row.kondisiPada?.getTime() ?? 0;
    if (Date.now() - terakhir > batasLuringDetik(null, null) * 1000) berubah.add("server");

    const hasilMasuk = Array.isArray(body.hasilPerintah) ? (body.hasilPerintah as unknown[]) : [];
    for (const item of hasilMasuk) {
      if (!isHasilPerintahMasuk(item)) continue;
      // A command finished: the Ready check, a restart, a Konsol step.
      berubah.add("server");
      await db
        .update(perintah)
        .set({
          status: item.status,
          selesaiPada: new Date(),
          keluaran: item.keluaran ?? null,
        })
        .where(and(eq(perintah.id, item.id), eq(perintah.serverId, serverId)));
    }

    // Phase 9 Stage 9: the Pi bridge's Konsol reports (joined, ended).
    await terimaLaporanKonsol(serverId, body.konsol);
    if (Array.isArray(body.konsol) && body.konsol.length) berubah.add("server");

    // The TP mirror's report, and whether a TP file changed since its stamp.
    const cermin = saringCermin(body.tpCermin);
    let cerminSegarkan = false;
    if (cermin) {
      if (await simpanStatusCermin(db, serverId, cermin)) berubah.add("tp");
      const stempelPc = (body.tpCermin as { stempel?: unknown }).stempel;
      cerminSegarkan =
        (await stempelCermin(db)) !== (typeof stempelPc === "string" ? stempelPc : null);
    }

    // Phase 14: the SeeLabs robot's results, then its next jobs (only for
    // the approved robot Pi; every other server gets none).
    await terimaHasil(db, serverId, body.hasilSeelabs);

    // A single atomic claim (P6.2/B7) -- see claimPerintahMenunggu's own
    // comment for the race this replaces.
    const pending = await claimPerintahMenunggu(serverId);
    const tugasSeelabs = await ambilTugas(db, serverId);

    await sweepPerintahKedaluwarsa();

    // Phase 9: the agent's own LAN address wins over a hand-typed one; it
    // is the address the Pi actually has right now.
    const alamatLan =
      typeof body.alamatLan === "string" && ALAMAT_LAN_RE.test(body.alamatLan)
        ? body.alamatLan
        : null;
    // Phase 9: the Module 4 hunt's summary and the Pi's hotspot, for the
    // Praktikan's Perburuan step. Only the newest of each is kept.
    const perburuanMasuk = saringPerburuan(body.perburuan);
    const hotspot = saringHotspot(body.hotspot);
    const serverSet = {
      ...(typeof body.agenVersi === "string" ? { agenVersi: body.agenVersi } : {}),
      ...(isPlainObject(body.infoSistem)
        ? { infoSistem: body.infoSistem, infoSistemPada: new Date() }
        : {}),
      ...(alamatLan && alamatLan !== row.alamatLan ? { alamatLan } : {}),
      // Stage 5: the newest "Pi right now" numbers; only the known keys.
      ...(kondisi ? { kondisi, kondisiPada: new Date() } : {}),
      ...(perburuanMasuk
        ? {
            perburuan: perburuanMasuk as unknown as Record<string, unknown>,
            perburuanPada: new Date(),
          }
        : {}),
      ...(hotspot ? { hotspot } : {}),
    };
    if (Object.keys(serverSet).length) {
      await db.update(server).set(serverSet).where(eq(server.id, serverId));
    }
    if ("alamatLan" in serverSet || (serverSet.agenVersi && serverSet.agenVersi !== row.agenVersi))
      berubah.add("server");
    // The hunt's scoreboard and hotspot, for the Perburuan step: only when
    // they differ from what was kept, so at most one per beat.
    // (The stored copies go through the same filter, so key order matches.)
    if (
      (perburuanMasuk &&
        JSON.stringify(perburuanMasuk) !== JSON.stringify(saringPerburuan(row.perburuan))) ||
      (hotspot && JSON.stringify(hotspot) !== JSON.stringify(saringHotspot(row.hotspot)))
    )
      berubah.add("buru");

    await pruneOldHeartbeatsOccasionally();

    // Fastest applicable pace wins: a command in flight beats the session/idle
    // cadence, so the result comes back (and the next press is claimed) fast.
    const siaga =
      pending.length > 0 ||
      tugasSeelabs.length > 0 ||
      (await adaPerintahBaru(serverId)) ||
      (await konsolSiaga(serverId)) ||
      (await adaTugasRobot(db, serverId));
    const intervalDetik = siaga
      ? INTERVAL_SIAGA_SEC
      : sesiAktif && MODUL_TELEMETRI_PI.has(sesiAktif.modul)
        ? INTERVAL_TELEMETRI_SEC
        : sesiAktif
          ? INTERVAL_AKTIF_SEC
          : INTERVAL_IDLE_SEC;

    await pruneOldTelemetryOccasionally();

    // Only computed when today actually has a Module 4 slot (jadwalModul4Hari
    // returns null otherwise) -- an idle day never pays for this extra query,
    // and the field is simply omitted rather than sent as an empty schedule.
    const jadwal = await jadwalModul4Hari(hariIniWib());

    // A command handed out now changes its status on the Server pages too.
    if (pending.length) berubah.add("server");

    res.status(200).json({
      ok: true,
      perintah: pending,
      intervalDetik,
      waktu: Date.now() / 1000,
      ...(jadwal ? { jadwal } : {}),
      ...(tugasSeelabs.length ? { seelabs: tugasSeelabs } : {}),
      ...(cermin ? { tpCermin: { segarkan: cerminSegarkan } } : {}),
    });
    // After the answer, kept alive with waitUntil: awaited after the response
    // alone, the instance froze and the TP sync's LMS calls only timed out at
    // the next beat (2026-10-13: every Pi sync from 19:27 "failed" after 60 s).
    waitUntil(
      (async () => {
        // The topics this beat changed, as before (most beats change none).
        await Promise.all([siarkan([...berubah]), terbitAwal]);
        // Phase 18: the lab clock's backup when the relay's minute is
        // late; once a minute at most across both (never throws).
        await jamLabBilaPerlu(db);
        // Phase 13: the server's beat is one of the TP sync's clocks while a
        // window is open (every minute at most, with the relay's timer) and
        // once after it closes. The server never sees the LMS token; this
        // runs here, after the beat is answered.
        await sinkronBilaPerlu(db, "pi", 60_000);
        // TP uploaded in IRIS whose copy to the LMS failed: tried again.
        await kirimTertunda(db);
        // Phase 14: the robot's daily KLP pull and Input Jaga check.
        await harianBilaPerlu(db);
        // Phase 15: scheduled announcements and the LMS automations that
        // are switched on (LMS › Ringkasan), every 5 minutes at most.
        await otomatisLmsBilaPerlu(db);
      })().catch((err) => console.error("[api/agent denyut] after the beat:", err)),
    );
  } catch (err) {
    console.error("[api/agent denyut] unexpected error:", err);
    res.status(200).json({ ok: false, kode: "galat_server" });
  }
}

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!requireMethod(req, res, "POST")) return;

  const body = jsonBody(req);
  if (body.tipe === "bundel_terbit") return handleTerbit(req, res, body);
  // A fresh Pi's one-line install (public/pasang-pi.sh) fetches the bundle
  // with its enrol token before it has an agent key.
  if (body.tipe === "bundel_pasang") {
    const r = await bundelUntukPasang(body.kode, body.token, body.ringkas === true);
    res.status(200).json(r);
    return;
  }
  if (body.tipe === "pasang_kabar") {
    const r = await catatKabar(body);
    res.status(200).json(r.ok ? { ok: true } : r);
    if (r.ok) await siarkan(["server"]);
    return;
  }
  if (typeof body.token === "string") return handleDaftar(req, res);
  if (typeof body.bundel === "string") return handleUnduh(res, body);
  if (body.tpDaftar === true) return handleCerminDaftar(res, body);
  if (isPlainObject(body.tpUnduh)) return handleCerminUnduh(res, body);
  return handleDenyut(req, res);
}

/** CI publishes a signed bundle (2026-10-07). */
async function handleTerbit(req: ApiRequest, res: ApiResponse, body: Record<string, unknown>) {
  const auth = req.headers.authorization;
  const rahasia = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const r = await terbitkan(body, rahasia, process.env.BUNDEL_TERBIT);
  res.status(r.ok ? 200 : r.kode === "rahasia_salah" ? 401 : 400).json(r);
  if (r.ok && r.kode === "baru") await siarkan(["server"]);
}

/** The agent fetches the bundle its `pembaruan.bundel` names. */
async function handleUnduh(res: ApiResponse, body: Record<string, unknown>) {
  const serverId = Number(body.serverId);
  const agenKunci = typeof body.agenKunci === "string" ? body.agenKunci : "";
  if (!Number.isInteger(serverId) || serverId <= 0 || !agenKunci) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!(await verifyAgentKey(serverId, agenKunci))) {
    res.status(401).json({ ok: false, kode: "kunci_tidak_sah" });
    return;
  }
  const r = await ambilBundel(String(body.bundel));
  if (typeof r === "string") res.status(200).json({ ok: false, kode: r });
  else res.status(200).json({ ok: true, ...r });
}

/** An agent's own key, or the refusal already sent. */
async function agenSah(res: ApiResponse, body: Record<string, unknown>): Promise<boolean> {
  const serverId = Number(body.serverId);
  const agenKunci = typeof body.agenKunci === "string" ? body.agenKunci : "";
  if (!Number.isInteger(serverId) || serverId <= 0 || !agenKunci) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return false;
  }
  if (!(await verifyAgentKey(serverId, agenKunci))) {
    res.status(401).json({ ok: false, kode: "kunci_tidak_sah" });
    return false;
  }
  return true;
}

/** The TP mirror's list (2026-10-14). */
async function handleCerminDaftar(res: ApiResponse, body: Record<string, unknown>) {
  if (!(await agenSah(res, body))) return;
  res.status(200).json({ ok: true, ...(await daftarCermin(getDb())) });
}

/** One TP file's bytes for the mirror: JSON only when it can't be had. */
async function handleCerminUnduh(res: ApiResponse, body: Record<string, unknown>) {
  if (!(await agenSah(res, body))) return;
  const q = body.tpUnduh as Record<string, unknown>;
  const id = Number(q.id);
  const i = Number(q.i ?? 0);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(i) || i < 0) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [k] = await db.select().from(tpKiriman).where(eq(tpKiriman.id, id)).limit(1);
  const b = k?.berkas[i];
  if (!b) {
    res.status(404).json({ ok: false, kode: "tidak_ada" });
    return;
  }
  const isi = await ambilIsiTp(db, await bacaSet(db), b);
  if (!isi.ok) {
    res.status(isi.status).json({ ok: false, kode: isi.kode });
    return;
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  if (isi.jenis === "iris") {
    res.setHeader("Content-Length", String(isi.isi.length));
    res.status(200).end(isi.isi);
    return;
  }
  const panjang = isi.res.headers.get("content-length");
  if (panjang) res.setHeader("Content-Length", panjang);
  res.statusCode = 200;
  await new Promise<void>((ok, gagal) => {
    const src = Readable.fromWeb(isi.res.body as import("node:stream/web").ReadableStream);
    src.on("error", gagal);
    res.on("close", () => ok());
    src.pipe(res);
  }).catch(() => res.destroy());
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHasilPerintahMasuk(value: unknown): value is HasilPerintahMasuk {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "number" && (v.status === "selesai" || v.status === "gagal");
}

// Errors it logs or throws are reported (_lib/galat.ts).
export default denganGalat("agent", handler);
