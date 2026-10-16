/**
 * Phase 18, Yang Mengajar Slot Ini (mockup k18-mengajar): the slot's clock as
 * a track (on time, ten paid minutes, past the limit) with a dot for each
 * Asisten who checked in and a now line, plus the status pill and pay line of
 * one row. The rule itself is in src/lib/hadir-mengajar.ts; the rows come from
 * GET /api/session/hadir (`hadir`).
 */
import { useEffect, useState } from "react";
import Pill from "../ui/Pill";
import { jamMenit } from "../../lib/app";
import { POTONGAN_AWAL, type Potongan } from "../../lib/hadir-mengajar";
import type { StatusLive } from "../../lib/hadir-mengajar";
import type { Strings } from "./strings";

export interface BarisHadir {
  nim: string;
  kode: string;
  nama: string;
  diharapkan: boolean;
  izin: boolean;
  hadirPada: string | null;
  status: StatusLive;
  menit: number | null;
  potong: number;
  nolkanUnit: boolean;
  hitungMangkir: boolean;
  ubah: {
    status: "tepat" | "telat" | "mm" | "mangkir" | "izin";
    menit: number | null;
    alasan: string | null;
    oleh: string | null;
  } | null;
}

export interface HadirSlot {
  kunci: string;
  /** The clock now in force (ISO), a PJ's shift included. */
  base: string;
  geser: { dari: string; alasan: string } | null;
  pj: string | null;
  bolehPj: boolean;
  baris: BarisHadir[];
  /** The cut setting in force; POTONGAN_AWAL only while this loads. */
  potongan?: Potongan;
  ambilAlih: { nim: string; kelompok: number | null; oleh: string; pada: string }[];
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
export const rupiahSingkat = rp;

const TONE: Partial<Record<StatusLive, "ok" | "warn" | "danger" | "violet">> = {
  tepat: "ok",
  telat: "warn",
  mm: "danger",
  mangkir: "danger",
  izin: "violet",
  berjalan: "warn",
  lewat: "danger",
};

type Hd = Strings["lp"]["hd"];

/** The words of one status ("Telat 4 Menit"); "lepas" has none. */
export function labelStatus(h: Hd, s: StatusLive, menit: number | null): string {
  switch (s) {
    case "tepat":
      return h.sTepat;
    case "telat":
      return h.sTelat(menit ?? 0);
    case "mm":
      return h.sMm;
    case "mangkir":
      return h.sMangkir;
    case "izin":
      return h.sIzin;
    case "berjalan":
      return h.sBerjalan(menit ?? 0);
    case "lewat":
      return h.sLewat;
    default:
      return h.sBelum;
  }
}

/** What a status does to pay, with the tone of the line. */
export function bayarBaris(
  h: Hd,
  x: { status: StatusLive; menit: number | null; potong: number; nolkanUnit: boolean },
  p: Potongan = POTONGAN_AWAL,
): { tx: string; tone: "ok" | "warn" | "danger" | "" } {
  if (x.nolkanUnit) return { tx: h.pNol, tone: "danger" };
  if (x.status === "izin") return { tx: h.pIzin, tone: "" };
  if (x.status === "tepat") return { tx: h.pTepat, tone: "ok" };
  if (x.status === "berjalan")
    return { tx: h.pBerjalan(rp((x.menit ?? 0) * p.perMenit)), tone: "warn" };
  if (x.status === "lewat") return { tx: h.pLewat, tone: "danger" };
  if (x.potong > 0) return { tx: h.pCut(rp(x.potong)), tone: "warn" };
  return { tx: "", tone: "" };
}

export function StatusPill({ h, s, menit }: { h: Hd; s: StatusLive; menit: number | null }) {
  return (
    <Pill tone={TONE[s]} className="hadirst">
      {labelStatus(h, s, menit)}
    </Pill>
  );
}

/** The wall clock to the second, ticking once a second. */
export function useNowDetik(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function HadirTrack({
  h,
  hadir,
}: {
  h: Hd;
  hadir: Pick<HadirSlot, "base" | "geser" | "baris" | "potongan">;
}) {
  const now = useNowDetik();
  const base = new Date(hadir.base).getTime();
  const masuk = hadir.baris.filter((b) => b.hadirPada && b.diharapkan);
  const xs = masuk.map((b) => new Date(b.hadirPada!).getTime());
  const a = Math.min(base - 600_000, ...xs) - 120_000;
  const b = Math.max(base + 900_000, now + 120_000);
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - a) / (b - a)) * 100));
  const jam = (x: number) => jamMenit(new Date(x));
  const telat0 = pos(base + 60_000);
  const lewat0 = pos(base + 660_000);
  return (
    <div className="hadirtrack">
      <div
        className="hadirtrack__bar"
        role="img"
        aria-label={h.trackLabel(jam(base), jam(base + 600_000))}
      >
        <i className="hadirtrack__z" data-z="tepat" style={{ width: `${telat0}%` }} />
        <i
          className="hadirtrack__z"
          data-z="telat"
          style={{ left: `${telat0}%`, width: `${lewat0 - telat0}%` }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <b key={i} data-on={now >= base + 60_000 * (i + 1) ? "yes" : undefined} />
          ))}
        </i>
        <i className="hadirtrack__z" data-z="lewat" style={{ left: `${lewat0}%`, right: 0 }} />
        {masuk.map((m, i) => (
          <span
            key={m.nim}
            className="hadirtrack__dot"
            data-s={m.status}
            style={{ left: `${pos(xs[i])}%` }}
            title={`${m.kode} ${jam(xs[i])}`}
          >
            {m.kode}
          </span>
        ))}
        {now >= a && now <= b && (
          <span className="hadirtrack__now" style={{ left: `${pos(now)}%` }} />
        )}
      </div>
      <div className="hadirtrack__ticks" aria-hidden="true">
        {[base, base + 660_000].map((x) => (
          <span key={x} className="mono" style={{ left: `${pos(x)}%` }}>
            {jam(x)}
          </span>
        ))}
      </div>
      <div className="hadirtrack__legend">
        <span data-z="tepat">{h.zTepat}</span>
        <span data-z="telat">{h.zTelat(rp((hadir.potongan ?? POTONGAN_AWAL).perMenit))}</span>
        <span data-z="lewat">{h.zLewat}</span>
      </div>
      {hadir.geser && <p className="hint">{h.shifted(hadir.geser.dari, hadir.geser.alasan)}</p>}
    </div>
  );
}
