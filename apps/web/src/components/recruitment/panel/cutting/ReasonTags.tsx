/**
 * The small tags on a Cutting row that say why the candidate sits where they do (3 Nov 2026):
 * how close to the cut line, Potensi Cut, revisions, a missed evening, examiners far apart, a note.
 * Built from reasonsOf (lib/recruitment/cutting.ts), so the filters and the drawer say the same thing.
 */
import type { Lang } from "../../../../lib/kelas";
import type { Reason, ReasonKey } from "../../../../lib/recruitment/cutting";
import { CW } from "./cutWhyStrings";

type Tone = "warn" | "danger" | "gold" | "violet";

const TONE: Record<ReasonKey, Tone> = {
  nearAbove: "gold",
  nearBelow: "gold",
  potensiCut: "danger",
  revisions: "violet",
  noFm: "warn",
  noTt: "warn",
  noScore: "warn",
  wide: "warn",
  ragu: "warn",
  susulan: "warn",
  gugur: "danger",
  sheetsMissing: "warn",
  hasNote: "violet",
};

export default function ReasonTags({
  reasons,
  lang,
  max = 4,
}: {
  reasons: readonly Reason[];
  lang: Lang;
  /** More than this many fold into "+n lagi"; the drawer lists them all */
  max?: number;
}) {
  if (!reasons.length) return null;
  const t = CW[lang];
  const shown = reasons.slice(0, max);
  const rest = reasons.slice(max);
  return (
    <span className="cwd-tags">
      {shown.map((r) => (
        <span key={r.key} className="cwd-tag" data-tone={TONE[r.key]}>
          {t.tag[r.key](r.n)}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="cwd-tag cwd-tag--more"
          title={rest.map((r) => t.tag[r.key](r.n)).join(" · ")}
        >
          {t.moreTags(rest.length)}
        </span>
      )}
    </span>
  );
}
