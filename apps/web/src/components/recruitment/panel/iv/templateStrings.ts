/** The words of the question template tab (mockup r4-template): the cards, the parameters, the rules. */
import { dict } from "../../../../lib/app";

interface TpWords {
  top: string;
  rubric: {
    top: string;
    title: string;
    hint: string;
    confirm: string;
    confirmed: string;
    add: string;
    sample: string;
    weight: string;
    newRow: string;
  };
  download: string;
  addQuestion: string;
  docTitle: (stage: string) => string;
  docParams: string;
  docQuestions: string;
  docMinutes: (n: number) => string;
  docParam: string;
  params: {
    title: string;
    hint: string;
    add: string;
    name: string;
    ind: string;
    del: string;
    one: string;
  };
  removedParam: string;
  removedQuestion: string;
  removedGroup: string;
  undo: string;
  rules: { title: string; hint: string };
  late: { name: string; hint: string };
  excuse: { name: string; hint: string };
  makeupDays: { name: string; hint: string };
  makeupHour: { name: string; hint: string };
  limits: { title: string; hint: string };
  cutLolos: { name: string; hint: string };
  cutRagu: { name: string; hint: string };
  wide: { name: string; hint: string };
  hide: { name: string; hint: string };
  minutes: { name: string; hint: string };
  maxMinutes: { name: string; hint: string };
  gap: { name: string; hint: string };
  crewPer: { booth: string; panel: string };
  crewHint: string;
  pjOut: string;
  pjIn: string;
  weight: { name: string; hint: string };
  eg: { name: string; hint: string };
  sum: {
    cards: string;
    planned: string;
    special: string;
    hint: (min: string, max: string) => string;
  };
  other: string;
  up: string;
  down: string;
  edit: string;
  q: {
    text: string;
    hint: string;
    hintPh: string;
    minutes: string;
    param: string;
    group: string;
    shown: string;
    all: string;
    fm: string;
    lab: string;
    del: string;
    special: string;
    reveal: string;
  };
  groups: {
    title: string;
    hint: string;
    add: string;
    name: string;
    cards: (n: number) => string;
    del: string;
    inUse: string;
    full: string;
  };
  newGroup: string;
  newQ: string;
  /** The interview workbook's additions (22 Nov 2026) */
  wb: {
    prio: string;
    prios: { wajib: string; penting: string; lewat: string };
    noPrio: string;
    a24: string;
    te: string;
    weights: {
      title: string;
      intro: string;
      share: (pct: number) => string;
    };
    sumLeft: string;
    sumPrio: (w: string, p: string, l: string) => string;
    outdated: string;
    floor: { name: string; hint: string };
    flag: { title: string; hint: string; on: string; keys: string; max: string };
    many: { name: string; hint: string };
    jago: { name: string; hint: string };
    tags: {
      title: string;
      hint: string;
      red: string;
      plus: string;
      add: string;
      del: string;
      label: string;
    };
  };
  newParam: string;
  newInd: string;
  dur: (min: number) => string;
}

export const TP = dict<TpWords>({
  id: {
    top: "Pewawancara memakai daftar ini di lembar mereka. Mereka boleh menambah kartu sendiri, yang tidak mengubah template dan hanya terlihat olehnya.",
    download: "Download Template",
    addQuestion: "Tambah Pertanyaan",
    rubric: {
      top: "Penguji memakai ini di lembar mereka. Perubahan muncul di lembar berikutnya yang dibuka; lembar yang sudah terkirim tidak berubah.",
      title: "Baris Rubrik",
      hint: "Tiap baris punya kesimpulan bersama dan tingkat 1 sampai 5 di lembar. Barisnya masih contoh sampai kamu mengubah atau menetapkannya.",
      confirm: "Tetapkan Rubrik",
      confirmed: "Rubrik ditetapkan. Tanda Contoh hilang dari lembar.",
      add: "Tambah Baris",
      sample: "Contoh",
      weight: "Bobot",
      newRow: "Baris baru",
    },
    docTitle: (s) => `Template Pertanyaan ${s}`,
    docParams: "Parameter Penilaian",
    docQuestions: "Daftar Pertanyaan",
    docMinutes: (n) => `${n} menit`,
    docParam: "Parameter",
    params: {
      title: "Parameter Penilaian",
      hint: "Tiap parameter punya kesimpulan bersama dan tingkat 1 sampai 5 di lembar. Yang tampil di sini mengikuti template acuan; ubah sesuai kebutuhan.",
      add: "Tambah Parameter",
      name: "Nama",
      ind: "Indikator, pisahkan dengan koma",
      del: "Hapus",
      one: "Paling sedikit satu parameter",
    },
    removedParam: "Parameter dihapus dari template. Lembar yang sudah terkirim tidak berubah.",
    removedGroup: "Bagian dihapus dari template.",
    removedQuestion: "Pertanyaan dihapus dari template.",
    undo: "Urungkan",
    rules: {
      title: "Aturan Terlambat dan Susulan",
      hint: "Dipakai oleh Kasus Khusus di lembar. Perubahan muncul di lembar berikutnya yang dibuka.",
    },
    late: { name: "Toleransi terlambat", hint: "menit, tanpa tambahan waktu (bawaan 10)" },
    excuse: { name: "Izin paling lambat", hint: "menit sebelum sesi dimulai" },
    makeupDays: { name: "Jawab Susulan paling lambat", hint: "hari sebelum hari Susulan" },
    makeupHour: { name: "Jam batas jawab Susulan", hint: "WIB, 0 sampai 23" },
    limits: {
      title: "Batas Keputusan dan Waktu",
      hint: "Nilai rata-rata di atas batas ini menjadi usulan Fix Lolos atau Ragu-ragu. Perubahan dicatat.",
    },
    cutLolos: { name: "Fix Lolos mulai", hint: "rata-rata dari 100" },
    cutRagu: { name: "Ragu-ragu mulai", hint: "rata-rata dari 100" },
    wide: {
      name: "Tandai bila nilai dua penguji beda jauh",
      hint: "Selisih skor dua penguji, dari 100. Segini atau lebih, barisnya ditandai selisih besar dan masuk filter Selisih.",
    },
    hide: {
      name: "Sembunyikan nilai teman sampai semua kirim",
      hint: "Nyala: pewawancara tidak bisa melihat tingkat nilai pasangannya sebelum semua lembar terkirim, supaya tidak saling terpengaruh.",
    },
    minutes: { name: "Menit per sesi", hint: "rencana satu sesi" },
    maxMinutes: { name: "Batas maksimal", hint: "menit, sesi dihentikan" },
    gap: { name: "Jeda antar giliran", hint: "menit" },
    crewPer: { booth: "Pewawancara per CaAs", panel: "Penguji per ruang" },
    crewHint: "Juga diatur di tab Plotting.",
    pjOut: "PJ luar ruangan",
    pjIn: "PJ dalam ruangan",
    weight: { name: "Bobot", hint: "makin besar, makin berpengaruh ke skor" },
    eg: { name: "Contoh kesimpulan", hint: "tampil sebagai petunjuk di lembar" },
    sum: {
      cards: "kartu",
      planned: "menit rencana, tanpa kartu khusus",
      special: "kartu khusus",
      hint: (a, b) =>
        `Satu shift ${a} dan paling lama ${b}. Kartu khusus hanya muncul untuk CaAs yang tidak ikut atau telat First Meet, mendaftar lab lain, angkatan 24 yang mengambil mata kuliah IoT, atau Elektro yang mengambil praktikum IoT.`,
    },
    other: "Lainnya",
    up: "Naikkan",
    down: "Turunkan",
    edit: "Ubah",
    q: {
      text: "Pertanyaan",
      hint: "Petunjuk untuk pewawancara",
      hintPh: "Boleh kosong",
      minutes: "Menit",
      param: "Parameter",
      group: "Kelompok",
      shown: "Muncul untuk",
      all: "Semua CaAs",
      fm: "Tidak ikut atau telat First Meet",
      lab: "Mendaftar lab lain",
      del: "Hapus",
      special: "Khusus",
      reveal: "Tampilkan nilai tes asli di kartu ini",
    },
    groups: {
      title: "Bagian",
      hint: "Bagian mengelompokkan kartu di lembar pewawancara. Menggeser bagian ikut menggeser kartunya. Bagian baru bisa dipakai lewat menu Kelompok di tiap kartu.",
      add: "Tambah Bagian",
      name: "Nama bagian",
      cards: (n) => `${n} kartu`,
      del: "Hapus",
      inUse: "Pindahkan dulu kartunya ke bagian lain.",
      full: "Jumlah bagian sudah maksimal.",
    },
    newGroup: "Bagian baru",
    newQ: "Pertanyaan baru",
    wb: {
      prio: "Prioritas",
      prios: { wajib: "Wajib", penting: "Penting", lewat: "Bisa dilewati" },
      noPrio: "Tanpa prioritas",
      a24: "Angkatan 24 yang mengambil mata kuliah IoT",
      te: "Teknik Elektro yang mengambil praktikum IoT",
      weights: {
        title: "Bobot dan contoh kesimpulan",
        intro:
          "Bobot: seberapa besar parameter ini mempengaruhi skor (makin besar, makin berpengaruh). Contoh kesimpulan: kalimat abu-abu di kotak kesimpulan lembar sebagai petunjuk cara menulis. Hanya contoh, tidak tersimpan sebagai jawaban.",
        share: (pct) => `${pct}% dari skor`,
      },
      sumLeft: "menit sisa dari satu shift",
      sumPrio: (w, p, l) =>
        `Menit per prioritas: Wajib ${w}, Penting ${p}, Bisa dilewati ${l}. Kalau waktu mepet, potong yang Bisa dilewati dulu, baru Penting.`,
      outdated:
        "Template yang tersimpan lebih lama dari bawaan terbaru (bobot, red flag, prioritas kartu, catatan khusus). Tekan Kembalikan Bawaan untuk memakai yang terbaru; perubahanmu yang sekarang akan hilang.",
      floor: {
        name: "Skor dihitung dari nol",
        hint: "Nyala: skor = bobot × level ÷ level tertinggi, jadi level 1 dari 5 bernilai 20. Mati: level terendah bernilai 0.",
      },
      flag: {
        title: "Red flag",
        hint: "Kalau salah satu penguji menilai parameter ini rendah, hasil Fix Lolos ditahan di Ragu-ragu supaya dibahas panitia dulu.",
        on: "Pakai red flag",
        keys: "Parameter yang dicek",
        max: "Dianggap rendah bila level sama dengan atau di bawah",
      },
      many: {
        name: "Banyak masalah mulai",
        hint: "Jumlah catatan merah yang membuat label Banyak masalah.",
      },
      jago: {
        name: "Jago mulai",
        hint: "Jumlah nilai plus yang membuat label Jago, bila tidak ada catatan merah.",
      },
      tags: {
        title: "Catatan khusus",
        hint: "Daftar centang yang diisi panitia untuk tiap CaAs. Label Jago, Perlu perhatian, Banyak masalah atau Standar muncul dari jumlah centang.",
        red: "Catatan merah",
        plus: "Nilai plus",
        add: "Tambah",
        del: "Hapus",
        label: "Nama",
      },
    },
    newParam: "Parameter baru",
    newInd: "Indikator pertama",
    dur: (m) => {
      const h = Math.floor(m / 60);
      const r = Math.round(m % 60);
      return h ? `${h} jam${r ? ` ${r} menit` : ""}` : `${r} menit`;
    },
  },
  en: {
    top: "Interviewers use this list in their sheet. They may add cards of their own, which don't change the template and only they see.",
    download: "Download Template",
    addQuestion: "Add Question",
    rubric: {
      top: "Examiners use this in their sheet. A change shows on the next sheet that opens; sheets already sent don't change.",
      title: "Rubric Rows",
      hint: "Each row gets a shared conclusion and a 1 to 5 level on the sheet. The rows are samples until you change or confirm them.",
      confirm: "Confirm Rubric",
      confirmed: "Rubric confirmed. The Sample tag leaves the sheets.",
      add: "Add Row",
      sample: "Sample",
      weight: "Weight",
      newRow: "New row",
    },
    docTitle: (s) => `${s} Question Template`,
    docParams: "Scoring Parameters",
    docQuestions: "Questions",
    docMinutes: (n) => `${n} minutes`,
    docParam: "Parameter",
    params: {
      title: "Scoring Parameters",
      hint: "Each parameter gets a shared conclusion and a 1 to 5 level on the sheet. What shows here follows the reference template; change it to what you need.",
      add: "Add Parameter",
      name: "Name",
      ind: "Indicators, separated by commas",
      del: "Delete",
      one: "At least one parameter",
    },
    removedParam: "Parameter removed from the template. Sheets already sent don't change.",
    removedGroup: "Section removed from the template.",
    removedQuestion: "Question removed from the template.",
    undo: "Undo",
    rules: {
      title: "Late and Makeup Rules",
      hint: "Used by Special Case on the sheet. A change shows on the next sheet that opens.",
    },
    late: { name: "Late grace period", hint: "minutes, with no extra time (10 by default)" },
    excuse: { name: "Excuse deadline", hint: "minutes before the session starts" },
    makeupDays: { name: "Answer the makeup by", hint: "days before the makeup day" },
    makeupHour: { name: "Makeup answer hour", hint: "WIB, 0 to 23" },
    limits: {
      title: "Verdict Limits and Time",
      hint: "An average above these limits becomes a suggested Fix Lolos or Undecided. Changes are logged.",
    },
    cutLolos: { name: "Fix Lolos from", hint: "average out of 100" },
    cutRagu: { name: "Undecided from", hint: "average out of 100" },
    wide: {
      name: "Flag when the two examiners' scores are far apart",
      hint: "The gap between the two examiners' scores, out of 100. At this gap or more, the row is marked as a big gap and shows under the Gap filter.",
    },
    hide: {
      name: "Hide a partner's levels until everyone has sent",
      hint: "On: an examiner cannot see their partner's levels before all sheets are sent, so neither is swayed.",
    },
    minutes: { name: "Minutes per session", hint: "plan for one session" },
    maxMinutes: { name: "Maximum time", hint: "minutes, the session is stopped" },
    gap: { name: "Changeover between turns", hint: "minutes" },
    crewPer: { booth: "Interviewers per CaAs", panel: "Examiners per room" },
    crewHint: "Also set in the Plotting tab.",
    pjOut: "PJ outside the room",
    pjIn: "PJ inside the room",
    weight: { name: "Weight", hint: "the higher, the more it counts in the score" },
    eg: { name: "Example conclusion", hint: "shown as the hint on the sheet" },
    sum: {
      cards: "cards",
      planned: "planned minutes, without special cards",
      special: "special cards",
      hint: (a, b) =>
        `A shift is ${a}, ${b} at most. Special cards only show for CaAs who missed or were late to First Meet, applied to another lab, are angkatan 24 taking the IoT course, or are Elektro taking the IoT practicum.`,
    },
    other: "Other",
    up: "Move up",
    down: "Move down",
    edit: "Edit",
    q: {
      text: "Question",
      hint: "Hint for the interviewer",
      hintPh: "Can be empty",
      minutes: "Minutes",
      param: "Parameter",
      group: "Group",
      shown: "Shown to",
      all: "Every CaAs",
      fm: "Missed or late for First Meet",
      lab: "Applying to another lab",
      del: "Delete",
      special: "Special",
      reveal: "Show the real test scores on this card",
    },
    groups: {
      title: "Sections",
      hint: "Sections group the cards in the interviewer sheet. Moving a section moves its cards. Use the Group menu on each card to put it in a new section.",
      add: "Add Section",
      name: "Section name",
      cards: (n) => `${n} ${n === 1 ? "card" : "cards"}`,
      del: "Delete",
      inUse: "Move its cards to another section first.",
      full: "The section limit is reached.",
    },
    newGroup: "New section",
    newQ: "New question",
    wb: {
      prio: "Priority",
      prios: { wajib: "Must ask", penting: "Important", lewat: "Can skip" },
      noPrio: "No priority",
      a24: "Angkatan 24 taking the IoT course",
      te: "Teknik Elektro taking the IoT practicum",
      weights: {
        title: "Weight and example conclusion",
        intro:
          "Weight: how much this parameter counts toward the score (bigger counts more). Example conclusion: the grey sentence in the sheet's conclusion box that shows how to write one. It is only a hint and is never saved as an answer.",
        share: (pct) => `${pct}% of the score`,
      },
      sumLeft: "minutes left in a shift",
      sumPrio: (w, p, l) =>
        `Minutes by priority: Must ask ${w}, Important ${p}, Can skip ${l}. When time is short, cut Can skip first, then Important.`,
      outdated:
        "The saved template is older than the latest default (weights, red flag, card priority, special notes). Press Restore Defaults to use the latest; your current changes will be lost.",
      floor: {
        name: "Score counts from zero",
        hint: "On: score = weight × level ÷ top level, so level 1 of 5 is worth 20. Off: the lowest level is worth 0.",
      },
      flag: {
        title: "Red flag",
        hint: "If any examiner rates one of these parameters low, a Fix Pass is held at Undecided so the committee talks about it first.",
        on: "Use a red flag",
        keys: "Parameters checked",
        max: "Counts as low at or below level",
      },
      many: {
        name: "Many problems from",
        hint: "How many red notes make the label Many problems.",
      },
      jago: {
        name: "Standout from",
        hint: "How many plus points make the label Standout, when there is no red note.",
      },
      tags: {
        title: "Special notes",
        hint: "The checklists the committee fills in for each CaAs. The label Standout, Needs attention, Many problems or Standard comes from how many are ticked.",
        red: "Red notes",
        plus: "Plus points",
        add: "Add",
        del: "Delete",
        label: "Name",
      },
    },
    newParam: "New parameter",
    newInd: "First indicator",
    dur: (m) => {
      const h = Math.floor(m / 60);
      const r = Math.round(m % 60);
      return h ? `${h} hour${h > 1 ? "s" : ""}${r ? ` ${r} minutes` : ""}` : `${r} minutes`;
    },
  },
  zh: {
    top: "面试官在表格中使用这份清单。他们可以自己加卡片，这不会改变模板，也只有他们自己看得到。",
    download: "下载模板",
    addQuestion: "添加问题",
    rubric: {
      top: "考官在自己的表格中使用这些内容。修改会在下一份打开的表格中生效；已提交的表格不受影响。",
      title: "评分行",
      hint: "每一行在表格上有共同结论和 1 至 5 级。在你修改或确认之前，这些行都只是示例；没有任何固定内容。",
      confirm: "确认评分表",
      confirmed: "评分表已确认。表格上的示例标记已消失。",
      add: "添加评分行",
      sample: "示例",
      weight: "权重",
      newRow: "新评分行",
    },
    docTitle: (s) => `${s}问题模板`,
    docParams: "评分参数",
    docQuestions: "问题清单",
    docMinutes: (n) => `${n} 分钟`,
    docParam: "参数",
    params: {
      title: "评分参数",
      hint: "每个参数在表格上有共同结论和 1 至 5 级。这里显示的内容沿用参考模板，可按需修改。",
      add: "添加参数",
      name: "名称",
      ind: "指标，用逗号分隔",
      del: "删除",
      one: "至少保留一个参数",
    },
    removedParam: "参数已从模板中删除。已提交的表格不受影响。",
    removedGroup: "环节已从模板中删除。",
    removedQuestion: "问题已从模板中删除。",
    undo: "撤销",
    rules: {
      title: "迟到与补考规则",
      hint: "供表格上的特殊情况使用。修改会在下一份打开的表格中生效。",
    },
    late: { name: "迟到宽限", hint: "分钟，不加时（默认 10）" },
    excuse: { name: "请假截止", hint: "场次开始前的分钟数" },
    makeupDays: { name: "补考最晚回复", hint: "补考日之前的天数" },
    makeupHour: { name: "补考回复截止时间", hint: "WIB，0 至 23" },
    limits: {
      title: "结论界限与时间",
      hint: "平均分高于这些界限时，会建议为 Fix Lolos 或未决定。修改会被记录。",
    },
    cutLolos: { name: "Fix Lolos 起点", hint: "平均分，满分 100" },
    cutRagu: { name: "未决定起点", hint: "平均分，满分 100" },
    wide: {
      name: "两位考官分数相差过大时标记",
      hint: "两位考官分数的差距，满分 100。达到或超过此差距，该行会被标记为差距大，并出现在“差距”筛选中。",
    },
    hide: {
      name: "全部提交前隐藏搭档的等级",
      hint: "开启：所有表格提交之前，考官看不到搭档给的等级，以免互相影响。",
    },
    minutes: { name: "每场分钟数", hint: "一场的计划时间" },
    maxMinutes: { name: "硬性上限", hint: "分钟，到时停止" },
    gap: { name: "轮换间隔", hint: "分钟" },
    crewPer: { booth: "每位 CaAs 的面试官数", panel: "每个房间的考官数" },
    crewHint: "也可在 Plotting 页设置。",
    pjOut: "室外 PJ",
    pjIn: "室内 PJ",
    weight: { name: "权重", hint: "越大，对得分影响越大" },
    eg: { name: "示例结论", hint: "作为提示显示在表格上" },
    sum: {
      cards: "张卡片",
      planned: "计划分钟数（不含特殊卡片）",
      special: "张特殊卡片",
      hint: (a, b) =>
        `一场为 ${a}，最长 ${b}。特殊卡片只对缺席或迟到 First Meet、报名其他实验室、修读物联网课程的 24 届、或修读物联网实验课的电气工程学生显示。`,
    },
    other: "其他",
    up: "上移",
    down: "下移",
    edit: "编辑",
    q: {
      text: "问题",
      hint: "给面试官的提示",
      hintPh: "可留空",
      minutes: "分钟",
      param: "参数",
      group: "分组",
      shown: "显示给",
      all: "所有 CaAs",
      fm: "缺席或迟到 First Meet",
      lab: "报名其他实验室",
      del: "删除",
      special: "特殊",
      reveal: "在此卡片显示真实考试分数",
    },
    groups: {
      title: "环节",
      hint: "环节用于在面试官表格中给卡片分组。移动环节时其卡片一同移动。可通过每张卡片的分组菜单把卡片放入新环节。",
      add: "添加环节",
      name: "环节名称",
      cards: (n) => `${n} 张卡片`,
      del: "删除",
      inUse: "请先把其中的卡片移到其他环节。",
      full: "环节数量已达上限。",
    },
    newGroup: "新环节",
    newQ: "新问题",
    wb: {
      prio: "优先级",
      prios: { wajib: "必问", penting: "重要", lewat: "可跳过" },
      noPrio: "无优先级",
      a24: "修读物联网课程的 24 届学生",
      te: "修读物联网实验课的电气工程学生",
      weights: {
        title: "权重与示例结论",
        intro:
          "权重：该参数对分数的影响有多大（越大影响越大）。示例结论：表格结论框里的灰色提示句，教人怎么写。它只是提示，不会被保存为答案。",
        share: (pct) => `占分数的 ${pct}%`,
      },
      sumLeft: "一场剩余的分钟数",
      sumPrio: (w, p, l) =>
        `按优先级的分钟数：必问 ${w}，重要 ${p}，可跳过 ${l}。时间紧时，先删可跳过的，再删重要的。`,
      outdated:
        "已保存的模板比最新默认版本旧（权重、红旗、卡片优先级、特别备注）。点击恢复默认以使用最新版；你当前的修改会丢失。",
      floor: {
        name: "分数从零算起",
        hint: "开启：分数 = 权重 × 等级 ÷ 最高等级，所以 5 级中的 1 级值 20 分。关闭：最低等级值 0 分。",
      },
      flag: {
        title: "红旗",
        hint: "只要有一位考官给这些参数打低分，确定通过就会被压在犹豫，先由委员会讨论。",
        on: "启用红旗",
        keys: "检查的参数",
        max: "等级小于或等于此值算低",
      },
      many: {
        name: "问题较多的起点",
        hint: "多少条红色备注算“问题较多”。",
      },
      jago: {
        name: "出色的起点",
        hint: "没有红色备注时，多少个加分项算“出色”。",
      },
      tags: {
        title: "特别备注",
        hint: "委员会为每位 CaAs 填写的勾选清单。出色、需要关注、问题较多或标准的标签由勾选数量决定。",
        red: "红色备注",
        plus: "加分项",
        add: "添加",
        del: "删除",
        label: "名称",
      },
    },
    newParam: "新参数",
    newInd: "第一个指标",
    dur: (m) => {
      const h = Math.floor(m / 60);
      const r = Math.round(m % 60);
      return h ? `${h} 小时${r ? ` ${r} 分钟` : ""}` : `${r} 分钟`;
    },
  },
});
