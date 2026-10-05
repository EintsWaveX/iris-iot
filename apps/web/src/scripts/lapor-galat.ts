/**
 * Reports this page's own uncaught errors to the API (2026-10-05), so a
 * page that breaks during a class shows up in the alert and the audit log
 * instead of only in one student's console. Only errors from this site's
 * own scripts (not extensions), at most five per page load, and the same
 * message once.
 *
 * Started from the Toast island (mounted on every page), not a <script>
 * tag: Astro inlines a small script, and the CSP blocks inline scripts.
 */
const MAKS = 5;
let terkirim = 0;
const sudah = new Set<string>();

function kirim(pesan: string, sumber = "", baris?: number) {
  if (!pesan || terkirim >= MAKS || sudah.has(pesan)) return;
  sudah.add(pesan);
  terkirim += 1;
  try {
    const body = JSON.stringify({
      pesan: pesan.slice(0, 400),
      sumber: sumber.slice(0, 200),
      baris,
      halaman: location.pathname,
    });
    void fetch("/api/auth/galat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

const milikSitus = (src: string) => !src || src.startsWith(location.origin);

let pasang = false;

/** Starts listening, once per page load. */
export function pasangLaporGalat(): void {
  if (pasang || typeof window === "undefined") return;
  pasang = true;
  window.addEventListener("error", (e) => {
    // A failed <img> or <script> load fires here too, without a message.
    if (!e.message || !milikSitus(e.filename ?? "")) return;
    kirim(e.message, (e.filename ?? "").replace(location.origin, ""), e.lineno);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r: unknown = e.reason;
    // Network drops already show as offline and stale-page banners.
    if (r instanceof DOMException && r.name === "AbortError") return;
    if (r instanceof TypeError && /fetch|network|load failed/i.test(r.message)) return;
    // An API answer with a bad status (lib/app.ts's HttpError, message "401"
    // and the like): the server side reports its own failures.
    if (r instanceof Error && /^\d{3}$/.test(r.message)) return;
    const pesan = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
    const stack = r instanceof Error ? (r.stack ?? "") : "";
    if (stack && !stack.includes(location.origin) && /extension:\/\//.test(stack)) return;
    kirim(pesan, stack.split("\n")[1]?.trim().replace(location.origin, "") ?? "");
  });
}
