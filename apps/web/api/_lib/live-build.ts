/**
 * Live Upload, the site's side (2026-11-13): /api/session/bangun (start),
 * /bangun-status and /bangun-berkas (the image).
 *
 * A signed in user asks for a module's board file with their own values (Wi-Fi
 * name and password, group, Module 4's board key). The module's COMPLETE sketch
 * is made here from the published code and the canonical answers (the Live room
 * assumes the blanks are right, and a browser never sees the answers or the
 * template: only the build's image leaves), the values go in through
 * literalC(), and the PC's build service (apps/../pc/agent/iris_build.py in the
 * IRIS ASO repo) makes the image. A MicroPython file (Module 3) needs no build:
 * its text comes straight back.
 *
 * The password is used for the build and never stored or logged here. The
 * build service keeps a finished image for 15 minutes, and so does the owner
 * map below, so the browser can fetch it again when a flash has to be retried.
 */
import { readFileSync } from "node:fs";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { parseBlanks } from "../../src/lib/blanks.js";
import { isiKunciPapan, personalize, personalizeJaringan } from "../../src/lib/group-identity.js";
import { bacaJaringanHunt } from "../../src/lib/jaringan-hunt.js";
import type { Jaringan } from "../../src/lib/jaringan.js";
import { statusRiwayat } from "../../src/lib/akses.js";
import {
  literalC,
  validateUploadValues,
  type UploadFile,
  type UploadValues,
} from "../../src/lib/live-build.js";
import { kanonik, kodeModul, type KodeAktif } from "./kode-aktif.js";
import { jawabanBenar } from "./jawaban-scope.js";

const FQBN = "esp32:esp32:esp32";
/** Build requests one person may make in the window below */
export const BANGUN_MAKS = 12;
export const BANGUN_JENDELA_MS = 10 * 60_000;
const SIMPAN_MS = 15 * 60_000;
const LOG_MAKS = 4000;

// ---------- The sketch ----------

/** The two lines each kind of file keeps its Wi-Fi in; the match count must be exactly one each. */
const BARIS_WIFI: Record<UploadFile["kind"], { ssid: RegExp; sandi: RegExp }> = {
  esp32: {
    ssid: /^([ \t]*const char\*[ \t]+WIFI_SSID[ \t]*=[ \t]*)"[^"\n]*"/m,
    sandi: /^([ \t]*const char\*[ \t]+WIFI_PASSWORD[ \t]*=[ \t]*)"[^"\n]*"/m,
  },
  pico: {
    ssid: /^([ \t]*wifi_ssid[ \t]*=[ \t]*)"[^"\n]*"/m,
    sandi: /^([ \t]*wifi_password[ \t]*=[ \t]*)"[^"\n]*"/m,
  },
};

function gantiSatu(text: string, pola: RegExp, nilai: string, nama: string): string {
  const n = (text.match(new RegExp(pola.source, "gm")) ?? []).length;
  if (n !== 1)
    throw new Error(`live-build: the ${nama} line matched ${n} times, expected exactly 1`);
  return text.replace(pola, (_m, awal: string) => awal + nilai);
}

/** Puts the Wi-Fi name and password into the file's two lines, as octal-escaped literals */
export function isiWifi(
  file: UploadFile,
  text: string,
  v: { ssid: string; password: string },
): string {
  if (!file.wifi) return text;
  const baris = BARIS_WIFI[file.kind];
  return gantiSatu(
    gantiSatu(text, baris.ssid, literalC(v.ssid), "Wi-Fi name"),
    baris.sandi,
    literalC(v.password),
    "Wi-Fi password",
  );
}

/** The complete file for one board with the person's values in it. Throws when a line it must change is missing. */
export function rakitSketch(
  kode: KodeAktif,
  file: UploadFile,
  bahasa: "id" | "en",
  v: Required<UploadValues>,
  jaringan: Jaringan,
): string {
  const aktif = kode.berkas.get(file.slug);
  if (!aktif) throw new Error(`live-build: no file ${file.slug} in module ${file.modul}`);
  const umum = parseBlanks(aktif.templat[bahasa])
    .map((s) => (s.kind === "text" ? s.text : (kanonik(kode, file.slug, s.nomor, v.group) ?? "")))
    .join("");
  let text = personalize(file.slug, umum, v.group);
  if (file.modul === 4) text = personalizeJaringan(file.slug, text, jaringan);
  text = isiKunciPapan(file.slug, text, v.key || null);
  return isiWifi(file, text, v);
}

// ---------- The build service ----------

export interface Tampilan {
  state: "queued" | "running" | "done" | "failed";
  pos: number;
  size: number;
  kode: string | null;
  log: string;
}

export class LayananBangun {
  private token: { nilai: string; pada: number } | null = null;

  constructor(
    private fetcher: typeof fetch = fetch,
    private alamat = process.env.IRIS_BUILD_URL || "http://127.0.0.1:8791",
    private bacaToken: () => string = () => {
      if (process.env.IRIS_BUILD_TOKEN) return process.env.IRIS_BUILD_TOKEN;
      return readFileSync(
        process.env.IRIS_BUILD_TOKEN_FILE || "/etc/iris-build/token",
        "utf8",
      ).trim();
    },
    private sekarang: () => number = Date.now,
  ) {}

  private kunci(): string {
    if (this.token && this.sekarang() - this.token.pada < 60_000) return this.token.nilai;
    const nilai = this.bacaToken();
    this.token = { nilai, pada: this.sekarang() };
    return nilai;
  }

  private async minta(method: string, path: string, body?: unknown) {
    const r = await this.fetcher(this.alamat + path, {
      method,
      headers: {
        "X-Build-Token": this.kunci(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    return r;
  }

  /** Starts (or joins) a build. Returns the build's id and view, or the refusal's code. */
  async mulai(
    sketch: string,
  ): Promise<{ ok: true; id: string; tampil: Tampilan } | { ok: false; kode: string }> {
    let r: Response;
    try {
      r = await this.minta("POST", "/build", { fqbn: FQBN, files: { "s.ino": sketch } });
    } catch {
      return { ok: false, kode: "layanan_mati" };
    }
    if (r.status === 503) return { ok: false, kode: "sibuk" };
    if (r.status !== 202) return { ok: false, kode: "layanan_galat" };
    const j = (await r.json()) as { id: string } & Tampilan;
    return { ok: true, id: j.id, tampil: tampilan(j) };
  }

  async status(id: string): Promise<Tampilan | null> {
    try {
      const r = await this.minta("GET", `/build/${encodeURIComponent(id)}`);
      return r.status === 200 ? tampilan((await r.json()) as Tampilan) : null;
    } catch {
      return null;
    }
  }

  async berkas(id: string): Promise<Buffer | null> {
    try {
      const r = await this.minta("GET", `/build/${encodeURIComponent(id)}/image`);
      return r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

function tampilan(j: Tampilan): Tampilan {
  return {
    state: j.state,
    pos: j.pos ?? 0,
    size: j.size ?? 0,
    kode: j.kode ?? null,
    log: j.state === "failed" ? String(j.log ?? "").slice(0, LOG_MAKS) : "",
  };
}

// ---------- Who may ask, and how often ----------

export class Pembatas {
  private catat = new Map<string, number[]>();

  constructor(
    private maks = BANGUN_MAKS,
    private jendela = BANGUN_JENDELA_MS,
    private sekarang: () => number = Date.now,
  ) {}

  /** True and counted while the person is under the limit */
  boleh(nim: string): boolean {
    const t = this.sekarang();
    const baru = (this.catat.get(nim) ?? []).filter((x) => t - x < this.jendela);
    if (baru.length >= this.maks) {
      this.catat.set(nim, baru);
      return false;
    }
    baru.push(t);
    this.catat.set(nim, baru);
    return true;
  }
}

const layanan = new LayananBangun();
const pembatas = new Pembatas();
/** build id -> who asked, so only they can read it back */
const pemilik = new Map<string, { nim: string; sampai: number }>();

function lupakanKadaluarsa() {
  const t = Date.now();
  for (const [id, p] of pemilik) if (p.sampai < t) pemilik.delete(id);
}

const ID_RE = /^[0-9a-f]{16}$/;

// ---------- The routes ----------

/** POST /api/session/bangun { modul, role, bahasa, ssid, password, group, key } */
export async function handleBangunPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const role = typeof body.role === "string" ? body.role : "";
  const cek = validateUploadValues(modul, role, {
    ssid: typeof body.ssid === "string" ? body.ssid : "",
    password: typeof body.password === "string" ? body.password : "",
    group: Number(body.group),
    key: typeof body.key === "string" ? body.key : "",
  });
  if (!cek.ok) {
    res.status(200).json({ ok: false, kode: cek.kode, field: cek.field });
    return;
  }

  // The journal gate: a Praktikan builds only for a module whose journal is open to them
  // (the running session's, or history once opened); an Asisten for any.
  if (session.role === "praktikan") {
    const st = await statusRiwayat(session);
    if (!st.jurnal.includes(modul)) {
      res.status(200).json({
        ok: false,
        kode: st.diikuti.includes(modul) ? "riwayat_belum_terbuka" : "belum_praktikum",
      });
      return;
    }
  }
  const kode = await kodeModul(modul);
  // The complete file (a MicroPython one goes back as text) is the answer key put together, so a
  // Praktikan gets it only once their group has every blank of that file right: the Live step
  // assumes so, and the download makes the same demand. An Asisten has the key anyway.
  if (session.role === "praktikan") {
    const g = await jawabanBenar(session, kode, modul, cek.file.slug);
    if (!g) {
      res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
      return;
    }
    if (g.benar < g.total) {
      res.status(200).json({ ok: false, kode: "belum_lengkap", benar: g.benar, total: g.total });
      return;
    }
  }
  if (!pembatas.boleh(session.nim)) {
    res.status(200).json({ ok: false, kode: "terlalu_sering" });
    return;
  }

  let sketch: string;
  try {
    sketch = rakitSketch(
      kode,
      cek.file,
      body.bahasa === "en" ? "en" : "id",
      cek.v,
      modul === 4 ? await bacaJaringanHunt() : "internet",
    );
  } catch (err) {
    console.error("[live-build] the template does not fit:", (err as Error).message);
    res.status(200).json({ ok: false, kode: "galat_templat" });
    return;
  }

  if (cek.file.kind === "pico") {
    res.status(200).json({ ok: true, kind: "pico", path: cek.file.path, teks: sketch });
    return;
  }
  const mulai = await layanan.mulai(sketch);
  if (!mulai.ok) {
    res.status(200).json({ ok: false, kode: mulai.kode });
    return;
  }
  lupakanKadaluarsa();
  pemilik.set(mulai.id, { nim: session.nim, sampai: Date.now() + SIMPAN_MS });
  res.status(200).json({ ok: true, kind: "esp32", id: mulai.id, ...mulai.tampil });
}

function milikku(req: ApiRequest, res: ApiResponse, session: SessionPayload): string | null {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const p = ID_RE.test(id) ? pemilik.get(id) : undefined;
  if (!p || p.nim !== session.nim || p.sampai < Date.now()) {
    res.status(200).json({ ok: false, kode: "tak_ada" });
    return null;
  }
  return id;
}

/** GET /api/session/bangun-status?id= */
export async function handleBangunStatus(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const id = milikku(req, res, session);
  if (!id) return;
  const t = await layanan.status(id);
  if (!t) {
    res.status(200).json({ ok: false, kode: "tak_ada" });
    return;
  }
  res.status(200).json({ ok: true, ...t });
}

/** GET /api/session/bangun-berkas?id= : the merged image, for the browser to flash */
export async function handleBangunBerkas(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const id = milikku(req, res, session);
  if (!id) return;
  const data = await layanan.berkas(id);
  if (!data) {
    res.status(200).json({ ok: false, kode: "belum_ada" });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(data.length));
  res.end(data);
}
