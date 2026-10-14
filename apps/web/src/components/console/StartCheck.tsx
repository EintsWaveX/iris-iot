/**
 * "Lab Belum Siap" (2026-10-05): what a session start answers when the lab
 * check finds a problem (src/lib/siap-mulai.ts). Lists every check, offers
 * the fix it can (start a stopped service, open the Server page), and lets the Asisten start anyway with a
 * reason, the same way Konsol is forced during a session.
 *
 * Used by Home's Start card and Preparation's Mode TOT start.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MinusCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { dict, href, postJson } from "../../lib/app";
import { ALASAN_PAKSA_MIN, type CekMulai } from "../../lib/siap-mulai";
import type { Lang } from "../../lib/kelas";

export interface BelumSiap {
  cek: CekMulai[];
  serverId: number | null;
}

const T = dict({
  id: {
    title: "Lab Belum Siap",
    desc: "Ada yang belum beres. Perbaiki dulu, atau mulai tetap dengan alasan.",
    totOk: (tot: boolean) => (tot ? "Mode TOT aktif" : "Mode TOT mati"),
    modulOk: (m: number, tot: boolean) =>
      tot ? `Modul ${m} dipakai untuk TOT` : `Modul ${m} sudah dibuka`,
    piOk: "PC Server online",
    piBad: "PC Server offline",
    piSkip: "Modul ini tidak butuh PC Server",
    piLast: (s: string) => `Detak terakhir ${s} lalu.`,
    piNever: "Belum ada detak dari PC Server.",
    svcOk: (u: string) => `Layanan ${u} berjalan`,
    svcBad: (u: string) => `Layanan ${u} tidak berjalan`,
    svcSkip: (u: string) => `Layanan ${u} belum bisa dicek`,
    svcState: (k: string) => `Laporan terakhir PC Server: ${k}.`,
    start: "Nyalakan",
    server: "Buka Server",
    sent: "Perintah dikirim. PC Server menjalankannya dalam beberapa detik, lalu Cek Lagi.",
    sendFail: "Perintah tidak terkirim.",
    why: "Alasan mulai tetap",
    whyPh: "Misal: PC Server sedang diganti, praktikan pakai hotspot HP",
    whyHint: (n: number) => `Minimal ${n} karakter. Dicatat di log sesi.`,
    cancel: "Batal",
    force: "Mulai Tetap",
    recheck: "Cek Lagi",
    all: "Semua cek lulus. Mulai sekarang?",
    go: "Mulai",
    min: (n: number) => `${n} menit`,
    sec: (n: number) => `${n} detik`,
    hour: (n: number) => `${n} jam`,
  },
  en: {
    title: "Lab Not Ready",
    desc: "Something isn't ready yet. Fix it first, or start anyway with a reason.",
    totOk: (tot: boolean) => (tot ? "TOT Mode is on" : "TOT Mode is off"),
    modulOk: (m: number, tot: boolean) =>
      tot ? `Module ${m} used for TOT` : `Module ${m} is open`,
    piOk: "PC Server online",
    piBad: "PC Server offline",
    piSkip: "This module doesn't need the PC Server",
    piLast: (s: string) => `Last heartbeat ${s} ago.`,
    piNever: "No heartbeat from the PC Server yet.",
    svcOk: (u: string) => `Service ${u} running`,
    svcBad: (u: string) => `Service ${u} not running`,
    svcSkip: (u: string) => `Service ${u} can't be checked yet`,
    svcState: (k: string) => `The PC Server last reported: ${k}.`,
    start: "Start It",
    server: "Open Server",
    sent: "Command sent. The PC Server runs it within seconds, then Check Again.",
    sendFail: "The command wasn't sent.",
    why: "Reason to start anyway",
    whyPh: "E.g. the PC Server is being swapped, students use a phone hotspot",
    whyHint: (n: number) => `At least ${n} characters. Saved in the session log.`,
    cancel: "Cancel",
    force: "Start Anyway",
    recheck: "Check Again",
    all: "Every check passes. Start now?",
    go: "Start",
    min: (n: number) => (n === 1 ? "1 minute" : `${n} minutes`),
    sec: (n: number) => `${n} seconds`,
    hour: (n: number) => (n === 1 ? "1 hour" : `${n} hours`),
  },
  zh: {
    title: "实验室未就绪",
    desc: "有些事项还没准备好。先处理好，或者写明原因后仍然开始。",
    totOk: (tot: boolean) => (tot ? "TOT 模式已开启" : "TOT 模式已关闭"),
    modulOk: (m: number, tot: boolean) => (tot ? `模块 ${m} 用于 TOT` : `模块 ${m} 已开放`),
    piOk: "PC 服务器在线",
    piBad: "PC 服务器离线",
    piSkip: "这个模块不需要 PC 服务器",
    piLast: (s: string) => `最后一次心跳在 ${s} 前。`,
    piNever: "还没有收到 PC 服务器的心跳。",
    svcOk: (u: string) => `服务 ${u} 正在运行`,
    svcBad: (u: string) => `服务 ${u} 没有运行`,
    svcSkip: (u: string) => `服务 ${u} 暂时无法检查`,
    svcState: (k: string) => `PC 服务器最后报告：${k}。`,
    start: "启动",
    server: "打开服务器",
    sent: "命令已发送。PC 服务器会在几秒内执行，然后再检查一次。",
    sendFail: "命令没发出去。",
    why: "仍要开始的原因",
    whyPh: "例如：正在更换 PC 服务器，学生使用手机热点",
    whyHint: (n: number) => `至少 ${n} 个字符，会记在这节课的记录里。`,
    cancel: "取消",
    force: "仍然开始",
    recheck: "再检查一次",
    all: "所有检查都通过了。现在开始？",
    go: "开始",
    min: (n: number) => `${n} 分钟`,
    sec: (n: number) => `${n} 秒`,
    hour: (n: number) => `${n} 小时`,
  },
});

type Tx = (typeof T)["id"];

function umur(t: Tx, s: number): string {
  if (s < 90) return t.sec(s);
  if (s < 90 * 60) return t.min(Math.round(s / 60));
  return t.hour(Math.round(s / 3600));
}

interface Baris {
  status: CekMulai["status"];
  judul: string;
  detail?: string;
  aksi?: ReactNode;
}

export default function StartCheck({
  data,
  modul,
  tot,
  lang,
  busy,
  onClose,
  onRecheck,
  onForce,
}: {
  data: BelumSiap | null;
  modul: number;
  tot: boolean;
  lang: Lang;
  busy: boolean;
  onClose: () => void;
  /** Ask the API again (a start without a reason). */
  onRecheck: () => void;
  onForce: (alasan: string) => void;
}) {
  const t = T[lang];
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const open = data !== null;
  useEffect(() => {
    if (!open) setAlasan("");
  }, [open]);

  async function nyalakan(layanan: string) {
    if (!data?.serverId) return;
    setKirim(true);
    try {
      const d = await postJson<{ ok: boolean }>("/api/action", {
        tipe: "kirim",
        serverId: data.serverId,
        aksi: "layanan.mulai",
        argumen: { layanan },
      });
      window.Toast?.show(d.ok ? t.sent : t.sendFail, d.ok ? "ok" : "danger");
    } catch {
      window.Toast?.show(t.sendFail, "danger");
    } finally {
      setKirim(false);
    }
  }

  const rows: Baris[] = [];
  for (const c of data?.cek ?? []) {
    if (c.id === "tot") rows.push({ status: c.status, judul: t.totOk(tot) });
    else if (c.id === "modul") rows.push({ status: c.status, judul: t.modulOk(modul, tot) });
    else if (c.id === "pi") {
      if (c.status === "lewat") continue;
      rows.push({
        status: c.status,
        judul: c.status === "ok" ? t.piOk : t.piBad,
        detail:
          c.status === "gagal"
            ? c.umurDetik == null
              ? t.piNever
              : t.piLast(umur(t, c.umurDetik))
            : undefined,
        aksi:
          c.status === "gagal" ? (
            <a
              className="btn btn--ghost btn--sm"
              href={
                data?.serverId
                  ? `${href(lang, "/servers")}?id=${data.serverId}&dari=persiapan`
                  : href(lang, "/servers")
              }
            >
              {t.server}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </a>
          ) : undefined,
      });
    } else if (c.id === "layanan" && c.layanan) {
      const u = c.layanan;
      rows.push({
        status: c.status,
        judul: c.status === "ok" ? t.svcOk(u) : c.status === "gagal" ? t.svcBad(u) : t.svcSkip(u),
        detail: c.status === "gagal" && c.keadaan ? t.svcState(c.keadaan) : undefined,
        aksi:
          c.status === "gagal" && data?.serverId ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={kirim}
              onClick={() => void nyalakan(u)}
            >
              {t.start}
            </button>
          ) : undefined,
      });
    }
  }
  const adaGagal = rows.some((r) => r.status === "gagal");
  const bolehPaksa = alasan.trim().length >= ALASAN_PAKSA_MIN;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.title}
      description={adaGagal ? t.desc : t.all}
      size="sm"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onRecheck}>
          <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
          {t.recheck}
        </button>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          {adaGagal ? (
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy || !bolehPaksa}
              onClick={() => onForce(alasan.trim())}
            >
              {t.force}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={onRecheck}>
              {t.go}
            </button>
          )}
        </>
      }
    >
      <ul className="startcheck">
        {rows.map((r) => (
          <li key={r.judul} className="startcheck__i" data-status={r.status}>
            {r.status === "ok" ? (
              <CheckCircleIcon size={20} aria-hidden="true" />
            ) : r.status === "gagal" ? (
              <WarningIcon size={20} aria-hidden="true" />
            ) : (
              <MinusCircleIcon size={20} aria-hidden="true" />
            )}
            <span className="startcheck__txt">
              <b>{r.judul}</b>
              {r.detail && <span className="hint">{r.detail}</span>}
            </span>
            {r.aksi}
          </li>
        ))}
      </ul>
      {adaGagal && (
        <label className="field">
          <span className="field__label">{t.why}</span>
          <input
            className="field__input"
            value={alasan}
            placeholder={t.whyPh}
            maxLength={300}
            onChange={(e) => setAlasan(e.target.value)}
          />
          <span className="field__hint">{t.whyHint(ALASAN_PAKSA_MIN)}</span>
        </label>
      )}
    </Dialog>
  );
}
