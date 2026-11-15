/**
 * Small things every worker of the server must agree on (real-time upgrade, Phase 3), so the API can say
 * "once" and "remember this for a while" without knowing how many workers there are.
 *
 *  - `pakaiSekali(kunci, ttl)`: true the first time anyone, on any worker, shows `kunci`. A ticket works once,
 *    not once per worker. The supervisor decides (server/klaster/utama.ts); with one process it is a map.
 *  - `taruhBersama` / `ambilBersama`: a value every worker can read for `ttl` ms (who owns a build). A write
 *    shows on the other workers a moment later (a message over IPC, well before the page's next request).
 *
 * The server hands its bridge over at start (`pasangBersama`); tests and scripts have none and use the maps.
 */
export interface JembatanBersama {
  sekali(kunci: string, ttlMs: number): Promise<boolean>;
  taruh(kunci: string, nilai: unknown, ttlMs: number): void;
}

let jembatan: JembatanBersama | null = null;
const dipakai = new Map<string, number>();
const nilai = new Map<string, { nilai: unknown; sampai: number }>();
const MAKS_NILAI = 5000;

export function pasangBersama(j: JembatanBersama | null): void {
  jembatan = j;
}

/** True the first time `kunci` is shown anywhere, false after (until `ttlMs` has passed). Never throws. */
export async function pakaiSekali(
  kunci: string,
  ttlMs: number,
  nowMs = Date.now(),
): Promise<boolean> {
  if (jembatan) {
    try {
      return await jembatan.sekali(kunci, ttlMs);
    } catch {
      return false;
    }
  }
  for (const [k, sampai] of dipakai) if (sampai < nowMs) dipakai.delete(k);
  if (dipakai.has(kunci)) return false;
  dipakai.set(kunci, nowMs + ttlMs);
  return true;
}

/** Remembers `v` under `kunci` on every worker for `ttlMs`. */
export function taruhBersama(kunci: string, v: unknown, ttlMs: number, nowMs = Date.now()): void {
  terimaBersama(kunci, v, nowMs + ttlMs, nowMs);
  jembatan?.taruh(kunci, v, ttlMs);
}

/** What another worker put (the server calls this for each message it hears); also used by `taruhBersama`. */
export function terimaBersama(kunci: string, v: unknown, sampai: number, nowMs = Date.now()): void {
  if (sampai <= nowMs) return;
  if (nilai.size >= MAKS_NILAI) {
    for (const [k, e] of nilai) if (e.sampai < nowMs) nilai.delete(k);
    if (nilai.size >= MAKS_NILAI) return;
  }
  nilai.set(kunci, { nilai: v, sampai });
}

export function ambilBersama<T>(kunci: string, nowMs = Date.now()): T | undefined {
  const e = nilai.get(kunci);
  if (!e) return undefined;
  if (e.sampai < nowMs) {
    nilai.delete(kunci);
    return undefined;
  }
  return e.nilai as T;
}

/** For tests. */
export function lupakanBersama(): void {
  dipakai.clear();
  nilai.clear();
  jembatan = null;
}
