/**
 * The Cek Judge button (7 Nov 2026), shared by Kesiapan and Atur Ruang. Asking the server fresh and
 * re-reading the card changes nothing on screen while the judge is already "Siap", so the button said
 * nothing. Now it shows that it is working, then says what the server heard: how long ago the lab PC
 * last signalled and how long ago the judge last graded code (proof the compiler and sandbox work,
 * which a live signal alone is not).
 */
import { useState } from "react";
import type { Lang } from "../../../../../lib/kelas";
import { laluLabel } from "../../../../../lib/labels";
import { isFail, recGet } from "../../../../../lib/recruitment/client";
import type { LccJudge } from "../../../../../lib/recruitment/lcc-api";
import { KS } from "./malamStrings";

export interface CekJudge {
  busy: boolean;
  /** What the last check heard; null before the first check or after a failed one */
  hasil: LccJudge | null;
  /** The sentence for the last signal, e.g. "Judge menjawab. Sinyal terakhir PC Lab 00:00:12 lalu." */
  sinyal: string | null;
  /** The sentence for the last graded code */
  terakhirMenilai: string | null;
  jalankan: () => Promise<void>;
}

const sinyalDari = (h: LccJudge, lang: Lang): string => {
  const t = KS[lang];
  const beat = h.ageSec === null ? null : laluLabel(h.ageSec, lang);
  return h.judgeReady ? t.judgeUp(beat ?? "") : t.judgeDown(beat);
};

export function useCekJudge(lang: Lang, refresh: () => void): CekJudge {
  const t = KS[lang];
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<LccJudge | null>(null);

  async function jalankan() {
    if (busy) return;
    setBusy(true);
    const r = await recGet<LccJudge & { ok: true }>("lcc-judge");
    setBusy(false);
    if (isFail(r)) {
      setHasil(null);
      window.Toast?.show(t.judgeFail, "danger");
      return;
    }
    setHasil(r);
    window.Toast?.show(sinyalDari(r, lang), r.judgeReady ? "ok" : "warn");
    refresh();
  }

  return {
    busy,
    hasil,
    sinyal: hasil ? sinyalDari(hasil, lang) : null,
    terakhirMenilai: hasil
      ? t.lastJudged(hasil.lastJudgedSec === null ? null : laluLabel(hasil.lastJudgedSec, lang))
      : null,
    jalankan,
  };
}
