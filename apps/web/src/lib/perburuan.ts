/**
 * The Module 4 Perburuan step (Phase 9, ruled 2026-10-04): the hunt on the
 * Pi sends its /ringkas.json through the agent's heartbeat, the heartbeat
 * handler keeps only the newest on the server row, and the step reads one
 * group's slice of it. Shared by api/agent (saring*) and api/session
 * (keadaanPerburuan), so both sides agree on the shape.
 */

export type KeadaanHunt = "tunggu" | "buka" | "main" | "selesai";

export interface AnggotaRingkas {
  nim: string;
  peran: "pemandu" | "pengintai" | "operator" | null;
  hadir: boolean;
}

export interface GrupRingkas {
  grup: number;
  status: string | null;
  heat: string | null;
  rank: number | null;
  durasi: number | null;
  klaimKe: number | null;
  anggota: AnggotaRingkas[];
}

export interface PeristiwaRingkas {
  kind: string;
  grup: number | null;
  at: string;
  t: number;
  durasi?: number;
  heat?: string;
  alasan?: string;
}

export interface Ringkas {
  /** Kept on the stored copy, so reading it back validates the same way. */
  versi: 1;
  sesi: number | null;
  mulai: boolean;
  selesai: boolean;
  berjalan: number;
  grup: GrupRingkas[];
  penghargaan: Record<string, unknown> | null;
  peristiwa: PeristiwaRingkas[];
}

const PERAN = new Set(["pemandu", "pengintai", "operator"]);
const KIND = new Set(["zona", "klaim", "tolak", "ditemukan", "sapuan", "salip", "panggil"]);
const MAKS_GRUP = 10;
const MAKS_ANGGOTA = 12;
const MAKS_PERISTIWA = 60;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A trimmed, known-keys-only copy of the hunt's /ringkas.json, or null. */
export function saringPerburuan(raw: unknown): Ringkas | null {
  if (!isObj(raw) || raw.versi !== 1 || !Array.isArray(raw.grup)) return null;
  const grup: GrupRingkas[] = [];
  for (const g of raw.grup.slice(0, MAKS_GRUP)) {
    if (!isObj(g)) continue;
    const nomor = int(g.grup, 1, MAKS_GRUP);
    if (nomor === null) continue;
    const anggota: AnggotaRingkas[] = [];
    for (const a of Array.isArray(g.anggota) ? g.anggota.slice(0, MAKS_ANGGOTA) : []) {
      if (!isObj(a)) continue;
      const nim = str(a.nim, 20);
      if (!nim) continue;
      const peran = typeof a.peran === "string" && PERAN.has(a.peran) ? a.peran : null;
      anggota.push({ nim, peran: peran as AnggotaRingkas["peran"], hadir: a.hadir === true });
    }
    grup.push({
      grup: nomor,
      status: str(g.status, 20),
      heat: str(g.heat, 20),
      rank: int(g.rank, 1, MAKS_GRUP),
      durasi: int(g.durasi, 0, 86_400),
      // klaim_ke from the hunt, klaimKe when reading the stored copy back.
      klaimKe: int(g.klaim_ke ?? g.klaimKe, 0, 1000),
      anggota,
    });
  }
  const peristiwa: PeristiwaRingkas[] = [];
  for (const e of Array.isArray(raw.peristiwa) ? raw.peristiwa.slice(-MAKS_PERISTIWA) : []) {
    if (!isObj(e) || typeof e.kind !== "string" || !KIND.has(e.kind)) continue;
    const at = str(e.at, 16);
    if (!at) continue;
    const p: PeristiwaRingkas = {
      kind: e.kind,
      grup: int(e.grup, 1, MAKS_GRUP),
      at,
      t: int(e.t, 0, 86_400) ?? 0,
    };
    const durasi = int(e.durasi, 0, 86_400);
    if (durasi !== null) p.durasi = durasi;
    const heat = str(e.heat, 20);
    if (heat) p.heat = heat;
    const alasan = str(e.alasan, 200);
    if (alasan) p.alasan = alasan;
    peristiwa.push(p);
  }
  return {
    versi: 1,
    sesi: int(raw.sesi, 1, 10),
    mulai: raw.mulai === true,
    selesai: raw.selesai === true,
    berjalan: int(raw.berjalan, 0, 86_400) ?? 0,
    grup,
    penghargaan: isObj(raw.penghargaan) ? raw.penghargaan : null,
    peristiwa,
  };
}

/** The hotspot the agent read from the Pi's hostapd file, or null. */
export function saringHotspot(raw: unknown): { ssid: string; sandi: string | null } | null {
  if (!isObj(raw)) return null;
  const ssid = str(raw.ssid, 32);
  if (!ssid) return null;
  return { ssid, sandi: str(raw.sandi, 63) };
}

/** Escapes a value for a WIFI: QR string (backslash before \ ; , : "). */
export function wifiQr(ssid: string, sandi: string | null): string {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
  return sandi ? `WIFI:S:${esc(ssid)};T:WPA;P:${esc(sandi)};;` : `WIFI:S:${esc(ssid)};T:nopass;;`;
}

export interface Penghargaan {
  kunci: "podium" | "pendekat_tercepat" | "tautan_tercepat" | "tautan_terandal";
  posisi?: number;
  nilai?: number;
  satuan?: string;
}

/** The awards one group earned, from the hunt's penghargaan block. */
export function penghargaanKelompok(
  p: Record<string, unknown> | null,
  nomor: number,
): Penghargaan[] {
  if (!p) return [];
  const out: Penghargaan[] = [];
  if (Array.isArray(p.podium)) {
    for (const x of p.podium) {
      if (isObj(x) && x.grup === nomor) {
        out.push({ kunci: "podium", posisi: int(x.posisi, 1, 3) ?? undefined });
      }
    }
  }
  for (const k of ["pendekat_tercepat", "tautan_tercepat", "tautan_terandal"] as const) {
    const x = p[k];
    if (isObj(x) && x.grup === nomor) {
      out.push({
        kunci: k,
        nilai: typeof x.nilai === "number" ? x.nilai : undefined,
        satuan: typeof x.satuan === "string" ? x.satuan : undefined,
      });
    }
  }
  return out;
}

/**
 * Where one group stands. "tunggu" until the Asisten starts a session in
 * the hunt's control room (or while no Pi has reported for a while),
 * "buka" once it has, "main" once the beacons are on air, "selesai" when
 * the group found its beacon or the round closed.
 */
export function keadaanPerburuan(r: Ringkas | null, nomor: number): KeadaanHunt {
  if (!r || r.sesi === null) return "tunggu";
  const g = r.grup.find((x) => x.grup === nomor);
  if (r.selesai || g?.status === "menang") return "selesai";
  return r.mulai ? "main" : "buka";
}
