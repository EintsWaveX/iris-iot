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
 *  sent plain "ap". All three mean the IRIS_IOT hotspot is on. */
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

/** The module a check belongs to, from its id (opi_preflight.sh: the text
 *  before the first ":"); null for the checks every module shares, venv
 *  included (Modul 2 and 4 both run on it). */
export function modulCek(id: string): "2" | "3" | "4" | null {
  if (id.startsWith("iris-modul2-ws")) return "2";
  if (id.startsWith("mosquitto")) return "3";
  if (id.startsWith("modul4") || id.startsWith("Modul-4")) return "4";
  return null;
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
export const AGEN_PROTOKOL_TERBARU = 8;

/** Where the IRIS_IOT hotspot comes from (agent protocol 5): a router in
 *  Access Point mode on the Pi's LAN port, or the Pi's own Wi-Fi radio. */
export const AP_SUMBER = ["kabel", "wifi"] as const;
export type ApSumber = (typeof AP_SUMBER)[number];

export function apSumberValid(value: unknown): value is ApSumber {
  return typeof value === "string" && (AP_SUMBER as readonly string[]).includes(value);
}

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
  /** Konsol Pi's screen: "siap", or why it can't open (2026-10-07). */
  layar: LayarKonsol | null;
  /** The Pi's clock minus the site's, in seconds, measured by the site on
   *  each heartbeat (chrony's own offset can't see a wrong reference). */
  selisihDetik: number | null;
}

/** How far the PC Server's clock may be from the site's before it shows
 *  (the heartbeat's trip is in the measure, so a little more than the Ready
 *  check's 3 s). Every journal's delay column is board time minus PC time. */
export const JAM_TOLERANSI_DETIK = 5;

/** The clock's distance from the site in ms, and whether it is off: the
 *  site's own measure first, since chrony serving its own clock (no time
 *  server reachable) reports 0 ms while it drifts (seen live: 58 s). */
export function jamServer(k: Kondisi | null): { ms: number | null; meleset: boolean } {
  const situs = k?.selisihDetik ?? null;
  const chrony = k?.jamSelisihMs ?? null;
  if (situs !== null) return { ms: situs * 1000, meleset: Math.abs(situs) >= JAM_TOLERANSI_DETIK };
  return { ms: chrony, meleset: chrony !== null && Math.abs(chrony) >= 60_000 };
}

export const LAYAR_KONSOL = [
  "siap",
  "x11vnc_tidak_ada",
  "layar_tidak_ada",
  "krdp_tidak_ada",
  "guacd_tidak_ada",
  "guacd_mati",
] as const;
export type LayarKonsol = (typeof LAYAR_KONSOL)[number];

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
    layar: (LAYAR_KONSOL as readonly unknown[]).includes(o.layar) ? (o.layar as LayarKonsol) : null,
    selisihDetik: num(o.selisihDetik),
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
  /** What its Update button sends: the three bundle rows share one. */
  aksi: "pembaruan.bundel" | "pembaruan.apt";
}

/** The newest bundle CI published (api/_lib/bundel.ts), without the zip. */
export interface BundelTerbit {
  aso: string;
  iot: string;
  sha256: string;
  ukuran: number;
  dibuat: string;
  /** When CI built it (BUNDLE.txt); the later build wins. */
  dibangun: string;
}

/** How the last install or apt upgrade went, from the agent's infoSistem.
 *  "terhenti": still "berjalan" long after it started, so the run was cut
 *  off (a reboot, a kill) before it could write its end (2026-10-09). */
export interface HasilPembaruan {
  status: "berjalan" | "selesai" | "gagal" | "terhenti";
  pesan: string;
  pada: number | null;
}

/** The package manager behind the Updates card's system packages row:
 *  agent protocol 6 builds since 2026-10-14 send infoSistem.distro
 *  ({ keluarga, pengelola }); before that every Pi ran apt. */
export function pengelolaPaket(info: Record<string, unknown> | null | undefined): string {
  const p = str(obj(info?.distro)?.pengelola);
  return ["apt", "dnf", "yum", "pacman", "zypper"].includes(p) ? p : "apt";
}

/** The server's self-repair (iris-pulih, 2026-10-14): what it last fixed and
 *  what it could not, English like every agent report. The agent sends it
 *  in infoSistem.pulih only once there was news. */
export interface HasilPulih {
  pada: number | null;
  diperbaiki: string[];
  gagal: string[];
}

export function bacaPulih(info: Record<string, unknown> | null | undefined): HasilPulih | null {
  const o = obj(info?.pulih);
  if (!o) return null;
  const baris = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.slice(0, 300))
          .slice(0, 20)
      : [];
  return { pada: num(o.pada), diperbaiki: baris(o.diperbaiki), gagal: baris(o.gagal) };
}

/** The site's own notes in a command's output, English like everything the
 *  agent reports (2026-10-14); rows written before keep their Indonesian
 *  note, so both are recognised. */
export const CATATAN_BATAL = "Cancelled by an Asisten";
const CATATAN_BATAL_LAMA = "dibatalkan oleh asisten";
export const CATATAN_AGEN_DIAM = "The agent never reported back";
export const CATATAN_TIDAK_DIAMBIL = "The agent never picked it up";
const TANPA_KELUARAN = ["(no output)", "(tidak ada keluaran)"];

export function catatanBatal(keluaran: string | null | undefined): boolean {
  return keluaran === CATATAN_BATAL || keluaran === CATATAN_BATAL_LAMA;
}

/** True when a command ran but printed nothing (the agent's own placeholder). */
export function tanpaKeluaran(keluaran: string | null | undefined): boolean {
  return !keluaran?.trim() || TANPA_KELUARAN.includes(keluaran);
}

/** Longer than any real run: three 45 minute download limits plus installs. */
export const PEMBARUAN_BASI_DETIK = 4 * 3600;

export function bacaHasilPembaruan(
  info: Record<string, unknown> | null | undefined,
  mode: "bundel" | "apt",
  nowMs: number = Date.now(),
): HasilPembaruan | null {
  const o = obj(obj(info?.pembaruan)?.[mode]);
  if (!o || !["berjalan", "selesai", "gagal"].includes(o.status as string)) return null;
  const pada = num(o.pada);
  const basi =
    o.status === "berjalan" && pada !== null && nowMs / 1000 - pada > PEMBARUAN_BASI_DETIK;
  return {
    status: basi ? "terhenti" : (o.status as HasilPembaruan["status"]),
    pesan: str(o.pesan).slice(0, 1500),
    pada,
  };
}

/** The Updates card's rows, from the agent's infoSistem and agenVersi and
 *  what the site knows is newest: the bundle CI published (both commits),
 *  else the site's own iris-iot commit when deployed. */
export function barisPembaruan(
  info: Record<string, unknown> | null | undefined,
  agenVersi: string | null | undefined,
  situsIot: string | null | undefined,
  terbit: Pick<BundelTerbit, "aso" | "iot"> | null = null,
): BarisPembaruan[] {
  const i = info ?? {};
  const protokol = num(i.protokol);
  const b = bacaBundel(agenVersi);
  const apt = obj(i.apt);
  const bisa = apt ? num(apt.bisa) : null;
  const sama = (x: string, y: string) => x.slice(0, 7) === y.slice(0, 7);
  const iotBaru = terbit?.iot ?? (situsIot ? situsIot.slice(0, 7) : null);
  return [
    {
      k: "agen",
      sekarang: protokol === null ? null : String(protokol),
      baru: String(AGEN_PROTOKOL_TERBARU),
      status: protokol !== null && protokol >= AGEN_PROTOKOL_TERBARU ? "terbaru" : "perlu",
      aksi: "pembaruan.bundel",
    },
    {
      k: "bundel",
      sekarang: b.aso,
      baru: terbit?.aso ?? null,
      status: !b.aso ? "tidak_tahu" : terbit && !sama(b.aso, terbit.aso) ? "perlu" : "terbaru",
      aksi: "pembaruan.bundel",
    },
    {
      k: "modul4",
      sekarang: b.iot,
      baru: iotBaru,
      status: !b.iot
        ? "tidak_tahu"
        : !iotBaru || sama(b.iot, iotBaru)
          ? "terbaru"
          : terbit
            ? "perlu"
            : "beda",
      aksi: "pembaruan.bundel",
    },
    {
      k: "apt",
      sekarang: bisa === null ? null : String(bisa),
      baru: null,
      status: bisa === null ? "tidak_tahu" : bisa > 0 ? "perlu" : "terbaru",
      keamanan: apt ? (num(apt.keamanan) ?? 0) : 0,
      aksi: "pembaruan.apt",
    },
  ];
}

/* ------------------------------------------------- One-line install */

/** What the one-line install (public/pasang-pi.sh) reports as it goes, the
 *  step it is starting: the token checked, the bundle, provisioning, then
 *  enrolment (2026-10-08). */
export const TAHAP_PASANG = ["mulai", "bundel", "pasang", "daftar"] as const;
export type TahapPasang = (typeof TAHAP_PASANG)[number];

export interface Pasang {
  tahap: TahapPasang;
  /** The Pi already had an agent: only enrolment, nothing reinstalled. */
  ulang: boolean;
  /** The installer's own failure line, or null while it runs. */
  gagal: string | null;
  /** The first report under this token, and the newest. */
  mulai: string;
  pada: string;
}

export function bacaPasang(raw: unknown): Pasang | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!TAHAP_PASANG.includes(r.tahap as TahapPasang)) return null;
  if (typeof r.mulai !== "string" || typeof r.pada !== "string") return null;
  return {
    tahap: r.tahap as TahapPasang,
    ulang: r.ulang === true,
    gagal: typeof r.gagal === "string" && r.gagal ? r.gagal : null,
    mulai: r.mulai,
    pada: r.pada,
  };
}

/** The wizard's Activation rows: the Pi runs the line, the bundle,
 *  provisioning, the agent's activation, its first heartbeat. */
export const LANGKAH_PASANG = 5;

export interface PosisiPasang {
  /** The row in progress (0 to 4); LANGKAH_PASANG once all are done. */
  langkah: number;
  /** Rows 1 and 2 were skipped: the Pi already had an agent. */
  lewati: boolean;
  gagal: string | null;
}

/** Where an install stands, from its reports, the server's newest enrolment
 *  and its newest heartbeat. A heartbeat only counts after that enrolment,
 *  so a Pi that is moving servers is not "done" by its old beats, and an
 *  enrolment only counts after `perintahPada`, when the wizard made the
 *  command it is waiting on (null: whatever enrolled last). */
export function posisiPasang(
  p: Pasang | null,
  terdaftarPada: string | null,
  denyutPada: string | null,
  perintahPada: number | null = null,
): PosisiPasang {
  const daftar = terdaftarPada ? Date.parse(terdaftarPada) : NaN;
  const beat = denyutPada ? Date.parse(denyutPada) : NaN;
  const sejak = p ? Date.parse(p.mulai) : (perintahPada ?? -Infinity);
  const terdaftar = !Number.isNaN(daftar) && daftar >= sejak;
  if (terdaftar) {
    const aktif = !Number.isNaN(beat) && beat > daftar;
    return { langkah: aktif ? LANGKAH_PASANG : 4, lewati: !!p?.ulang, gagal: null };
  }
  if (!p) return { langkah: 0, lewati: false, gagal: null };
  const langkah = { mulai: 1, bundel: 1, pasang: 2, daftar: 3 }[p.tahap];
  return { langkah: p.ulang && langkah < 3 ? 3 : langkah, lewati: p.ulang, gagal: p.gagal };
}

/** A command sent to the Pi with no report back expires after this long */
export const PERINTAH_TERKIRIM_KEDALUWARSA_MENIT = 5;
/** A command the agent never picked up expires after this long */
export const PERINTAH_MENUNGGU_KEDALUWARSA_MENIT = 30;

/** When a still open command expires (ms), or null once it is settled */
export function perintahHabisPada(p: {
  status: string;
  dimintaPada: string;
  terkirimPada: string | null;
}): number | null {
  if (p.status === "terkirim" && p.terkirimPada)
    return Date.parse(p.terkirimPada) + PERINTAH_TERKIRIM_KEDALUWARSA_MENIT * 60_000;
  if (p.status === "menunggu")
    return Date.parse(p.dimintaPada) + PERINTAH_MENUNGGU_KEDALUWARSA_MENIT * 60_000;
  return null;
}

/** Commands whose output everyone reads: the Ready check and Sync Clock. */
export const AKSI_KELUARAN_UMUM: readonly string[] = ["diag.siap", "jam.selaraskan"];

/**
 * A command list as someone without the full Server view gets it: the
 * command and its status stay, the machine output goes (it can carry logs),
 * except the Ready check's and Sync Clock's.
 */
export function saringKeluaran<T extends { aksi: string; keluaran: string | null }>(
  rows: readonly T[],
  full: boolean,
): T[] {
  if (full) return [...rows];
  return rows.map((r) => (AKSI_KELUARAN_UMUM.includes(r.aksi) ? r : { ...r, keluaran: null }));
}
