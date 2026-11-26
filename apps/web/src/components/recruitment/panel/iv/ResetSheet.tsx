/**
 * Starting one CaAs's interview over, for the control seats (Ketua, Akademik, Admin): a hold first, then a
 * confirm that says what will be cleared (counted by the server with `preview`), then the reset. "start" only
 * stops the running clock; "all" clears the sheet, every examiner's levels and the voice recording parts.
 */
import { useState } from "react";
import { ArrowCounterClockwiseIcon, StopIcon } from "@phosphor-icons/react";
import HoldButton from "../../../ui/HoldButton";
import Confirm from "../../../ui/Confirm";
import { dict } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import type { IvStage } from "../../../../lib/recruitment/interview";

interface Count {
  started: boolean;
  answers: number;
  conclusions: number;
  verdict: string | null;
  case: boolean;
  levels: number;
  sent: number;
  audio: number;
}

const W = dict({
  id: {
    stop: "Hentikan Wawancara",
    all: "Reset Lembar CaAs",
    stopTitle: "Hentikan wawancara ini?",
    allTitle: "Reset seluruh lembar CaAs ini?",
    stopBody:
      "Jam wawancara berhenti dan kembali ke belum dimulai. Jawaban dan nilai tidak diubah.",
    allBody: (c: Count) =>
      `Yang akan dihapus: ${c.answers} jawaban, ${c.conclusions} kesimpulan, ${c.levels} lembar penilaian pewawancara (${c.sent} sudah terkirim), ${c.audio} bagian rekaman suara${c.verdict ? `, keputusan ${c.verdict}` : ""}${c.case ? ", kasus khusus" : ""}${c.started ? ", dan wawancara dianggap belum dimulai" : ""}. Slot, kehadiran, dan status kelulusan CaAs tidak berubah. Isi yang dihapus tetap ada di catatan audit.`,
    yesStop: "Ya, Hentikan",
    yesAll: "Ya, Reset Lembar",
    cancel: "Batal",
    doneStop: "Wawancara dihentikan.",
    doneAll: "Lembar CaAs direset.",
    fail: "Belum bisa diproses. Coba lagi.",
  },
  en: {
    stop: "Stop the Interview",
    all: "Reset the CaAs Sheet",
    stopTitle: "Stop this interview?",
    allTitle: "Reset this CaAs's whole sheet?",
    stopBody:
      "The interview clock stops and goes back to not started. Answers and levels are not changed.",
    allBody: (c: Count) =>
      `This clears: ${c.answers} answers, ${c.conclusions} conclusions, ${c.levels} examiner sheets with levels (${c.sent} sent), ${c.audio} voice recording parts${c.verdict ? `, the ${c.verdict} verdict` : ""}${c.case ? ", the special case" : ""}${c.started ? ", and the interview counts as not started" : ""}. The slot, attendance and the CaAs's standing are unchanged. What is cleared stays in the audit log.`,
    yesStop: "Yes, Stop",
    yesAll: "Yes, Reset the Sheet",
    cancel: "Cancel",
    doneStop: "Interview stopped.",
    doneAll: "CaAs sheet reset.",
    fail: "Could not do that. Try again.",
  },
  zh: {
    stop: "停止面试",
    all: "重置该 CaAs 的表格",
    stopTitle: "停止这场面试？",
    allTitle: "重置该 CaAs 的整张表格？",
    stopBody: "面试计时停止并回到未开始。答案和等级不会改变。",
    allBody: (c: Count) =>
      `将清除：${c.answers} 条答案、${c.conclusions} 条结论、${c.levels} 份考官评分表（已提交 ${c.sent} 份）、${c.audio} 段录音${c.verdict ? `、结论 ${c.verdict}` : ""}${c.case ? "、特殊情况" : ""}${c.started ? "，面试视为未开始" : ""}。时段、出勤和 CaAs 的状态不变。被清除的内容保留在审计记录中。`,
    yesStop: "确认停止",
    yesAll: "确认重置",
    cancel: "取消",
    doneStop: "面试已停止。",
    doneAll: "CaAs 表格已重置。",
    fail: "操作失败，请重试。",
  },
});

export default function ResetSheet({
  lang,
  stage,
  id,
  scope,
  onDone,
}: {
  lang: Lang;
  stage: IvStage;
  id: number;
  scope: "start" | "all";
  /** The sheet as the server has it now: the caller loads it again */
  onDone: () => void;
}) {
  const w = W[lang];
  const [count, setCount] = useState<Count | null>(null);
  const [open, setOpen] = useState(false);
  const toast = (m: string, tone: "ok" | "danger") => window.Toast?.show(m, tone);

  async function ask() {
    const r = await recPost<{ ok: true; count: Count }>("iv-sheet-reset", {
      stage,
      id,
      scope,
      preview: true,
    });
    if (isFail(r)) return toast(w.fail, "danger");
    setCount(r.count);
    setOpen(true);
  }
  async function run() {
    const r = await recPost<{ ok: true }>("iv-sheet-reset", { stage, id, scope });
    if (isFail(r)) {
      toast(w.fail, "danger");
      return false;
    }
    toast(scope === "start" ? w.doneStop : w.doneAll, "ok");
    onDone();
  }
  return (
    <>
      <HoldButton
        label={scope === "start" ? w.stop : w.all}
        tint="warn"
        size="compact"
        icon={scope === "start" ? StopIcon : ArrowCounterClockwiseIcon}
        onDone={() => void ask()}
      />
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title={scope === "start" ? w.stopTitle : w.allTitle}
        body={scope === "start" ? w.stopBody : count ? w.allBody(count) : ""}
        confirmLabel={scope === "start" ? w.yesStop : w.yesAll}
        cancelLabel={w.cancel}
        lang={lang}
        onConfirm={run}
      />
    </>
  );
}
