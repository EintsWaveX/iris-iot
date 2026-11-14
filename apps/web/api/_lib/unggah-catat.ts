/**
 * What happened when a board was flashed from the browser (2026-11-14). After the TOT session most
 * laptops uploaded from the web and some could not (the browser cannot toggle DTR and RTS together on
 * every USB stack, see kait-unduh.ts), and the site kept no record of either: nobody could say which
 * laptop failed, or why. Now the browser reports each upload's outcome and the site saves it as one
 * audit row, `unggah_catat`, so Reports › Audit shows the pattern.
 *
 * What is saved: who (the audit row's actor), the module and role, ok or failed, our failure code,
 * which way in worked (a normal reset, the download hook, ...), the board's USB ids, the browser and
 * system, and the last lines esptool printed. Never the Wi-Fi password or any value the person typed:
 * the browser sends none of them, and every field here is cut to a short fixed length anyway.
 */
import { getDb } from "../../src/lib/db.js";
import { audit } from "../../src/lib/schema.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";

export interface LaporanUnggah {
  modul: number;
  role: string;
  hasil: "ok" | "gagal";
  kode: string;
  /** How the board was brought into its download mode, e.g. "reset" or "kait" */
  via: string;
  /** The browser's user agent and the system it says it runs on */
  ua: string;
  sistem: string;
  /** The board's USB ids as 4 hex digits each, "" when the browser would not say */
  vid: string;
  pid: string;
  /** What esptool printed, last lines only */
  log: string;
  ms: number;
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const KODE_RE = /^[a-z_]{0,30}$/;
const HEX4 = /^[0-9a-f]{4}$/;

/** A report from the browser, made safe to save; null when it is not one */
export function bersihkanLaporan(body: Record<string, unknown>): LaporanUnggah | null {
  const modul = Number(body.modul);
  if (!Number.isInteger(modul) || modul < 1 || modul > 4) return null;
  if (body.hasil !== "ok" && body.hasil !== "gagal") return null;
  const kode = s(body.kode, 30);
  if (!KODE_RE.test(kode)) return null;
  const hex = (v: unknown) => (typeof v === "string" && HEX4.test(v) ? v : "");
  const ms = Number(body.ms);
  return {
    modul,
    role: s(body.role, 20).replace(/[^a-z0-9_]/gi, ""),
    hasil: body.hasil,
    kode,
    via: s(body.via, 30).replace(/[^a-z0-9_-]/gi, ""),
    ua: s(body.ua, 200),
    sistem: s(body.sistem, 40),
    vid: hex(body.vid),
    pid: hex(body.pid),
    log: s(body.log, 1000),
    ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 3_600_000) : 0,
  };
}

/** Per person, per function instance: enough for a lab's retries, too few to fill the audit log */
const MAKS = 30;
const JENDELA_MS = 10 * 60_000;
const hitungan = new Map<string, { n: number; sejak: number }>();

export function bolehLapor(nim: string, sekarang = Date.now()): boolean {
  const r = hitungan.get(nim);
  const baris = r && sekarang - r.sejak < JENDELA_MS ? r : { n: 0, sejak: sekarang };
  baris.n += 1;
  hitungan.set(nim, baris);
  if (hitungan.size > 500) hitungan.clear();
  return baris.n <= MAKS;
}

/** POST /api/session/unggah-catat */
export async function handleUnggahCatat(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const lap = bersihkanLaporan(jsonBody(req));
  if (!lap) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!bolehLapor(session.nim)) {
    res.status(200).json({ ok: true });
    return;
  }
  try {
    await getDb()
      .insert(audit)
      .values({ aktorNim: session.nim, aksi: "unggah_catat", detail: JSON.stringify(lap) });
  } catch (err) {
    console.error("[api/session/unggah-catat] could not save the report:", err);
  }
  res.status(200).json({ ok: true });
}
