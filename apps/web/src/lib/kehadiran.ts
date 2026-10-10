/**
 * Online or not, for an Asisten (Team page): their signed-in page asks
 * /api/session/now at least every 60 s while it is in view, and that call
 * stamps asisten.terakhir_aktif at most every 45 s (api/_lib/kehadiran.ts).
 * So someone with the app open is never more than ~65 s old; 150 s leaves
 * room for a slow call. A hidden tab stops asking and goes offline.
 */
export const ONLINE_MS = 150_000;

export function sedangOnline(terakhirAktif: string | null | undefined, now = Date.now()): boolean {
  if (!terakhirAktif) return false;
  const t = Date.parse(terakhirAktif);
  return Number.isFinite(t) && now - t < ONLINE_MS;
}
