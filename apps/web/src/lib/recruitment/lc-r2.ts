/**
 * Live Coding's objects in R2 (EXAM-ENGINE 9.4, 9.7): the compiled image of
 * each job and each seat's traffic log, under `recruitment/<edition>/lc/`.
 * The relay keeps an upload only if its first bytes fit the key. Pure.
 */
import { LC_KUNCI_RE, REK_KUNCI_RE } from "../tp-r2.js";

const PDF_AWAL = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
/** The first byte of an ESP32 image: the bootloader of the merged image starts with it. */
export const ESP_MAGIC = 0xe9;

const whole = (n: number, what: string): number => {
  if (!Number.isInteger(n) || n <= 0)
    throw new RangeError(`${what} must be a positive whole number`);
  return n;
};

/** A seat's image, or a warm-up job's (`"warm"`, no seat). */
export const kunciLcBin = (edisi: number, seatId: number | "warm", jobId: number): string => {
  const seat = seatId === "warm" ? "warm" : whole(seatId, "seat");
  const k = `recruitment/${whole(edisi, "edition")}/lc/${seat}/${whole(jobId, "job")}.bin`;
  if (!LC_KUNCI_RE.test(k)) throw new Error("unsafe key");
  return k;
};

export const kunciLcTraffic = (edisi: number, seatId: number): string =>
  `recruitment/${whole(edisi, "edition")}/lc/${whole(seatId, "seat")}/traffic.jsonl`;

/** The largest image the relay keeps (a trimmed merged image is about 1 MB). */
export const LC_BIN_MAKS = 4 * 1024 * 1024;

/**
 * An agent's upload cannot know the size or hash before it compiles, so its
 * ticket carries `n: 0` and `s: ""` and is good only for an exam image key;
 * the relay measures what arrives and the API compares it with what the agent
 * reported.
 */
export const putBebas = (t: { k: string; n: number; s: string }): boolean =>
  t.n === 0 && t.s === "" && LC_KUNCI_RE.test(t.k) && t.k.endsWith(".bin");

/** Whether the bytes fit the key's kind: a PDF for a document, an image for a .bin, anything for the log. */
export function isiCocok(kunci: string, isi: Uint8Array): boolean {
  if (LC_KUNCI_RE.test(kunci)) return kunci.endsWith(".bin") ? isi[0] === ESP_MAGIC : true;
  if (REK_KUNCI_RE.test(kunci) || kunci.endsWith(".pdf"))
    return PDF_AWAL.every((c, i) => isi[i] === c);
  return true;
}
