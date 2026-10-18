/**
 * LMS › Kalender: TP windows and module weeks go into every class's LMS
 * calendar and move when the schedule moves. Praktikan never see a slot,
 * a group or an Asisten there: only the window and the week. A month grid
 * shows them; the list says where each one is.
 */
import { useMemo, useState } from "react";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import { Switch } from "../ui/Controls";
import { getJson, localeOf, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";
import { BatchDialog, Head, Rentang, galatTeks, langkah } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

interface Acara {
  kunci: string;
  nama: { id: string; en: string };
  mulai: string;
  selesai: string;
  jenis: "tp" | "modul";
  modul: number;
  di: number;
  lama: number;
}
interface DataKalender {
  ok: boolean;
  kode?: string;
  acara: Acara[];
  kelasJumlah: number;
  otomatis: boolean;
  boleh: boolean;
}

/** "2026-10-14" in WIB. */
const tglWib = (iso: string) =>
  new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

export default function KalenderTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const poll = usePoll(() => getJson<DataKalender>("/api/lms/kalender"), 300_000, true, [
    "lms",
    "tp",
  ]);
  const d = poll.data;
  const hariIni = tglWib(new Date().toISOString());
  const [bulan, setBulan] = useState(hariIni.slice(0, 7));
  const [auto, setAuto] = useState<boolean | null>(null);
  const [jalan, setJalan] = useState(false);
  const [kursus, setKursus] = useState<{ id: number; label: string }[]>([]);
  const sel = useMemo(() => {
    const [y, m] = bulan.split("-").map(Number);
    const awal = new Date(Date.UTC(y, m - 1, 1));
    const lead = (awal.getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      y,
      m,
      lead,
      n,
      judul: awal.toLocaleDateString(localeOf(lang), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  }, [bulan, lang]);
  if (!d) return <span className="skeleton" style={{ height: 520 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;
  const geser = (n: number) => {
    const x = new Date(Date.UTC(sel.y, sel.m - 1 + n, 1));
    setBulan(x.toISOString().slice(0, 7));
  };
  const otomatis = auto ?? d.otomatis;
  const setOto = async (v: boolean) => {
    setAuto(v);
    const r = await postJson<{ ok: boolean }>("/api/lms/otomatis", {
      kunci: "kalender",
      nyala: v,
    }).catch(() => ({ ok: false }));
    if (!r.ok) setAuto(!v);
    poll.refresh();
  };
  const samakan = async () => {
    // The class list comes with the overview; Kalender only needs ids.
    const r = await getJson<{ ok: boolean; perKursus?: { id: number; label: string }[] }>(
      "/api/lms/ringkas",
    ).catch(() => null);
    setKursus(r?.perKursus ?? []);
    setJalan(true);
  };
  const nama = (a: Acara) => (lang === "en" ? a.nama.en : a.nama.id);
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      <div className="lms-two lms-two--cal">
        <section className="panel slr-card">
          <Head
            title={sel.judul}
            aside={
              <span className="row" style={{ gap: 6 }}>
                <IconButton icon={CaretLeftIcon} label={t.bulanLalu} onClick={() => geser(-1)} />
                <IconButton icon={CaretRightIcon} label={t.bulanDepan} onClick={() => geser(1)} />
              </span>
            }
          />
          <div className="lms-cal" role="grid">
            {t.hariPendek.map((h) => (
              <span key={h} className="lms-cal__h">
                {h}
              </span>
            ))}
            {Array.from({ length: sel.lead }, (_, i) => (
              <span key={`k${i}`} />
            ))}
            {Array.from({ length: sel.n }, (_, i) => {
              const tgl = `${bulan}-${String(i + 1).padStart(2, "0")}`;
              const kol = (sel.lead + i) % 7;
              return (
                <span
                  key={tgl}
                  className="lms-cal__d"
                  data-today={tgl === hariIni ? "yes" : undefined}
                >
                  <b>{i + 1}</b>
                  {d.acara
                    .filter((a) => tglWib(a.mulai) <= tgl && tglWib(a.selesai) >= tgl)
                    .map((a) => {
                      const awal = tglWib(a.mulai) === tgl;
                      return (
                        <i key={a.kunci} data-k={a.jenis} title={nama(a)}>
                          {awal || kol === 0 ? nama(a) : ""}
                        </i>
                      );
                    })}
                </span>
              );
            })}
          </div>
          <div className="row lms-legend">
            <span>
              <i data-k="tp" />
              {t.jendelaTp}
            </span>
            <span>
              <i data-k="modul" />
              {t.mingguModul}
            </span>
          </div>
        </section>
        <section className="panel slr-card">
          <Head title={t.acaraH} desc={t.acaraHint} />
          {d.acara.length ? (
            <ul className="lms-ext lms-ext--when">
              {d.acara.map((a) => (
                <li key={a.kunci}>
                  <b>{nama(a)}</b>
                  <Pill tone={a.di === d.kelasJumlah ? "ok" : a.lama ? "warn" : undefined}>
                    {a.di ? t.diKelas(a.di, d.kelasJumlah) : a.lama ? t.acaraLama : t.belum}
                  </Pill>
                  <Rentang
                    a={a.mulai}
                    b={a.selesai}
                    la={t.acaraMulai}
                    lb={t.acaraSelesai}
                    lang={lang}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t.acaraKosong}</p>
          )}
          <label className="slr-agree">
            <span className="stack stack--sm">
              <b>{t.otoKal}</b>
              <span className="hint">{t.otoKalHint}</span>
            </span>
            {d.boleh ? (
              <Switch on={otomatis} onChange={(v) => void setOto(v)} label={t.otoKal} />
            ) : (
              <Pill tone={otomatis ? "ok" : undefined}>{otomatis ? t.otoAktif : t.otoMati}</Pill>
            )}
          </label>
          {d.boleh && (
            <div className="slr-acts">
              <button
                type="button"
                className="btn"
                disabled={!d.acara.length}
                onClick={() => void samakan()}
              >
                {t.samakanSekarang}
              </button>
            </div>
          )}
        </section>
      </div>
      <BatchDialog
        open={jalan}
        onOpenChange={setJalan}
        lang={lang}
        title={t.kalJalan}
        kursus={kursus}
        jalan={(id) => langkah("/api/lms/kalender", { kursus: id })}
        selesai={t.kalOk}
        onDone={poll.refresh}
      />
    </div>
  );
}
