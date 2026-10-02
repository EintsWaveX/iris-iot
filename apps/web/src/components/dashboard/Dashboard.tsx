/**
 * /dashboard and /en/dashboard (Phase 8): the praktikan's home. One island
 * replacing the old vanilla page, built around a single question, "what do
 * I do next?", answered by langkahBerikutnya() (lib/langkah.ts) from the
 * running session, the module locks, the Persiapan checklist and the code
 * progress. Around it: the group's live mini flow, progress per module,
 * the assistant's slides, the Module 4 hunt, results after the session and
 * the two-section feedback form.
 */
import { useEffect, useMemo, useState } from "react";
import { TimerIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { CountUp, ProgressRing, StateView } from "../ui/Display";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  menitBerjalan,
  useMe,
  useSessionNow,
  localeOf,
  dict,
} from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import { langkahBerikutnya, type Langkah } from "../../lib/langkah";
import { NILAI_KOMPONEN } from "../../lib/nilai-komponen";
import { getAksesState } from "../../scripts/modul-akses";
import { readSetup } from "../module/SetupChecklist";
import { flowStats, selangMs, useTelemetry } from "../live/useTelemetry";
import type { Lang } from "../../lib/kelas";
import FeedbackForm from "./FeedbackForm";
import PdfViewer from "../ui/PdfViewer";
import { useProgres } from "../shared/useProgres";
import CoachMarks from "./CoachMarks";
import "./Dashboard.css";

export interface ModulInfo {
  modul: number;
  judul: string;
  topik: string;
  persiapan: number;
  berkas: { slug: string; blanks: number }[];
}

interface Hasil {
  ok: boolean;
  sesi?: { id: number; modul: number; status: string; kelas: string };
  asisten?: { kode: string } | null;
  pilihanAsisten?: string[];
  sudahUmpanBalik?: boolean;
  skor?: Partial<Record<string, number>> | null;
  rataRata?: number | null;
  lengkap?: boolean;
}

const T = dict({
  id: {
    halo: (n: string) => `Halo, ${n}`,
    kelompok: (k: number) => `Kelompok ${k}`,
    berjalan: (m: number) => `Sesi berjalan · Modul ${m}`,
    tanpaSesi: "Belum ada sesi berjalan",
    sisa: (m: number) => `sisa ${m} menit`,
    lewat: (m: number) => `${m} menit berjalan`,
    langkahH: "Langkah berikutnya",
    langkah: {
      tunggu: ["Tunggu asisten memulai sesi", "Modul akan terbuka di sini begitu sesi dimulai."],
      terkunci: (m: number) => [
        `Modul ${m} belum dibuka`,
        "Asisten akan membukanya sebentar lagi.",
      ],
      persiapan: (m: number) => [
        `Siapkan Modul ${m}`,
        "Cek alat, rangkai sesuai skema, lalu centang daftarnya.",
      ],
      kode: (s: number) => [`Lengkapi kode`, `Tinggal ${s} bagian rumpang lagi.`],
      live: (m: number) => [
        `Kode lengkap. Uji di ruang live`,
        `Unggah ke papan dan lihat pesan Modul ${m} mengalir.`,
      ],
      umpan: ["Isi umpan balik", "Dua bagian singkat, kira kira 20 detik."],
      selesai: ["Sesi selesai", "Terima kasih. Nilaimu ada di kartu Hasil."],
    },
    cta: {
      persiapan: "Buka Persiapan",
      kode: "Lanjutkan kode",
      live: "Buka ruang live",
      umpan: "Isi sekarang",
      selesai: "Lihat hasil",
      tunggu: "Lihat modul",
    },
    alurH: "Alur kelompokmu",
    alurKosong: "Alur muncul saat sesi berjalan.",
    live: "langsung",
    sim: "simulasi",
    rata: "rata rata Δ",
    selang: "selang rata rata",
    hilang: "hilang",
    terakhir: "pesan terakhir",
    bukaLive: "Buka ruang live",
    progresH: "Progres modul",
    terkunci: "Terkunci",
    aktif: "Berjalan",
    terbuka: "Jurnal terbuka",
    rumpang: (b: number, t: number) => `${b}/${t} rumpang benar`,
    persiapanN: (d: number, t: number) => `persiapan ${d}/${t}`,
    slidesH: "Presentasi",
    slidesKosong: "Belum ada presentasi aktif.",
    huntH: "Perburuan LoRa",
    huntBody:
      "Papan skor berjalan di Orange Pi lab, di jaringan IRIS-IOT. Sambungkan HP ke hotspot itu dulu, lalu buka papan skornya.",
    huntCta: "Buka papan skor",
    hasilH: "Hasil",
    hasilTunggu: "Nilai tampil setelah sesi berakhir.",
    hasilBelum: "Belum ada sesi yang selesai.",
    hasilSebagian: "Beberapa komponen belum diisi asisten.",
    rataRata: "rata rata",
    umpanH: "Umpan balik",
    umpanSudah: "Terima kasih, umpan balikmu sudah tercatat.",
    umpanBuka: "Isi umpan balik",
    umpanNanti: "Formulir terbuka setelah sesi berakhir.",
    praktikumH: "Praktikum saya",
    praktikumKosong:
      "Praktikum yang kamu ikuti akan muncul di sini, lengkap dengan nilai dan umpan baliknya.",
    umpanTerkirim: "Umpan balik terkirim",
    sedangBerjalan: "Sedang berjalan",
    rataN: (n: number) => `rata rata ${n}`,
    belumPraktikum: "Belum praktikum",
    gagal: "Gagal memuat dasbor.",
    coba: "Coba lagi",
  },
  en: {
    halo: (n: string) => `Hi, ${n}`,
    kelompok: (k: number) => `Group ${k}`,
    berjalan: (m: number) => `Session running · Module ${m}`,
    tanpaSesi: "No session running yet",
    sisa: (m: number) => `${m} min left`,
    lewat: (m: number) => `${m} min in`,
    langkahH: "Next step",
    langkah: {
      tunggu: [
        "Wait for the assistant to start",
        "Your module opens here as soon as the session starts.",
      ],
      terkunci: (m: number) => [
        `Module ${m} is not open yet`,
        "The assistant will open it shortly.",
      ],
      persiapan: (m: number) => [
        `Set up Module ${m}`,
        "Check the kit, wire it to the schematic, then tick the list.",
      ],
      kode: (s: number) => [`Finish the code`, `${s} ${s === 1 ? "blank" : "blanks"} to go.`],
      live: (m: number) => [
        `Code complete. Test it live`,
        `Flash the board and watch Module ${m}'s messages flow.`,
      ],
      umpan: ["Give feedback", "Two short sections, about 20 seconds."],
      selesai: ["Session finished", "Thank you. Your scores are in the Results card."],
    },
    cta: {
      persiapan: "Open Setup",
      kode: "Continue coding",
      live: "Open live view",
      umpan: "Do it now",
      selesai: "See results",
      tunggu: "Browse modules",
    },
    alurH: "Your group's flow",
    alurKosong: "The flow appears while a session runs.",
    live: "live",
    sim: "simulated",
    rata: "average Δ",
    selang: "average gap",
    hilang: "lost",
    terakhir: "last message",
    bukaLive: "Open live view",
    progresH: "Module progress",
    terkunci: "Locked",
    aktif: "Running",
    terbuka: "Journal open",
    rumpang: (b: number, t: number) => `${b}/${t} blanks correct`,
    persiapanN: (d: number, t: number) => `setup ${d}/${t}`,
    slidesH: "Slides",
    slidesKosong: "No active slides yet.",
    huntH: "LoRa hunt",
    huntBody:
      "The scoreboard runs on the lab's Orange Pi, on the IRIS-IOT network. Join that hotspot on your phone first, then open the scoreboard.",
    huntCta: "Open scoreboard",
    hasilH: "Results",
    hasilTunggu: "Scores appear once the session ends.",
    hasilBelum: "No finished session yet.",
    hasilSebagian: "Some components are not graded yet.",
    rataRata: "average",
    umpanH: "Feedback",
    umpanSudah: "Thank you, your feedback is recorded.",
    umpanBuka: "Give feedback",
    umpanNanti: "The form opens once the session ends.",
    praktikumH: "My practicums",
    praktikumKosong: "Practicums you join show up here, with their scores and your feedback.",
    umpanTerkirim: "Feedback sent",
    sedangBerjalan: "In progress",
    rataN: (n: number) => `average ${n}`,
    belumPraktikum: "Not done yet",
    gagal: "Could not load the dashboard.",
    coba: "Try again",
  },
});

type Tx = (typeof T)["id"];

const IOT_BOARD_URL = "http://192.168.4.1:8080/";

/* ----------------------------------------------------------- mini flow */

function MiniFlow({
  modul,
  kelompok,
  t,
  lang,
}: {
  modul: number;
  kelompok: number;
  t: Tx;
  lang: Lang;
}) {
  const tel = useTelemetry(modul, kelompok, false, 1500);
  const rows = tel.history.slice(-28);
  const live = tel.live;
  // Modules 2 and 3 carry no send time, so the bars show the gap between
  // arrivals instead of a delay that was never measured.
  const stats = flowStats(rows, 28, live && (modul === 2 || modul === 3));
  const byDelay = rows.some((r) => r.delayMs != null);
  const values = byDelay ? rows.map((r) => r.delayMs) : selangMs(rows);
  const avg = byDelay ? stats.avg : stats.interval;
  const loss = stats.loss;
  const max = Math.max(40, ...values.map((v) => v ?? 0));
  const last = rows[rows.length - 1];

  return (
    <div className="miniflow">
      <div className="miniflow__stats">
        <span className="miniflow__stat">
          <b className="num">{avg ?? "-"}</b>
          <small>ms · {byDelay ? t.rata : t.selang}</small>
        </span>
        <span className="miniflow__stat" data-bad={loss > 10 ? "yes" : undefined}>
          <b className="num">{loss}%</b>
          <small>{t.hilang}</small>
        </span>
        <span className={`pill ${live ? "pill--ok" : "pill--mono"}`}>{live ? t.live : t.sim}</span>
      </div>
      <div className="miniflow__bars" aria-hidden="true">
        {rows.map((r, i) => {
          const v = values[i];
          const lost = r.rx === null;
          return (
            <span
              key={i}
              data-lost={lost ? "yes" : undefined}
              style={{ height: `${lost ? 100 : v == null ? 8 : Math.max(8, (v / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="miniflow__foot">
        <span className="hint mono">
          {t.terakhir} #{last?.seq ?? "-"} {last?.delayMs != null ? `Δ ${last.delayMs} ms` : ""}
        </span>
        <a
          className="btn btn--ghost btn--sm"
          href={href(lang, `/modules/${modul}/live?kelompok=${kelompok}`)}
        >
          {t.bukaLive}
        </a>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- slides */

function Slides({ t, lang }: { t: Tx; lang: Lang }) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; presentasi: { url: string; namaBerkas: string } | null }>(
        "/api/presentasi/aktif",
      ).then((d) => (d.ok ? d.presentasi : null)),
    30_000,
  );
  const p = poll.data;
  if (poll.updatedAt === null) return <span className="skeleton dash__slides-skel" />;
  if (!p) {
    return (
      <div className="dash__slides-empty">
        <span>{t.slidesKosong}</span>
      </div>
    );
  }
  return <PdfViewer url={p.url} name={p.namaBerkas} lang={lang} />;
}

/* ------------------------------------------------------ my practicums */

interface Praktikum {
  sesiId: number;
  modul: number;
  tanggal: string;
  slot: number | null;
  status: string;
  kelas: string;
  sudahUmpanBalik: boolean;
  rataRata: number | null;
}

function MyPracticums({
  list,
  t,
  lang,
  terkirim,
  onFeedback,
}: {
  list: Praktikum[] | null;
  t: Tx;
  lang: Lang;
  terkirim: number | null;
  onFeedback: (sesiId: number) => void;
}) {
  if (!list) return <span className="skeleton" style={{ height: 96 }} />;
  if (list.length === 0) return <p className="dash__muted">{t.praktikumKosong}</p>;
  const fmt = new Intl.DateTimeFormat(localeOf(lang), {
    day: "numeric",
    month: "short",
  });
  return (
    <ul className="dash__prak">
      {list.map((p) => {
        const sudah = p.sudahUmpanBalik || terkirim === p.sesiId;
        return (
          <li
            key={p.sesiId}
            className="dash__prak-row"
            style={{ "--mod-hue": `var(--mod-${p.modul})` } as React.CSSProperties}
          >
            <span className="mono dash__mod-n">M{p.modul}</span>
            <span className="grow stack" style={{ gap: 2 }}>
              <b>{MODUL_NAMA[p.modul]}</b>
              <span className="hint num">
                {fmt.format(new Date(`${p.tanggal}T00:00:00`))}
                {p.rataRata != null ? ` · ${t.rataN(p.rataRata)}` : ""}
              </span>
            </span>
            {p.status !== "selesai" ? (
              <span className="pill pill--ok">{t.sedangBerjalan}</span>
            ) : sudah ? (
              <span className="pill">{t.umpanTerkirim}</span>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => onFeedback(p.sesiId)}
              >
                {t.umpanBuka}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------- results */

function Results({ hasil, t }: { hasil: Hasil | null; t: Tx }) {
  if (!hasil) return <span className="skeleton" style={{ height: 96 }} />;
  if (!hasil.ok || !hasil.sesi) return <p className="hint">{t.hasilBelum}</p>;
  if (!hasil.skor) {
    return <p className="dash__muted">{t.hasilTunggu}</p>;
  }
  return (
    <div className="dash__hasil">
      <div className="dash__hasil-avg">
        <span className="num">
          {hasil.rataRata == null ? "-" : <CountUp value={hasil.rataRata} />}
        </span>
        <small>{t.rataRata}</small>
      </div>
      <div className="dash__hasil-grid">
        {NILAI_KOMPONEN.map((k, i) => (
          <span key={k} className="dash__hasil-cell" style={{ "--i": i } as React.CSSProperties}>
            <small className="mono">{k}</small>
            <b className="num">{hasil.skor?.[k] ?? "-"}</b>
          </span>
        ))}
      </div>
      {!hasil.lengkap && <p className="hint">{t.hasilSebagian}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- next step */

function NextStep({
  langkah,
  lang,
  t,
  terkunci,
  onFeedback,
}: {
  langkah: Langkah;
  lang: Lang;
  t: Tx;
  terkunci: number | null;
  onFeedback: () => void;
}) {
  let judul: string;
  let isi: string;
  let cta: { label: string; href?: string; onClick?: () => void } | null = null;
  switch (langkah.jenis) {
    case "persiapan":
      [judul, isi] = t.langkah.persiapan(langkah.modul);
      cta = { label: t.cta.persiapan, href: href(lang, `/modules/${langkah.modul}?step=setup`) };
      break;
    case "kode":
      [judul, isi] = t.langkah.kode(langkah.sisa);
      cta = { label: t.cta.kode, href: href(lang, `/modules/${langkah.modul}?step=code`) };
      break;
    case "live":
      [judul, isi] = t.langkah.live(langkah.modul);
      cta = { label: t.cta.live, href: href(lang, `/modules/${langkah.modul}/live`) };
      break;
    case "umpan_balik":
      [judul, isi] = t.langkah.umpan;
      cta = { label: t.cta.umpan, onClick: onFeedback };
      break;
    case "selesai":
      [judul, isi] = t.langkah.selesai;
      cta = {
        label: t.cta.selesai,
        onClick: () =>
          document
            .getElementById("dash-hasil")
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      };
      break;
    default:
      [judul, isi] = terkunci ? t.langkah.terkunci(terkunci) : t.langkah.tunggu;
      cta = { label: t.cta.tunggu, href: href(lang, "/modules") };
  }
  const aktif = langkah.jenis !== "tunggu";
  return (
    <section
      className={`dash__next${aktif ? " sweep-live" : ""}`}
      data-jenis={langkah.jenis}
      aria-labelledby="dash-next-h"
    >
      <span className="label-caps" id="dash-next-h">
        {t.langkahH}
      </span>
      <div className="dash__next-body">
        <div className="stack stack--sm">
          <b className="dash__next-title">{judul}</b>
          <span className="hint">{isi}</span>
        </div>
      </div>
      {cta &&
        (cta.href ? (
          <a
            className={`btn ${aktif ? "btn--primary" : "btn--ghost"} btn--lg dash__cta`}
            href={cta.href}
          >
            {cta.label}
          </a>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg dash__cta"
            onClick={cta.onClick}
          >
            {cta.label}
          </button>
        ))}
    </section>
  );
}

/* ----------------------------------------------------------- dashboard */

export default function Dashboard({ lang, modules }: { lang: Lang; modules: ModulInfo[] }) {
  const t = T[lang];
  const me = useMe();
  const praktikan = me?.role === "praktikan";
  const now = useSessionNow(20_000, praktikan);
  const hasilPoll = usePoll(() => getJson<Hasil>("/api/session/results"), 30_000, praktikan);
  const minePoll = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    60_000,
    praktikan,
  );
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [jurnal, setJurnal] = useState<number[] | null>(null);
  // The practicum the feedback form is about, and its assistant choices.
  const [fbSesi, setFbSesi] = useState<number | null>(null);
  const [fbHasil, setFbHasil] = useState<Hasil | null>(null);
  const fbOpen = fbSesi !== null;
  const [fbSent, setFbSent] = useState(false);
  function bukaUmpan(sesiId: number | null | undefined) {
    if (!sesiId) return;
    setFbHasil(null);
    setFbSesi(sesiId);
    void getJson<Hasil>(`/api/session/results?sesiId=${sesiId}`)
      .then(setFbHasil)
      .catch(() => setFbHasil(null));
  }
  const [, force] = useState(0);

  useEffect(() => {
    if (me === null) location.assign(href(lang, "/?login=1&next=/dashboard"));
    else if (me?.role === "asisten") location.replace(href(lang, "/session"));
  }, [me, lang]);

  useEffect(() => {
    if (!praktikan) return;
    void getAksesState(true).then((s) => setTerbuka(s.terbuka));
    void getJson<{ ok: boolean; jurnal: number[] }>("/api/session/jurnal")
      .then((d) => setJurnal(d.ok ? d.jurnal : []))
      .catch(() => setJurnal([]));
  }, [praktikan, now.data?.modul]);

  // Re-read the local checklist when the student comes back to this tab.
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && force((n) => n + 1);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const progres = useProgres(modules, terbuka);
  const sesi = now.data;
  const hasil = hasilPoll.data;
  const selesai = !sesi && hasil?.ok && hasil.sesi?.status === "selesai" ? hasil.sesi : null;
  const sudahFb = fbSent || Boolean(hasil?.sudahUmpanBalik);

  const langkah = useMemo<Langkah>(() => {
    const modul = sesi?.modul ?? selesai?.modul;
    const info = modules.find((m) => m.modul === modul);
    const progresOk: Record<number, { benar: number; total: number }> = {};
    for (const [k, v] of Object.entries(progres)) if (v) progresOk[Number(k)] = v;
    return langkahBerikutnya({
      sesi: sesi
        ? { modul: sesi.modul, selesai: false }
        : selesai
          ? { modul: selesai.modul, selesai: true }
          : null,
      terbuka: jurnal ?? terbuka ?? [],
      progres: progresOk,
      persiapanSelesai: info ? readSetup(info.modul).length >= info.persiapan : false,
      sudahUmpanBalik: sudahFb,
    });
  }, [sesi, selesai, terbuka, jurnal, progres, sudahFb, modules]);

  // ?feedback=1 (the QR on the projector) opens the form straight away.
  useEffect(() => {
    if (!hasil?.ok || sudahFb) return;
    const q = new URLSearchParams(location.search);
    if (q.get("feedback") === "1" && hasil.sesi?.status === "selesai") bukaUmpan(hasil.sesi.id);
  }, [hasil, sudahFb]);

  if (me === undefined || (praktikan && hasilPoll.updatedAt === null && hasilPoll.errors === 0)) {
    return (
      <div className="dash" aria-busy="true">
        <span className="skeleton" style={{ height: 150 }} />
        <div className="dash__grid">
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
        icon={<TimerIcon size={28} />}
        title={t.gagal}
        actions={
          <button type="button" className="btn btn--primary" onClick={hasilPoll.refresh}>
            {t.coba}
          </button>
        }
      />
    );
  }

  const k = me.kelompok ?? 0;
  const nama = me.nama.split(/\s+/)[0] ?? me.nama;
  const menit = sesi ? menitBerjalan(sesi.mulaiPada) : 0;
  const sisa = Math.max(0, SESI_CAP_MENIT - menit);
  const pct = Math.min(100, (menit / SESI_CAP_MENIT) * 100);
  const modulSesi = sesi?.modul ?? null;
  const terkunciSesi = modulSesi && terbuka && !terbuka.includes(modulSesi) ? modulSesi : null;

  return (
    <div className="dash" style={{ "--g": `var(--group-${k || 1})` } as React.CSSProperties}>
      <header className="dash__hero sweep-edge">
        <div className="dash__hero-id">
          <span className="dash__badge">
            <span className="dash__badge-dot" aria-hidden="true" />
            {t.kelompok(k)}
            {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
          </span>
          <h1 className="dash__hello">{t.halo(nama)}</h1>
          {sesi ? (
            <div className="dash__session">
              <span className="dash__session-label">
                <span className="dot dot--ok dot--pulse" aria-hidden="true" />
                {t.berjalan(sesi.modul)} · {MODUL_NAMA[sesi.modul]}
              </span>
              <span className="dash__track" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="hint num">
                {t.lewat(menit)} · {t.sisa(sisa)}
              </span>
            </div>
          ) : (
            <span className="hint">{t.tanpaSesi}</span>
          )}
        </div>
        <NextStep
          langkah={langkah}
          lang={lang}
          t={t}
          terkunci={terkunciSesi}
          onFeedback={() => bukaUmpan(hasil?.sesi?.id)}
        />
      </header>

      <div className="dash__grid">
        <div className="dash__main">
          {sesi && (
            <section className="panel dash__o-slides">
              <div className="panel__head">
                <h2 className="panel__title">{t.slidesH}</h2>
              </div>
              <Slides t={t} lang={lang} />
            </section>
          )}

          <section className="panel dash__o-mods">
            <div className="panel__head">
              <h2 className="panel__title">{t.progresH}</h2>
            </div>
            <ul className="dash__mods">
              {modules.map((m, i) => {
                const buka = terbuka ? terbuka.includes(m.modul) : true;
                const lock = jurnal ? !jurnal.includes(m.modul) : !buka;
                const run = modulSesi === m.modul;
                const p = progres[m.modul];
                const total = m.berkas.reduce((a, b) => a + b.blanks, 0);
                const setup = Math.min(readSetup(m.modul).length, m.persiapan);
                return (
                  <li
                    key={m.modul}
                    style={
                      { "--i": i, "--mod-hue": `var(--mod-${m.modul})` } as React.CSSProperties
                    }
                  >
                    <a
                      className="dash__mod"
                      href={href(lang, `/modules/${m.modul}`)}
                      data-locked={lock ? "yes" : undefined}
                      data-run={run ? "yes" : undefined}
                    >
                      <ProgressRing
                        value={p?.benar ?? 0}
                        max={p?.total ?? (total || 1)}
                        size="md"
                        color={p && p.benar === p.total ? "var(--ok)" : `var(--mod-${m.modul})`}
                      />
                      <span className="dash__mod-text">
                        <span className="dash__mod-name">
                          <span className="mono dash__mod-n">M{m.modul}</span>
                          <b>{m.judul}</b>
                        </span>
                        {lock ? (
                          <span className="hint">{m.topik}</span>
                        ) : (
                          <span className="dash__mod-stats">
                            <span>{t.rumpang(p?.benar ?? 0, total)}</span>
                            <span>{t.persiapanN(setup, m.persiapan)}</span>
                          </span>
                        )}
                      </span>
                      <span className={`pill ${run ? "pill--ok" : lock ? "" : "pill--accent"}`}>
                        {run ? t.aktif : !lock ? t.terbuka : buka ? t.belumPraktikum : t.terkunci}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="dash__side">
          <section className="panel dash__group dash__o-flow">
            <div className="panel__head">
              <h2 className="panel__title">{t.alurH}</h2>
              <span
                className="pill pill--group"
                style={{ "--pill-hue": `var(--group-${k || 1})` } as React.CSSProperties}
              >
                K{k}
              </span>
            </div>
            {sesi && k ? (
              <MiniFlow modul={sesi.modul} kelompok={k} t={t} lang={lang} />
            ) : (
              <p className="hint">{t.alurKosong}</p>
            )}
          </section>

          {sesi?.modul === 4 && (
            <section className="panel dash__hunt sweep-edge dash__o-flow">
              <h2 className="panel__title">{t.huntH}</h2>
              <p className="hint">{t.huntBody}</p>
              <a
                className="btn btn--primary"
                href={`${IOT_BOARD_URL}?nim=${encodeURIComponent(me.nim)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.huntCta}
              </a>
            </section>
          )}

          <section className="panel dash__o-hasil" id="dash-hasil">
            <h2 className="panel__title">{t.hasilH}</h2>
            <Results hasil={hasil} t={t} />
          </section>

          <section className="panel dash__o-hasil">
            <h2 className="panel__title">{t.praktikumH}</h2>
            <MyPracticums
              list={minePoll.data?.ok ? minePoll.data.praktikum : null}
              t={t}
              lang={lang}
              terkirim={fbSent ? fbSesi : null}
              onFeedback={bukaUmpan}
            />
          </section>
        </aside>
      </div>

      <Dialog
        open={fbOpen}
        onOpenChange={(o) => !o && setFbSesi(null)}
        title={t.umpanH}
        size="lg"
        lang={lang}
      >
        {fbHasil?.ok && fbSesi ? (
          <FeedbackForm
            key={fbSesi}
            lang={lang}
            sesiId={fbSesi}
            asisten={fbHasil.asisten ?? null}
            pilihan={fbHasil.pilihanAsisten ?? []}
            onDone={() => {
              setFbSent(true);
              setFbSesi(null);
              hasilPoll.refresh();
              minePoll.refresh();
            }}
          />
        ) : (
          <span className="skeleton" style={{ height: 240 }} />
        )}
      </Dialog>

      {sesi && <CoachMarks lang={lang} />}
    </div>
  );
}
