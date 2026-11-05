/**
 * The lab PC's connection, in the panel header (5 Nov 2026), the way the practicum nav shows
 * "Langsung": a pulsing dot and one word. Green "Terhubung" while the judge on the lab PC
 * reports, red "Terputus" when it stopped reporting, orange "Menyambung Ulang" while this page
 * cannot tell (its live link or its own check is failing and retrying), so a flaky page never
 * claims the lab PC is down.
 */
import type { Lang } from "../../../lib/kelas";
import { dict } from "../../../lib/app";
import { usePoll } from "../../../lib/hooks";
import { useSiaranStatus } from "../../../lib/siaran";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { LccJudge } from "../../../lib/recruitment/lcc-api";

const T = dict({
  id: {
    ok: "Terhubung",
    off: "Terputus",
    retry: "Menyambung Ulang",
    pc: "PC Lab",
    tipOk: "PC Lab menjawab dan siap menilai Live Coding.",
    tipOff: "PC Lab tidak menjawab. Kiriman kandidat menunggu di queue sampai PC Lab hidup lagi.",
    tipRetry: "Status PC Lab belum bisa dipastikan. Mencoba menyambung lagi.",
  },
  en: {
    ok: "Connected",
    off: "Disconnected",
    retry: "Reconnecting",
    pc: "Lab PC",
    tipOk: "The lab PC answers and is ready to judge Live Coding.",
    tipOff:
      "The lab PC does not answer. Candidates' submissions wait in the queue until it is back.",
    tipRetry: "The lab PC's status can't be confirmed right now. Trying to connect again.",
  },
  zh: {
    ok: "已连接",
    off: "已断开",
    retry: "正在重新连接",
    pc: "实验室电脑",
    tipOk: "实验室电脑有响应，可以评测现场编程。",
    tipOff: "实验室电脑没有响应。考生的提交在队列中等待，直到它恢复。",
    tipRetry: "暂时无法确认实验室电脑的状态，正在重新连接。",
  },
});

export default function LabPcStatus({ lang }: { lang: Lang }) {
  const t = T[lang];
  const live = useSiaranStatus();
  const poll = usePoll<LccJudge | null>(
    async () => {
      const r = await recGet<LccJudge & { ok: true }>("lcc-judge");
      if (isFail(r)) throw new Error(String(r.status || 408));
      return r;
    },
    60_000,
    true,
    ["recjudge"],
    300,
  );
  const d = poll.data;
  // Nothing to say until the first answer, unless the first tries already failed
  if (!d && poll.errors === 0) return null;
  const tone: "ok" | "off" | "retry" =
    poll.errors > 0 || live === "putus" || !d ? "retry" : d.judgeReady ? "ok" : "off";
  const word = tone === "ok" ? t.ok : tone === "off" ? t.off : t.retry;
  const tip = tone === "ok" ? t.tipOk : tone === "off" ? t.tipOff : t.tipRetry;
  return (
    <span
      className="rec-labpc"
      role="status"
      data-tone={tone}
      title={`${t.pc}: ${tip}`}
      aria-label={`${t.pc}: ${word}`}
    >
      <span className="rec-labpc__dot" aria-hidden="true" />
      <span className="rec-labpc__t">{word}</span>
    </span>
  );
}
