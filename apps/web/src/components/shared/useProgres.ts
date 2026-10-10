/**
 * A praktikan's code progress per module (Phase 8): correct blanks out of
 * the total, read from the group's saved drafts for every open module. The
 * totals are counted at build time from the public sketch sources, so the
 * answer key never reaches the browser. `null` for a module means the
 * drafts could not be read (locked, signed out, or an earlier session).
 */
import { useEffect, useState } from "react";
import { getJson } from "../../lib/app";
import { useSegar } from "../../lib/siaran";

export interface ModulBerkas {
  modul: number;
  berkas: { slug: string; blanks: number }[];
}

export type Progres = Record<number, { benar: number; total: number } | null>;

export function useProgres(modules: readonly ModulBerkas[], terbuka: number[] | null): Progres {
  const [p, setP] = useState<Progres>({});
  // A new code version, or a session's start or end, changes the drafts.
  const segar = useSegar(["jurnal", "sesi"]);
  useEffect(() => {
    if (!terbuka) return;
    let alive = true;
    void (async () => {
      const out: Progres = {};
      for (const m of modules) {
        if (!terbuka.includes(m.modul)) continue;
        const total = m.berkas.reduce((a, b) => a + b.blanks, 0);
        try {
          const rows = await Promise.all(
            m.berkas.map((b) =>
              getJson<{ ok: boolean; jawaban?: Record<string, { benar: boolean }> }>(
                `/api/modul/draft?modul=${m.modul}&berkas=${b.slug}`,
              ),
            ),
          );
          if (rows.some((r) => !r.ok)) {
            out[m.modul] = null;
            continue;
          }
          const benar = rows.reduce(
            (a, r) => a + Object.values(r.jawaban ?? {}).filter((x) => x.benar).length,
            0,
          );
          out[m.modul] = { benar: Math.min(benar, total), total };
        } catch {
          out[m.modul] = null;
        }
      }
      if (alive) setP(out);
    })();
    return () => {
      alive = false;
    };
  }, [modules, terbuka, segar]);
  return p;
}
