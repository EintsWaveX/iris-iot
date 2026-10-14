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
 * The app token can't make or change an activity. The LMS's own sign-in
 * link also carries the token's private key when it follows a fresh sign
 * in; with it IRIS asks for an autologin key (tool_mobile_get_autologin_key)
 * and opens a web session of its own, which fills the assignment form the
 * way a Teacher does (lms-web.ts).
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
 * is "signature:::token[:::privatetoken]". The private key comes only
 * right after a sign in; without it IRIS reads but can't make assignments.
 */
export function bacaTempelan(teks: string): { token: string; privat: string | null } | null {
  const s = teks.trim();
  if (/^[0-9a-f]{32}$/i.test(s)) return { token: s.toLowerCase(), privat: null };
  const m = s.match(/token=([A-Za-z0-9+/=_-]+)/);
  if (!m) return null;
  try {
    const isi = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const [, tok, privat] = isi.split(":::");
    if (!tok || !/^[0-9a-f]{32}$/i.test(tok)) return null;
    return {
      token: tok.toLowerCase(),
      privat: privat && /^[A-Za-z0-9]{32,128}$/.test(privat) ? privat : null,
    };
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

/** The LMS gives an autologin key only to its app; it checks the agent. */
const UA_APP = "Mozilla/5.0 (Linux; Android 14) MoodleMobile 4.5.0 (45001)";
const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) IRIS-Penilaian";

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
    if (o.isi?.includes("wsfunction=tool_mobile_get_autologin_key")) headers["user-agent"] = UA_APP;
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

/** What an LMS page answered: its status, redirect, new cookies and body. */
export interface JawabHalaman {
  status: number;
  lokasi: string | null;
  kueBaru: string[];
  teks: string;
}

/**
 * One LMS page in IRIS's web session (lms-web.ts): `kue` is the Cookie
 * header, "" before the first. Redirects are not followed, so the session
 * cookie the autologin sets is seen. Through the relay it is signed over
 * the cookie as well.
 */
export async function keHalaman(
  jalan: string,
  o: { metode: "GET" | "POST"; isi?: string; kue: string; batasMs?: number },
): Promise<JawabHalaman> {
  const signal = AbortSignal.timeout(o.batasMs ?? 30_000);
  const relay = relayLms();
  let r: Response;
  try {
    if (!relay) {
      const headers: Record<string, string> = { "user-agent": UA_WEB };
      if (o.metode === "POST") headers["content-type"] = "application/x-www-form-urlencoded";
      if (o.kue) headers.cookie = o.kue;
      r = await fetch(`${LMS_URL}${jalan}`, {
        method: o.metode,
        headers,
        body: o.isi,
        redirect: "manual",
        signal,
      });
      return {
        status: r.status,
        lokasi: r.headers.get("location"),
        kueBaru: r.headers.getSetCookie(),
        teks: await r.text(),
      };
    }
    const ts = String(Math.floor(Date.now() / 1000));
    const isi = o.isi ?? "";
    const kue = o.kue || "-";
    const tanda = createHmac("sha256", relay.secret)
      .update(`lmsweb|${ts}|${o.metode}|${jalan}|${kue}|${isi}`)
      .digest("hex");
    r = await fetch(relay.url, {
      method: "POST",
      headers: {
        "x-lms-ts": ts,
        "x-lms-tanda": tanda,
        "x-lms-metode": o.metode,
        "x-lms-tujuan": jalan,
        "x-lms-kue": kue,
      },
      body: isi,
      signal,
    });
  } catch (e) {
    throw new LmsGalat("lms_tak_terjangkau", e instanceof Error ? e.message : String(e));
  }
  const kueBaru = r.headers.get("x-lms-kue-baru");
  if (kueBaru === null) {
    // The relay refused it itself (plain text), before the LMS.
    const teks = (await r.text().catch(() => "")).slice(0, 120);
    throw new LmsGalat("lms_http", `HTTP ${r.status} relay: ${teks}`);
  }
  let baru: string[] = [];
  try {
    baru = JSON.parse(kueBaru) as string[];
  } catch {
    baru = [];
  }
  return {
    status: r.status,
    lokasi: r.headers.get("x-lms-lokasi"),
    kueBaru: baru,
    teks: await r.text(),
  };
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
  if (!r.ok) {
    // Where it failed, for Sumber LMS: the relay's own refusal is plain text,
    // the LMS's (or Cloudflare's) a page; neither carries the token.
    const teks = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    const jalur = relayLms() ? "relay" : "langsung";
    throw new LmsGalat("lms_http", `HTTP ${r.status} ${jalur}: ${teks}`);
  }
  // A save (mod_assign_save_grade, _grades) answers a bare JSON null.
  const teks = await r.text().catch(() => "");
  if (teks.trim() === "null") return null as T;
  type Jawab = T & { exception?: string; errorcode?: string; message?: string };
  let d: Jawab | null;
  try {
    d = JSON.parse(teks) as Jawab | null;
  } catch {
    d = null;
  }
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

/** Moodle sends names HTML-escaped ("Otomatisasi, &amp; IoT"). */
export function teksLms(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** The account's practicum courses (Praktikum Sinyal Diskret, Otomatisasi, & IoT). */
export async function kursusPraktikum(token: string, userid: number): Promise<KursusLms[]> {
  const all = await panggil<KursusLms[]>(token, "core_enrol_get_users_courses", { userid });
  const pola = process.env.LMS_POLA_KURSUS
    ? new RegExp(process.env.LMS_POLA_KURSUS, "i")
    : /SINYAL\s+DISKRET/i;
  return all
    .filter((c) => pola.test(c.fullname) || pola.test(c.shortname))
    .map((c) => ({ id: c.id, shortname: teksLms(c.shortname), fullname: teksLms(c.fullname) }));
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
      name: teksLms(a.name),
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
  roles?: { shortname: string }[];
}

export function pesertaKursus(token: string, kursus: number) {
  return panggil<PesertaLms[]>(token, "core_enrol_get_enrolled_users", {
    courseid: kursus,
    options: [
      { name: "onlyactive", value: 1 },
      { name: "userfields", value: "id,fullname,idnumber,username,email,roles" },
    ],
  });
}

/**
 * Enrolled as a student. The Asisten are Teachers in every class course,
 * and five of them are registered Praktikan too (2026-10-13): counted by
 * NIM alone they showed up in all eleven classes.
 */
export function pelajar(u: PesertaLms): boolean {
  return !u.roles || u.roles.some((r) => r.shortname === "student");
}

/**
 * A member of a class as IRIS counts them (2026-10-14): enrolled as a
 * student, and not an Asisten unless that Asisten is also a registered
 * Praktikan (from SeeLabs). An Asisten enrolled as a student in some
 * class is otherwise not that class's Praktikan.
 */
export function anggotaKelas(
  u: PesertaLms,
  asisten: { has(nim: string): boolean },
  praktikan: { has(nim: string): boolean },
): boolean {
  if (!pelajar(u)) return false;
  const nim = nimDari(u);
  return !nim || !asisten.has(nim) || praktikan.has(nim);
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

/**
 * Puts one file in the token owner's draft area, as the app does before it
 * submits; its draft item id, which a form then names (lms-web.ts). Through
 * the relay the file travels base64 in a form body and the relay sends it
 * on as the multipart upload the LMS takes.
 */
export async function unggahDraf(token: string, nama: string, berkas: Uint8Array): Promise<number> {
  const jalan = "/webservice/upload.php";
  let r: Response;
  try {
    if (!relayLms()) {
      const f = new FormData();
      f.set("token", token);
      f.set("filearea", "draft");
      f.set("itemid", "0");
      f.set("filepath", "/");
      f.set(
        "file_1",
        new Blob([berkas as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
        nama,
      );
      r = await fetch(`${LMS_URL}${jalan}`, {
        method: "POST",
        body: f,
        signal: AbortSignal.timeout(60_000),
      });
    } else {
      const isi = new URLSearchParams({
        token,
        filearea: "draft",
        itemid: "0",
        filepath: "/",
        nama,
        berkas: Buffer.from(berkas).toString("base64"),
      });
      r = await keLms(jalan, { metode: "POST", isi: isi.toString(), batasMs: 60_000 });
    }
  } catch (e) {
    throw new LmsGalat("lms_tak_terjangkau", e instanceof Error ? e.message : String(e));
  }
  const teks = await r.text().catch(() => "");
  if (!r.ok) throw new LmsGalat("lms_unggah_gagal", `HTTP ${r.status} ${teks.slice(0, 120)}`);
  let d: unknown;
  try {
    d = JSON.parse(teks);
  } catch {
    throw new LmsGalat("lms_unggah_gagal", teks.replace(/\s+/g, " ").slice(0, 120));
  }
  const satu = Array.isArray(d) ? (d[0] as { itemid?: number } | undefined) : undefined;
  if (!satu || !Number.isInteger(satu.itemid)) {
    const g = d as { error?: string; errorcode?: string };
    throw new LmsGalat(
      g?.errorcode === "invalidtoken" ? "token_ditolak" : "lms_unggah_gagal",
      g?.error ?? g?.errorcode ?? "no draft item id",
    );
  }
  return satu.itemid!;
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

/* ------------------------------------------- TP uploaded in IRIS (2026-10-14) */

/** Whether an assignment takes feedback files (assignfeedback_file). */
export async function umpanBerkasNyala(
  token: string,
  kursus: number,
  tugas: number,
): Promise<boolean> {
  const d = await panggil<{
    courses: {
      assignments: {
        id: number;
        configs?: { plugin: string; subtype: string; name: string; value: string }[];
      }[];
    }[];
  }>(token, "mod_assign_get_assignments", { courseids: [kursus] });
  const a = (d.courses ?? []).flatMap((c) => c.assignments ?? []).find((x) => x.id === tugas);
  return !!a?.configs?.some(
    (c) =>
      c.plugin === "file" &&
      c.subtype === "assignfeedback" &&
      c.name === "enabled" &&
      c.value === "1",
  );
}

/** One student's grade in an assignment, -1 when there is none. */
export async function nilaiSatu(token: string, tugas: number, userid: number): Promise<number> {
  const d = await panggil<{
    assignments?: { assignmentid: number; grades?: { userid: number; grade: string }[] }[];
  }>(token, "mod_assign_get_grades", { assignmentids: [tugas] });
  const g = d.assignments
    ?.find((a) => a.assignmentid === tugas)
    ?.grades?.find((x) => x.userid === userid);
  const v = Number(g?.grade);
  return Number.isFinite(v) && v >= 0 ? v : -1;
}

/**
 * Puts the draft area's files as a student's feedback files. A Teacher may
 * not edit another student's submission on Telkom's LMS (no role holds
 * mod/assign:editothersubmission, checked 2026-10-14), so an IRIS upload
 * lives here. save_grade always writes the grade too: the current one goes
 * back unchanged (-1: none).
 */
export async function simpanUmpanBerkas(
  token: string,
  tugas: number,
  userid: number,
  draf: number,
  nilai: number,
): Promise<void> {
  await panggil<null>(token, "mod_assign_save_grade", {
    assignmentid: tugas,
    userid,
    grade: nilai,
    attemptnumber: -1,
    addattempt: 0,
    workflowstate: "",
    applytoall: 0,
    plugindata: { files_filemanager: draf },
  });
}

/** The student's feedback files as the LMS lists them now. */
export async function umpanBerkas(
  token: string,
  tugas: number,
  userid: number,
): Promise<BerkasLms[]> {
  const d = await panggil<{
    feedback?: {
      plugins?: { type: string; fileareas?: { area: string; files?: BerkasLms[] }[] }[];
    };
  }>(token, "mod_assign_get_submission_status", { assignid: tugas, userid });
  return (d.feedback?.plugins ?? [])
    .filter((p) => p.type === "file")
    .flatMap((p) => p.fileareas ?? [])
    .flatMap((a) => a.files ?? []);
}
