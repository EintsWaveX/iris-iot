/**
 * The Mode Latihan context of one request (src/lib/recruitment/latihan.ts).
 * `denganLatihan` in recruitment-latihan.ts sets it from the iris_latihan
 * cookie after checking the site session is an active Asisten; the readers
 * (the live edition lookup, the seat, the sessions) only ask `konteksLatihan`.
 * It holds no imports, so any module can read it without a cycle.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { EditionInfo } from "../../src/lib/recruitment/types.js";
import type { LatihanMode } from "../../src/lib/recruitment/latihan.js";

export interface KonteksLatihan {
  mode: LatihanMode;
  nim: string;
  nama: string;
  /** The practice edition every recruitment read and write in this request uses */
  edisi: EditionInfo;
}

const als = new AsyncLocalStorage<KonteksLatihan>();

export const konteksLatihan = (): KonteksLatihan | undefined => als.getStore();

export const jalankanLatihan = <T>(k: KonteksLatihan, fn: () => T): T => als.run(k, fn);
