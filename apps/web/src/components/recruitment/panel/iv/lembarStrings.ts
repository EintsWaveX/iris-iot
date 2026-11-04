/** The words of the interview sheet as the mockup writes them (r4-lembar): header, cards, steps, sent view, foot. */
import { dict } from "../../../../lib/app";

interface LmWords {
  title: { wawancara: string; mengajar: string; tubes: string };
  sub: (d: string, a: string, b: string) => string;
  eyebrow: (booth: number, room: string, a: string, b: string, stage: string) => string;
  pairTip: string;
  here: (t: string) => string;
  files: string;
  filesOf: (n: string) => string;
  filesHint: string;
  filesNone: string;
  fileOpened: (n: string) => string;
  recOn: string;
  recOff: string;
  recTip: string;
  clockOf: (m: string) => string;
  clockTip: (a: string, b: string) => string;
  clock: string;
  start: string;
  stepsAria: string;
  steps: [string, string, string];
  notYet: string;
  ofN: (a: number, b: number) => string;
  rail: string;
  mine: string;
  planned: (a: number, b: number) => string;
  own: string;
  ownAria: string;
  ownAdd: string;
  ownAdded: string;
  qEyebrow: (i: number, n: number, g: string) => string;
  special: string;
  en: string;
  about: (m: number) => string;
  shownBecause: (c: string) => string;
  cond: { fm: string; lab: string };
  revealBtn: string;
  revealTotal: string;
  revealRank: string;
  revealOf: (n: number) => string;
  revealHint: string;
  answer: string;
  answerPh: string;
  skippedPh: string;
  mate: (m: string) => string;
  mateLive: (m: string) => string;
  levelHint: (m: string) => string;
  myLevel: string;
  sharedConcl: string;
  other: string;
  otherPh: string;
  verdictTitle: string;
  verdictHint: (m: string) => string;
  ba: string;
  baChips: string[];
  baPh: string;
  caseBtn: string;
  before: string;
  chkQ: (n: number) => string;
  chkAll: string;
  chkConcl: (n: number) => string;
  chkConclOk: string;
  chkVerdict: (v: string) => string;
  chkNoVerdict: string;
  chkRecOn: string;
  chkRecOff: string;
  sentTitle: (n: string) => string;
  sentBody: (v: string, s: number, stage: string, date: string | null) => string;
  vidEyebrow: string;
  vidTitle: string;
  vidBody: string;
  vidClass: string;
  no: string;
  yes: string;
  vidDeadline: string;
  vidPlus: string;
  vidAdjust: string;
  vidTell: string;
  vidDone: string;
  vidToast: (t: string, n: string) => string;
  vidBa: (t: string) => string;
  nextEyebrow: string;
  nextBooth: string;
  withLabel: string;
  editSheet: string;
  backSlots: string;
  saved: (t: string) => string;
  sentAt: (t: string) => string;
  empty: string;
  offline: string;
  skip: string;
  unskip: string;
  prev: string;
  next: string;
  toConcl: string;
  toVerdict: string;
  back: string;
  send: string;
  sendLeft: (n: number) => string;
  saveChanges: string;
  changesSaved: string;
  withdraw: string;
  withdrawn: (m: string) => string;
  close: string;
  mySheet: string;
  caseGugur: (n: string) => string;
  caseSusulan: (n: string) => string;
  caseConfirm: string;
  caseUndo: string;
  caseNoted: string;
  labToggle: string;
}

export const LM = dict<LmWords>({
  id: {
    title: {
      wawancara: "Lembar Wawancara",
      mengajar: "Lembar Mengajar",
      tubes: "Lembar Presentasi",
    },
    sub: (d, a, b) => `${d} · ${a} sampai ${b} WIB`,
    eyebrow: (n, r, a, b, st) =>
      `${st === "wawancara" ? `Bilik ${n} · ` : ""}${r} · ${a} sampai ${b}`,
    pairTip: "Kode Pewawancara",
    here: (t) => `Hadir ${t}`,
    files: "Berkas",
    filesOf: (n) => `Berkas ${n}`,
    filesHint: "Kalau ada yang kurang, tanyakan di akhir wawancara.",
    filesNone: "CaAs ini belum punya berkas.",
    fileOpened: (n) => `${n} dibuka di tab baru.`,
    recOn: "Merekam",
    recOff: "Rekaman mati",
    recTip: "Merekam suara wajib. Kalau rekamannya hilang, catatan jawaban harus lengkap.",
    clockOf: (m) => `dari ${m}`,
    clockTip: (a, b) => `Rencana ${a}. Maksimal ${b}.`,
    clock: "Lama wawancara",
    start: "Mulai Wawancara",
    stepsAria: "Langkah lembar",
    steps: ["Pertanyaan", "Kesimpulan", "Keputusan"],
    notYet: "belum",
    ofN: (a, b) => `${a} dari ${b}`,
    rail: "Daftar pertanyaan",
    mine: "Kartuku",
    planned: (a, b) => `${a} dari ${b} menit rencana`,
    own: "Tambah pertanyaanku sendiri",
    ownAria: "Pertanyaan tambahan",
    ownAdd: "Tambah kartu",
    ownAdded: "Kartu ditambahkan. Hanya kamu yang melihatnya, dan template tidak berubah.",
    qEyebrow: (i, n, g) => `Pertanyaan ${i} dari ${n} · ${g}`,
    special: "Khusus",
    en: "EN",
    about: (m) => `sekitar ${m} menit`,
    shownBecause: (c) =>
      `Muncul karena: ${c}. Datanya dari kehadiran First Meet dan data pendaftaran.`,
    cond: { fm: "tidak ikut atau telat First Meet", lab: "mendaftar lab lain" },
    revealBtn: "Tampilkan Nilai Sebenarnya",
    revealTotal: "Total Tes Tulis dan Program",
    revealRank: "Peringkat",
    revealOf: (n) => `dari ${n}`,
    revealHint:
      "Hanya kartu ini yang menampilkan nilai, supaya wawancaranya tidak terpengaruh di bagian lain.",
    answer: "Jawaban CaAs (catat selengkap mungkin)",
    answerPh: "Ketik di sini. Tersimpan sendiri dan terbaca oleh pewawancara satunya.",
    skippedPh: "Kartu ini dilewati.",
    mate: (m) => `${m} mengisi dokumen yang sama. Jawaban dan kesimpulan dibagi berdua.`,
    mateLive: (m) =>
      `${m} baru saja menulis di dokumen yang sama. Jawaban dan kesimpulan dibagi berdua.`,
    levelHint: (m) =>
      `Tingkat 1 sampai 5 hanya terlihat olehmu sampai ${m} dan kamu sama-sama mengirim, supaya tidak saling memengaruhi. Kesimpulan dan keputusan ditulis berdua.`,
    myLevel: "Tingkatmu (privat)",
    sharedConcl: "Kesimpulan bersama",
    other: "Kesimpulan Lainnya",
    otherPh:
      "Contoh: direkomendasikan lolos karena hasil wawancaranya menjanjikan di kelima parameter.",
    verdictTitle: "Kesimpulan Wawancara",
    verdictHint: (m) =>
      `Diputuskan berdua dengan ${m}. Ragu-ragu dibahas di Pleno sebelum Cutting.`,
    ba: "Berita Acara",
    baChips: [
      "Tidak membawa nametag",
      "Terlambat dalam toleransi",
      "Rekaman suara tidak ada, catatan sudah lengkap",
      "Berkas ada yang kurang, sudah ditanyakan",
    ],
    baPh: "Kejadian khusus selama wawancara. Kosongkan bila tidak ada.",
    caseBtn: "Catat Kasus Khusus",
    before: "Sebelum Mengirim",
    chkQ: (n) =>
      `${n} pertanyaan belum dicatat. Boleh dikirim, tetapi Pleno akan melihat kosongnya.`,
    chkAll: "Semua pertanyaan dicatat atau dilewati.",
    chkConcl: (n) => `${n} isian di Kesimpulan masih kosong.`,
    chkConclOk: "Semua parameter lengkap.",
    chkVerdict: (v) => `Keputusan: ${v}.`,
    chkNoVerdict: "Keputusan belum dipilih.",
    chkRecOn: "Rekaman suara berjalan.",
    chkRecOff: "Rekaman suara mati. Pastikan catatan jawaban lengkap.",
    sentTitle: (n) => `Lembar ${n} terkirim`,
    sentBody: (v, s) =>
      `Keputusan ${v}, skor lembarmu ${s} dari 100. Bisa diubah sampai Cutting dimulai.`,
    vidEyebrow: "Satu langkah lagi untuk CaAs",
    vidTitle: "Video komitmen",
    vidBody:
      "Minta CaAs membuat video komitmen (landscape): nama lengkap, NIM, kelas, jurusan, pernyataan komitmen, dan nazar. Tanyakan dulu jadwalnya setelah ini sebelum memberi tenggat.",
    vidClass: "Ada kelas setelah ini?",
    no: "Tidak",
    yes: "Ya",
    vidDeadline: "Tenggat",
    vidPlus: "1 jam setelah wawancara selesai",
    vidAdjust: "Sesuaikan dengan kelasnya",
    vidTell: "Catat Tenggat",
    vidDone: "Tercatat",
    vidToast: (t, n) => `Tenggat ${t} WIB dicatat di berita acara. Sampaikan ke ${n}.`,
    vidBa: (t) => `Video komitmen: tenggat ${t} WIB.`,
    nextEyebrow: "Slotmu berikutnya",
    nextBooth: "bilik",
    withLabel: "bersama",
    editSheet: "Ubah Lembar Tadi",
    backSlots: "Kembali ke Slotku",
    saved: (t) => `Draf tersimpan ${t}`,
    sentAt: (t) => `Terkirim ${t}`,
    empty: "Belum diisi",
    offline: "Sinyal putus. Draf aman di laptop ini.",
    skip: "Lewati",
    unskip: "Jangan Lewati",
    prev: "Sebelumnya",
    next: "Berikutnya",
    toConcl: "Ke Kesimpulan",
    toVerdict: "Ke Keputusan",
    back: "Kembali",
    send: "Kirim Lembar",
    sendLeft: (n) => `Kirim Lembar · ${n} lagi`,
    saveChanges: "Simpan Perubahan",
    changesSaved: "Perubahan lembar tersimpan.",
    withdraw: "Tarik Lembar",
    withdrawn: (m) => `Lembarmu ditarik. ${m} melihat Belum.`,
    close: "Tutup",
    mySheet: "Lembarmu",
    caseGugur: (n) => `${n} dicatat Gugur (menunggu konfirmasi)`,
    caseSusulan: (n) => `${n} ditawari Susulan Wawancara`,
    caseConfirm:
      "Status akhirnya baru berlaku setelah PJ Wawancara mengonfirmasi. Sampai saat itu, CaAs belum diberi tahu.",
    caseUndo: "Batalkan Catatan",
    caseNoted: "Dicatat di berita acara.",
    labToggle: "CaAs ini mendaftar lab lain",
  },
  en: {
    title: {
      wawancara: "Interview Sheet",
      mengajar: "Teaching Sheet",
      tubes: "Presentation Sheet",
    },
    sub: (d, a, b) => `${d} · ${a} to ${b} WIB`,
    eyebrow: (n, r, a, b, st) => `${st === "wawancara" ? `Booth ${n} · ` : ""}${r} · ${a} to ${b}`,
    pairTip: "Interviewer code",
    here: (t) => `Here ${t}`,
    files: "Files",
    filesOf: (n) => `${n}'s files`,
    filesHint: "If something is missing, ask at the end of the interview.",
    filesNone: "This CaAs has no files yet.",
    fileOpened: (n) => `${n} opened in a new tab.`,
    recOn: "Recording",
    recOff: "Not recording",
    recTip:
      "Voice recording is required. If the recording is lost, the written answers must be complete.",
    clockOf: (m) => `of ${m}`,
    clockTip: (a, b) => `Planned ${a}. Maximum ${b}.`,
    clock: "Interview time",
    start: "Start Interview",
    stepsAria: "Sheet steps",
    steps: ["Questions", "Conclusions", "Verdict"],
    notYet: "not yet",
    ofN: (a, b) => `${a} of ${b}`,
    rail: "Question list",
    mine: "My cards",
    planned: (a, b) => `${a} of ${b} planned minutes`,
    own: "Add a question of my own",
    ownAria: "Extra question",
    ownAdd: "Add card",
    ownAdded: "Card added. Only you see it, and the template is unchanged.",
    qEyebrow: (i, n, g) => `Question ${i} of ${n} · ${g}`,
    special: "Special",
    en: "EN",
    about: (m) => `about ${m} minutes`,
    shownBecause: (c) =>
      `Shown because: ${c}. From First Meet attendance and the application form.`,
    cond: { fm: "missed or late for First Meet", lab: "applying to another lab" },
    revealBtn: "Show the Real Scores",
    revealTotal: "Written and Coding Test total",
    revealRank: "Rank",
    revealOf: (n) => `of ${n}`,
    revealHint: "Only this card shows scores, so the rest of the interview isn't swayed.",
    answer: "The CaAs's answer (note as fully as you can)",
    answerPh: "Type here. It saves itself and your partner can read it.",
    skippedPh: "This card is skipped.",
    mate: (m) => `${m} is in the same document. Answers and conclusions are shared.`,
    mateLive: (m) => `${m} just wrote in the same document. Answers and conclusions are shared.`,
    levelHint: (m) =>
      `Levels stay hidden from ${m} until you both send, so you don't sway each other. Conclusions and the verdict are written together.`,
    myLevel: "Your level (private)",
    sharedConcl: "Shared conclusion",
    other: "Other Conclusions",
    otherPh:
      "E.g. recommended to pass because the interview looks promising across the five parameters.",
    verdictTitle: "Interview Verdict",
    verdictHint: (m) => `Decided together with ${m}. Undecided goes to the Pleno before Cutting.`,
    ba: "Incident report (Berita Acara)",
    baChips: [
      "No name tag",
      "Late, within the grace period",
      "No recording, notes are complete",
      "A file was missing, asked about it",
    ],
    baPh: "Anything unusual during the interview. Leave empty if nothing.",
    caseBtn: "Record a Special Case",
    before: "Before You Send",
    chkQ: (n) => `${n} questions are not noted. You may send, but the Pleno will see the gaps.`,
    chkAll: "Every question is noted or skipped.",
    chkConcl: (n) => `${n} fields in Conclusions are still empty.`,
    chkConclOk: "All five parameters are complete.",
    chkVerdict: (v) => `Verdict: ${v}.`,
    chkNoVerdict: "No verdict yet.",
    chkRecOn: "Voice recording is on.",
    chkRecOff: "Recording is off. Make sure the answers are fully noted.",
    sentTitle: (n) => `${n}'s sheet is sent`,
    sentBody: (v, s) =>
      `Verdict ${v}, your sheet scores ${s} of 100. You can change it until Cutting starts.`,
    vidEyebrow: "One more step for the CaAs",
    vidTitle: "Commitment video",
    vidBody:
      "Ask the CaAs to make the commitment video (landscape): full name, NIM, class, major, the commitment statement and the vow. Ask about their schedule first, before giving a deadline.",
    vidClass: "Any class after this?",
    no: "No",
    yes: "Yes",
    vidDeadline: "Deadline",
    vidPlus: "1 hour after the interview ends",
    vidAdjust: "Adjust around their class",
    vidTell: "Note the Deadline",
    vidDone: "Noted",
    vidToast: (t, n) => `The ${t} WIB deadline is noted in the berita acara. Tell ${n}.`,
    vidBa: (t) => `Commitment video: deadline ${t} WIB.`,
    nextEyebrow: "Your next slot",
    nextBooth: "booth",
    withLabel: "with",
    editSheet: "Edit That Sheet",
    backSlots: "Back to My Slots",
    saved: (t) => `Draft saved ${t}`,
    sentAt: (t) => `Sent ${t}`,
    empty: "Nothing filled in",
    offline: "No signal. The draft is safe on this laptop.",
    skip: "Skip",
    unskip: "Don't Skip",
    prev: "Back",
    next: "Next",
    toConcl: "To Conclusions",
    toVerdict: "To the Verdict",
    back: "Back",
    send: "Send Sheet",
    sendLeft: (n) => `Send Sheet · ${n} to go`,
    saveChanges: "Save Changes",
    changesSaved: "Sheet changes saved.",
    withdraw: "Withdraw Sheet",
    withdrawn: (m) => `Your sheet was withdrawn. ${m} sees Not yet.`,
    close: "Close",
    mySheet: "Your sheet",
    caseGugur: (n) => `${n} noted as Gugur (awaiting confirmation)`,
    caseSusulan: (n) => `${n} is offered the Interview makeup`,
    caseConfirm:
      "The final status only applies once PJ Wawancara confirms. Until then the CaAs isn't told.",
    caseUndo: "Undo the Record",
    caseNoted: "Noted in the berita acara.",
    labToggle: "This CaAs applied to another lab",
  },
  zh: {
    title: { wawancara: "面试表格", mengajar: "试讲表格", tubes: "展示表格" },
    sub: (d, a, b) => `${d} · ${a} 至 ${b} WIB`,
    eyebrow: (n, r, a, b, st) => `${st === "wawancara" ? `第 ${n} 间 · ` : ""}${r} · ${a} 至 ${b}`,
    pairTip: "面试官代码",
    here: (t) => `已到 ${t}`,
    files: "文件",
    filesOf: (n) => `${n} 的文件`,
    filesHint: "如有缺少，请在面试结束时询问。",
    filesNone: "这位 CaAs 还没有文件。",
    fileOpened: (n) => `${n} 已在新标签页打开。`,
    recOn: "录音中",
    recOff: "未录音",
    recTip: "必须录音。若录音丢失，书面记录必须完整。",
    clockOf: (m) => `共 ${m}`,
    clockTip: (a, b) => `计划 ${a}。硬性上限 ${b}。`,
    clock: "面试时长",
    start: "开始面试",
    stepsAria: "表格步骤",
    steps: ["问题", "结论", "结果"],
    notYet: "未填",
    ofN: (a, b) => `${a} / ${b}`,
    rail: "问题列表",
    mine: "我的卡片",
    planned: (a, b) => `计划 ${b} 分钟，已用 ${a}`,
    own: "添加我自己的问题",
    ownAria: "额外问题",
    ownAdd: "添加卡片",
    ownAdded: "卡片已添加。只有你看得到，模板不变。",
    qEyebrow: (i, n, g) => `第 ${i} 题，共 ${n} 题 · ${g}`,
    special: "特殊",
    en: "EN",
    about: (m) => `约 ${m} 分钟`,
    shownBecause: (c) => `显示原因：${c}。数据来自 First Meet 出席和报名资料。`,
    cond: { fm: "缺席或迟到 First Meet", lab: "报名其他实验室" },
    revealBtn: "显示真实分数",
    revealTotal: "笔试与编程总分",
    revealRank: "排名",
    revealOf: (n) => `共 ${n}`,
    revealHint: "只有这张卡片显示分数，以免影响面试的其他部分。",
    answer: "CaAs 的回答（尽量完整记录）",
    answerPh: "在这里输入。自动保存，搭档也能看到。",
    skippedPh: "这张卡片已跳过。",
    mate: (m) => `${m} 在同一份文件中。回答和结论由两人共享。`,
    mateLive: (m) => `${m} 刚在同一份文件中写了内容。回答和结论由两人共享。`,
    levelHint: (m) =>
      `在你和 ${m} 都提交之前，等级只有你自己看得到，以免互相影响。结论和结果由两人一起写。`,
    myLevel: "你的等级（私密）",
    sharedConcl: "共同结论",
    other: "其他结论",
    otherPh: "例如：建议通过，因为五个参数的面试表现都很有希望。",
    verdictTitle: "面试结论",
    verdictHint: (m) => `与 ${m} 共同决定。未决定的在淘汰前的全体会议上讨论。`,
    ba: "会议记录",
    baChips: ["没带名牌", "迟到但在宽限内", "没有录音，记录已完整", "缺少文件，已询问"],
    baPh: "面试期间的特殊情况。没有则留空。",
    caseBtn: "记录特殊情况",
    before: "提交之前",
    chkQ: (n) => `有 ${n} 个问题未记录。可以提交，但全体会议会看到空白。`,
    chkAll: "所有问题都已记录或跳过。",
    chkConcl: (n) => `结论中还有 ${n} 项为空。`,
    chkConclOk: "五个参数都已完整。",
    chkVerdict: (v) => `结果：${v}。`,
    chkNoVerdict: "还没选择结果。",
    chkRecOn: "正在录音。",
    chkRecOff: "未录音。请确保回答记录完整。",
    sentTitle: (n) => `${n} 的表格已提交`,
    sentBody: (v, s, st, d) =>
      `结果 ${v}，你的表格得分 ${s}/100。${st}淘汰开始${d ? `（${d}）` : ""}之前仍可修改。`,
    vidEyebrow: "给 CaAs 的最后一步",
    vidTitle: "承诺视频",
    vidBody:
      "请 CaAs 录制承诺视频（横屏）：全名、NIM、班级、专业、承诺声明和誓言。先问清他们之后的安排，再给截止时间。",
    vidClass: "之后有课吗？",
    no: "没有",
    yes: "有",
    vidDeadline: "截止时间",
    vidPlus: "面试结束后 1 小时",
    vidAdjust: "根据他们的课程调整",
    vidTell: "记录截止时间",
    vidDone: "已记录",
    vidToast: (t, n) => `截止时间 ${t} WIB 已记入会议记录。请告知 ${n}。`,
    vidBa: (t) => `承诺视频：截止 ${t} WIB。`,
    nextEyebrow: "你的下一场",
    nextBooth: "第",
    withLabel: "搭档",
    editSheet: "修改刚才的表格",
    backSlots: "返回我的场次",
    saved: (t) => `草稿已保存 ${t}`,
    sentAt: (t) => `已提交 ${t}`,
    empty: "尚未填写",
    offline: "没有信号。草稿安全保存在这台电脑上。",
    skip: "跳过",
    unskip: "不跳过",
    prev: "上一题",
    next: "下一题",
    toConcl: "前往结论",
    toVerdict: "前往结果",
    back: "返回",
    send: "提交表格",
    sendLeft: (n) => `提交表格 · 还差 ${n} 项`,
    saveChanges: "保存修改",
    changesSaved: "表格修改已保存。",
    withdraw: "撤回表格",
    withdrawn: (m) => `你的表格已撤回。${m} 看到的是未提交。`,
    close: "关闭",
    mySheet: "你的表格",
    caseGugur: (n) => `${n} 已记为淘汰（等待确认）`,
    caseSusulan: (n) => `${n} 获得面试补考机会`,
    caseConfirm: "最终状态在 PJ Wawancara 确认后才生效。在此之前不会通知 CaAs。",
    caseUndo: "撤销记录",
    caseNoted: "已记入会议记录。",
    labToggle: "这位 CaAs 报名了其他实验室",
  },
});
