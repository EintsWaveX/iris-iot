/**
 * P6.7: the server centre. Replaces servers.astro's own page script (the
 * list/detail table-building and the fixed Kesehatan/Perintah/Perangkat/
 * Riwayat cards) with one island, the same "static shell, mount one
 * component" shape P6.6's SessionConsole took for /session. servers.astro
 * itself shrinks to a role check, the Nav/Toast/Modal shell, and mounting
 * this component.
 *
 * List and detail stay one component tree switched on the `?id=` query
 * param, exactly like the page it replaces did -- output: 'static' has no
 * per-request routing for content that only exists in the database, so a
 * query param is still the right tool, not an artifact worth removing.
 */
import { useEffect, useRef, useState } from "react";
import { navigate } from "astro:transitions/client";
import { startPolling } from "../scripts/polling";
import Dropdown, { DropdownFilter } from "./ui/Dropdown";
import "./ServerCenter.css";

const LAYANAN_LABEL: Record<string, string> = {
  "modul2-ws": "WebSocket Modul 2",
  mosquitto: "Mosquitto (Modul 3)",
  modul4: "Papan skor Modul 4",
};
const JENIS_LABEL: Record<string, string> = {
  esp32: "ESP32",
  "pico-w": "Pico W",
  "cosmic-lora": "Cosmic LoRa",
  "tidak-diketahui": "Tidak diketahui",
};
const DIAG_LABEL: Record<string, string> = {
  "diag.ringkas": "Ringkasan sistem",
  "diag.jaringan": "Jaringan",
  "diag.dmesg": "Log kernel (dmesg)",
};
const DIAG_HINT: Record<string, string> = {
  "diag.ringkas":
    "uname, uptime, free, df, ip, ss, chronyc tracking, systemctl --failed, 10 proses teratas.",
  "diag.jaringan": "iw dev, klien access point, rute default.",
  "diag.dmesg": "100 baris terakhir log kernel.",
};

const KODE_PESAN: Record<string, string> = {
  format_salah: "Formatnya belum benar.",
  kode_dipakai: "Kode ini sudah dipakai server lain.",
  tidak_ditemukan: "Tidak ditemukan.",
  server_tidak_ada: "Server ini tidak ditemukan.",
  layanan_tidak_dikenal: "Layanan ini tidak dikenal.",
  tidak_bisa_diulang: "Hanya perintah yang gagal atau kedaluwarsa yang bisa diulang.",
  tidak_bisa_dibatalkan: "Perintah ini sudah diambil agen dan tidak bisa dibatalkan lagi.",
  galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
};
function pesanUntuk(kode: string | undefined): string {
  return KODE_PESAN[kode ?? ""] ?? "Terjadi kesalahan.";
}

function fmtWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}
function fmtUptime(sec: number | null): string {
  if (sec == null) return "-";
  const h = Math.floor(sec / 3600);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}h ${h % 24}j`;
  return `${h}j ${Math.floor((sec % 3600) / 60)}m`;
}

interface Denyut {
  pada: string;
  cpu: number | null;
  memori: number | null;
  disk: number | null;
  suhu: number | null;
  uptimeSec: number | null;
  jamSelaras: boolean;
  modeJaringan: string | null;
  layanan: Record<string, string> | null;
}
interface ServerRow {
  id: number;
  nama: string;
  kode: string;
  alamatLan: string | null;
  lokasi?: string | null;
  catatan?: string | null;
  agenVersi?: string | null;
  infoSistem?: Record<string, unknown> | null;
  infoSistemPada?: string | null;
  terdaftar: boolean;
  denyutTerakhir: Denyut | null;
  batasLuringDetik: number;
}
interface Perangkat {
  id: number;
  mac: string;
  ip: string | null;
  vendor: string | null;
  jenis: string | null;
  nama: string | null;
  diadopsi: boolean;
  sumber: string;
  kelompokNomor: number | null;
  disembunyikan: boolean;
  terakhirTerlihat: string;
}
interface Perintah {
  id: number;
  aksi: string;
  status: string;
  dimintaOleh: string;
  dimintaPada: string;
  terkirimPada: string | null;
  selesaiPada: string | null;
  keluaran: string | null;
}
interface RiwayatData {
  rentang: string;
  mulai: string;
  akhir: string;
  seri: Denyut[];
  reboot: { pada: string }[];
  gap: { dari: string; sampai: string; detik: number }[];
  ketersediaan: number;
  timelineLayanan: { layanan: string; status: string; dari: string; sampai: string }[];
}

function isOnline(d: Denyut | null, batasDetik: number): boolean {
  if (!d) return false;
  return Date.now() - new Date(d.pada).getTime() < batasDetik * 1000;
}

/**
 * The SAME <Modal id="modal-konfirmasi"> markup servers.astro declares
 * (and SessionConsole.tsx's own identical helper already uses for
 * /session) rather than a native window.confirm() or a second modal built
 * here -- one styled confirmation dialog for the whole site.
 */
function konfirmasi(judul: string, teks: string, labelYa: string, aksi: () => Promise<void>) {
  const titleEl = document.getElementById("modal-konfirmasi-title");
  const teksEl = document.getElementById("konfirmasi-teks");
  const yaLabelEl = document.querySelector("#konfirmasi-ya .btn__label");
  if (titleEl) titleEl.textContent = judul;
  if (teksEl) teksEl.textContent = teks;
  if (yaLabelEl) yaLabelEl.textContent = labelYa;
  const yaBtn = document.getElementById("konfirmasi-ya");
  const handler = async () => {
    yaBtn?.removeEventListener("click", handler);
    try {
      await aksi();
    } finally {
      window.Modal?.close("modal-konfirmasi");
    }
  };
  yaBtn?.addEventListener("click", handler);
  window.Modal?.open("modal-konfirmasi");
}

async function api<T = { ok: boolean; kode?: string; [k: string]: unknown }>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  return res.json();
}

export default function ServerCenter() {
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [id, setId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(location.search).get("id");
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
      const p = new URLSearchParams(location.search).get("id");
      setId(p ? Number(p) : null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!loaded) return null;
  if (role !== "asisten") {
    return (
      <div className="server-center__empty">
        <h1>Halaman ini khusus asisten</h1>
        <p>Masuk sebagai asisten untuk melihat registri server dan perangkat.</p>
      </div>
    );
  }

  return id ? (
    <ServerDetailView
      id={id}
      onDeleted={() => {
        history.pushState(null, "", "/servers");
        setId(null);
      }}
    />
  ) : (
    <ServerListView
      onOpen={(newId) => {
        history.pushState(null, "", `/servers?id=${newId}`);
        setId(newId);
      }}
    />
  );
}

// -----------------------------------------------------------------------
// List view
// -----------------------------------------------------------------------

const FILTER_OPTIONS = [
  { value: "luring", label: "Luring" },
  { value: "peringatan", label: "Peringatan (CPU/suhu tinggi)" },
];
const PERINGATAN_CPU = 85;
const PERINGATAN_SUHU = 70;

function ServerListView({ onOpen }: { onOpen: (id: number) => void }) {
  const [daftar, setDaftar] = useState<ServerRow[]>([]);
  const [riwayat, setRiwayat] = useState<Record<number, RiwayatData>>({});
  const [filter, setFilter] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  async function muat() {
    const data = await api<{ ok: boolean; server: ServerRow[] }>("/api/server");
    if (!data.ok) return;
    setDaftar(data.server);
    const pairs = await Promise.all(
      data.server
        .filter((s) => s.terdaftar)
        .map(async (s): Promise<[number, RiwayatData] | null> => {
          const r = await api<{ ok: boolean } & RiwayatData>(
            `/api/server/${s.id}?aksi=riwayat&rentang=24h`,
          );
          return r.ok ? [s.id, r] : null;
        }),
    );
    setRiwayat((prev) => {
      const next = { ...prev };
      for (const p of pairs) if (p) next[p[0]] = p[1];
      return next;
    });
  }

  useEffect(() => {
    const stop = startPolling(muat, 15_000);
    return stop;
  }, []);

  const filtered = daftar.filter((s) => {
    if (filter.length === 0) return true;
    const online = isOnline(s.denyutTerakhir, s.batasLuringDetik);
    const peringatan =
      (s.denyutTerakhir?.cpu ?? 0) >= PERINGATAN_CPU ||
      (s.denyutTerakhir?.suhu ?? 0) >= PERINGATAN_SUHU;
    return (
      (filter.includes("luring") && !online) ||
      (filter.includes("peringatan") && online && peringatan)
    );
  });

  return (
    <div className="server-center">
      <section className="server-center__head">
        <div>
          <h1 className="server-center__title">Pusat server</h1>
          <p className="server-center__lede">
            Orange Pi yang terdaftar, kesehatannya, dan MCU yang terpasang padanya.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setFormOpen(true)}>
          <span className="btn__label">Daftarkan Pi</span>
        </button>
      </section>

      {daftar.length > 1 && (
        <div className="server-center__toolbar">
          <DropdownFilter
            id="server-center-filter"
            label="Filter"
            options={FILTER_OPTIONS}
            values={filter}
            onChange={setFilter}
          />
        </div>
      )}

      {daftar.length === 0 ? (
        <p className="server-center__kosong">
          Belum ada server terdaftar. Daftarkan satu Orange Pi untuk mulai memantau kesehatannya.
        </p>
      ) : filtered.length === 0 ? (
        <p className="server-center__kosong">Tidak ada server yang cocok dengan filter ini.</p>
      ) : (
        <div className="server-center__grid">
          {filtered.map((s) => (
            <ServerCard key={s.id} s={s} riwayat={riwayat[s.id]} onOpen={() => onOpen(s.id)} />
          ))}
        </div>
      )}

      {formOpen && <DaftarServerModal onClose={() => setFormOpen(false)} onDone={muat} />}
    </div>
  );
}

function Sparkline({ seri, field }: { seri: Denyut[]; field: "cpu" | "suhu" }) {
  const vals = seri.map((d) => d[field]).filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="server-card__sparkline-empty">-</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg className="server-card__sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ServerCard({
  s,
  riwayat,
  onOpen,
}: {
  s: ServerRow;
  riwayat: RiwayatData | undefined;
  onOpen: () => void;
}) {
  const online = isOnline(s.denyutTerakhir, s.batasLuringDetik);
  return (
    <button
      type="button"
      className="server-card"
      onClick={onOpen}
      data-online={online ? "yes" : "no"}
    >
      <div className="server-card__head">
        <span className="server-card__nama">{s.nama}</span>
        <span
          className="status-pill"
          data-tone={!s.terdaftar ? "neutral" : online ? "ok" : "danger"}
        >
          {!s.terdaftar ? "Menunggu agen" : online ? "Daring" : "Luring"}
        </span>
      </div>
      <div className="server-card__metrics">
        <div className="server-card__metric">
          <span className="server-card__metric-label">CPU 24h</span>
          {riwayat ? <Sparkline seri={riwayat.seri} field="cpu" /> : <span>-</span>}
        </div>
        <div className="server-card__metric">
          <span className="server-card__metric-label">Suhu 24h</span>
          {riwayat ? <Sparkline seri={riwayat.seri} field="suhu" /> : <span>-</span>}
        </div>
      </div>
      <div className="server-card__foot">
        <span>Ketersediaan {riwayat ? `${riwayat.ketersediaan}%` : "-"}</span>
        <span>
          {s.denyutTerakhir
            ? `Terakhir lapor ${fmtWaktu(s.denyutTerakhir.pada)}`
            : "Belum ada denyut"}
        </span>
      </div>
      {s.denyutTerakhir?.layanan && (
        <div className="server-card__layanan">
          {Object.entries(s.denyutTerakhir.layanan).map(([key, status]) => (
            <span key={key} className="layanan-chip" data-status={status}>
              {LAYANAN_LABEL[key] ?? key}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function DaftarServerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nama, setNama] = useState("");
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<{ kode: string; token: string } | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await api<{ ok: boolean; kode?: string; token?: string }>("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, kode }),
      });
      if (!data.ok) {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
        return;
      }
      setToken({ kode: data.kode!, token: data.token! });
      onDone();
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setBusy(false);
    }
  }

  function perintahDaftar(kodeVal: string, tokenVal: string): string {
    return [
      "sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json \\",
      `  python3 /opt/iris-agent/agent.py enroll --kode ${kodeVal} --token ${tokenVal} \\`,
      `  --server https://${window.location.host} --repo-root /home/orangepi/IRIS-ASO`,
      "sudo systemctl restart iris-agent.service",
    ].join("\n");
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box">
        {token ? (
          <>
            <h2>Perintah pendaftaran</h2>
            <p>Salin perintah ini dan jalankan sekali di Orange Pi. Berlaku 30 menit.</p>
            <pre className="token-box mono">{perintahDaftar(token.kode, token.token)}</pre>
            <div className="modal-box__actions">
              <button type="button" className="btn btn--primary" onClick={onClose}>
                <span className="btn__label">Sudah disalin</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2>Daftarkan Orange Pi</h2>
            <p>Beri nama dan kode singkat untuk Pi ini.</p>
            <label className="field">
              <span>Nama</span>
              <input
                className="field__input"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Orange Pi Lab A"
                required
              />
            </label>
            <label className="field">
              <span>Kode</span>
              <input
                className="field__input mono"
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                placeholder="opi-lab-a"
                pattern="[a-z0-9][a-z0-9-]{1,39}"
                required
              />
              <span className="field__hint">Huruf kecil, angka, dan tanda hubung saja.</span>
            </label>
            <div className="modal-box__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                <span className="btn__label">Batal</span>
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                <span className="btn__label">Daftarkan</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Detail view
// -----------------------------------------------------------------------

interface Tab {
  id: string;
  label: string;
}
const TABS: Tab[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "layanan", label: "Layanan" },
  { id: "jaringan", label: "Jaringan" },
  { id: "perangkat", label: "Perangkat" },
  { id: "perintah", label: "Perintah" },
  { id: "diagnostik", label: "Diagnostik" },
  { id: "pengaturan", label: "Pengaturan" },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

function readHashTab(): string {
  if (typeof window === "undefined") return "ringkasan";
  const h = location.hash.replace(/^#/, "");
  return TAB_IDS.has(h) ? h : "ringkasan";
}

interface DetailData {
  server: ServerRow;
  denyutTerakhir: Denyut | null;
  batasLuringDetik: number;
  perangkat: Perangkat[];
  perintah: Perintah[];
}

function ServerDetailView({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [activeTab, setActiveTab] = useState(() => readHashTab());

  async function muat() {
    const d = await api<{ ok: boolean } & DetailData>(`/api/server/${id}`);
    if (!d.ok) {
      window.Toast?.show("Server tidak ditemukan.", "danger");
      onDeleted();
      return;
    }
    setData(d);
  }

  useEffect(() => {
    setData(null);
    muat();
    const stop = startPolling(muat, 15_000);
    return stop;
  }, [id]);

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

  if (!data) return null;
  const online = isOnline(data.denyutTerakhir, data.batasLuringDetik);

  return (
    <div className="server-center">
      <a
        className="back-link"
        href="/servers"
        onClick={(e) => {
          e.preventDefault();
          onDeleted();
        }}
      >
        &larr; Kembali ke daftar server
      </a>
      <section className="server-center__head">
        <div>
          <h1 className="server-center__title">{data.server.nama}</h1>
          <p className="server-center__lede">
            {!data.server.terdaftar
              ? "Menunggu agen mendaftar."
              : online
                ? `Daring · kode ${data.server.kode}`
                : `Luring · kode ${data.server.kode}`}
          </p>
        </div>
      </section>

      <nav className="server-center__tabs" role="tablist" aria-label="Bagian server">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className="server-center__tab"
            onClick={() => goToTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="server-center__panel">
        {activeTab === "ringkasan" && <RingkasanTab id={id} data={data} />}
        {activeTab === "layanan" && <LayananTab id={id} data={data} onChanged={muat} />}
        {activeTab === "jaringan" && <JaringanTab id={id} data={data} onChanged={muat} />}
        {activeTab === "perangkat" && <PerangkatTab data={data} onChanged={muat} />}
        {activeTab === "perintah" && <PerintahTab data={data} onChanged={muat} />}
        {activeTab === "diagnostik" && <DiagnostikTab id={id} data={data} onChanged={muat} />}
        {activeTab === "pengaturan" && (
          <PengaturanTab id={id} data={data} onChanged={muat} onDeleted={onDeleted} />
        )}
      </div>
    </div>
  );
}

async function kirim(
  serverId: number,
  aksi: string,
  argumen: Record<string, string> = {},
): Promise<{ ok: boolean; kode?: string; id?: number }> {
  return api("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipe: "kirim", serverId, aksi, argumen }),
  });
}

// -- Ringkasan ------------------------------------------------------------

const RENTANG_OPTIONS = [
  { value: "1h", label: "1 jam" },
  { value: "24h", label: "24 jam" },
  { value: "7d", label: "7 hari" },
];

function RingkasanTab({ id, data }: { id: number; data: DetailData }) {
  const [rentang, setRentang] = useState("24h");
  const [riwayat, setRiwayat] = useState<RiwayatData | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const uplotRef = useRef<import("uplot") | null>(null);

  useEffect(() => {
    setRiwayat(null);
    api<{ ok: boolean } & RiwayatData>(`/api/server/${id}?aksi=riwayat&rentang=${rentang}`).then(
      (d) => {
        if (d.ok) setRiwayat(d);
      },
    );
  }, [id, rentang]);

  useEffect(() => {
    let cancelled = false;
    if (!riwayat || !chartRef.current) return;
    import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !chartRef.current) return;
      uplotRef.current?.destroy();
      const xs = riwayat.seri.map((d) => new Date(d.pada).getTime() / 1000);
      const cpu = riwayat.seri.map((d) => d.cpu ?? null);
      const mem = riwayat.seri.map((d) => d.memori ?? null);
      const suhu = riwayat.seri.map((d) => d.suhu ?? null);
      uplotRef.current = new uPlot(
        {
          width: chartRef.current.clientWidth || 600,
          height: 220,
          scales: { x: { time: true } },
          series: [
            {},
            { label: "CPU %", stroke: "#7dd3fc", width: 1.5 },
            { label: "Memori %", stroke: "#c4b5fd", width: 1.5 },
            { label: "Suhu °C", stroke: "#fca5a5", width: 1.5 },
          ],
          axes: [{}, {}],
        },
        [xs, cpu, mem, suhu],
        chartRef.current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [riwayat]);

  useEffect(() => {
    return () => uplotRef.current?.destroy();
  }, []);

  const d = data.denyutTerakhir;
  return (
    <div className="tab-stack">
      <div className="tab-toolbar">
        <Dropdown
          id="server-ringkasan-rentang"
          label="Rentang"
          options={RENTANG_OPTIONS}
          value={rentang}
          onChange={setRentang}
        />
      </div>

      <dl className="metrics">
        <div>
          <dt>CPU</dt>
          <dd>{d?.cpu != null ? `${d.cpu}%` : "-"}</dd>
        </div>
        <div>
          <dt>Memori</dt>
          <dd>{d?.memori != null ? `${d.memori}%` : "-"}</dd>
        </div>
        <div>
          <dt>Disk</dt>
          <dd>{d?.disk != null ? `${d.disk}%` : "-"}</dd>
        </div>
        <div>
          <dt>Suhu</dt>
          <dd>{d?.suhu != null ? `${d.suhu}°C` : "-"}</dd>
        </div>
        <div>
          <dt>Uptime</dt>
          <dd>{fmtUptime(d?.uptimeSec ?? null)}</dd>
        </div>
        <div>
          <dt>Ketersediaan ({RENTANG_OPTIONS.find((r) => r.value === rentang)?.label})</dt>
          <dd>{riwayat ? `${riwayat.ketersediaan}%` : "-"}</dd>
        </div>
      </dl>

      <div className="chart-box" ref={chartRef} />

      <div className="tab-columns">
        <div>
          <h3>Reboot</h3>
          {!riwayat || riwayat.reboot.length === 0 ? (
            <p className="muted">Tidak ada reboot pada rentang ini.</p>
          ) : (
            <ul className="event-list">
              {riwayat.reboot.map((r, i) => (
                <li key={i}>{fmtWaktu(r.pada)}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Jeda luring</h3>
          {!riwayat || riwayat.gap.length === 0 ? (
            <p className="muted">Tidak ada jeda luring yang tercatat.</p>
          ) : (
            <ul className="event-list">
              {riwayat.gap.map((g, i) => (
                <li key={i}>
                  {fmtWaktu(g.dari)} &ndash; {fmtWaktu(g.sampai)} ({Math.round(g.detik / 60)} menit)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Layanan ----------------------------------------------------------------

function LayananTab({
  id,
  data,
  onChanged,
}: {
  id: number;
  data: DetailData;
  onChanged: () => void;
}) {
  const [pilihan, setPilihan] = useState(Object.keys(LAYANAN_LABEL)[0]);
  const [busy, setBusy] = useState(false);
  const [riwayat, setRiwayat] = useState<RiwayatData | null>(null);
  const [log, setLog] = useState<{ layanan: string; output: string } | null>(null);

  useEffect(() => {
    api<{ ok: boolean } & RiwayatData>(`/api/server/${id}?aksi=riwayat&rentang=24h`).then((d) => {
      if (d.ok) setRiwayat(d);
    });
  }, [id]);

  async function jalankan(aksi: string) {
    if (busy) return;
    setBusy(true);
    try {
      const data2 = await kirim(id, aksi, { layanan: pilihan });
      if (data2.ok) {
        window.Toast?.show("Perintah dikirim. Menunggu denyut berikutnya dari agen.", "ok");
        onChanged();
      } else {
        window.Toast?.show(pesanUntuk(data2.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function lihatLog() {
    const res = await kirim(id, "diag.log", { layanan: pilihan });
    if (!res.ok) {
      window.Toast?.show(pesanUntuk(res.kode), "danger");
      return;
    }
    setLog({
      layanan: pilihan,
      output: "Menunggu agen mengambil log ini. Perintah tercatat di tab Perintah.",
    });
  }

  return (
    <div className="tab-stack">
      <div className="layanan-list">
        {Object.entries(data.denyutTerakhir?.layanan ?? {}).map(([key, status]) => (
          <span key={key} className="layanan-chip" data-status={status}>
            {LAYANAN_LABEL[key] ?? key}: {status}
          </span>
        ))}
        {!data.denyutTerakhir?.layanan && <p className="muted">Belum ada laporan layanan.</p>}
      </div>

      <div className="tab-toolbar">
        <Dropdown
          id="server-layanan-pilih"
          label="Layanan"
          options={Object.entries(LAYANAN_LABEL).map(([value, label]) => ({ value, label }))}
          value={pilihan}
          onChange={setPilihan}
        />
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("layanan.mulai")}
        >
          Mulai
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() =>
            konfirmasi(
              "Hentikan layanan ini?",
              `${LAYANAN_LABEL[pilihan] ?? pilihan} akan berhenti sampai dimulai lagi.`,
              "Hentikan",
              () => jalankan("layanan.henti"),
            )
          }
        >
          Hentikan
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("layanan.mulai_ulang")}
        >
          Mulai ulang
        </button>
        <button type="button" className="btn btn--ghost" onClick={lihatLog}>
          Lihat log
        </button>
      </div>

      {log && (
        <pre className="token-box mono">
          {LAYANAN_LABEL[log.layanan] ?? log.layanan}: {log.output}
        </pre>
      )}

      <h3>Riwayat status (24 jam)</h3>
      {!riwayat || riwayat.timelineLayanan.length === 0 ? (
        <p className="muted">Belum ada riwayat status layanan.</p>
      ) : (
        <ul className="event-list">
          {riwayat.timelineLayanan.map((t, i) => (
            <li key={i}>
              {LAYANAN_LABEL[t.layanan] ?? t.layanan}: {t.status} ({fmtWaktu(t.dari)} &ndash;{" "}
              {fmtWaktu(t.sampai)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -- Jaringan -----------------------------------------------------------

function JaringanTab({ id, onChanged }: { id: number; data: DetailData; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function jalankan(aksi: "ap.nyala" | "ap.mati" | "jam.selaraskan" | "diag.jaringan") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await kirim(id, aksi);
      if (res.ok) {
        window.Toast?.show("Perintah dikirim. Menunggu denyut berikutnya dari agen.", "ok");
        onChanged();
      } else {
        window.Toast?.show(pesanUntuk(res.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tab-stack">
      <p className="muted">
        Mode jaringan, akses point dan penyelarasan jam. Detail antarmuka dan klien terhubung ada di
        laporan diagnostik jaringan (tab Diagnostik atau tombol di bawah).
      </p>
      <div className="perintah-row">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("ap.nyala")}
        >
          Nyalakan AP
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("ap.mati")}
        >
          Matikan AP
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("jam.selaraskan")}
        >
          Selaraskan jam
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => jalankan("diag.jaringan")}
        >
          Jalankan diagnostik jaringan
        </button>
      </div>
    </div>
  );
}

// -- Perangkat ------------------------------------------------------------

function PerangkatTab({ data, onChanged }: { data: DetailData; onChanged: () => void }) {
  const [filter, setFilter] = useState<"semua" | "esp32">("semua");
  const visible = data.perangkat.filter((p) => !p.disembunyikan);
  const filtered = filter === "esp32" ? visible.filter((p) => p.jenis === "esp32") : visible;
  const STALE_MS = 20 * 60_000;

  async function panggil(id: number, aksi: string, extra: Record<string, unknown> = {}) {
    const res = await api<{ ok: boolean; kode?: string }>("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipe: "perangkat", id, aksi, ...extra }),
    });
    if (!res.ok) {
      window.Toast?.show(pesanUntuk(res.kode), "danger");
      return;
    }
    onChanged();
  }

  return (
    <div className="tab-stack">
      <div className="tab-toolbar">
        <Dropdown
          id="server-perangkat-filter"
          label="Tampilkan"
          options={[
            { value: "semua", label: "Semua perangkat" },
            { value: "esp32", label: "Hanya ESP32" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as "semua" | "esp32")}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Tidak ada perangkat yang cocok.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Jenis</th>
                <th scope="col">Kelompok</th>
                <th scope="col">MAC</th>
                <th scope="col">Terakhir terlihat</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const stale = Date.now() - new Date(p.terakhirTerlihat).getTime() > STALE_MS;
                return (
                  <tr key={p.id}>
                    <td data-label="Nama">
                      {p.nama ?? <span className="muted">Belum diadopsi</span>}
                      {stale && (
                        <span className="status-pill" data-tone="neutral">
                          Basi
                        </span>
                      )}
                    </td>
                    <td data-label="Jenis">{JENIS_LABEL[p.jenis ?? ""] ?? p.jenis ?? "-"}</td>
                    <td data-label="Kelompok">{p.kelompokNomor ?? "-"}</td>
                    <td data-label="MAC" className="mono">
                      {p.mac}
                    </td>
                    <td data-label="Terakhir terlihat">{fmtWaktu(p.terakhirTerlihat)}</td>
                    <td data-label="">
                      <PerangkatBaris p={p} onUbah={panggil} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PerangkatBaris({
  p,
  onUbah,
}: {
  p: Perangkat;
  onUbah: (id: number, aksi: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [nama, setNama] = useState(p.nama ?? "");
  const [jenis, setJenis] = useState(p.jenis ?? "tidak-diketahui");
  const [kelompok, setKelompok] = useState(p.kelompokNomor ? String(p.kelompokNomor) : "");

  return (
    <div className="perangkat-baris">
      <input
        className="field__input mono"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        placeholder="Nama, mis. Kelompok 3 Hunter"
      />
      <select className="js-select mono" value={jenis} onChange={(e) => setJenis(e.target.value)}>
        {Object.entries(JENIS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="field__input mono perangkat-baris__kelompok"
        type="number"
        min={1}
        max={5}
        value={kelompok}
        onChange={(e) => setKelompok(e.target.value)}
        placeholder="Kelompok"
      />
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() =>
          onUbah(p.id, "ubah", {
            nama: nama.trim() || undefined,
            jenis,
            kelompokNomor: kelompok ? Number(kelompok) : null,
          })
        }
      >
        Simpan
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => onUbah(p.id, p.disembunyikan ? "tampilkan" : "sembunyikan")}
      >
        Sembunyikan
      </button>
      <button
        type="button"
        className="btn btn--danger btn--sm"
        onClick={() =>
          konfirmasi(
            "Lupakan perangkat ini?",
            `${p.mac} akan dihapus dari daftar. Ini tidak bisa dibatalkan.`,
            "Lupakan",
            () => onUbah(p.id, "lupakan"),
          )
        }
      >
        Lupakan
      </button>
    </div>
  );
}

// -- Perintah -------------------------------------------------------------

const PERINTAH_STATUS_OPTIONS = [
  { value: "menunggu", label: "Menunggu" },
  { value: "terkirim", label: "Terkirim" },
  { value: "selesai", label: "Selesai" },
  { value: "gagal", label: "Gagal" },
  { value: "kedaluwarsa", label: "Kedaluwarsa" },
];

function PerintahTab({ data, onChanged }: { data: DetailData; onChanged: () => void }) {
  const [filter, setFilter] = useState<string[]>([]);
  const filtered =
    filter.length === 0 ? data.perintah : data.perintah.filter((p) => filter.includes(p.status));

  async function ulang(id: number) {
    const res = await api<{ ok: boolean; kode?: string }>("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipe: "perintah_ulang", id }),
    });
    if (!res.ok) {
      window.Toast?.show(pesanUntuk(res.kode), "danger");
      return;
    }
    window.Toast?.show("Perintah diulang.", "ok");
    onChanged();
  }
  async function batal(id: number) {
    const res = await api<{ ok: boolean; kode?: string }>("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipe: "perintah_batal", id }),
    });
    if (!res.ok) {
      window.Toast?.show(pesanUntuk(res.kode), "danger");
      return;
    }
    onChanged();
  }

  return (
    <div className="tab-stack">
      <div className="tab-toolbar">
        <DropdownFilter
          id="server-perintah-filter"
          label="Status"
          options={PERINTAH_STATUS_OPTIONS}
          values={filter}
          onChange={setFilter}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="muted">Belum ada perintah yang cocok.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Aksi</th>
                <th scope="col">Status</th>
                <th scope="col">Diminta oleh</th>
                <th scope="col">Diminta</th>
                <th scope="col">Keluaran</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td data-label="Aksi">{DIAG_LABEL[p.aksi] ?? p.aksi}</td>
                  <td data-label="Status">{p.status}</td>
                  <td data-label="Diminta oleh" className="mono">
                    {p.dimintaOleh}
                  </td>
                  <td data-label="Diminta">{fmtWaktu(p.dimintaPada)}</td>
                  <td data-label="Keluaran">
                    <span className="perintah-keluaran">{p.keluaran ?? "-"}</span>
                  </td>
                  <td data-label="">
                    {(p.status === "gagal" || p.status === "kedaluwarsa") && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => ulang(p.id)}
                      >
                        Ulangi
                      </button>
                    )}
                    {p.status === "menunggu" && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => batal(p.id)}
                      >
                        Batalkan
                      </button>
                    )}
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

// -- Diagnostik -------------------------------------------------------------

function DiagnostikTab({
  id,
  data,
  onChanged,
}: {
  id: number;
  data: DetailData;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function jalankan(aksi: string) {
    setBusy(aksi);
    try {
      const res = await kirim(id, aksi);
      if (res.ok) {
        window.Toast?.show(
          "Diagnostik diminta. Hasilnya akan muncul di sini pada denyut berikutnya.",
          "ok",
        );
        onChanged();
      } else {
        window.Toast?.show(pesanUntuk(res.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setBusy(null);
    }
  }

  const terakhir = (aksi: string) =>
    data.perintah.find((p) => p.aksi === aksi && (p.status === "selesai" || p.status === "gagal"));

  return (
    <div className="tab-stack">
      <p className="muted">
        Lapisan ahli: diagnostik Linux langsung dari Orange Pi, hanya baca (tidak mengubah layanan
        apa pun). Setiap perintah dikirim lewat jalur perintah yang sama dengan tombol Layanan/AP,
        jadi hasilnya baru muncul pada denyut berikutnya dari agen.
      </p>
      {(["diag.ringkas", "diag.jaringan", "diag.dmesg"] as const).map((aksi) => {
        const last = terakhir(aksi);
        const isOpen = open === aksi;
        return (
          <div key={aksi} className="diag-card">
            <button
              type="button"
              className="diag-card__head"
              onClick={() => setOpen(isOpen ? null : aksi)}
              aria-expanded={isOpen}
            >
              <span>{DIAG_LABEL[aksi]}</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy === aksi}
                onClick={(e) => {
                  e.stopPropagation();
                  jalankan(aksi);
                }}
              >
                Jalankan
              </button>
            </button>
            {isOpen && (
              <div className="diag-card__body">
                <p className="muted">{DIAG_HINT[aksi]}</p>
                {last ? (
                  <>
                    <p className="muted">
                      Diambil {fmtWaktu(last.selesaiPada ?? last.dimintaPada)}
                    </p>
                    <pre className="token-box mono">{last.keluaran ?? "(tidak ada keluaran)"}</pre>
                  </>
                ) : (
                  <p className="muted">Belum pernah dijalankan.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -- Pengaturan -------------------------------------------------------------

function PengaturanTab({
  id,
  data,
  onChanged,
  onDeleted,
}: {
  id: number;
  data: DetailData;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [nama, setNama] = useState(data.server.nama);
  const [lokasi, setLokasi] = useState(data.server.lokasi ?? "");
  const [catatan, setCatatan] = useState(data.server.catatan ?? "");
  const [alamatLan, setAlamatLan] = useState(data.server.alamatLan ?? "");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  async function simpan(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; kode?: string }>(`/api/server/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, lokasi, catatan, alamatLan }),
      });
      if (!res.ok) {
        window.Toast?.show(pesanUntuk(res.kode), "danger");
        return;
      }
      window.Toast?.show("Tersimpan.", "ok");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function tokenBaru() {
    const res = await api<{ ok: boolean; kode?: string; kode2?: string; token?: string }>(
      `/api/server/${id}`,
      { method: "POST" },
    );
    if (!res.ok) {
      window.Toast?.show(pesanUntuk(res.kode), "danger");
      return;
    }
    setToken(res.token ?? null);
  }

  function hapus() {
    konfirmasi(
      "Hapus server ini?",
      "Riwayat denyut, perangkat, dan perintahnya ikut terhapus. Agen yang masih berjalan akan mulai ditolak pada denyut berikutnya.",
      "Hapus",
      async () => {
        const res = await api<{ ok: boolean; kode?: string }>(`/api/server/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          window.Toast?.show(pesanUntuk(res.kode), "danger");
          return;
        }
        onDeleted();
      },
    );
  }

  return (
    <div className="tab-stack">
      <form className="form-stack" onSubmit={simpan}>
        <label className="field">
          <span>Nama</span>
          <input
            className="field__input"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Lokasi</span>
          <input
            className="field__input"
            value={lokasi}
            onChange={(e) => setLokasi(e.target.value)}
            placeholder="Lab A, meja dekat jendela"
          />
        </label>
        <label className="field">
          <span>Catatan</span>
          <textarea
            className="field__input"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
          />
        </label>
        <label className="field">
          <span>Alamat LAN</span>
          <input
            className="field__input mono"
            value={alamatLan}
            onChange={(e) => setAlamatLan(e.target.value)}
            placeholder="192.168.1.20"
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          <span className="btn__label">Simpan</span>
        </button>
      </form>

      <dl className="metrics">
        <div>
          <dt>Versi agen</dt>
          <dd className="mono">{data.server.agenVersi ?? "-"}</dd>
        </div>
        <div>
          <dt>Info sistem diperbarui</dt>
          <dd>{data.server.infoSistemPada ? fmtWaktu(data.server.infoSistemPada) : "-"}</dd>
        </div>
      </dl>
      {data.server.infoSistem && (
        <pre className="token-box mono">{JSON.stringify(data.server.infoSistem, null, 2)}</pre>
      )}

      <div className="perintah-row">
        <button type="button" className="btn btn--ghost" onClick={tokenBaru}>
          Token pendaftaran baru
        </button>
        <button type="button" className="btn btn--danger" onClick={hapus}>
          Hapus server
        </button>
      </div>
      {token && (
        <pre className="token-box mono">
          sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json python3
          /opt/iris-agent/agent.py enroll --kode {data.server.kode} --token {token} --server
          https://
          {typeof window !== "undefined" ? window.location.host : ""} --repo-root
          /home/orangepi/IRIS-ASO
        </pre>
      )}
    </div>
  );
}
