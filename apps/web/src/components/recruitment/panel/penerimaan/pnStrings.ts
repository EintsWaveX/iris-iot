/**
 * Words for Penerimaan, Jadikan Asisten and closing the edition. Plain wording;
 * no em or en dashes.
 */
import type { Lang } from "../../../../lib/kelas";

export interface PnWords {
  tab: string;
  title: string;
  lede: string;
  steps: [string, string, string];
  readOnly: string;
  empty: string;
  emptyHint: string;
  quota: (n: number, q: number) => string;
  review: {
    cols: {
      name: string;
      berkas: string;
      tes: string;
      wawancara: string;
      mengajar: string;
      decision: string;
    };
    accept: string;
    reject: string;
    all: string;
    inCount: (n: number, total: number) => string;
    verdict: Record<"lolos" | "ragu" | "cut", string>;
    next: string;
    promoted: string;
  };
  code: {
    lede: string;
    col: string;
    propose: string;
    problem: Record<"kosong" | "format" | "ganda" | "dipakai", string>;
    ok: string;
    fix: (n: number) => string;
    saveFail: string;
    saved: string;
    back: string;
    next: string;
    placeholder: string;
    rule: string;
  };
  confirm: {
    title: string;
    summary: (inN: number, outN: number) => string;
    list: string;
    noDivision: string;
    history: string;
    twice: string;
    audit: string;
    envelope: (d: string) => string;
    hold: string;
    holdHint: string;
    notKetua: string;
    blocked: (n: number) => string;
    back: string;
  };
  result: {
    title: string;
    created: (n: number) => string;
    already: string;
    nothing: string;
    rejected: (n: number) => string;
    codeAndNim: (code: string, nim: string) => string;
    auditLine: string;
    again: string;
    celebrate: string;
  };
  celebrate: {
    title: string;
    sub: (n: number) => string;
    close: string;
  };
  close: {
    title: string;
    open: string;
    closed: string;
    auto: (d: string, n: number) => string;
    noAuto: string;
    keep: (d: string, m: number) => string;
    button: string;
    confirmTitle: string;
    confirmBody: string;
    confirmLabel: string;
    done: string;
    byHand: (d: string) => string;
    banner: string;
  };
  err: Record<string, string>;
}

const ID: PnWords = {
  tab: "Penerimaan",
  title: "Penerimaan",
  lede: "Daftar akhir CaAs yang lolos Mengajar. Ketua memeriksa, memberi kode, lalu menjadikan mereka Asisten.",
  steps: ["Tinjau", "Kode", "Konfirmasi"],
  readOnly: "Hanya Ketua yang bisa mengubah dan mengonfirmasi daftar ini. Kamu melihatnya saja.",
  empty: "Belum ada CaAs di daftar akhir",
  emptyHint: "Daftar terisi begitu Cutting Mengajar dikunci dan ada yang lolos.",
  quota: (n, q) => `${n} diterima, sasaran sekitar ${q}`,
  review: {
    cols: {
      name: "CaAs",
      berkas: "Berkas",
      tes: "Tes Tulis",
      wawancara: "Wawancara",
      mengajar: "Mengajar",
      decision: "Keputusan",
    },
    accept: "Terima",
    reject: "Tidak diterima",
    all: "Semua",
    inCount: (n, t) => `${n} dari ${t} diterima`,
    verdict: { lolos: "Fix Lolos", ragu: "Ragu-ragu", cut: "Fix Cut" },
    next: "Lanjut ke Kode",
    promoted: "Sudah jadi Asisten",
  },
  code: {
    lede: "Tiap Asisten baru punya kode tiga huruf yang unik. Usulan dibuat dari namanya dan bisa kamu ubah sebelum konfirmasi.",
    col: "Kode",
    propose: "Usulan",
    problem: {
      kosong: "Kode belum ada",
      format: "Harus tiga huruf",
      ganda: "Kembar dengan baris lain",
      dipakai: "Sudah dipakai Asisten lain",
    },
    ok: "Semua kode siap",
    fix: (n) => `${n} kode perlu diperbaiki`,
    saveFail: "Kode belum tersimpan.",
    saved: "Kode tersimpan.",
    back: "Kembali",
    next: "Lanjut ke Konfirmasi",
    placeholder: "ABC",
    rule: "Tiga huruf, unik, belum dipakai Asisten mana pun.",
  },
  confirm: {
    title: "Jadikan Asisten",
    summary: (a, b) => `${a} CaAs menjadi Asisten dan ${b} tidak diterima.`,
    list: "Yang menjadi Asisten",
    noDivision: "Mereka belum punya divisi; status aktif.",
    history: "Riwayat Praktikan tetap ada.",
    twice: "Menjalankannya dua kali tidak membuat siapa pun dua kali.",
    audit: "Tercatat di log audit.",
    envelope: (d) => `Amplop akhir terbuka ${d}.`,
    hold: "Tahan untuk Menjadikan Asisten",
    holdHint: "Tahan tombol sampai penuh. Ini membuat akun Asisten dan mengunci amplop akhir.",
    notKetua: "Hanya Ketua yang bisa menekan ini.",
    blocked: (n) => `Perbaiki ${n} kode dulu.`,
    back: "Kembali",
  },
  result: {
    title: "Hasil Jadikan Asisten",
    created: (n) => `${n} Asisten baru dibuat`,
    already: "Sudah jadi Asisten sebelumnya",
    nothing: "Tidak ada yang baru: semuanya sudah dijalankan.",
    rejected: (n) => `${n} CaAs tidak diterima; amplop mereka berisi kabar itu.`,
    codeAndNim: (c, n) => `${c} · ${n}`,
    auditLine: "Tercatat di log audit.",
    again: "Sudah dijalankan",
    celebrate: "Rayakan Lagi",
  },
  celebrate: {
    title: "Selamat datang, Asisten baru!",
    sub: (n) => `${n} orang bergabung dengan IRIS Lab`,
    close: "Tutup",
  },
  close: {
    title: "Tutup Edisi",
    open: "Edisi masih terbuka",
    closed: "Edisi sudah ditutup",
    auto: (d, n) => `Menutup sendiri ${d}, ${n} hari setelah amplop akhir.`,
    noAuto: "Penutupan otomatis dihitung setelah amplop akhir punya waktu buka.",
    keep: (d, m) => `Dokumen dan jawaban disimpan ${m} bulan, sampai ${d}, lalu dihapus.`,
    button: "Tutup Edisi Sekarang",
    confirmTitle: "Tutup edisi ini?",
    confirmBody:
      "Semua tab Panitia menjadi hanya baca dan masa simpan data dimulai. Ini tidak bisa dibatalkan dari sini.",
    confirmLabel: "Tutup Edisi",
    done: "Edisi ditutup.",
    byHand: (d) => `Ditutup oleh Ketua, ${d}.`,
    banner: "Edisi ini sudah ditutup. Semua tab hanya bisa dibaca.",
  },
  err: {
    tanpa_hak: "Hanya Ketua yang bisa melakukan ini.",
    kode_bermasalah: "Ada kode yang belum benar.",
    sudah_dijadikan: "Sebagian sudah dijadikan Asisten dan kodenya terkunci.",
    tanpa_kandidat: "Belum ada CaAs di daftar akhir.",
    sudah_ditutup: "Edisi sudah ditutup.",
    edisi_ditutup: "Edisi sudah ditutup.",
    offline: "Tidak ada sambungan.",
  },
};

const EN: PnWords = {
  tab: "Acceptance",
  title: "Acceptance",
  lede: "The final list of CaAs who passed Teaching. The Ketua reviews it, gives each a code, then makes them Asisten.",
  steps: ["Review", "Codes", "Confirm"],
  readOnly: "Only the Ketua can change and confirm this list. You can read it.",
  empty: "No CaAs on the final list yet",
  emptyHint: "The list fills once Teaching Cutting is locked and someone passed.",
  quota: (n, q) => `${n} accepted, aiming for about ${q}`,
  review: {
    cols: {
      name: "CaAs",
      berkas: "Documents",
      tes: "Written Test",
      wawancara: "Interview",
      mengajar: "Teaching",
      decision: "Decision",
    },
    accept: "Accept",
    reject: "Not accepted",
    all: "All",
    inCount: (n, t) => `${n} of ${t} accepted`,
    verdict: { lolos: "Fix Pass", ragu: "Undecided", cut: "Fix Cut" },
    next: "Go to Codes",
    promoted: "Already an Asisten",
  },
  code: {
    lede: "Every new Asisten gets a unique three letter code. The proposal comes from their name and you can change it before confirming.",
    col: "Code",
    propose: "Proposal",
    problem: {
      kosong: "No code yet",
      format: "Must be three letters",
      ganda: "Same as another row",
      dipakai: "Already held by an Asisten",
    },
    ok: "Every code is ready",
    fix: (n) => `${n} code${n === 1 ? "" : "s"} to fix`,
    saveFail: "The codes were not saved.",
    saved: "Codes saved.",
    back: "Back",
    next: "Go to Confirm",
    placeholder: "ABC",
    rule: "Three letters, unique, not held by any Asisten.",
  },
  confirm: {
    title: "Make Them Asisten",
    summary: (a, b) => `${a} CaAs become Asisten and ${b} are not accepted.`,
    list: "Becoming Asisten",
    noDivision: "They have no division yet; status active.",
    history: "Their Praktikan history stays.",
    twice: "Running it twice creates nobody twice.",
    audit: "It is written to the audit log.",
    envelope: (d) => `The final envelopes open ${d}.`,
    hold: "Hold to Make Them Asisten",
    holdHint:
      "Hold the button until it fills. It creates the Asisten accounts and locks the final envelopes.",
    notKetua: "Only the Ketua can press this.",
    blocked: (n) => `Fix ${n} code${n === 1 ? "" : "s"} first.`,
    back: "Back",
  },
  result: {
    title: "Result of Making Them Asisten",
    created: (n) => `${n} new Asisten created`,
    already: "Already an Asisten before",
    nothing: "Nothing new: it has all been run already.",
    rejected: (n) => `${n} CaAs not accepted; their envelope carries the news.`,
    codeAndNim: (c, n) => `${c} · ${n}`,
    auditLine: "It is written to the audit log.",
    again: "Already run",
    celebrate: "Celebrate Again",
  },
  celebrate: {
    title: "Welcome, new Asisten!",
    sub: (n) => `${n} people join IRIS Lab`,
    close: "Close",
  },
  close: {
    title: "Close the Edition",
    open: "The edition is still open",
    closed: "The edition is closed",
    auto: (d, n) => `It closes by itself on ${d}, ${n} days after the final envelope.`,
    noAuto: "Automatic closing is counted once the final envelope has an open time.",
    keep: (d, m) => `Documents and answers are kept ${m} months, until ${d}, then deleted.`,
    button: "Close the Edition Now",
    confirmTitle: "Close this edition?",
    confirmBody:
      "Every Panitia tab becomes read only and the data retention clock starts. This can't be undone from here.",
    confirmLabel: "Close the Edition",
    done: "Edition closed.",
    byHand: (d) => `Closed by the Ketua, ${d}.`,
    banner: "This edition is closed. Every tab is read only.",
  },
  err: {
    tanpa_hak: "Only the Ketua can do this.",
    kode_bermasalah: "Some codes are not right.",
    sudah_dijadikan: "Some are already Asisten and their codes are locked.",
    tanpa_kandidat: "No CaAs on the final list yet.",
    sudah_ditutup: "The edition is already closed.",
    edisi_ditutup: "The edition is closed.",
    offline: "No connection.",
  },
};

const ZH: PnWords = {
  tab: "录取",
  title: "录取",
  lede: "通过试讲的 CaAs 的最终名单。主席审核、给每人分配代码，然后让他们成为助教。",
  steps: ["审核", "代码", "确认"],
  readOnly: "只有主席可以修改和确认这份名单。你只能查看。",
  empty: "最终名单里还没有 CaAs",
  emptyHint: "试讲淘汰筛选锁定、并且有人通过之后，名单才会出现。",
  quota: (n, q) => `已录取 ${n} 人，目标约 ${q} 人`,
  review: {
    cols: {
      name: "CaAs",
      berkas: "材料",
      tes: "笔试",
      wawancara: "面试",
      mengajar: "试讲",
      decision: "决定",
    },
    accept: "录取",
    reject: "不录取",
    all: "全部",
    inCount: (n, t) => `${t} 人中录取 ${n} 人`,
    verdict: { lolos: "确定通过", ragu: "待定", cut: "确定淘汰" },
    next: "去填代码",
    promoted: "已是助教",
  },
  code: {
    lede: "每位新助教都有一个唯一的三字母代码。建议代码由名字生成，确认之前你可以修改。",
    col: "代码",
    propose: "建议",
    problem: {
      kosong: "还没有代码",
      format: "必须是三个字母",
      ganda: "和另一行重复",
      dipakai: "已被某位助教使用",
    },
    ok: "所有代码都已就绪",
    fix: (n) => `${n} 个代码需要修改`,
    saveFail: "代码没有保存成功。",
    saved: "代码已保存。",
    back: "返回",
    next: "去确认",
    placeholder: "ABC",
    rule: "三个字母，唯一，没有被任何助教使用。",
  },
  confirm: {
    title: "让他们成为助教",
    summary: (a, b) => `${a} 位 CaAs 成为助教，${b} 位未被录取。`,
    list: "将成为助教的人",
    noDivision: "他们还没有分部；状态为在职。",
    history: "他们的实验课学员记录会保留。",
    twice: "运行两次不会重复创建任何人。",
    audit: "会写入审计日志。",
    envelope: (d) => `最终信封在 ${d} 开启。`,
    hold: "长按以让他们成为助教",
    holdHint: "按住按钮直到填满。这会创建助教账号并锁定最终信封。",
    notKetua: "只有主席可以按这个按钮。",
    blocked: (n) => `请先修改 ${n} 个代码。`,
    back: "返回",
  },
  result: {
    title: "成为助教的结果",
    created: (n) => `已创建 ${n} 位新助教`,
    already: "之前已经是助教",
    nothing: "没有新的内容：全部都已经运行过了。",
    rejected: (n) => `${n} 位 CaAs 未被录取；他们的信封里会告知这个消息。`,
    codeAndNim: (c, n) => `${c} · ${n}`,
    auditLine: "已写入审计日志。",
    again: "已运行",
    celebrate: "再庆祝一次",
  },
  celebrate: {
    title: "欢迎新助教！",
    sub: (n) => `${n} 人加入 IRIS 实验室`,
    close: "关闭",
  },
  close: {
    title: "关闭本届",
    open: "本届仍然开放",
    closed: "本届已关闭",
    auto: (d, n) => `将在最终信封发出 ${n} 天后，即 ${d} 自动关闭。`,
    noAuto: "最终信封有了开启时间之后，才会计算自动关闭。",
    keep: (d, m) => `文件和答案保存 ${m} 个月，到 ${d} 为止，之后删除。`,
    button: "立即关闭本届",
    confirmTitle: "关闭这一届？",
    confirmBody: "委员会的所有标签都会变成只读，数据保存期限开始计算。这里无法撤销。",
    confirmLabel: "关闭本届",
    done: "本届已关闭。",
    byHand: (d) => `由主席于 ${d} 关闭。`,
    banner: "本届已关闭。所有标签都是只读。",
  },
  err: {
    tanpa_hak: "只有主席可以这样做。",
    kode_bermasalah: "有些代码不对。",
    sudah_dijadikan: "有些人已经是助教，他们的代码已锁定。",
    tanpa_kandidat: "最终名单里还没有 CaAs。",
    sudah_ditutup: "本届已经关闭。",
    edisi_ditutup: "本届已关闭。",
    offline: "没有网络连接。",
  },
};

export const PNW = (lang: Lang): PnWords => (lang === "id" ? ID : lang === "zh" ? ZH : EN);
