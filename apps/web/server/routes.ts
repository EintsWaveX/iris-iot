/**
 * Vercel's file routing for api/, on the self-hosted server.
 *
 * `api/agent/index.ts` answers /api/agent, `api/action.ts` /api/action and
 * `api/auth/[aksi].ts` /api/auth/<anything> with `req.query.aksi` set. A
 * file or folder starting with `_` (the shared `_lib`) and every
 * `__tests__` folder is not a route. When two files could answer, the one
 * with fewer dynamic segments wins, as on Vercel.
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface Rute {
  /** Path of the file under apps/web, with forward slashes (`api/auth/[aksi].ts`). */
  berkas: string;
  /** Absolute path of the file. */
  mutlak: string;
  /** Static text, or `{ param }` for a `[name]` segment. */
  segmen: (string | { param: string })[];
}

function cari(dir: string, akar: string, out: Rute[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name === "__tests__" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      cari(p, akar, out);
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".d.ts") || e.name.endsWith(".test.ts"))
      continue;
    const rel = relative(akar, p).split(sep).join("/"); // api/auth/[aksi].ts
    const tanpa = rel.replace(/^api\//, "").replace(/\.ts$/, "");
    const bagian = tanpa.split("/");
    if (bagian[bagian.length - 1] === "index") bagian.pop();
    out.push({
      berkas: rel,
      mutlak: p,
      segmen: bagian.map((s) => {
        const m = /^\[(\w+)\]$/.exec(s);
        return m ? { param: m[1] } : s;
      }),
    });
  }
}

/** Every route file under `<akar>/api`. */
export function petaRute(akar: string): Rute[] {
  const out: Rute[] = [];
  cari(join(akar, "api"), akar, out);
  return out;
}

/** The route that answers a path like `/api/auth/student`, with its dynamic parts. */
export function cocokkanRute(
  rute: readonly Rute[],
  path: string,
): { rute: Rute; param: Record<string, string> } | null {
  if (!path.startsWith("/api")) return null;
  const bagian = path
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter((s) => s !== "");
  let terbaik: { rute: Rute; param: Record<string, string>; dinamis: number } | null = null;
  for (const r of rute) {
    if (r.segmen.length !== bagian.length) continue;
    const param: Record<string, string> = {};
    let dinamis = 0;
    let cocok = true;
    for (let i = 0; i < bagian.length; i++) {
      const s = r.segmen[i];
      if (typeof s === "string") {
        if (s !== bagian[i]) {
          cocok = false;
          break;
        }
      } else {
        let nilai = bagian[i];
        try {
          nilai = decodeURIComponent(nilai);
        } catch {
          /* keep it raw */
        }
        param[s.param] = nilai;
        dinamis++;
      }
    }
    if (cocok && (!terbaik || dinamis < terbaik.dinamis)) terbaik = { rute: r, param, dinamis };
  }
  return terbaik ? { rute: terbaik.rute, param: terbaik.param } : null;
}
