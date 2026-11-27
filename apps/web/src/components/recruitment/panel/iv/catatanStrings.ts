/**
 * The words of Catatan Khusus (the interview workbook, 22 Nov 2026): the red notes and plus points a committee
 * member ticks about a CaAs, the label that follows, and the notes and conclusion. Casual Indonesian, tech words
 * in English, CaAs never CaA.
 */
import { dict } from "../../../../lib/app";
import type { Label } from "../../../../lib/recruitment/interview";

interface Words {
  title: string;
  hint: string;
  red: string;
  plus: string;
  redHint: string;
  plusHint: string;
  counts: (r: number, p: number) => string;
  label: string;
  /** The label the ticks come to, shown beside the picker */
  autoLabel: string;
  labelPick: string;
  labelAuto: string;
  labels: Record<Label, string>;
  myNote: string;
  myNotePh: string;
  otherNotes: string;
  /** Read-only view: every note, the reader's own among them */
  allNotes: string;
  noNotes: string;
  roles: Record<string, string>;
  final: string;
  finalPh: string;
  saving: string;
  saved: string;
  failed: string;
  loading: string;
  refused: string;
  /** The button and dialog title for a PJ opening it from their room list */
  open: string;
  close: string;
  /** Penilaian: the column and the filter */
  col: string;
  filterFlag: string;
  flagChip: string;
  flagTip: string;
  none: string;
}

export const CK = dict<Words>({
  id: {
    title: "Catatan khusus",
    hint: "Centang yang kamu lihat dari CaAs ini. Label muncul sendiri dari jumlah centang.",
    red: "Catatan merah",
    plus: "Nilai plus",
    redHint: "Centang bila ada.",
    plusHint: "Centang bila ada.",
    counts: (r, p) => `${r} catatan merah, ${p} nilai plus`,
    label: "Label",
    autoLabel: "Label otomatis",
    labelPick: "Label manual",
    labelAuto: "Otomatis (ikut centang)",
    labels: {
      jago: "Jago",
      perhatian: "Perlu perhatian",
      banyak: "Banyak masalah",
      standar: "Standar",
    },
    myNote: "Catatanmu",
    myNotePh: "Hal yang menurutmu perlu diketahui panitia soal CaAs ini.",
    otherNotes: "Catatan dari yang lain",
    allNotes: "Semua catatan",
    noNotes: "Belum ada catatan.",
    roles: { pjDalam: "PJ dalam ruangan", pjLuar: "PJ luar ruangan", lain: "Panitia lain" },
    final: "Kesimpulan akhir panitia",
    finalPh: "Contoh: disarankan lolos, cocok diarahkan ke tim riset.",
    saving: "Menyimpan",
    saved: "Tersimpan",
    failed: "Belum tersimpan, coba lagi.",
    loading: "Memuat catatan",
    refused: "Kamu belum boleh membuka catatan ini.",
    open: "Catatan khusus",
    close: "Tutup",
    col: "Label",
    filterFlag: "Red flag",
    flagChip: "Red flag",
    flagTip: "Attitude atau Komitmen dinilai rendah. Fix Lolos ditahan di Ragu-ragu.",
    none: "Belum ada catatan.",
  },
  en: {
    title: "Special notes",
    hint: "Tick what you saw in this CaAs. The label comes from how many you tick.",
    red: "Red notes",
    plus: "Plus points",
    redHint: "Tick if it applies.",
    plusHint: "Tick if it applies.",
    counts: (r, p) => `${r} red note${r === 1 ? "" : "s"}, ${p} plus point${p === 1 ? "" : "s"}`,
    label: "Label",
    autoLabel: "Automatic label",
    labelPick: "Label by hand",
    labelAuto: "Automatic (follows the ticks)",
    labels: {
      jago: "Standout",
      perhatian: "Needs attention",
      banyak: "Many problems",
      standar: "Standard",
    },
    myNote: "Your note",
    myNotePh: "What you think the committee should know about this CaAs.",
    otherNotes: "Notes from others",
    allNotes: "All notes",
    noNotes: "No notes yet.",
    roles: {
      pjDalam: "PJ inside the room",
      pjLuar: "PJ outside the room",
      lain: "Other committee",
    },
    final: "Committee conclusion",
    finalPh: "E.g. recommended to pass, a good fit for the research team.",
    saving: "Saving",
    saved: "Saved",
    failed: "Not saved yet, try again.",
    loading: "Loading notes",
    refused: "You cannot open these notes.",
    open: "Special notes",
    close: "Close",
    col: "Label",
    filterFlag: "Red flag",
    flagChip: "Red flag",
    flagTip: "Attitude or Commitment was rated low. Fix Pass is held at Undecided.",
    none: "No notes yet.",
  },
  zh: {
    title: "特别备注",
    hint: "勾选你在这位 CaAs 身上看到的情况。标签会按勾选数量自动生成。",
    red: "红色备注",
    plus: "加分项",
    redHint: "符合就勾选。",
    plusHint: "符合就勾选。",
    counts: (r, p) => `${r} 条红色备注，${p} 个加分项`,
    label: "标签",
    autoLabel: "自动标签",
    labelPick: "手动标签",
    labelAuto: "自动（跟随勾选）",
    labels: { jago: "出色", perhatian: "需要关注", banyak: "问题较多", standar: "标准" },
    myNote: "你的备注",
    myNotePh: "你认为委员会应该了解这位 CaAs 的什么。",
    otherNotes: "其他人的备注",
    allNotes: "所有备注",
    noNotes: "还没有备注。",
    roles: { pjDalam: "教室内负责人", pjLuar: "教室外负责人", lain: "其他委员" },
    final: "委员会最终结论",
    finalPh: "例如：建议通过，适合安排到研究组。",
    saving: "保存中",
    saved: "已保存",
    failed: "还没保存，请重试。",
    loading: "正在加载备注",
    refused: "你无权打开这些备注。",
    open: "特别备注",
    close: "关闭",
    col: "标签",
    filterFlag: "红旗",
    flagChip: "红旗",
    flagTip: "态度或承诺评分偏低。确定通过被压在犹豫。",
    none: "还没有备注。",
  },
});
