/**
 * The server centre (P8.2), /servers and /en/servers. Rebuilt from the P6.7
 * seven-tab page into something an assistant can use in a hurry:
 *
 * - List: stat tiles (online, offline, last report), one card per Pi with
 *   24 h CPU and temperature sparklines, a hover peek, and the enrolment
 *   wizard (name, command with Copy, then it waits for the first heartbeat
 *   and says so the moment the Pi checks in).
 * - Device page, three tabs instead of seven:
 *   Ringkasan  health tiles, an action bar (hotspot, clock sync, network
 *              diagnostics), the chart, services with restart/stop/log, the
 *              live command timeline (paged under "Semua perintah") and a
 *              History accordion
 *   Siap       (Phase 9, replaces Perangkat) the Ready check: diag.siap runs
 *              the Pi's preflight and each check shows as passed or with
 *              its one-line fix, plus the runs before it
 *   Pengaturan the form, agent info, diagnostics and the danger zone
 * All confirmations are the app's own dialog, never window.confirm.
 *
 * List and detail stay one island switched on ?id= (the site is static;
 * database rows have no build-time routes).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  CaretDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CopyIcon,
  HardDrivesIcon,
  InfoIcon,
  ListChecksIcon,
  ShieldWarningIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import "uplot/dist/uPlot.min.css";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import HoverCard from "../ui/HoverCard";
import { OfflineBanner, StateView, UpdatedAgo } from "../ui/Display";
import { usePoll } from "../../lib/hooks";
import {
  dict,
  getJson,
  href,
  jamMenit,
  postJson,
  sejak,
  useMe,
  useTick,
  localeOf,
} from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { durasiLabel } from "../../lib/labels";
import { useDirektori } from "../../lib/people";
import { bacaHasilSiap, urutkanLayanan } from "../../lib/server-shared";
import {
  CommandTimeline,
  HotspotCard,
  OPS_T,
  SVC_DOT,
  SVC_PILL,
  ServiceList,
  sendCommand,
  svcTone,
} from "./ops";
import type { Heartbeat, Perintah } from "../console/types";
import "./ServerCenter.css";
import { chartColors, useThemeKey } from "../../lib/chart-colors";

interface Denyut extends Heartbeat {
  memori: number | null;
  disk: number | null;
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

interface Detail {
  server: ServerRow;
  denyutTerakhir: Denyut | null;
  batasLuringDetik: number;
  perintah: Perintah[];
  /** The running session's module, or null when none runs. */
  sesiModul: number | null;
}

interface Riwayat {
  rentang: string;
  seri: Denyut[];
  reboot: { pada: string }[];
  gap: { dari: string; sampai: string; detik: number }[];
  ketersediaan: number;
  timelineLayanan: { layanan: string; status: string; dari: string; sampai: string }[];
}

const T = dict({
  id: {
    title: "Pusat server",
    sub: "Orange Pi yang terdaftar, kesehatannya, dan kesiapannya untuk praktikum.",
    enroll: "Daftarkan Pi",
    online: "Daring",
    offline: "Luring",
    waiting: "Menunggu agen",
    lastReport: "Laporan terakhir",
    never: "belum pernah",
    servers: "server",
    empty: "Belum ada server terdaftar. Daftarkan satu Orange Pi untuk mulai memantaunya.",
    cpu24: "CPU 24 jam",
    temp24: "Suhu 24 jam",
    avail: "Ketersediaan",
    open: "Buka",
    back: "Semua server",
    code: "Kode",
    forbidden: "Halaman ini khusus asisten",
    forbiddenBody: "Masuk sebagai asisten untuk melihat server.",
    signIn: "Masuk",
    offlineBanner: "Koneksi ke server terputus. Mencoba lagi otomatis.",
    retry: "Coba sekarang",
    updated: (s: number) => (s < 5 ? "baru saja diperbarui" : `diperbarui ${s} detik lalu`),
    tabs: { ringkasan: "Ringkasan", siap: "Siap Praktikum", pengaturan: "Pengaturan" },
    tabsLabel: "Bagian server",
    cpu: "CPU",
    mem: "Memori",
    disk: "Disk",
    temp: "Suhu",
    uptime: "Nyala",
    actions: "Aksi cepat",
    syncClock: "Selaraskan jam",
    netDiag: "Diagnostik jaringan",
    clockOk: "Jam selaras",
    clockBad: "Jam belum selaras",
    range: "Rentang",
    ranges: { "1h": "1 jam", "24h": "24 jam", "7d": "7 hari" } as Record<string, string>,
    history: "Riwayat",
    reboots: "Reboot",
    noReboot: "Tidak ada reboot pada rentang ini.",
    gaps: "Jeda luring",
    noGap: "Tidak ada jeda luring.",
    gapLine: (a: string, b: string, m: number) => `${a} sampai ${b} (${m} menit)`,
    svcHistory: "Riwayat status layanan",
    noSvcHistory: "Belum ada riwayat status layanan.",
    services: "Layanan",
    stopTitle: (n: string) => `Hentikan ${n}?`,
    stopBody:
      "Layanan ini berhenti sampai dijalankan lagi. Praktikan yang memakainya akan terputus.",
    stop: "Hentikan",
    commands: "Perintah",
    allCommands: "Semua perintah",
    retryCmd: "Ulangi",
    cancelCmd: "Batalkan",
    cmdRetried: "Perintah diulang.",
    output: "Keluaran",
    save: "Simpan",
    saved: "Tersimpan.",
    moreCmds: "Muat Lebih Banyak",
    readyTitle: "Siap untuk praktikum?",
    readyRun: "Jalankan Cek",
    readyModul: "Modul yang dicek",
    readyAll: "Semua",
    readyMod: (n: string) => `Modul ${n}`,
    readyLast: "Cek terakhir",
    readyBy: (k: string) => `oleh ${k}`,
    readyNever: "Belum pernah dijalankan. Tekan Jalankan Cek sebelum praktikum dimulai.",
    readyWait: "Cek dikirim. Hasilnya muncul setelah denyut berikutnya dari Orange Pi.",
    readyPass: "Siap",
    readyFail: (n: number) => `${n} perlu dibereskan`,
    readyBad: "Keluarannya tidak terbaca sebagai hasil cek:",
    readyHist: "Riwayat Cek",
    readyHistNone: "Belum ada cek sebelumnya.",
    readyPassed: (n: number) => `${n} lulus`,
    readyNote: "Teks tiap cek datang langsung dari Orange Pi.",
    settings: "Identitas",
    name: "Nama",
    location: "Lokasi",
    locationPh: "Lab A, meja dekat jendela",
    notes: "Catatan",
    lan: "Alamat LAN",
    lanHint: "Dilaporkan agen pada tiap denyut.",
    agent: "Agen",
    agentVer: "Versi agen",
    sysInfo: "Info sistem",
    sysUpdated: (s: string) => `diperbarui ${s}`,
    diag: "Diagnostik",
    diagSub:
      "Hanya membaca, tidak mengubah layanan. Hasilnya muncul setelah denyut berikutnya dari Orange Pi.",
    run: "Jalankan",
    lastRun: (s: string) => `Diambil ${s}`,
    neverRun: "Belum pernah dijalankan.",
    danger: "Zona berbahaya",
    newToken: "Buat token pendaftaran baru",
    newTokenBody: "Pakai ini bila Orange Pi di-install ulang. Token lama langsung tidak berlaku.",
    del: "Hapus server",
    delTitle: "Hapus server ini?",
    delBody:
      "Riwayat denyut dan perintahnya ikut terhapus. Agen yang masih berjalan akan ditolak pada denyut berikutnya.",
    deleted: "Server dihapus.",
    wizTitle: "Daftarkan Orange Pi",
    wizSteps: ["Nama", "Perintah", "Menunggu"],
    wizNameHint: "Nama yang mudah dikenali, dan kode singkat huruf kecil.",
    wizCode: "Kode",
    wizCodeHint: "Huruf kecil, angka dan tanda hubung, 2 sampai 40 karakter.",
    wizCodeBad: "Kodenya belum sesuai format.",
    wizNameBad: "Isi nama dulu.",
    wizNext: "Buat perintah",
    wizCmd: "Salin perintah ini dan jalankan sekali di Orange Pi lewat SSH. Berlaku 30 menit.",
    wizCopy: "Salin",
    wizCopied: "Tersalin",
    wizDone: "Sudah dijalankan",
    wizWait: "Menunggu denyut pertama dari Orange Pi…",
    wizWaitHint: "Biasanya kurang dari satu menit setelah perintah dijalankan.",
    wizOk: "Orange Pi tersambung!",
    wizOkBody: (n: string) => `${n} mengirim denyut pertamanya.`,
    wizOpen: "Buka perangkat",
    wizClose: "Tutup",
    cancel: "Batal",
    fail: "Tidak dapat menghubungi server.",
    notFound: "Server tidak ditemukan.",
    codes: {
      format_salah: "Formatnya belum benar.",
      kode_dipakai: "Kode ini sudah dipakai server lain.",
      tidak_ditemukan: "Tidak ditemukan.",
      server_tidak_ada: "Server ini tidak ditemukan.",
      layanan_tidak_dikenal: "Layanan ini tidak dikenal.",
      tidak_bisa_diulang: "Hanya perintah yang gagal atau kedaluwarsa yang bisa diulang.",
      tidak_bisa_dibatalkan: "Perintah ini sudah diambil agen dan tidak bisa dibatalkan.",
      galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
    } as Record<string, string>,
    codeFallback: "Terjadi kesalahan.",
  },
  en: {
    title: "Server centre",
    sub: "The enrolled Orange Pis, their health, and whether they are ready for the practicum.",
    enroll: "Enroll a Pi",
    online: "Online",
    offline: "Offline",
    waiting: "Waiting for agent",
    lastReport: "Last report",
    never: "never",
    servers: "servers",
    empty: "No server enrolled yet. Enroll an Orange Pi to start monitoring it.",
    cpu24: "CPU 24 hours",
    temp24: "Temperature 24 hours",
    avail: "Availability",
    open: "Open",
    back: "All servers",
    code: "Code",
    forbidden: "This page is for assistants",
    forbiddenBody: "Sign in as an assistant to see the servers.",
    signIn: "Sign in",
    offlineBanner: "Lost connection to the server. Retrying automatically.",
    retry: "Retry now",
    updated: (s: number) => (s < 5 ? "just updated" : `updated ${s} seconds ago`),
    tabs: { ringkasan: "Overview", siap: "Ready Check", pengaturan: "Settings" },
    tabsLabel: "Server sections",
    cpu: "CPU",
    mem: "Memory",
    disk: "Disk",
    temp: "Temp",
    uptime: "Uptime",
    actions: "Quick actions",
    syncClock: "Sync clock",
    netDiag: "Network diagnostics",
    clockOk: "Clock in sync",
    clockBad: "Clock not synced",
    range: "Range",
    ranges: { "1h": "1 hour", "24h": "24 hours", "7d": "7 days" } as Record<string, string>,
    history: "History",
    reboots: "Reboots",
    noReboot: "No reboots in this range.",
    gaps: "Offline gaps",
    noGap: "No offline gaps.",
    gapLine: (a: string, b: string, m: number) => `${a} to ${b} (${m} minutes)`,
    svcHistory: "Service status history",
    noSvcHistory: "No service history yet.",
    services: "Services",
    stopTitle: (n: string) => `Stop ${n}?`,
    stopBody:
      "The service stays stopped until started again. Students using it will be disconnected.",
    stop: "Stop",
    commands: "Commands",
    allCommands: "All commands",
    retryCmd: "Retry",
    cancelCmd: "Cancel",
    cmdRetried: "Command retried.",
    output: "Output",
    save: "Save",
    saved: "Saved.",
    moreCmds: "Load More",
    readyTitle: "Ready for the practicum?",
    readyRun: "Run the Check",
    readyModul: "Module to check",
    readyAll: "All",
    readyMod: (n: string) => `Module ${n}`,
    readyLast: "Last check",
    readyBy: (k: string) => `by ${k}`,
    readyNever: "Never run yet. Press Run the Check before the practicum starts.",
    readyWait: "Check sent. The result arrives after the Orange Pi's next heartbeat.",
    readyPass: "Ready",
    readyFail: (n: number) => `${n} to fix`,
    readyBad: "The output could not be read as a check result:",
    readyHist: "Check History",
    readyHistNone: "No earlier checks yet.",
    readyPassed: (n: number) => `${n} passed`,
    readyNote: "Each check's text comes straight from the Orange Pi, in Indonesian.",
    settings: "Identity",
    name: "Name",
    location: "Location",
    locationPh: "Lab A, desk by the window",
    notes: "Notes",
    lan: "LAN address",
    lanHint: "Reported by the agent on every heartbeat.",
    agent: "Agent",
    agentVer: "Agent version",
    sysInfo: "System info",
    sysUpdated: (s: string) => `updated ${s}`,
    diag: "Diagnostics",
    diagSub:
      "Read only, never changes a service. Results arrive after the Orange Pi's next heartbeat.",
    run: "Run",
    lastRun: (s: string) => `Taken ${s}`,
    neverRun: "Never run yet.",
    danger: "Danger zone",
    newToken: "New enrollment token",
    newTokenBody: "Use this after reinstalling the Orange Pi. The old token stops working at once.",
    del: "Delete server",
    delTitle: "Delete this server?",
    delBody:
      "Its heartbeat history and commands are deleted too. A still-running agent is refused on its next heartbeat.",
    deleted: "Server deleted.",
    wizTitle: "Enroll an Orange Pi",
    wizSteps: ["Name", "Command", "Waiting"],
    wizNameHint: "A recognisable name, and a short lowercase code.",
    wizCode: "Code",
    wizCodeHint: "Lowercase letters, digits and hyphens, 2 to 40 characters.",
    wizCodeBad: "The code does not match the format yet.",
    wizNameBad: "Enter a name first.",
    wizNext: "Create the command",
    wizCmd:
      "Copy this command and run it once on the Orange Pi over SSH. It is valid for 30 minutes.",
    wizCopy: "Copy",
    wizCopied: "Copied",
    wizDone: "I ran it",
    wizWait: "Waiting for the Orange Pi's first heartbeat…",
    wizWaitHint: "Usually under a minute after running the command.",
    wizOk: "Orange Pi connected!",
    wizOkBody: (n: string) => `${n} sent its first heartbeat.`,
    wizOpen: "Open the device",
    wizClose: "Close",
    cancel: "Cancel",
    fail: "Could not reach the server.",
    notFound: "Server not found.",
    codes: {
      format_salah: "That format is not right.",
      kode_dipakai: "Another server already uses this code.",
      tidak_ditemukan: "Not found.",
      server_tidak_ada: "This server was not found.",
      layanan_tidak_dikenal: "Unknown service.",
      tidak_bisa_diulang: "Only failed or expired commands can be retried.",
      tidak_bisa_dibatalkan: "The agent already took this command; it cannot be cancelled.",
      galat_server: "The server is having trouble. Try again in a moment.",
    } as Record<string, string>,
    codeFallback: "Something went wrong.",
  },
});

type Strings = (typeof T)["id"];
const msg = (t: Strings, kode?: string) => t.codes[kode ?? ""] ?? t.codeFallback;

const WARN_CPU = 85;
const WARN_TEMP = 70;

function isOnline(d: Heartbeat | null, batas: number): boolean {
  return !!d && Date.now() - new Date(d.pada).getTime() < batas * 1000;
}

function fmtUptime(sec: number | null | undefined, lang: Lang): string {
  if (!sec) return "·";
  return durasiLabel(Math.floor(sec / 60), lang);
}

function fmtWhen(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(localeOf(lang), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/* ================================================================= root */

export default function ServerCenter({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(location.search).get("id");
      setId(p ? Number(p) : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  function open(next: number | null) {
    history.pushState(null, "", next ? `?id=${next}` : location.pathname);
    setId(next);
    window.scrollTo({ top: 0 });
  }

  if (me === undefined) {
    return (
      <div className="stack stack--lg" aria-busy="true">
        <span className="skeleton" style={{ height: 90 }} />
        <span className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }
  if (me?.role !== "asisten") {
    return (
      <StateView
        icon={<ShieldWarningIcon size={28} />}
        title={t.forbidden}
        body={t.forbiddenBody}
        tone="warn"
        actions={
          me === null ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.LoginDialog?.open()}
            >
              {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }

  return id ? (
    <DetailView t={t} lang={lang} id={id} onBack={() => open(null)} />
  ) : (
    <ListView t={t} lang={lang} onOpen={open} />
  );
}

/* ================================================================= list */

function Sparkline({ vals, unit, hue }: { vals: number[]; unit: string; hue: string }) {
  if (vals.length < 2) return <span className="faint">·</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map(
    (v, i) => `${(i / (vals.length - 1)) * 100},${30 - ((v - min) / range) * 26 - 2}`,
  );
  const id = `sp-${hue.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <span className="spark" style={{ "--spark": hue } as CSSProperties}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="0.35" />
            <stop offset="100%" stopColor={hue} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill={`url(#${id})`} />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={hue}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="spark__now num">
        {vals.at(-1)}
        {unit}
      </span>
    </span>
  );
}

function ListView({ t, lang, onOpen }: { t: Strings; lang: Lang; onOpen: (id: number) => void }) {
  const [wizard, setWizard] = useState(false);
  const now = useTick(1_000);
  const poll = usePoll(async () => {
    const d = await getJson<{ ok: boolean; server: ServerRow[] }>("/api/server");
    const list = d.ok ? d.server : [];
    const hist: Record<number, Riwayat> = {};
    await Promise.all(
      list
        .filter((s) => s.terdaftar)
        .map(async (s) => {
          const r = await getJson<{ ok: boolean } & Riwayat>(
            `/api/server/${s.id}?aksi=riwayat&rentang=24h`,
          ).catch(() => null);
          if (r?.ok) hist[s.id] = r;
        }),
    );
    return { list, hist };
  }, 15_000);
  const list = poll.data?.list ?? [];
  const hist = poll.data?.hist ?? {};
  const online = list.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const last = list
    .map((s) => s.denyutTerakhir?.pada)
    .filter((p): p is string => !!p)
    .sort()
    .at(-1);

  return (
    <div className="srv">
      <OfflineBanner
        errors={poll.errors}
        text={t.offlineBanner}
        retry={poll.refresh}
        retryLabel={t.retry}
      />
      <header className="srv__head rise">
        <div className="stack stack--sm">
          <span className="label-caps">IRIS · Orange Pi</span>
          <h1 className="srv__title">{t.title}</h1>
          <p className="hint srv__sub">{t.sub}</p>
        </div>
        <button type="button" className="btn btn--primary btn--lg" onClick={() => setWizard(true)}>
          {t.enroll}
        </button>
      </header>

      {poll.data === null ? (
        <div className="srv__tiles">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" style={{ height: 96 }} />
          ))}
        </div>
      ) : (
        <div className="srv__tiles rise">
          <div className="stat stat--ok">
            <span className="stat__value">{online}</span>
            <span className="stat__label">
              <span className="dot dot--ok" /> {t.online}
            </span>
          </div>
          <div className="stat stat--bad">
            <span className="stat__value">{list.length - online}</span>
            <span className="stat__label">
              <span className="dot dot--danger" /> {t.offline}
            </span>
          </div>
          <div className="stat">
            <span className="stat__value stat__value--sm">
              {last ? sejak(last, lang, now) : t.never}
            </span>
            <span className="stat__label">{t.lastReport}</span>
          </div>
        </div>
      )}

      {poll.data && list.length === 0 ? (
        <div className="empty-note">
          <p>{t.empty}</p>
          <button type="button" className="btn btn--primary" onClick={() => setWizard(true)}>
            {t.enroll}
          </button>
        </div>
      ) : (
        <div className="srv__grid">
          {list.map((s) => {
            const on = isOnline(s.denyutTerakhir, s.batasLuringDetik);
            const h = hist[s.id];
            const d = s.denyutTerakhir;
            const warn = on && ((d?.cpu ?? 0) >= WARN_CPU || (d?.suhu ?? 0) >= WARN_TEMP);
            return (
              <HoverCard
                key={s.id}
                side="bottom"
                card={
                  <div className="stack stack--sm">
                    <b>{s.nama}</b>
                    <span className="hint mono">
                      {s.kode} · {s.alamatLan ?? "·"}
                    </span>
                    {d && (
                      <span className="hint">
                        {t.uptime} {fmtUptime(d.uptimeSec, lang)} ·{" "}
                        {d.jamSelaras ? t.clockOk : t.clockBad}
                      </span>
                    )}
                    {s.lokasi && <span className="hint">{s.lokasi}</span>}
                  </div>
                }
              >
                <button
                  type="button"
                  className="srvcard sweep-hover rise"
                  data-state={!s.terdaftar ? "wait" : on ? (warn ? "warn" : "ok") : "bad"}
                  onClick={() => onOpen(s.id)}
                >
                  <span className="srvcard__head">
                    <span className="grow stack" style={{ gap: 0 }}>
                      <b className="truncate">{s.nama}</b>
                      <span className="mono hint">{s.kode}</span>
                    </span>
                    <span
                      className={`pill ${!s.terdaftar ? "" : on ? "pill--ok" : "pill--danger"}`}
                    >
                      {!s.terdaftar ? t.waiting : on ? t.online : t.offline}
                    </span>
                  </span>
                  <span className="srvcard__metrics">
                    <span className="stack stack--sm">
                      <span className="label-caps">{t.cpu24}</span>
                      <Sparkline
                        vals={(h?.seri ?? [])
                          .map((x) => x.cpu)
                          .filter((v): v is number => v != null)}
                        unit="%"
                        hue="var(--chart-1)"
                      />
                    </span>
                    <span className="stack stack--sm">
                      <span className="label-caps">{t.temp24}</span>
                      <Sparkline
                        vals={(h?.seri ?? [])
                          .map((x) => x.suhu)
                          .filter((v): v is number => v != null)}
                        unit="°C"
                        hue="var(--chart-3)"
                      />
                    </span>
                  </span>
                  <span className="srvcard__foot">
                    <span>
                      {t.avail} <b className="num">{h ? `${h.ketersediaan}%` : "·"}</b>
                    </span>
                    <span className="hint">{d ? sejak(d.pada, lang, now) : t.never}</span>
                  </span>
                  {d?.layanan && (
                    <span className="srvcard__svc">
                      {urutkanLayanan(d.layanan).map(([k, st]) => (
                        <span
                          key={k}
                          className={`pill ${SVC_PILL[svcTone(st)]}`}
                          title={OPS_T[lang].svcState[st] ?? st}
                        >
                          {OPS_T[lang].svc[k] ?? k}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </HoverCard>
            );
          })}
          <button
            type="button"
            className="srvcard srvcard--add sweep-hover"
            onClick={() => setWizard(true)}
          >
            <b>{t.enroll}</b>
          </button>
        </div>
      )}

      {wizard && (
        <EnrollWizard
          t={t}
          lang={lang}
          onClose={() => {
            setWizard(false);
            poll.refresh();
          }}
          onOpen={(sid) => {
            setWizard(false);
            onOpen(sid);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ enrolment */

const KODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function EnrollWizard({
  t,
  lang,
  onClose,
  onOpen,
}: {
  t: Strings;
  lang: Lang;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [nama, setNama] = useState("");
  const [kode, setKode] = useState("");
  const [err, setErr] = useState<{ f: "nama" | "kode"; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tok, setTok] = useState<{ kode: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState<ServerRow | null>(null);

  const cmd = tok
    ? [
        "sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json \\",
        `  python3 /opt/iris-agent/agent.py enroll --kode ${tok.kode} --token ${tok.token} \\`,
        `  --server https://${location.host} --repo-root /home/orangepi/IRIS-ASO`,
        "sudo systemctl restart iris-agent.service",
      ].join("\n")
    : "";

  // Step 3: poll for the first heartbeat.
  useEffect(() => {
    if (step !== 2 || !tok) return;
    const id = setInterval(async () => {
      const d = await getJson<{ ok: boolean; server: ServerRow[] }>("/api/server").catch(
        () => null,
      );
      const s = d?.server.find((x) => x.kode === tok.kode);
      if (s && s.terdaftar && s.denyutTerakhir) setJoined(s);
    }, 4000);
    return () => clearInterval(id);
  }, [step, tok]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!nama.trim()) return setErr({ f: "nama", m: t.wizNameBad });
    if (!KODE_RE.test(kode)) return setErr({ f: "kode", m: t.wizCodeBad });
    setErr(null);
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; kode?: string; token?: string }>("/api/server", {
        nama: nama.trim(),
        kode,
      });
      if (!d.ok) {
        setErr({ f: d.kode === "kode_dipakai" ? "kode" : "nama", m: msg(t, d.kode) });
        return;
      }
      setTok({ kode: d.kode ?? kode, token: d.token ?? "" });
      setStep(1);
    } catch {
      setErr({ f: "nama", m: t.fail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.wizTitle} size="lg" lang={lang}>
      <ol className="wiz__steps" aria-label={t.wizTitle}>
        {t.wizSteps.map((s, i) => (
          <li key={s} data-state={i < step || joined ? "done" : i === step ? "now" : undefined}>
            <span className="wiz__dot">
              {i < step || (joined && i === 2) ? <CheckCircleIcon size={16} /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form className="stack stack--lg" onSubmit={create} noValidate>
          <p className="hint">{t.wizNameHint}</p>
          <div className="field" data-invalid={err?.f === "nama" ? "yes" : undefined}>
            <label className="field__label" htmlFor="wiz-nama">
              {t.name}
            </label>
            <input
              id="wiz-nama"
              className="field__input"
              value={nama}
              autoFocus
              onChange={(e) => setNama(e.target.value)}
              placeholder="Orange Pi Lab A"
            />
            {err?.f === "nama" && <p className="field__error">{err.m}</p>}
          </div>
          <div className="field" data-invalid={err?.f === "kode" ? "yes" : undefined}>
            <label className="field__label" htmlFor="wiz-kode">
              {t.wizCode}
            </label>
            <input
              id="wiz-kode"
              className="field__input mono"
              value={kode}
              onChange={(e) => setKode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="opi-lab-a"
            />
            <p className={err?.f === "kode" ? "field__error" : "field__hint"}>
              {err?.f === "kode" ? err.m : t.wizCodeHint}
            </p>
          </div>
          <div className="row row--end">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.cancel}
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy}
              data-loading={busy ? "yes" : undefined}
            >
              <span className="btn__label">{t.wizNext}</span>
              <span className="btn__spinner" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {step === 1 && tok && (
        <div className="stack stack--lg">
          <p className="hint">{t.wizCmd}</p>
          <div className="wiz__cmd">
            <pre className="mono">{cmd}</pre>
            <button
              type="button"
              className="btn btn--secondary btn--sm wiz__copy"
              onClick={() =>
                void navigator.clipboard?.writeText(cmd).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? <CheckCircleIcon size={16} /> : <CopyIcon size={16} />}{" "}
              {copied ? t.wizCopied : t.wizCopy}
            </button>
          </div>
          <div className="row row--end">
            <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>
              {t.wizDone}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wiz__wait" aria-live="polite">
          {joined ? (
            <>
              <span className="wiz__ok" aria-hidden="true">
                <CheckCircleIcon size={44} />
              </span>
              <b className="wiz__big">{t.wizOk}</b>
              <p className="hint">{t.wizOkBody(joined.nama)}</p>
              <div className="row">
                <button type="button" className="btn btn--ghost" onClick={onClose}>
                  {t.wizClose}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => onOpen(joined.id)}
                >
                  {t.wizOpen}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="wiz__radar" aria-hidden="true">
                <i />
                <i />
                <HardDrivesIcon size={28} />
              </span>
              <b>{t.wizWait}</b>
              <p className="hint">{t.wizWaitHint}</p>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t.wizClose}
              </button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* =============================================================== detail */

type Tab = "ringkasan" | "siap" | "pengaturan";

function DetailView({
  t,
  lang,
  id,
  onBack,
}: {
  t: Strings;
  lang: Lang;
  id: number;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
    return h === "siap" || h === "pengaturan" ? h : "ringkasan";
  });
  useEffect(() => {
    const on = () => {
      const h = location.hash.slice(1);
      setTab(h === "siap" || h === "pengaturan" ? h : "ringkasan");
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const poll = usePoll(async () => {
    const d = await getJson<{ ok: boolean } & Detail>(`/api/server/${id}`);
    if (!d.ok) throw new Error("gone");
    return d as Detail;
  }, 6_000);
  const data = poll.data;
  const dir = useDirektori();
  const siapa = (n: string | null) => (n ? dir.nama(n) : "");

  useEffect(() => {
    if (poll.errors >= 3 && !data) {
      window.Toast?.show(t.notFound, "danger");
      onBack();
    }
  }, [poll.errors, data, onBack, t.notFound]);

  function go(next: Tab) {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  }

  if (!data) {
    return (
      <div className="stack stack--lg" aria-busy="true">
        <span className="skeleton" style={{ height: 120 }} />
        <span className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }
  const hb = data.denyutTerakhir;
  const on = isOnline(hb, data.batasLuringDetik);

  return (
    <div className="srv">
      <OfflineBanner
        errors={poll.errors}
        text={t.offlineBanner}
        retry={poll.refresh}
        retryLabel={t.retry}
      />
      <a
        className="srv__back"
        href={href(lang, "/servers")}
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        {t.back}
      </a>
      <header
        className="srv__dhead sweep-edge"
        data-state={!data.server.terdaftar ? "wait" : on ? "ok" : "bad"}
      >
        <div className="grow stack" style={{ gap: 2 }}>
          <h1 className="srv__title srv__title--sm">{data.server.nama}</h1>
          <span className="hint">
            <span className="mono">{data.server.kode}</span>
            {data.server.alamatLan && <span className="mono"> · {data.server.alamatLan}</span>}
            {data.server.lokasi && ` · ${data.server.lokasi}`}
          </span>
        </div>
        <span className={`pill ${!data.server.terdaftar ? "" : on ? "pill--ok" : "pill--danger"}`}>
          <span className={`dot ${on ? "dot--ok dot--pulse" : "dot--danger"}`} />{" "}
          {!data.server.terdaftar ? t.waiting : on ? t.online : t.offline}
        </span>
        <UpdatedAgo since={poll.updatedAt} template={t.updated} />
      </header>

      <div className="seg seg--views srv__tabs" role="tablist" aria-label={t.tabsLabel}>
        {(["ringkasan", "siap", "pengaturan"] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-pressed={tab === k}
            onClick={() => go(k)}
          >
            {t.tabs[k]}
          </button>
        ))}
      </div>

      {tab === "ringkasan" && (
        <Overview t={t} lang={lang} id={id} data={data} refresh={poll.refresh} kode={siapa} />
      )}
      {tab === "siap" && (
        <Ready t={t} lang={lang} id={id} data={data} refresh={poll.refresh} kode={siapa} />
      )}
      {tab === "pengaturan" && (
        <Settings t={t} lang={lang} id={id} data={data} refresh={poll.refresh} onDeleted={onBack} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- overview */

function Overview({
  t,
  lang,
  id,
  data,
  refresh,
  kode,
}: {
  t: Strings;
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  kode: (nim: string | null) => string;
}) {
  const hb = data.denyutTerakhir;
  const [rentang, setRentang] = useState("24h");
  const [hist, setHist] = useState<Riwayat | null>(null);
  const [stop, setStop] = useState<string | null>(null);
  const [allCmds, setAllCmds] = useState(false);
  const [older, setOlder] = useState<Perintah[]>([]);
  const [lagi, setLagi] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  // The poll brings the newest 20; "Muat lebih banyak" appends older pages.
  const cmds = useMemo(() => {
    const seen = new Set(data.perintah.map((p) => p.id));
    return [...data.perintah, ...older.filter((p) => !seen.has(p.id))];
  }, [data.perintah, older]);
  const canMore = lagi && data.perintah.length >= 20;

  async function more() {
    if (!cmds.length) return;
    setMoreBusy(true);
    try {
      const sebelum = Math.min(...cmds.map((p) => p.id));
      const r = await getJson<{ ok: boolean; perintah: Perintah[]; lagi: boolean }>(
        `/api/server/${id}?aksi=perintah&sebelum=${sebelum}`,
      );
      if (r.ok) {
        setOlder((o) => [...o, ...r.perintah]);
        setLagi(r.lagi);
      }
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setMoreBusy(false);
    }
  }
  const [histOpen, setHistOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const themeKey = useThemeKey();
  const plot = useRef<{
    destroy: () => void;
    setSize: (s: { width: number; height: number }) => void;
  } | null>(null);

  useEffect(() => {
    setHist(null);
    getJson<{ ok: boolean } & Riwayat>(`/api/server/${id}?aksi=riwayat&rentang=${rentang}`)
      .then((d) => d.ok && setHist(d))
      .catch(() => {});
  }, [id, rentang]);

  useEffect(() => {
    let dead = false;
    if (!hist || !chartRef.current) return;
    void import("uplot").then(({ default: uPlot }) => {
      if (dead || !chartRef.current) return;
      plot.current?.destroy();
      const el = chartRef.current;
      const xs = hist.seri.map((d) => new Date(d.pada).getTime() / 1000);
      const warna = chartColors();
      const axis = {
        stroke: warna.axis,
        grid: { stroke: warna.grid },
        ticks: { stroke: warna.tick },
      };
      const loc = localeOf(lang);
      const xAxis = {
        ...axis,
        values: (_u: unknown, vals: number[]) =>
          vals.map((v) =>
            new Date(v * 1000).toLocaleString(loc, {
              timeZone: "Asia/Jakarta",
              ...(rentang === "7d"
                ? { day: "2-digit", month: "short" }
                : { hour: "2-digit", minute: "2-digit" }),
            }),
          ),
      };
      plot.current = new uPlot(
        {
          width: el.clientWidth || 600,
          height: 240,
          scales: { x: { time: true } },
          series: [
            {},
            { label: `${t.cpu} %`, stroke: warna.series[0], width: 1.8 },
            { label: `${t.mem} %`, stroke: warna.series[1], width: 1.8 },
            { label: `${t.temp} °C`, stroke: warna.series[2], width: 1.8 },
          ],
          axes: [xAxis, axis],
          legend: { show: false },
        },
        [
          xs,
          hist.seri.map((d) => d.cpu ?? null),
          hist.seri.map((d) => d.memori ?? null),
          hist.seri.map((d) => d.suhu ?? null),
        ],
        el,
      );
    });
    return () => {
      dead = true;
    };
  }, [hist, t.cpu, t.mem, t.temp, lang, rentang, themeKey]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      plot.current?.setSize({ width: el.clientWidth, height: 240 }),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
    };
  }, []);

  const tiles: { label: string; value: string; warn?: boolean }[] = [
    {
      label: t.cpu,
      value: hb?.cpu != null ? `${Math.round(hb.cpu)}%` : "·",
      warn: (hb?.cpu ?? 0) >= WARN_CPU,
    },
    {
      label: t.mem,
      value: hb?.memori != null ? `${Math.round(hb.memori)}%` : "·",
    },
    { label: t.disk, value: hb?.disk != null ? `${Math.round(hb.disk)}%` : "·" },
    {
      label: t.temp,
      value: hb?.suhu != null ? `${Math.round(hb.suhu)}°C` : "·",
      warn: (hb?.suhu ?? 0) >= WARN_TEMP,
    },
    { label: t.uptime, value: fmtUptime(hb?.uptimeSec, lang) },
    {
      label: `${t.avail} (${t.ranges[rentang]})`,
      value: hist ? `${hist.ketersediaan}%` : "·",
    },
  ];

  async function retry(p: Perintah, tipe: "perintah_ulang" | "perintah_batal") {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", { tipe, id: p.id });
      if (!r.ok) window.Toast?.show(msg(t, r.kode), "danger");
      else if (tipe === "perintah_ulang") window.Toast?.show(t.cmdRetried, "ok");
      refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <div className="ovw">
      <div className="ovw__tiles">
        {tiles.map((x) => (
          <div key={x.label} className="stat ovw__tile" data-warn={x.warn ? "yes" : undefined}>
            <span className="stat__label">{x.label}</span>
            <span className="stat__value stat__value--sm num">{x.value}</span>
          </div>
        ))}
      </div>

      <section className="panel ovw__actions">
        <h2 className="panel__title">{t.actions}</h2>
        <div className="ovw__action-row">
          <HotspotCard lang={lang} serverId={id} hb={hb} onSent={refresh} />
          <button
            type="button"
            className="ovw__action sweep-hover"
            onClick={() => void sendCommand(id, "jam.selaraskan", {}, lang).then(refresh)}
          >
            <span className="stack" style={{ gap: 0 }}>
              <b>{t.syncClock}</b>
              <span className={`hint ${hb?.jamSelaras ? "" : "ovw__bad"}`}>
                {hb?.jamSelaras ? t.clockOk : t.clockBad}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="ovw__action sweep-hover"
            onClick={() => void sendCommand(id, "diag.jaringan", {}, lang).then(refresh)}
          >
            <span className="stack" style={{ gap: 0 }}>
              <b>{t.netDiag}</b>
              <span className="hint">iw, AP, route</span>
            </span>
          </button>
        </div>
      </section>

      <div className="ovw__cols">
        <div className="stack stack--lg">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">
                {t.cpu} · {t.mem} · {t.temp}
              </h2>
              <div className="seg" role="group" aria-label={t.range}>
                {["1h", "24h", "7d"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={rentang === r}
                    onClick={() => setRentang(r)}
                  >
                    {t.ranges[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-legend">
              {[
                [`${t.cpu} %`, "var(--chart-1)"],
                [`${t.mem} %`, "var(--chart-2)"],
                [`${t.temp} °C`, "var(--chart-3)"],
              ].map(([l, c]) => (
                <span key={l} className="chart-legend__item">
                  <span className="chart-legend__swatch" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
            <div className="ovw__chart" ref={chartRef}>
              {!hist && <span className="skeleton" style={{ height: 240, display: "block" }} />}
            </div>
          </section>

          <section className="panel ovw__history" data-open={histOpen ? "yes" : undefined}>
            <button
              type="button"
              className="ovw__histbtn panel__title"
              aria-expanded={histOpen}
              onClick={() => setHistOpen((x) => !x)}
            >
              {t.history}
              <CaretDownIcon size={18} className="ovw__chev" aria-hidden="true" />
            </button>
            {histOpen && (
              <>
                <div className="grid-2">
                  <div className="stack stack--sm">
                    <span className="label-caps">{t.reboots}</span>
                    {!hist?.reboot.length ? (
                      <span className="hint">{t.noReboot}</span>
                    ) : (
                      <ul className="ovw__list">
                        {hist.reboot.slice(0, 12).map((r, i) => (
                          <li key={i}>{fmtWhen(r.pada, lang)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="stack stack--sm">
                    <span className="label-caps">{t.gaps}</span>
                    {!hist?.gap.length ? (
                      <span className="hint">{t.noGap}</span>
                    ) : (
                      <ul className="ovw__list">
                        {hist.gap.map((g, i) => (
                          <li key={i}>
                            {t.gapLine(
                              fmtWhen(g.dari, lang),
                              jamMenit(g.sampai, lang),
                              Math.round(g.detik / 60),
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="stack stack--sm">
                  <span className="label-caps">{t.svcHistory}</span>
                  {!hist?.timelineLayanan.length ? (
                    <span className="hint">{t.noSvcHistory}</span>
                  ) : (
                    <ul className="ovw__list">
                      {hist.timelineLayanan.map((x, i) => (
                        <li key={i}>
                          <span className={`dot ${SVC_DOT[svcTone(x.status)]}`} />
                          {OPS_T[lang].svc[x.layanan] ?? x.layanan}:{" "}
                          {OPS_T[lang].svcState[x.status] ?? x.status} · {fmtWhen(x.dari, lang)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="stack stack--lg">
          <section className="panel">
            <h2 className="panel__title">{t.services}</h2>
            <ServiceList
              lang={lang}
              serverId={id}
              hb={hb}
              perintah={data.perintah}
              onSent={refresh}
              onStop={setStop}
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">
                <CircleNotchIcon size={18} aria-hidden="true" /> {t.commands}
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                aria-expanded={allCmds}
                onClick={() => setAllCmds((x) => !x)}
              >
                {t.allCommands} <CaretDownIcon size={16} aria-hidden="true" />
              </button>
            </div>
            <CommandTimeline
              lang={lang}
              perintah={allCmds ? cmds : data.perintah}
              limit={allCmds ? cmds.length : 5}
              kode={kode}
            />
            {allCmds && canMore && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={moreBusy}
                onClick={() => void more()}
              >
                {moreBusy && <CircleNotchIcon size={15} className="ctl-spin" aria-hidden="true" />}
                {t.moreCmds}
              </button>
            )}
            {allCmds && (
              <ul className="ovw__cmdx">
                {cmds
                  .filter((p) => ["gagal", "kedaluwarsa", "menunggu"].includes(p.status))
                  .map((p) => (
                    <li key={p.id}>
                      <span className="grow truncate">
                        #{p.id} {OPS_T[lang].aksi[p.aksi] ?? p.aksi}
                      </span>
                      {p.status === "menunggu" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void retry(p, "perintah_batal")}
                        >
                          {t.cancelCmd}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => void retry(p, "perintah_ulang")}
                        >
                          {t.retryCmd}
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Confirm
        open={!!stop}
        onOpenChange={(o) => !o && setStop(null)}
        title={t.stopTitle(OPS_T[lang].svc[stop ?? ""] ?? stop ?? "")}
        body={t.stopBody}
        confirmLabel={t.stop}
        lang={lang}
        onConfirm={async () => {
          if (stop) await sendCommand(id, "layanan.henti", { layanan: stop }, lang);
          refresh();
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- ready */

const MODUL_PILIHAN = ["", "2", "3", "4"] as const;

/**
 * The Ready check (Phase 9, replaces Devices). One button queues
 * diag.siap, which runs the Pi's own preflight (opi_preflight.sh --json)
 * and comes back on the next heartbeat. The module defaults to the running
 * session's, then to whatever the last run checked.
 */
function Ready({
  t,
  lang,
  id,
  data,
  refresh,
  kode,
}: {
  t: Strings;
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  kode: (nim: string | null) => string;
}) {
  const now = useTick(1_000);
  const runs = data.perintah.filter((p) => p.aksi === "diag.siap");
  const pending = runs.some((p) => p.status === "menunggu" || p.status === "terkirim");
  const done = runs.filter((p) => p.status === "selesai" || p.status === "gagal");
  const last = done[0] ?? null;
  const hasil = bacaHasilSiap(last?.keluaran);
  const [modul, setModul] = useState<string>(() => {
    const m = data.sesiModul;
    if (m !== null && m >= 2 && m <= 4) return String(m);
    return last?.argumen?.modul ?? "";
  });

  function run() {
    void sendCommand(id, "diag.siap", modul ? { modul } : {}, lang, true).then((ok) => {
      window.Toast?.show(ok ? t.readyWait : OPS_T[lang].fail, ok ? "ok" : "danger");
      refresh();
    });
  }

  return (
    <div className="grid-2 ready">
      <section className="panel">
        <div className="panel__head ready__head">
          <div className="stack stack--sm">
            <h2 className="panel__title">{t.readyTitle}</h2>
            <span className="hint">
              {last ? (
                <>
                  {t.readyLast} {sejak(last.selesaiPada ?? last.dimintaPada, lang, now)}
                  {last.dimintaOleh ? ` ${t.readyBy(kode(last.dimintaOleh))}` : ""}
                </>
              ) : (
                t.readyNever
              )}
            </span>
          </div>
          <button type="button" className="btn btn--primary" disabled={pending} onClick={run}>
            {pending ? (
              <CircleNotchIcon size={17} className="ctl-spin" aria-hidden="true" />
            ) : (
              <ListChecksIcon size={17} aria-hidden="true" />
            )}
            {t.readyRun}
          </button>
        </div>

        <div className="stack stack--sm">
          <span className="label-caps">{t.readyModul}</span>
          <div className="seg" role="group" aria-label={t.readyModul}>
            {MODUL_PILIHAN.map((m) => (
              <button
                key={m || "semua"}
                type="button"
                aria-pressed={modul === m}
                onClick={() => setModul(m)}
              >
                {m ? t.readyMod(m) : t.readyAll}
              </button>
            ))}
          </div>
        </div>

        {pending && <p className="hint">{t.readyWait}</p>}

        {hasil && (
          <>
            <div className="row">
              <span className={`pill ${hasil.lulus ? "pill--ok" : "pill--danger"}`}>
                {hasil.lulus ? t.readyPass : t.readyFail(hasil.gagal)}
              </span>
              {hasil.modul && <span className="hint">{t.readyMod(hasil.modul)}</span>}
            </div>
            <ul className="ready__list">
              {hasil.cek.map((c, i) => {
                const Icon =
                  c.status === "ok"
                    ? CheckCircleIcon
                    : c.status === "info"
                      ? InfoIcon
                      : WarningIcon;
                return (
                  <li key={i} className="ready__item" data-st={c.status}>
                    <Icon size={20} className="ready__icon" aria-hidden="true" />
                    <span className="grow stack" style={{ gap: 2 }}>
                      <b>{c.judul}</b>
                      {c.status !== "ok" && c.perbaikan && (
                        <span className="hint">{c.perbaikan}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="hint">{t.readyNote}</p>
          </>
        )}
        {last && !hasil && (
          <div className="stack stack--sm">
            <span className="hint">{t.readyBad}</span>
            <pre className="ops-log">{last.keluaran ?? "·"}</pre>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">{t.readyHist}</h2>
        {done.length <= 1 ? (
          <p className="hint">{t.readyHistNone}</p>
        ) : (
          <ul className="ready__hist">
            {done.slice(1, 9).map((p) => {
              const h = bacaHasilSiap(p.keluaran);
              const lulus = h ? h.cek.filter((c) => c.status === "ok").length : 0;
              return (
                <li key={p.id}>
                  <span className="grow stack" style={{ gap: 0 }}>
                    <b>{fmtWhen(p.selesaiPada ?? p.dimintaPada, lang)}</b>
                    <span className="hint">
                      {p.argumen?.modul ? t.readyMod(p.argumen.modul) : t.readyAll}
                      {p.dimintaOleh ? ` · ${t.readyBy(kode(p.dimintaOleh))}` : ""}
                    </span>
                  </span>
                  {h ? (
                    <>
                      <span className="pill pill--ok">{t.readyPassed(lulus)}</span>
                      {h.gagal > 0 && (
                        <span className="pill pill--danger">{t.readyFail(h.gagal)}</span>
                      )}
                    </>
                  ) : (
                    <span className="pill pill--danger">{OPS_T[lang].status.gagal}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- settings */

const DIAGS = ["diag.ringkas", "diag.jaringan", "diag.dmesg"] as const;

function Settings({
  t,
  lang,
  id,
  data,
  refresh,
  onDeleted,
}: {
  t: Strings;
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  onDeleted: () => void;
}) {
  const s = data.server;
  const now = useTick(1_000);
  const saved = { nama: s.nama, lokasi: s.lokasi ?? "", catatan: s.catatan ?? "" };
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmTok, setConfirmTok] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    // Only what changed, so a field nobody touched is never sent and never
    // overwritten (the API clears a field it receives blank).
    const patch = Object.fromEntries(
      Object.entries(form).filter(([k, v]) => v !== saved[k as keyof typeof saved]),
    );
    if (Object.keys(patch).length === 0) {
      window.Toast?.show(t.saved, "ok");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/server/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((x) => x.json() as Promise<{ ok: boolean; kode?: string }>);
      window.Toast?.show(r.ok ? t.saved : msg(t, r.kode), r.ok ? "ok" : "danger");
      refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const last = (aksi: string) =>
    data.perintah.find((p) => p.aksi === aksi && (p.status === "selesai" || p.status === "gagal"));
  const running = (aksi: string) =>
    data.perintah.some(
      (p) => p.aksi === aksi && (p.status === "menunggu" || p.status === "terkirim"),
    );

  return (
    <div className="grid-2 settings">
      <form className="panel" onSubmit={save} noValidate>
        <h2 className="panel__title">{t.settings}</h2>
        <div className="field">
          <label className="field__label" htmlFor="srv-nama">
            {t.name}
          </label>
          <input
            id="srv-nama"
            className="field__input"
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="srv-lok">
            {t.location}
          </label>
          <input
            id="srv-lok"
            className="field__input"
            value={form.lokasi}
            placeholder={t.locationPh}
            onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
          />
        </div>
        <div className="field">
          <span className="field__label">{t.lan}</span>
          <span className="mono">{s.alamatLan ?? "·"}</span>
          <span className="hint">{t.lanHint}</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="srv-cat">
            {t.notes}
          </label>
          <textarea
            id="srv-cat"
            className="field__input console-textarea"
            rows={3}
            value={form.catatan}
            onChange={(e) => setForm({ ...form, catatan: e.target.value })}
          />
        </div>
        <div className="panel__foot">
          <button type="submit" className="btn btn--primary" disabled={busy || !form.nama.trim()}>
            {t.save}
          </button>
        </div>
      </form>

      <div className="stack stack--lg">
        <section className="panel">
          <h2 className="panel__title">{t.agent}</h2>
          <dl className="kv">
            <dt>{t.agentVer}</dt>
            <dd className="mono">{s.agenVersi ?? "·"}</dd>
            <dt>{t.sysInfo}</dt>
            <dd>{s.infoSistemPada ? t.sysUpdated(sejak(s.infoSistemPada, lang, now)) : "·"}</dd>
            {s.infoSistem &&
              Object.entries(s.infoSistem).map(([k, v]) => (
                <div key={k} className="kv__row">
                  <dt className="mono">{k}</dt>
                  <dd className="mono">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                </div>
              ))}
          </dl>
        </section>

        <section className="panel">
          <div className="stack stack--sm">
            <h2 className="panel__title">{t.diag}</h2>
            <p className="panel__sub">{t.diagSub}</p>
          </div>
          <div className="stack stack--sm">
            {DIAGS.map((a) => {
              const l = last(a);
              const isOpen = open === a;
              return (
                <div key={a} className="diag" data-open={isOpen ? "yes" : undefined}>
                  <div className="diag__head">
                    <button
                      type="button"
                      className="diag__toggle"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : a)}
                    >
                      <CaretDownIcon size={18} className="ovw__chev" aria-hidden="true" />
                      <b>{OPS_T[lang].aksi[a]}</b>
                      {l && (
                        <span className="hint">
                          {t.lastRun(sejak(l.selesaiPada ?? l.dimintaPada, lang, now))}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={running(a)}
                      onClick={() => {
                        setOpen(a);
                        void sendCommand(id, a, {}, lang).then(refresh);
                      }}
                    >
                      {running(a) ? <CircleNotchIcon size={15} className="ctl-spin" /> : null}{" "}
                      {t.run}
                    </button>
                  </div>
                  {isOpen && <pre className="ops-log">{l ? (l.keluaran ?? "·") : t.neverRun}</pre>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel danger-zone">
          <h2 className="panel__title">{t.danger}</h2>
          <div className="danger-zone__row">
            <span className="stack" style={{ gap: 2 }}>
              <b>{t.newToken}</b>
              <span className="hint">{t.newTokenBody}</span>
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmTok(true)}
            >
              {t.newToken}
            </button>
          </div>
          {token && (
            <div className="wiz__cmd">
              <pre className="mono">{`sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json \\\n  python3 /opt/iris-agent/agent.py enroll --kode ${s.kode} --token ${token} \\\n  --server https://${location.host} --repo-root /home/orangepi/IRIS-ASO`}</pre>
            </div>
          )}
          <div className="danger-zone__row">
            <span className="stack" style={{ gap: 2 }}>
              <b>{t.del}</b>
              <span className="hint">{t.delBody}</span>
            </span>
            <button type="button" className="btn btn--danger" onClick={() => setConfirmDel(true)}>
              {t.del}
            </button>
          </div>
        </section>
      </div>

      <Confirm
        open={confirmTok}
        onOpenChange={setConfirmTok}
        title={t.newToken}
        body={t.newTokenBody}
        confirmLabel={t.newToken}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          const r = await fetch(`/api/server/${id}`, { method: "POST" })
            .then((x) => x.json() as Promise<{ ok: boolean; kode?: string; token?: string }>)
            .catch(() => ({ ok: false, kode: undefined, token: undefined }));
          if (!r.ok) {
            window.Toast?.show(msg(t, r.kode), "danger");
            return false;
          }
          setToken(r.token ?? null);
        }}
      />
      <Confirm
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={t.delTitle}
        body={t.delBody}
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          const r = await fetch(`/api/server/${id}`, { method: "DELETE" })
            .then((x) => x.json() as Promise<{ ok: boolean; kode?: string }>)
            .catch(() => ({ ok: false, kode: undefined }));
          if (!r.ok) {
            window.Toast?.show(msg(t, r.kode), "danger");
            return false;
          }
          window.Toast?.show(t.deleted, "ok");
          onDeleted();
        }}
      />
    </div>
  );
}
