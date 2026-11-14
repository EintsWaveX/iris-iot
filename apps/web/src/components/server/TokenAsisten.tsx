/**
 * The Asisten token for the scoreboard's Mission Control (2026-11-14), so nobody digs it out of the
 * PC's module log. Two homes like JaringanHunt: a chip in the Konsol's session bar while the hunt
 * runs, and a card on the Server page. Only an Asisten can read it (/api/session/tokenpapan).
 */
import { CopyIcon } from "@phosphor-icons/react";
import { dict, getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import "../shell/SessionMiniBar.css";

const T = dict({
  id: {
    title: "Token Asisten",
    sub: "Untuk membuka Ruang Kendali Asisten di papan skor perburuan.",
    k: "Token Asisten",
    copy: "Salin",
    copied: "Token disalin",
    none: "Token muncul setelah Perburuan Modul 4 dimulai.",
    warn: "Jangan dibagikan ke Praktikan.",
  },
  en: {
    title: "Assistant Token",
    sub: "Opens Assistant Mission Control on the hunt scoreboard.",
    k: "Assistant Token",
    copy: "Copy",
    copied: "Token copied",
    none: "The token shows once the Module 4 hunt has started.",
    warn: "Don't share it with Praktikan.",
  },
  zh: {
    title: "助教令牌",
    sub: "用来打开寻踪计分板的助教控制室。",
    k: "助教令牌",
    copy: "复制",
    copied: "已复制令牌",
    none: "模块 4 寻踪开始后会显示令牌。",
    warn: "不要告诉学生。",
  },
});

export default function TokenAsisten({ lang, kartu = false }: { lang: Lang; kartu?: boolean }) {
  const t = T[lang];
  const baca = usePoll(
    () => getJson<{ ok: boolean; token: string | null }>("/api/session/tokenpapan"),
    60_000,
    true,
    ["sesi", "buru", "server"],
    0,
    "token-papan",
  );
  const token = baca.data?.token ?? null;
  if (!kartu && !token) return null;

  const chip = token ? (
    <span className="kodemasuk" data-blok="yes">
      <span className="kodemasuk__k label-caps">{t.k}</span>
      <b className="kodemasuk__v" aria-label={token.split("").join(" ")}>
        {[...token].map((c, i) => (
          <span className="kodemasuk__d" aria-hidden="true" key={i}>
            {c}
          </span>
        ))}
      </b>
    </span>
  ) : null;
  const salin = token ? (
    <button
      type="button"
      className="btn btn--sm btn--ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(token).then(
          () => window.Toast?.show(t.copied, "ok"),
          () => window.Toast?.show(token, "warn"),
        );
      }}
    >
      <CopyIcon size={14} aria-hidden="true" />
      {t.copy}
    </button>
  ) : null;

  if (!kartu)
    return (
      <div className="shead__game">
        {chip}
        {salin}
      </div>
    );
  return (
    <section className="panel">
      <div className="stack stack--sm">
        <h2 className="panel__title">{t.title}</h2>
        <span className="hint">{t.sub}</span>
        {token ? (
          <>
            {chip}
            <span>{salin}</span>
            <span className="hint">{t.warn}</span>
          </>
        ) : (
          <span className="hint">{t.none}</span>
        )}
      </div>
    </section>
  );
}
