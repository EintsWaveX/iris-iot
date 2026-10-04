/** The tier badge (Phase 9 roles): Admin gold, Pengelola violet, Asisten plain. */
import { tierLabel } from "../../lib/labels";
import type { Tier } from "../../lib/hak";
import type { Lang } from "../../lib/kelas";

export default function TierBadge({ tier, lang }: { tier: Tier; lang: Lang }) {
  return <span className={`tier tier--${tier}`}>{tierLabel(tier, lang)}</span>;
}
