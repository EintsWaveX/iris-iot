/**
 * Notices when this process stops answering: a timer that asks to run every `tiap` ms and finds it ran much
 * later was held up by something that never gave the event loop back (heavy work in a handler, a long
 * garbage collection). The site is one process, so such a stall delays every request, and a database
 * connection that was opened meanwhile can time out even though Postgres was fine.
 */
export function pantauJeda(opsi: {
  /** How often the timer is due, ms. */
  tiap?: number;
  /** A delay longer than this is reported, ms. */
  ambang?: number;
  lapor: (jedaMs: number) => void;
  /** For tests. */
  sekarang?: () => number;
}): () => void {
  const tiap = opsi.tiap ?? 500;
  const ambang = opsi.ambang ?? 1000;
  const sekarang = opsi.sekarang ?? Date.now;
  let terakhir = sekarang();
  const t = setInterval(() => {
    const kini = sekarang();
    const jeda = kini - terakhir - tiap;
    terakhir = kini;
    if (jeda > ambang) opsi.lapor(jeda);
  }, tiap);
  t.unref();
  return () => clearInterval(t);
}
