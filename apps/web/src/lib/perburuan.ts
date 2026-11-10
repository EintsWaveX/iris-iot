/**
 * The Module 4 Perburuan step (Phase 9, ruled 2026-10-04): the hunt on the
 * PC sends its /ringkas.json through the agent's heartbeat, the heartbeat
 * handler keeps only the newest on the server row, and the step reads one
 * group's slice of it. Shared by api/agent (saring*) and api/session
 * (keadaanPerburuan), so both sides agree on the shape.
 */

import { isObj } from "./guards.js";

/** "belum": the Asisten hasn't pressed Mulai Perburuan yet (2026-10-08). */
export type KeadaanHunt = "belum" | "tunggu" | "buka" | "main" | "selesai";

/** The Asisten's Mulai/Selesai Perburuan for one session (pengaturan). */
export interface PerburuanSesi {
  mulai: string | null;
  selesai: string | null;
  oleh: string | null;
}

export function bacaPerburuanSesi(raw: unknown): PerburuanSesi | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const teks = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { mulai: teks(r.mulai), selesai: teks(r.selesai), oleh: teks(r.oleh) };
}

/** Whether the hunt is open for the session: started and not yet ended. */
export function perburuanBerjalan(p: PerburuanSesi | null): boolean {
  return !!p?.mulai && !p.selesai;
}

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
  /** Today's join code for the scoreboard; only ever handed to the people
   *  the session's own group and Asisten, never to a guest. */
  kode: string | null;
  /** Each group's board key (group number to 8 letters): pasted into HUNT_KEY
   *  in that group's sketches, so only its own boards can feed its hunt. A
   *  group is only ever handed its own. */
  kunci: Record<string, string>;
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
  const kode = typeof raw.kode === "string" && /^[A-Z0-9]{4,12}$/.test(raw.kode) ? raw.kode : null;
  const kunci: Record<string, string> = {};
  if (isObj(raw.kunci)) {
    for (const [nomor, nilai] of Object.entries(raw.kunci).slice(0, MAKS_GRUP)) {
      if (/^[0-9]{1,2}$/.test(nomor) && typeof nilai === "string" && /^[A-Z0-9]{8}$/.test(nilai)) {
        kunci[nomor] = nilai;
      }
    }
  }
  return {
    versi: 1,
    kode,
    kunci,
    sesi: int(raw.sesi, 1, 10),
    mulai: raw.mulai === true,
    selesai: raw.selesai === true,
    berjalan: int(raw.berjalan, 0, 86_400) ?? 0,
    grup,
    penghargaan: isObj(raw.penghargaan) ? raw.penghargaan : null,
    peristiwa,
  };
}

/**
 * Where the scoreboard is reached (2026-11-10): the PC's hunt server behind a
 * Cloudflare Tunnel, so phones stay on their own mobile data and can be
 * carried anywhere. The PC makes no hotspot at all any more.
 */
export const HOST_PERBURUAN = "hunt.irisiotlab.com";

/** The hotspot one group's phone turns on for its Beacon and Hunter. The
 *  name is per group so the sketches (grupN/) can hold it as a constant; the
 *  password is the practicum's shared one, printed in the sketches too. */
export function hotspotKelompok(nomor: number): { ssid: string; sandi: string } {
  return { ssid: `IRIS-G${nomor}`, sandi: "13015954" };
}

/**
 * The link a member opens: the scoreboard plus today's join code in the
 * fragment (never sent to a server or a log). Without a code the link still
 * opens the board, which then asks to be opened from the site.
 */
export function tautanPerburuan(kode: string | null): string {
  return `https://${HOST_PERBURUAN}/${kode ? `#k=${encodeURIComponent(kode)}` : ""}`;
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
 * the hunt's control room (or while no PC has reported for a while),
 * "buka" once it has, "main" once the beacons are on air, "selesai" when
 * the group found its beacon or the round closed.
 */
export function keadaanPerburuan(
  r: Ringkas | null,
  nomor: number,
  p: PerburuanSesi | null = null,
): KeadaanHunt {
  // Locked until the Asisten's Mulai Perburuan; after Selesai the result stays readable
  if (!p?.mulai) return "belum";
  if (p.selesai) return "selesai";
  if (!r || r.sesi === null) return "tunggu";
  const g = r.grup.find((x) => x.grup === nomor);
  if (r.selesai || g?.status === "menang") return "selesai";
  return r.mulai ? "main" : "buka";
}
