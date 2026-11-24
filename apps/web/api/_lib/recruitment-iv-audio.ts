/**
 * The pure parts of the Wawancara voice recording (the handlers are in recruitment-s4.ts): which audio types
 * are taken and whether the first bytes agree with the type, the size and count limits, and the byte range a
 * player asks for when it seeks.
 */

/** What MediaRecorder gives: WebM or Ogg (Chrome, Firefox, Edge), MP4 (Safari). */
export const AUDIO_TIPE = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
/** One part: five minutes at 32 kbit/s is about 1.2 MB; this leaves room for a better bit rate. */
export const AUDIO_BAGIAN_MAKS = 12 * 1024 * 1024;
/** The longest one part may claim (the device rotates every 5 minutes; this is the sanity limit). */
export const AUDIO_MS_MAKS = 20 * 60_000;
/** Parts per CaAs, over every examiner who records: 5 minute parts, a long interview and a second device. */
export const AUDIO_BAGIAN_BANYAK = 60;

/** True when the first bytes are what the declared type says (the type alone is the client's word). */
export function audioCocok(tipe: string, isi: Buffer): boolean {
  switch (tipe) {
    case "audio/webm":
      return (
        isi.length > 4 && isi[0] === 0x1a && isi[1] === 0x45 && isi[2] === 0xdf && isi[3] === 0xa3
      );
    case "audio/ogg":
      return isi.length > 4 && isi.subarray(0, 4).toString("latin1") === "OggS";
    case "audio/mp4":
      return isi.length > 12 && isi.subarray(4, 8).toString("latin1") === "ftyp";
    default:
      return false;
  }
}

/** A recorder reports `audio/webm;codecs=opus`; only the type before the semicolon is stored. */
export const tipeDasar = (v: unknown): string =>
  String(v ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();

/**
 * A `Range: bytes=a-b` header against a file of `size` bytes: the first and last byte to send, null when
 * there is no range (send it all), or "salah" when it cannot be met (answer 416).
 */
export function bacaRentang(
  header: unknown,
  size: number,
): { mulai: number; akhir: number } | null | "salah" {
  if (typeof header !== "string" || header === "") return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "salah";
  let mulai: number;
  let akhir: number;
  if (m[1] === "") {
    // the last n bytes
    const n = Number(m[2]);
    if (n === 0) return "salah";
    mulai = Math.max(0, size - n);
    akhir = size - 1;
  } else {
    mulai = Number(m[1]);
    akhir = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (mulai >= size || mulai > akhir) return "salah";
  return { mulai, akhir };
}
