/**
 * The TP calendar (2026-10-21, the LMS Kalender's, inside IRIS now): a month
 * grid of each module's TP window and practicum week and the weeks without
 * practicum, with what comes next beside it. Asisten open it from Jadwal;
 * Praktikan see it on the Dasbor with their own close and practicum day.
 * A date picks itself to list its events (the grid's bars carry no words
 * on a phone). GET /api/tp/kalender.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import IconButton from "../ui/IconButton";
import { getJson, localeOf, tanggalPanjang } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Topik } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import {
  acaraPada,
  bulanGrid,
  geserBulan,
  type Acara,
  type JenisAcara,
} from "../../lib/tp-kalender";
import { waktuPanjang } from "./shared";
import { KAL } from "./kalenderStrings";

interface DataKalender {
  ok: boolean;
  semester: string;
  hariIni: string;
  acara: Acara[];
}

export function useKalender(enabled: boolean, topics: Topik[]) {
  return usePoll(
    () => getJson<DataKalender>("/api/tp/kalender").then((d) => (d.ok ? d : null)),
    300_000,
    enabled,
    topics,
  );
}

const JENIS: JenisAcara[] = ["tp", "modul", "praktikum", "tunda"];

/** Jadwal › Kalender, every Asisten's. */
export function KalenderAsisten({ lang }: { lang: Lang }) {
  const poll = useKalender(true, ["tp", "jadwal"]);
  return <KalenderTp lang={lang} data={poll.data} tanpaKepala />;
}

/** The Dasbor's, a Praktikan's own. */
export function KalenderKu({ lang }: { lang: Lang }) {
  const poll = useKalender(true, ["tp", "jadwal"]);
  return <KalenderTp lang={lang} data={poll.data} pribadi />;
}

export default function KalenderTp({
  lang,
  data,
  pribadi = false,
  tanpaKepala = false,
}: {
  lang: Lang;
  data: DataKalender | null;
  /** A Praktikan's own calendar (its own title and lede). */
  pribadi?: boolean;
  /** The page's own heading names it (Jadwal › Kalender). */
  tanpaKepala?: boolean;
}) {
  const t = KAL[lang];
  const hariIni = data?.hariIni ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [bulan, setBulan] = useState(hariIni.slice(0, 7));
  const [pilih, setPilih] = useState<string | null>(null);
  const g = useMemo(() => bulanGrid(bulan), [bulan]);
  const namaBulan = new Date(Date.UTC(g.y, g.m - 1, 1)).toLocaleDateString(localeOf(lang), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const acara = data?.acara ?? [];

  const nama = (a: Acara) =>
    a.jenis === "tp"
      ? t.tp(a.modul!)
      : a.jenis === "modul"
        ? t.modul(a.modul!)
        : a.jenis === "praktikum"
          ? t.praktikum(a.modul!)
          : t.tunda;
  const rincian = (a: Acara) => {
    if (a.jenis === "tp")
      return `${t.bukaTutup(waktuPanjang(a.buka!, lang), waktuPanjang(a.tutup!, lang))}${
        a.panjang ? ` (${t.diperpanjang})` : ""
      }`;
    if (a.jenis === "praktikum")
      return `${t.pada(tanggalPanjang(a.dari, lang), a.jam ?? "")}${a.libur ? ` (${t.libur})` : ""}`;
    return t.sampai(tanggalPanjang(a.dari, lang), tanggalPanjang(a.sampai, lang));
  };
  const gaya = (a: Acara) =>
    (a.modul ? { "--m": `var(--mod-${a.modul})` } : undefined) as CSSProperties | undefined;

  const berikut = acara.filter((a) => a.sampai >= hariIni).slice(0, 6);
  const diPilih = pilih ? acaraPada(acara, pilih) : [];
  // The legend names only what this semester has.
  const jenisAda = JENIS.filter((j) => acara.some((a) => a.jenis === j));

  return (
    <section className="panel tpkal">
      {!tanpaKepala && (
        <div className="panel__head">
          <h2 className="panel__title">{pribadi ? t.judulKu : t.judul}</h2>
          <span className="hint">{pribadi ? t.ledeKu : t.lede}</span>
        </div>
      )}
      {!data ? (
        <span className="skeleton" style={{ height: 360 }} />
      ) : (
        <div className="tpkal__body">
          <div className="stack">
            <div className="row tpkal__nav">
              <b className="tpkal__bulan" aria-live="polite">
                {namaBulan}
              </b>
              {bulan !== hariIni.slice(0, 7) && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setBulan(hariIni.slice(0, 7))}
                >
                  {t.bulanIni}
                </button>
              )}
              <IconButton
                icon={CaretLeftIcon}
                label={t.bulanLalu}
                onClick={() => setBulan(geserBulan(bulan, -1))}
              />
              <IconButton
                icon={CaretRightIcon}
                label={t.bulanDepan}
                onClick={() => setBulan(geserBulan(bulan, 1))}
              />
            </div>
            <div className="tpkal__grid" role="grid" aria-label={namaBulan}>
              <div className="tpkal__wk" role="row">
                {t.hariPendek.map((h) => (
                  <span key={h} className="tpkal__h" role="columnheader">
                    {h}
                  </span>
                ))}
              </div>
              {Array.from({ length: Math.ceil((g.lead + g.n) / 7) }, (_, w) => (
                <div key={w} className="tpkal__wk" role="row">
                  {Array.from({ length: 7 }, (_, c) => {
                    const i = w * 7 + c - g.lead;
                    if (i < 0 || i >= g.n) return <span key={c} role="gridcell" />;
                    const tgl = `${bulan}-${String(i + 1).padStart(2, "0")}`;
                    const ini = acaraPada(acara, tgl);
                    return (
                      <span key={c} role="gridcell">
                        <button
                          type="button"
                          className="tpkal__d"
                          data-today={tgl === hariIni ? "yes" : undefined}
                          data-libur={c === 6 ? "yes" : undefined}
                          aria-pressed={pilih === tgl}
                          aria-label={[tanggalPanjang(tgl, lang), ...ini.map(nama)].join(", ")}
                          onClick={() => setPilih(pilih === tgl ? null : tgl)}
                        >
                          <b>{i + 1}</b>
                          {ini.map((a) => (
                            <i
                              key={a.kunci}
                              data-k={a.jenis}
                              data-awal={a.dari === tgl || c === 0 ? "yes" : undefined}
                              data-akhir={a.sampai === tgl || c === 6 ? "yes" : undefined}
                              data-off={a.libur ? "yes" : undefined}
                              style={gaya(a)}
                            >
                              {(a.dari === tgl || c === 0) && <span>{nama(a)}</span>}
                            </i>
                          ))}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="row tpkal__legend">
              {jenisAda.map((j) => (
                <span key={j}>
                  <i data-k={j} aria-hidden="true" />
                  {t.legend[j]}
                </span>
              ))}
            </div>
            <div className="tpkal__hari" aria-live="polite">
              {pilih ? (
                <>
                  <b>{tanggalPanjang(pilih, lang)}</b>
                  {diPilih.length ? (
                    <ul className="tpkal__list">
                      {diPilih.map((a) => (
                        <Baris
                          key={a.kunci}
                          a={a}
                          nama={nama(a)}
                          rincian={rincian(a)}
                          gaya={gaya(a)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <span className="hint">{t.hariKosong}</span>
                  )}
                </>
              ) : (
                <span className="hint">{t.pilihHari}</span>
              )}
            </div>
          </div>
          <div className="stack tpkal__next">
            <h3 className="tpkal__sub">{t.berikutnya}</h3>
            {!acara.length ? (
              <p className="hint">{t.kosong}</p>
            ) : berikut.length ? (
              <ul className="tpkal__list">
                {berikut.map((a) => (
                  <Baris
                    key={a.kunci}
                    a={a}
                    nama={nama(a)}
                    rincian={rincian(a)}
                    gaya={gaya(a)}
                    kini={a.dari <= hariIni}
                    hariIni={t.hariIni}
                    onPick={() => {
                      setBulan(a.dari.slice(0, 7));
                      setPilih(a.dari < hariIni ? hariIni : a.dari);
                    }}
                  />
                ))}
              </ul>
            ) : (
              <p className="hint">{t.kosongBerikut}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Baris({
  a,
  nama,
  rincian,
  gaya,
  kini,
  hariIni,
  onPick,
}: {
  a: Acara;
  nama: string;
  rincian: string;
  gaya: CSSProperties | undefined;
  kini?: boolean;
  hariIni?: string;
  onPick?: () => void;
}) {
  const isi = (
    <>
      <i data-k={a.jenis} data-off={a.libur ? "yes" : undefined} style={gaya} aria-hidden="true" />
      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
        <b>
          {nama}
          {kini && hariIni ? <span className="tpkal__kini"> · {hariIni}</span> : null}
        </b>
        <span className="hint">{rincian}</span>
      </span>
    </>
  );
  return (
    <li>
      {onPick ? (
        <button type="button" className="tpkal__item" onClick={onPick}>
          {isi}
        </button>
      ) : (
        <span className="tpkal__item">{isi}</span>
      )}
    </li>
  );
}
