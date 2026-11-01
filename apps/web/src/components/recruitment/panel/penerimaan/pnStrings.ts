/**
 * Words for Penerimaan, Jadikan Asisten and closing the edition. Plain wording;
 * no em or en dashes. Mandarin is added last (the zh view reads the English).
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

export const PNW = (lang: Lang): PnWords => (lang === "id" ? ID : EN);
