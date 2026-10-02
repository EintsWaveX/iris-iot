/**
 * The one Back button (Phase 9 kit): an arrow and words in a pill, the
 * same everywhere. A link when it has `href`; with `onClick` too, a plain
 * click runs `onClick` instead (going back inside an island's own views)
 * while Ctrl or middle click still opens the link. Without `href` it is a
 * button. PageHeader.astro draws the same thing for Astro pages.
 *
 * Usage:
 *   <BackButton href={href(lang, "/servers")} label={t.back} lang={lang} />
 *   <BackButton onClick={() => setView("list")} lang={lang} />
 */
import type { MouseEvent } from "react";
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
    const click = (e: MouseEvent<HTMLAnchorElement>) => {
      if (!onClick || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      onClick();
    };
    return (
      <a className="back" href={href} onClick={click}>
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
