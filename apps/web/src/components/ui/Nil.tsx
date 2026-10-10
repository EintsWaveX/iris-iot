/**
 * The one empty value (Phase 11): a muted "Belum ada" wherever a number or
 * a name has nothing yet, instead of a lone dot in some places and other
 * words in others.
 * - `dot`: dense grids (a score per cell, a row per sample) keep a single
 *   muted dot in the same style, still read out as "Belum ada".
 * - Without `lang` (deep cards that are not handed one) the word comes from
 *   the page's own <html lang> in CSS, so the server and the browser agree.
 */
import { nil } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";

export default function Nil({ lang, dot = false }: { lang?: Lang; dot?: boolean }) {
  if (!lang) return <span className={dot ? "nil nil--dot nil--auto" : "nil nil--auto"} />;
  if (!dot) return <span className="nil">{nil(lang)}</span>;
  return (
    <span className="nil nil--dot" title={nil(lang)}>
      <span aria-hidden="true">·</span>
      <span className="visually-hidden">{nil(lang)}</span>
    </span>
  );
}
