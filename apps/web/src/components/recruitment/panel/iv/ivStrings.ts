/**
 * Words for Wawancara and Mengajar (the examiners' tab, the sheet, Penilaian,
 * the template). Plain wording; no em or en dashes. The template's own
 * questions and parameters are Indonesian or English only (the zh view reads
 * the English), since Panitia write them.
 */
import type { Lang } from "../../../../lib/kelas";
import type { Bi, IvStage } from "../../../../lib/recruitment/interview";

export interface IvWords {
  tab: Record<IvStage, string>;
  title: Record<IvStage, string>;
  lede: Record<IvStage, string>;
  seg: { mine: string; nilai: string; template: string; templateWaw: string };
  mine: {
    none: string;
    noneHint: string;
    slotTitle: (room: string) => string;
    when: (d: string, from: string, to: string) => string;
    role: Record<"penguji" | "pj_luar" | "pj_dalam", string>;
    booth: (n: number) => string;
    panel: string;
    with: string;
    here: (t: string) => string;
    notHere: string;
    open: string;
    sentOf: (a: number, b: number) => string;
    mineSent: string;
    otherBooth: string;
    verdict: Record<"lolos" | "ragu" | "cut", string>;
    caseSusulan: string;
    caseGugur: string;
    pjOut: string;
    pjIn: string;
    crew: string;
  };
  sheet: {
    steps: [string, string, string];
    of: (a: number, b: number) => string;
    planned: (a: number, b: number) => string;
    start: string;
    clock: string;
    recOn: string;
    recOff: string;
    recTip: string;
    special: string;
    files: string;
    answer: string;
    answerPh: string;
    skip: string;
    unskip: string;
    prev: string;
    next: string;
    toConcl: string;
    toVerdict: string;
    levels: string;
    levelHint: string;
    concl: string;
    conclPh: (eg: string) => string;
    other: string;
    otherPh: string;
    verdict: string;
    ba: string;
    baPh: string;
    send: string;
    sendAgain: string;
    reopen: string;
    sent: string;
    sentBody: string;
    waitMate: (n: number) => string;
    allSent: string;
    missing: (n: number) => string;
    saved: string;
    saving: string;
    saveFail: string;
    partner: string;
    locked: string;
    labToggle: string;
    revealBtn: string;
    reveal: string;
    group: (g: string) => string;
    questions: string;
    onlyFm: string;
    onlyLab: string;
    mates: string;
    othersHidden: string;
    close: string;
  };
  kasus: {
    title: string;
    desc: (n: string) => string;
    kinds: Record<"telat" | "absen" | "sakit" | "nametag" | "keluar", string>;
    minutes: string;
    why: string;
    lateWhy: Record<"akademik" | "musibah" | "lain", string>;
    excuseWhy: Record<"kuliah" | "rohani" | "sehat" | "malang" | "keluarga" | "tanpa", string>;
    out: Record<
      | "grace"
      | "late_gugur"
      | "late_susulan"
      | "absen_gugur"
      | "absen_susulan"
      | "sakit"
      | "nametag"
      | "keluar",
      string
    >;
    tag: { carry: string; susulan: string; gugur: string };
    record: string;
    recordEnd: string;
    recordGugur: string;
    cancel: string;
  };
  nilai: {
    title: string;
    avg: string;
    cols: {
      name: string;
      sheets: string;
      mean: string;
      spread: string;
      verdict: string;
      suggest: string;
    };
    none: string;
    wide: (n: number) => string;
    pending: (a: number, b: number) => string;
    perPenguji: string;
    cut: (a: number, b: number) => string;
    case: Record<"susulan" | "gugur", string>;
    verdict: Record<"lolos" | "ragu" | "cut", string>;
    open: string;
  };
  tpl: {
    title: string;
    lede: string;
    params: string;
    paramName: string;
    paramNameEn: string;
    eg: string;
    egEn: string;
    weight: string;
    addParam: string;
    removeParam: string;
    example: string;
    exampleTip: string;
    crew: string;
    per: Record<"booth" | "panel", string>;
    pjOut: string;
    pjIn: string;
    minutes: string;
    maxMinutes: string;
    gap: string;
    late: string;
    excuse: string;
    makeupDays: string;
    makeupHour: string;
    cut: string;
    cutLolos: string;
    cutRagu: string;
    wide: string;
    hideLevels: string;
    hideLevelsHint: string;
    questions: string;
    qText: string;
    qTextEn: string;
    qMin: string;
    qParam: string;
    qGroup: string;
    qOnly: string;
    qOnlyNone: string;
    addQuestion: string;
    removeQuestion: string;
    save: string;
    saved: string;
    reset: string;
    resetDone: string;
    readOnly: string;
    invalid: string;
    changed: string;
    stc: string;
  };
  crew: {
    title: string;
    lede: Record<"booth" | "panel", string>;
    examiners: string;
    count: (a: number, b: number) => string;
    empty: string;
    pick: (room: string, t: string) => string;
    pjTitle: string;
    pjLede: string;
    shift: (d: string, from: string, to: string) => string;
    out: string;
    inn: string;
    check: string;
    ready: string;
    clashes: (n: number) => string;
    toFill: (n: number) => string;
    clashEx: (code: string, room: string) => string;
    clashPj: (code: string, room: string) => string;
    short: (n: number, booths: number) => string;
    shortPanel: (n: number) => string;
    none: string;
    over: (n: number, cap: number) => string;
    free: string;
    here: string;
    elsewhere: (room: string) => string;
    slots: (n: number) => string;
    save: string;
    done: string;
    saveFail: string;
  };
  err: Record<string, string>;
}

const ID: IvWords = {
  tab: { wawancara: "Wawancara", mengajar: "Mengajar", tubes: "Presentasi" },
  title: { wawancara: "Wawancara", mengajar: "Tes Mengajar", tubes: "Presentasi Tubes" },
  lede: {
    wawancara: "Slot wawancaramu, lembar penilaian, hasil tiap CaAs, dan template pertanyaan.",
    mengajar:
      "Giliran mengajar yang kamu nilai, lembar penilaian, hasil tiap CaAs, dan template rubrik.",
    tubes:
      "Meja presentasi yang kamu nilai, lembar penilaian, hasil tiap tim, dan template rubrik.",
  },
  seg: {
    mine: "Slotku",
    nilai: "Penilaian",
    template: "Template",
    templateWaw: "Template Pertanyaan",
  },
  mine: {
    none: "Kamu belum dapat slot",
    noneHint:
      "Panitia Akademik mengatur penguji di tab Plotting. Slotmu muncul di sini begitu kamu ditunjuk.",
    slotTitle: (r) => r,
    when: (d, a, b) => `${d}, ${a} sampai ${b} WIB`,
    role: { penguji: "Penguji", pj_luar: "PJ luar ruangan", pj_dalam: "PJ dalam ruangan" },
    booth: (n) => `Bilik ${n}`,
    panel: "Giliran",
    with: "Bersama",
    here: (t) => `Hadir ${t}`,
    notHere: "Belum hadir",
    open: "Buka Lembar",
    sentOf: (a, b) => `${a} dari ${b} lembar terkirim`,
    mineSent: "Lembarmu terkirim",
    otherBooth: "Bilik penguji lain",
    verdict: { lolos: "Fix Lolos", ragu: "Ragu-ragu", cut: "Fix Cut" },
    caseSusulan: "Ditawari Susulan",
    caseGugur: "Gugur",
    pjOut: "PJ luar",
    pjIn: "PJ dalam",
    crew: "Penguji",
  },
  sheet: {
    steps: ["Pertanyaan", "Kesimpulan", "Keputusan"],
    of: (a, b) => `${a} dari ${b}`,
    planned: (a, b) => `${a} dari ${b} menit rencana`,
    start: "Mulai",
    clock: "Lama sesi",
    recOn: "Merekam",
    recOff: "Rekam mati",
    recTip: "Merekam suara wajib. Bila rekaman hilang, catatan jawaban harus lengkap.",
    special: "Kasus Khusus",
    files: "Berkas",
    answer: "Catatan jawaban",
    answerPh: "Tulis garis besar jawabannya",
    skip: "Lewati",
    unskip: "Batal lewati",
    prev: "Sebelumnya",
    next: "Berikutnya",
    toConcl: "Ke Kesimpulan",
    toVerdict: "Ke Keputusan",
    levels: "Tingkat 1 sampai 5",
    levelHint: "Hanya kamu yang melihat tingkatmu sampai semua lembar terkirim.",
    concl: "Kesimpulan",
    conclPh: (eg) => eg,
    other: "Kesimpulan lainnya",
    otherPh: "Hal lain yang perlu dicatat",
    verdict: "Keputusan",
    ba: "Berita acara",
    baPh: "Kejadian penting selama sesi",
    send: "Kirim Lembar",
    sendAgain: "Kirim Perubahan",
    reopen: "Ubah Lembar",
    sent: "Lembar terkirim",
    sentBody: "Tingkatmu tersimpan. Kamu masih bisa mengubahnya sampai Cutting dikunci.",
    waitMate: (n) => `Menunggu ${n} penguji lain`,
    allSent: "Semua lembar sudah masuk",
    missing: (n) => `Masih ada ${n} isian yang kosong`,
    saved: "Tersimpan",
    saving: "Menyimpan",
    saveFail: "Belum tersimpan, mencoba lagi",
    partner: "Pasanganmu baru mengisi",
    locked: "Cutting tahap ini sudah dikunci. Lembar tidak bisa diubah.",
    labToggle: "CaAs ini juga mendaftar lab lain",
    revealBtn: "Lihat nilai asli",
    reveal: "Nilai tes tulis dan koding",
    group: (g) => g,
    questions: "Daftar pertanyaan",
    onlyFm: "khusus",
    onlyLab: "khusus",
    mates: "Pasangan",
    othersHidden: "Tingkat penguji lain muncul setelah semua lembar terkirim.",
    close: "Tutup",
  },
  kasus: {
    title: "Kasus Khusus",
    desc: (n) => `Untuk ${n}. Pilih yang terjadi; aturan bawaan template {s}.`,
    kinds: {
      telat: "Terlambat",
      absen: "Tidak hadir",
      sakit: "Sakit atau harus keluar saat {s}",
      nametag: "Tidak membawa nametag",
      keluar: "Meninggalkan ruangan atau ke kamar mandi",
    },
    minutes: "Terlambat berapa menit?",
    why: "Alasan",
    lateWhy: {
      akademik: "Akademik (kelas molor, dan sebagainya)",
      musibah: "Musibah",
      lain: "Tanpa alasan",
    },
    excuseWhy: {
      kuliah: "Kuliah",
      rohani: "Kerohanian",
      sehat: "Kesehatan",
      malang: "Kemalangan",
      keluarga: "Keluarga",
      tanpa: "Tanpa kabar atau tanpa bukti",
    },
    out: {
      grace: "Masih dalam toleransi. Tidak ada tambahan waktu. Lanjutkan; dicatat di berita acara.",
      late_gugur:
        "Lewat toleransi tanpa alasan musibah atau akademik: dinyatakan GUGUR. PJ luar ruangan mengonfirmasi ke PJ {s} dulu.",
      late_susulan:
        "Lewat toleransi karena musibah atau akademik: bisa ikut Susulan {s}{d}. PJ luar ruangan mengonfirmasi ke PJ {s}.",
      absen_gugur: "Tidak hadir tanpa alasan yang sah: dinyatakan GUGUR. Dikonfirmasi PJ {s} dulu.",
      absen_susulan:
        "Izin dengan bukti: ditawari Susulan {s}{d}. Izin harus masuk sebelum {s} dimulai.",
      sakit:
        "Hentikan {s} dan keluarkan CaAs. Dia ditawari Susulan {s}{d}. Jawaban yang sudah masuk tetap tersimpan.",
      nametag:
        "Tanyakan kenapa tidak membawa nametag dan catat. CaAs wajib menunjukkan KTM atau KTP.",
      keluar:
        "CaAs tidak boleh meninggalkan ruangan. Bila terpaksa, izinkan, tetapi waktunya tidak ditambah.",
    },
    tag: { carry: "Lanjut", susulan: "Susulan", gugur: "Gugur" },
    record: "Catat dan Lanjut",
    recordEnd: "Catat dan Akhiri",
    recordGugur: "Catat Gugur",
    cancel: "Batal",
  },
  nilai: {
    title: "Penilaian",
    avg: "Rata-rata semua CaAs",
    cols: {
      name: "CaAs",
      sheets: "Lembar",
      mean: "Rata-rata",
      spread: "Selisih",
      verdict: "Keputusan",
      suggest: "Saran",
    },
    none: "Belum ada CaAs di slot.",
    wide: (n) => `${n} CaAs dengan selisih penguji besar`,
    pending: (a, b) => `${a} dari ${b}`,
    perPenguji: "Rata-rata tiap penguji",
    cut: (a, b) => `Lolos mulai ${a}, ragu mulai ${b}`,
    case: { susulan: "Susulan", gugur: "Gugur" },
    verdict: { lolos: "Fix Lolos", ragu: "Ragu-ragu", cut: "Fix Cut" },
    open: "Buka",
  },
  tpl: {
    title: "Template",
    lede: "Semua ini nilai bawaan yang bisa diubah Akademik dan Ketua. Perubahan dicatat.",
    params: "Parameter dan tingkat",
    paramName: "Nama (Indonesia)",
    paramNameEn: "Nama (Inggris)",
    eg: "Contoh kesimpulan (Indonesia)",
    egEn: "Contoh kesimpulan (Inggris)",
    weight: "Bobot",
    addParam: "Tambah Parameter",
    removeParam: "Hapus",
    example: "Contoh",
    exampleTip: "Baris contoh sampai Akademik menggantinya.",
    crew: "Susunan",
    per: { booth: "Pewawancara per CaAs", panel: "Penguji per ruang" },
    pjOut: "PJ luar ruangan",
    pjIn: "PJ dalam ruangan",
    minutes: "Menit per sesi",
    maxMinutes: "Batas keras (menit)",
    gap: "Jeda antar giliran (menit)",
    late: "Toleransi terlambat (menit)",
    excuse: "Izin paling lambat (menit sebelum sesi)",
    makeupDays: "Jawab Susulan paling lambat (hari sebelum Susulan)",
    makeupHour: "Jam batas jawab Susulan (WIB)",
    cut: "Batas keputusan",
    cutLolos: "Fix Lolos mulai",
    cutRagu: "Ragu-ragu mulai",
    wide: "Tandai selisih penguji mulai",
    hideLevels: "Sembunyikan tingkat antar penguji",
    hideLevelsHint: "Tingkat tiap penguji tersembunyi sampai semua lembar terkirim.",
    questions: "Kartu pertanyaan",
    qText: "Pertanyaan (Indonesia)",
    qTextEn: "Pertanyaan (Inggris)",
    qMin: "Menit",
    qParam: "Parameter",
    qGroup: "Kelompok",
    qOnly: "Hanya untuk",
    qOnlyNone: "Semua CaAs",
    addQuestion: "Tambah Kartu",
    removeQuestion: "Hapus",
    save: "Simpan Template",
    saved: "Template tersimpan.",
    reset: "Kembalikan Bawaan",
    resetDone: "Template kembali ke bawaan.",
    readOnly: "Hanya Ketua dan Akademik yang bisa mengubah template.",
    invalid: "Ada isian yang belum benar. Periksa nama, bobot, dan angka.",
    changed: "Ada perubahan yang belum disimpan",
    stc: "Bisa berubah",
  },
  crew: {
    title: "Penguji dan PJ",
    lede: {
      booth:
        "Satu CaAs diwawancarai beberapa penguji selama satu shift. Dua chip pertama dengan CaAs pertama, dan seterusnya. Penguji dipilih dari Asisten aktif; mereka hanya melihat slot dan CaAs-nya sendiri.",
      panel:
        "Satu panel duduk sepanjang malam di satu ruang. Penguji dipilih dari Asisten aktif; mereka hanya melihat slot dan CaAs-nya sendiri.",
    },
    examiners: "Penguji",
    count: (a, b) => `${a}/${b}`,
    empty: "kosong",
    pick: (r, t) => `Penguji ${r}, ${t}`,
    pjTitle: "PJ Tiap Shift",
    pjLede: "PJ tidak boleh sekaligus penguji di jam yang sama.",
    shift: (d, a, b) => `${d}, ${a} sampai ${b}`,
    out: "PJ luar ruangan",
    inn: "PJ dalam ruangan",
    check: "Periksa Susunan",
    ready: "Siap",
    clashes: (n) => `${n} bentrok`,
    toFill: (n) => `${n} perlu diisi`,
    clashEx: (c, r) => `${c} juga menguji di ${r} jam ini`,
    clashPj: (c, r) => `${c} PJ sekaligus penguji di ${r}`,
    short: (n, b) => `Kurang ${n} penguji untuk ${b} bilik`,
    shortPanel: (n) => `Kurang ${n} penguji untuk panel`,
    none: "Belum ada penguji",
    over: (n, cap) => `${n} dari ${cap}, melebihi kapasitas`,
    free: "Bebas",
    here: "Menguji slot ini",
    elsewhere: (r) => `Bentrok, sudah di ${r} jam ini`,
    slots: (n) => `${n} slot lain`,
    save: "Simpan",
    done: "Susunan tersimpan.",
    saveFail: "Susunan belum tersimpan.",
  },
  err: {
    tanpa_hak: "Kamu tidak punya hak untuk ini.",
    terkunci: "Cutting tahap ini sudah dikunci.",
    belum_lengkap: "Lembar belum lengkap.",
    data_salah: "Isiannya belum benar.",
    bukan_asisten: "Hanya Asisten yang bisa dipilih.",
    slot_tidak_ada: "Slot tidak ditemukan.",
    offline: "Tidak ada sambungan.",
  },
};

const EN: IvWords = {
  tab: { wawancara: "Interview", mengajar: "Teaching", tubes: "Presentation" },
  title: { wawancara: "Interview", mengajar: "Teaching Test", tubes: "Tubes Presentation" },
  lede: {
    wawancara: "Your interview slots, the sheet, each CaAs's result, and the question template.",
    mengajar:
      "The teaching turns you score, the sheet, each CaAs's result, and the rubric template.",
    tubes:
      "The presentation table you score, the sheet, each team's result, and the rubric template.",
  },
  seg: {
    mine: "My Slots",
    nilai: "Scores",
    template: "Template",
    templateWaw: "Question Template",
  },
  mine: {
    none: "You have no slot yet",
    noneHint:
      "The Akademik Panitia sets the examiners in Plotting. Your slots show here once you are named.",
    slotTitle: (r) => r,
    when: (d, a, b) => `${d}, ${a} to ${b} WIB`,
    role: { penguji: "Examiner", pj_luar: "PJ outside the room", pj_dalam: "PJ inside the room" },
    booth: (n) => `Booth ${n}`,
    panel: "Turn",
    with: "With",
    here: (t) => `Here ${t}`,
    notHere: "Not here yet",
    open: "Open Sheet",
    sentOf: (a, b) => `${a} of ${b} sheets sent`,
    mineSent: "Your sheet is sent",
    otherBooth: "Another examiner's booth",
    verdict: { lolos: "Fix Pass", ragu: "Undecided", cut: "Fix Cut" },
    caseSusulan: "Offered the makeup",
    caseGugur: "Gugur",
    pjOut: "PJ outside",
    pjIn: "PJ inside",
    crew: "Examiners",
  },
  sheet: {
    steps: ["Questions", "Conclusions", "Verdict"],
    of: (a, b) => `${a} of ${b}`,
    planned: (a, b) => `${a} of ${b} planned minutes`,
    start: "Start",
    clock: "Session time",
    recOn: "Recording",
    recOff: "Rec off",
    recTip:
      "Voice recording is required. If the recording is lost, the written answers must be complete.",
    special: "Special Case",
    files: "Files",
    answer: "Answer notes",
    answerPh: "Write the outline of the answer",
    skip: "Skip",
    unskip: "Undo skip",
    prev: "Previous",
    next: "Next",
    toConcl: "To Conclusions",
    toVerdict: "To Verdict",
    levels: "Level 1 to 5",
    levelHint: "Only you see your level until every sheet is sent.",
    concl: "Conclusion",
    conclPh: (eg) => eg,
    other: "Other conclusions",
    otherPh: "Anything else to note",
    verdict: "Verdict",
    ba: "Berita acara",
    baPh: "Notable events during the session",
    send: "Send Sheet",
    sendAgain: "Send Changes",
    reopen: "Edit Sheet",
    sent: "Sheet sent",
    sentBody: "Your levels are saved. You can still change them until Cutting is locked.",
    waitMate: (n) => `Waiting for ${n} other examiner${n === 1 ? "" : "s"}`,
    allSent: "Every sheet is in",
    missing: (n) => `${n} field${n === 1 ? " is" : "s are"} still empty`,
    saved: "Saved",
    saving: "Saving",
    saveFail: "Not saved yet, retrying",
    partner: "Your partner just filled something in",
    locked: "Cutting for this stage is locked. The sheet can't be changed.",
    labToggle: "This CaAs also applied to another lab",
    revealBtn: "Show the real scores",
    reveal: "Written and coding test scores",
    group: (g) => g,
    questions: "Question list",
    onlyFm: "special",
    onlyLab: "special",
    mates: "Pair",
    othersHidden: "The other examiners' levels show once every sheet is sent.",
    close: "Close",
  },
  kasus: {
    title: "Special Case",
    desc: (n) => `For ${n}. Pick what happened; these are the {s} template's default rules.`,
    kinds: {
      telat: "Late",
      absen: "Didn't come",
      sakit: "Ill or has to leave mid-{s}",
      nametag: "No name tag",
      keluar: "Left the room or went to the restroom",
    },
    minutes: "How many minutes late?",
    why: "Reason",
    lateWhy: { akademik: "Class (overran, and so on)", musibah: "Misfortune", lain: "No reason" },
    excuseWhy: {
      kuliah: "Class",
      rohani: "Religious duty",
      sehat: "Health",
      malang: "Misfortune",
      keluarga: "Family",
      tanpa: "No word, or no proof",
    },
    out: {
      grace: "Within the grace. No extra time. Carry on; it goes in the berita acara.",
      late_gugur:
        "Past the grace with no misfortune or class reason: GUGUR. The outside PJ confirms with PJ {s} first.",
      late_susulan:
        "Past the grace for misfortune or class: can sit the {s} makeup{d}. The outside PJ confirms with PJ {s}.",
      absen_gugur: "No valid reason: GUGUR. Confirmed with PJ {s} first.",
      absen_susulan:
        "Excused with proof: offered the {s} makeup{d}. Excuses must come in before the {s} starts.",
      sakit:
        "Stop the {s} and let the CaAs leave. They're offered the {s} makeup{d}. Answers so far stay saved.",
      nametag:
        "Ask why there is no name tag and note it. The CaAs must show a student or national ID.",
      keluar:
        "A CaAs may not leave the room. If it can't wait, allow it, but the time isn't extended.",
    },
    tag: { carry: "Carry on", susulan: "Makeup", gugur: "Gugur" },
    record: "Record and Carry On",
    recordEnd: "Record and End",
    recordGugur: "Record Gugur",
    cancel: "Cancel",
  },
  nilai: {
    title: "Scores",
    avg: "Average of all CaAs",
    cols: {
      name: "CaAs",
      sheets: "Sheets",
      mean: "Average",
      spread: "Spread",
      verdict: "Verdict",
      suggest: "Suggested",
    },
    none: "No CaAs in a slot yet.",
    wide: (n) => `${n} CaAs with a wide examiner spread`,
    pending: (a, b) => `${a} of ${b}`,
    perPenguji: "Average per examiner",
    cut: (a, b) => `Pass from ${a}, undecided from ${b}`,
    case: { susulan: "Makeup", gugur: "Gugur" },
    verdict: { lolos: "Fix Pass", ragu: "Undecided", cut: "Fix Cut" },
    open: "Open",
  },
  tpl: {
    title: "Template",
    lede: "All of this is a default the Akademik and the Ketua can change. Changes are logged.",
    params: "Parameters and levels",
    paramName: "Name (Indonesian)",
    paramNameEn: "Name (English)",
    eg: "Example conclusion (Indonesian)",
    egEn: "Example conclusion (English)",
    weight: "Weight",
    addParam: "Add Parameter",
    removeParam: "Remove",
    example: "Example",
    exampleTip: "An example row until the Akademik replaces it.",
    crew: "Crew",
    per: { booth: "Interviewers per CaAs", panel: "Examiners per room" },
    pjOut: "PJ outside the room",
    pjIn: "PJ inside the room",
    minutes: "Minutes per session",
    maxMinutes: "Hard stop (minutes)",
    gap: "Changeover between turns (minutes)",
    late: "Grace for lateness (minutes)",
    excuse: "Excuse at the latest (minutes before)",
    makeupDays: "Makeup answer due (days before the makeup)",
    makeupHour: "Makeup answer due at (hour, WIB)",
    cut: "Verdict thresholds",
    cutLolos: "Fix Pass from",
    cutRagu: "Undecided from",
    wide: "Flag an examiner spread from",
    hideLevels: "Hide levels between examiners",
    hideLevelsHint: "Each examiner's levels stay hidden until every sheet is sent.",
    questions: "Question cards",
    qText: "Question (Indonesian)",
    qTextEn: "Question (English)",
    qMin: "Minutes",
    qParam: "Parameter",
    qGroup: "Group",
    qOnly: "Only for",
    qOnlyNone: "Every CaAs",
    addQuestion: "Add Card",
    removeQuestion: "Remove",
    save: "Save Template",
    saved: "Template saved.",
    reset: "Restore Defaults",
    resetDone: "Template is back to the defaults.",
    readOnly: "Only the Ketua and the Akademik can change the template.",
    invalid: "Some fields are not right yet. Check names, weights and numbers.",
    changed: "There are unsaved changes",
    stc: "Subject to change",
  },
  crew: {
    title: "Examiners and PJ",
    lede: {
      booth:
        "One CaAs sits with several examiners for a whole shift. The first two chips take the first CaAs, and so on. Examiners come from the active Asisten; they see only their own slots and CaAs.",
      panel:
        "One panel sits all evening in a room. Examiners come from the active Asisten; they see only their own slots and CaAs.",
    },
    examiners: "Examiners",
    count: (a, b) => `${a}/${b}`,
    empty: "empty",
    pick: (r, t) => `Examiners for ${r}, ${t}`,
    pjTitle: "PJ for Each Shift",
    pjLede: "A PJ cannot also examine at the same time.",
    shift: (d, a, b) => `${d}, ${a} to ${b}`,
    out: "PJ outside",
    inn: "PJ inside",
    check: "Crew Check",
    ready: "Ready",
    clashes: (n) => `${n} clashes`,
    toFill: (n) => `${n} to fill`,
    clashEx: (c, r) => `${c} also examines in ${r} at this time`,
    clashPj: (c, r) => `${c} is PJ and an examiner in ${r}`,
    short: (n, b) => `${n} examiner${n === 1 ? "" : "s"} short for ${b} booths`,
    shortPanel: (n) => `${n} examiner${n === 1 ? "" : "s"} short for the panel`,
    none: "No examiner yet",
    over: (n, cap) => `${n} of ${cap}, over capacity`,
    free: "Free",
    here: "Examines this slot",
    elsewhere: (r) => `Clash, already in ${r} at this time`,
    slots: (n) => `${n} other slots`,
    save: "Save",
    done: "Crew saved.",
    saveFail: "The crew was not saved.",
  },
  err: {
    tanpa_hak: "You don't have the right for this.",
    terkunci: "Cutting for this stage is locked.",
    belum_lengkap: "The sheet is not complete.",
    data_salah: "Something in it is not right.",
    bukan_asisten: "Only Asisten can be picked.",
    slot_tidak_ada: "Slot not found.",
    offline: "No connection.",
  },
};

const ZH: IvWords = {
  tab: { wawancara: "面试", mengajar: "试讲", tubes: "答辩" },
  title: { wawancara: "面试", mengajar: "试讲考核", tubes: "Tubes 答辩" },
  lede: {
    wawancara: "你的面试时段、评分表、每位 CaAs 的结果，以及问题模板。",
    mengajar: "你负责评分的试讲场次、评分表、每位 CaAs 的结果，以及评分标准模板。",
    tubes: "你负责评分的答辩桌、评分表、每个小组的结果，以及评分标准模板。",
  },
  seg: { mine: "我的时段", nilai: "成绩", template: "模板", templateWaw: "问题模板" },
  mine: {
    none: "你还没有分到时段",
    noneHint: "学术部委员会在“排程”里安排考官。你被指派后，时段会显示在这里。",
    slotTitle: (r) => r,
    when: (d, a, b) => `${d}，${a} 至 ${b}（WIB）`,
    role: { penguji: "考官", pj_luar: "室外负责人", pj_dalam: "室内负责人" },
    booth: (n) => `${n} 号隔间`,
    panel: "场次",
    with: "同组",
    here: (t) => `已到场 ${t}`,
    notHere: "尚未到场",
    open: "打开评分表",
    sentOf: (a, b) => `已提交 ${a}/${b} 份评分表`,
    mineSent: "你的评分表已提交",
    otherBooth: "其他考官的隔间",
    verdict: { lolos: "确定通过", ragu: "待定", cut: "确定淘汰" },
    caseSusulan: "已获补考邀请",
    caseGugur: "淘汰",
    pjOut: "室外负责人",
    pjIn: "室内负责人",
    crew: "考官",
  },
  sheet: {
    steps: ["问题", "结论", "决定"],
    of: (a, b) => `${a}/${b}`,
    planned: (a, b) => `计划 ${b} 分钟，已用 ${a} 分钟`,
    start: "开始",
    clock: "已用时间",
    recOn: "录音中",
    recOff: "未录音",
    recTip: "必须录音。如果录音丢失，书面回答必须完整。",
    special: "特殊情况",
    files: "文件",
    answer: "回答笔记",
    answerPh: "写下回答的要点",
    skip: "跳过",
    unskip: "撤销跳过",
    prev: "上一个",
    next: "下一个",
    toConcl: "去写结论",
    toVerdict: "去做决定",
    levels: "1 至 5 级",
    levelHint: "所有评分表提交之前，只有你能看到自己的评级。",
    concl: "结论",
    conclPh: (eg) => eg,
    other: "其他结论",
    otherPh: "还有什么要记录的",
    verdict: "决定",
    ba: "会议记录",
    baPh: "考核过程中值得记录的事",
    send: "提交评分表",
    sendAgain: "提交修改",
    reopen: "修改评分表",
    sent: "评分表已提交",
    sentBody: "你的评级已保存。在淘汰筛选锁定之前，你仍然可以修改。",
    waitMate: (n) => `还在等另外 ${n} 位考官`,
    allSent: "所有评分表都已提交",
    missing: (n) => `还有 ${n} 项没填`,
    saved: "已保存",
    saving: "保存中",
    saveFail: "还没保存成功，正在重试",
    partner: "搭档刚刚填写了内容",
    locked: "这个阶段的淘汰筛选已锁定，评分表不能再修改。",
    labToggle: "这位 CaAs 也申请了另一个实验室",
    revealBtn: "显示真实成绩",
    reveal: "笔试和编程测试成绩",
    group: (g) => g,
    questions: "问题列表",
    onlyFm: "特殊",
    onlyLab: "特殊",
    mates: "搭档",
    othersHidden: "所有评分表提交后，才会显示其他考官的评级。",
    close: "关闭",
  },
  kasus: {
    title: "特殊情况",
    desc: (n) => `针对${n}。请选择发生了什么；这些是模板里的默认规则。`,
    kinds: {
      telat: "迟到",
      absen: "没来",
      sakit: "生病或中途要离开",
      nametag: "没戴名牌",
      keluar: "离开房间或去洗手间",
    },
    minutes: "迟到了几分钟？",
    why: "原因",
    lateWhy: { akademik: "上课（拖堂等）", musibah: "意外", lain: "没有理由" },
    excuseWhy: {
      kuliah: "上课",
      rohani: "宗教义务",
      sehat: "健康",
      malang: "意外",
      keluarga: "家事",
      tanpa: "没有通知，或没有证明",
    },
    out: {
      grace: "在宽限时间内。不补时间。继续进行，并记入会议记录。",
      late_gugur: "超过宽限时间，且没有上课或意外的理由：淘汰。室外负责人先与负责人确认。",
      late_susulan: "超过宽限时间，但因上课或意外：可以参加补考。室外负责人与负责人确认。",
      absen_gugur: "没有正当理由：淘汰。先与负责人确认。",
      absen_susulan: "有证明的请假：邀请参加补考。请假必须在考核开始前提出。",
      sakit: "停止考核，让 CaAs 离开。邀请他们参加补考。已填的内容会保留。",
      nametag: "询问为什么没有名牌并记录。CaAs 必须出示学生证或身份证。",
      keluar: "CaAs 不得离开房间。如果实在等不了，可以允许，但不延长时间。",
    },
    tag: { carry: "继续", susulan: "补考", gugur: "淘汰" },
    record: "记录并继续",
    recordEnd: "记录并结束",
    recordGugur: "记录淘汰",
    cancel: "取消",
  },
  nilai: {
    title: "成绩",
    avg: "所有 CaAs 的平均分",
    cols: {
      name: "CaAs",
      sheets: "评分表",
      mean: "平均分",
      spread: "分歧",
      verdict: "决定",
      suggest: "建议",
    },
    none: "还没有 CaAs 分到时段。",
    wide: (n) => `${n} 位 CaAs 的考官分歧较大`,
    pending: (a, b) => `${a}/${b}`,
    perPenguji: "每位考官的平均分",
    cut: (a, b) => `${a} 分起通过，${b} 分起待定`,
    case: { susulan: "补考", gugur: "淘汰" },
    verdict: { lolos: "确定通过", ragu: "待定", cut: "确定淘汰" },
    open: "打开",
  },
  tpl: {
    title: "模板",
    lede: "这些都是默认值，学术部和主席可以修改。修改会被记录。",
    params: "参数和等级",
    paramName: "名称（印尼语）",
    paramNameEn: "名称（英语）",
    eg: "示例结论（印尼语）",
    egEn: "示例结论（英语）",
    weight: "权重",
    addParam: "添加参数",
    removeParam: "删除",
    example: "示例",
    exampleTip: "在学术部替换之前，这一行只是示例。",
    crew: "人员",
    per: { booth: "每位 CaAs 的面试官人数", panel: "每个房间的考官人数" },
    pjOut: "室外负责人",
    pjIn: "室内负责人",
    minutes: "每场分钟数",
    maxMinutes: "硬性截止（分钟）",
    gap: "场次之间的交接时间（分钟）",
    late: "迟到宽限（分钟）",
    excuse: "请假最晚提前（分钟）",
    makeupDays: "补考回复截止（补考前几天）",
    makeupHour: "补考回复截止时间（时，WIB）",
    cut: "决定的分数线",
    cutLolos: "确定通过起点",
    cutRagu: "待定起点",
    wide: "考官分歧提醒起点",
    hideLevels: "考官之间隐藏评级",
    hideLevelsHint: "所有评分表提交之前，每位考官的评级都是隐藏的。",
    questions: "问题卡片",
    qText: "问题（印尼语）",
    qTextEn: "问题（英语）",
    qMin: "分钟",
    qParam: "参数",
    qGroup: "分组",
    qOnly: "仅适用于",
    qOnlyNone: "每位 CaAs",
    addQuestion: "添加卡片",
    removeQuestion: "删除",
    save: "保存模板",
    saved: "模板已保存。",
    reset: "恢复默认",
    resetDone: "模板已恢复为默认值。",
    readOnly: "只有主席和学术部可以修改模板。",
    invalid: "有些内容还不对，请检查名称、权重和数字。",
    changed: "有未保存的修改",
    stc: "可能会变动",
  },
  crew: {
    title: "考官和负责人",
    lede: {
      booth:
        "一位 CaAs 整个时段与几位考官在一起。前两个标签对应第一位 CaAs，依此类推。考官来自在职助教；他们只能看到自己的时段和 CaAs。",
      panel: "一个评审组整晚坐在一个房间里。考官来自在职助教；他们只能看到自己的时段和 CaAs。",
    },
    examiners: "考官",
    count: (a, b) => `${a}/${b}`,
    empty: "空",
    pick: (r, t) => `${r}，${t} 的考官`,
    pjTitle: "每个时段的负责人",
    pjLede: "负责人不能同时担任考官。",
    shift: (d, a, b) => `${d}，${a} 至 ${b}`,
    out: "室外负责人",
    inn: "室内负责人",
    check: "人员检查",
    ready: "已就绪",
    clashes: (n) => `${n} 处冲突`,
    toFill: (n) => `还缺 ${n} 个`,
    clashEx: (c, r) => `${c} 此时还在 ${r} 担任考官`,
    clashPj: (c, r) => `${c} 在 ${r} 既是负责人又是考官`,
    short: (n, b) => `${b} 个隔间还缺 ${n} 位考官`,
    shortPanel: (n) => `评审组还缺 ${n} 位考官`,
    none: "还没有考官",
    over: (n, cap) => `${n}/${cap}，超出名额`,
    free: "空闲",
    here: "在这个时段担任考官",
    elsewhere: (r) => `冲突，此时已在 ${r}`,
    slots: (n) => `另外 ${n} 个时段`,
    save: "保存",
    done: "人员已保存。",
    saveFail: "人员没有保存成功。",
  },
  err: {
    tanpa_hak: "你没有这个权限。",
    terkunci: "这个阶段的淘汰筛选已锁定。",
    belum_lengkap: "评分表还不完整。",
    data_salah: "内容有误。",
    bukan_asisten: "只能选择助教。",
    slot_tidak_ada: "找不到时段。",
    offline: "没有网络连接。",
  },
};

/** Labels of the + and - buttons of a Stepper. */
export const STEP = (lang: Lang) =>
  lang === "id"
    ? { lessLabel: "Kurangi", moreLabel: "Tambah" }
    : lang === "zh"
      ? { lessLabel: "减少", moreLabel: "增加" }
      : { lessLabel: "Decrease", moreLabel: "Increase" };

export const IV = (lang: Lang): IvWords => (lang === "id" ? ID : lang === "zh" ? ZH : EN);

/** The Indonesian or English half of a template text (Mandarin reads English). */
export const bi = (x: Bi, lang: Lang): string => (lang === "id" ? x.id : x.en);

/** The stage word the case texts use ({s}) and the makeup day after it ({d}, with its leading comma). */
export const kasusText = (
  txt: string,
  stage: IvStage,
  lang: Lang,
  makeup: string | null,
): string => {
  const id = { wawancara: "Wawancara", mengajar: "Mengajar", tubes: "Presentasi" }[stage];
  const en = { wawancara: "interview", mengajar: "teaching", tubes: "presentation" }[stage];
  const zh = { wawancara: "面试", mengajar: "试讲", tubes: "展示" }[stage];
  return txt
    .replaceAll("{s}", lang === "id" ? id : lang === "zh" ? zh : en)
    .replaceAll("{d}", makeup ? `, ${makeup}` : "");
};
