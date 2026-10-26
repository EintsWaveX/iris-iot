/**
 * The lab check a session start runs (2026-10-05). Before this a session
 * started whatever state the lab was in: a stopped Mosquitto or an offline
 * PC only showed once students hit errors. Pure and free of the database,
 * so the API (api/_lib/siap-mulai.ts) and the console share it.
 *
 * Each check is `ok`, `gagal` or `lewat` (doesn't apply, or can't be known
 * because the PC is offline). A `keras` failure can't be forced past: a
 * closed module and the wrong Mode TOT side were refusals before this and
 * stay so. The rest the Asisten fixes, or forces with a reason.
 */

export type IdCekMulai = "tot" | "modul" | "pc" | "layanan" | "hotspot";

export interface CekMulai {
  id: IdCekMulai;
  status: "ok" | "gagal" | "lewat";
  keras: boolean;
  /** The practicum service this module needs (layanan only). */
  layanan?: string;
  /** The service's state as the PC last reported it (layanan only). */
  keadaan?: string;
  /** Seconds since the PC's last heartbeat (pc only). */
  umurDetik?: number | null;
  /** Hotspot: on now, or queued with this start. */
  diantre?: boolean;
}

/** The service each module needs on the PC. Module 1 is Bluetooth between
 *  the board and a phone and needs nothing there. */
export const LAYANAN_MODUL: Record<number, string> = {
  2: "modul2-ws",
  3: "mosquitto",
  4: "modul4",
};

export interface FaktaMulai {
  modul: number;
  /** The session asked for: a TOT one or a real one. */
  tot: boolean;
  /** Mode TOT's switch right now. */
  modeTot: boolean;
  modulTerbuka: number[];
  butuhAp: boolean;
  /** The one enrolled PC, or null when none (or several) are enrolled. */
  pc: {
    umurDetik: number | null;
    batasLuringDetik: number;
    layanan: Record<string, string> | null;
    modeJaringan: string | null;
  } | null;
}

const aktif = (st: string | undefined) => st === "active" || st === "aktif";

export function cekMulai(f: FaktaMulai): CekMulai[] {
  const out: CekMulai[] = [];
  out.push({ id: "tot", status: f.tot === f.modeTot ? "ok" : "gagal", keras: true });
  // A TOT session may use a closed module on purpose.
  out.push({
    id: "modul",
    status: f.tot || f.modulTerbuka.includes(f.modul) ? "ok" : "gagal",
    keras: true,
  });

  const butuhPc = f.modul in LAYANAN_MODUL;
  const online = !!f.pc && f.pc.umurDetik !== null && f.pc.umurDetik <= f.pc.batasLuringDetik;
  out.push({
    id: "pc",
    status: !butuhPc ? "lewat" : online ? "ok" : "gagal",
    keras: false,
    umurDetik: f.pc?.umurDetik ?? null,
  });

  const unit = LAYANAN_MODUL[f.modul];
  const keadaan = unit ? f.pc?.layanan?.[unit] : undefined;
  out.push({
    id: "layanan",
    status: !unit || !online ? "lewat" : aktif(keadaan) ? "ok" : "gagal",
    keras: false,
    layanan: unit,
    keadaan: keadaan ?? (unit && online ? "tidak dilaporkan" : undefined),
  });

  // No hotspot check (2026-10-08): Module 4 starts with the hotspot off, and
  // the Asisten's Mulai Perburuan turns it on later in the session.
  return out;
}

/** What still stands in the way: hard failures first. */
export function gagalMulai(cek: CekMulai[]): { keras: CekMulai[]; lunak: CekMulai[] } {
  const g = cek.filter((c) => c.status === "gagal");
  return { keras: g.filter((c) => c.keras), lunak: g.filter((c) => !c.keras) };
}

/** A forcing reason has to say something. */
export const ALASAN_PAKSA_MIN = 5;
