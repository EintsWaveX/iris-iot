/**
 * Phase 9 (A3): server facts both the API and the browser need, kept free
 * of node:crypto and the database so islands can import them too
 * (server-lib.ts re-exports what the API side uses).
 */

/** The practicum services in the order every view shows them. The agent
 *  sends them as a JSON object and jsonb does not keep key order, so the
 *  order is fixed here instead. */
export const LAYANAN_URUT = ["modul2-ws", "mosquitto", "modul4"] as const;

/** Known services first in LAYANAN_URUT order, then anything else the
 *  agent reports, alphabetically. */
export function urutkanLayanan(
  layanan: Record<string, string> | null | undefined,
): [string, string][] {
  const urut = LAYANAN_URUT as readonly string[];
  return Object.entries(layanan ?? {}).sort(([a], [b]) => {
    const ia = urut.indexOf(a);
    const ib = urut.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

/** The agent reports "ap-mandiri" (hotspot with no uplink) or "ap+uplink"
 *  (hotspot plus a dongle or wired uplink), and an agent older than Stage 19
 *  sent plain "ap". All three mean the IRIS-IOT hotspot is on. */
export function hotspotMenyala(mode: string | null | undefined): boolean {
  return mode === "ap" || mode === "ap-mandiri" || mode === "ap+uplink";
}

/** diag.siap's `modul` argument: "" checks no particular module. Mirrors
 *  SIAP_MODUL in the agent's commands.py. */
export const MODUL_SIAP = ["", "2", "3", "4"] as const;
export type ModulSiap = (typeof MODUL_SIAP)[number];

export function modulSiapValid(value: unknown): value is ModulSiap {
  return typeof value === "string" && (MODUL_SIAP as readonly string[]).includes(value);
}

export interface CekSiap {
  id: string;
  status: "ok" | "gagal" | "info";
  judul: string;
  perbaikan: string;
}

export interface HasilSiap {
  modul: string;
  waktu: string | null;
  lulus: boolean;
  gagal: number;
  cek: CekSiap[];
}

/** Reads the JSON `iris-diag siap` prints (opi_preflight.sh --json) out of
 *  a command's output. Returns null when the output is not that document,
 *  e.g. an agent error message. Anything it cannot trust is dropped rather
 *  than shown half-parsed. */
export function bacaHasilSiap(keluaran: string | null | undefined): HasilSiap | null {
  if (!keluaran) return null;
  const a = keluaran.indexOf("{");
  const b = keluaran.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(keluaran.slice(a, b + 1));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.cek)) return null;
  const cek: CekSiap[] = [];
  for (const c of o.cek) {
    if (typeof c !== "object" || c === null) continue;
    const x = c as Record<string, unknown>;
    if (x.status !== "ok" && x.status !== "gagal" && x.status !== "info") continue;
    if (typeof x.judul !== "string") continue;
    cek.push({
      id: typeof x.id === "string" ? x.id : "",
      status: x.status,
      judul: x.judul,
      perbaikan: typeof x.perbaikan === "string" ? x.perbaikan : "",
    });
  }
  const gagal = cek.filter((c) => c.status === "gagal").length;
  return {
    modul: typeof o.modul === "string" ? o.modul : "",
    waktu: typeof o.waktu === "string" ? o.waktu : null,
    lulus: o.lulus === true && gagal === 0,
    gagal,
    cek,
  };
}
