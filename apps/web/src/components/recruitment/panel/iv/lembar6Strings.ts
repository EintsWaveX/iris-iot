/** The words of the teaching test sheet where it differs from the interview sheet (mockup r6-lembar). */
import { dict } from "../../../../lib/app";

interface M6Words {
  title: string;
  turn: (i: number, room: string, a: string, b: string) => string;
  panelTip: string;
  startTurn: string;
  clockAria: string;
  clockOf: (m: number) => string;
  pause: string;
  resume: string;
  steps: [string, string, string];
  notesN: (n: number) => string;
  railHint: string;
  noteTitle: (m: number) => string;
  topic: string;
  topicPh: string;
  addPh: string;
  addAria: string;
  rowLabel: string;
  general: string;
  addNote: string;
  quick: string[];
  none: string;
  removeNote: string;
  mate: (m: string) => string;
  mateLive: (m: string) => string;
  levelHint: (m: string) => string;
  sample: string;
  sampleRubric: string;
  otherPh: string;
  verdictTitle: string;
  verdictHint: (m: string) => string;
  baChips: string[];
  baPh: string;
  chkNotes: (n: number) => string;
  chkNoNotes: string;
  chkRows: (n: number) => string;
  chkTimeOver: (a: string, m: number) => string;
  chkTimeOk: string;
  sentBody: (v: string, s: number, d: string | null) => string;
  panel: string;
  sentWord: string;
  notYet: string;
  allSent: string;
  hiddenUntil: (m: string) => string;
  rubricRow: string;
  nextTurn: string;
  nextBtn: string;
  turnTo: string;
  withdrawn: string;
  caseSusulan: (n: string) => string;
  caseConfirm: string;
}

export const M6 = dict<M6Words>({
  id: {
    title: "Lembar Tes Mengajar",
    turn: (i, r, a, b) => `Giliran ${i} · ${r} · ${a} sampai ${b}`,
    panelTip: "Panel",
    startTurn: "Mulai Giliran",
    clockAria: "Sisa waktu mengajar",
    clockOf: (m) => `dari ${m}:00`,
    pause: "Jeda jam",
    resume: "Lanjutkan jam",
    steps: ["Mengamati", "Kesimpulan", "Keputusan"],
    notesN: (n) => `${n} catatan`,
    railHint: "catatan, tersambung ke baris rubrik. Ketuk baris untuk menandai catatan berikutnya.",
    noteTitle: (m) => `Catatan pengamatan · ${m} menit mengajar`,
    topic: "Materi yang dibawakan",
    topicPh: "Contoh: Dasar MQTT: publish dan subscribe",
    addPh: "Tulis yang kamu lihat, lalu Enter",
    addAria: "Catatan pengamatan",
    rowLabel: "Baris rubrik",
    general: "Umum",
    addNote: "Tambah catatan",
    quick: [
      "Penjelasan jelas",
      "Contoh yang pas",
      "Bertanya balik",
      "Terlalu cepat",
      "Gugup",
      "Kehabisan waktu",
    ],
    none: "Belum ada catatan. Catatan diberi cap waktu dari jam giliran dan terbaca oleh panelmu.",
    removeNote: "Hapus catatan",
    mate: (m) =>
      `${m} ada di dokumen yang sama. Catatan dan kesimpulan dibagi bersama; hanya tingkat 1 sampai 5 yang privat.`,
    mateLive: (m) =>
      `${m} baru saja menulis di dokumen yang sama. Catatan dan kesimpulan dibagi bersama; hanya tingkat 1 sampai 5 yang privat.`,
    levelHint: (m) =>
      `Tingkat 1 sampai 5 hanya terlihat olehmu sampai ${m} dan kamu sama-sama mengirim, supaya tidak saling memengaruhi. Kesimpulan dan keputusan ditulis bersama.`,
    sample: "Contoh",
    sampleRubric: "Rubrik Contoh",
    otherPh: "Contoh: direkomendasikan lolos karena mengajarnya tertata.",
    verdictTitle: "Kesimpulan Tes Mengajar",
    verdictHint: (m) => `Diputuskan bersama ${m}. Ragu-ragu dibahas di Pleno sebelum Cutting.`,
    baChips: [
      "Tidak membawa name tag",
      "Terlambat dalam toleransi",
      "Proyektor bermasalah, jam dihentikan",
      "Waktu habis, dihentikan",
    ],
    baPh: "Kejadian khusus selama giliran. Kosongkan bila tidak ada.",
    chkNotes: (n) => `${n} catatan pengamatan.`,
    chkNoNotes: "Belum ada catatan pengamatan. Boleh dikirim, tetapi Pleno tidak punya bahan.",
    chkRows: (n) => `Semua ${n} baris rubrik lengkap.`,
    chkTimeOver: (a, m) => `Giliran lewat ${a} dari ${m} menit. Catat di Penggunaan waktu.`,
    chkTimeOk: "Waktu mengajar dalam batas.",
    sentBody: (v, s, d) =>
      `Keputusan ${v}, skor lembarmu ${s} dari 100. Bisa diubah sampai Cutting Mengajar dimulai${d ? `, ${d}` : ""}.`,
    panel: "Panel",
    sentWord: "sudah kirim",
    notYet: "belum",
    allSent: "Semua penguji sudah mengirim. Tingkat tiap penguji terbuka di bawah.",
    hiddenUntil: (m) => `Tingkat penguji lain tersembunyi sampai ${m} mengirim.`,
    rubricRow: "Baris rubrik",
    nextTurn: "Giliran berikutnya",
    nextBtn: "Giliran Berikutnya",
    turnTo: "sampai",
    withdrawn: "Lembarmu ditarik. Penguji lain melihat Belum.",
    caseSusulan: (n) => `${n} ditawari Susulan Mengajar`,
    caseConfirm:
      "Status akhirnya baru berlaku setelah Akademik mengonfirmasi di Papan, lalu kandidat ditawari Susulan di halamannya. Sampai saat itu, kandidat belum diberi tahu.",
  },
  en: {
    title: "Teaching Test Sheet",
    turn: (i, r, a, b) => `Turn ${i} · ${r} · ${a} to ${b}`,
    panelTip: "Panel",
    startTurn: "Start the Turn",
    clockAria: "Teaching time left",
    clockOf: (m) => `of ${m}:00`,
    pause: "Pause the clock",
    resume: "Resume the clock",
    steps: ["Observing", "Conclusions", "Verdict"],
    notesN: (n) => `${n} notes`,
    railHint: "notes, tied to rubric rows. Tap a row to tag the next note.",
    noteTitle: (m) => `Observation notes · ${m} minutes of teaching`,
    topic: "The lesson taught",
    topicPh: "E.g. MQTT basics: publish and subscribe",
    addPh: "Write what you see, then Enter",
    addAria: "Observation note",
    rowLabel: "Rubric row",
    general: "General",
    addNote: "Add note",
    quick: [
      "Clear explanation",
      "A fitting example",
      "Asked back",
      "Too fast",
      "Nervous",
      "Ran out of time",
    ],
    none: "No notes yet. Notes are stamped with the turn clock and your panel can read them.",
    removeNote: "Remove note",
    mate: (m) =>
      `${m} is in the same document. Notes and conclusions are shared by the panel; only the 1 to 5 levels are private.`,
    mateLive: (m) =>
      `${m} just wrote in the same document. Notes and conclusions are shared by the panel; only the 1 to 5 levels are private.`,
    levelHint: (m) =>
      `Levels stay hidden from ${m} until all of you send, so you don't sway each other. Conclusions and the verdict are written together.`,
    sample: "Sample",
    sampleRubric: "Sample Rubric",
    otherPh: "E.g. recommended to pass because the teaching is well organised.",
    verdictTitle: "Teaching Test Verdict",
    verdictHint: (m) => `Decided together with ${m}. Undecided goes to the Pleno before Cutting.`,
    baChips: [
      "No name tag",
      "Late within the grace",
      "Projector failed, clock stopped",
      "Time ran out, stopped",
    ],
    baPh: "Anything unusual during the turn. Leave empty if nothing.",
    chkNotes: (n) => `${n} observation notes.`,
    chkNoNotes: "No observation notes yet. You may send, but the Pleno has nothing to go on.",
    chkRows: (n) => `All ${n} rubric rows are complete.`,
    chkTimeOver: (a, m) => `The turn ran ${a} past ${m} minutes. Note it under Use of time.`,
    chkTimeOk: "Teaching time is within the limit.",
    sentBody: (v, s, d) =>
      `Verdict ${v}, your sheet scores ${s} of 100. You can change it until the Teaching Cutting starts${d ? `, ${d}` : ""}.`,
    panel: "Panel",
    sentWord: "sent",
    notYet: "not yet",
    allSent: "Every examiner has sent. Each examiner's levels are open below.",
    hiddenUntil: (m) => `The other examiners' levels stay hidden until ${m} send.`,
    rubricRow: "Rubric row",
    nextTurn: "Next turn",
    nextBtn: "Next Turn",
    turnTo: "to",
    withdrawn: "Your sheet was withdrawn. The other examiners see Not yet.",
    caseSusulan: (n) => `${n} is offered the Teaching makeup`,
    caseConfirm:
      "The final status only applies once the Akademik confirms on the Board, and then the candidate sees the makeup offer on their page. Until then the candidate isn't told.",
  },
  zh: {
    title: "试讲评分表",
    turn: (i, r, a, b) => `第 ${i} 位 · ${r} · ${a} 至 ${b}`,
    panelTip: "评审组",
    startTurn: "开始本轮",
    clockAria: "试讲剩余时间",
    clockOf: (m) => `共 ${m}:00`,
    pause: "暂停计时",
    resume: "继续计时",
    steps: ["观察", "结论", "结果"],
    notesN: (n) => `${n} 条记录`,
    railHint: "条记录，关联到评分行。点一行可标记下一条记录。",
    noteTitle: (m) => `观察记录 · 试讲 ${m} 分钟`,
    topic: "讲授的内容",
    topicPh: "例如：MQTT 基础：发布与订阅",
    addPh: "写下你看到的，然后按 Enter",
    addAria: "观察记录",
    rowLabel: "评分行",
    general: "通用",
    addNote: "添加记录",
    quick: ["讲解清楚", "例子贴切", "反问听众", "语速太快", "紧张", "时间不够"],
    none: "还没有记录。记录会带上本轮的计时，评审组都能看到。",
    removeNote: "删除记录",
    mate: (m) => `${m} 在同一份文件中。记录和结论由评审组共享，只有 1 至 5 级是私密的。`,
    mateLive: (m) =>
      `${m} 刚在同一份文件中写了内容。记录和结论由评审组共享，只有 1 至 5 级是私密的。`,
    levelHint: (m) =>
      `在你和 ${m} 都提交之前，等级只有你自己看得到，以免互相影响。结论和结果一起写。`,
    sample: "示例",
    sampleRubric: "示例评分表",
    otherPh: "例如：建议通过，因为讲课条理清晰。",
    verdictTitle: "试讲结论",
    verdictHint: (m) => `与 ${m} 共同决定。未决定的在淘汰前的全体会议上讨论。`,
    baChips: ["没带名牌", "迟到但在宽限内", "投影仪故障，已停表", "时间用完，已停止"],
    baPh: "本轮中的特殊情况。没有则留空。",
    chkNotes: (n) => `${n} 条观察记录。`,
    chkNoNotes: "还没有观察记录。可以提交，但全体会议没有依据。",
    chkRows: (n) => `全部 ${n} 个评分行已完整。`,
    chkTimeOver: (a, m) => `本轮超出 ${m} 分钟 ${a}。请记在“时间使用”下。`,
    chkTimeOk: "试讲时间在限度内。",
    sentBody: (v, s, d) =>
      `结果 ${v}，你的表格得分 ${s}/100。试讲淘汰开始${d ? `（${d}）` : ""}之前仍可修改。`,
    panel: "评审组",
    sentWord: "已提交",
    notYet: "未提交",
    allSent: "所有面试官都已提交。每位面试官的等级显示在下方。",
    hiddenUntil: (m) => `在 ${m} 提交之前，其他面试官的等级保持隐藏。`,
    rubricRow: "评分行",
    nextTurn: "下一位",
    nextBtn: "下一位",
    turnTo: "至",
    withdrawn: "你的表格已撤回。其他面试官看到的是未提交。",
    caseSusulan: (n) => `${n} 获得试讲补考机会`,
    caseConfirm:
      "最终状态在 Akademik 于排表页确认后才生效，之后候选人会在自己的页面看到补考邀请。在此之前不会通知候选人。",
  },
});
