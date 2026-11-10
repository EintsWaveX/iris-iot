/**
 * The Self-host upgrade card on the Server page (10 Nov 2026, the Pencipta only). The website runs on
 * the lab PC, so putting a new version on it used to mean opening SSH there. This card does it from the
 * browser: Check for updates, Upgrade (hold to confirm), and Roll back to an earlier build.
 *
 * The page only asks; the work runs on the PC in a separate job (api/upgrade/[aksi].ts and
 * deploy/upgrade-job.mjs). A new build that does not come up is replaced by the previous one by
 * itself. A rollback goes only to a build that ran through this card, so the card never goes away.
 * The page reconnects on its own while the site restarts for a few seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsClockwiseIcon,
  ClockCounterClockwiseIcon,
  RocketLaunchIcon,
} from "@phosphor-icons/react";
import HoldButton from "../ui/HoldButton";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { samaSha } from "../../../deploy/upgrade-lib.mjs";
import type { Release, UpgradeLatest, UpgradeStatus } from "../../../deploy/upgrade-lib.mjs";

interface Answer {
  ok: true;
  enabled: boolean;
  host: string;
  build: string | null;
  busy: boolean;
  status: UpgradeStatus | null;
  latest: UpgradeLatest | null;
  rollback: Release[];
  log: string[];
  examLive: boolean;
  sessionLive: boolean;
}

const T = dict({
  id: {
    title: "Upgrade Website",
    lead: "Pasang versi terbaru situs di PC lab, atau kembali ke versi sebelumnya, tanpa buka SSH. Hanya Pencipta.",
    running: "Sedang jalan",
    on: "di",
    idle: "Siap",
    working: "Sedang bekerja",
    done: "Selesai",
    failed: "Gagal",
    notSetUp: "Belum dipasang di mesin ini. Pemasangan sekali jalan ada di DEPLOY.md bagian 7.",
    checkTitle: "Versi terbaru",
    checkedAt: (t: string) => `Dicek ${t}`,
    neverChecked: "Belum dicek.",
    upToDate: "Sudah versi terbaru.",
    checkFirst: "Cek pembaruan dulu.",
    ahead: (n: number) => `${n} perubahan baru di main`,
    check: "Cek Pembaruan",
    upgrade: "Tahan untuk Upgrade",
    upgradeHint:
      "Membangun versi baru dulu (2 sampai 4 menit), lalu situs mulai ulang sekitar 3 detik. Kalau gagal, versi lama dipasang lagi otomatis.",
    blockedExam: "Ada ruang ujian yang sedang jalan. Upgrade menunggu sampai selesai.",
    blockedSession: "Ada sesi praktikum yang sedang jalan. Upgrade menunggu sampai selesai.",
    blockedBusy: "Masih ada pekerjaan berjalan.",
    rollbackTitle: "Kembali ke versi sebelumnya",
    rollbackNone:
      "Belum ada versi untuk kembali. Daftarnya terisi setelah upgrade pertama lewat tombol ini.",
    rollbackHint:
      "Hanya versi yang pernah jalan lewat tombol ini, supaya tombolnya sendiri tidak hilang.",
    rollback: "Tahan untuk Kembali",
    seed: "versi saat tombol dipasang",
    viaDeploy: "upgrade",
    viaRollback: "rollback",
    logTitle: "Catatan pekerjaan",
    reconnecting: "Situs sedang mulai ulang. Halaman ini tersambung lagi sendiri.",
    asked: "Permintaan terkirim. Pekerjaannya mulai sebentar lagi.",
    fail: "Belum bisa mengirim permintaan. Coba lagi.",
    kode: {
      sedang_jalan: "Masih ada pekerjaan berjalan.",
      sedang_ujian: "Ada ruang ujian yang sedang jalan.",
      sedang_sesi: "Ada sesi praktikum yang sedang jalan.",
      belum_terpasang: "Belum dipasang di mesin ini.",
      bukan_tujuan_rollback: "Versi itu tidak bisa dipakai untuk rollback.",
      tanpa_hak: "Hanya Pencipta yang bisa memakai ini.",
    } as Record<string, string>,
  },
  en: {
    title: "Website Upgrade",
    lead: "Put the newest version of the site on the lab PC, or go back to an earlier one, without opening SSH. Pencipta only.",
    running: "Running",
    on: "on",
    idle: "Ready",
    working: "Working",
    done: "Done",
    failed: "Failed",
    notSetUp: "Not set up on this machine yet. The one-time setup is in DEPLOY.md section 7.",
    checkTitle: "Latest version",
    checkedAt: (t: string) => `Checked ${t}`,
    neverChecked: "Not checked yet.",
    upToDate: "Already the newest version.",
    checkFirst: "Check for updates first.",
    ahead: (n: number) => `${n} newer change${n === 1 ? "" : "s"} on main`,
    check: "Check for Updates",
    upgrade: "Hold to Upgrade",
    upgradeHint:
      "Builds the new version first (2 to 4 minutes), then the site restarts for about 3 seconds. If it fails, the old version is put back by itself.",
    blockedExam: "An exam room is running. The upgrade waits until it is over.",
    blockedSession: "A practicum session is running. The upgrade waits until it is over.",
    blockedBusy: "A job is still running.",
    rollbackTitle: "Go back to an earlier version",
    rollbackNone:
      "Nothing to go back to yet. The list fills in after the first upgrade through this button.",
    rollbackHint:
      "Only versions that ran through this button, so the button itself never goes away.",
    rollback: "Hold to Go Back",
    seed: "the version when the button was added",
    viaDeploy: "upgrade",
    viaRollback: "rollback",
    logTitle: "Job log",
    reconnecting: "The site is restarting. This page reconnects by itself.",
    asked: "Request sent. The job starts in a moment.",
    fail: "Couldn't send the request. Please try again.",
    kode: {
      sedang_jalan: "A job is still running.",
      sedang_ujian: "An exam room is running.",
      sedang_sesi: "A practicum session is running.",
      belum_terpasang: "Not set up on this machine yet.",
      bukan_tujuan_rollback: "That version can't be used for a rollback.",
      tanpa_hak: "Only the Pencipta can use this.",
    } as Record<string, string>,
  },
  zh: {
    title: "网站升级",
    lead: "无需打开 SSH，即可把网站的最新版本部署到实验室电脑，或回到之前的版本。仅限 Pencipta。",
    running: "当前运行",
    on: "在",
    idle: "就绪",
    working: "进行中",
    done: "完成",
    failed: "失败",
    notSetUp: "此机器尚未设置。一次性设置见 DEPLOY.md 第 7 节。",
    checkTitle: "最新版本",
    checkedAt: (t: string) => `检查于 ${t}`,
    neverChecked: "尚未检查。",
    upToDate: "已是最新版本。",
    checkFirst: "请先检查更新。",
    ahead: (n: number) => `main 上有 ${n} 项新更改`,
    check: "检查更新",
    upgrade: "按住升级",
    upgradeHint: "先构建新版本（2 到 4 分钟），然后网站重启约 3 秒。若失败，会自动恢复旧版本。",
    blockedExam: "有考场正在进行。升级会等到结束后。",
    blockedSession: "有实验课正在进行。升级会等到结束后。",
    blockedBusy: "仍有任务在运行。",
    rollbackTitle: "回到之前的版本",
    rollbackNone: "暂无可回退的版本。通过此按钮完成第一次升级后，列表才会出现。",
    rollbackHint: "只能回到通过此按钮运行过的版本，这样按钮本身不会消失。",
    rollback: "按住回退",
    seed: "添加按钮时的版本",
    viaDeploy: "升级",
    viaRollback: "回退",
    logTitle: "任务日志",
    reconnecting: "网站正在重启。此页面会自动重新连接。",
    asked: "请求已发送。任务稍后开始。",
    fail: "暂时无法发送请求，请再试一次。",
    kode: {
      sedang_jalan: "仍有任务在运行。",
      sedang_ujian: "有考场正在进行。",
      sedang_sesi: "有实验课正在进行。",
      belum_terpasang: "此机器尚未设置。",
      bukan_tujuan_rollback: "该版本不能用于回退。",
      tanpa_hak: "只有 Pencipta 可以使用。",
    } as Record<string, string>,
  },
});

const LOCALE: Record<Lang, string> = { id: "id-ID", en: "en-GB", zh: "zh-CN" };
const when = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleString(LOCALE[lang], {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

async function fetchStatus(): Promise<Answer> {
  const r = await fetch("/api/upgrade/status", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Answer;
}

/**
 * The job's state lives in files on the PC, not in database rows, so no live-update topic can announce a
 * change. The card asks itself: every 3 s while a job runs (the site restarts in the middle of it, so a
 * failed ask keeps the last answer), every 20 s otherwise, and never while the tab is hidden.
 */
function useJobStatus(): { data: Answer | null; errors: number; refresh: () => void } {
  const [data, setData] = useState<Answer | null>(null);
  const [errors, setErrors] = useState(0);
  const busy = useRef(false);
  const load = useCallback(async () => {
    try {
      const a = await fetchStatus();
      busy.current = a.busy;
      setData(a);
      setErrors(0);
    } catch {
      setErrors((n) => n + 1);
    }
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const loop = async () => {
      if (!document.hidden) await load();
      if (!stopped) timer = setTimeout(() => void loop(), busy.current ? 3000 : 20_000);
    };
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);
  return { data, errors, refresh: () => void load() };
}

export default function WebUpgrade({ lang }: { lang: Lang }) {
  const t = T[lang];
  const poll = useJobStatus();
  const d = poll.data;
  const [sending, setSending] = useState(false);

  async function ask(action: "check" | "deploy" | "rollback", ref?: string) {
    setSending(true);
    try {
      const r = await fetch(`/api/upgrade/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ref ? { ref } : {}),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; kode?: string } | null;
      if (!r.ok || !j?.ok) {
        window.Toast?.show((j?.kode && t.kode[j.kode]) || t.fail, "danger");
      } else {
        window.Toast?.show(t.asked, "ok");
      }
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
    setSending(false);
    poll.refresh();
  }

  if (!d) return <span className="skeleton" style={{ height: 120 }} aria-busy="true" />;

  const st = d.status;
  const running = d.busy && st?.state === "running";
  const state = running
    ? t.working
    : st?.state === "failed"
      ? t.failed
      : st?.state === "ok"
        ? t.done
        : t.idle;
  const tone = running
    ? "pill--accent"
    : st?.state === "failed"
      ? "pill--danger"
      : st?.state === "ok"
        ? "pill--ok"
        : "";
  const blocked = d.busy
    ? t.blockedBusy
    : d.examLive
      ? t.blockedExam
      : d.sessionLive
        ? t.blockedSession
        : null;
  // The last check only counts for the build that runs now; after a manual deploy it is out of date.
  const fresh = !!d.latest && samaSha(d.latest.current, d.build);
  const ahead = fresh ? (d.latest?.ahead ?? []) : [];
  const upToDate = fresh && ahead.length === 0;
  // Why Upgrade cannot be pressed: a job or an exam first, then nothing new, or nothing checked yet.
  const reason = blocked ?? (upToDate ? t.upToDate : !fresh ? t.checkFirst : null);

  return (
    <section className="panel srv-up" aria-labelledby="srv-up-t">
      <div className="panel__head">
        <h2 className="panel__title" id="srv-up-t">
          {t.title}
        </h2>
        <span className={`pill ${tone}`}>{state}</span>
      </div>
      <p className="hint">{t.lead}</p>
      <p>
        {t.running}: <b className="mono">{d.build ?? "?"}</b> {t.on} {d.host}
      </p>

      {!d.enabled ? (
        <div className="banner banner--warn" role="status">
          {t.notSetUp}
        </div>
      ) : (
        <>
          {running && st && (
            <div className="banner banner--accent" role="status">
              {st.step}
              {poll.errors > 0 && <> · {t.reconnecting}</>}
            </div>
          )}
          {!running && st && st.message && (
            <div
              className={st.state === "failed" ? "banner banner--warn" : "banner banner--accent"}
              role="status"
            >
              {st.message}
            </div>
          )}

          <div className="srv-up__block">
            <h3 className="srv-up__h">{t.checkTitle}</h3>
            <span className="hint">
              {d.latest ? t.checkedAt(when(d.latest.fetchedAt, lang)) : t.neverChecked}
              {d.latest &&
                (!fresh
                  ? ` · ${t.checkFirst}`
                  : ahead.length
                    ? ` · ${t.ahead(ahead.length)}`
                    : ` · ${t.upToDate}`)}
            </span>
            {ahead.length > 0 && (
              <ul className="srv-up__list">
                {ahead.slice(0, 6).map((c) => (
                  <li key={c.sha}>
                    <span className="mono">{c.sha}</span> {c.subject}
                  </li>
                ))}
              </ul>
            )}
            <div className="srv-up__row">
              <button
                type="button"
                className="btn btn--inverse"
                disabled={sending || d.busy}
                onClick={() => void ask("check")}
              >
                <ArrowsClockwiseIcon size={18} aria-hidden="true" />
                <span className="btn__label">{t.check}</span>
              </button>
              <HoldButton
                label={t.upgrade}
                tone="primary"
                icon={RocketLaunchIcon}
                size="compact"
                disabled={sending || !!reason}
                title={reason ?? undefined}
                onDone={() => void ask("deploy")}
              />
            </div>
            <span className="hint">{reason ?? t.upgradeHint}</span>
          </div>

          <div className="srv-up__block">
            <h3 className="srv-up__h">{t.rollbackTitle}</h3>
            {d.rollback.length === 0 ? (
              <span className="hint">{t.rollbackNone}</span>
            ) : (
              <ul className="srv-up__list srv-up__list--rows">
                {d.rollback.map((r) => (
                  <li key={r.sha}>
                    <span>
                      <b className="mono">{r.sha}</b>{" "}
                      <span className="hint">
                        {r.action === "seed"
                          ? t.seed
                          : `${r.action === "rollback" ? t.viaRollback : t.viaDeploy} · ${when(r.at, lang)}`}
                      </span>
                    </span>
                    <HoldButton
                      label={t.rollback}
                      tone="danger"
                      icon={ClockCounterClockwiseIcon}
                      size="compact"
                      ms={1500}
                      disabled={sending || d.busy}
                      title={d.busy ? t.blockedBusy : undefined}
                      onDone={() => void ask("rollback", r.sha)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <span className="hint">{t.rollbackHint}</span>
          </div>

          {d.log.length > 0 && (
            <div className="srv-up__block">
              <h3 className="srv-up__h">{t.logTitle}</h3>
              <pre className="srv-up__log mono" tabIndex={0}>
                {d.log.join("\n")}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}
