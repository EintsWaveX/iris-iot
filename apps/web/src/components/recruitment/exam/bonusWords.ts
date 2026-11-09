/**
 * What the bonus offer says (8 Nov 2026). No number appears in it: not how many bonus questions, not
 * what they are worth, not how the count was reached. It says in words how the seat did and how its
 * time looks (performanceWords, bonus.ts), then asks. The second ask is shorter and a little warmer,
 * and says it is the last one. The same words serve the written parts and Live Coding.
 */
import type { Lang } from "../../../lib/kelas";
import { performanceWords, type BonusQuote, type Mood } from "../../../lib/recruitment/bonus";

const DID: Record<Lang, Record<Mood, string>> = {
  id: {
    top: "Hasil kerjamu keren banget sejauh ini.",
    good: "Hasil kerjamu bagus sejauh ini.",
    ok: "Hasil kerjamu lumayan sejauh ini.",
    low: "Masih ada yang bisa dikejar dari hasil kerjamu.",
  },
  en: {
    top: "You have done really well so far.",
    good: "You have done well so far.",
    ok: "You have done okay so far.",
    low: "There is still room to catch up.",
  },
  zh: {
    top: "你到目前为止表现非常出色。",
    good: "你到目前为止表现不错。",
    ok: "你到目前为止表现还可以。",
    low: "你还有机会追上来。",
  },
};

const TIME: Record<Lang, { roomy: string; tight: string }> = {
  id: {
    roomy: "Waktumu juga masih longgar.",
    tight: "Waktumu sudah mulai menipis, tapi masih cukup.",
  },
  en: {
    roomy: "You still have plenty of time.",
    tight: "Your time is getting short, but there is still enough.",
  },
  zh: { roomy: "你的时间也还很充裕。", tight: "时间有点紧了，但还够用。" },
};

const ASK: Record<Lang, string> = {
  id: "Mau lanjut mengerjakan beberapa soal bonus sebelum mengumpulkan?",
  en: "Want to try some bonus questions before you hand in?",
  zh: "提交之前，要不要试几道加分题？",
};

const LAST: Record<Lang, { nudge: Record<Mood, string>; close: string }> = {
  id: {
    nudge: {
      top: "Kamu lagi di jalur yang bagus, sayang kalau berhenti di sini.",
      good: "Kamu sudah di jalur yang bagus, sayang kalau berhenti di sini.",
      ok: "Masih ada kesempatan buat naik, lho.",
      low: "Masih ada kesempatan buat memperbaiki, lho.",
    },
    close: "Ini tawaran terakhir. Setelah ini tidak ditawarkan lagi, jadi pastikan dulu ya.",
  },
  en: {
    nudge: {
      top: "You are on a great run, it would be a shame to stop here.",
      good: "You are on a good run, it would be a shame to stop here.",
      ok: "There is still a chance to move up.",
      low: "There is still a chance to turn it around.",
    },
    close: "This is the last offer. It will not be made again, so be sure.",
  },
  zh: {
    nudge: {
      top: "你状态正好，就此停下太可惜了。",
      good: "你状态不错，就此停下有点可惜。",
      ok: "你还有机会往上走。",
      low: "你还有机会扳回来。",
    },
    close: "这是最后一次邀请，之后不会再出现，请想清楚。",
  },
};

export function offerWords(lang: Lang, q: BonusQuote, round: 1 | 2): string {
  const { mood, roomy } = performanceWords(q);
  if (round === 1)
    return `${DID[lang][mood]} ${roomy ? TIME[lang].roomy : TIME[lang].tight} ${ASK[lang]}`;
  return `${LAST[lang].nudge[mood]} ${ASK[lang]} ${LAST[lang].close}`;
}
