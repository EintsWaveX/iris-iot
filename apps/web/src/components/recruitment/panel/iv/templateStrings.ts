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
  };
  newQ: string;
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
    wide: { name: "Tandai selisih penguji mulai", hint: "poin dari 100" },
    hide: {
      name: "Sembunyikan tingkat antar penguji",
      hint: "Tingkat tiap penguji tersembunyi sampai semua lembar terkirim.",
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
        `Satu shift ${a} dan paling lama ${b}. Kartu khusus hanya muncul untuk CaAs yang tidak ikut atau telat First Meet, atau mendaftar lab lain.`,
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
    },
    newQ: "Pertanyaan baru",
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
    wide: { name: "Flag a gap between examiners from", hint: "points out of 100" },
    hide: {
      name: "Hide levels between examiners",
      hint: "Each examiner's levels stay hidden until every sheet is sent.",
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
        `A shift is ${a}, ${b} at most. Special cards only show for CaAs who missed or were late to First Meet, or applied to another lab.`,
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
    },
    newQ: "New question",
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
    wide: { name: "标记面试官分歧起点", hint: "分，满分 100" },
    hide: { name: "隐藏面试官之间的等级", hint: "在所有表格提交之前，每位面试官的等级保持隐藏。" },
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
        `一场为 ${a}，最长 ${b}。特殊卡片只对缺席或迟到 First Meet、或报名其他实验室的 CaAs 显示。`,
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
    },
    newQ: "新问题",
    newParam: "新参数",
    newInd: "第一个指标",
    dur: (m) => {
      const h = Math.floor(m / 60);
      const r = Math.round(m % 60);
      return h ? `${h} 小时${r ? ` ${r} 分钟` : ""}` : `${r} 分钟`;
    },
  },
});
