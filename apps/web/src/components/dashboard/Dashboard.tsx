/**
 * /dashboard (Phase 10, mockup d10-dasbor, d10-summary, d10-states; the
 * feedback page from Phase 9's p-feedback): the Praktikan's home, one
 * island with three views.
 *
 * - The dashboard by state, under the group's star path (Modules 1 to 4:
 *   done, now, next, not open yet). In their session, the ground station:
 *   the cockpit (session clock, next step from langkahBerikutnya, three
 *   segmented meters), the module's live instrument, the session log, the
 *   group and the module's materials. Just after it ended: this session's
 *   result and the feedback prompt. Outside a session: every practicum.
 *   Nothing yet: a waiting card. Never a schedule (Praktikan never see one).
 * - `?view=summary&session=N`: the session summary. It opens by itself the
 *   moment the Asisten ends the running session.
 * - `?view=feedback&session=N`: the feedback page.
 */
import { isNimTot } from "../../lib/tot";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CaretDownIcon,
  ArrowRightIcon,
  ArrowClockwiseIcon,
  BookOpenTextIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  CheckIcon,
  CircuitryIcon,
  DownloadSimpleIcon,
  PresentationChartIcon,
  SignInIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { StateView } from "../ui/Display";
import Pill from "../ui/Pill";
import BackButton from "../ui/BackButton";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  menitBerjalan,
  tanggalPanjang,
  useMe,
  useSessionNow,
  useTick,
  type SesiNow,
} from "../../lib/app";
import { useAliranAtauTopik } from "../../lib/aliran-ruang";
import { usePoll } from "../../lib/hooks";
import { openSignIn } from "../../lib/signin";
import { bacaProyektor, useProyektor } from "../../lib/proyektor";
import { hariIniWib } from "../../lib/jadwal";
import { langkahBerikutnya, type Langkah } from "../../lib/langkah";
import { NILAI_KOMPONEN } from "../../lib/nilai-komponen";
import { namaAsisten } from "../../lib/people";
import { getAksesState } from "../../scripts/modul-akses";
import { readSetup } from "../module/SetupChecklist";
import { CaptureList, useTangkapan } from "../live/Capture";
import { rataJurnal, type JRow } from "../../lib/jurnal-tabel";
import { bahasaKonten, type Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import {
  Arc,
  Cells,
  IdleClock,
  Instrument,
  Journey,
  journeyFrom,
  MissionClock,
  Readout,
  SessionLog,
  Trace,
  type LogItem,
  type Stop,
} from "../shared/Instruments";
import FeedbackForm from "./FeedbackForm";
import CoachMarks from "./CoachMarks";
import { DS, type DashT } from "./dashStrings";
import SlidesDialog, { useSlides } from "../shell/SlidesDialog";
import "../ui/Display.css";
import "./Dashboard.css";
import Nil from "../ui/Nil";
import { useTpSaya, type TpSaya } from "../tp/shared";
import { TpKartu, TpRincian } from "../tp/TpDash";
import { TPS } from "../tp/tpStrings";

export interface ModulInfo {
  modul: number;
  judul: string;
  topik: string;
  persiapan: number;
  berkas: { slug: string; blanks: number }[];
}

export interface Hasil {
  ok: boolean;
  sesi?: {
    id: number;
    modul: number;
    status: string;
    kelas: string;
    tanggal: string;
    selesaiPada: string | null;
  };
  asisten?: { kode: string; nama: string } | null;
  pilihanAsisten?: string[];
  pilihanOrang?: { kode: string; nama: string }[];
  sudahUmpanBalik?: boolean;
  kelompok?: { nomor: number; anggota: string[] } | null;
  blank?: { benar: number; total: number };
  tangkapan?: number;
  delayRata?: number | null;
  linimasa?: LogItem[];
  skor?: Partial<Record<string, number>> | null;
  rataRata?: number | null;
  lengkap?: boolean;
}

interface Praktikum {
  sesiId: number;
  modul: number;
  tanggal: string;
  status: string;
  sudahUmpanBalik: boolean;
  rataRata: number | null;
  /** Their group's scores were sent (Kirim Nilai); only then `skor`. */
  terkirim?: boolean;
  skor?: Partial<Record<string, number>> | null;
}

type View =
  { v: "home" } | { v: "summary"; sesi: number; ended?: boolean } | { v: "feedback"; sesi: number };

/** Which journal column each module's captured-data trace follows. */
const TRACE_KEY: Record<number, { key: string; min: number; max: number; unit: string }> = {
  1: { key: "oneway", min: 0, max: 100, unit: " ms" },
  2: { key: "temp", min: 20, max: 35, unit: "°C" },
  3: { key: "pos", min: 0, max: 100, unit: "%" },
  4: { key: "rssi", min: -120, max: -50, unit: "" },
};

function readView(): View {
  const q = new URLSearchParams(location.search);
  const sesi = Number(q.get("session"));
  if (q.get("view") === "summary" && sesi > 0) return { v: "summary", sesi };
  if (q.get("view") === "feedback" && sesi > 0) return { v: "feedback", sesi };
  return { v: "home" };
}

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>({ v: "home" });
  useEffect(() => {
    setView(readView());
    const on = () => setView(readView());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  function go(v: View) {
    const q = new URLSearchParams(location.search);
    q.delete("view");
    q.delete("session");
    q.delete("feedback");
    if (v.v !== "home") {
      q.set("view", v.v);
      q.set("session", String(v.sesi));
    }
    const s = q.toString();
    history.pushState(null, "", `${location.pathname}${s ? `?${s}` : ""}`);
    setView(v);
    window.scrollTo({ top: 0 });
  }
  return [view, go];
}

/** Saves each of a module's sketches the group completed. */
async function unduhSketsa(info: ModulInfo, lang: Lang) {
  for (const b of info.berkas) {
    try {
      const r = await fetch(
        `/api/modul/unduh?modul=${info.modul}&berkas=${b.slug}&bahasa=${bahasaKonten(lang)}`,
      );
      if ((r.headers.get("Content-Type") ?? "").includes("json")) continue;
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name ?? b.slug;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* one file failing leaves the others */
    }
  }
}

/* ------------------------------------------------------------ cards */

function GroupCard({ t, hasil, me }: { t: DashT; hasil: Hasil | null; me: string }) {
  const k = hasil?.kelompok;
  return (
    <section className="panel dash__card">
      <div className="panel__head">
        <h2 className="panel__title">{t.groupH}</h2>
      </div>
      {k ? (
        <>
          <ul className="crew">
            {k.anggota.map((n) => (
              <li key={n} data-me={n === me ? "yes" : "no"}>
                <span className="crew__star" aria-hidden="true" />
                <span className="grow">{n}</span>
                {n === me && <Pill>{t.kamu}</Pill>}
              </li>
            ))}
          </ul>
          <span className="hint">
            {t.asistenLine(hasil?.asisten ? namaAsisten(hasil.asisten) : t.belumAda)}
          </span>
        </>
      ) : (
        <span className="skeleton" style={{ height: 72 }} />
      )}
    </section>
  );
}

/** The session module's materials: its slides (shell/SlidesDialog), the
 *  module itself and its wiring schematic (the Code step's Pin dan Skema). */
function MaterialsCard({ t, lang, modul }: { t: DashT; lang: Lang; modul: number }) {
  const { list, loaded } = useSlides(modul);
  const [open, setOpen] = useState(false);
  const p = list[0] ?? null;
  return (
    <section className="panel dash__card" style={{ "--m": `var(--mod-${modul})` } as CSSProperties}>
      <h2 className="panel__title">{t.bahanH(modulLabel(modul, lang))}</h2>
      <ul className="bahan">
        <li>
          <span className="bahan__ic" aria-hidden="true">
            <PresentationChartIcon size={20} />
          </span>
          <span className="stack grow" style={{ gap: 0 }}>
            <b>{t.bahanSlides}</b>
            <span className="hint">{loaded && !p ? t.slidesKosong : t.bahanSlidesSub}</span>
          </span>
          <button type="button" className="btn btn--sm" disabled={!p} onClick={() => setOpen(true)}>
            {t.buka}
          </button>
        </li>
        <li>
          <span className="bahan__ic" aria-hidden="true">
            <BookOpenTextIcon size={20} />
          </span>
          <span className="stack grow" style={{ gap: 0 }}>
            <b>{t.bahanModul}</b>
            <span className="hint">{t.bahanModulSub}</span>
          </span>
          <a className="btn btn--sm" href={href(lang, `/modules/${modul}`)}>
            {t.baca}
          </a>
        </li>
        <li>
          <span className="bahan__ic" aria-hidden="true">
            <CircuitryIcon size={20} />
          </span>
          <span className="stack grow" style={{ gap: 0 }}>
            <b>{t.bahanSkema}</b>
            <span className="hint">{t.bahanSkemaSub}</span>
          </span>
          <a className="btn btn--sm" href={href(lang, `/modules/${modul}?step=code`)}>
            {t.lihat}
          </a>
        </li>
      </ul>
      <SlidesDialog open={open} onOpenChange={setOpen} list={list} modul={modul} lang={lang} />
    </section>
  );
}

/* ------------------------------------------------------- dashboard */

function nextLine(t: DashT, l: Langkah, terkunci: number | null, lang: Lang): string {
  switch (l.jenis) {
    case "persiapan":
      return t.next.persiapan;
    case "kode":
      return t.next.kode(l.sisa);
    case "live":
      return t.next.live;
    case "umpan_balik":
      return t.next.umpan;
    case "selesai":
      return t.next.selesai;
    default:
      return terkunci ? t.next.terkunci(modulLabel(terkunci, lang)) : t.next.tunggu;
  }
}

function nextHref(l: Langkah, lang: Lang, modul: number): string {
  const step =
    l.jenis === "persiapan"
      ? "setup"
      : l.jenis === "kode"
        ? "code"
        : l.jenis === "live"
          ? "live"
          : "modul";
  return href(lang, `/modules/${modul}?step=${step}`);
}

/** The ground station: cockpit, instrument, log; group and materials. */
function Running({
  t,
  lang,
  sesi,
  hasil,
  modules,
  me,
}: {
  t: DashT;
  lang: Lang;
  sesi: SesiNow;
  hasil: Hasil | null;
  modules: ModulInfo[];
  me: { nama: string; nim: string };
}) {
  const modul = sesi.modul;
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [, force] = useState(0);
  const now = useTick(30_000);
  // The running session's module is always open to its own group (a TOT
  // dummy's comes through its journal list); the projector reads the
  // Asisten's list, which lacked it (2026-10-07: "Modul 1 belum dibuka"
  // on the projector during a TOT session on Module 1).
  useEffect(() => {
    void getAksesState(true).then((s) => setTerbuka([...new Set([...s.terbuka, modul])]));
  }, [modul]);
  // The setup checklist lives on this device; re-read it on return.
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && force((n) => n + 1);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const info = modules.find((m) => m.modul === modul);
  const setup = info ? Math.min(readSetup(modul).length, info.persiapan) : 0;
  const blank = hasil?.blank ?? {
    benar: 0,
    total: info?.berkas.reduce((a, b) => a + b.blanks, 0) ?? 0,
  };
  const target = modul === 4 ? 2 : 1;
  const tangkap = Math.min(target, (hasil?.tangkapan ?? 0) + (modul === 4 ? jarakAda(hasil) : 0));
  const langkah = langkahBerikutnya({
    sesi: { modul, selesai: false },
    terbuka: terbuka ?? [],
    progres: { [modul]: blank },
    persiapanSelesai: info ? setup >= info.persiapan : false,
    sudahUmpanBalik: false,
  });
  const terkunci = terbuka && !terbuka.includes(modul) ? modul : null;
  const durasi = sesi.durasiMenit ?? 120;
  const sisa = durasi - menitBerjalan(sesi.mulaiPada, now);
  return (
    <div className="gs">
      <section className="panel panel--key panel--raised dash__card dash__next kokpit">
        <div className="kokpit__top">
          <MissionClock
            mulaiPada={sesi.mulaiPada}
            durasiMenit={durasi}
            size={128}
            lang={lang}
            noLeft
          />
          <div className="stack stack--sm">
            <span className="eyebrow">{t.nextEyebrow}</span>
            <p className="kokpit__next">{nextLine(t, langkah, terkunci, lang)}</p>
          </div>
        </div>
        {sisa <= 30 && sisa > 0 && (
          <div className="kokpit__warn">
            <WarningIcon size={18} aria-hidden="true" />
            {t.warn30}
          </div>
        )}
        <div className="stack stack--sm">
          <Cells label={t.progSetup} a={setup} b={info?.persiapan ?? 0} tone="--ok" />
          <Cells label={t.progBlank} a={blank.benar} b={blank.total} tone={`--mod-${modul}`} />
          <Cells label={t.progTangkap} a={tangkap} b={target} tone="--violet" />
        </div>
        <div className="panel__actions">
          <a className="btn btn--inverse btn--lg dash__cta" href={nextHref(langkah, lang, modul)}>
            {t.lanjut}
            <ArrowRightIcon size={18} aria-hidden="true" />
          </a>
        </div>
      </section>
      {hasil?.kelompok ? (
        <Instrument
          m={modul}
          sesiId={sesi.id ?? null}
          kelompok={hasil.kelompok.nomor}
          lang={lang}
          title={t.liveH}
          nim={me.nim}
        />
      ) : (
        <span className="skeleton" style={{ minHeight: 320 }} />
      )}
      <section className="panel dash__card gs__log">
        <div className="panel__head">
          <h2 className="panel__title">{t.logH}</h2>
          <span className="hint mono">{t.logHint}</span>
        </div>
        <SessionLog items={hasil?.linimasa ?? []} lang={lang} />
      </section>
      <GroupCard t={t} hasil={hasil} me={me.nama} />
      <MaterialsCard t={t} lang={lang} modul={modul} />
    </div>
  );
}

function jarakAda(h: Hasil | null): number {
  return h?.linimasa?.some((x) => x.jenis === "jarak") ? 1 : 0;
}

function Ended({
  t,
  lang,
  hasil,
  go,
}: {
  t: DashT;
  lang: Lang;
  hasil: Hasil;
  go: (v: View) => void;
}) {
  const id = hasil.sesi!.id;
  const modul = hasil.sesi!.modul;
  return (
    <div className="dash__pair">
      <section
        className="panel panel--key panel--raised dash__card ended10"
        style={{ "--m": `var(--mod-${modul})` } as CSSProperties}
      >
        <span className="ended10__burst" aria-hidden="true" />
        <span className="row">
          <Pill tone="ok">
            <CheckIcon size={14} aria-hidden="true" />
            {t.endedBadge}
          </Pill>
        </span>
        <h2 className="dash__h">{t.endedPath(modulLabel(modul, lang))}</h2>
        <p className="dash__lede">{t.endedAsk}</p>
        <div className="panel__actions">
          {!hasil.sudahUmpanBalik && (
            <button
              type="button"
              className="btn btn--inverse"
              onClick={() => go({ v: "feedback", sesi: id })}
            >
              <ChatCircleTextIcon size={18} aria-hidden="true" />
              {t.beriUmpan}
            </button>
          )}
          <button type="button" className="btn" onClick={() => go({ v: "summary", sesi: id })}>
            <BookOpenTextIcon size={18} aria-hidden="true" />
            {t.lihatRingkasan}
          </button>
        </div>
      </section>
      <section className="panel dash__card">
        <h2 className="panel__title">{t.hasilH}</h2>
        <div className="readouts">
          <Readout
            v={hasil.blank?.benar ?? 0}
            unit={`/${hasil.blank?.total ?? 0}`}
            label={t.blankBenar}
          />
          <Readout v={hasil.tangkapan ?? 0} unit="" label={t.tangkapanSimpan} />
          <Readout v={hasil.delayRata ?? null} unit=" ms" label={t.delayRata} />
        </div>
        {hasil.rataRata != null ? (
          <Scores hasil={hasil} t={t} />
        ) : (
          <span className="hint">{t.nilaiNanti}</span>
        )}
      </section>
    </div>
  );
}

function Scores({ hasil, t }: { hasil: Hasil; t: DashT }) {
  return (
    <div className="dash__scores">
      <span className="dash__avg">
        <b className="num">{hasil.rataRata}</b>
        <small>{t.rataRata}</small>
      </span>
      <span className="dash__comp">
        {NILAI_KOMPONEN.map((k) => (
          <span key={k}>
            <small className="mono">{k}</small>
            <b className="num">{hasil.skor?.[k] ?? <Nil dot />}</b>
          </span>
        ))}
      </span>
    </div>
  );
}

/** Every practicum attended, newest first, each opening its summary. */
function Practicums({
  t,
  lang,
  list,
  go,
}: {
  t: DashT;
  lang: Lang;
  list: Praktikum[];
  go: (v: View) => void;
}) {
  const rows = [...list].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  return (
    <section className="panel">
      <h2 className="panel__title">{t.prakH}</h2>
      <ul className="pracs">
        {rows.map((p) => (
          <li
            className="prac"
            key={p.sesiId}
            style={{ "--m": `var(--mod-${p.modul})` } as CSSProperties}
          >
            <span className="prac__star" aria-hidden="true">
              <CheckIcon size={14} weight="bold" />
            </span>
            <span className="stack" style={{ gap: 2 }}>
              <b>
                {modulLabel(p.modul, lang)} · {MODUL_NAMA[p.modul]}
              </b>
              <span className="hint">{tanggalPanjang(p.tanggal, lang)}</span>
            </span>
            <span className="grow" />
            {p.status !== "selesai" ? (
              <Pill tone="ok">{t.berjalan}</Pill>
            ) : p.rataRata != null ? (
              <span className="prac__score">
                <b className="mono">{p.rataRata}</b>
                <small>{t.rataSingkat}</small>
              </span>
            ) : (
              <span className="hint">{t.menungguNilai}</span>
            )}
            {p.status === "selesai" &&
              (p.sudahUmpanBalik ? (
                <Pill tone="ok">{t.umpanTerkirim}</Pill>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => go({ v: "feedback", sesi: p.sesiId })}
                >
                  <ChatCircleTextIcon size={16} aria-hidden="true" />
                  {t.beriUmpan}
                </button>
              ))}
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              aria-label={t.bukaRingkasan}
              onClick={() => go({ v: "summary", sesi: p.sesiId })}
            >
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nilaiku (2026-10-09): their own scores per module, once their group's
 *  Asisten sent them; never a groupmate's. */
function Nilaiku({
  t,
  lang,
  list,
  tp = null,
}: {
  t: DashT;
  lang: Lang;
  list: Praktikum[];
  tp?: TpSaya | null;
}) {
  const rows = list.filter((p) => p.terkirim && p.skor).sort((a, b) => a.modul - b.modul);
  // Phase 13: the TP score opens each question's mark.
  const [rinci, setRinci] = useState<number | null>(null);
  if (!rows.length) return null;
  const adaRinci = (m: number) => !!tp?.modul.find((x) => x.modul === m)?.skor;
  return (
    <section className="panel nilaiku">
      <div className="panel__head">
        <h2 className="panel__title">{t.nilaikuH}</h2>
        <span className="hint">{t.nilaikuHint}</span>
      </div>
      <div className="nilaiku__rows">
        {rows.map((p) => (
          <div
            className="nilaiku__row"
            key={p.sesiId}
            style={{ "--m": `var(--mod-${p.modul})` } as CSSProperties}
          >
            <span className="nilaiku__mod">
              <Pill modul={p.modul}>{modulLabel(p.modul, lang)}</Pill>
              <b>{MODUL_NAMA[p.modul]}</b>
            </span>
            <span className="nilaiku__comp">
              {NILAI_KOMPONEN.map((k) => (
                <span key={k} data-none={p.skor?.[k] == null ? "yes" : "no"}>
                  <small className="mono">{k}</small>
                  {k === "TP" && p.skor?.[k] != null && adaRinci(p.modul) ? (
                    <button
                      type="button"
                      className="tpchip num"
                      aria-expanded={rinci === p.modul}
                      title={TPS[lang].tekanTp}
                      onClick={() => setRinci(rinci === p.modul ? null : p.modul)}
                    >
                      {p.skor?.[k]}
                      <CaretDownIcon size={12} aria-hidden="true" />
                    </button>
                  ) : (
                    <b className="num">{p.skor?.[k] ?? <Nil dot />}</b>
                  )}
                </span>
              ))}
            </span>
            <span className="nilaiku__avg">
              <b className="num">{p.rataRata ?? <Nil dot />}</b>
              <small>{t.rataSingkat}</small>
            </span>
            {rinci === p.modul && (
              <span className="nilaiku__tp">
                <TpRincian lang={lang} d={tp} modul={p.modul} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** No session of theirs to show: the Asisten hasn't opened it, or
 *  (`ikut`, 2026-10-07) it runs but they signed in without joining it. */
function Waiting({
  t,
  lang,
  hasil,
  me,
  ikut = false,
}: {
  t: DashT;
  lang: Lang;
  hasil: Hasil | null;
  me: string;
  ikut?: boolean;
}) {
  return (
    <div className="dash__pair">
      <section className="panel panel--key panel--raised dash__card">
        <div className="kokpit__top">
          <IdleClock size={112} lang={lang} />
          <div className="stack stack--sm">
            <h2 className="dash__h">{ikut ? t.ikutH : t.waitH}</h2>
            <p className="dash__lede">{ikut ? t.ikutP : t.waitP}</p>
          </div>
        </div>
        <div className="panel__actions">
          {ikut ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => openSignIn(undefined, { ikut: true })}
            >
              <SignInIcon size={18} aria-hidden="true" />
              {t.ikutBtn}
            </button>
          ) : (
            <a className="btn" href={href(lang, "/modules")}>
              <BookOpenTextIcon size={18} aria-hidden="true" />
              {t.bacaDulu}
            </a>
          )}
        </div>
      </section>
      {hasil?.kelompok ? <GroupCard t={t} hasil={hasil} me={me} /> : null}
    </div>
  );
}

/* --------------------------------------------------------- summary */

function Summary({
  t,
  lang,
  sesi,
  ended,
  modules,
  go,
}: {
  t: DashT;
  lang: Lang;
  sesi: number;
  ended?: boolean;
  modules: ModulInfo[];
  go: (v: View) => void;
}) {
  const [h, setH] = useState<Hasil | null>(null);
  useEffect(() => {
    void getJson<Hasil>(`/api/session/results?sesiId=${sesi}`)
      .then(setH)
      .catch(() => setH({ ok: false }));
  }, [sesi]);
  const modul = h?.sesi?.modul ?? 0;
  const cap = useTangkapan(modul, modul > 0);
  // The sketch holds the worked answers: it downloads only while the
  // journal is open to them (their session, or the opened history).
  const [bolehUnduh, setBolehUnduh] = useState<boolean | null>(null);
  useEffect(() => {
    if (modul > 0) void getAksesState(true).then((s) => setBolehUnduh(s.jurnal.includes(modul)));
  }, [modul]);
  if (!h) return <SummarySkeleton />;
  if (!h.ok || !h.sesi) {
    return (
      <StateView
        icon={<WarningIcon size={28} />}
        title={t.fbTidakAda}
        actions={
          <button type="button" className="btn" onClick={() => go({ v: "home" })}>
            {t.kembali}
          </button>
        }
      />
    );
  }
  const info = modules.find((m) => m.modul === modul);
  const rows = (cap.rows ?? []).filter((r) => r.sesiId === sesi);
  // The Pi's own average when it has one, else the saved journal table's.
  const paket = rows.find((r) => r.jenis === "paket");
  const delay =
    h.delayRata ?? (paket ? (rataJurnal(modul, paket.baris as JRow[])[0] ?? null) : null);
  const tk = TRACE_KEY[modul];
  const series = tk
    ? rows
        .filter((r) => r.jenis === "paket")
        .flatMap((r) => (r.baris as JRow[]).map((b) => Number(b[tk.key])))
        .filter((x) => Number.isFinite(x))
    : [];
  return (
    <div className="stack stack--lg dash__summary">
      {ended && (
        <div className="banner banner--ok dash__endbanner">
          <span className="dot dot--ok" aria-hidden="true" />
          <b>{t.endBanner}</b>
          <span className="hint">{t.endBannerHint}</span>
        </div>
      )}
      <BackButton lang={lang} label={t.kembali} onClick={() => go({ v: "home" })} />
      <div className="dash__sumhead">
        <div className="stack stack--sm">
          <span className="eyebrow">
            {t.sumEyebrow} · {tanggalPanjang(h.sesi.tanggal, lang)}
          </span>
          <span className="row">
            <h1 className="page-header__title">
              {modulLabel(modul, lang)} · {MODUL_NAMA[modul]}
            </h1>
            {h.sesi.status === "selesai" && (
              <Pill tone="ok">
                <CheckIcon size={14} aria-hidden="true" />
                {t.selesaiBadge}
              </Pill>
            )}
          </span>
        </div>
        <div className="row dash__sumtools">
          {info && bolehUnduh && (
            <button type="button" className="btn" onClick={() => void unduhSketsa(info, lang)}>
              <DownloadSimpleIcon size={18} aria-hidden="true" />
              {t.unduhSketsa}
            </button>
          )}
          {info && bolehUnduh === false && (
            <span className="hint">
              {modul >= 4 ? t.unduhNantiAkhir : t.unduhNanti(modulLabel(modul + 1, lang))}
            </span>
          )}
          {h.sesi.status === "selesai" && !h.sudahUmpanBalik && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => go({ v: "feedback", sesi })}
            >
              <ChatCircleTextIcon size={18} aria-hidden="true" />
              {t.beriUmpan}
            </button>
          )}
        </div>
      </div>
      <div className="dash__pair">
        <section
          className="panel panel--raised"
          style={{ "--m": `var(--mod-${modul})` } as CSSProperties}
        >
          <div className="panel__head">
            <h2 className="panel__title">{t.nilaiH}</h2>
            {h.kelompok && (
              <Pill group={h.kelompok.nomor}>
                {kelompokLabel(h.kelompok.nomor, lang)}
                {KELOMPOK_NAMA[h.kelompok.nomor] ? ` · ${KELOMPOK_NAMA[h.kelompok.nomor]}` : ""}
              </Pill>
            )}
          </div>
          {h.rataRata != null ? (
            <>
              <div className="scorebig">
                <Arc
                  v={h.rataRata}
                  min={0}
                  max={100}
                  unit=""
                  label={t.rataSingkat}
                  color={`--mod-${modul}`}
                />
              </div>
              <div className="comp10">
                {NILAI_KOMPONEN.map((k) => {
                  const v = h.skor?.[k];
                  return (
                    <div className="comp10__c" key={k} data-none={v == null ? "yes" : "no"}>
                      <small className="mono">{k}</small>
                      <span className="comp10__bar">
                        <i style={{ height: `${v ?? 0}%` }} />
                      </span>
                      <b className="mono">{v ?? <Nil dot />}</b>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <span className="hint">{t.nilaiNanti}</span>
          )}
          <div className="readouts">
            <Readout
              v={h.blank?.benar ?? 0}
              unit={`/${h.blank?.total ?? 0}`}
              label={t.blankBenar}
            />
            <Readout v={delay} unit=" ms" label={t.delayRata} />
            <Readout v={h.tangkapan ?? 0} unit="" label={t.tangkapanSimpan} />
          </div>
        </section>
        <section className="panel">
          <h2 className="panel__title">{t.logIniH}</h2>
          <SessionLog items={h.linimasa ?? []} lang={lang} max={9} />
        </section>
      </div>
      <section className="panel" style={{ "--m": `var(--mod-${modul})` } as CSSProperties}>
        <h2 className="panel__title">{t.dataH}</h2>
        {tk && series.length > 1 && (
          <Trace
            values={series}
            min={tk.min}
            max={tk.max}
            unit={tk.unit}
            color={`--mod-${modul}`}
            label={t.tangkapanH}
            h={96}
          />
        )}
        {cap.rows === null ? (
          <span className="skeleton" style={{ height: 160 }} />
        ) : (
          <CaptureList lang={lang} modul={modul} rows={rows} />
        )}
      </section>
      <span className="hint">{t.nantiRiwayat}</span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="stack stack--lg" aria-busy="true">
      <span className="skeleton" style={{ height: 46, width: "60%" }} />
      <div className="dash__pair">
        <span className="skeleton" style={{ height: 320 }} />
        <span className="skeleton" style={{ height: 320 }} />
      </div>
      <span className="skeleton" style={{ height: 220 }} />
    </div>
  );
}

/* -------------------------------------------------------- feedback */

function FeedbackPage({
  t,
  lang,
  sesi,
  go,
  onSent,
}: {
  t: DashT;
  lang: Lang;
  sesi: number;
  go: (v: View) => void;
  onSent: () => void;
}) {
  const [h, setH] = useState<Hasil | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    void getJson<Hasil>(`/api/session/results?sesiId=${sesi}`)
      .then(setH)
      .catch(() => setH({ ok: false }));
  }, [sesi]);
  const back = (
    <button type="button" className="btn" onClick={() => go({ v: "home" })}>
      {t.kembali}
    </button>
  );
  if (sent) {
    return (
      <StateView
        tone="ok"
        icon={<CheckCircleIcon size={28} />}
        title={t.fbThanksH}
        body={t.fbThanks}
        actions={back}
      />
    );
  }
  if (!h) return <span className="skeleton" style={{ height: 420 }} />;
  if (!h.ok || !h.sesi)
    return <StateView icon={<WarningIcon size={28} />} title={t.fbTidakAda} actions={back} />;
  if (h.sesi.status !== "selesai")
    return <StateView icon={<ChatCircleTextIcon size={28} />} title={t.fbBelum} actions={back} />;
  if (h.sudahUmpanBalik)
    return (
      <StateView tone="ok" icon={<CheckCircleIcon size={28} />} title={t.fbSudah} actions={back} />
    );
  return (
    <div className="stack stack--lg dash__fb">
      <header className="page-header">
        <span className="page-header__eyebrow">{t.fbEyebrow(modulLabel(h.sesi.modul, lang))}</span>
        <h1 className="page-header__title">{t.fbH}</h1>
        <p className="page-header__subtitle">{t.fbLede}</p>
      </header>
      <FeedbackForm
        lang={lang}
        sesiId={sesi}
        asisten={h.asisten ?? null}
        pilihan={h.pilihanOrang ?? (h.pilihanAsisten ?? []).map((kode) => ({ kode, nama: kode }))}
        onDone={() => {
          setSent(true);
          onSent();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ root */

export default function Dashboard({ lang, modules }: { lang: Lang; modules: ModulInfo[] }) {
  const t = DS[lang];
  const me = useMe();
  // Projector mode: an Asisten sees their held group's Dasbor as its
  // Praktikan do (ruled 2026-10-04); there is no practicum history of theirs.
  const pro = useProyektor(me);
  const sendiri = me?.role === "praktikan";
  const praktikan = sendiri || pro !== null;
  const [view, go] = useView();
  const now = useSessionNow(praktikan);
  const sesi = now.data && now.data.milikSaya !== false ? now.data : null;
  const hasilPoll = usePoll(
    () => getJson<Hasil>(`/api/session/results${pro ? `?kelompok=${pro}` : ""}`),
    60_000,
    praktikan,
    ["sesi", "nilai", "jurnal", "tangkapan", "buru"],
  );
  // This group's blank results through the session room, not every group's.
  useAliranAtauTopik(
    { ruang: "sesi", sesiId: now.data?.id ?? null },
    ["jawaban"],
    ["jawaban"],
    hasilPoll.refresh,
    praktikan,
    pro ?? me?.kelompok ?? null,
  );
  const minePoll = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    60_000,
    sendiri,
    ["sesi", "nilai"],
  );
  const hasil = hasilPoll.data;
  // Phase 13: the TP card and Nilaiku's TP marks.
  const tp = useTpSaya(sendiri);

  useEffect(() => {
    if (me === null) location.assign(href(lang, "/login?next=/dashboard"));
    else if (me?.role === "asisten" && bacaProyektor() === null)
      location.replace(href(lang, "/session"));
  }, [me, lang]);

  // ?feedback=1 (an older link) opens the feedback page for the latest session.
  useEffect(() => {
    if (!hasil?.ok || !hasil.sesi) return;
    if (new URLSearchParams(location.search).get("feedback") === "1")
      go({ v: "feedback", sesi: hasil.sesi.id });
  }, [hasil?.ok, hasil?.sesi?.id]);

  // The moment the Asisten ends the running session, show its summary.
  const wasRunning = useRef<number | null>(null);
  useEffect(() => {
    if (sesi && hasil?.sesi?.status === "berjalan") wasRunning.current = hasil.sesi.id;
    if (!sesi && wasRunning.current !== null && now.updatedAt !== null) {
      const id = wasRunning.current;
      wasRunning.current = null;
      hasilPoll.refresh();
      minePoll.refresh();
      if (view.v === "home") go({ v: "summary", sesi: id, ended: true });
    }
  }, [sesi, hasil?.sesi?.id, hasil?.sesi?.status, now.updatedAt]);

  const today = useMemo(() => hariIniWib(), []);

  if (me === undefined || (praktikan && hasilPoll.updatedAt === null && hasilPoll.errors === 0)) {
    return (
      <div className="dash dash10" aria-busy="true">
        <div className="dash10__head" data-grid="gs">
          <div className="stack stack--sm">
            <span className="skeleton" style={{ height: 18, width: 160 }} />
            <span className="skeleton" style={{ height: 44, width: 260 }} />
          </div>
          <span className="skeleton" style={{ height: 118 }} />
        </div>
        <div className="gs">
          <span className="skeleton" style={{ height: 320 }} />
          <span className="skeleton" style={{ height: 320 }} />
          <span className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }
  if (!praktikan || !me) return null;
  if (hasilPoll.errors >= 2 && !hasil) {
    return (
      <StateView
        tone="danger"
        icon={<WarningIcon size={28} />}
        title={t.gagal}
        body={t.gagalP}
        actions={
          <button type="button" className="btn btn--primary" onClick={hasilPoll.refresh}>
            <ArrowClockwiseIcon size={18} aria-hidden="true" />
            {t.coba}
          </button>
        }
      />
    );
  }

  if (view.v === "summary")
    return (
      <div className="dash dash10">
        <Summary t={t} lang={lang} sesi={view.sesi} ended={view.ended} modules={modules} go={go} />
      </div>
    );
  if (view.v === "feedback")
    return (
      <div className="dash dash--narrow">
        <FeedbackPage
          t={t}
          lang={lang}
          sesi={view.sesi}
          go={go}
          onSent={() => {
            hasilPoll.refresh();
            minePoll.refresh();
          }}
        />
      </div>
    );

  const k = hasil?.kelompok?.nomor ?? pro ?? me.kelompok ?? null;
  const nama = pro
    ? (KELOMPOK_NAMA[pro] ?? kelompokLabel(pro, lang))
    : isNimTot(me.nim)
      ? me.nama // "TOT ASO 01": a first name alone would greet "Halo, TOT"
      : (me.nama.split(/\s+/)[0] ?? me.nama);
  const list = minePoll.data?.ok ? minePoll.data.praktikum : [];
  const endedToday =
    !sesi && hasil?.ok && hasil.sesi?.status === "selesai" && hasil.sesi.tanggal === today
      ? hasil
      : null;

  // Their session runs, but they signed in without joining it (2026-10-07).
  const belumIkut = sendiri && !sesi && now.data?.milikSaya === false && now.data.bisaIkut === true;

  let body;
  if (belumIkut) {
    body = (
      <>
        <Waiting t={t} lang={lang} hasil={hasil ?? null} me={me.nama} ikut />
        <Nilaiku t={t} lang={lang} list={list} tp={tp.data} />
        {list.length > 0 && <Practicums t={t} lang={lang} list={list} go={go} />}
      </>
    );
  } else if (sesi) {
    body = (
      <>
        <Running
          t={t}
          lang={lang}
          sesi={sesi}
          hasil={hasil?.sesi?.status === "berjalan" ? hasil : null}
          modules={modules}
          me={me}
        />
        <Nilaiku t={t} lang={lang} list={list} tp={tp.data} />
      </>
    );
  } else if (endedToday) {
    body = (
      <>
        <Ended t={t} lang={lang} hasil={endedToday} go={go} />
        <Nilaiku t={t} lang={lang} list={list} tp={tp.data} />
        {list.length > 0 && <Practicums t={t} lang={lang} list={list} go={go} />}
      </>
    );
  } else if (list.length > 0) {
    body = (
      <>
        <Nilaiku t={t} lang={lang} list={list} tp={tp.data} />
        <Practicums t={t} lang={lang} list={list} go={go} />
      </>
    );
  } else {
    body = <Waiting t={t} lang={lang} hasil={hasil ?? null} me={me.nama} />;
  }

  const mods = journeyFrom(list, sesi?.modul ?? null);
  const pick = (x: Stop) => {
    const p = list.find((y) => y.modul === x.m && y.status === "selesai");
    if (x.state === "done" && p) go({ v: "summary", sesi: p.sesiId });
    else location.assign(href(lang, `/modules/${x.m}`));
  };

  return (
    <div
      className="dash dash10"
      style={k ? ({ "--g": `var(--group-${k})` } as CSSProperties) : undefined}
    >
      <div className="dash10__head" data-grid={sesi ? "gs" : "g2"}>
        <header className="page-header">
          {k ? (
            <span className="page-header__eyebrow">
              {kelompokLabel(k, lang)}
              {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
            </span>
          ) : null}
          <h1 className="page-header__title">{t.halo(nama)}</h1>
        </header>
        <div
          className="panel dash10__journey"
          data-ignite={endedToday ? endedToday.sesi!.modul : 0}
        >
          <span className="eyebrow">{t.jejak}</span>
          <Journey
            mods={mods}
            compact={Boolean(sesi)}
            onPick={pick}
            lang={lang}
            names={MODUL_NAMA}
          />
        </div>
      </div>
      {sendiri && <TpKartu lang={lang} d={tp.data} />}
      {body}
      {sesi && !pro && <CoachMarks lang={lang} />}
    </div>
  );
}
