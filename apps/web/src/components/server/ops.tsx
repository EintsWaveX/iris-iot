/**
 * Server operation pieces shared by the console's server drawer and the
 * /servers device page (P8.2), so both behave the same:
 *
 * - HotspotCard: the IRIS-IOT access point as one switch, with a pending
 *   state until the next heartbeat confirms the new mode
 * - ServiceList: each practicum service with a big "Mulai ulang" button and
 *   an inline log peek (the log arrives as the diag.log command's output)
 * - CommandTimeline: recent commands as queued, sent, done / failed steps,
 *   like a CI run, updating as the server polls
 * - Sejak: an "N s ago" label that ticks every second
 * (Phase 9 removed DevicesByGroup with the Devices tab.)
 *
 * Commands are delivered on the Pi's next heartbeat, never instantly, so
 * every action says so instead of pretending it already happened.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, CircleDot, Clock3, Loader2, Power, XCircle } from "lucide-react";
import { Switch } from "../ui/Controls";
import { dict, jamMenit, postJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { hotspotMenyala, urutkanLayanan } from "../../lib/server-shared";
import type { Heartbeat, Perintah } from "../console/types";
import "./ops.css";

export const OPS_T = dict({
  id: {
    hotspot: "Hotspot IRIS-IOT",
    hotspotOn: "Menyala: praktikan tersambung ke Orange Pi",
    hotspotOff: "Mati: Orange Pi memakai Wi-Fi kampus",
    pending: "Menunggu denyut berikutnya…",
    services: "Layanan praktikum",
    restart: "Mulai ulang",
    start: "Jalankan",
    stop: "Hentikan",
    log: "Log",
    logWait: "Log diminta. Muncul setelah denyut berikutnya.",
    logEmpty: "Belum ada log. Tekan Log untuk memintanya.",
    commands: "Perintah terakhir",
    noCommands: "Belum ada perintah.",
    sent: "Perintah dikirim. Diproses pada denyut berikutnya dari Orange Pi.",
    fail: "Perintah tidak terkirim.",
    by: (k: string) => `oleh ${k}`,
    status: {
      menunggu: "menunggu",
      antre: "antre",
      terkirim: "terkirim",
      selesai: "selesai",
      gagal: "gagal",
      batal: "dibatalkan",
      kedaluwarsa: "kedaluwarsa",
    } as Record<string, string>,
    steps: ["Antre", "Terkirim", "Selesai"],
    aksi: {
      "layanan.mulai": "Jalankan layanan",
      "layanan.henti": "Hentikan layanan",
      "layanan.mulai_ulang": "Mulai ulang layanan",
      "ap.nyala": "Nyalakan hotspot",
      "ap.mati": "Matikan hotspot",
      "jam.selaraskan": "Selaraskan jam",
      "diag.ringkas": "Diagnostik ringkas",
      "diag.log": "Ambil log",
      "diag.jaringan": "Diagnostik jaringan",
      "diag.dmesg": "Pesan kernel",
      "diag.siap": "Cek kesiapan",
    } as Record<string, string>,
    svc: {
      "modul2-ws": "WebSocket Modul 2",
      mosquitto: "Mosquitto Modul 3",
      modul4: "Papan skor Modul 4",
    } as Record<string, string>,
    svcState: {
      active: "berjalan",
      inactive: "berhenti",
      failed: "gagal",
      aktif: "berjalan",
      berhenti: "berhenti",
      transisi: "sedang berubah",
      galat: "gagal",
    } as Record<string, string>,
  },
  en: {
    hotspot: "IRIS-IOT hotspot",
    hotspotOn: "On: students connect to the Orange Pi",
    hotspotOff: "Off: the Orange Pi uses campus Wi-Fi",
    pending: "Waiting for the next heartbeat…",
    services: "Practicum services",
    restart: "Restart",
    start: "Start",
    stop: "Stop",
    log: "Logs",
    logWait: "Logs requested. They arrive after the next heartbeat.",
    logEmpty: "No logs yet. Press Logs to request them.",
    commands: "Recent commands",
    noCommands: "No commands yet.",
    sent: "Command sent. It runs on the Orange Pi's next heartbeat.",
    fail: "The command was not sent.",
    by: (k: string) => `by ${k}`,
    status: {
      menunggu: "queued",
      antre: "queued",
      terkirim: "sent",
      selesai: "done",
      gagal: "failed",
      batal: "cancelled",
      kedaluwarsa: "expired",
    } as Record<string, string>,
    steps: ["Queued", "Sent", "Done"],
    aksi: {
      "layanan.mulai": "Start service",
      "layanan.henti": "Stop service",
      "layanan.mulai_ulang": "Restart service",
      "ap.nyala": "Turn hotspot on",
      "ap.mati": "Turn hotspot off",
      "jam.selaraskan": "Sync clock",
      "diag.ringkas": "Quick diagnostics",
      "diag.log": "Fetch logs",
      "diag.jaringan": "Network diagnostics",
      "diag.dmesg": "Kernel messages",
      "diag.siap": "Ready check",
    } as Record<string, string>,
    svc: {
      "modul2-ws": "Module 2 WebSocket",
      mosquitto: "Module 3 Mosquitto",
      modul4: "Module 4 scoreboard",
    } as Record<string, string>,
    svcState: {
      active: "running",
      inactive: "stopped",
      failed: "failed",
      aktif: "running",
      berhenti: "stopped",
      transisi: "changing",
      galat: "failed",
    } as Record<string, string>,
  },
});

/** A service's state as a tone: running, stopped on purpose (or starting
 *  or stopping), or crashed. Accepts the agent's words and systemd's. */
export function svcTone(st: string): "ok" | "off" | "bad" {
  if (st === "aktif" || st === "active") return "ok";
  if (st === "galat" || st === "failed") return "bad";
  return "off";
}

export const SVC_PILL = { ok: "pill--ok", off: "pill--mono", bad: "pill--danger" } as const;
export const SVC_DOT = { ok: "dot--ok", off: "dot--off", bad: "dot--danger" } as const;

export async function sendCommand(
  serverId: number,
  aksi: string,
  argumen: Record<string, string>,
  lang: Lang,
  quiet = false,
): Promise<boolean> {
  const t = OPS_T[lang];
  try {
    const r = await postJson<{ ok: boolean }>("/api/action", {
      tipe: "kirim",
      serverId,
      aksi,
      argumen,
    });
    if (!quiet) window.Toast?.show(r.ok ? t.sent : t.fail, r.ok ? "ok" : "danger");
    return r.ok;
  } catch {
    window.Toast?.show(t.fail, "danger");
    return false;
  }
}

/* --------------------------------------------------------------- hotspot */

export function HotspotCard({
  lang,
  serverId,
  hb,
  onSent,
}: {
  lang: Lang;
  serverId: number;
  hb: Heartbeat | null;
  onSent: () => void;
}) {
  const t = OPS_T[lang];
  const on = hotspotMenyala(hb?.modeJaringan);
  const [want, setWant] = useState<boolean | null>(null);
  useEffect(() => {
    if (want !== null && want === on) setWant(null);
  }, [on, want]);
  const shown = want ?? on;
  return (
    <div className="ops-hotspot" data-on={shown ? "yes" : undefined}>
      <span className="grow stack stack--sm">
        <b>{t.hotspot}</b>
        <span className="hint">
          {want !== null ? t.pending : shown ? t.hotspotOn : t.hotspotOff}
        </span>
      </span>
      <Switch
        on={shown}
        busy={want !== null}
        label={t.hotspot}
        onChange={(v) => {
          setWant(v);
          void sendCommand(serverId, v ? "ap.nyala" : "ap.mati", {}, lang).then((ok) => {
            if (!ok) setWant(null);
            onSent();
          });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- services */

export function ServiceList({
  lang,
  serverId,
  hb,
  perintah,
  onSent,
  onStop,
}: {
  lang: Lang;
  serverId: number;
  hb: Heartbeat | null;
  perintah: Perintah[];
  onSent: () => void;
  /** When given, running services also get a Stop button (the caller confirms). */
  onStop?: (svc: string) => void;
}) {
  const t = OPS_T[lang];
  const [peek, setPeek] = useState<string | null>(null);
  const layanan = urutkanLayanan(hb?.layanan);
  const logFor = (svc: string) =>
    perintah.find((p) => p.aksi === "diag.log" && p.argumen?.layanan === svc);
  return (
    <ul className="ops-svc">
      {layanan.map(([svc, st]) => {
        const tone = svcTone(st);
        const running = tone === "ok";
        const log = logFor(svc);
        const restarting = perintah.some(
          (p) =>
            p.aksi === "layanan.mulai_ulang" &&
            p.argumen?.layanan === svc &&
            (p.status === "menunggu" || p.status === "antre" || p.status === "terkirim"),
        );
        return (
          <li key={svc} className="ops-svc__row" data-state={tone}>
            <div className="ops-svc__head">
              <span className={`dot ${SVC_DOT[tone]}`} aria-hidden="true" />
              <span className="grow stack" style={{ gap: 0 }}>
                <b>{t.svc[svc] ?? svc}</b>
                <span className="hint mono">{svc}</span>
              </span>
              <span className={`pill ${SVC_PILL[tone]}`}>{t.svcState[st] ?? st}</span>
            </div>
            <div className="ops-svc__actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={restarting}
                onClick={() =>
                  void sendCommand(
                    serverId,
                    running ? "layanan.mulai_ulang" : "layanan.mulai",
                    { layanan: svc },
                    lang,
                  ).then(onSent)
                }
              >
                {restarting && <Loader2 size={17} className="ctl-spin" aria-hidden="true" />}
                {running ? t.restart : t.start}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                aria-expanded={peek === svc}
                onClick={() => {
                  const next = peek === svc ? null : svc;
                  setPeek(next);
                  if (next && (!log || log.status === "selesai" || log.status === "gagal"))
                    void sendCommand(serverId, "diag.log", { layanan: svc }, lang, true).then(
                      onSent,
                    );
                }}
              >
                {t.log}
              </button>
              {onStop && running && (
                <button
                  type="button"
                  className="btn btn--danger btn--icon"
                  aria-label={`${t.stop} ${t.svc[svc] ?? svc}`}
                  onClick={() => onStop(svc)}
                >
                  <Power size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            {peek === svc && (
              <pre className="ops-log" aria-live="polite">
                {log?.status === "selesai" && log.keluaran
                  ? log.keluaran
                  : log &&
                      (log.status === "menunggu" ||
                        log.status === "antre" ||
                        log.status === "terkirim")
                    ? t.logWait
                    : t.logEmpty}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------- timeline */

/** The API records a cancelled command as "gagal" with this note (the
 *  status enum has no separate value); show it as cancelled, not failed. */
export const CATATAN_BATAL = "dibatalkan oleh asisten";
export function statusTampil(p: Pick<Perintah, "status" | "keluaran">): string {
  return p.status === "gagal" && p.keluaran === CATATAN_BATAL ? "batal" : p.status;
}

const STEP_OF: Record<string, number> = {
  menunggu: 0,
  antre: 0,
  terkirim: 1,
  selesai: 2,
  gagal: 2,
  batal: 2,
  kedaluwarsa: 2,
};

export function CommandTimeline({
  lang,
  perintah,
  limit = 6,
  kode,
}: {
  lang: Lang;
  perintah: Perintah[];
  limit?: number;
  kode?: (nim: string | null) => string;
}) {
  const t = OPS_T[lang];
  const now = useTick(1_000);
  const rows = perintah.slice(0, limit);
  if (rows.length === 0) return <p className="hint">{t.noCommands}</p>;
  return (
    <ol className="ops-cmds">
      {rows.map((p) => {
        const st = statusTampil(p);
        const step = STEP_OF[st] ?? 0;
        const bad = st === "gagal" || st === "kedaluwarsa" || st === "batal";
        const Icon = bad ? XCircle : step === 2 ? CheckCircle2 : step === 1 ? CircleDot : Clock3;
        return (
          <li key={p.id} className="ops-cmd" data-status={st}>
            <span className="ops-cmd__icon" aria-hidden="true">
              {step < 2 && !bad ? <Loader2 size={18} className="ctl-spin" /> : <Icon size={18} />}
            </span>
            <span className="grow stack" style={{ gap: 2 }}>
              <span className="row row--between">
                <b className="truncate">
                  {t.aksi[p.aksi] ?? p.aksi}
                  {p.argumen?.layanan ? ` · ${t.svc[p.argumen.layanan] ?? p.argumen.layanan}` : ""}
                </b>
                <span className="hint num">{jamMenit(p.dimintaPada, lang)}</span>
              </span>
              <span className="ops-steps" aria-label={t.status[st] ?? st}>
                {t.steps.map((s, i) => (
                  <span
                    key={s}
                    className="ops-step"
                    data-done={i < step || (i === step && step === 2 && !bad) ? "yes" : undefined}
                    data-now={i === step && step < 2 ? "yes" : undefined}
                    data-bad={bad && i === 2 ? "yes" : undefined}
                  >
                    {i === 2 && bad ? t.status[st] : s}
                  </span>
                ))}
              </span>
              <span className="hint">
                {sejak(p.selesaiPada ?? p.terkirimPada ?? p.dimintaPada, lang, now)}
                {kode && p.dimintaOleh ? ` · ${t.by(kode(p.dimintaOleh))}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------- ago */

/** "N s ago" that ticks every second, so a timestamp never looks frozen
 *  between polls. */
export function Sejak({ iso, lang }: { iso: string | null; lang: Lang }) {
  const now = useTick(1_000);
  return <>{sejak(iso, lang, now)}</>;
}
