/**
 * What the bonus offer says. No number appears in it and nothing about how the seat did (15 Nov 2026):
 * a candidate must never learn their Tes Tulis score, in any form, so the offer cannot praise or
 * nudge by performance. It asks. The second ask is shorter, and says it is the last one. The same
 * words serve the written parts and Live Coding.
 */
import type { Lang } from "../../../lib/kelas";
import type { BonusOffer } from "../../../lib/recruitment/bonus";

const ASK: Record<Lang, string> = {
  id: "Mau lanjut mengerjakan beberapa soal bonus sebelum mengumpulkan?",
  en: "Want to try some bonus questions before you hand in?",
  zh: "提交之前，要不要试几道加分题？",
};

const LAST: Record<Lang, string> = {
  id: "Ini tawaran terakhir. Setelah ini tidak ditawarkan lagi, jadi pastikan dulu ya.",
  en: "This is the last offer. It will not be made again, so be sure.",
  zh: "这是最后一次邀请，之后不会再出现，请想清楚。",
};

export function offerWords(lang: Lang, _q: BonusOffer, round: 1 | 2): string {
  return round === 1 ? ASK[lang] : `${ASK[lang]} ${LAST[lang]}`;
}
