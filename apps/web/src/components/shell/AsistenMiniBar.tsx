/**
 * The Asisten's own running-session bar (Phase 9, mockup G6 "ABanner"):
 * under the nav on every page except the Console while a session they
 * teach runs (`mengajar` from /api/session/now): the module, the clock
 * strip, and a way back to the session. The nav clock steps aside for it.
 */
import type { CSSProperties } from "react";
import { ArrowRightIcon, HandIcon } from "@phosphor-icons/react";
import { dict, href, type SesiNow } from "../../lib/app";
import { durasiSesi } from "../../lib/jadwal";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import Pill from "../ui/Pill";
import SessionStrip from "./SessionStrip";
import KodeMasuk from "./KodeMasuk";
import "./SessionMiniBar.css";

const T = dict({
  id: {
    region: "Sesimu berjalan",
    name: "Sesimu Berjalan",
    open: "Buka Sesi",
    hands: (n: number) => `${n} kelompok minta bantuan`,
  },
  en: {
    region: "Your session is running",
    name: "Your Session Is Running",
    open: "Open Session",
    hands: (n: number) => `${n} ${n === 1 ? "group asks" : "groups ask"} for help`,
  },
  zh: {
    region: "你的课正在进行",
    name: "你的课正在进行",
    open: "打开课程",
    hands: (n: number) => `${n} 个小组请求帮助`,
  },
});

export default function AsistenMiniBar({ lang, s }: { lang: Lang; s: SesiNow }) {
  const t = T[lang];
  return (
    <div
      className="minibar minibar--asisten"
      role="region"
      aria-label={t.region}
      style={{ "--mod-hue": `var(--mod-${s.modul})` } as CSSProperties}
    >
      <span className="minibar__mod">
        <span className="minibar__dot" aria-hidden="true" />
        <Pill modul={s.modul}>{modulLabel(s.modul, lang)}</Pill>
        <b className="minibar__name">{t.name}</b>
      </span>
      <div className="minibar__time">
        <SessionStrip
          lang={lang}
          mulaiPada={s.mulaiPada}
          durasi={durasiSesi(s)}
          compact
          hue={`var(--mod-${s.modul})`}
        />
      </div>
      <div className="minibar__actions">
        {s.kodeMasuk && <KodeMasuk kode={s.kodeMasuk} lang={lang} />}
        {/* Raised hands lead straight to the board (2026-10-06). */}
        {!!s.tangan && (
          <a
            className="btn btn--sm minibar__hands"
            href={`${href(lang, "/session")}#board`}
            aria-label={t.hands(s.tangan)}
          >
            <HandIcon size={16} aria-hidden="true" />
            <span>{t.hands(s.tangan)}</span>
          </a>
        )}
        <a className="btn btn--inverse btn--sm minibar__open" href={href(lang, "/session")}>
          <span>{t.open}</span>
          <ArrowRightIcon size={16} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
