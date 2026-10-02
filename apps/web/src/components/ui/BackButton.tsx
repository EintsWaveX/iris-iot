/**
 * The one Back button (Phase 9 kit). A link when it has `href`, otherwise a
 * button that runs `onClick` (going back inside an island's own views).
 *
 * Usage:
 *   <BackButton href={href(lang, "/servers")} label={t.allServers} lang={lang} />
 *   <BackButton onClick={() => setView("list")} lang={lang} />
 */
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";

const T = dict({ id: "Kembali", en: "Back", zh: "返回" });

interface Props {
  lang: Lang;
  /** Defaults to "Kembali" / "Back". Name the place when it helps. */
  label?: string;
  href?: string;
  onClick?: () => void;
}

export default function BackButton({ lang, label, href, onClick }: Props) {
  const body = (
    <>
      <ArrowLeftIcon size={20} aria-hidden="true" />
      {label ?? T[lang]}
    </>
  );
  if (href) {
    return (
      <a className="back" href={href}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className="back" onClick={onClick}>
      {body}
    </button>
  );
}
