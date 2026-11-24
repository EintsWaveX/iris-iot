/**
 * The voice recording of a Wawancara, browser side. The examiner's device records in parts of a few minutes
 * (each part plays on its own, so a crash costs at most the part in progress) and uploads each part as it ends;
 * Penilaian plays them in order. The server side is api/_lib/recruitment-iv-audio.ts and iv-audio* in
 * recruitment-s4.ts.
 */
import { REC_SESI_HABIS, recGet } from "./client";

/** How long one part runs before the next one begins */
export const BAGIAN_MS = 5 * 60_000;
/** 32 kbit/s Opus is clear speech at about 1.2 MB for five minutes */
export const BITRATE = 32_000;

export interface IvAudioPart {
  id: number;
  /** The examiner's code */
  by: string;
  mine: boolean;
  ms: number;
  size: number;
  at: string;
}

/** The part types MediaRecorder gives on each browser, best first; null when this browser cannot record. */
export function pilihMime(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  for (const t of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export const fetchIvAudio = (id: number) =>
  recGet<{ ok: true; parts: IvAudioPart[] }>("iv-audio-list", {
    stage: "wawancara",
    id: String(id),
  });

/** Where a part plays from: the gated stream, same origin, so the session cookie goes with it. */
export const urlIvAudio = (id: number, part: number) =>
  `/api/recruitment/iv-audio?${new URLSearchParams({ stage: "wawancara", id: String(id), part: String(part) })}`;

export type Unggah = { ok: true } | { ok: false; status: number; kode: string };

/** Uploads one part. A refusal (4xx) is final; a lost network or a server error is worth trying again. */
export async function unggahBagian(
  id: number,
  blob: Blob,
  ms: number,
  at: string,
): Promise<Unggah> {
  const q = new URLSearchParams({
    stage: "wawancara",
    id: String(id),
    ms: String(Math.max(1, Math.round(ms))),
    at,
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    const r = await fetch(`/api/recruitment/iv-audio-up?${q}`, {
      method: "POST",
      headers: { "Content-Type": blob.type.split(";")[0] || "audio/webm" },
      body: blob,
      signal: ctl.signal,
    });
    const body = (await r.json().catch(() => ({}))) as { ok?: boolean; kode?: string };
    if (r.ok && body.ok !== false) return { ok: true };
    if (r.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event(REC_SESI_HABIS));
    return { ok: false, status: r.status, kode: body.kode ?? "data_salah" };
  } catch {
    return { ok: false, status: 0, kode: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/** 83000 ms as 1:23, 3_725_000 ms as 1:02:05 */
export function lamaAudio(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const d = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${d}` : `${m}:${d}`;
}
