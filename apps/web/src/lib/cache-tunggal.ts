/**
 * A tiny in-memory cache for a value that many requests ask for at once and that changes rarely (which
 * session is running, say). Three rules keep it honest:
 *
 *  - single flight: while one load is running, everyone who asks waits for that one load instead of each
 *    running the query;
 *  - a short life (`ms`), so a missed invalidation costs at most that long;
 *  - invalidation by generation: `batalkan()` (and `batalkanSemuaCache()`, which the API calls after every
 *    write) drops the value AND makes any load that started before it throw its result away, so a read that
 *    began before a write can never be stored after it.
 *
 * A cache is off (`ms` = 0, every call loads) until `atur(ms)` turns it on. The server turns the caches on
 * at start; tests and scripts leave them off and see the database every time.
 */
export interface CacheTunggal<T> {
  /** The cached value, or a fresh load. */
  ambil(): Promise<T>;
  /** Forget the value and ignore any load now in flight. */
  batalkan(): void;
  /** Life of a value in ms; 0 turns the cache off. */
  atur(ms: number): void;
}

const semua = new Set<CacheTunggal<unknown>>();

/** `salin` gives each caller its own copy, so one caller changing a row does not change it for the others. */
export function cacheTunggal<T>(muat: () => Promise<T>, salin?: (nilai: T) => T): CacheTunggal<T> {
  let ms = 0;
  let generasi = 0;
  let isi: { t: number; nilai: T } | null = null;
  let jalan: Promise<T> | null = null;
  const beri = (n: T) => (salin ? salin(n) : n);

  const c: CacheTunggal<T> = {
    async ambil() {
      if (ms <= 0) return muat();
      if (isi && Date.now() - isi.t < ms) return beri(isi.nilai);
      if (!jalan) {
        const g = generasi;
        const p: Promise<T> = muat()
          .then((nilai) => {
            if (g === generasi) isi = { t: Date.now(), nilai };
            return nilai;
          })
          .finally(() => {
            if (jalan === p) jalan = null;
          });
        jalan = p;
      }
      return beri(await jalan);
    },
    batalkan() {
      generasi++;
      isi = null;
      jalan = null;
    },
    atur(baru) {
      ms = Math.max(0, baru);
      c.batalkan();
    },
  };
  semua.add(c as CacheTunggal<unknown>);
  return c;
}

/** Tells the other workers of the server (when there are any) to drop their caches too. */
let sebarBatal: (() => void) | null = null;

export function pasangSebarBatal(f: (() => void) | null): void {
  sebarBatal = f;
}

/** Drops every cache in this process only (what a message from another worker asks for). */
export function batalkanCacheLokal(): void {
  for (const c of semua) c.batalkan();
}

/**
 * Drops every cache. The API calls this after each write and each broadcast; with several workers the others
 * are told as well (one message however many writes this tick made).
 */
export function batalkanSemuaCache(): void {
  batalkanCacheLokal();
  if (!sebarBatal) return;
  if (menyebar) return;
  menyebar = true;
  queueMicrotask(() => {
    menyebar = false;
    try {
      sebarBatal?.();
    } catch {
      /* the other workers keep a value for a second at most anyway */
    }
  });
}
let menyebar = false;
