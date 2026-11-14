/**
 * Live Upload, the browser's side of one upload (2026-11-13), with everything
 * that touches the network or the USB port passed in, so the order of the
 * steps and every way out of them can be tested without a board.
 *
 *   ESP32 (Modules 1, 2, 4): ask the site to build, wait in the queue, download
 *   the image, flash it, reset the board.
 *   Pico W (Module 3): the site sends the file's text; write it as main.py.
 *
 * The port is taken BEFORE the build starts, inside the click that started the
 * upload (the browser lets a port chooser open only from a click, and a build
 * can take a minute), and handed back to the caller when this ends so Hubungkan
 * can open it again.
 */
import type { UploadValues } from "./live-build";

export type UploadStage = "idle" | "building" | "downloading" | "flashing" | "done" | "error";

export interface UploadProgress {
  stage: UploadStage;
  /** Place in the build queue (1 = next), while building */
  pos?: number;
  /** 0 to 100, while writing */
  percent?: number;
  /** Flashing an ESP32 first erases the whole chip, then writes */
  phase?: "erase" | "write";
  /** What went wrong, when stage is "error" */
  kode?: string;
  /** The compiler's own words, for a failed build */
  log?: string;
}

export type StartReply =
  | { ok: true; kind: "esp32"; id: string; state: BuildState; pos: number }
  | { ok: true; kind: "pico"; path: string; teks: string }
  | { ok: false; kode: string; field?: string };

export type BuildState = "queued" | "running" | "done" | "failed";

export interface StatusReply {
  ok: boolean;
  state?: BuildState;
  pos?: number;
  kode?: string | null;
  log?: string;
}

export interface UploadApi {
  start(body: {
    modul: number;
    role: string;
    bahasa: "id" | "en";
    ssid: string;
    password: string;
    group: number;
    key: string;
  }): Promise<StartReply>;
  status(id: string): Promise<StatusReply>;
  image(id: string): Promise<Uint8Array | null>;
}

export interface UploadDeps<Port> {
  api: UploadApi;
  /** Flash a merged image at address 0 and reset the board. Throws an Error whose message is a code.
   *  Returns which way in worked (see flashEsp32), for the upload report. */
  flashEsp32(
    port: Port,
    image: Uint8Array,
    onPercent: (n: number) => void,
    onPhase: (p: "erase" | "write") => void,
  ): Promise<string | void>;
  /** Write the text as main.py on a Pico W and restart it. */
  writeMain(port: Port, text: string, onPercent: (n: number) => void): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface UploadInput<Port> {
  modul: number;
  role: string;
  bahasa: "id" | "en";
  values: UploadValues;
  port: Port;
}

export type UploadResult = { ok: true; via: string } | { ok: false; kode: string; log?: string };

/** How often the queue is asked, and how long the whole wait may last */
export const POLL_MS = 1500;
export const POLL_MAX_MS = 6 * 60_000;

export async function runUpload<Port>(
  deps: UploadDeps<Port>,
  input: UploadInput<Port>,
  report: (p: UploadProgress) => void,
  signal: AbortSignal,
): Promise<UploadResult> {
  const fail = (kode: string, log?: string): UploadResult => {
    report({ stage: "error", kode, ...(log ? { log } : {}) });
    return { ok: false, kode, ...(log ? { log } : {}) };
  };
  const cancelled = () => signal.aborted;

  report({ stage: "building" });
  let start: StartReply;
  try {
    start = await deps.api.start({
      modul: input.modul,
      role: input.role,
      bahasa: input.bahasa,
      ssid: input.values.ssid,
      password: input.values.password,
      group: input.values.group,
      key: input.values.key ?? "",
    });
  } catch {
    return fail("tidak_terhubung");
  }
  if (!start.ok) return fail(start.kode);
  if (cancelled()) return fail("dibatalkan");

  // A MicroPython file: no build, the text is the file.
  if (start.kind === "pico") {
    report({ stage: "flashing", percent: 0 });
    try {
      await deps.writeMain(input.port, start.teks, (n) =>
        report({ stage: "flashing", percent: n }),
      );
    } catch (err) {
      return fail(codeOf(err, "gagal_tulis"), logOf(err));
    }
    report({ stage: "done" });
    return { ok: true, via: "raw-repl" };
  }

  // An ESP32 file: wait for the PC's build.
  let state: BuildState = start.state;
  let pos = start.pos;
  const began = Date.now();
  while (state === "queued" || state === "running") {
    report({ stage: "building", pos: state === "queued" ? pos : 0 });
    await deps.sleep(POLL_MS);
    if (cancelled()) return fail("dibatalkan");
    if (Date.now() - began > POLL_MAX_MS) return fail("waktu_habis");
    let s: StatusReply;
    try {
      s = await deps.api.status(start.id);
    } catch {
      continue; // a missed answer is asked again
    }
    if (!s.ok || !s.state) return fail("tak_ada");
    state = s.state;
    pos = s.pos ?? 0;
    if (state === "failed") return fail(s.kode || "galat_kompilasi", s.log || undefined);
  }

  report({ stage: "downloading" });
  let image: Uint8Array | null;
  try {
    image = await deps.api.image(start.id);
  } catch {
    image = null;
  }
  if (!image || image.length < 1024) return fail("unduh_gagal");
  if (cancelled()) return fail("dibatalkan");

  report({ stage: "flashing", percent: 0 });
  let via = "esp32";
  try {
    via =
      (await deps.flashEsp32(
        input.port,
        image,
        (n) => report({ stage: "flashing", percent: n, phase: "write" }),
        (phase) => report({ stage: "flashing", percent: 0, phase }),
      )) || via;
  } catch (err) {
    return fail(codeOf(err, "gagal_flash"), logOf(err));
  }
  report({ stage: "done" });
  return { ok: true, via };
}

/** An error's code when it carries one of ours (UploadError.kode, or a message that is one), else the fallback */
function codeOf(err: unknown, fallback: string): string {
  const kode = (err as { kode?: unknown } | null)?.kode;
  if (typeof kode === "string" && /^[a-z_]{3,30}$/.test(kode)) return kode;
  const m = err instanceof Error ? err.message : "";
  return /^[a-z_]{3,30}$/.test(m) ? m : fallback;
}

/** What the device said, when the error carries it (UploadError.log) */
function logOf(err: unknown): string | undefined {
  const log = (err as { log?: unknown } | null)?.log;
  return typeof log === "string" && log.trim() ? log.slice(0, 4000) : undefined;
}
