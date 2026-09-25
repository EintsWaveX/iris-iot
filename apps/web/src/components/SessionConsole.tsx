/**
 * P6.6: the session control room. Replaces session.astro's own page script
 * (session start/end/cancel/lanjutkan, the roster paste box) AND
 * SessionPanels.tsx (per-group tiles, stuck list, broadcast, server
 * readiness) with one island: a sticky status bar plus a tabbed workspace,
 * per the plan's own spec. session.astro itself shrinks to a role check, the
 * Nav/Toast/Modal shell, and mounting this component -- see that file's own
 * header comment.
 *
 * The confirmation dialog is the SAME <Modal id="modal-konfirmasi"> markup
 * session.astro already declares (and src/scripts/modal.ts already wires up
 * globally as window.Modal) rather than a second one built here: reusing it
 * costs one DOM read/write per confirm instead of duplicating Modal.astro's
 * whole scoped stylesheet, which a plain React-rendered node could never
 * reach anyway (see modul-akses.ts's own note on Astro's scoped CSS attrs).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { startPolling } from "../scripts/polling";
import { parseRosterPaste, rosterToPaste } from "../lib/roster-parser";
import { denganSibuk } from "../scripts/busy";
import { hariIniWib, SLOT_MULAI, SESI_CAP_MENIT } from "../lib/jadwal";
import Dropdown, { DropdownMulti, DropdownFilter } from "./ui/Dropdown";
import PresentationManager from "./PresentationManager";
import { unduhCsv } from "../lib/csv";
import { buildSeelabsBookmarklet, buildSeelabsSnippet } from "../lib/seelabs-helper";
import "./SessionConsole.css";

export const SESI_BERUBAH = "iris:sesi-berubah";

const WIDE_BREAKPOINT = 1440;
const VIEW_PREF_KEY = "iris-session-console-view";
const MAX_PANELS = 3;

interface AnggotaRow {
  nim: string;
  nama: string;
  hadir: boolean;
}

interface KelompokRow {
  id: number;
  nomor: number;
  nama: string;
  sesiAktif: boolean;
  catatan: string | null;
  peran: "beacon" | "hunter" | null;
  anggotaTotal: number;
  hadir: number;
  benar: number;
  total: number;
  anggota: AnggotaRow[];
}

interface Stuck {
  kelompokId: number;
  nomor: number | null;
  soalKode: string;
  percobaan: number;
}

interface Heartbeat {
  pada: string;
  jamSelaras: boolean;
  modeJaringan: string | null;
  layanan: Record<string, string> | null;
}

interface ServerRow {
  id: number;
  nama: string;
  kode: string;
  denyutTerakhir: Heartbeat | null;
  batasLuringDetik: number;
}

interface SesiRunning {
  id: number;
  modul: number;
  tanggal: string;
  mulai: string;
  mulaiPada: string | null;
  slot: number;
  butuhAp: boolean;
}

const KODE_PESAN: Record<string, string> = {
  format_salah: "Formatnya belum benar.",
  sudah_ada:
    "Slot ini sudah dipakai sesi modul yang sama pada tanggal itu, termasuk yang sudah selesai. Pilih slot lain.",
  sudah_lewat: "Sesi ini sudah melewati batas 165 menitnya dan tidak bisa dilanjutkan.",
  tidak_bisa_dilanjutkan: "Hanya sesi yang sudah diakhiri yang bisa dilanjutkan.",
  galat_tempel: "Masih ada baris yang bermasalah pada tempelan.",
  sesi_tidak_ada: "Sesi ini tidak ditemukan.",
  sudah_selesai: "Sesi ini sudah selesai atau dibatalkan.",
  galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
};
function pesanUntuk(kode: string | undefined): string {
  return KODE_PESAN[kode ?? ""] ?? "Terjadi kesalahan.";
}

const MODULE_NAMES: Record<number, string> = {
  1: "Bluetooth Low Energy",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

const LAYANAN_LABEL: Record<string, string> = {
  "modul2-ws": "WebSocket Modul 2",
  mosquitto: "Mosquitto (Modul 3)",
  modul4: "Papan skor Modul 4",
};

function isOnline(hb: Heartbeat | null, batasDetik: number): boolean {
  if (!hb) return false;
  return Date.now() - new Date(hb.pada).getTime() < batasDetik * 1000;
}

interface Tab {
  id: string;
  label: string;
}
const TABS: Tab[] = [
  { id: "kelompok", label: "Kelompok" },
  { id: "bantuan", label: "Bantuan" },
  { id: "pengumuman", label: "Pengumuman" },
  { id: "server", label: "Server" },
  { id: "roster", label: "Roster" },
  { id: "presentasi", label: "Presentasi" },
  { id: "modul", label: "Modul" },
  { id: "nilai", label: "Nilai" },
  { id: "laporan", label: "Laporan" },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

function readHashTab(): string {
  const h = location.hash.replace(/^#/, "");
  return TAB_IDS.has(h) ? h : "kelompok";
}

function useWideViewport(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= WIDE_BREAKPOINT,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return wide;
}

export default function SessionConsole() {
  const [loaded, setLoaded] = useState(false);
  const [sesi, setSesi] = useState<SesiRunning | null>(null);
  const [kelompok, setKelompok] = useState<KelompokRow[]>([]);
  const [stuck, setStuck] = useState<Stuck[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [roster, setRoster] = useState<
    Array<{ id: number; nomor: number; nama: string; anggota: { nim: string; nama: string }[] }>
  >([]);
  const [activeTab, setActiveTab] = useState<string>(() =>
    typeof window !== "undefined" ? readHashTab() : "kelompok",
  );
  const wide = useWideViewport();
  const [viewTabs, setViewTabs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_PREF_KEY) ?? "[]");
      if (Array.isArray(saved))
        setViewTabs(saved.filter((t) => TAB_IDS.has(t)).slice(0, MAX_PANELS));
    } catch {
      // localStorage unavailable or garbage -- start empty, harmless.
    }
  }, []);

  useEffect(() => {
    function onHash() {
      setActiveTab(readHashTab());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function goToTab(id: string) {
    setActiveTab(id);
    history.replaceState(null, "", `#${id}`);
  }

  function updateViewTabs(next: string[]) {
    const trimmed = next.slice(-MAX_PANELS);
    setViewTabs(trimmed);
    try {
      localStorage.setItem(VIEW_PREF_KEY, JSON.stringify(trimmed));
    } catch {
      // per-viewer convenience only -- fine if it doesn't persist.
    }
  }

  async function muat() {
    try {
      const [current, laporan, daftarServer] = await Promise.all([
        fetch("/api/session/current").then((r) => r.json()),
        fetch("/api/session/laporan").then((r) => r.json()),
        fetch("/api/server").then((r) => r.json()),
      ]);

      const sesiIdBaru: number | null = current.ok ? (current.sesi?.id ?? null) : null;
      setSesi((prev) => {
        if (prev?.id !== sesiIdBaru) window.dispatchEvent(new Event(SESI_BERUBAH));
        return current.ok && current.sesi ? current.sesi : null;
      });
      if (current.ok) setRoster(current.roster ?? []);

      if (laporan.ok) {
        setKelompok(laporan.kelompok ?? []);
        setStuck(laporan.stuck ?? []);
      }
      if (daftarServer.ok) setServers(daftarServer.server ?? []);
    } catch {
      // Left at whatever the last successful poll produced.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    const stop = startPolling(muat, 30_000);
    const onBerubah = () => void muat();
    window.addEventListener(SESI_BERUBAH, onBerubah);
    return () => {
      stop();
      window.removeEventListener(SESI_BERUBAH, onBerubah);
    };
  }, []);

  // B12: this page's sky stayed on the static "kerja" scene throughout a
  // running session (only the dashboard tinted it). Mirrors dashboard.astro's
  // own cosmosInSesiScene tracking so a real transition only fires once.
  const cosmosInSesiSceneRef = useRef(false);
  useEffect(() => {
    if (sesi) {
      window.Cosmos?.setModuleTint(sesi.modul);
      if (!cosmosInSesiSceneRef.current) {
        cosmosInSesiSceneRef.current = true;
        window.Cosmos?.setScene("sesi");
      }
    } else if (cosmosInSesiSceneRef.current) {
      cosmosInSesiSceneRef.current = false;
      window.Cosmos?.setScene("kerja");
      window.Cosmos?.setModuleTint(0);
    }
  }, [sesi]);

  const onlineCount = servers.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const stuckCount = stuck.length;

  if (!loaded) return null;

  const panels = wide && viewTabs.length > 0 ? viewTabs : [activeTab];

  return (
    <div className="session-console">
      {sesi ? (
        <StatusBar sesi={sesi} servers={servers} onlineCount={onlineCount} onChanged={muat} />
      ) : (
        <MulaiSesiPanel onStarted={muat} />
      )}

      {sesi && sesi.modul === 4 && (
        <div className="session-console__notice">
          Papan skor dan konsol asisten Modul 4A masih berjalan lewat token, langsung di Orange Pi,
          bukan lewat akun ini. Buka papan skornya dari jaringan <strong>IRIS-IOT</strong>, lalu
          ketuk logo tiga kali untuk memasukkan token.
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => window.open("http://192.168.4.1:8080/", "_blank", "noopener")}
          >
            Buka papan skor
          </button>
        </div>
      )}

      {sesi && (
        <div className="session-console__toolbar">
          {wide ? (
            <DropdownMulti
              id="session-console-tampilkan"
              label="Tampilkan"
              options={TABS.map((t) => ({ value: t.id, label: t.label }))}
              values={viewTabs}
              onChange={updateViewTabs}
              summary={(sel) =>
                sel.length === 0 ? "Tampilkan panel" : sel.map((o) => o.label).join(", ")
              }
            />
          ) : (
            <nav className="session-console__tabs" role="tablist" aria-label="Bagian sesi">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className="session-console__tab"
                  onClick={() => goToTab(t.id)}
                >
                  {t.label}
                  {t.id === "bantuan" && stuckCount > 0 && (
                    <span className="session-console__tab-badge">{stuckCount}</span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {sesi && (
        <div className="session-console__panels" data-count={panels.length}>
          {panels.map((tabId) => (
            <div key={tabId} className="session-console__panel">
              {wide && viewTabs.length > 0 && (
                <h2 className="session-console__panel-heading">
                  {TABS.find((t) => t.id === tabId)?.label}
                </h2>
              )}
              <TabBody
                tab={tabId}
                sesi={sesi}
                kelompok={kelompok}
                stuck={stuck}
                servers={servers}
                roster={roster}
                onChanged={muat}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------
function formatSisa(mulaiPadaIso: string | null): {
  berjalan: number;
  sisa: number;
  persen: number;
} {
  if (!mulaiPadaIso) return { berjalan: 0, sisa: SESI_CAP_MENIT, persen: 0 };
  const mulaiMs = new Date(mulaiPadaIso).getTime();
  if (Number.isNaN(mulaiMs)) return { berjalan: 0, sisa: SESI_CAP_MENIT, persen: 0 };
  const berjalan = Math.max(0, Math.round((Date.now() - mulaiMs) / 60000));
  const sisa = Math.max(0, SESI_CAP_MENIT - berjalan);
  const persen = Math.min(100, Math.round((berjalan / SESI_CAP_MENIT) * 100));
  return { berjalan, sisa, persen };
}

function StatusBar({
  sesi,
  servers,
  onlineCount,
  onChanged,
}: {
  sesi: SesiRunning;
  servers: ServerRow[];
  onlineCount: number;
  onChanged: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  void now;
  const { berjalan, sisa, persen } = formatSisa(sesi.mulaiPada);

  const [confirmBusy, setConfirmBusy] = useState(false);
  const btnAkhiriRef = useRef<HTMLButtonElement | null>(null);
  const btnBatalkanRef = useRef<HTMLButtonElement | null>(null);

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
      setConfirmBusy(true);
      try {
        await aksi();
      } finally {
        setConfirmBusy(false);
        window.Modal?.close("modal-konfirmasi");
      }
    };
    void confirmBusy;
    yaBtn?.addEventListener("click", handler);
    window.Modal?.open("modal-konfirmasi");
  }

  async function kirimAksiSesi(url: string, body: unknown, pesanOk: string) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show(pesanOk, "ok");
        await onChanged();
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    }
  }

  const server = servers.length === 1 ? servers[0] : null;
  const modeJaringan = server?.denyutTerakhir?.modeJaringan ?? null;

  async function toggleAp(nyala: boolean) {
    if (!server) return;
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipe: "kirim",
          serverId: server.id,
          aksi: nyala ? "ap.nyala" : "ap.mati",
          argumen: {},
        }),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show("Perintah dikirim. Menunggu denyut berikutnya dari agen.", "ok");
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    }
  }

  return (
    <div className="session-console__status">
      <div className="session-console__status-head">
        <h1 className="session-console__title">
          Modul {sesi.modul}{" "}
          <span className="session-console__title-nama">{MODULE_NAMES[sesi.modul]}</span>
        </h1>
        <p className="session-console__meta">
          Slot {sesi.slot} · {SLOT_MULAI[sesi.slot] ?? sesi.mulai} · {sesi.tanggal}
        </p>
      </div>

      <div className="session-console__progress-wrap">
        <div
          className="session-console__progress"
          role="progressbar"
          aria-valuenow={persen}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="session-console__progress-fill" style={{ width: `${persen}%` }} />
        </div>
        <p className="session-console__progress-label">
          {berjalan} menit berjalan · sisa {sisa} menit dari {SESI_CAP_MENIT}
        </p>
      </div>

      <div className="session-console__chips">
        <span className="session-console__chip">
          <span className="session-console__dot" data-online={onlineCount > 0 ? "yes" : "no"} />
          {onlineCount} server online
        </span>
        {sesi.butuhAp && (
          <span className="session-console__chip" data-ap="yes">
            AP: {modeJaringan ?? (server ? "menunggu denyut" : "kelola dari /servers")}
            {server && (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => toggleAp(true)}
                >
                  Nyalakan
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => toggleAp(false)}
                >
                  Matikan
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <div className="session-console__actions">
        <button
          ref={btnAkhiriRef}
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            void denganSibuk(btnAkhiriRef.current, async () => {
              konfirmasi(
                "Akhiri sesi ini?",
                "Praktikan tidak bisa masuk lagi ke sesi ini, dan slotnya tetap terpakai untuk tanggal itu. Sesi yang diakhiri masih bisa dilanjutkan selama belum lewat 165 menit sejak dimulai.",
                "Akhiri sesi",
                () => kirimAksiSesi("/api/session/end", {}, "Sesi diakhiri."),
              );
            })
          }
        >
          Akhiri sesi
        </button>
        <button
          ref={btnBatalkanRef}
          type="button"
          className="btn btn--danger"
          onClick={() =>
            void denganSibuk(btnBatalkanRef.current, async () => {
              konfirmasi(
                "Batalkan sesi ini?",
                "Sesi yang dibatalkan dianggap tidak pernah ada dan slotnya bebas dipakai lagi. Jawaban yang sudah masuk tetap tersimpan.",
                "Batalkan sesi",
                () => kirimAksiSesi("/api/session/cancel", { sesiId: sesi.id }, "Sesi dibatalkan."),
              );
            })
          }
        >
          Batalkan sesi
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// No session running: "Mulai sesi"
// ---------------------------------------------------------------------
function slotUntukSekarang(): string {
  const jamWib = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (jamWib < 8) return "1";
  if (jamWib < 11) return "2";
  if (jamWib < 14) return "3";
  return "4";
}

function MulaiSesiPanel({ onStarted }: { onStarted: () => Promise<void> }) {
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [slot, setSlot] = useState(slotUntukSekarang());
  const [modul, setModul] = useState("1");
  const [butuhAp, setButuhAp] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    await denganSibuk(btnRef.current, async () => {
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tanggal,
            slot: Number(slot),
            modul: Number(modul),
            butuhAp,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          await onStarted();
          return;
        }
        const lama = data.sesiLama as
          { id: number; status: string; bisaDilanjutkan: boolean } | null | undefined;
        if (data.kode === "sudah_ada" && lama?.status === "berjalan") {
          window.Toast?.show("Sesi ini sudah berjalan.", "info");
          await onStarted();
        } else if (data.kode === "sudah_ada" && lama?.bisaDilanjutkan) {
          const titleEl = document.getElementById("modal-konfirmasi-title");
          const teksEl = document.getElementById("konfirmasi-teks");
          const yaLabelEl = document.querySelector("#konfirmasi-ya .btn__label");
          if (titleEl) titleEl.textContent = "Sesi ini sudah pernah dimulai";
          if (teksEl)
            teksEl.textContent = `Sesi #${lama.id} untuk slot dan modul ini sudah dimulai lalu diakhiri. Lanjutkan sesi itu? Jawaban yang sudah masuk tetap terhitung.`;
          if (yaLabelEl) yaLabelEl.textContent = "Lanjutkan sesi";
          const yaBtn = document.getElementById("konfirmasi-ya");
          const handler = async () => {
            yaBtn?.removeEventListener("click", handler);
            try {
              const r2 = await fetch("/api/session/lanjutkan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sesiId: lama.id }),
              });
              const d2 = await r2.json();
              if (d2.ok) {
                window.Toast?.show("Sesi dilanjutkan.", "ok");
                await onStarted();
              } else {
                window.Toast?.show(pesanUntuk(d2.kode), "danger");
              }
            } finally {
              window.Modal?.close("modal-konfirmasi");
            }
          };
          yaBtn?.addEventListener("click", handler);
          window.Modal?.open("modal-konfirmasi");
        } else {
          window.Toast?.show(pesanUntuk(data.kode), "danger");
        }
      } catch {
        window.Toast?.show("Tidak dapat menghubungi server.", "danger");
      }
    });
  }

  return (
    <div className="session-console__mulai">
      <h1 className="session-console__title">Belum ada sesi yang berjalan</h1>
      <form onSubmit={submit} className="session-console__mulai-form">
        <div className="session-console__mulai-grid">
          <label className="session-console__field">
            <span>Tanggal</span>
            <input
              type="date"
              className="session-console__input"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
            />
          </label>
          <Dropdown
            id="sc-sesi-slot"
            label="Slot"
            value={slot}
            onChange={setSlot}
            options={[
              { value: "1", label: "Slot 1 · 06:30" },
              { value: "2", label: "Slot 2 · 09:30" },
              { value: "3", label: "Slot 3 · 12:30" },
              { value: "4", label: "Slot 4 · 15:30" },
            ]}
          />
          <Dropdown
            id="sc-sesi-modul"
            label="Modul"
            value={modul}
            onChange={setModul}
            options={[
              { value: "1", label: "Modul 1 · BLE" },
              { value: "2", label: "Modul 2 · WebSocket" },
              { value: "3", label: "Modul 3 · MQTT" },
              { value: "4", label: "Modul 4 · LoRa" },
            ]}
          />
        </div>
        {modul === "4" && (
          <label className="session-console__ap-toggle">
            <input
              type="checkbox"
              checked={butuhAp}
              onChange={(e) => setButuhAp(e.target.checked)}
            />
            Mode AP: Orange Pi jadi hotspot IRIS-IOT. Live di web hanya bila dongle uplink Pi
            tersambung ke Wi-Fi kampus, kalau tidak riwayat-saja
          </label>
        )}
        <button ref={btnRef} type="submit" className="btn btn--primary">
          Mulai sesi
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab bodies
// ---------------------------------------------------------------------
type Filter = "semua" | "bantuan" | "tidak_hadir" | "tidak_aktif";

function TabBody({
  tab,
  sesi,
  kelompok,
  stuck,
  servers,
  roster,
  onChanged,
}: {
  tab: string;
  sesi: SesiRunning;
  kelompok: KelompokRow[];
  stuck: Stuck[];
  servers: ServerRow[];
  roster: Array<{
    id: number;
    nomor: number;
    nama: string;
    anggota: { nim: string; nama: string }[];
  }>;
  onChanged: () => Promise<void>;
}) {
  switch (tab) {
    case "kelompok":
      return (
        <KelompokTab
          sesiId={sesi.id}
          modul={sesi.modul}
          kelompok={kelompok}
          stuck={stuck}
          onChanged={onChanged}
        />
      );
    case "bantuan":
      return <BantuanTab stuck={stuck} />;
    case "pengumuman":
      return <PengumumanTab />;
    case "server":
      return <ServerTab servers={servers} />;
    case "roster":
      return <RosterTab roster={roster} onChanged={onChanged} />;
    case "presentasi":
      return <PresentationManager />;
    case "modul":
      return <ModulTab />;
    case "nilai":
      return <NilaiTab sesiId={sesi.id} kelompok={kelompok} />;
    case "laporan":
      return <LaporanTab sesiId={sesi.id} />;
    default:
      return null;
  }
}

function KelompokTab({
  sesiId,
  modul,
  kelompok,
  stuck,
  onChanged,
}: {
  sesiId: number;
  modul: number;
  kelompok: KelompokRow[];
  stuck: Stuck[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter[]>([]);
  const stuckByKelompok = useMemo(() => new Set(stuck.map((s) => s.kelompokId)), [stuck]);

  const [drafts, setDrafts] = useState<Record<number, { catatan: string; peran: string }>>({});
  const focusedRef = useRef<number | null>(null);
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const k of kelompok) {
        if (focusedRef.current === k.id) continue;
        next[k.id] = { catatan: k.catatan ?? "", peran: k.peran ?? "" };
      }
      return next;
    });
  }, [kelompok]);

  async function toggleAktif(k: KelompokRow) {
    const aktif = !k.sesiAktif;
    try {
      const res = await fetch("/api/session/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, kelompokId: k.id, aktif }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
      await onChanged();
    } catch {
      window.Toast?.show("Tidak dapat mengubah status kelompok ini.", "danger");
    }
  }

  async function saveCatatan(kelompokId: number, catatan: string, peran: string) {
    try {
      const res = await fetch("/api/session/catatan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, kelompokId, catatan, peran: peran || null }),
      });
      const data = await res.json();
      if (!data.ok) window.Toast?.show(pesanUntuk(data.kode), "danger");
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    }
  }

  const filtered = kelompok.filter((k) => {
    if (filter.length === 0) return true;
    return filter.some((f) => {
      if (f === "bantuan") return stuckByKelompok.has(k.id);
      if (f === "tidak_hadir") return k.hadir === 0;
      if (f === "tidak_aktif") return !k.sesiAktif;
      return true;
    });
  });

  return (
    <section className="session-console__section">
      <div className="session-console__section-head">
        <h2 className="session-console__heading">Kelompok</h2>
        <DropdownFilter
          id="sc-kelompok-filter"
          label="Saring"
          options={[
            { value: "bantuan", label: "Perlu bantuan" },
            { value: "tidak_hadir", label: "Belum hadir" },
            { value: "tidak_aktif", label: "Tidak aktif" },
          ]}
          values={filter}
          onChange={(v) => setFilter(v as Filter[])}
        />
      </div>
      <div className="session-console__tiles">
        {filtered.map((k) => (
          <div
            key={k.id}
            className="session-console__tile"
            style={{ "--tile-hue": `var(--group-${k.nomor})` } as React.CSSProperties}
            data-aktif={k.sesiAktif ? "yes" : "no"}
          >
            <div className="session-console__tile-head">
              <span className="session-console__tile-nomor">Kelompok {k.nomor}</span>
              <label className="session-console__tile-toggle">
                <input type="checkbox" checked={k.sesiAktif} onChange={() => toggleAktif(k)} />
                aktif
              </label>
            </div>
            <p className="session-console__tile-nama">{k.nama}</p>
            <dl className="session-console__tile-stats">
              <div>
                <dt>Hadir</dt>
                <dd>
                  {k.hadir}/{k.anggotaTotal}
                </dd>
              </div>
              <div>
                <dt>Blank benar</dt>
                <dd>
                  {k.benar}/{k.total}
                </dd>
              </div>
            </dl>
            <div className="session-console__tile-bar">
              <div
                className="session-console__tile-bar-fill"
                style={{ width: k.total > 0 ? `${Math.round((k.benar / k.total) * 100)}%` : "0%" }}
              />
            </div>
            {k.anggota.length > 0 && (
              <ul className="session-console__tile-anggota">
                {k.anggota.map((a) => (
                  <li key={a.nim} data-hadir={a.hadir ? "yes" : "no"}>
                    {a.nama}
                  </li>
                ))}
              </ul>
            )}
            {modul === 4 && (
              <Dropdown
                id={`sc-peran-${k.id}`}
                label="Peran"
                hideLabel
                value={drafts[k.id]?.peran ?? ""}
                options={[
                  { value: "", label: "Peran biasa" },
                  { value: "beacon", label: "Beacon (Modul 4)" },
                  { value: "hunter", label: "Hunter (Modul 4)" },
                ]}
                onChange={(peran) => {
                  const catatan = drafts[k.id]?.catatan ?? "";
                  setDrafts((prev) => ({ ...prev, [k.id]: { catatan, peran } }));
                  void saveCatatan(k.id, catatan, peran);
                }}
              />
            )}
            <textarea
              className="session-console__catatan"
              placeholder="Catatan untuk kelompok ini…"
              rows={2}
              value={drafts[k.id]?.catatan ?? ""}
              onFocus={() => {
                focusedRef.current = k.id;
              }}
              onChange={(e) =>
                setDrafts((prev) => ({
                  ...prev,
                  [k.id]: { peran: prev[k.id]?.peran ?? "", catatan: e.target.value },
                }))
              }
              onBlur={() => {
                focusedRef.current = null;
                const draft = drafts[k.id];
                if (draft) void saveCatatan(k.id, draft.catatan, draft.peran);
              }}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="session-console__kosong">
            {kelompok.length === 0
              ? "Belum ada kelompok pada sesi ini."
              : "Tidak ada kelompok yang cocok dengan saringan ini."}
          </p>
        )}
      </div>
    </section>
  );
}

function BantuanTab({ stuck }: { stuck: Stuck[] }) {
  const byKelompok = useMemo(() => {
    const map = new Map<string, Stuck[]>();
    for (const s of stuck) {
      const key = String(s.nomor ?? "?");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [stuck]);

  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Perlu bantuan</h2>
      {stuck.length === 0 ? (
        <p className="session-console__kosong">Tidak ada kelompok yang tersendat saat ini.</p>
      ) : (
        <div className="session-console__stuck-groups">
          {byKelompok.map(([nomor, rows]) => (
            <div key={nomor} className="session-console__stuck-group">
              <h3>Kelompok {nomor}</h3>
              <ul className="session-console__stuck">
                {rows.map((s, i) => (
                  <li key={i} className="session-console__stuck-item">
                    <span className="session-console__stuck-soal mono">{s.soalKode}</span>
                    <span className="session-console__stuck-percobaan">{s.percobaan}× dicoba</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PengumumanTab() {
  const [pesan, setPesan] = useState("");
  const [sending, setSending] = useState(false);
  const [terakhir, setTerakhir] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session/now")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.sesi) {
          setPesan(data.sesi.pengumuman ?? "");
          setTerakhir(data.sesi.pengumumanPada ?? null);
        }
      })
      .catch(() => {});
  }, []);

  async function kirim(ev: FormEvent) {
    ev.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/session/siarkan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pesan }),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show(pesan.trim() ? "Pengumuman dikirim." : "Pengumuman dihapus.", "ok");
        setTerakhir(new Date().toISOString());
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Pengumuman</h2>
      {pesan.trim() && (
        <div className="session-console__preview">
          <p className="eyebrow">Pratinjau</p>
          <p>{pesan}</p>
        </div>
      )}
      <form className="session-console__siaran" onSubmit={kirim}>
        <input
          type="text"
          className="session-console__siaran-input"
          placeholder="Contoh: sisa 10 menit, siap-siap unduh berkas"
          value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          maxLength={200}
        />
        <button type="submit" className="btn btn--primary" disabled={sending}>
          {pesan.trim() ? "Kirim" : "Hapus pengumuman"}
        </button>
      </form>
      {terakhir && (
        <p className="session-console__kosong">
          Terakhir dikirim {new Date(terakhir).toLocaleTimeString("id-ID")}
        </p>
      )}
    </section>
  );
}

function ServerTab({ servers }: { servers: ServerRow[] }) {
  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Kesiapan server</h2>
      {servers.length === 0 ? (
        <p className="session-console__kosong">Belum ada Orange Pi yang terdaftar.</p>
      ) : (
        <ul className="session-console__servers">
          {servers.map((s) => {
            const hb = s.denyutTerakhir;
            const online = isOnline(hb, s.batasLuringDetik);
            return (
              <li key={s.id} className="session-console__server">
                <div className="session-console__server-head">
                  <span data-online={online ? "yes" : "no"} className="session-console__dot" />
                  <a href={`/servers?id=${s.id}`}>{s.nama}</a>
                </div>
                {hb ? (
                  <ul className="session-console__server-facts">
                    <li data-ok={hb.jamSelaras ? "yes" : "no"}>
                      {hb.jamSelaras ? "Jam selaras" : "Jam belum selaras"}
                    </li>
                    <li>{hb.modeJaringan ?? "mode tidak diketahui"}</li>
                    {Object.entries(hb.layanan ?? {}).map(([key, status]) => (
                      <li key={key} data-ok={status === "aktif" ? "yes" : "no"}>
                        {LAYANAN_LABEL[key] ?? key}: {status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="session-console__kosong">Belum pernah mengirim denyut.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <a className="btn btn--ghost" href="/servers">
        Buka pusat server
      </a>
    </section>
  );
}

function RosterTab({
  roster,
  onChanged,
}: {
  roster: Array<{
    id: number;
    nomor: number;
    nama: string;
    anggota: { nim: string; nama: string }[];
  }>;
  onChanged: () => Promise<void>;
}) {
  const [paste, setPaste] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!touched) setPaste(rosterToPaste(roster));
  }, [roster, touched]);

  const parsed = useMemo(() => parseRosterPaste(paste), [paste]);

  async function simpan() {
    setSaving(true);
    try {
      const res = await fetch("/api/session/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paste }),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show(`Tersimpan: ${data.groups} kelompok, ${data.total} anggota.`, "ok");
        setTouched(false);
        await onChanged();
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Daftar kelompok</h2>
      <p className="eyebrow">
        Satu daftar untuk seluruh praktikum, dipakai oleh setiap modul dan sesi
      </p>
      <label className="session-console__field" htmlFor="sc-roster-paste">
        Tempel daftar kelompok
      </label>
      <textarea
        id="sc-roster-paste"
        className="session-console__roster-paste mono"
        rows={10}
        value={paste}
        onChange={(e) => {
          setTouched(true);
          setPaste(e.target.value);
        }}
        placeholder={
          "#1 Kelompok Cakra\n2311102001, Alya Rahmawati\n2311102014  Bagus Prasetyo\n\n#2 Kelompok Bayu\n2311102033 Dimas Aditya"
        }
      />
      <p className="session-console__kosong" data-bad={parsed.errors.length ? "yes" : "no"}>
        {parsed.groups.length} kelompok · {parsed.total} anggota · {parsed.errors.length} galat
      </p>
      {parsed.errors.length > 0 && (
        <ul className="session-console__errors">
          {parsed.errors.map((e, i) => (
            <li key={i}>
              {e.kode === "tanpa_kelompok"
                ? `Baris ${e.baris}: belum ada kelompok yang dibuka dengan #`
                : e.kode === "nim_ganda"
                  ? `NIM ${e.nim} muncul dua kali`
                  : `Baris ${e.baris}: bukan NIM dan nama`}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={parsed.errors.length > 0 || paste.trim().length === 0 || saving}
        onClick={simpan}
      >
        Simpan
      </button>
    </section>
  );
}

function ModulTab() {
  const [terbuka, setTerbuka] = useState<number[]>([]);
  const [pending, setPending] = useState<number[]>([]);
  const [meta, setMeta] = useState<{ diubahOleh: string | null; diubahPada: string | null }>({
    diubahOleh: null,
    diubahPada: null,
  });
  const [saving, setSaving] = useState(false);

  async function muat() {
    try {
      const data = await fetch("/api/session/akses?meta=1").then((r) => r.json());
      if (data.ok) {
        setTerbuka(data.terbuka);
        setPending(data.terbuka);
        setMeta({ diubahOleh: data.diubahOleh, diubahPada: data.diubahPada });
      }
    } catch {
      // Left empty -- the toggles below still render, just unchecked.
    }
  }
  useEffect(() => {
    void muat();
  }, []);

  function toggle(modul: number) {
    setPending((prev) =>
      prev.includes(modul)
        ? prev.filter((m) => m !== modul)
        : [...prev, modul].sort((a, b) => a - b),
    );
  }

  async function simpan() {
    setSaving(true);
    try {
      const res = await fetch("/api/session/akses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terbuka: pending }),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show("Akses modul diperbarui.", "ok");
        await muat();
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(pending) !== JSON.stringify(terbuka);

  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Akses modul</h2>
      <p className="eyebrow">
        Membuka modul N juga membuka modul di bawahnya. Menutup satu modul adalah pilihan langsung,
        tidak memengaruhi yang lain.
      </p>
      <ul className="session-console__modul-toggles">
        {[1, 2, 3, 4].map((m) => (
          <li key={m}>
            <label>
              <input type="checkbox" checked={pending.includes(m)} onChange={() => toggle(m)} />
              Modul {m} · {MODULE_NAMES[m]}
            </label>
          </li>
        ))}
      </ul>
      {meta.diubahPada && (
        <p className="session-console__kosong">
          Terakhir diubah {meta.diubahOleh ? `oleh ${meta.diubahOleh} ` : ""}
          pada {new Date(meta.diubahPada).toLocaleString("id-ID")}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={!dirty || saving}
        onClick={simpan}
      >
        Simpan perubahan
      </button>
    </section>
  );
}

interface NilaiAnggota {
  nim: string;
  nama: string;
  skor: Partial<Record<string, number>>;
  total: number;
  lengkap: boolean;
}
interface NilaiKelompok {
  id: number;
  nomor: number;
  nama: string;
  anggota: NilaiAnggota[];
}

/** Stage 12 — grading, entered per component, autosaved on blur. `kelompok`
 *  is the SAME laporan data the parent already polls for the Kelompok tab
 *  (attendance, blanks correct/total) -- passed in rather than re-fetched,
 *  so the CSV export below can join the two without a second round trip. */
function NilaiTab({ sesiId, kelompok }: { sesiId: number; kelompok: KelompokRow[] }) {
  const [data, setData] = useState<{
    komponen: readonly string[];
    kelompok: NilaiKelompok[];
  } | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [helper, setHelper] = useState<{ bookmarklet: string; snippet: string } | null>(null);

  async function muat() {
    try {
      const res = await fetch(`/api/session/nilai?sesiId=${sesiId}`).then((r) => r.json());
      if (res.ok) setData(res);
    } catch {
      // Left at whatever the last successful load produced.
    }
  }
  useEffect(() => {
    void muat();
  }, [sesiId]);

  async function simpanSatu(nim: string, komponen: string, teks: string) {
    if (teks === "") return;
    const skor = Number(teks);
    if (!Number.isInteger(skor) || skor < 0 || skor > 100) {
      window.Toast?.show("Nilai harus bilangan bulat 0 sampai 100.", "danger");
      await muat(); // snap the field back to its last saved value
      return;
    }
    const key = `${nim}.${komponen}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch("/api/session/nilai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, nim, komponen, skor }),
      }).then((r) => r.json());
      if (res.ok) {
        await muat();
      } else {
        window.Toast?.show(pesanUntuk(res.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  function unduhNilaiCsv() {
    if (!data) return;
    const baris: (string | number)[][] = [];
    for (const k of data.kelompok) {
      const laporanK = kelompok.find((lk) => lk.id === k.id);
      for (const a of k.anggota) {
        const hadirLaporan = laporanK?.anggota.find((la) => la.nim === a.nim)?.hadir ?? false;
        baris.push([
          a.nim,
          a.nama,
          k.nomor,
          hadirLaporan ? "ya" : "tidak",
          laporanK?.benar ?? 0,
          laporanK?.total ?? 0,
          ...data.komponen.map((kk) => a.skor[kk] ?? ""),
        ]);
      }
    }
    unduhCsv(
      `nilai-sesi-${sesiId}.csv`,
      ["NIM", "Nama", "Kelompok", "Hadir", "Blank benar", "Blank total", ...data.komponen],
      baris,
    );
  }

  function buatHelper() {
    if (!data) return;
    const skorList = data.kelompok.flatMap((k) =>
      k.anggota.map((a) => ({ nim: a.nim, nama: a.nama, skor: a.skor })),
    );
    setHelper({
      bookmarklet: buildSeelabsBookmarklet(`Sesi ${sesiId}`, skorList),
      snippet: buildSeelabsSnippet(`Sesi ${sesiId}`, skorList),
    });
  }

  if (!data) {
    return (
      <section className="session-console__section">
        <h2 className="session-console__heading">Nilai</h2>
        <p className="eyebrow">Memuat...</p>
      </section>
    );
  }

  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Nilai praktikum</h2>
      <p className="eyebrow">
        Diisi per komponen, tersimpan otomatis saat pindah kolom. Kolomnya sama seperti form
        Seelabs: TP, TA, D1 sampai D4, L1, L2.
      </p>
      <div className="session-console__nilai-aksi">
        <button type="button" className="btn btn--quiet btn--sm" onClick={unduhNilaiCsv}>
          Unduh CSV
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={buatHelper}>
          Buat helper Seelabs
        </button>
      </div>
      {helper && (
        <div className="session-console__nilai-helper">
          <p className="eyebrow">
            Seret tautan ini ke bilah markah, lalu klik dari halaman Input Nilai Seelabs. Helper ini
            mengisi setiap baris lalu menekan Simpan Penilaian sendiri, hanya jika semua NIM di
            tabel cocok dengan data sesi ini. Jika ada satu saja yang tidak cocok, Simpan tidak
            ditekan dan konsol menampilkan baris mana yang perlu diperiksa.
          </p>
          <a
            href={helper.bookmarklet}
            className="btn btn--primary btn--sm"
            onClick={(e) => e.preventDefault()}
            draggable
          >
            Isi nilai Seelabs
          </a>
          <p className="eyebrow">
            Atau, bila markah diblokir, tempel kode ini di konsol pada halaman Seelabs:
          </p>
          <textarea
            readOnly
            rows={6}
            className="session-console__nilai-snippet"
            value={helper.snippet}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      {data.kelompok.map((k) => (
        <div key={k.id} className="session-console__nilai-kelompok">
          <h3>
            Kelompok {k.nomor}: {k.nama}
          </h3>
          <table className="session-console__nilai-table">
            <thead>
              <tr>
                <th>NIM</th>
                <th>Nama</th>
                {data.komponen.map((kk) => (
                  <th key={kk}>{kk}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {k.anggota.map((a) => (
                <tr key={a.nim}>
                  <td>{a.nim}</td>
                  <td>
                    {a.nama}
                    {!a.lengkap && (
                      <span className="session-console__nilai-belum"> Belum lengkap</span>
                    )}
                  </td>
                  {data.komponen.map((kk) => {
                    const key = `${a.nim}.${kk}.${a.skor[kk] ?? "kosong"}`;
                    return (
                      <td key={kk}>
                        <input
                          key={key}
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={a.skor[kk] ?? ""}
                          placeholder="-"
                          disabled={saving[`${a.nim}.${kk}`] === true}
                          onBlur={(e) => void simpanSatu(a.nim, kk, e.currentTarget.value)}
                        />
                      </td>
                    );
                  })}
                  <td>{a.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function LaporanTab({ sesiId }: { sesiId: number }) {
  return (
    <section className="session-console__section">
      <h2 className="session-console__heading">Laporan</h2>
      <p className="eyebrow">Riwayat lengkap dan ekspor sesi ini ada di pusat laporan.</p>
      <a className="btn btn--primary" href={`/reports?sesi=${sesiId}`}>
        Buka laporan sesi ini
      </a>
    </section>
  );
}
