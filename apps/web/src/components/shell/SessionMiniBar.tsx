/**
 * The praktikan's session mini-bar (Phase 8), under the nav on every page
 * while a session runs: which module, time left, the announcement bell and
 * the "Minta bantuan" (raise hand) button.
 *
 * - Announcements used to be a toast on the dashboard only, so a student on
 *   a module page missed them. The bell keeps this session's announcements
 *   (the API holds only the latest; earlier ones are remembered in
 *   localStorage per session) with an unread dot, and a new one also raises
 *   a toast and pulses the bell on whatever page the student is on.
 * - Time warnings at 30 and 10 minutes left, once each per session.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BellIcon, HandIcon, PresentationChartIcon, SignInIcon } from "@phosphor-icons/react";
import * as RadixPopover from "@radix-ui/react-popover";
import type { PollState } from "../../lib/hooks";
import {
  MODUL_SINGKAT,
  dict,
  href,
  jamMenit,
  menitBerjalan,
  postJson,
  useTick,
  type SesiNow,
} from "../../lib/app";
import { durasiSesi } from "../../lib/jadwal";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import Pill from "../ui/Pill";
import SessionStrip from "./SessionStrip";
import KodeMasuk from "./KodeMasuk";
import SlidesDialog, { useSlides } from "./SlidesDialog";
import { openSignIn } from "../../lib/signin";
import "./SessionMiniBar.css";

const T = dict({
  id: {
    region: "Sesi berjalan",
    left: (m: number) => `sisa ${m} menit`,
    bell: "Pengumuman",
    slides: "Presentasi",
    none: "Belum ada pengumuman di sesi ini.",
    help: "Minta Bantuan",
    ikut: "Ikut Praktikum",
    ikutS: "Ikut",
    helpOn: "Menunggu asisten",
    helpSent: "Tangan terangkat. Asisten kelompokmu melihatnya di papan.",
    helpOff: "Permintaan bantuan dibatalkan.",
    helpFail: "Tidak dapat mengirim. Coba lagi.",
    stale: "Sesi sudah berganti. Masuk lagi untuk sesi ini.",
    newAnn: "Pengumuman baru",
    warn30: "Sisa 30 menit. Mulai rapikan pekerjaanmu.",
    warn10: "Sisa 10 menit. Unduh berkas dan simpan pekerjaanmu sekarang.",
    open: "Buka modul",
    warnLine: "Unduh berkas dan simpan pekerjaanmu",
    kelas: "Internasional",
  },
  en: {
    region: "Running session",
    left: (m: number) => `${m} minutes left`,
    bell: "Announcements",
    slides: "Slides",
    none: "No announcements in this session yet.",
    help: "Ask for Help",
    ikut: "Join the Practicum",
    ikutS: "Join",
    helpOn: "Waiting for assistant",
    helpSent: "Hand raised. Your group's assistant sees it on the board.",
    helpOff: "Help request cancelled.",
    helpFail: "Could not send. Try again.",
    stale: "The session changed. Sign in again for this one.",
    newAnn: "New announcement",
    warn30: "30 minutes left. Start wrapping up.",
    warn10: "10 minutes left. Download your file and save your work now.",
    open: "Open module",
    warnLine: "Download your file and save your work",
    kelas: "International",
  },
  zh: {
    region: "正在上课",
    left: (m: number) => `剩余 ${m} 分钟`,
    bell: "公告",
    slides: "幻灯片",
    none: "这节课还没有公告。",
    help: "求助",
    ikut: "参加实验",
    ikutS: "参加",
    helpOn: "等助教过来",
    helpSent: "已举手。你组的助教会在面板上看到。",
    helpOff: "求助已取消。",
    helpFail: "发送失败，再试一次。",
    stale: "课已经换了。请重新登录这节课。",
    newAnn: "新公告",
    warn30: "还剩 30 分钟。开始整理你的作业。",
    warn10: "还剩 10 分钟。现在下载文件并保存你的作业。",
    open: "打开模块",
    warnLine: "下载文件并保存你的作业",
    kelas: "国际班",
  },
});

interface Ann {
  pada: string;
  pesan: string;
}

function keyFor(s: SesiNow) {
  return `iris-ann-${s.tanggal}-${s.slot ?? s.mulai}`;
}

function readList(k: string): { list: Ann[]; seen: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "{}");
    return { list: Array.isArray(v.list) ? v.list : [], seen: v.seen ?? null };
  } catch {
    return { list: [], seen: null };
  }
}

function writeList(k: string, list: Ann[], seen: string | null) {
  try {
    localStorage.setItem(k, JSON.stringify({ list, seen }));
  } catch {
    /* storage blocked: the bell still shows the latest one */
  }
}

export default function SessionMiniBar({
  lang,
  now,
  proyektor = false,
}: {
  lang: Lang;
  now: PollState<SesiNow | null>;
  /** Projector mode: an Asisten can't raise a Praktikan's hand. */
  proyektor?: boolean;
}) {
  const t = T[lang];
  const s = now.data;
  const tick = useTick(30_000);
  const [anns, setAnns] = useState<Ann[]>([]);
  const [seen, setSeen] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hand, setHand] = useState<string | null>(null);
  const first = useRef(true);
  // The slides, reachable from every page during a session (2026-10-06).
  const slides = useSlides(s !== null);
  const [slidesOpen, setSlidesOpen] = useState(false);

  useEffect(() => setHand(s?.mintaBantuanPada ?? null), [s?.mintaBantuanPada]);

  // Sticky things below (the module stepper) sit under this bar.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") {
      root.style.setProperty("--minibar-h", "0px");
      return;
    }
    const ro = new ResizeObserver(() =>
      root.style.setProperty("--minibar-h", `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--minibar-h", "0px");
    };
  }, [s !== null]);

  // Announcement history + new-announcement toast.
  useEffect(() => {
    if (!s) return;
    const k = keyFor(s);
    const stored = readList(k);
    let list = stored.list;
    if (s.pengumuman && s.pengumumanPada && !list.some((a) => a.pada === s.pengumumanPada)) {
      list = [{ pada: s.pengumumanPada, pesan: s.pengumuman }, ...list].slice(0, 20);
      writeList(k, list, stored.seen);
      if (!first.current || !stored.seen) {
        window.Toast?.show(`${t.newAnn}: ${s.pengumuman}`, "info", { duration: 8000 });
        setPulse(true);
        setTimeout(() => setPulse(false), 2400);
      }
    }
    first.current = false;
    setAnns(list);
    setSeen(stored.seen);
  }, [s, t.newAnn]);

  // Time warnings, once each per session.
  const durasi = s ? durasiSesi(s) : 0;
  const left = s ? Math.max(0, durasi - menitBerjalan(s.mulaiPada, tick)) : null;
  useEffect(() => {
    if (!s || left === null) return;
    for (const [mark, msg] of [
      [10, t.warn10],
      [30, t.warn30],
    ] as const) {
      if (left <= mark && left > 0) {
        const k = `iris-warn-${s.tanggal}-${s.slot}-${mark}`;
        try {
          if (localStorage.getItem(k)) continue;
          localStorage.setItem(k, "1");
        } catch {
          /* ignore */
        }
        window.Toast?.show(msg, "warn", { duration: 9000 });
        break;
      }
    }
  }, [left, s, t.warn10, t.warn30]);

  if (!s) return null;
  // Not signed in to this session (2026-10-07): another slot's is none of
  // their business; their own offers to join it in place of the hand.
  const belumIkut = s.milikSaya === false;
  if (belumIkut && s.bisaIkut === false) return null;

  const unread = anns.length > 0 && anns[0].pada !== seen;
  const urgent = left !== null && left <= 10;
  const warn = left !== null && left <= 30;

  async function toggleHand() {
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; kode?: string; mintaBantuanPada?: string | null }>(
        "/api/session/help",
        { aktif: !hand },
      );
      if (d.ok) {
        setHand(d.mintaBantuanPada ?? null);
        window.Toast?.show(d.mintaBantuanPada ? t.helpSent : t.helpOff, "ok");
      } else if (d.kode === "sesi_berganti") {
        window.Toast?.show(t.stale, "warn");
      } else window.Toast?.show(t.helpFail, "danger");
    } catch {
      window.Toast?.show(t.helpFail, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={barRef}
      className="minibar"
      role="region"
      aria-label={t.region}
      style={{ "--mod-hue": `var(--mod-${s.modul})` } as CSSProperties}
      data-urgent={urgent ? "yes" : undefined}
      data-ikut={belumIkut && !proyektor ? "yes" : undefined}
    >
      <a className="minibar__mod" href={href(lang, `/modules/${s.modul}`)} aria-label={t.open}>
        <span className="minibar__dot" aria-hidden="true" />
        <Pill modul={s.modul}>{modulLabel(s.modul, lang)}</Pill>
        <b className="minibar__name">{MODUL_SINGKAT[s.modul]}</b>
      </a>
      {s.kelas === "internasional" && <span className="pill pill--violet">{t.kelas}</span>}

      <div className="minibar__time">
        {warn && <b className="minibar__warn">{t.warnLine}</b>}
        <SessionStrip
          lang={lang}
          mulaiPada={s.mulaiPada}
          durasi={durasi}
          compact
          hue={`var(--mod-${s.modul})`}
        />
      </div>

      <div className="minibar__actions">
        {proyektor && s.kodeMasuk && <KodeMasuk kode={s.kodeMasuk} lang={lang} besar />}
        {!proyektor && belumIkut && (
          <button
            type="button"
            className="minibar__help minibar__ikut"
            aria-label={t.ikut}
            onClick={() => openSignIn(undefined, { ikut: true })}
          >
            <SignInIcon size={18} aria-hidden="true" />
            <span className="minibar__ikut-l">{t.ikut}</span>
            <span className="minibar__ikut-s">{t.ikutS}</span>
          </button>
        )}
        {!proyektor && !belumIkut && (
          <button
            type="button"
            className="minibar__help"
            aria-pressed={Boolean(hand)}
            aria-label={hand ? t.helpOn : t.help}
            disabled={busy}
            onClick={() => void toggleHand()}
          >
            <HandIcon size={18} aria-hidden="true" />
            <span>{hand ? t.helpOn : t.help}</span>
          </button>
        )}

        {slides.list.length > 0 && (
          <button
            type="button"
            className="minibar__bell"
            aria-label={t.slides}
            title={t.slides}
            onClick={() => setSlidesOpen(true)}
          >
            <PresentationChartIcon size={19} aria-hidden="true" />
          </button>
        )}

        <RadixPopover.Root
          onOpenChange={(o) => {
            if (o && anns[0]) {
              setSeen(anns[0].pada);
              writeList(keyFor(s), anns, anns[0].pada);
            }
          }}
        >
          <RadixPopover.Trigger asChild>
            <button
              type="button"
              className="minibar__bell"
              data-pulse={pulse ? "yes" : undefined}
              aria-label={`${t.bell}${unread ? " (1)" : ""}`}
            >
              <BellIcon size={19} aria-hidden="true" />
              {unread && <span className="minibar__unread" aria-hidden="true" />}
            </button>
          </RadixPopover.Trigger>
          <RadixPopover.Portal>
            <RadixPopover.Content
              className="minibar__pop sweep-edge"
              align="end"
              sideOffset={10}
              collisionPadding={12}
            >
              <b className="minibar__pop-title">{t.bell}</b>
              {anns.length === 0 ? (
                <p className="minibar__pop-empty">{t.none}</p>
              ) : (
                <ol className="minibar__list">
                  {anns.map((a, i) => (
                    <li key={a.pada} data-new={i === 0 && unread ? "yes" : undefined}>
                      <span className="minibar__at num">{jamMenit(a.pada, lang)}</span>
                      <span>{a.pesan}</span>
                    </li>
                  ))}
                </ol>
              )}
            </RadixPopover.Content>
          </RadixPopover.Portal>
        </RadixPopover.Root>
      </div>
      <SlidesDialog
        open={slidesOpen}
        onOpenChange={setSlidesOpen}
        list={slides.list}
        modul={s.modul}
        lang={lang}
      />
    </div>
  );
}
