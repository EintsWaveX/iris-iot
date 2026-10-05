/**
 * /dashboard (Phase 9 Stage 7g, mockup p-dash, p-journal, p-feedback): the
 * Praktikan's home, one island with three views.
 *
 * - The dashboard by state. In their session: one key card (the next thing
 *   to do, from langkahBerikutnya), progress, the group, a small live card
 *   and the slides. Just after it ended: the feedback prompt and this
 *   session's result. Outside a session: every practicum. Nothing yet: a
 *   waiting card. Never a schedule or a time (Praktikan never see one).
 * - `?view=summary&session=N`: the session summary. It opens by itself the
 *   moment the Asisten ends the running session.
 * - `?view=feedback&session=N`: the feedback page.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRightIcon,
  ArrowClockwiseIcon,
  BookOpenTextIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadSimpleIcon,
  PresentationChartIcon,
  PulseIcon,
  TrophyIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { StateView } from "../ui/Display";
import Pill from "../ui/Pill";
import PdfViewer from "../ui/PdfViewer";
import { getJson, href, KELOMPOK_NAMA, MODUL_NAMA, useMe, useSessionNow } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { bacaProyektor, useProyektor } from "../../lib/proyektor";
import { hariIniWib } from "../../lib/jadwal";
import { langkahBerikutnya, type Langkah } from "../../lib/langkah";
import { NILAI_KOMPONEN } from "../../lib/nilai-komponen";
import { namaAsisten } from "../../lib/people";
import { getAksesState } from "../../scripts/modul-akses";
import { readSetup } from "../module/SetupChecklist";
import { useTelemetry } from "../live/useTelemetry";
import { CaptureList, useTangkapan } from "../live/Capture";
import { rataJurnal, type JRow } from "../../lib/jurnal-tabel";
import { bahasaKonten, type Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import FeedbackForm from "./FeedbackForm";
import CoachMarks from "./CoachMarks";
import { DS, type DashT } from "./dashStrings";
import "../ui/Display.css";
import "./Dashboard.css";

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
  linimasa?: { pada: string; jenis: string; n?: number; dari?: number }[];
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
}

type View =
  { v: "home" } | { v: "summary"; sesi: number; ended?: boolean } | { v: "feedback"; sesi: number };

const IOT_BOARD_URL = "http://192.168.4.1:8080/";

/** "13:41" in lab time, the same in every language (mockup timeline). */
const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

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

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span
      className="meter"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={
        { "--meter": pct, "--meter-hue": pct >= 100 ? "var(--ok)" : undefined } as CSSProperties
      }
    />
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value num">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function GroupCard({
  t,
  lang,
  hasil,
  me,
}: {
  t: DashT;
  lang: Lang;
  hasil: Hasil | null;
  me: string;
}) {
  const k = hasil?.kelompok;
  return (
    <section className="panel dash__card">
      <h2 className="panel__title">{t.groupH}</h2>
      {k ? (
        <>
          <span className="row">
            <Pill group={k.nomor}>
              {kelompokLabel(k.nomor, lang)}
              {KELOMPOK_NAMA[k.nomor] ? ` · ${KELOMPOK_NAMA[k.nomor]}` : ""}
            </Pill>
          </span>
          <span className="hint">
            {t.asistenLine(hasil?.asisten ? namaAsisten(hasil.asisten) : t.belumAda)}
          </span>
          <div className="dash__people">
            {k.anggota.map((n) => (
              <span key={n} className={n === me ? "person person--me" : "person"}>
                {n}
              </span>
            ))}
          </div>
        </>
      ) : (
        <span className="skeleton" style={{ height: 72 }} />
      )}
    </section>
  );
}

function fmt(n: number | null | undefined, unit: string, digits = 0) {
  return n == null || !Number.isFinite(n) ? "-" : `${n.toFixed(digits)} ${unit}`.trim();
}

function LiveCard({
  t,
  lang,
  modul,
  kelompok,
  nim,
}: {
  t: DashT;
  lang: Lang;
  modul: number;
  kelompok: number;
  nim: string;
}) {
  const tel = useTelemetry(modul, kelompok, false, 2000);
  const rows = tel.history;
  const last = [...rows].reverse().find((r) => r.rx !== null);
  const v = last?.nilai ?? {};
  const delays = rows.map((r) => r.delayMs).filter((d): d is number => d != null);
  const avg = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null;
  const lost = rows.length ? (rows.filter((r) => r.rx === null).length / rows.length) * 100 : null;
  const stats: [string, string][] =
    modul === 2
      ? [
          [fmt(v.suhu, "°C", 1), t.stat.suhu],
          [fmt(v.lembap, "%", 0), t.stat.lembap],
        ]
      : modul === 3
        ? [
            [fmt(v.posisi, "%", 0), t.stat.posisi],
            [fmt(avg, "ms"), t.stat.delay],
          ]
        : modul === 4
          ? [
              [fmt(v.rssiHalus ?? last?.rssi, "dBm"), t.stat.rssi],
              [fmt(v.jarak, "m", 1), t.stat.jarak],
            ]
          : [
              [fmt(avg, "ms"), t.stat.delay],
              [lost == null ? "-" : `${Math.round(lost)} %`, t.stat.hilang],
            ];
  return (
    <section className="panel dash__card">
      <div className="panel__head">
        <h2 className="panel__title">{t.liveH}</h2>
        <Pill tone={tel.live ? "ok" : undefined}>
          {tel.live && <span className="dot dot--ok" aria-hidden="true" />}
          {tel.live ? t.langsung : t.simulasi}
        </Pill>
      </div>
      <div className="dash__stats">
        {stats.map(([a, b]) => (
          <Stat key={b} value={a} label={b} />
        ))}
      </div>
      {modul === 4 && <p className="panel__sub">{t.huntHint}</p>}
      <div className="panel__actions">
        <a className="btn dash__live-cta" href={href(lang, `/modules/${modul}?step=live`)}>
          <PulseIcon size={18} aria-hidden="true" />
          {t.bukaLive}
        </a>
        {modul === 4 && (
          <a
            className="btn"
            href={`${IOT_BOARD_URL}?nim=${encodeURIComponent(nim)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <TrophyIcon size={18} aria-hidden="true" />
            {t.papanSkor}
          </a>
        )}
      </div>
    </section>
  );
}

function SlidesCard({ t, lang, modul }: { t: DashT; lang: Lang; modul: number }) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; presentasi: { url: string; namaBerkas: string } | null }>(
        "/api/presentasi/aktif",
      ).then((d) => (d.ok ? d.presentasi : null)),
    30_000,
    true,
    ["presentasi"],
  );
  const [open, setOpen] = useState(false);
  const p = poll.data;
  return (
    <section className="panel dash__card">
      <h2 className="panel__title">{t.slidesH}</h2>
      <p className="panel__sub">
        {modulLabel(modul, lang)} · {MODUL_NAMA[modul]}
      </p>
      {poll.updatedAt !== null && !p && <p className="hint">{t.slidesKosong}</p>}
      <div className="panel__actions">
        <button type="button" className="btn" disabled={!p} onClick={() => setOpen(true)}>
          <PresentationChartIcon size={18} aria-hidden="true" />
          {t.bukaSlides}
        </button>
      </div>
      <Dialog
        open={open && Boolean(p)}
        onOpenChange={setOpen}
        title={t.slidesTitle(modulLabel(modul, lang))}
        size="lg"
        lang={lang}
      >
        {p && <PdfViewer url={p.url} name={p.namaBerkas} lang={lang} />}
      </Dialog>
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

function Running({
  t,
  lang,
  modul,
  hasil,
  modules,
  me,
}: {
  t: DashT;
  lang: Lang;
  modul: number;
  hasil: Hasil | null;
  modules: ModulInfo[];
  me: { nama: string; nim: string };
}) {
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    void getAksesState(true).then((s) => setTerbuka(s.terbuka));
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
  return (
    <div className="dashgrid">
      <section className="panel panel--key panel--raised dash__card dash__next">
        <h2 className="panel__title">{t.nextH}</h2>
        <p className="dash__lede">{nextLine(t, langkah, terkunci, lang)}</p>
        <div className="panel__actions">
          <a className="btn btn--inverse btn--lg dash__cta" href={nextHref(langkah, lang, modul)}>
            {t.lanjut}
            <ArrowRightIcon size={18} aria-hidden="true" />
          </a>
        </div>
      </section>
      <section className="panel dash__card">
        <h2 className="panel__title">{t.progresH}</h2>
        {(
          [
            [t.progSetup, setup, info?.persiapan ?? 0],
            [t.progBlank, blank.benar, blank.total],
            [t.progTangkap, tangkap, target],
          ] as const
        ).map(([l, a, b]) => (
          <div className="progrow" key={l}>
            <span>{l}</span>
            <Bar value={a} max={b} />
            <b className="num">
              {a}/{b}
            </b>
          </div>
        ))}
      </section>
      <GroupCard t={t} lang={lang} hasil={hasil} me={me.nama} />
      {hasil?.kelompok ? (
        <LiveCard t={t} lang={lang} modul={modul} kelompok={hasil.kelompok.nomor} nim={me.nim} />
      ) : (
        <span className="skeleton" style={{ minHeight: 200 }} />
      )}
      <SlidesCard t={t} lang={lang} modul={modul} />
    </div>
  );
}

function jarakAda(h: Hasil | null): number {
  return h?.linimasa?.some((x) => x.jenis === "jarak") ? 1 : 0;
}

function Ended({ t, hasil, go }: { t: DashT; hasil: Hasil; go: (v: View) => void }) {
  const id = hasil.sesi!.id;
  return (
    <div className="dash__pair">
      <section className="panel panel--key panel--raised dash__card">
        <span className="row">
          <Pill tone="ok">
            <CheckIcon size={14} aria-hidden="true" />
            {t.endedBadge}
          </Pill>
        </span>
        <h2 className="dash__h">{t.endedH}</h2>
        <p className="dash__lede">{t.endedP}</p>
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
        <div className="dash__stats">
          <Stat
            value={`${hasil.blank?.benar ?? 0}/${hasil.blank?.total ?? 0}`}
            label={t.blankBenar}
          />
          <Stat value={String(hasil.tangkapan ?? 0)} label={t.tangkapanSimpan} />
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
            <b className="num">{hasil.skor?.[k] ?? "-"}</b>
          </span>
        ))}
      </span>
    </div>
  );
}

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
  return (
    <section className="panel">
      <h2 className="panel__title">{t.prakH}</h2>
      <div className="stack stack--sm">
        {[1, 2, 3, 4].map((m) => {
          const p = list.find((x) => x.modul === m);
          return (
            <div className="pracrow" key={m} style={{ "--m": `var(--mod-${m})` } as CSSProperties}>
              <Pill modul={m}>{modulLabel(m, lang)}</Pill>
              <b className="grow">{MODUL_NAMA[m]}</b>
              {!p ? (
                <span className="hint">{t.belumIkut}</span>
              ) : (
                <>
                  {p.status !== "selesai" ? (
                    <Pill tone="ok">{t.berjalan}</Pill>
                  ) : p.rataRata != null ? (
                    <span className="num dash__score">{p.rataRata}</span>
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
                        {t.beriUmpan}
                      </button>
                    ))}
                  <a
                    className="iconbtn iconbtn--sm"
                    href={href(lang, `/modules/${m}`)}
                    aria-label={t.bukaRiwayat(modulLabel(m, lang))}
                  >
                    <ArrowRightIcon size={18} aria-hidden="true" />
                  </a>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Waiting({
  t,
  lang,
  hasil,
  me,
}: {
  t: DashT;
  lang: Lang;
  hasil: Hasil | null;
  me: string;
}) {
  return (
    <div className="dash__pair">
      <section className="panel panel--key panel--raised dash__card">
        <span className="row">
          <span className="dot dot--warn" aria-hidden="true" />
        </span>
        <h2 className="dash__h">{t.waitH}</h2>
        <p className="dash__lede">{t.waitP}</p>
        <div className="panel__actions">
          <a className="btn" href={href(lang, "/modules")}>
            <BookOpenTextIcon size={18} aria-hidden="true" />
            {t.bacaDulu}
          </a>
        </div>
      </section>
      {hasil?.kelompok ? <GroupCard t={t} lang={lang} hasil={hasil} me={me} /> : null}
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
  const lini = h.linimasa ?? [];
  // The Pi's own average when it has one, else the saved journal table's.
  const paket = rows.find((r) => r.jenis === "paket");
  const delay =
    h.delayRata ?? (paket ? (rataJurnal(modul, paket.baris as JRow[])[0] ?? null) : null);
  return (
    <div className="stack stack--lg dash__summary">
      {ended && (
        <div className="banner banner--ok dash__endbanner">
          <span className="dot dot--ok" aria-hidden="true" />
          <b>{t.endBanner}</b>
          <span className="hint">{t.endBannerHint}</span>
        </div>
      )}
      <div className="dash__sumhead">
        <div className="stack stack--sm">
          <span className="row">
            <Pill modul={modul} lg>
              {modulLabel(modul, lang)}
            </Pill>
            {h.sesi.status === "selesai" && (
              <Pill tone="ok">
                <CheckIcon size={14} aria-hidden="true" />
                {t.selesaiBadge}
              </Pill>
            )}
          </span>
          <h1 className="page-header__title">{t.ringkasanH}</h1>
        </div>
        <div className="row dash__sumtools">
          {info && (
            <button type="button" className="btn" onClick={() => void unduhSketsa(info, lang)}>
              <DownloadSimpleIcon size={18} aria-hidden="true" />
              {t.unduhSketsa}
            </button>
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
      <div className="dash__sumstats">
        <Stat value={h.rataRata != null ? String(h.rataRata) : t.menunggu} label={t.nilaiDari} />
        <Stat value={`${h.blank?.benar ?? 0}/${h.blank?.total ?? 0}`} label={t.blankBenar} />
        <Stat value={delay != null ? `${Math.round(delay)} ms` : "-"} label={t.delayRata} />
        <Stat value={String(h.tangkapan ?? 0)} label={t.tangkapanSimpan} />
      </div>
      <section className="panel">
        <h2 className="panel__title">{t.tangkapanH}</h2>
        {cap.rows === null ? (
          <span className="skeleton" style={{ height: 160 }} />
        ) : (
          <CaptureList lang={lang} modul={modul} rows={rows} />
        )}
      </section>
      <section className="panel">
        <h2 className="panel__title">{t.riwayatH}</h2>
        <div className="dash__timeline">
          {lini.map((x, i) => (
            <div className="dash__trow" key={i}>
              <span className="mono hint">{jam(x.pada)}</span>
              <span>
                {x.jenis === "blank"
                  ? t.linimasa.blank(x.n ?? 0, x.dari ?? 0)
                  : (t.linimasa[x.jenis as "masuk" | "tangkap" | "jarak" | "selesai"] ?? x.jenis)}
              </span>
            </div>
          ))}
        </div>
      </section>
      <span className="hint">{t.nantiRiwayat}</span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="stack stack--lg" aria-busy="true">
      <span className="skeleton" style={{ height: 46, width: "60%" }} />
      <div className="dash__sumstats">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton" style={{ height: 96 }} />
        ))}
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
  const now = useSessionNow(15_000, praktikan);
  const sesi = now.data && now.data.milikSaya !== false ? now.data : null;
  const hasilPoll = usePoll(
    () => getJson<Hasil>(`/api/session/results${pro ? `?kelompok=${pro}` : ""}`),
    20_000,
    praktikan,
    ["sesi", "nilai", "jurnal"],
  );
  const minePoll = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    60_000,
    sendiri,
    ["sesi"],
  );
  const hasil = hasilPoll.data;

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
      <div className="dash" aria-busy="true">
        <span className="skeleton" style={{ height: 64, maxWidth: 420 }} />
        <div className="dashgrid">
          <span className="skeleton dash__next" style={{ height: 200 }} />
          <span className="skeleton" style={{ height: 200 }} />
          <span className="skeleton" style={{ height: 200 }} />
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
      <div className="dash">
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
    : (me.nama.split(/\s+/)[0] ?? me.nama);
  const list = minePoll.data?.ok ? minePoll.data.praktikum : [];
  const endedToday =
    !sesi && hasil?.ok && hasil.sesi?.status === "selesai" && hasil.sesi.tanggal === today
      ? hasil
      : null;

  let body;
  if (sesi) {
    body = (
      <Running
        t={t}
        lang={lang}
        modul={sesi.modul}
        hasil={hasil?.sesi?.status === "berjalan" ? hasil : null}
        modules={modules}
        me={me}
      />
    );
  } else if (endedToday) {
    body = (
      <>
        <Ended t={t} hasil={endedToday} go={go} />
        {list.length > 0 && <Practicums t={t} lang={lang} list={list} go={go} />}
      </>
    );
  } else if (list.length > 0) {
    body = <Practicums t={t} lang={lang} list={list} go={go} />;
  } else {
    body = <Waiting t={t} lang={lang} hasil={null} me={me.nama} />;
  }

  return (
    <div className="dash" style={k ? ({ "--g": `var(--group-${k})` } as CSSProperties) : undefined}>
      <header className="page-header">
        {k ? (
          <span className="page-header__eyebrow">
            {kelompokLabel(k, lang)}
            {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
          </span>
        ) : null}
        <h1 className="page-header__title">{t.halo(nama)}</h1>
      </header>
      {body}
      {sesi && !pro && <CoachMarks lang={lang} />}
    </div>
  );
}
