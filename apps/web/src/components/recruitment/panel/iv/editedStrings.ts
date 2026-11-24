/**
 * The mark a sheet gets when it is changed after it was sent (23 Nov 2026): when it was last edited and how many
 * editing sittings there were. Shown in the sheet, in Penilaian and in the Cutting drawer. Casual Indonesian,
 * CaAs never CaA.
 */
import { dict, localeOf } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";

interface Words {
  /** On the sheet itself and on a chip */
  mark: (when: string, n: number) => string;
  /** In Penilaian's Rincian and the Cutting drawer: who and when */
  line: (by: string, when: string, n: number) => string;
  title: string;
  hint: string;
}

export const ED = dict<Words>({
  id: {
    mark: (when, n) => `Diedit setelah dikirim, ${when} (${n}×)`,
    line: (by, when, n) => `${by} mengubah lembarnya setelah dikirim, terakhir ${when} (${n}×).`,
    title: "Lembar yang diubah setelah dikirim",
    hint: "Waktu terakhir lembar diubah atau ditarik lalu dikirim lagi. Hitungannya per sesi mengedit, bukan per ketikan.",
  },
  en: {
    mark: (when, n) => `Edited after sending, ${when} (${n}x)`,
    line: (by, when, n) => `${by} changed their sheet after sending it, last ${when} (${n}x).`,
    title: "Sheets changed after they were sent",
    hint: "The last time a sheet was changed, or pulled back and sent again. Counted per editing sitting, not per keystroke.",
  },
  zh: {
    mark: (when, n) => `提交后已修改，${when}（${n} 次）`,
    line: (by, when, n) => `${by} 在提交后修改了表格，最近一次 ${when}（${n} 次）。`,
    title: "提交后被修改的表格",
    hint: "表格最近一次被修改，或被撤回后重新提交的时间。按修改过程计次，而不是按按键计次。",
  },
});

/** "23 Nov, 00:12" in WIB, in the reader's language. */
export function fmtEdit(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}
