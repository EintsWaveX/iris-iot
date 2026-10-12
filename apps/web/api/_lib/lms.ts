/**
 * The Telkom University LMS (Moodle with the RemUI theme), Phase 13.
 *
 * IRIS reads it with a Moodle mobile app token: the same kind of token the
 * CeLOE phone app gets after an SSO sign in, scoped to the moodle_mobile_app
 * service and revocable from the LMS profile. A Pencipta or Admin pastes it
 * once (Penilaian › Sumber LMS); it is kept encrypted in `pengaturan`
 * (AES-256-GCM, key LMS_KUNCI from the Vercel env, else one derived from
 * SESSION_SECRET) and never sent back, only its last four characters.
 *
 * The calls IRIS makes (all read only):
 * - core_webservice_get_site_info       who the token belongs to
 * - core_enrol_get_users_courses        the account's courses
 * - mod_assign_get_assignments          the "TP Modul N" assignments
 * - mod_assign_get_submissions          who submitted what, and when
 * - core_enrol_get_enrolled_users       LMS user id to NIM (idnumber)
 * Files stream from webservice/pluginfile.php with the token; their bytes
 * are never stored.
 *
 * Cloudflare in front of the LMS turns away Vercel's datacenter addresses
 * (2026-10-13, the first Sambungkan answered lms_http) but lets a Worker
 * through, so in production every call goes via the Konsol relay's signed
 * /lms route. A test LMS (LMS_URL set) or LMS_LANGSUNG=1 is reached directly.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

export const LMS_URL = (process.env.LMS_URL || "https://lms.telkomuniversity.ac.id").replace(
  /\/+$/,
  "",
);

/** How long one LMS call may take. */
const BATAS_MS = 15_000;

/* ------------------------------------------------------------ the token */

function kunci(): Buffer {
  const k = process.env.LMS_KUNCI?.trim();
  if (k) {
    const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
    if (b.length === 32) return b;
  }
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("LMS_KUNCI or SESSION_SECRET must be set");
  return Buffer.from(hkdfSync("sha256", s, "iris-lms", "lms-token", 32));
}

export interface TokenTersimpan {
  enc: string;
  iv: string;
  tag: string;
  akhir: string;
  /** A short fingerprint, so a reconnect with the same token is spotted. */
  sidik: string;
}

export function sandikanToken(token: string): TokenTersimpan {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return {
    enc: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    akhir: token.slice(-4),
    sidik: createHash("sha256").update(token).digest("hex").slice(0, 12),
  };
}

export function bukaToken(t: TokenTersimpan): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", kunci(), Buffer.from(t.iv, "base64"));
    d.setAuthTag(Buffer.from(t.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(t.enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * What the person pasted: a bare token (32 hex), or the address the LMS
 * hands the app after sign in, moodlemobile://token=BASE64, whose payload
 * is "signature:::token[:::privatetoken]".
 */
export function bacaTempelan(teks: string): string | null {
  const s = teks.trim();
  if (/^[0-9a-f]{32}$/i.test(s)) return s.toLowerCase();
  const m = s.match(/token=([A-Za-z0-9+/=_-]+)/);
  if (!m) return null;
  try {
    const isi = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const tok = isi.split(":::")[1];
    return tok && /^[0-9a-f]{32}$/i.test(tok) ? tok.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The address that starts the LMS's own app sign in. With confirmed=1 the
 * LMS shows the moodlemobile:// link on a page instead of redirecting to
 * it, which a desktop browser cannot open and leaves on about:blank.
 */
export function alamatMasuk(): string {
  const passport = randomBytes(8).toString("hex");
  return `${LMS_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile&confirmed=1`;
}

/* ------------------------------------------------------------ the calls */

/** The relay's /lms address and the shared secret, or null to go direct. */
function relayLms(): { url: string; secret: string } | null {
  if (process.env.LMS_URL || process.env.LMS_LANGSUNG === "1") return null;
  const relay = process.env.KONSOL_RELAY_URL?.trim();
  const secret = process.env.KONSOL_RELAY_SECRET?.trim();
  if (!relay || !secret || secret.length < 32 || !/^wss?:\/\//.test(relay)) return null;
  return { url: `${relay.replace(/^ws/, "http").replace(/\/+$/, "")}/lms`, secret };
}

/** One request to the LMS: `jalan` is the path with its query. */
async function keLms(
  jalan: string,
  o: { metode: "GET" | "POST"; isi?: string; range?: string; batasMs: number },
): Promise<Response> {
  const signal = AbortSignal.timeout(o.batasMs);
  const relay = relayLms();
  if (!relay) {
    const headers: Record<string, string> = {};
    if (o.metode === "POST") headers["content-type"] = "application/x-www-form-urlencoded";
    if (o.range) headers.range = o.range;
    return fetch(`${LMS_URL}${jalan}`, { method: o.metode, headers, body: o.isi, signal });
  }
  const ts = String(Math.floor(Date.now() / 1000));
  const isi = o.isi ?? "";
  const tanda = createHmac("sha256", relay.secret)
    .update(`lms|${ts}|${o.metode}|${jalan}|${isi}`)
    .digest("hex");
  const headers: Record<string, string> = {
    "x-lms-ts": ts,
    "x-lms-tanda": tanda,
    "x-lms-metode": o.metode,
    "x-lms-tujuan": jalan,
  };
  if (o.range) headers["x-lms-range"] = o.range;
  return fetch(relay.url, { method: "POST", headers, body: isi, signal });
}

export class LmsGalat extends Error {
  constructor(
    public kode: string,
    pesan: string,
  ) {
    super(pesan);
  }
}

/** Moodle's form encoding: arrays and objects as name[0][key]=value. */
function ratakan(prefix: string, v: unknown, out: URLSearchParams) {
  if (Array.isArray(v)) v.forEach((x, i) => ratakan(`${prefix}[${i}]`, x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) ratakan(`${prefix}[${k}]`, x, out);
  else if (v !== undefined && v !== null) out.append(prefix, String(v));
}

export async function panggil<T>(
  token: string,
  fungsi: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const body = new URLSearchParams();
  body.set("wstoken", token);
  body.set("wsfunction", fungsi);
  body.set("moodlewsrestformat", "json");
  for (const [k, v] of Object.entries(params)) ratakan(k, v, body);
  let r: Response;
  try {
    r = await keLms("/webservice/rest/server.php", {
      metode: "POST",
      isi: body.toString(),
      batasMs: BATAS_MS,
    });
  } catch (e) {
    throw new LmsGalat("lms_tak_terjangkau", e instanceof Error ? e.message : String(e));
  }
  if (!r.ok) throw new LmsGalat("lms_http", `HTTP ${r.status}`);
  const d = (await r.json().catch(() => null)) as
    (T & { exception?: string; errorcode?: string; message?: string }) | null;
  if (d === null) throw new LmsGalat("lms_bukan_json", "the LMS answered without JSON");
  if (d && typeof d === "object" && "exception" in d && d.exception) {
    const kode =
      d.errorcode === "invalidtoken" || d.errorcode === "accessexception"
        ? "token_ditolak"
        : `lms_${d.errorcode ?? "galat"}`;
    throw new LmsGalat(kode, d.message ?? d.errorcode ?? "LMS error");
  }
  return d as T;
}

export interface InfoSitus {
  userid: number;
  fullname: string;
  username: string;
  sitename: string;
}

export function infoSitus(token: string) {
  return panggil<InfoSitus>(token, "core_webservice_get_site_info");
}

export interface KursusLms {
  id: number;
  shortname: string;
  fullname: string;
}

/** The account's practicum courses (Praktikum Sinyal Diskret, Otomatisasi, & IoT). */
export async function kursusPraktikum(token: string, userid: number): Promise<KursusLms[]> {
  const all = await panggil<KursusLms[]>(token, "core_enrol_get_users_courses", { userid });
  const pola = process.env.LMS_POLA_KURSUS
    ? new RegExp(process.env.LMS_POLA_KURSUS, "i")
    : /SINYAL\s+DISKRET/i;
  return all
    .filter((c) => pola.test(c.fullname) || pola.test(c.shortname))
    .map((c) => ({ id: c.id, shortname: c.shortname, fullname: c.fullname }));
}

export interface TugasLms {
  id: number;
  cmid: number;
  course: number;
  name: string;
  allowsubmissionsfromdate: number;
  duedate: number;
  /** The files attached to the assignment's description (the TP's PDF). */
  lampiran: { nama: string; ukuran: number; waktu: string | null }[];
}

interface LampiranLms {
  filename: string;
  filesize?: number;
  timemodified?: number;
}

export async function tugasKursus(token: string, kursus: number[]): Promise<TugasLms[]> {
  if (!kursus.length) return [];
  const d = await panggil<{
    courses: {
      id: number;
      assignments: (Omit<TugasLms, "lampiran"> & { introattachments?: LampiranLms[] })[];
    }[];
  }>(token, "mod_assign_get_assignments", { courseids: kursus });
  return (d.courses ?? []).flatMap((c) =>
    (c.assignments ?? []).map((a) => ({
      id: a.id,
      cmid: a.cmid,
      course: c.id,
      name: a.name,
      allowsubmissionsfromdate: a.allowsubmissionsfromdate ?? 0,
      duedate: a.duedate ?? 0,
      lampiran: (a.introattachments ?? []).map((f) => ({
        nama: f.filename,
        ukuran: f.filesize ?? 0,
        waktu: f.timemodified ? new Date(f.timemodified * 1000).toISOString() : null,
      })),
    })),
  );
}

export interface BerkasLms {
  filename: string;
  filesize: number;
  fileurl: string;
  mimetype?: string;
  timemodified?: number;
}

export interface KirimanLms {
  id: number;
  userid: number;
  status: string;
  timemodified: number;
  plugins?: {
    type: string;
    fileareas?: { area: string; files?: BerkasLms[] }[];
  }[];
}

export async function kirimanTugas(
  token: string,
  tugas: number[],
): Promise<{ assignmentid: number; submissions: KirimanLms[] }[]> {
  if (!tugas.length) return [];
  const d = await panggil<{
    assignments: { assignmentid: number; submissions: KirimanLms[] }[];
  }>(token, "mod_assign_get_submissions", { assignmentids: tugas });
  return d.assignments ?? [];
}

export function berkasDari(k: KirimanLms): BerkasLms[] {
  return (k.plugins ?? [])
    .filter((p) => p.type === "file")
    .flatMap((p) => p.fileareas ?? [])
    .flatMap((a) => a.files ?? []);
}

export interface PesertaLms {
  id: number;
  fullname: string;
  idnumber?: string;
  username?: string;
  email?: string;
}

export function pesertaKursus(token: string, kursus: number) {
  return panggil<PesertaLms[]>(token, "core_enrol_get_enrolled_users", {
    courseid: kursus,
    options: [
      { name: "onlyactive", value: 1 },
      { name: "userfields", value: "id,fullname,idnumber,username,email" },
    ],
  });
}

/** A NIM from an LMS user: idnumber first, then a long digit run in the
 *  username or the email. */
export function nimDari(u: PesertaLms): string | null {
  for (const v of [u.idnumber, u.username, u.email?.split("@")[0]]) {
    const m = (v ?? "").match(/\d{10,13}/);
    if (m) return m[0];
  }
  return null;
}

/** Streams one submitted file from the LMS. */
export async function ambilBerkas(token: string, url: string, range?: string): Promise<Response> {
  const u = new URL(url);
  // Only the LMS itself, never another host a stored row might name.
  if (u.origin !== new URL(LMS_URL).origin) throw new LmsGalat("berkas_asing", u.origin);
  u.pathname = u.pathname.replace(/^\/pluginfile\.php/, "/webservice/pluginfile.php");
  u.searchParams.set("token", token);
  return keLms(u.pathname + u.search, { metode: "GET", range, batasMs: 60_000 });
}
