/**
 * One person's teaching attendance for the semester (Phase 18): six counts,
 * the cuts, and every late, missed, excused or forgotten session with what
 * happened. Shared by the Tim drawer (`nim`) and the Akun card (`saya`).
 * Data: GET /api/session/hadirrekap, Asisten only.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { StatusLive } from "../../lib/hadir-mengajar";
import { useSiaran } from "../../lib/siaran";
import { jamWib, tanggalWib } from "./data";
import { H, rpPendek } from "./hadirStrings";
import "./HadirRingkas.css";

export interface RiwayatHadirOrang {
  sesiId: number;
  tanggal: string;
  slot: number | null;
  status: StatusLive;
  menit: number | null;
  hadirPada: string | null;
  potong: number;
  nolkanUnit: boolean;
  hitungMangkir: boolean;
  alasan: string | null;
}

export interface RiwayatNilaiOrang {
  sesiId: number;
  tanggal: string;
  slot: number | null;
  modul: number;
  nomor: number;
  kurang: ("kirim" | "seelabs")[];
  dicatatPada: string;
  menyusulPada: string | null;
}

export interface RekapOrang {
  tepat: number;
  telat: number;
  mm: number;
  mangkir: number;
  izin: number;
  potong: number;
  sesiNol: number;
  lupa: number;
  lupaMenyusul: number;
  riwayat: RiwayatHadirOrang[];
  nilai: RiwayatNilaiOrang[];
}

const KOSONG: RekapOrang = {
  tepat: 0,
  telat: 0,
  mm: 0,
  mangkir: 0,
  izin: 0,
  potong: 0,
  sesiNol: 0,
  lupa: 0,
  lupaMenyusul: 0,
  riwayat: [],
  nilai: [],
};

/** Loads one person's counts; `null` while loading, `"gagal"` when the request failed. */
export function useHadirOrang(query: string | null, enabled = true): RekapOrang | "gagal" | null {
  const [data, setData] = useState<RekapOrang | "gagal" | null>(null);
  const muat = useCallback(() => {
    if (!query || !enabled) return;
    getJson<{
      ok: boolean;
      orang: ({ nim: string } & Omit<RekapOrang, "riwayat" | "nilai">)[];
      riwayat?: RiwayatHadirOrang[];
      lupa?: RiwayatNilaiOrang[];
    }>(`/api/session/hadirrekap?${query}`)
      .then((d) => {
        if (!d.ok) return setData("gagal");
        const o = d.orang[0];
        setData({
          ...KOSONG,
          ...(o ?? {}),
          riwayat: d.riwayat ?? [],
          nilai: d.lupa ?? [],
        });
      })
      .catch(() => setData("gagal"));
  }, [query, enabled]);
  useEffect(() => {
    setData(null);
    muat();
  }, [muat]);
  useSiaran(["hadir", "sesi", "laporan"], muat, enabled && !!query);
  return data;
}

/** The tile labels, in the order of the mockup. */
function ubin(lang: Lang, r: RekapOrang) {
  const t = H[lang];
  return [
    { l: t.colOnTime, n: r.tepat, tone: "ok" },
    { l: t.colLate, n: r.telat, tone: "warn" },
    { l: t.colMm, n: r.mm, tone: "danger" },
    { l: t.colMangkir, n: r.mangkir, tone: "danger" },
    { l: t.colExcused, n: r.izin, tone: "violet" },
    { l: t.colLupa, n: r.lupa, tone: "warn" },
  ] as const;
}

type Baris = { tgl: string; tone: "warn" | "danger" | "violet"; teks: string; urut: string };

function barisRiwayat(lang: Lang, r: RekapOrang): Baris[] {
  const t = H[lang];
  const out: Baris[] = [];
  for (const x of r.riwayat) {
    const sesi = t.evSession(x.slot);
    const jam = x.hadirPada ? jamWib(x.hadirPada) : "";
    let tone: Baris["tone"] = "warn";
    let teks: string;
    if (x.status === "telat") teks = t.evLate(x.menit ?? 0, x.potong ? rpPendek(x.potong) : "");
    else if (x.status === "mm") {
      tone = "danger";
      teks = t.evMm(jam, x.nolkanUnit, rpPendek(x.potong));
    } else if (x.status === "mangkir") {
      tone = "danger";
      teks = t.evMangkir;
    } else if (x.status === "izin") {
      tone = "violet";
      teks = t.evIzin;
    } else teks = t.evNotHere;
    out.push({
      tgl: tanggalPanjang(x.tanggal, lang),
      tone,
      teks: `${sesi} · ${teks}`,
      urut: `${x.tanggal}-${String(x.slot ?? 9)}`,
    });
  }
  for (const x of r.nilai) {
    const sesi = t.evSession(x.slot);
    const kurang =
      x.kurang.length === 2
        ? t.kurangBoth
        : x.kurang[0] === "kirim"
          ? t.kurangKirim
          : t.kurangSeelabs;
    const kapan = x.menyusulPada
      ? `${tanggalPanjang(tanggalWib(x.menyusulPada), lang)} ${jamWib(x.menyusulPada)}`
      : "";
    out.push({
      tgl: tanggalPanjang(x.tanggal, lang),
      tone: "warn",
      teks: `${sesi} · ${x.menyusulPada ? t.evLupaLate(x.nomor, kapan) : t.evLupa(x.nomor, kurang)}`,
      urut: `${x.tanggal}-${String(x.slot ?? 9)}-${x.nomor}`,
    });
  }
  return out.sort((a, b) => (a.urut < b.urut ? 1 : a.urut > b.urut ? -1 : 0));
}

export default function HadirRingkas({
  lang,
  data,
}: {
  lang: Lang;
  data: RekapOrang | "gagal" | null;
}) {
  const t = H[lang];
  if (data === null) return <span className="skeleton" style={{ height: 150 }} />;
  if (data === "gagal") return <p className="hint">{t.loadFail}</p>;
  const baris = barisRiwayat(lang, data);
  return (
    <div className="hadir-rk">
      <div className="hadir-rk__tiles">
        {ubin(lang, data).map((u) => (
          <span key={u.l} className="hadir-rk__tile" data-tone={u.n ? u.tone : undefined}>
            <b className="num">{u.n}</b>
            <span>{u.l}</span>
          </span>
        ))}
      </div>
      <div className="hadir-rk__line">
        <span>{t.cutsLine}</span>
        <b className="num">
          {data.potong > 0 || data.sesiNol > 0
            ? [
                data.potong > 0 ? rpPendek(data.potong) : "",
                data.sesiNol > 0 ? t.unpaid(data.sesiNol) : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : t.noCuts}
        </b>
      </div>
      {baris.length === 0 ? (
        <p className="hint">{t.listEmpty}</p>
      ) : (
        <ol className="hadir-rk__ev">
          {baris.map((b, i) => (
            <li key={`${b.urut}-${i}`} data-tone={b.tone}>
              <span className="hadir-rk__tgl">{b.tgl}</span>
              <span>{b.teks}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
