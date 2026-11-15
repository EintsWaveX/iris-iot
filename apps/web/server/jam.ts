/**
 * The lab clock, in this process (real-time upgrade, Phase 2b). It used to be a Cloudflare Worker's minute cron
 * that called POST /api/tp/detak through the tunnel; now the server runs it itself, a couple of seconds into
 * every minute: sessions start at their attendance clock and end at their cap with no page open, and the pages
 * hear it at once. `jamLabBilaPerlu` claims the minute in the database, so the Worker's cron (while it still
 * exists) and a PC heartbeat in the same minute cannot run it twice.
 */

export interface OpsiJam {
  /** What runs each minute; must never leave work half done when it throws. */
  jalankan: () => Promise<unknown>;
  /** Seconds into the minute to run at (default 2, so the minute's own writes are settled). */
  detikKe?: number;
  /** First run this many ms after start, to catch the minute a restart skipped (default 5 s; 0 = none). */
  awalMs?: number;
  now?: () => number;
}

/** Starts the clock; returns the function that stops it. */
export function mulaiJamLab(opsi: OpsiJam): () => void {
  const now = opsi.now ?? Date.now;
  const detikKe = opsi.detikKe ?? 2;
  let berhenti = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let jalan = false;

  const tick = async () => {
    // A run that is still going when the next minute comes is not started twice.
    if (jalan) return;
    jalan = true;
    try {
      await opsi.jalankan();
    } catch (err) {
      console.error("[jam] the lab clock's minute failed:", err);
    } finally {
      jalan = false;
    }
  };

  const jadwalkan = () => {
    if (berhenti) return;
    const kini = now();
    const jeda = 60_000 - (kini % 60_000) + detikKe * 1000;
    timer = setTimeout(() => {
      void tick().finally(jadwalkan);
    }, jeda);
    timer.unref();
  };

  if ((opsi.awalMs ?? 5000) > 0) {
    const awal = setTimeout(() => void tick(), opsi.awalMs ?? 5000);
    awal.unref();
  }
  jadwalkan();
  return () => {
    berhenti = true;
    if (timer) clearTimeout(timer);
  };
}
