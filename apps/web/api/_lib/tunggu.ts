/**
 * Work that goes on after the answer has been sent (a relay broadcast, the
 * PC heartbeat's backups), for both homes of the API.
 *
 * On Vercel a function instance freezes the moment it answers, so such work
 * is handed to `waitUntil` from @vercel/functions, which keeps it alive. On
 * the self-hosted server (apps/web/server) the process never freezes; the
 * promise just runs on, and the server drains the ones still pending before
 * it exits (`tungguLatar`, called on SIGTERM), so a restart does not drop a
 * broadcast. Both paths track the promise, so a test can see it settle.
 *
 * It never throws and never reports a rejection by itself: the caller's own
 * promise already carries its `.catch` (the sites that matter log there).
 */
import { waitUntil as waitUntilVercel } from "@vercel/functions";

const latar = new Set<Promise<void>>();

export function waitUntil(kerja: Promise<unknown>): void {
  const selesai: Promise<void> = Promise.resolve(kerja).then(
    () => undefined,
    () => undefined,
  );
  latar.add(selesai);
  void selesai.then(() => latar.delete(selesai));
  // Only on Vercel: elsewhere the library has nothing to hook into.
  if (process.env.VERCEL) waitUntilVercel(kerja);
}

/** How many background jobs are still running (for the health answer). */
export function jumlahLatar(): number {
  return latar.size;
}

/**
 * Waits until no background job is left, at most `msMaks` milliseconds (jobs
 * that start while draining are waited for too). Resolves true when the set
 * emptied, false when the time ran out first.
 */
export async function tungguLatar(msMaks = 60_000): Promise<boolean> {
  const batas = Date.now() + msMaks;
  while (latar.size > 0) {
    const sisa = batas - Date.now();
    if (sisa <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const habis = new Promise<"habis">((r) => {
      timer = setTimeout(() => r("habis"), sisa);
    });
    const hasil = await Promise.race([
      Promise.all([...latar]).then(() => "selesai" as const),
      habis,
    ]);
    clearTimeout(timer);
    if (hasil === "habis") return latar.size === 0;
  }
  return true;
}
