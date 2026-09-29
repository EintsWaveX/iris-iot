/**
 * /dashboard and /en/dashboard (Phase 8): the praktikan's home. One island
 * replacing the old vanilla page, built around a single question, "what do
 * I do next?", answered by langkahBerikutnya() (lib/langkah.ts) from the
 * running session, the module locks, the Persiapan checklist and the code
 * progress. Around it: the group's live mini flow, progress per module,
 * the assistant's slides, the Module 4 hunt, results after the session and
 * the two-section feedback form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Award,
  ClipboardCheck,
  Code2,
  Expand,
  ExternalLink,
  Lock,
  MessageSquareHeart,
  Presentation,
  Radio,
  Satellite,
  Sparkles,
  Timer,
} from "lucide-react";
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
} from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import { langkahBerikutnya, type Langkah } from "../../lib/langkah";
import { NILAI_KOMPONEN } from "../../lib/nilai-komponen";
import { startPolling } from "../../scripts/polling";
import { getAksesState } from "../../scripts/modul-akses";
import { readSetup } from "../module/SetupChecklist";
import { fetchLiveReading, resetLiveReadingMemory } from "../../lib/telemetry-live";
import { nextReading, type Reading } from "../../lib/telemetry-sim";
import type { Lang } from "../../lib/kelas";
import FeedbackForm from "./FeedbackForm";
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
  asisten?: { nim: string; kode: string } | null;
  sudahUmpanBalik?: boolean;
  skor?: Partial<Record<string, number>> | null;
  rataRata?: number | null;
  lengkap?: boolean;
}

const T = {
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
    hilang: "hilang",
    terakhir: "pesan terakhir",
    bukaLive: "Buka ruang live",
    progresH: "Progres modul",
    terkunci: "Terkunci",
    aktif: "Berjalan",
    terbuka: "Terbuka",
    rumpang: (b: number, t: number) => `${b}/${t} rumpang benar`,
    persiapanN: (d: number, t: number) => `persiapan ${d}/${t}`,
    slidesH: "Presentasi",
    slidesKosong: "Belum ada presentasi aktif.",
    layarPenuh: "Layar penuh",
    tabBaru: "Buka di tab baru",
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
      kode: (s: number) => [`Finish the code`, `${s} blanks to go.`],
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
    hilang: "lost",
    terakhir: "last message",
    bukaLive: "Open live view",
    progresH: "Module progress",
    terkunci: "Locked",
    aktif: "Running",
    terbuka: "Open",
    rumpang: (b: number, t: number) => `${b}/${t} blanks correct`,
    persiapanN: (d: number, t: number) => `setup ${d}/${t}`,
    slidesH: "Slides",
    slidesKosong: "No active slides yet.",
    layarPenuh: "Fullscreen",
    tabBaru: "Open in a new tab",
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
    gagal: "Could not load the dashboard.",
    coba: "Try again",
  },
};

type Tx = (typeof T)["id"];

const IOT_BOARD_URL = "http://192.168.4.1:8080/";

/* ------------------------------------------------------------ progress */

type Progres = Record<number, { benar: number; total: number } | null>;

function useProgres(modules: ModulInfo[], terbuka: number[] | null): Progres {
  const [p, setP] = useState<Progres>({});
  useEffect(() => {
    if (!terbuka) return;
    let alive = true;
    void (async () => {
      const out: Progres = {};
      for (const m of modules) {
        if (!terbuka.includes(m.modul)) continue;
        const total = m.berkas.reduce((a, b) => a + b.blanks, 0);
        try {
          const rows = await Promise.all(
            m.berkas.map((b) =>
              getJson<{ ok: boolean; jawaban?: Record<string, { benar: boolean }> }>(
                `/api/modul/draft?modul=${m.modul}&berkas=${b.slug}`,
              ),
            ),
          );
          if (rows.some((r) => !r.ok)) {
            out[m.modul] = null;
            continue;
          }
          const benar = rows.reduce(
            (a, r) => a + Object.values(r.jawaban ?? {}).filter((x) => x.benar).length,
            0,
          );
          out[m.modul] = { benar: Math.min(benar, total), total };
        } catch {
          out[m.modul] = null;
        }
      }
      if (alive) setP(out);
    })();
    return () => {
      alive = false;
    };
  }, [modules, terbuka]);
  return p;
}

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
  const [rows, setRows] = useState<Reading[]>([]);
  const [live, setLive] = useState(false);
  useEffect(() => {
    setRows([]);
    setLive(false);
    resetLiveReadingMemory(modul, kelompok);
    let isLive = false;
    return startPolling(async () => {
      if (modul !== 1) {
        const r = await fetchLiveReading(modul, kelompok);
        if (r) {
          isLive = true;
          setLive(true);
          setRows((p) => [...p, r].slice(-28));
          return;
        }
        if (isLive) return;
      }
      setRows((p) => [...p, nextReading(modul, kelompok)].slice(-28));
    }, 1500);
  }, [modul, kelompok]);

  const ok = rows.filter((r) => r.delayMs != null);
  const avg = ok.length
    ? Math.round(ok.reduce((a, r) => a + (r.delayMs ?? 0), 0) / ok.length)
    : null;
  const loss = rows.length ? Math.round(((rows.length - ok.length) / rows.length) * 100) : 0;
  const max = Math.max(40, ...ok.map((r) => r.delayMs ?? 0));
  const last = rows[rows.length - 1];

  return (
    <div className="miniflow">
      <div className="miniflow__stats">
        <span className="miniflow__stat">
          <b className="num">{avg ?? "-"}</b>
          <small>ms · {t.rata}</small>
        </span>
        <span className="miniflow__stat" data-bad={loss > 10 ? "yes" : undefined}>
          <b className="num">{loss}%</b>
          <small>{t.hilang}</small>
        </span>
        <span className={`pill ${live ? "pill--ok" : "pill--mono"}`}>
          <Radio size={13} aria-hidden="true" />
          {live ? t.live : t.sim}
        </span>
      </div>
      <div className="miniflow__bars" aria-hidden="true">
        {rows.map((r) => (
          <span
            key={r.seq}
            data-lost={r.delayMs == null ? "yes" : undefined}
            style={{
              height: `${r.delayMs == null ? 100 : Math.max(8, ((r.delayMs ?? 0) / max) * 100)}%`,
            }}
          />
        ))}
      </div>
      <div className="miniflow__foot">
        <span className="hint mono">
          {t.terakhir} #{last?.seq ?? "-"} {last?.delayMs != null ? `Δ ${last.delayMs} ms` : ""}
        </span>
        <a
          className="btn btn--ghost btn--sm"
          href={href(lang, `/modules/${modul}/live?kelompok=${kelompok}`)}
        >
          {t.bukaLive} <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- slides */

function Slides({ t }: { t: Tx }) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; presentasi: { url: string; namaBerkas: string } | null }>(
        "/api/presentasi/aktif",
      ).then((d) => (d.ok ? d.presentasi : null)),
    30_000,
  );
  const box = useRef<HTMLDivElement>(null);
  const p = poll.data;
  if (poll.updatedAt === null) return <span className="skeleton dash__slides-skel" />;
  if (!p) {
    return (
      <div className="dash__slides-empty">
        <Presentation size={28} aria-hidden="true" />
        <span>{t.slidesKosong}</span>
      </div>
    );
  }
  return (
    <div className="dash__slides">
      <div className="dash__slides-frame" ref={box}>
        <iframe key={p.url} src={p.url} title={p.namaBerkas} />
      </div>
      <div className="dash__slides-bar">
        <span className="hint dash__slides-name">{p.namaBerkas}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void box.current?.requestFullscreen?.()}
        >
          <Expand size={15} aria-hidden="true" />
          {t.layarPenuh}
        </button>
        <a
          className="btn btn--ghost btn--sm"
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} aria-hidden="true" />
          {t.tabBaru}
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- results */

function Results({ hasil, t }: { hasil: Hasil | null; t: Tx }) {
  if (!hasil) return <span className="skeleton" style={{ height: 96 }} />;
  if (!hasil.ok || !hasil.sesi) return <p className="hint">{t.hasilBelum}</p>;
  if (!hasil.skor) {
    return (
      <p className="dash__muted">
        <Lock size={16} aria-hidden="true" />
        {t.hasilTunggu}
      </p>
    );
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
  let Icon = Timer;
  switch (langkah.jenis) {
    case "persiapan":
      [judul, isi] = t.langkah.persiapan(langkah.modul);
      cta = { label: t.cta.persiapan, href: href(lang, `/modules/${langkah.modul}?step=setup`) };
      Icon = ClipboardCheck;
      break;
    case "kode":
      [judul, isi] = t.langkah.kode(langkah.sisa);
      cta = { label: t.cta.kode, href: href(lang, `/modules/${langkah.modul}?step=code`) };
      Icon = Code2;
      break;
    case "live":
      [judul, isi] = t.langkah.live(langkah.modul);
      cta = { label: t.cta.live, href: href(lang, `/modules/${langkah.modul}/live`) };
      Icon = Satellite;
      break;
    case "umpan_balik":
      [judul, isi] = t.langkah.umpan;
      cta = { label: t.cta.umpan, onClick: onFeedback };
      Icon = MessageSquareHeart;
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
      Icon = Award;
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
        <span className="dash__next-icon" aria-hidden="true">
          <Icon size={26} />
        </span>
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
            {cta.label} <ArrowRight size={18} aria-hidden="true" />
          </a>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg dash__cta"
            onClick={cta.onClick}
          >
            {cta.label} <ArrowRight size={18} aria-hidden="true" />
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
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [fbOpen, setFbOpen] = useState(false);
  const [fbSent, setFbSent] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    if (me === null) location.assign(href(lang, "/?login=1&next=/dashboard"));
    else if (me?.role === "asisten") location.replace(href(lang, "/session"));
  }, [me, lang]);

  useEffect(() => {
    if (!praktikan) return;
    void getAksesState(true).then((s) => setTerbuka(s.terbuka));
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
      terbuka: terbuka ?? [],
      progres: progresOk,
      persiapanSelesai: info ? readSetup(info.modul).length >= info.persiapan : false,
      sudahUmpanBalik: sudahFb,
    });
  }, [sesi, selesai, terbuka, progres, sudahFb, modules]);

  // ?feedback=1 (the QR on the projector) opens the form straight away.
  useEffect(() => {
    if (!hasil?.ok || sudahFb) return;
    const q = new URLSearchParams(location.search);
    if (q.get("feedback") === "1" && hasil.sesi?.status === "selesai") setFbOpen(true);
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
        icon={<Timer size={28} />}
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
          onFeedback={() => setFbOpen(true)}
        />
      </header>

      <div className="dash__grid">
        <div className="dash__main">
          <section className="panel dash__o-slides">
            <div className="panel__head">
              <h2 className="panel__title">
                <Presentation size={18} aria-hidden="true" />
                {t.slidesH}
              </h2>
            </div>
            <Slides t={t} />
          </section>

          <section className="panel dash__o-mods">
            <div className="panel__head">
              <h2 className="panel__title">
                <Sparkles size={18} aria-hidden="true" />
                {t.progresH}
              </h2>
            </div>
            <ul className="dash__mods">
              {modules.map((m, i) => {
                const lock = terbuka ? !terbuka.includes(m.modul) : false;
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
                        {lock && <Lock size={12} aria-hidden="true" />}
                        {run ? t.aktif : lock ? t.terkunci : t.terbuka}
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
              <h2 className="panel__title">
                <Radio size={18} aria-hidden="true" />
                {t.alurH}
              </h2>
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
              <h2 className="panel__title">
                <Satellite size={18} aria-hidden="true" />
                {t.huntH}
              </h2>
              <p className="hint">{t.huntBody}</p>
              <a
                className="btn btn--primary"
                href={`${IOT_BOARD_URL}?nim=${encodeURIComponent(me.nim)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.huntCta} <ExternalLink size={16} aria-hidden="true" />
              </a>
            </section>
          )}

          <section className="panel dash__o-hasil" id="dash-hasil">
            <h2 className="panel__title">
              <Award size={18} aria-hidden="true" />
              {t.hasilH}
            </h2>
            <Results hasil={hasil} t={t} />
          </section>

          <section className="panel dash__o-hasil">
            <h2 className="panel__title">
              <MessageSquareHeart size={18} aria-hidden="true" />
              {t.umpanH}
            </h2>
            {sudahFb ? (
              <p className="dash__muted dash__muted--ok">{t.umpanSudah}</p>
            ) : hasil?.sesi?.status === "selesai" ? (
              <button type="button" className="btn btn--primary" onClick={() => setFbOpen(true)}>
                {t.umpanBuka}
              </button>
            ) : (
              <p className="dash__muted">
                <Lock size={16} aria-hidden="true" />
                {t.umpanNanti}
              </p>
            )}
          </section>
        </aside>
      </div>

      <Dialog open={fbOpen} onOpenChange={setFbOpen} title={t.umpanH} size="lg" lang={lang}>
        <FeedbackForm
          lang={lang}
          asisten={hasil?.asisten ?? null}
          onDone={() => {
            setFbSent(true);
            setFbOpen(false);
            hasilPoll.refresh();
          }}
        />
      </Dialog>

      {sesi && <CoachMarks lang={lang} />}
    </div>
  );
}
