/** The words of Penilaian and Lembarku (mockup r4-nilai): the tally, the table, the Rincian, Rata-Rata per Penguji. */
import { dict } from "../../../../lib/app";

interface PnWords {
  tabMine: string;
  /** What differs per stage: the tally sentence, the absent label, the last sort tab, the context column */
  stage: Record<
    "mengajar" | "tubes",
    { hint: string; absent: string; sortLast: string; ctx: string | null; ctxTip: string }
  >;
  sample: string;
  sampleTip: string;
  topLine: (date: string, time: string, stage: string) => string;
  cuttingOf: { wawancara: string; mengajar: string; tubes: string };
  tally: {
    sheetsIn: string;
    wide: (n: number) => string;
    ragu: string;
    waiting: string;
    absent: string;
    hint: string;
  };
  search: string;
  searchAria: string;
  filterLabel: string;
  filters: {
    all: string;
    wide: (n: number) => string;
    ragu: (n: number) => string;
    waiting: (n: number) => string;
    absent: (n: number) => string;
  };
  sortLabel: string;
  sorts: { rata: string; sebar: string; slot: string };
  count: (a: number, b: number) => string;
  xlsx: string;
  empty: string;
  cols: {
    cand: string;
    sheets: string;
    mean: string;
    spread: string;
    gap: string;
    verdict: string;
    tes: string;
    details: string;
  };
  absentBadge: string;
  absentShort: string;
  oneSheet: string;
  notYet: string;
  detailsOf: (n: string) => string;
  hideDetails: string;
  dotsAria: (who: string, mean: string) => string;
  chipTip: (who: string, at: string) => string;
  bd: {
    param: string;
    gap: string;
    concl: string;
    total: string;
    worst: (p: string) => string;
  };
  per: { title: string; hint: (avg: string) => string; tip: (who: string, n: number) => string };
  mine: {
    title: string;
    body: string;
    cols: { cand: string; slot: string; sheet: string; verdict: string; partner: string };
    sent: (who: string) => string;
    none: string;
    empty: string;
  };
}

export const PN = dict<PnWords>({
  id: {
    tabMine: "Lembarku",
    stage: {
      mengajar: {
        hint: "Satu kandidat, satu panel, satu dokumen. Skor tiap lembar dari 100, dari tingkat 1 sampai 5 di tiap baris rubrik. Nilai Mengajar kandidat adalah rata-rata lembarnya; Cutting membacanya bersama Wawancara dan Tubes.",
        absent: "tidak hadir, Susulan",
        sortLast: "Giliran",
        ctx: "Wawancara · Tubes",
        ctxTip: "Rata-rata Wawancara dan nilai Tubes, hanya konteks",
      },
      tubes: {
        hint: "Satu kandidat, satu pasang penguji, satu dokumen. Skor tiap lembar dari 100, dari tingkat 1 sampai 5 di tiap baris rubrik (usulan). Nilai Presentasi kandidat adalah rata-rata lembarnya; Cutting membacanya bersama kelengkapan pengumpulan dan kehadiran.",
        absent: "tidak hadir, ditawari Susulan",
        sortLast: "Nama",
        ctx: null,
        ctxTip: "",
      },
    },
    sample: "Rubrik Contoh",
    sampleTip:
      "Baris rubrik dan tingkat 1 sampai 5 masih contoh. Akademik menetapkannya di tab Template.",
    topLine: (d, t, s) => `${d} pukul ${t}. Lembar masih bisa diubah sampai Cutting ${s} dimulai.`,
    cuttingOf: { wawancara: "Wawancara", mengajar: "Mengajar", tubes: "Tubes" },
    tally: {
      sheetsIn: "lembar masuk",
      wide: (n) => `selisih ${n} poin atau lebih`,
      ragu: "Ragu-ragu",
      waiting: "menunggu lembar",
      absent: "tidak hadir, ditawari Susulan",
      hint: "Satu CaAs, satu pasangan pewawancara, satu dokumen. Skor tiap lembar dari 100, dari tingkat 1 sampai 5 di kelima parameter (usulan). Nilai Wawancara kandidat adalah rata-rata lembarnya; Cutting membacanya bersama total Tes Tulis.",
    },
    search: "Cari nama",
    searchAria: "Cari kandidat",
    filterLabel: "Saring",
    filters: {
      all: "Semua kandidat",
      wide: (n) => `Selisih besar (${n})`,
      ragu: (n) => `Ragu-ragu (${n})`,
      waiting: (n) => `Menunggu lembar (${n})`,
      absent: (n) => `Tidak hadir (${n})`,
    },
    sortLabel: "Urutkan",
    sorts: { rata: "Rata-Rata", sebar: "Selisih", slot: "Slot" },
    count: (a, b) => `${a} dari ${b}`,
    xlsx: "Download XLSX",
    empty: "Belum ada kandidat yang cocok.",
    cols: {
      cand: "Kandidat",
      sheets: "Lembar per penguji",
      mean: "Rata rata",
      spread: "Sebaran, 0 sampai 100",
      gap: "Selisih",
      verdict: "Keputusan",
      tes: "Tes Tulis",
      details: "Rincian",
    },
    absentBadge: "Tidak hadir, ditawari Susulan",
    absentShort: "Tidak hadir",
    oneSheet: "1 lembar",
    notYet: "belum",
    detailsOf: (n) => `Rincian ${n}`,
    hideDetails: "Tutup rincian",
    dotsAria: (w, m) => `Skor ${w}, rata-rata ${m}`,
    chipTip: (w, a) => (a ? `${w} · ${a}` : w),
    bd: {
      param: "Parameter",
      gap: "Selisih",
      concl: "Kesimpulan bersama",
      total: "Skor lembar",
      worst: (p) =>
        `Paling berbeda di ${p}. Bahas di Pleno sebelum Cutting kalau selisihnya besar.`,
    },
    per: {
      title: "Rata-Rata per Penguji",
      hint: (a) =>
        `Dibanding rata-rata semua lembar, ${a}. Penguji yang jauh di atas atau di bawah garis ini menilai lebih longgar atau lebih ketat.`,
      tip: (w, n) => `${w} · ${n} lembar`,
    },
    mine: {
      title: "Kamu melihat lembarmu sendiri",
      body: "Rata rata, sebaran, dan tingkat pewawancara lain terbuka untuk Ketua, Akademik dan Admin. Panitia lain melihat rata-ratanya di Cutting.",
      cols: {
        cand: "Kandidat",
        slot: "Slot",
        sheet: "Lembarmu",
        verdict: "Keputusan",
        partner: "Pewawancara lain",
      },
      sent: (w) => `${w} sudah mengirim, tingkatnya tersembunyi`,
      none: "Belum ada",
      empty: "Belum ada lembar yang kamu kirim.",
    },
  },
  en: {
    tabMine: "My Sheets",
    stage: {
      mengajar: {
        hint: "One candidate, one panel, one document. Each sheet scores out of 100 from the 1 to 5 levels on each rubric row. A candidate's Teaching score is the average of their sheets; Cutting reads it beside the Interview and Tubes.",
        absent: "absent, makeup",
        sortLast: "Turn",
        ctx: "Interview · Tubes",
        ctxTip: "Interview average and Project score, for context only",
      },
      tubes: {
        hint: "One candidate, one pair of examiners, one document. Each sheet scores out of 100 from the 1 to 5 levels on each rubric row (a proposal). A candidate's Presentation score is the average of their sheets; Cutting reads it beside completeness of submission and attendance.",
        absent: "absent, offered the makeup",
        sortLast: "Name",
        ctx: null,
        ctxTip: "",
      },
    },
    sample: "Sample Rubric",
    sampleTip:
      "The rubric rows and the 1 to 5 levels are still samples. The Akademik sets them in the Template tab.",
    topLine: (d, t, s) => `${d} at ${t}. Sheets can still change until the ${s} Cutting starts.`,
    cuttingOf: { wawancara: "Interview", mengajar: "Teaching", tubes: "Tubes" },
    tally: {
      sheetsIn: "sheets in",
      wide: (n) => `${n} points apart or more`,
      ragu: "Undecided",
      waiting: "waiting for a sheet",
      absent: "absent, offered the makeup",
      hint: "One CaAs, one pair of interviewers, one document. Each sheet scores out of 100 from the 1 to 5 levels on the five parameters (a proposal). A candidate's Interview score is the average of their sheets; Cutting reads it beside the Written Test total.",
    },
    search: "Search name",
    searchAria: "Search candidates",
    filterLabel: "Filter",
    filters: {
      all: "Every candidate",
      wide: (n) => `Wide gap (${n})`,
      ragu: (n) => `Undecided (${n})`,
      waiting: (n) => `Waiting for a sheet (${n})`,
      absent: (n) => `Absent (${n})`,
    },
    sortLabel: "Sort",
    sorts: { rata: "Average", sebar: "Gap", slot: "Slot" },
    count: (a, b) => `${a} of ${b}`,
    xlsx: "Download XLSX",
    empty: "No candidate matches yet.",
    cols: {
      cand: "Candidate",
      sheets: "Sheets per examiner",
      mean: "Average",
      spread: "Spread, 0 to 100",
      gap: "Gap",
      verdict: "Verdict",
      tes: "Written Test",
      details: "Details",
    },
    absentBadge: "Absent, offered the makeup",
    absentShort: "Absent",
    oneSheet: "1 sheet",
    notYet: "not yet",
    detailsOf: (n) => `${n}'s details`,
    hideDetails: "Hide details",
    dotsAria: (w, m) => `Scores ${w}, average ${m}`,
    chipTip: (w, a) => (a ? `${w} · ${a}` : w),
    bd: {
      param: "Parameter",
      gap: "Gap",
      concl: "Shared conclusion",
      total: "Sheet score",
      worst: (p) =>
        `Furthest apart on ${p}. Talk it through at the Pleno before Cutting if the gap is wide.`,
    },
    per: {
      title: "Average per Examiner",
      hint: (a) =>
        `Against the average of every sheet, ${a}. Examiners far above or below this line grade looser or stricter.`,
      tip: (w, n) => `${w} · ${n} sheets`,
    },
    mine: {
      title: "You see your own sheets",
      body: "Averages, spreads and other interviewers' levels are open to the Ketua, Akademik and Admin. Other Panitia see the averages in the Cutting.",
      cols: {
        cand: "Candidate",
        slot: "Slot",
        sheet: "Your sheet",
        verdict: "Verdict",
        partner: "Your partner",
      },
      sent: (w) => `${w} sent, levels hidden`,
      none: "None yet",
      empty: "You have not sent a sheet yet.",
    },
  },
  zh: {
    tabMine: "我的表格",
    stage: {
      mengajar: {
        hint: "一位候选人、一个评审组、一份文件。每份表格满分 100，由每个评分行的 1 至 5 级算出。候选人的试讲成绩是其各份表格的平均分；Cutting 会连同面试与 Tubes 一起读取。",
        absent: "缺席，补考",
        sortLast: "场次",
        ctx: "面试 · Tubes",
        ctxTip: "面试平均分与 Tubes 分数，仅供参考",
      },
      tubes: {
        hint: "一位候选人、一对考官、一份文件。每份表格满分 100，由每个评分行的 1 至 5 级（建议）算出。候选人的展示成绩是其各份表格的平均分；Cutting 会连同提交完整度和出席一起读取。",
        absent: "缺席，已提供补考",
        sortLast: "姓名",
        ctx: null,
        ctxTip: "",
      },
    },
    sample: "示例评分表",
    sampleTip: "评分行和 1 至 5 级仍是示例。Akademik 在“模板”页确定它们。",
    topLine: (d, t, s) => `${d} ${t}。在${s}淘汰开始之前，表格仍可修改。`,
    cuttingOf: { wawancara: "面试", mengajar: "试讲", tubes: "Tubes" },
    tally: {
      sheetsIn: "已提交表格",
      wide: (n) => `相差 ${n} 分或以上`,
      ragu: "未决定",
      waiting: "等待表格",
      absent: "缺席，已提供补考",
      hint: "一位 CaAs、一组面试官、一份文件。每份表格满分 100，由五个参数的 1 至 5 级（建议）算出。候选人的面试成绩是其各份表格的平均分；Cutting 会连同笔试总分一起读取。",
    },
    search: "搜索姓名",
    searchAria: "搜索候选人",
    filterLabel: "筛选",
    filters: {
      all: "所有候选人",
      wide: (n) => `差距大 (${n})`,
      ragu: (n) => `未决定 (${n})`,
      waiting: (n) => `等待表格 (${n})`,
      absent: (n) => `缺席 (${n})`,
    },
    sortLabel: "排序",
    sorts: { rata: "平均", sebar: "差距", slot: "场次" },
    count: (a, b) => `${a} / ${b}`,
    xlsx: "下载 XLSX",
    empty: "暂无符合的候选人。",
    cols: {
      cand: "候选人",
      sheets: "各面试官的表格",
      mean: "平均",
      spread: "分布，0 至 100",
      gap: "差距",
      verdict: "结论",
      tes: "笔试",
      details: "详情",
    },
    absentBadge: "缺席，已提供补考",
    absentShort: "缺席",
    oneSheet: "1 份表格",
    notYet: "未提交",
    detailsOf: (n) => `${n} 的详情`,
    hideDetails: "收起详情",
    dotsAria: (w, m) => `分数 ${w}，平均 ${m}`,
    chipTip: (w, a) => (a ? `${w} · ${a}` : w),
    bd: {
      param: "参数",
      gap: "差距",
      concl: "共同结论",
      total: "表格得分",
      worst: (p) => `分歧最大的是${p}。差距大时，请在淘汰前的全体会议上讨论。`,
    },
    per: {
      title: "每位面试官的平均分",
      hint: (a) => `对比所有表格的平均分 ${a}。远高于或远低于此线的面试官评分更宽松或更严格。`,
      tip: (w, n) => `${w} · ${n} 份表格`,
    },
    mine: {
      title: "你只能看到自己的表格",
      body: "平均分、分布和其他面试官的等级只对 Ketua、Akademik 和 Admin 开放。其他委员可在 Cutting 中看到平均分。",
      cols: {
        cand: "候选人",
        slot: "场次",
        sheet: "你的表格",
        verdict: "结论",
        partner: "搭档",
      },
      sent: (w) => `${w} 已提交，等级已隐藏`,
      none: "暂无",
      empty: "你还没有提交表格。",
    },
  },
});
