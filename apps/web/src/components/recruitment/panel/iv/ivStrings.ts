/**
 * Words for Wawancara and Mengajar (the examiners' tab, the sheet, Penilaian,
 * the template). Plain wording; no em or en dashes. Mandarin is added last
 * (the zh view reads the English).
 */
import type { Lang } from "../../../../lib/kelas";
import type { Bi } from "../../../../lib/recruitment/interview";

export interface IvWords {
  tab: Record<"wawancara" | "mengajar", string>;
  title: Record<"wawancara" | "mengajar", string>;
  lede: Record<"wawancara" | "mengajar", string>;
  seg: { mine: string; nilai: string; template: string };
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
  tab: { wawancara: "Wawancara", mengajar: "Mengajar" },
  title: { wawancara: "Wawancara", mengajar: "Tes Mengajar" },
  lede: {
    wawancara: "Slot wawancaramu, lembar penilaian, hasil tiap CaAs, dan template pertanyaan.",
    mengajar:
      "Giliran mengajar yang kamu nilai, lembar penilaian, hasil tiap CaAs, dan template rubrik.",
  },
  seg: { mine: "Slotku", nilai: "Penilaian", template: "Template" },
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
    desc: (n) => `Untuk ${n}. Pilih yang terjadi; ini aturan bawaan template.`,
    kinds: {
      telat: "Terlambat",
      absen: "Tidak hadir",
      sakit: "Sakit atau harus keluar saat sesi",
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
        "Lewat toleransi tanpa alasan akademik atau musibah: dinyatakan GUGUR. PJ luar ruangan mengonfirmasi ke PJ dulu.",
      late_susulan:
        "Lewat toleransi karena akademik atau musibah: bisa ikut Susulan. PJ luar ruangan mengonfirmasi ke PJ.",
      absen_gugur: "Tidak hadir tanpa alasan yang sah: dinyatakan GUGUR. Dikonfirmasi PJ dulu.",
      absen_susulan: "Izin dengan bukti: ditawari Susulan. Izin harus masuk sebelum sesi mulai.",
      sakit:
        "Hentikan sesi dan izinkan CaAs keluar. Dia ditawari Susulan. Isian yang sudah masuk tetap tersimpan.",
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
  tab: { wawancara: "Interview", mengajar: "Teaching" },
  title: { wawancara: "Interview", mengajar: "Teaching Test" },
  lede: {
    wawancara: "Your interview slots, the sheet, each CaAs's result, and the question template.",
    mengajar:
      "The teaching turns you score, the sheet, each CaAs's result, and the rubric template.",
  },
  seg: { mine: "My Slots", nilai: "Scores", template: "Template" },
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
    desc: (n) => `For ${n}. Pick what happened; these are the template's default rules.`,
    kinds: {
      telat: "Late",
      absen: "Didn't come",
      sakit: "Ill or has to leave mid-session",
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
        "Past the grace with no class or misfortune reason: GUGUR. The outside PJ confirms with the PJ first.",
      late_susulan:
        "Past the grace for class or misfortune: can sit the makeup. The outside PJ confirms with the PJ.",
      absen_gugur: "No valid reason: GUGUR. Confirmed with the PJ first.",
      absen_susulan:
        "Excused with proof: offered the makeup. Excuses must come in before the session starts.",
      sakit:
        "Stop the session and let the CaAs leave. They are offered the makeup. Answers so far stay saved.",
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

/** Labels of the + and - buttons of a Stepper. */
export const STEP = (lang: Lang) =>
  lang === "id"
    ? { lessLabel: "Kurangi", moreLabel: "Tambah" }
    : { lessLabel: "Decrease", moreLabel: "Increase" };

export const IV = (lang: Lang): IvWords => (lang === "id" ? ID : EN);

/** The Indonesian or English half of a template text (Mandarin reads English). */
export const bi = (x: Bi, lang: Lang): string => (lang === "id" ? x.id : x.en);
