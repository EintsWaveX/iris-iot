/**
 * P6.8: the reports centre. Replaces reports.astro's own page script (a role
 * check plus mounting, the same shape P6.6/P6.7 gave /session and /servers)
 * with one island. Implements the plan's original Stage 20 `/history`
 * deliverable, folded into this stage instead -- see schema.ts's
 * telemetriLog docblock for that history.
 *
 * List (session history, module overview, audit log) and a session's own
 * report stay one component tree switched on the `?sesi=` query param,
 * exactly like ServerCenter.tsx's `?id=` split for the same `output:
 * 'static'` reason: this project has no per-request routing for content
 * that only exists in the database.
 */
import { useEffect, useRef, useState } from "react";
import { navigate } from "astro:transitions/client";
import { DropdownFilter } from "./ui/Dropdown";
import { unduhCsv } from "../lib/csv";
import "./ReportsView.css";

async function api<T = { ok: boolean; kode?: string; [k: string]: unknown }>(
  url: string,
): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

const KODE_PESAN: Record<string, string> = {
  format_salah: "Formatnya belum benar.",
  sesi_tidak_ada: "Sesi ini tidak ditemukan.",
};
function pesanUntuk(kode: string | undefined): string {
  return KODE_PESAN[kode ?? ""] ?? "Terjadi kesalahan.";
}

function fmtWaktu(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function fmtDurasi(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} menit`;
  return `${Math.floor(m / 60)}j ${m % 60}m`;
}

const STATUS_LABEL: Record<string, string> = {
  terjadwal: "Terjadwal",
  berjalan: "Berjalan",
  selesai: "Selesai",
  batal: "Batal",
};

export default function ReportsView() {
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [sesiId, setSesiId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(location.search).get("sesi");
    return p ? Number(p) : null;
  });

  useEffect(() => {
    api<{ ok: boolean; role?: string }>("/api/auth/me").then((me) => {
      setLoaded(true);
      if (!me.ok) {
        navigate("/?login=1");
        return;
      }
      setRole(me.role ?? null);
    });
  }, []);

  useEffect(() => {
    function onPop() {
      const p = new URLSearchParams(location.search).get("sesi");
      setSesiId(p ? Number(p) : null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!loaded) return null;
  if (role !== "asisten") {
    return (
      <div className="reports-view__empty">
        <h1>Halaman ini khusus asisten</h1>
        <p>Masuk sebagai asisten untuk melihat laporan sesi.</p>
      </div>
    );
  }

  return sesiId ? (
    <SessionReportView
      sesiId={sesiId}
      onBack={() => {
        history.pushState(null, "", "/reports");
        setSesiId(null);
      }}
    />
  ) : (
    <ReportsHome
      onOpen={(id) => {
        history.pushState(null, "", `/reports?sesi=${id}`);
        setSesiId(id);
      }}
    />
  );
}

// -----------------------------------------------------------------------
// Home: session list, module overview, audit
// -----------------------------------------------------------------------

interface HomeTab {
  id: string;
  label: string;
}
const HOME_TABS: HomeTab[] = [
  { id: "sesi", label: "Sesi" },
  { id: "ringkasan", label: "Ringkasan modul" },
  { id: "audit", label: "Audit" },
];
const HOME_TAB_IDS = new Set(HOME_TABS.map((t) => t.id));

function readHashTab(): string {
  if (typeof window === "undefined") return "sesi";
  const h = location.hash.replace(/^#/, "");
  return HOME_TAB_IDS.has(h) ? h : "sesi";
}

function ReportsHome({ onOpen }: { onOpen: (id: number) => void }) {
  const [activeTab, setActiveTab] = useState(() => readHashTab());

  useEffect(() => {
    function onHash() {
      setActiveTab(readHashTab());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function goToTab(tabId: string) {
    setActiveTab(tabId);
    history.replaceState(null, "", `#${tabId}`);
  }

  return (
    <div className="reports-view">
      <header className="reports-view__head">
        <h1 className="reports-view__title">Laporan</h1>
        <p className="reports-view__lede">
          Riwayat sesi, ringkasan tiap modul selama empat pekan, dan log audit.
        </p>
      </header>

      <nav className="reports-view__tabs" role="tablist" aria-label="Bagian laporan">
        {HOME_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className="reports-view__tab"
            onClick={() => goToTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="reports-view__panel">
        {activeTab === "sesi" && <SesiListTab onOpen={onOpen} />}
        {activeTab === "ringkasan" && <RingkasanModulTab />}
        {activeTab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

// -- Sesi list --------------------------------------------------------------

interface SesiRow {
  id: number;
  tanggal: string;
  mulai: string;
  modul: number;
  status: "terjadwal" | "berjalan" | "selesai" | "batal";
  durasiDetik: number | null;
}

const MODUL_OPTIONS = [1, 2, 3, 4].map((n) => ({ value: String(n), label: `Modul ${n}` }));
const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

function SesiListTab({ onOpen }: { onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<SesiRow[]>([]);
  const [modul, setModul] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (modul.length) qs.set("modul", modul.join(","));
    if (status.length) qs.set("status", status.join(","));
    if (dari) qs.set("dari", dari);
    if (sampai) qs.set("sampai", sampai);
    setLoading(true);
    api<{ ok: boolean; sesi?: SesiRow[]; kode?: string }>(`/api/session/riwayat?${qs}`).then(
      (d) => {
        setLoading(false);
        if (d.ok) setRows(d.sesi ?? []);
        else window.Toast?.show(pesanUntuk(d.kode), "danger");
      },
    );
  }, [modul, status, dari, sampai]);

  return (
    <div className="tab-stack">
      <div className="tab-toolbar">
        <DropdownFilter
          id="reports-filter-modul"
          label="Modul"
          options={MODUL_OPTIONS}
          values={modul}
          onChange={setModul}
        />
        <DropdownFilter
          id="reports-filter-status"
          label="Status"
          options={STATUS_OPTIONS}
          values={status}
          onChange={setStatus}
        />
        <label className="reports-view__date-field">
          Dari
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label className="reports-view__date-field">
          Sampai
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="reports-view__muted">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="reports-view__kosong">Tidak ada sesi yang cocok dengan filter ini.</p>
      ) : (
        <div className="reports-view__table-wrap">
          <table className="reports-view__table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Mulai</th>
                <th>Modul</th>
                <th>Status</th>
                <th>Durasi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="reports-view__row" onClick={() => onOpen(r.id)}>
                  <td data-label="Tanggal">{r.tanggal}</td>
                  <td data-label="Mulai">{r.mulai}</td>
                  <td data-label="Modul">Modul {r.modul}</td>
                  <td data-label="Status">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td data-label="Durasi">
                    {r.durasiDetik != null ? fmtDurasi(r.durasiDetik) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -- Ringkasan modul ----------------------------------------------------

interface RingkasanModul {
  modul: number;
  sesi: number;
  selesai: number;
  hadirUnik: number;
  blankBenar: number;
  blankTotal: number;
}

function RingkasanModulTab() {
  const [rows, setRows] = useState<RingkasanModul[] | null>(null);

  useEffect(() => {
    api<{ ok: boolean; modul?: RingkasanModul[] }>("/api/session/ringkasan").then((d) => {
      if (d.ok) setRows(d.modul ?? []);
    });
  }, []);

  if (!rows) return <p className="reports-view__muted">Memuat...</p>;

  return (
    <div className="reports-view__grid">
      {rows.map((m) => (
        <div className="reports-view__card" key={m.modul}>
          <h3>Modul {m.modul}</h3>
          <dl className="metrics">
            <div>
              <dt>Sesi dijalankan</dt>
              <dd>{m.sesi}</dd>
            </div>
            <div>
              <dt>Sesi selesai</dt>
              <dd>{m.selesai}</dd>
            </div>
            <div>
              <dt>Mahasiswa hadir (unik)</dt>
              <dd>{m.hadirUnik}</dd>
            </div>
            <div>
              <dt>Blank benar</dt>
              <dd>
                {m.blankBenar} / {m.blankTotal}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

// -- Audit ----------------------------------------------------------------

interface AuditRow {
  id: number;
  pada: string;
  aktorNim: string;
  aksi: string;
  detail: string | null;
}

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [aksi, setAksi] = useState("");
  const [aktor, setAktor] = useState("");
  const [dari, setDari] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (aksi.trim()) qs.set("aksiLog", aksi.trim());
    if (aktor.trim()) qs.set("aktor", aktor.trim());
    if (dari) qs.set("dari", dari);
    setLoading(true);
    const timer = setTimeout(() => {
      api<{ ok: boolean; audit?: AuditRow[] }>(`/api/session/audit?${qs}`).then((d) => {
        setLoading(false);
        if (d.ok) setRows(d.audit ?? []);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [aksi, aktor, dari]);

  return (
    <div className="tab-stack">
      <div className="tab-toolbar">
        <label className="reports-view__date-field">
          Aksi
          <input
            type="text"
            placeholder="mis. sesi_akhiri"
            value={aksi}
            onChange={(e) => setAksi(e.target.value)}
          />
        </label>
        <label className="reports-view__date-field">
          NIM aktor
          <input type="text" value={aktor} onChange={(e) => setAktor(e.target.value)} />
        </label>
        <label className="reports-view__date-field">
          Dari
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="reports-view__muted">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="reports-view__kosong">Tidak ada log yang cocok.</p>
      ) : (
        <div className="reports-view__table-wrap">
          <table className="reports-view__table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktor</th>
                <th>Aksi</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Waktu">{fmtWaktu(r.pada)}</td>
                  <td data-label="Aktor">{r.aktorNim}</td>
                  <td data-label="Aksi">{r.aksi}</td>
                  <td data-label="Detail" className="reports-view__detail">
                    {r.detail ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Session report
// -----------------------------------------------------------------------

interface Anggota {
  nim: string;
  nama: string;
  hadir: boolean;
}
interface BlankRinci {
  soalKode: string;
  benar: boolean;
  percobaan: number;
  diubahPada: string | null;
}
interface TelemetriRingkas {
  count: number;
  delayMinMs: number | null;
  delayMedianMs: number | null;
  delayMaxMs: number | null;
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
  blankRinci: BlankRinci[];
  telemetri: TelemetriRingkas;
}
interface LaporanData {
  sesi: {
    id: number;
    modul: number;
    tanggal: string;
    mulai: string;
    status: string;
    durasiDetik: number;
  } | null;
  kelompok: KelompokLaporan[];
}

function SessionReportView({ sesiId, onBack }: { sesiId: number; onBack: () => void }) {
  const [data, setData] = useState<LaporanData | null>(null);
  const [kode, setKode] = useState<string | null>(null);
  const blankChartRef = useRef<HTMLDivElement | null>(null);
  const delayChartRef = useRef<HTMLDivElement | null>(null);
  const blankUplotRef = useRef<import("uplot") | null>(null);
  const delayUplotRef = useRef<import("uplot") | null>(null);

  useEffect(() => {
    setData(null);
    setKode(null);
    api<{ ok: boolean; kode?: string } & LaporanData>(`/api/session/laporan?sesiId=${sesiId}`).then(
      (d) => {
        if (!d.ok) {
          setKode(d.kode ?? "galat_server");
          return;
        }
        setData(d);
      },
    );
  }, [sesiId]);

  // "Blank benar over time": for each group, a cumulative count of correct
  // blanks against when each one was last marked correct. This is a
  // snapshot-derived series (jawaban has no separate event log), so a blank
  // that was fixed then broken again only ever contributes its LATEST
  // diubahPada -- close enough for "how the session's progress unfolded" at
  // the resolution this report needs, without a new table just for this
  // chart.
  useEffect(() => {
    let cancelled = false;
    if (!data || !blankChartRef.current) return;
    const perKelompok = data.kelompok.map((k) => {
      const poin = k.blankRinci
        .filter((b) => b.benar && b.diubahPada)
        .map((b) => new Date(b.diubahPada as string).getTime() / 1000)
        .sort((a, b) => a - b);
      return { nomor: k.nomor, poin };
    });
    const semuaWaktu = Array.from(new Set(perKelompok.flatMap((k) => k.poin))).sort(
      (a, b) => a - b,
    );
    if (semuaWaktu.length === 0) return;

    import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !blankChartRef.current) return;
      blankUplotRef.current?.destroy();
      const seriesData = perKelompok.map((k) => {
        let count = 0;
        let idx = 0;
        return semuaWaktu.map((t) => {
          while (idx < k.poin.length && k.poin[idx] <= t) {
            count += 1;
            idx += 1;
          }
          return count;
        });
      });
      blankUplotRef.current = new uPlot(
        {
          width: blankChartRef.current.clientWidth || 600,
          height: 200,
          scales: { x: { time: true } },
          series: [
            {},
            ...perKelompok.map((k, i) => ({
              label: `Kelompok ${k.nomor}`,
              stroke: ["#7dd3fc", "#c4b5fd", "#fca5a5", "#86efac", "#fcd34d"][i % 5],
              width: 1.5,
            })),
          ],
          axes: [{}, {}],
        },
        [semuaWaktu, ...seriesData],
        blankChartRef.current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Per-group delay: a simple bar-shaped series (uPlot has no dedicated bar
  // renderer bundled by default, so this draws median delay as a stepped
  // line across group numbers, which is enough to compare groups at a
  // glance -- Module 4 is the only module with a real delayMs to begin
  // with, per telemetriLog's own schema comment).
  useEffect(() => {
    let cancelled = false;
    if (!data || !delayChartRef.current) return;
    const withDelay = data.kelompok.filter((k) => k.telemetri.delayMedianMs != null);
    if (withDelay.length === 0) return;
    import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !delayChartRef.current) return;
      delayUplotRef.current?.destroy();
      const xs = withDelay.map((k) => k.nomor);
      const median = withDelay.map((k) => k.telemetri.delayMedianMs);
      const min = withDelay.map((k) => k.telemetri.delayMinMs);
      const max = withDelay.map((k) => k.telemetri.delayMaxMs);
      delayUplotRef.current = new uPlot(
        {
          width: delayChartRef.current.clientWidth || 600,
          height: 200,
          series: [
            { label: "Kelompok" },
            { label: "Delay median (ms)", stroke: "#7dd3fc", width: 2 },
            { label: "Delay minimum (ms)", stroke: "#86efac", width: 1 },
            { label: "Delay maksimum (ms)", stroke: "#fca5a5", width: 1 },
          ],
          axes: [{}, {}],
        },
        [xs, median, min, max],
        delayChartRef.current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    return () => {
      blankUplotRef.current?.destroy();
      delayUplotRef.current?.destroy();
    };
  }, []);

  function unduhAnggota() {
    if (!data) return;
    const baris: (string | number)[][] = [];
    for (const k of data.kelompok) {
      for (const a of k.anggota) {
        baris.push([a.nim, a.nama, k.nomor, a.hadir ? "ya" : "tidak", k.benar, k.total]);
      }
    }
    unduhCsv(
      `laporan-sesi-${sesiId}-anggota.csv`,
      ["NIM", "Nama", "Kelompok", "Hadir", "Blank benar", "Blank total"],
      baris,
    );
  }

  function unduhBlank() {
    if (!data) return;
    const baris: (string | number)[][] = [];
    for (const k of data.kelompok) {
      for (const b of k.blankRinci) {
        baris.push([k.nomor, b.soalKode, b.percobaan, b.benar ? "ya" : "tidak"]);
      }
    }
    unduhCsv(
      `laporan-sesi-${sesiId}-blank.csv`,
      ["Kelompok", "Blank", "Percobaan", "Benar"],
      baris,
    );
  }

  return (
    <div className="reports-view">
      <a
        className="back-link"
        href="/reports"
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        &larr; Kembali ke daftar sesi
      </a>

      {kode ? (
        <p className="reports-view__kosong">{pesanUntuk(kode)}</p>
      ) : !data || !data.sesi ? (
        <p className="reports-view__muted">Memuat...</p>
      ) : (
        <>
          <header className="reports-view__head">
            <h1 className="reports-view__title">
              Modul {data.sesi.modul} &middot; {data.sesi.tanggal} {data.sesi.mulai}
            </h1>
            <p className="reports-view__lede">
              {STATUS_LABEL[data.sesi.status] ?? data.sesi.status} &middot; berlangsung{" "}
              {fmtDurasi(data.sesi.durasiDetik)}
            </p>
          </header>

          <div className="tab-toolbar">
            <button type="button" className="btn btn--ghost" onClick={unduhAnggota}>
              Unduh CSV anggota
            </button>
            <button type="button" className="btn btn--ghost" onClick={unduhBlank}>
              Unduh CSV blank
            </button>
          </div>

          <div className="reports-view__grid">
            {data.kelompok.map((k) => (
              <div className="reports-view__card" key={k.id}>
                <h3>
                  Kelompok {k.nomor} &middot; {k.nama}
                </h3>
                {k.peran && <p className="reports-view__note">Peran: {k.peran}</p>}
                {k.catatan && <p className="reports-view__muted">{k.catatan}</p>}
                <dl className="metrics">
                  <div>
                    <dt>Hadir</dt>
                    <dd>
                      {k.hadir} / {k.anggotaTotal}
                    </dd>
                  </div>
                  <div>
                    <dt>Blank benar</dt>
                    <dd>
                      {k.benar} / {k.total}
                    </dd>
                  </div>
                  <div>
                    <dt>Telemetri diterima</dt>
                    <dd>{k.telemetri.count}</dd>
                  </div>
                  <div>
                    <dt>Delay median</dt>
                    <dd>
                      {k.telemetri.delayMedianMs != null
                        ? `${k.telemetri.delayMedianMs} ms`
                        : "dari output serial Anda"}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <h2 className="reports-view__heading">Blank benar dari waktu ke waktu</h2>
          <div className="chart-box" ref={blankChartRef} />

          <h2 className="reports-view__heading">Delay per kelompok</h2>
          <div className="chart-box" ref={delayChartRef} />
        </>
      )}
    </div>
  );
}
