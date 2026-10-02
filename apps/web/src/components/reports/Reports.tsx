/**
 * /reports and /en/reports (Phase 8), assistants only. Replaces the old
 * Indonesian-only ReportsView.tsx.
 *
 * Home, in four tabs:
 * - Sesi: a heat strip of sessions per day, filters (module, status,
 *   class, dates), and rows with class type, who taught, and the Lab
 *   feedback average. Asisten ratings never appear here, only in each
 *   assistant's own "Umpan balik saya".
 * - Ringkasan modul: per module counts, blank accuracy and Lab feedback.
 * - Umpan balik lab: the anonymous Lab summary across every session.
 * - Audit: readable action labels and assistant codes instead of NIMs.
 *
 * A session's own report (?sesi=N): group cards with the assigned
 * assistant, the Lab feedback for that session, the viewer's own Asisten
 * feedback when they handled a group, two charts with their legends
 * outside the plot, and CSV exports.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { namaAsisten } from "../../lib/people";
import BackButton from "../ui/BackButton";
import Fade from "../ui/Fade";
import { LockSimpleIcon, StarIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { DropdownFilter } from "../ui/Dropdown";
import DateRangePicker from "../ui/DateRangePicker";
import ScrollArea from "../ui/ScrollArea";
import { CountUp, StateView } from "../ui/Display";
import FeedbackSummary from "../shared/FeedbackSummary";
import { getJson, href, MODUL_NAMA, namaKelompok, useMe, localeOf, dict } from "../../lib/app";
import { unduhCsv } from "../../lib/csv";
import { onTablistKeyDown } from "../../lib/tablist-keys";
import type { Lang } from "../../lib/kelas";
import type { Ringkasan } from "../../lib/umpan-balik";
import "../ui/Tabs.css";
import "uplot/dist/uPlot.min.css";
import "./Reports.css";
import { chartColors, useThemeKey, warnaKelompok } from "../../lib/chart-colors";

/* ---------------------------------------------------------------- copy */

const T = dict({
  id: {
    title: "Laporan",
    sub: "Riwayat sesi, ringkasan tiap modul, umpan balik lab dan log audit.",
    tabs: { sesi: "Sesi", ringkasan: "Ringkasan modul", lab: "Umpan balik lab", audit: "Audit" },
    parts: "Bagian laporan",
    modul: "Modul",
    status: "Status",
    kelas: "Kelas",
    st: {
      terjadwal: "Terjadwal",
      berjalan: "Berjalan",
      selesai: "Selesai",
      batal: "Batal",
    } as Record<string, string>,
    reguler: "Reguler",
    inter: "Internasional",
    internasional: "Internasional",
    heat: "Sesi per hari",
    heatN: (n: number) => `${n} sesi`,
    cols: ["Tanggal", "Mulai", "Modul", "Kelas", "Asisten", "Status", "Durasi", "Lab"],
    none: "Tidak ada sesi yang cocok dengan filter ini.",
    loading: "Memuat…",
    menit: (m: number) => `${m} menit`,
    jam: (h: number, m: number) => `${h} jam ${m} menit`,
    labN: (n: number) => `${n} tanggapan`,
    runs: "Sesi dijalankan",
    done: "Selesai",
    unique: "Praktikan hadir (unik)",
    blanks: "Rumpang benar",
    labAvg: "Rata rata lab",
    labSub: "Anonim, dari semua sesi. Bagian Asisten hanya terlihat oleh asisten yang dinilai.",
    labEmpty: "Belum ada umpan balik lab.",
    aksi: "Aksi",
    aktor: "Aktor",
    time: "Waktu",
    detail: "Detail",
    auditNone: "Tidak ada log yang cocok.",
    back: "Daftar Sesi",
    csvA: "CSV anggota",
    csvB: "CSV rumpang",
    held: "Asisten",
    unassigned: "Belum ditugaskan",
    hadir: "Hadir",
    telem: "Telemetri diterima",
    median: "Delay median",
    serial: "lihat output serial",
    role: "Peran",
    chartBlank: "Rumpang benar dari waktu ke waktu",
    chartDelay: "Delay per kelompok",
    kelompok: (n: number) => `Kelompok ${n}`,
    delay: ["Delay median (ms)", "Delay minimum (ms)", "Delay maksimum (ms)"],
    labThis: "Umpan balik lab sesi ini",
    mineThis: "Umpan balik untukmu di sesi ini",
    mineSub: "Hanya kamu yang melihat ini.",
    notFound: "Sesi ini tidak ditemukan.",
    err: "Terjadi kesalahan. Coba lagi.",
    forbiddenH: "Khusus asisten",
    forbidden: "Masuk sebagai asisten untuk melihat laporan.",
    home: "Ke beranda",
    auditLabel: {
      sesi_mulai: "Memulai sesi",
      sesi_akhiri: "Mengakhiri sesi",
      sesi_batal: "Membatalkan sesi",
      sesi_lanjutkan: "Melanjutkan sesi",
      sesi_siarkan: "Mengirim pengumuman",
      sesi_kelompok_set: "Mengubah status kelompok",
      sesi_kelompok_catatan: "Menulis catatan kelompok",
      nilai_set: "Mengisi nilai",
      roster_set: "Menyimpan roster",
      modul_akses_ubah: "Mengubah akses modul",
      bantuan_selesai: "Menyelesaikan permintaan bantuan",
      penugasan_ubah: "Mengubah penugasan",
      penugasan_ambil_alih: "Mengambil alih kelompok",
      jadwal_impor: "Mengimpor jadwal",
      jadwal_ubah: "Mengubah slot jadwal",
      masuk_asisten: "Masuk",
      sandi_diatur: "Mengatur sandi",
      sandi_diganti: "Mengganti sandi",
      presentasi_unggah: "Mengunggah presentasi",
      presentasi_aktifkan: "Mengaktifkan presentasi",
      presentasi_nonaktifkan: "Menonaktifkan presentasi",
      presentasi_hapus: "Menghapus presentasi",
      skema_unggah: "Mengunggah skema",
      skema_aktifkan: "Mengaktifkan skema",
      skema_bawaan: "Kembali ke skema bawaan",
      skema_hapus: "Menghapus skema",
      server_daftar: "Mendaftarkan server",
      server_ubah: "Mengubah server",
      server_hapus: "Menghapus server",
      server_token_baru: "Membuat token server baru",
      perintah_kirim: "Mengirim perintah",
      perintah_ulang: "Mengulang perintah",
      perintah_batal: "Membatalkan perintah",
      perangkat_adopsi: "Mengadopsi perangkat",
      perangkat_ubah: "Mengubah perangkat",
      perangkat_lupakan: "Melupakan perangkat",
      perangkat_sembunyi: "Menyembunyikan perangkat",
      perangkat_tampilkan: "Menampilkan perangkat",
    } as Record<string, string>,
  },
  en: {
    title: "Reports",
    sub: "Session history, a summary per module, lab feedback and the audit log.",
    tabs: { sesi: "Sessions", ringkasan: "Module summary", lab: "Lab feedback", audit: "Audit" },
    parts: "Report sections",
    modul: "Module",
    status: "Status",
    kelas: "Class",
    st: {
      terjadwal: "Scheduled",
      berjalan: "Running",
      selesai: "Finished",
      batal: "Cancelled",
    } as Record<string, string>,
    reguler: "Regular",
    inter: "International",
    internasional: "International",
    heat: "Sessions per day",
    heatN: (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`,
    cols: ["Date", "Start", "Module", "Class", "Assistants", "Status", "Duration", "Lab"],
    none: "No sessions match these filters.",
    loading: "Loading…",
    menit: (m: number) => `${m} minutes`,
    jam: (h: number, m: number) => `${h} hours ${m} minutes`,
    labN: (n: number) => `${n} ${n === 1 ? "response" : "responses"}`,
    runs: "Sessions run",
    done: "Finished",
    unique: "Students present (unique)",
    blanks: "Correct blanks",
    labAvg: "Lab average",
    labSub:
      "Anonymous, across every session. The Assistant half is only visible to the assessed assistant.",
    labEmpty: "No lab feedback yet.",
    aksi: "Action",
    aktor: "Actor",
    time: "Time",
    detail: "Detail",
    auditNone: "No log entries match.",
    back: "Session List",
    csvA: "Members CSV",
    csvB: "Blanks CSV",
    held: "Assistant",
    unassigned: "Not assigned",
    hadir: "Present",
    telem: "Telemetry received",
    median: "Median delay",
    serial: "see the serial output",
    role: "Role",
    chartBlank: "Correct blanks over time",
    chartDelay: "Delay per group",
    kelompok: (n: number) => `Group ${n}`,
    delay: ["Median delay (ms)", "Minimum delay (ms)", "Maximum delay (ms)"],
    labThis: "Lab feedback for this session",
    mineThis: "Feedback about you in this session",
    mineSub: "Only you see this.",
    notFound: "This session was not found.",
    err: "Something went wrong. Try again.",
    forbiddenH: "Assistants only",
    forbidden: "Sign in as an assistant to see the reports.",
    home: "Go home",
    auditLabel: {
      sesi_mulai: "Started a session",
      sesi_akhiri: "Ended a session",
      sesi_batal: "Cancelled a session",
      sesi_lanjutkan: "Resumed a session",
      sesi_siarkan: "Sent an announcement",
      sesi_kelompok_set: "Changed a group's status",
      sesi_kelompok_catatan: "Wrote a group note",
      nilai_set: "Entered a score",
      roster_set: "Saved the roster",
      modul_akses_ubah: "Changed module access",
      bantuan_selesai: "Resolved a help request",
      penugasan_ubah: "Changed an assignment",
      penugasan_ambil_alih: "Took over a group",
      jadwal_impor: "Imported the schedule",
      jadwal_ubah: "Changed a schedule slot",
      masuk_asisten: "Signed in",
      sandi_diatur: "Set a password",
      sandi_diganti: "Changed the password",
      presentasi_unggah: "Uploaded slides",
      presentasi_aktifkan: "Activated slides",
      presentasi_nonaktifkan: "Deactivated slides",
      presentasi_hapus: "Deleted slides",
      skema_unggah: "Uploaded a schematic",
      skema_aktifkan: "Activated a schematic",
      skema_bawaan: "Back to the bundled schematic",
      skema_hapus: "Deleted a schematic",
      server_daftar: "Enrolled a server",
      server_ubah: "Changed a server",
      server_hapus: "Deleted a server",
      server_token_baru: "Issued a new server token",
      perintah_kirim: "Sent a command",
      perintah_ulang: "Retried a command",
      perintah_batal: "Cancelled a command",
      perangkat_adopsi: "Adopted a device",
      perangkat_ubah: "Changed a device",
      perangkat_lupakan: "Forgot a device",
      perangkat_sembunyi: "Hid a device",
      perangkat_tampilkan: "Showed a device",
    } as Record<string, string>,
  },
});
type Tx = (typeof T)["id"];

// Median, minimum and maximum delay: the first three chart tokens.
const DELAY_TOKEN = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)"];

function fmtDurasi(sec: number | null, t: Tx): string {
  if (sec == null) return "-";
  const m = Math.round(sec / 60);
  return m < 60 ? t.menit(m) : t.jam(Math.floor(m / 60), m % 60);
}

function fmtTanggal(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtWaktu(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(localeOf(lang), {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  });
}

/* ------------------------------------------------------------- root */

export default function Reports({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const [sesiId, setSesiId] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(location.search).get("sesi");
      setSesiId(p ? Number(p) : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role !== "asisten") {
    return (
      <StateView
        icon={<LockSimpleIcon size={28} />}
        title={t.forbiddenH}
        body={t.forbidden}
        actions={
          <a className="btn btn--primary" href={href(lang, "/")}>
            {t.home}
          </a>
        }
      />
    );
  }

  const base = href(lang, "/reports");
  return sesiId ? (
    <SessionReport
      sesiId={sesiId}
      t={t}
      lang={lang}
      meKode={(me.kode ?? "").toUpperCase()}
      onBack={() => {
        history.pushState(null, "", base);
        setSesiId(null);
      }}
    />
  ) : (
    <Home
      t={t}
      lang={lang}
      onOpen={(id) => {
        history.pushState(null, "", `${base}?sesi=${id}`);
        setSesiId(id);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/* ------------------------------------------------------------- home */

const TAB_IDS = ["sesi", "ringkasan", "lab", "audit"] as const;
type TabId = (typeof TAB_IDS)[number];

function Home({ t, lang, onOpen }: { t: Tx; lang: Lang; onOpen: (id: number) => void }) {
  const read = (): TabId => {
    const h = location.hash.replace("#", "");
    return (TAB_IDS as readonly string[]).includes(h) ? (h as TabId) : "sesi";
  };
  const [tab, setTab] = useState<TabId>("sesi");
  useEffect(() => {
    setTab(read());
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (id: string) => {
    setTab(id as TabId);
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <div className="rep">
      <header className="rep__head">
        <span className="label-caps">IRIS IoT</span>
        <h1 className="rep__title">{t.title}</h1>
        <p className="hint rep__sub">{t.sub}</p>
      </header>
      <div className="tabs-scroll">
        <nav
          className="tabs"
          role="tablist"
          aria-label={t.parts}
          onKeyDown={(e) => onTablistKeyDown(e, [...TAB_IDS], tab, go)}
        >
          {TAB_IDS.map((id) => {
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                className="tabs__tab"
                onClick={() => go(id)}
              >
                {t.tabs[id]}
              </button>
            );
          })}
        </nav>
      </div>
      <Fade k={tab} className="rep__panel">
        {tab === "sesi" && <SesiTab t={t} lang={lang} onOpen={onOpen} />}
        {tab === "ringkasan" && <RingkasanTab t={t} lang={lang} />}
        {tab === "lab" && <LabTab t={t} lang={lang} />}
        {tab === "audit" && <AuditTab t={t} lang={lang} />}
      </Fade>
    </div>
  );
}

/* -------------------------------------------------------- session list */

interface SesiRow {
  id: number;
  tanggal: string;
  mulai: string;
  modul: number;
  status: string;
  kelas?: string;
  durasiDetik: number | null;
  asisten?: string[];
  lab?: { rata: number; n: number } | null;
}

function HeatStrip({ rows, t, lang }: { rows: SesiRow[]; t: Tx; lang: Lang }) {
  const days = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.tanggal, (count.get(r.tanggal) ?? 0) + 1);
    const out: { iso: string; n: number }[] = [];
    const end = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400000);
      const iso = format(d, "yyyy-MM-dd");
      out.push({ iso, n: count.get(iso) ?? 0 });
    }
    return out;
  }, [rows]);
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="rep__heat" aria-label={t.heat}>
      <span className="label-caps">{t.heat}</span>
      <div className="rep__heatgrid">
        {days.map((d) => (
          <span
            key={d.iso}
            className="rep__heatcell"
            data-n={d.n}
            style={{ "--a": d.n / max } as CSSProperties}
            aria-label={`${fmtTanggal(d.iso, lang)}: ${t.heatN(d.n)}`}
          />
        ))}
      </div>
    </div>
  );
}

function SesiTab({ t, lang, onOpen }: { t: Tx; lang: Lang; onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<SesiRow[] | null>(null);
  const [modul, setModul] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [kelas, setKelas] = useState<string[]>([]);
  const [tanggal, setTanggal] = useState<DateRange | undefined>();

  useEffect(() => {
    const qs = new URLSearchParams();
    if (modul.length) qs.set("modul", modul.join(","));
    if (status.length) qs.set("status", status.join(","));
    if (tanggal?.from) qs.set("dari", format(tanggal.from, "yyyy-MM-dd"));
    if (tanggal?.to) qs.set("sampai", format(tanggal.to, "yyyy-MM-dd"));
    setRows(null);
    getJson<{ ok: boolean; sesi?: SesiRow[] }>(`/api/session/riwayat?${qs}`)
      .then((d) => setRows(d.ok ? (d.sesi ?? []) : []))
      .catch(() => {
        setRows([]);
        window.Toast?.show(t.err, "danger");
      });
  }, [modul, status, tanggal, t]);

  const shown = (rows ?? []).filter((r) => !kelas.length || kelas.includes(r.kelas ?? "reguler"));

  return (
    <div className="rep__stack">
      <div className="rep__toolbar">
        <DropdownFilter
          id="rep-modul"
          label={t.modul}
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${t.modul} ${n}` }))}
          values={modul}
          onChange={setModul}
        />
        <DropdownFilter
          id="rep-status"
          label={t.status}
          options={Object.entries(t.st).map(([value, label]) => ({ value, label }))}
          values={status}
          onChange={setStatus}
        />
        <DropdownFilter
          id="rep-kelas"
          label={t.kelas}
          options={[
            { value: "reguler", label: t.reguler },
            { value: "internasional", label: t.internasional },
          ]}
          values={kelas}
          onChange={setKelas}
        />
        <DateRangePicker value={tanggal} onChange={setTanggal} />
      </div>

      {rows === null ? (
        <span className="skeleton" style={{ height: 280 }} />
      ) : (
        <>
          <HeatStrip rows={rows} t={t} lang={lang} />
          {shown.length === 0 ? (
            <p className="empty-note">{t.none}</p>
          ) : (
            <ScrollArea label={t.tabs.sesi} className="rep__tablewrap">
              <table className="rep__table">
                <thead>
                  <tr>
                    {t.cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      style={{ "--i": Math.min(i, 12) } as CSSProperties}
                      onClick={() => onOpen(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(r.id);
                        }
                      }}
                    >
                      <td data-label={t.cols[0]}>{fmtTanggal(r.tanggal, lang)}</td>
                      <td data-label={t.cols[1]} className="mono">
                        {r.mulai}
                      </td>
                      <td data-label={t.cols[2]}>
                        <span
                          className="rep__mod"
                          style={{ "--mod-hue": `var(--mod-${r.modul})` } as CSSProperties}
                        >
                          M{r.modul} <span className="hint">{MODUL_NAMA[r.modul]}</span>
                        </span>
                      </td>
                      <td data-label={t.cols[3]}>
                        {r.kelas === "internasional" ? (
                          <span className="pill pill--gold">{t.inter}</span>
                        ) : (
                          <span className="hint">{t.reguler}</span>
                        )}
                      </td>
                      <td data-label={t.cols[4]}>
                        <span className="rep__codes">
                          {(r.asisten ?? []).length === 0 ? (
                            <span className="hint">-</span>
                          ) : (
                            r.asisten!.map((k) => (
                              <span key={k} className="code-badge">
                                {k}
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td data-label={t.cols[5]}>
                        <span className="rep__status" data-s={r.status}>
                          {t.st[r.status] ?? r.status}
                        </span>
                      </td>
                      <td data-label={t.cols[6]}>{fmtDurasi(r.durasiDetik, t)}</td>
                      <td data-label={t.cols[7]}>
                        {r.lab ? (
                          <span className="rep__lab" aria-label={t.labN(r.lab.n)}>
                            <StarIcon size={14} weight="fill" aria-hidden="true" />{" "}
                            {r.lab.rata.toFixed(1)}
                            <small className="hint">({r.lab.n})</small>
                          </span>
                        ) : (
                          <span className="hint">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ module summary */

interface RingkasanModul {
  modul: number;
  sesi: number;
  selesai: number;
  hadirUnik: number;
  blankBenar: number;
  blankTotal: number;
  labRata?: number | null;
  labN?: number;
}

function RingkasanTab({ t }: { t: Tx; lang: Lang }) {
  const [rows, setRows] = useState<RingkasanModul[] | null>(null);
  useEffect(() => {
    getJson<{ ok: boolean; modul?: RingkasanModul[] }>("/api/session/ringkasan")
      .then((d) => setRows(d.ok ? (d.modul ?? []) : []))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <span className="skeleton" style={{ height: 280 }} />;
  return (
    <div className="rep__mods">
      {rows.map((m, i) => {
        const pct = m.blankTotal ? Math.round((m.blankBenar / m.blankTotal) * 100) : 0;
        return (
          <section
            key={m.modul}
            className="rep__modcard"
            style={{ "--mod-hue": `var(--mod-${m.modul})`, "--i": i } as CSSProperties}
          >
            <header>
              <span className="mono rep__modn">
                {t.modul} {m.modul}
              </span>
              <b>{MODUL_NAMA[m.modul]}</b>
            </header>
            <dl className="rep__metrics">
              <div>
                <dt>{t.runs}</dt>
                <dd className="num">
                  <CountUp value={m.sesi} />
                </dd>
              </div>
              <div>
                <dt>{t.done}</dt>
                <dd className="num">
                  <CountUp value={m.selesai} />
                </dd>
              </div>
              <div>
                <dt>{t.unique}</dt>
                <dd className="num">
                  <CountUp value={m.hadirUnik} />
                </dd>
              </div>
              <div>
                <dt>{t.labAvg}</dt>
                <dd className="num">
                  {m.labRata != null ? (
                    <>
                      <StarIcon size={16} weight="fill" aria-hidden="true" className="rep__star" />{" "}
                      {m.labRata.toFixed(1)}
                    </>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
            </dl>
            <div className="rep__acc">
              <span className="hint">
                {t.blanks} · {m.blankBenar}/{m.blankTotal}
              </span>
              <span
                className="meter"
                style={{ "--meter": pct, "--meter-hue": `var(--mod-${m.modul})` } as CSSProperties}
              />
              <b className="num">{pct}%</b>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- lab */

function LabTab({ t, lang }: { t: Tx; lang: Lang }) {
  const [data, setData] = useState<Ringkasan | null>(null);
  useEffect(() => {
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=lab")
      .then((d) => d.ok && setData(d.ringkasan))
      .catch(() => {});
  }, []);
  return (
    <section className="panel rep__labpanel">
      <p className="hint">{t.labSub}</p>
      <FeedbackSummary
        data={data}
        lang={lang}
        empty={t.labEmpty}
        countLabel={t.labN}
        maxComments={8}
      />
    </section>
  );
}

/* -------------------------------------------------------------- audit */

interface AuditRow {
  id: number;
  pada: string;
  aktorNim: string;
  aksi: string;
  detail: unknown;
}

function detailChips(detail: unknown): [string, string][] {
  let v = detail;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [["", v as string]];
    }
  }
  if (!v || typeof v !== "object") return [];
  return Object.entries(v as Record<string, unknown>)
    .slice(0, 6)
    .map(([k, x]) => [k, typeof x === "object" ? JSON.stringify(x) : String(x)]);
}

function AuditTab({ t, lang }: { t: Tx; lang: Lang }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [aksi, setAksi] = useState<string[]>([]);
  const [aktor, setAktor] = useState<string[]>([]);
  const [tanggal, setTanggal] = useState<DateRange | undefined>();
  const [asisten, setAsisten] = useState<{ nim: string; kode: string; nama: string }[]>([]);

  useEffect(() => {
    getJson<{ ok: boolean; asisten?: { nim: string; kode: string; nama: string }[] }>(
      "/api/session/schedule",
    )
      .then((d) => setAsisten(d.asisten ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    // The API filters on one action and one actor; several picks filter here.
    if (aksi.length === 1) qs.set("aksiLog", aksi[0]);
    if (aktor.length === 1) qs.set("aktor", aktor[0]);
    if (tanggal?.from) qs.set("dari", format(tanggal.from, "yyyy-MM-dd"));
    setRows(null);
    const id = setTimeout(() => {
      getJson<{ ok: boolean; audit?: AuditRow[] }>(`/api/session/audit?${qs}`)
        .then((d) => setRows(d.ok ? (d.audit ?? []) : []))
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(id);
  }, [aksi, aktor, tanggal]);

  const kodeOf = (nim: string) => asisten.find((a) => a.nim === nim)?.kode ?? nim;
  const shown = (rows ?? []).filter(
    (r) => (!aksi.length || aksi.includes(r.aksi)) && (!aktor.length || aktor.includes(r.aktorNim)),
  );

  return (
    <div className="rep__stack">
      <div className="rep__toolbar">
        <DropdownFilter
          id="rep-aksi"
          label={t.aksi}
          options={Object.entries(t.auditLabel).map(([value, label]) => ({ value, label }))}
          values={aksi}
          onChange={setAksi}
        />
        <DropdownFilter
          id="rep-aktor"
          label={t.aktor}
          options={asisten.map((a) => ({ value: a.nim, label: namaAsisten(a) }))}
          values={aktor}
          onChange={setAktor}
        />
        <DateRangePicker value={tanggal} onChange={setTanggal} />
      </div>
      {rows === null ? (
        <span className="skeleton" style={{ height: 280 }} />
      ) : shown.length === 0 ? (
        <p className="empty-note">{t.auditNone}</p>
      ) : (
        <ol className="rep__audit">
          {shown.map((r) => (
            <li key={r.id}>
              <span className="code-badge">{kodeOf(r.aktorNim)}</span>
              <span className="rep__auditmain">
                <b>{t.auditLabel[r.aksi] ?? r.aksi.replace(/_/g, " ")}</b>
                <span className="rep__chips">
                  {detailChips(r.detail).map(([k, v]) => (
                    <span key={k + v} className="pill pill--mono">
                      {k ? `${k}: ` : ""}
                      {v.length > 40 ? `${v.slice(0, 40)}…` : v}
                    </span>
                  ))}
                </span>
              </span>
              <time className="hint mono" dateTime={r.pada}>
                {fmtWaktu(r.pada, lang)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------ session report */

interface Anggota {
  nim: string;
  nama: string;
  hadir: boolean;
}
interface KelompokLaporan {
  id: number;
  nomor: number;
  nama: string;
  catatan: string | null;
  peran: string | null;
  anggotaTotal: number;
  hadir: number;
  benar: number;
  total: number;
  anggota: Anggota[];
  blankRinci: { soalKode: string; benar: boolean; percobaan: number; diubahPada: string | null }[];
  telemetri: {
    count: number;
    delayMinMs: number | null;
    delayMedianMs: number | null;
    delayMaxMs: number | null;
  };
}
interface LaporanData {
  sesi: {
    id: number;
    modul: number;
    tanggal: string;
    mulai: string;
    status: string;
    durasiDetik: number;
    kelas?: string;
  } | null;
  kelompok: KelompokLaporan[];
}

function SessionReport({
  sesiId,
  t,
  lang,
  meKode,
  onBack,
}: {
  sesiId: number;
  t: Tx;
  lang: Lang;
  meKode: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<LaporanData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pemilik, setPemilik] = useState<Record<number, { kode: string; nama: string }>>({});
  const [lab, setLab] = useState<Ringkasan | null>(null);
  const [mine, setMine] = useState<Ringkasan | null>(null);
  const blankRef = useRef<HTMLDivElement | null>(null);
  const delayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    getJson<{ ok: boolean; kode?: string } & LaporanData>(`/api/session/laporan?sesiId=${sesiId}`)
      .then((d) => (d.ok ? setData(d) : setErr(d.kode === "sesi_tidak_ada" ? t.notFound : t.err)))
      .catch(() => setErr(t.err));
    getJson<{ ok: boolean; penugasan?: { kelompokId: number; kode: string; nama: string }[] }>(
      `/api/session/assignment?sesiId=${sesiId}`,
    )
      .then((d) => {
        const m: Record<number, { kode: string; nama: string }> = {};
        for (const p of d.penugasan ?? []) m[p.kelompokId] = { kode: p.kode, nama: p.nama };
        setPemilik(m);
      })
      .catch(() => {});
    getJson<{ ok: boolean; ringkasan: Ringkasan }>(
      `/api/session/feedback?scope=lab&sesiId=${sesiId}`,
    )
      .then((d) => d.ok && setLab(d.ringkasan))
      .catch(() => {});
    getJson<{ ok: boolean; ringkasan: Ringkasan }>(
      `/api/session/feedback?scope=mine&sesiId=${sesiId}`,
    )
      .then((d) => d.ok && setMine(d.ringkasan))
      .catch(() => {});
  }, [sesiId, t]);

  const held = data
    ? data.kelompok.some((k) => pemilik[k.id]?.kode?.toUpperCase() === meKode)
    : false;

  const themeKey = useThemeKey();

  // Correct blanks over time per group (snapshot derived: a blank counts
  // at its latest change).
  useEffect(() => {
    if (!data || !blankRef.current) return;
    const warna = chartColors();
    let plot: { destroy(): void } | null = null;
    let cancelled = false;
    const per = data.kelompok.map((k) => ({
      nomor: k.nomor,
      poin: k.blankRinci
        .filter((b) => b.benar && b.diubahPada)
        .map((b) => new Date(b.diubahPada as string).getTime() / 1000)
        .sort((a, b) => a - b),
    }));
    const xs = [...new Set(per.flatMap((k) => k.poin))].sort((a, b) => a - b);
    if (!xs.length) return;
    void import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !blankRef.current) return;
      const ys = per.map((k) => {
        let c = 0;
        let i = 0;
        return xs.map((x) => {
          while (i < k.poin.length && k.poin[i] <= x) {
            c++;
            i++;
          }
          return c;
        });
      });
      plot = new uPlot(
        {
          width: blankRef.current.clientWidth || 600,
          height: 220,
          scales: { x: { time: true } },
          series: [
            {},
            ...per.map((k) => ({
              label: t.kelompok(k.nomor),
              stroke: warnaKelompok(warna, k.nomor),
              width: 2,
            })),
          ],
          axes: [
            { stroke: warna.axis, grid: { stroke: warna.grid }, ticks: { stroke: warna.tick } },
            { stroke: warna.axis, grid: { stroke: warna.grid }, ticks: { stroke: warna.tick } },
          ],
          legend: { show: false },
        },
        [xs, ...ys],
        blankRef.current,
      );
    });
    return () => {
      cancelled = true;
      plot?.destroy();
    };
  }, [data, t, themeKey]);

  useEffect(() => {
    if (!data || !delayRef.current) return;
    const warna = chartColors();
    const delayWarna = [warna.series[0], warna.series[3], warna.series[2]];
    let plot: { destroy(): void } | null = null;
    let cancelled = false;
    const w = data.kelompok.filter((k) => k.telemetri.delayMedianMs != null);
    if (!w.length) return;
    void import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !delayRef.current) return;
      plot = new uPlot(
        {
          width: delayRef.current.clientWidth || 600,
          height: 220,
          series: [
            { label: t.kelompok(0) },
            ...t.delay.map((label, i) => ({
              label,
              stroke: delayWarna[i],
              width: i === 0 ? 2 : 1,
            })),
          ],
          axes: [
            { stroke: warna.axis, grid: { stroke: warna.grid }, ticks: { stroke: warna.tick } },
            { stroke: warna.axis, grid: { stroke: warna.grid }, ticks: { stroke: warna.tick } },
          ],
          legend: { show: false },
        },
        [
          w.map((k) => k.nomor),
          w.map((k) => k.telemetri.delayMedianMs),
          w.map((k) => k.telemetri.delayMinMs),
          w.map((k) => k.telemetri.delayMaxMs),
        ],
        delayRef.current,
      );
    });
    return () => {
      cancelled = true;
      plot?.destroy();
    };
  }, [data, t, themeKey]);

  function csvAnggota() {
    if (!data) return;
    const rows: (string | number)[][] = [];
    for (const k of data.kelompok)
      for (const a of k.anggota)
        rows.push([a.nim, a.nama, k.nomor, a.hadir ? "ya" : "tidak", k.benar, k.total]);
    unduhCsv(
      `laporan-sesi-${sesiId}-anggota.csv`,
      ["NIM", "Nama", "Kelompok", "Hadir", "Blank benar", "Blank total"],
      rows,
    );
  }
  function csvBlank() {
    if (!data) return;
    const rows: (string | number)[][] = [];
    for (const k of data.kelompok)
      for (const b of k.blankRinci)
        rows.push([k.nomor, b.soalKode, b.percobaan, b.benar ? "ya" : "tidak"]);
    unduhCsv(`laporan-sesi-${sesiId}-blank.csv`, ["Kelompok", "Blank", "Percobaan", "Benar"], rows);
  }

  const back = <BackButton lang={lang} label={t.back} onClick={onBack} />;

  if (err) {
    return (
      <div className="rep">
        {back}
        <p className="empty-note">{err}</p>
      </div>
    );
  }
  if (!data || !data.sesi) {
    return (
      <div className="rep">
        {back}
        <span className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }
  const s = data.sesi;

  return (
    <div className="rep" style={{ "--mod-hue": `var(--mod-${s.modul})` } as CSSProperties}>
      {back}
      <header className="rep__sesshead sweep-edge">
        <div className="stack stack--sm">
          <span className="rep__modn mono">
            {t.modul} {s.modul} · {MODUL_NAMA[s.modul]}
          </span>
          <h1 className="rep__title">
            {fmtTanggal(s.tanggal, lang)} · <span className="mono">{s.mulai}</span>
          </h1>
          <span className="rep__meta">
            <span className="rep__status" data-s={s.status}>
              {t.st[s.status] ?? s.status}
            </span>
            {s.kelas === "internasional" && <span className="pill pill--gold">{t.inter}</span>}
            <span className="hint">{fmtDurasi(s.durasiDetik, t)}</span>
          </span>
        </div>
        <div className="row">
          <button type="button" className="btn btn--secondary" onClick={csvAnggota}>
            {t.csvA}
          </button>
          <button type="button" className="btn btn--secondary" onClick={csvBlank}>
            {t.csvB}
          </button>
        </div>
      </header>

      <div className="rep__groups">
        {data.kelompok.map((k, i) => {
          const p = pemilik[k.id];
          const pct = k.total ? Math.round((k.benar / k.total) * 100) : 0;
          return (
            <section
              key={k.id}
              className="rep__gcard"
              style={{ "--g": `var(--group-${k.nomor})`, "--i": i } as CSSProperties}
            >
              <header>
                <span className="rep__gnum">{k.nomor}</span>
                <b>{namaKelompok(k.nomor, k.nama)}</b>
                <span
                  className={`code-badge${p ? "" : " code-badge--empty"}`}
                  data-me={p?.kode?.toUpperCase() === meKode ? "yes" : undefined}
                  aria-label={p ? p.nama : t.unassigned}
                >
                  {p?.kode ?? "?"}
                </span>
              </header>
              <dl className="rep__metrics rep__metrics--sm">
                <div>
                  <dt>{t.hadir}</dt>
                  <dd className="num">
                    {k.hadir}/{k.anggotaTotal}
                  </dd>
                </div>
                <div>
                  <dt>{t.telem}</dt>
                  <dd className="num">{k.telemetri.count}</dd>
                </div>
                <div>
                  <dt>{t.median}</dt>
                  <dd className="num">
                    {k.telemetri.delayMedianMs != null ? (
                      `${k.telemetri.delayMedianMs} ms`
                    ) : (
                      <small className="hint">{t.serial}</small>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="rep__acc">
                <span className="hint">
                  {t.blanks} · {k.benar}/{k.total}
                </span>
                <span
                  className="meter"
                  style={
                    { "--meter": pct, "--meter-hue": `var(--group-${k.nomor})` } as CSSProperties
                  }
                />
              </div>
              {k.peran && (
                <p className="hint">
                  {t.role}: {k.peran}
                </p>
              )}
              {k.catatan && <p className="rep__note">{k.catatan}</p>}
            </section>
          );
        })}
      </div>

      <div className="rep__charts">
        <section className="panel">
          <h2 className="panel__title">{t.chartBlank}</h2>
          <div className="rep__legend">
            {data.kelompok.map((k) => (
              <span key={k.id}>
                <i style={{ background: `var(--group-${k.nomor})` }} />
                {t.kelompok(k.nomor)}
              </span>
            ))}
          </div>
          <div className="rep__chart" ref={blankRef} />
        </section>
        <section className="panel">
          <h2 className="panel__title">{t.chartDelay}</h2>
          <div className="rep__legend">
            {t.delay.map((l, i) => (
              <span key={l}>
                <i style={{ background: DELAY_TOKEN[i] }} />
                {l}
              </span>
            ))}
          </div>
          <div className="rep__chart" ref={delayRef} />
        </section>
      </div>

      <div className="rep__charts">
        <section className="panel">
          <h2 className="panel__title">{t.labThis}</h2>
          <FeedbackSummary data={lab} lang={lang} empty={t.labEmpty} countLabel={t.labN} />
        </section>
        {held && (
          <section className="panel">
            <h2 className="panel__title">{t.mineThis}</h2>
            <p className="hint">{t.mineSub}</p>
            <FeedbackSummary data={mine} lang={lang} empty={t.labEmpty} countLabel={t.labN} />
          </section>
        )}
      </div>
    </div>
  );
}
