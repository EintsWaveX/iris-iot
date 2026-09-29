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
import * as RadixPopover from "@radix-ui/react-popover";
import { Bell, Hand, Clock3 } from "lucide-react";
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
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import type { Lang } from "../../lib/kelas";
import "./SessionMiniBar.css";

const T = dict({
  id: {
    region: "Sesi berjalan",
    left: (m: number) => `sisa ${m} mnt`,
    bell: "Pengumuman",
    none: "Belum ada pengumuman di sesi ini.",
    help: "Minta bantuan",
    helpOn: "Menunggu asisten",
    helpSent: "Tangan terangkat. Asisten kelompokmu melihatnya di papan.",
    helpOff: "Permintaan bantuan dibatalkan.",
    helpFail: "Tidak dapat mengirim. Coba lagi.",
    stale: "Sesi sudah berganti. Masuk lagi untuk sesi ini.",
    newAnn: "Pengumuman baru",
    warn30: "Sisa 30 menit. Mulai rapikan pekerjaanmu.",
    warn10: "Sisa 10 menit. Unduh berkas dan simpan pekerjaanmu sekarang.",
    open: "Buka modul",
  },
  en: {
    region: "Running session",
    left: (m: number) => `${m} min left`,
    bell: "Announcements",
    none: "No announcements in this session yet.",
    help: "Ask for help",
    helpOn: "Waiting for assistant",
    helpSent: "Hand raised. Your group's assistant sees it on the board.",
    helpOff: "Help request cancelled.",
    helpFail: "Could not send. Try again.",
    stale: "The session changed. Sign in again for this one.",
    newAnn: "New announcement",
    warn30: "30 minutes left. Start wrapping up.",
    warn10: "10 minutes left. Download your file and save your work now.",
    open: "Open module",
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
}: {
  lang: Lang;
  now: PollState<SesiNow | null>;
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
  const left = s ? Math.max(0, SESI_CAP_MENIT - menitBerjalan(s.mulaiPada, tick)) : null;
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

  const unread = anns.length > 0 && anns[0].pada !== seen;
  const pct = Math.min(100, Math.round(((SESI_CAP_MENIT - (left ?? 0)) / SESI_CAP_MENIT) * 100));
  const urgent = left !== null && left <= 10;

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
    >
      <a className="minibar__mod" href={href(lang, `/modules/${s.modul}`)} aria-label={t.open}>
        <span className="minibar__dot" aria-hidden="true" />
        <span className="minibar__chip">M{s.modul}</span>
        <b className="minibar__name">{MODUL_SINGKAT[s.modul]}</b>
      </a>

      <div className="minibar__time" title={s.mulaiPada ? jamMenit(s.mulaiPada, lang) : undefined}>
        <Clock3 size={15} aria-hidden="true" />
        <span className="minibar__track" aria-hidden="true">
          <span className="minibar__fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="minibar__left num">{t.left(left ?? SESI_CAP_MENIT)}</span>
      </div>

      <div className="minibar__actions">
        <button
          type="button"
          className="minibar__help"
          aria-pressed={Boolean(hand)}
          disabled={busy}
          onClick={() => void toggleHand()}
        >
          <Hand size={18} aria-hidden="true" />
          <span>{hand ? t.helpOn : t.help}</span>
        </button>

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
              <Bell size={19} aria-hidden="true" />
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
    </div>
  );
}
