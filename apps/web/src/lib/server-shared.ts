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

/* ------------------------------------------------- Phase 9 Stage 5 */

/** The agent protocol this site relies on. Bump with AGEN_PROTOKOL in the
 *  agent's agent.py whenever the site starts needing something new. */
export const AGEN_PROTOKOL_TERBARU = 2;

/** diag.journal's arguments, mirrored by JOURNAL_UNIT and JOURNAL_TINGKAT
 *  in the agent's commands.py. */
export const JOURNAL_UNIT = [
  "semua",
  "iris-agent",
  "modul2-ws",
  "mosquitto",
  "modul4",
  "chrony",
  "kernel",
] as const;
export const JOURNAL_TINGKAT = ["semua", "galat"] as const;

export function journalArgValid(argumen: Record<string, unknown>): boolean {
  const unit = argumen.unit ?? "semua";
  const tingkat = argumen.tingkat ?? "semua";
  return (
    (JOURNAL_UNIT as readonly unknown[]).includes(unit) &&
    (JOURNAL_TINGKAT as readonly unknown[]).includes(tingkat)
  );
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && num(v[0]) !== null && num(v[1]) !== null
    ? [v[0] as number, v[1] as number]
    : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rows = (v: unknown): Record<string, unknown>[] =>
  arr(v)
    .map(obj)
    .filter((x): x is Record<string, unknown> => !!x);

/** The heartbeat's `kondisi` block (the "Pi right now" cards). */
export interface Kondisi {
  inti: number | null;
  beban: number[] | null;
  memori: [number, number] | null;
  swap: [number, number] | null;
  disk: [number, number] | null;
  jaringan: { antarmuka: string; masuk: number; keluar: number } | null;
  jamSelisihMs: number | null;
}

export function bacaKondisi(raw: unknown): Kondisi | null {
  const o = obj(raw);
  if (!o) return null;
  const j = obj(o.jaringan);
  const beban =
    Array.isArray(o.beban) && o.beban.length && o.beban.every((x) => num(x) !== null)
      ? (o.beban as number[]).slice(0, 3)
      : null;
  return {
    inti: num(o.inti),
    beban,
    memori: pair(o.memori),
    swap: pair(o.swap),
    disk: pair(o.disk),
    jaringan:
      j && num(j.masuk) !== null && num(j.keluar) !== null
        ? {
            antarmuka: str(j.antarmuka).slice(0, 32),
            masuk: j.masuk as number,
            keluar: j.keluar as number,
          }
        : null,
    jamSelisihMs: num(o.jamSelisihMs),
  };
}

/** The `kondisi` the API stores: only known keys with the right types. */
export function saringKondisi(raw: unknown): Record<string, unknown> | null {
  const k = bacaKondisi(raw);
  if (!k) return null;
  const out = Object.fromEntries(Object.entries(k).filter(([, v]) => v !== null));
  return Object.keys(out).length ? out : null;
}

/** diag.rinci's JSON (the Full view). */
export interface Rinci {
  waktu: string | null;
  inti: (number | null)[];
  beban: number[] | null;
  frekuensiMhz: number | null;
  memori: [number, number] | null;
  swap: [number, number] | null;
  mount: { m: string; pakai: number; total: number }[];
  antarmuka: {
    nama: string;
    alamat: string[];
    masuk: number;
    keluar: number;
    keadaan: string;
    uplink: boolean;
  }[];
  hotspot: { menyala: boolean; klien: number | null };
  ntp: { tersinkron: boolean; stratum: number | null; selisihMs: number | null; sumber: string };
  dns: { server: string; ms: number | null } | null;
  layanan: {
    unit: string;
    keadaan: string;
    sejak: string;
    mulaiUlang: number | null;
    memori: number | null;
  }[];
  proses: { pid: number; cpu: number; memori: number; nama: string }[];
  paket: Record<string, string>;
  galatJurnal24j: number | null;
  konfigAp: [string, string, boolean][] | null;
  timer: { unit: string; berikut: string }[];
}

/** Reads diag.rinci's output. Null when it is not that document (an agent
 *  error message, or an older agent that refused the action). */
export function bacaRinci(keluaran: string | null | undefined): Rinci | null {
  if (!keluaran) return null;
  const a = keluaran.indexOf("{");
  const b = keluaran.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o: Record<string, unknown> | null;
  try {
    o = obj(JSON.parse(keluaran.slice(a, b + 1)));
  } catch {
    return null;
  }
  if (!o || o.skema !== 1) return null;
  const hs = obj(o.hotspot) ?? {};
  const ntp = obj(o.ntp) ?? {};
  const dns = obj(o.dns);
  const paket = obj(o.paket) ?? {};
  return {
    waktu: str(o.waktu) || null,
    inti: arr(o.inti).map(num),
    beban: Array.isArray(o.beban) ? o.beban.map(num).filter((x): x is number => x !== null) : null,
    frekuensiMhz: num(o.frekuensiMhz),
    memori: pair(o.memori),
    swap: pair(o.swap),
    mount: rows(o.mount)
      .filter((m) => num(m.total) !== null)
      .map((m) => ({ m: str(m.m), pakai: num(m.pakai) ?? 0, total: m.total as number })),
    antarmuka: rows(o.antarmuka).map((x) => ({
      nama: str(x.nama),
      alamat: arr(x.alamat).map(str).filter(Boolean),
      masuk: num(x.masuk) ?? 0,
      keluar: num(x.keluar) ?? 0,
      keadaan: str(x.keadaan),
      uplink: x.uplink === true,
    })),
    hotspot: { menyala: hs.menyala === true, klien: num(hs.klien) },
    ntp: {
      tersinkron: ntp.tersinkron === true,
      stratum: num(ntp.stratum),
      selisihMs: num(ntp.selisihMs),
      sumber: str(ntp.sumber),
    },
    dns: dns ? { server: str(dns.server), ms: num(dns.ms) } : null,
    layanan: rows(o.layanan).map((x) => ({
      unit: str(x.unit),
      keadaan: str(x.keadaan),
      sejak: str(x.sejak),
      mulaiUlang: num(x.mulaiUlang),
      memori: num(x.memori),
    })),
    proses: rows(o.proses)
      .filter((x) => num(x.pid) !== null)
      .map((x) => ({
        pid: x.pid as number,
        cpu: num(x.cpu) ?? 0,
        memori: num(x.memori) ?? 0,
        nama: str(x.nama),
      })),
    paket: Object.fromEntries(
      Object.entries(paket).filter((e): e is [string, string] => typeof e[1] === "string"),
    ),
    galatJurnal24j: num(o.galatJurnal24j),
    konfigAp: Array.isArray(o.konfigAp)
      ? o.konfigAp
          .filter((r): r is unknown[] => Array.isArray(r) && r.length === 3)
          .map((r): [string, string, boolean] => [
            str(r[0]),
            r[2] === true ? "" : str(r[1]),
            r[2] === true,
          ])
      : null,
    timer: rows(o.timer).map((x) => ({ unit: str(x.unit), berikut: str(x.berikut) })),
  };
}

/** The bundle SHAs the agent reports as agenVersi ("<IRIS ASO> / <iris-iot>",
 *  in BUNDLE.txt order, each maybe followed by " (dirty)"). */
export function bacaBundel(agenVersi: string | null | undefined): {
  aso: string | null;
  iot: string | null;
} {
  const parts = (agenVersi ?? "").split(" / ").map((p) => p.trim().split(" ")[0] || null);
  return { aso: parts[0] ?? null, iot: parts[1] ?? null };
}

export type StatusPembaruan = "terbaru" | "perlu" | "beda" | "tidak_tahu";

export interface BarisPembaruan {
  k: "agen" | "bundel" | "modul4" | "apt";
  sekarang: string | null;
  baru: string | null;
  status: StatusPembaruan;
  keamanan?: number;
}

/** The Updates card's rows, from the agent's infoSistem and agenVersi and
 *  what the site knows is newest (its own iris-iot commit when deployed).
 *  The site can't see the IRIS ASO repo, so that row only shows the SHA. */
export function barisPembaruan(
  info: Record<string, unknown> | null | undefined,
  agenVersi: string | null | undefined,
  situsIot: string | null | undefined,
): BarisPembaruan[] {
  const i = info ?? {};
  const protokol = num(i.protokol);
  const b = bacaBundel(agenVersi);
  const apt = obj(i.apt);
  const bisa = apt ? num(apt.bisa) : null;
  const sama = (x: string, y: string) => x.slice(0, 7) === y.slice(0, 7);
  return [
    {
      k: "agen",
      sekarang: protokol === null ? null : String(protokol),
      baru: String(AGEN_PROTOKOL_TERBARU),
      status: protokol !== null && protokol >= AGEN_PROTOKOL_TERBARU ? "terbaru" : "perlu",
    },
    { k: "bundel", sekarang: b.aso, baru: null, status: b.aso ? "terbaru" : "tidak_tahu" },
    {
      k: "modul4",
      sekarang: b.iot,
      baru: situsIot ? situsIot.slice(0, 7) : null,
      status: !b.iot ? "tidak_tahu" : !situsIot || sama(b.iot, situsIot) ? "terbaru" : "beda",
    },
    {
      k: "apt",
      sekarang: bisa === null ? null : String(bisa),
      baru: null,
      status: bisa === null ? "tidak_tahu" : bisa > 0 ? "perlu" : "terbaru",
      keamanan: apt ? (num(apt.keamanan) ?? 0) : 0,
    },
  ];
}
