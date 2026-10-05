/**
 * Error reporting (2026-10-05). Before this, an error only lived in
 * Vercel's function logs, so nobody heard about it during a class. Now:
 *
 * - every console.error an API route writes (each route's catch block
 *   already logs `[api/...] unexpected error:`), and anything a route
 *   throws, is also saved as an audit row `galat_server`;
 * - the browser reports its own uncaught errors as `galat_klien`
 *   (api/auth/[aksi].ts, aksi=galat);
 * - the Asisten pages ask /api/session/waspada and raise an alert on a
 *   burst of server errors or a Pi that drops out during a session
 *   (shell/LabAlert.tsx).
 *
 * The audit table holds them, so no new table or outside service. Rows are
 * capped per function instance (and the same message is saved once a
 * minute) so a failing loop can't flood it. A failed save only reaches the
 * original console.error, never this hook again.
 */
import type { ApiHandler, ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { audit } from "../../src/lib/schema.js";

const MAKS_PER_MENIT = 20;
const PESAN_MAKS = 600;

const asli = console.error.bind(console);
const tertunda = new Set<Promise<unknown>>();
const baruSaja = new Map<string, number>();
let jendela = 0;
let hitung = 0;
let ruteKini = "";
let terpasang = false;

function teks(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Saves one error as an audit row (best effort, capped). */
export function catatGalat(aksi: "galat_server" | "galat_klien", detail: Record<string, unknown>) {
  const kini = Date.now();
  if (kini - jendela > 60_000) {
    jendela = kini;
    hitung = 0;
  }
  const kunci = `${aksi}|${String(detail.pesan ?? "").slice(0, 120)}`;
  if ((baruSaja.get(kunci) ?? 0) > kini - 60_000) return;
  if (++hitung > MAKS_PER_MENIT) return;
  baruSaja.set(kunci, kini);
  if (baruSaja.size > 200) baruSaja.clear();
  const p = (async () => {
    try {
      await getDb()
        .insert(audit)
        .values({ aktorNim: "sistem", aksi, detail: JSON.stringify(detail).slice(0, 2000) });
    } catch (err) {
      asli("[galat] could not save an error report:", err);
    }
  })();
  tertunda.add(p);
  void p.finally(() => tertunda.delete(p));
}

/** Node's own process warnings ("(node:4) [DEP0169] DeprecationWarning:
 *  ...", "ExperimentalWarning") also reach console.error, once per cold
 *  start; on production that was one row per cold start, enough to trip
 *  the burst alert during a class. They aren't errors of this site. */
export function bukanGalat(pesan: string): boolean {
  return /^\(node:\d+\) /.test(pesan);
}

/** Hooks console.error once per function instance. */
export function pasangPencatat() {
  if (terpasang) return;
  terpasang = true;
  console.error = (...args: unknown[]) => {
    asli(...args);
    try {
      const pesan = args.map(teks).join(" ").slice(0, PESAN_MAKS);
      if (bukanGalat(pesan)) return;
      catatGalat("galat_server", { rute: ruteKini, pesan });
    } catch {
      /* reporting must never break the caller */
    }
  };
}

/** Which route is answering, for the reports (one request at a time per
 *  instance on Vercel's Node runtime, so a module variable is enough). */
export function setRute(rute: string) {
  ruteKini = rute;
}

/** Waits for reports still being saved, so a frozen function doesn't drop
 *  them after its response went out. */
export async function tungguGalat(): Promise<void> {
  if (tertunda.size) await Promise.allSettled([...tertunda]);
}

/** Errors in the last `menit` minutes, for the alert. */
export const AMBANG_GALAT = { menit: 10, jumlah: 5 } as const;

/** Wraps a route: reports what it logs or throws, and answers 500 for a
 *  throw that left no answer behind. */
export function denganGalat(
  rute: string,
  handler: (req: ApiRequest, res: ApiResponse) => Promise<void> | void,
): ApiHandler {
  pasangPencatat();
  return async (req: ApiRequest, res: ApiResponse) => {
    const aksi = req.query?.aksi;
    setRute(`${req.method ?? ""} ${rute}${typeof aksi === "string" && aksi ? `:${aksi}` : ""}`);
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[api/${rute}] uncaught error:`, err);
      if (!res.headersSent) res.status(500).json({ ok: false, kode: "galat_server" });
    } finally {
      await tungguGalat();
    }
  };
}
