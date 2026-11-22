/**
 * Interview and teaching sheets (Wawancara and Mengajar), pure and browser
 * safe. One engine serves both stages: the template (parameters, 1 to 5
 * levels, question cards, crew size, the minutes and the case rules) is an
 * editable setting with the defaults below, so nothing here is a fixed rule.
 *
 * Wawancara follows the Wawancara_CaAs_IRIS workbook (22 Nov 2026): the weights,
 * the 52 and 38 decision lines, the red flag, the 33 question cards with their
 * priority, and the Catatan Khusus checklists. Mengajar and Tubes follow the
 * mockup (rec6-data.js, rec5-data.js) and their rubric rows are examples until
 * the Akademik edits them. A template saved before a field existed keeps working:
 * every newer field has a default that leaves the old behaviour as it was.
 */

import { isObj } from "../guards.js";

export const IV_STAGES = ["wawancara", "mengajar", "tubes"] as const;
export type IvStage = (typeof IV_STAGES)[number];
export const isIvStage = (v: unknown): v is IvStage =>
  typeof v === "string" && (IV_STAGES as readonly string[]).includes(v);

export interface Bi {
  id: string;
  en: string;
}

export interface IvParam {
  key: string;
  label: Bi;
  /** What to look at, shown under the parameter */
  ind: Bi[];
  /** An example conclusion, shown as the placeholder */
  eg: Bi;
  min: number;
  max: number;
  weight: number;
  /** A placeholder row the Akademik has not replaced yet */
  example?: boolean;
}

export interface IvQuestion {
  id: string;
  /** Group key, one of the template's groups */
  g: string;
  /** Planned minutes for this card */
  m: number;
  /** The parameter it feeds */
  p: string;
  /** Wajib: never skip. Penting: ask if you can. Bisa dilewati: cut first when time runs short. */
  prio?: IvPrio;
  t: Bi;
  h: Bi | null;
  /** Only asked when this applies to the CaAs */
  only: IvOnly | null;
  /** The card that shows the real test scores */
  reveal?: boolean;
}

export interface IvGroup {
  key: string;
  label: Bi;
}

export const IV_PRIOS = ["wajib", "penting", "lewat"] as const;
export type IvPrio = (typeof IV_PRIOS)[number];

/**
 * Who a card is for: fm (missed or late to First Meet), lab (applied to another lab), a24 (angkatan 24 taking
 * the IoT course), te (Teknik Elektro taking the IoT practicum).
 */
export const IV_ONLY = ["fm", "lab", "a24", "te"] as const;
export type IvOnly = (typeof IV_ONLY)[number];

/**
 * How a sheet turns levels into a score out of 100. "min": the lowest level is 0 (level 1 of 5 is 0).
 * "zero": the score is the weighted level over the top level, so level 1 of 5 is 20 (the workbook's formula).
 */
export type IvFloor = "min" | "zero";

/** A red flag: a level at or below `max` on any of `keys`, from any examiner, stops a Fix Lolos at Ragu-ragu. */
export interface IvFlag {
  keys: string[];
  max: number;
}

export interface IvTag {
  key: string;
  label: Bi;
}

/** The Catatan Khusus checklists, and how many red notes or plus points name a label. */
export interface IvTags {
  red: IvTag[];
  plus: IvTag[];
  /** This many red notes or more is Banyak masalah */
  many: number;
  /** This many plus points or more, with no red note, is Jago */
  jago: number;
}

/** "booth": the crew splits into pairs, one pair per CaAs. "panel": the whole crew sits every turn. */
export type IvMode = "booth" | "panel";

export interface IvTemplate {
  mode: IvMode;
  params: IvParam[];
  levels: Bi[];
  /** Mean at or above the first is Fix Lolos, at or above the second Ragu-ragu, else Fix Cut (out of 100) */
  cut: [number, number];
  /** Examiners whose levels differ by this many points (out of 100) are flagged */
  wide: number;
  groups: IvGroup[];
  questions: IvQuestion[];
  /** Examiners per CaAs (booth) or per room (panel) */
  per: number;
  /** PJ outside and inside the room, per shift */
  pjOut: number;
  pjIn: number;
  /** Minutes one CaAs sits (interview shift, or one teaching turn) */
  minutes: number;
  /** The hard stop in minutes */
  maxMinutes: number;
  /** Changeover between two turns (panel mode) */
  gap: number;
  /** Grace for a late CaAs, in minutes */
  late: number;
  /** An excuse has to come in this many minutes before the turn */
  excuse: number;
  /** A CaAs offered the Susulan answers by this hour (WIB, 0 to 23), this many days before it */
  makeupDays: number;
  makeupHour: number;
  /** Who sees what */
  hideLevels: boolean;
  /** How a sheet becomes a score; a template saved without it keeps "min" */
  floor: IvFloor;
  /** The red-flag rule, or null for none */
  flag: IvFlag | null;
  /** The Catatan Khusus checklists, or null for none */
  tags: IvTags | null;
  /** Which edition of the defaults this template came from; a saved one older than the default gets a banner */
  rev: number;
}

const b = (id: string, en: string): Bi => ({ id, en });

export const LEVELS_DEFAULT: Bi[] = [
  b("Kurang Sekali", "Very Weak"),
  b("Kurang", "Weak"),
  b("Cukup", "Fair"),
  b("Baik", "Good"),
  b("Sangat Baik", "Very Good"),
];

const P = (key: string, label: Bi, ind: Bi[], eg: Bi, example = false, weight = 1): IvParam => ({
  key,
  label,
  ind,
  eg,
  min: 1,
  max: 5,
  weight,
  ...(example ? { example } : {}),
});

const WAW_PARAMS: IvParam[] = [
  P(
    "attitude",
    b("Attitude", "Attitude"),
    [
      b("Disiplin waktu", "Time discipline"),
      b("Cara berpakaian", "Dress"),
      b("Kejujuran", "Honesty"),
      b("Gaya komunikasi dan bahasa tubuh", "Communication and body language"),
      b("Sopan", "Polite"),
    ],
    b(
      "Contoh: tidak telat; jujur karena menjelaskan notifikasi yang terlihat saat tes.",
      "E.g. not late; honest, since they explained a notification seen during the test.",
    ),
    false,
    30,
  ),
  P(
    "komitmen",
    b("Komitmen", "Commitment"),
    [
      b("Niat dan tekad", "Intent and resolve"),
      b("Video komitmen", "Commitment video"),
      b(
        "Khusus yang tidak ikut First Meet atau telat",
        "Only for those who missed or were late to First Meet",
      ),
    ],
    b(
      "Contoh: berkomitmen karena sudah bernazar, dan tidak ragu saat diberi konsekuensi.",
      "E.g. committed: has made a vow, and didn't hesitate at the consequence.",
    ),
    false,
    25,
  ),
  P(
    "profesional",
    b("Profesionalisme", "Professionalism"),
    [
      b("Problem solving", "Problem solving"),
      b("Tanggung jawab", "Responsibility"),
      b("Manajemen waktu", "Time management"),
      b("Leadership", "Leadership"),
      b("Kerja sama", "Teamwork"),
      b("Skala prioritas dan urgensi", "Priority and urgency"),
    ],
    b(
      "Contoh: manajemen waktu baik antara kuliah dan tugas, taat aturan.",
      "E.g. manages time well between classes and tasks, follows the rules.",
    ),
    false,
    20,
  ),
  P(
    "konsisten",
    b("Konsistensi jawaban", "Consistency of answers"),
    [b("Jawaban cocok dengan data di CV", "Answers match the CV")],
    b(
      "Contoh: jawaban sesuai CV dan berkas yang dikumpulkan.",
      "E.g. answers match the CV and the files handed in.",
    ),
    false,
    15,
  ),
  P(
    "keaktifan",
    b("Keaktifan", "Activeness"),
    [
      b("Soft skill dan hard skill", "Soft and hard skills"),
      b("Pengalaman", "Experience"),
      b("Rasa ingin tahu", "Curiosity"),
    ],
    b(
      "Contoh: aktif di UKM, punya soft skill public speaking.",
      "E.g. active in a club, with public speaking as a soft skill.",
    ),
    false,
    10,
  ),
];

const MENG_PARAMS: IvParam[] = [
  P(
    "materi",
    b("Penguasaan materi", "Command of the material"),
    [
      b("Isi materi benar", "The content is correct"),
      b("Urutan masuk akal", "A sensible order"),
      b("Menjawab pertanyaan dengan tepat", "Answers questions correctly"),
    ],
    b(
      "Contoh: materi MQTT runtut, paham bedanya QoS 0 dan 1.",
      "E.g. the MQTT lesson is in order, and knows QoS 0 from 1.",
    ),
    true,
  ),
  P(
    "jelas",
    b("Cara menjelaskan", "How they explain"),
    [
      b("Bahasa jelas dan tidak berbelit", "Clear language, no waffle"),
      b("Memakai contoh atau analogi", "Uses examples or analogies"),
      b("Alat bantu: papan, slide, kode", "Aids: board, slides, code"),
    ],
    b(
      "Contoh: memakai analogi kurir untuk menjelaskan broker.",
      "E.g. uses a courier analogy to explain the broker.",
    ),
    true,
  ),
  P(
    "interaksi",
    b("Interaksi dengan Praktikan", "Interaction with Praktikan"),
    [
      b("Bertanya balik", "Asks back"),
      b("Memberi kesempatan bertanya", "Leaves room for questions"),
      b("Menjaga perhatian", "Keeps attention"),
    ],
    b(
      "Contoh: berhenti dua kali untuk bertanya apakah sudah paham.",
      "E.g. paused twice to ask whether it made sense.",
    ),
    true,
  ),
  P(
    "waktu",
    b("Penggunaan waktu", "Use of time"),
    [
      b("Selesai dalam waktu", "Finishes in time"),
      b("Pembuka, inti, penutup seimbang", "Opening, body and close are balanced"),
    ],
    b(
      "Contoh: selesai dengan sisa 30 detik, penutupnya ringkas.",
      "E.g. finished with 30 seconds left, with a short close.",
    ),
    true,
  ),
  P(
    "sikap",
    b("Sikap", "Attitude"),
    [
      b("Percaya diri", "Confident"),
      b("Sopan dan ramah", "Polite and friendly"),
      b("Antusias", "Enthusiastic"),
    ],
    b(
      "Contoh: tenang, tersenyum, dan menerima masukan dengan baik.",
      "E.g. calm, smiling, and takes feedback well.",
    ),
    true,
  ),
];

/** The Presentasi of Tubes: the rubric rows are examples until the Akademik replaces them (mockup rec5-data.js). */
const TUBES_PARAMS: IvParam[] = [
  P(
    "masalah",
    b("Pemahaman Masalah dan Rancangan", "Understanding the Problem and Design"),
    [
      b("Memahami kebutuhan topik", "Understands the topic's needs"),
      b("Rancangan jelas dan masuk akal", "A clear, sensible design"),
    ],
    b(
      "Contoh: rancangan blok jelas, alasan memilih komponen masuk akal.",
      "E.g. a clear block design with sensible reasons for the parts.",
    ),
    true,
  ),
  P(
    "hasil",
    b("Hasil dan Demo", "Result and Demo"),
    [b("Demo berjalan", "The demo runs"), b("Fitur sesuai brief", "Features match the brief")],
    b(
      "Contoh: demo berjalan tanpa bantuan, dua fitur utama jalan.",
      "E.g. the demo runs unaided, both main features work.",
    ),
    true,
  ),
  P(
    "kode",
    b("Kualitas Kode", "Code Quality"),
    [
      b("Rapi dan terstruktur", "Tidy and structured"),
      b("Bisa dijalankan ulang", "Can be run again"),
    ],
    b(
      "Contoh: kode terbagi per fungsi, ada petunjuk menjalankan.",
      "E.g. code split by function, with run instructions.",
    ),
    true,
  ),
  P(
    "laporan",
    b("Laporan", "Report"),
    [b("Lengkap sesuai format", "Complete in the format"), b("Bahasa jelas", "Clear language")],
    b(
      "Contoh: laporan lengkap dengan diagram dan hasil uji.",
      "E.g. a full report with diagrams and test results.",
    ),
    true,
  ),
  P(
    "bicara",
    b("Presentasi dan Tanya Jawab", "Presentation and Q&A"),
    [
      b("Runtut dan tepat waktu", "In order and on time"),
      b("Menjawab pertanyaan dengan baik", "Answers questions well"),
    ],
    b(
      "Contoh: runtut, menjawab pertanyaan tentang pilihan sensornya.",
      "E.g. in order, answered the question about the sensor choice.",
    ),
    true,
  ),
];

const GROUPS: IvGroup[] = [
  { key: "buka", label: b("Pembuka", "Opening") },
  { key: "diri", label: b("Tentang diri", "About them") },
  { key: "waktu", label: b("Waktu dan kesibukan", "Time and other commitments") },
  { key: "tes", label: b("Tes tulis dan koding", "Written and coding tests") },
  { key: "lab", label: b("Tentang lab", "About the lab") },
  { key: "riset", label: b("Riset", "Research") },
  { key: "kasus", label: b("Studi kasus", "Case study") },
  { key: "iot", label: b("IoT", "IoT") },
  { key: "inggris", label: b("Bahasa Inggris", "In English") },
  { key: "khusus", label: b("Khusus", "Special") },
  { key: "tutup", label: b("Penutup", "Closing") },
];

type Q = [string, number, string, IvPrio, string, string, string?, string?, IvOnly?];
/** [group, minutes, parameter, priority, id, en, hint id, hint en, only-for] */
const QS: Q[] = [
  [
    "buka",
    3,
    "attitude",
    "penting",
    "Perkenalan dan cerita tentang diri",
    "Introduce yourself",
    "Pertanyaan awal santai. Suasana baru jadi serius mulai pertanyaan tes tulis.",
    "The first questions are relaxed. It turns serious from the test-score questions.",
  ],
  ["buka", 2, "keaktifan", "penting", "Kelebihan (cek CV)", "Strengths (check the CV)"],
  [
    "buka",
    2,
    "profesional",
    "penting",
    "Kekurangan dan cara mengatasinya (cek CV)",
    "Weaknesses and how they cope (check the CV)",
  ],
  [
    "buka",
    1.5,
    "profesional",
    "penting",
    "Sulit bangun pagi?",
    "Hard to wake up early?",
    "Bila menjawab sulit, lanjutkan: bagaimana kalau jadwalnya pagi?",
    "If they say yes, follow up: and if the shift is in the morning?",
  ],
  [
    "diri",
    2,
    "profesional",
    "penting",
    "Arti pemimpin dan gaya kepemimpinannya",
    "What a leader is and their style",
  ],
  [
    "diri",
    2,
    "profesional",
    "penting",
    "Anggota tim banyak menentang: apa yang dilakukan",
    "Most of the team pushes back: what do they do",
  ],
  [
    "diri",
    1,
    "komitmen",
    "penting",
    "Riwayat kesehatan dan cara menjaganya",
    "Health history and how they manage it",
  ],
  [
    "waktu",
    1.5,
    "komitmen",
    "wajib",
    "Kesibukan lain sekarang",
    "Other commitments now",
    "Kuliah, UKM, organisasi, rekrutmen lain, dan seterusnya.",
    "Classes, clubs, organisations, other recruitments and so on.",
  ],
  [
    "waktu",
    2,
    "profesional",
    "penting",
    "Skala prioritas sekarang, dalam persen",
    "Priorities today, in percent",
  ],
  [
    "waktu",
    1.5,
    "komitmen",
    "wajib",
    "Kegiatan lain setelah diterima",
    "Other activities after joining",
  ],
  [
    "waktu",
    2,
    "profesional",
    "wajib",
    "Lebih sibuk bila diterima: bagaimana mengatur waktu",
    "Busier once accepted: how they manage time",
  ],
  [
    "waktu",
    2,
    "profesional",
    "penting",
    "Skala prioritas setelah jadi asisten, dalam persen",
    "Priorities as an assistant, in percent",
    "Bandingkan dengan jawaban skala prioritas sekarang.",
    "Compare with their priorities today.",
  ],
  [
    "tes",
    1,
    "attitude",
    "wajib",
    "Kejujuran saat tes tulis dan tes koding",
    "Honesty during the written and coding tests",
    "Mulai dari sini suasana lebih serius.",
    "From here on, the room is more serious.",
  ],
  [
    "tes",
    1,
    "konsisten",
    "wajib",
    "Tebak nilai tes tulis dan tes koding",
    "Guess the written and coding test scores",
  ],
  [
    "tes",
    1,
    "attitude",
    "wajib",
    "Beri tahu nilai sebenarnya, tanya apakah layak jadi asisten",
    "Tell the real scores; ask if they deserve to be an assistant",
    "Nilai sebenarnya ada di tombol di bawah. Hanya kartu ini yang menampilkannya.",
    "The real scores are behind the button below. Only this card shows them.",
  ],
  [
    "lab",
    3,
    "konsisten",
    "wajib",
    "Tujuan, visi, misi dan motivasi",
    "Goal, vision, mission and motivation",
    "Cocokkan dengan CV: konsisten atau tidak.",
    "Check against the CV: consistent or not.",
  ],
  [
    "lab",
    1.5,
    "komitmen",
    "penting",
    "Kenapa memilih lab ini",
    "Why this lab",
    "Sekitar separuh pertanyaan inti ada di kartu ini.",
    "About half the core questions sit on this card.",
  ],
  [
    "lab",
    2,
    "keaktifan",
    "penting",
    "Yang dia ketahui tentang pekerjaan asisten lab",
    "What they know of an assistant's job",
    "Kalau hanya menjawab mengajar, tanyakan lagi.",
    "If they only say teaching, ask again.",
  ],
  [
    "riset",
    1,
    "komitmen",
    "penting",
    "Bila ada riset di lab IRIS, apakah bersedia ikut",
    "Willing to join research if the IRIS lab runs some",
  ],
  [
    "riset",
    3,
    "komitmen",
    "wajib",
    "Semester depan tidak ada praktikum, hanya riset: apa yang akan dia kerjakan dan riset apa",
    "Next semester has no practicum, only research: what they will do and which research",
    "Semester depan tugas asisten hanya riset, jadi rencana konkretnya menunjukkan kesiapan dan komitmen.",
    "Next semester an assistant only does research, so a concrete plan shows readiness and commitment.",
  ],
  [
    "kasus",
    4,
    "profesional",
    "penting",
    "Studi kasus praktikan (contoh: ada kating yang mengulang praktikum IoT dan bersikap seenaknya: tidak mendengarkan, main HP, dan tidak mengerjakan TP. Apa yang kamu lakukan?)",
    "Praktikan case study (e.g. a senior retaking the IoT practicum behaves as they please: doesn't listen, plays on their phone, skips the TP. What do you do?)",
    "Tidak perlu semuanya. Pilih yang paling relevan dengan jawaban sebelumnya.",
    "Not all of them. Pick what fits their earlier answers.",
  ],
  [
    "iot",
    2,
    "keaktifan",
    "penting",
    "Dasar IoT: apa itu IoT dan contoh penerapannya yang dia ketahui",
    "IoT basics: what IoT is and the uses they know",
  ],
  [
    "iot",
    1.5,
    "keaktifan",
    "penting",
    "Pengalaman atau minat dengan mikrokontroler, sensor, atau proyek IoT",
    "Experience or interest in microcontrollers, sensors or IoT projects",
  ],
  [
    "iot",
    2,
    "profesional",
    "penting",
    "Studi kasus praktikum IoT: rangkaian atau alat praktikan tidak berfungsi, apa langkahnya",
    "IoT practicum case study: a praktikan's circuit or device doesn't work, what are the steps",
  ],
  [
    "inggris",
    3,
    "keaktifan",
    "penting",
    "In English: jelaskan satu materi IoT kepada praktikan baru, pilih salah satu: apa itu IoT, sensor dan aktuator, atau cara mikrokontroler mengirim data ke server",
    "In English: explain one IoT topic to a new praktikan, pick one: what IoT is, sensors and actuators, or how a microcontroller sends data to a server",
    "Dua pertanyaan berikutnya dalam bahasa Inggris. Beri tahu CaAs lebih dulu.",
    "The next two are in English. Tell the CaAs first.",
  ],
  [
    "inggris",
    2,
    "profesional",
    "penting",
    "In English: tanya jawab setelah penjelasan, pewawancara pilih 2 sampai 3: (1) What is the difference between a sensor and an actuator? (2) How does a microcontroller send data to a server? (3) What would you check if a sensor gives no reading? Lalu beri kesempatan CaAs bertanya balik.",
    "In English: Q and A after the explanation, the examiner picks 2 or 3: (1) What is the difference between a sensor and an actuator? (2) How does a microcontroller send data to a server? (3) What would you check if a sensor gives no reading? Then let the CaAs ask back.",
  ],
  [
    "khusus",
    3,
    "komitmen",
    "wajib",
    "Tidak ikut atau telat First Meet: kenapa",
    "Missing or arriving late to First Meet: why",
    "Kartu ini hanya muncul bila CaAs tidak ikut atau telat First Meet.",
    "This card only shows if the CaAs missed or was late to First Meet.",
    "fm",
  ],
  [
    "khusus",
    3,
    "komitmen",
    "wajib",
    "Mendaftar lab lain: mana yang diutamakan",
    "Applying to another lab: which comes first",
    "Hanya untuk CaAs yang juga mendaftar lab lain.",
    "Only for CaAs who also applied to another lab.",
    "lab",
  ],
  [
    "khusus",
    1.5,
    "komitmen",
    "wajib",
    "Khusus angkatan 24, mata kuliah IoT: apakah absensi aman, dan nilainya juga?",
    "Angkatan 24, IoT course: is attendance safe, and the grade too?",
    "Wajib untuk CaAs angkatan 24 yang mengambil mata kuliah IoT. Cek risiko bentrok absensi dan nilai.",
    "Required for angkatan 24 CaAs taking the IoT course. Check the risk of an attendance or grade clash.",
    "a24",
  ],
  [
    "khusus",
    1,
    "komitmen",
    "wajib",
    "Khusus Elektro, praktikum IoT: apakah absensi aman?",
    "Elektro, IoT practicum: is attendance safe?",
    "Wajib untuk CaAs Elektro yang mengambil praktikum IoT. Cek risiko bentrok absensi.",
    "Required for Elektro CaAs taking the IoT practicum. Check the risk of an attendance clash.",
    "te",
  ],
  [
    "tutup",
    1.5,
    "komitmen",
    "penting",
    "Alasan agar kami yakin menerima kamu",
    "Why we should accept you",
  ],
  ["tutup", 2, "komitmen", "penting", "Nazar bila diterima", "Vow if accepted"],
  [
    "tutup",
    1.5,
    "konsisten",
    "wajib",
    "Pengecekan berkas (tanya alasannya bila ada yang kurang)",
    "File check (ask why if something is missing)",
  ],
];

const WAW_QUESTIONS: IvQuestion[] = QS.map(([g, m, p, prio, id, en, hid, hen, only], i) => ({
  id: `q${i + 1}`,
  g,
  m,
  p,
  prio,
  t: b(id, en),
  h: hid ? b(hid, hen ?? hid) : null,
  only: only ?? null,
  ...(en.startsWith("Tell the real scores") ? { reveal: true } : {}),
}));

/** The red notes and plus points of the workbook's Catatan Khusus sheet, and the counts that name a label. */
const WAW_TAGS: IvTags = {
  red: [
    { key: "jujur", label: b("Tidak jujur", "Not honest") },
    {
      key: "hilang",
      label: b("Hilang-hilangan atau sulit dihubungi", "Goes missing or is hard to reach"),
    },
    { key: "fm", label: b("Telat atau tidak ikut First Meet", "Late to or missed First Meet") },
    { key: "bentrok", label: b("Jadwal bentrok atau terlalu sibuk", "Schedule clash or too busy") },
    { key: "cv", label: b("Jawaban tidak cocok dengan CV", "Answers don't match the CV") },
    {
      key: "sikap",
      label: b("Sikap atau komunikasi bermasalah", "Attitude or communication problem"),
    },
  ],
  plus: [
    { key: "skill", label: b("Portofolio atau skill kuat", "Strong portfolio or skills") },
    { key: "proyek", label: b("Pernah proyek atau riset", "Has done a project or research") },
    { key: "leader", label: b("Leadership kuat", "Strong leadership") },
    { key: "inggris", label: b("Bahasa Inggris bagus", "Good English") },
    {
      key: "sikapbaik",
      label: b("Sikap dan komunikasi sangat baik", "Excellent attitude and communication"),
    },
    { key: "antusias", label: b("Antusias, rasa ingin tahu tinggi", "Enthusiastic, very curious") },
  ],
  many: 3,
  jago: 3,
};

export const IV_DEFAULT: Record<IvStage, IvTemplate> = {
  wawancara: {
    mode: "booth",
    params: WAW_PARAMS,
    levels: LEVELS_DEFAULT,
    cut: [52, 38],
    wide: 20,
    groups: GROUPS,
    questions: WAW_QUESTIONS,
    per: 2,
    pjOut: 1,
    pjIn: 2,
    minutes: 90,
    maxMinutes: 120,
    gap: 0,
    late: 10,
    excuse: 30,
    makeupDays: 1,
    makeupHour: 12,
    hideLevels: true,
    floor: "zero",
    flag: { keys: ["attitude", "komitmen"], max: 2 },
    tags: WAW_TAGS,
    rev: 2,
  },
  mengajar: {
    mode: "panel",
    params: MENG_PARAMS,
    levels: LEVELS_DEFAULT,
    cut: [52, 38],
    wide: 20,
    groups: [],
    questions: [],
    per: 3,
    pjOut: 0,
    pjIn: 2,
    minutes: 15,
    maxMinutes: 18,
    gap: 3,
    late: 10,
    excuse: 30,
    makeupDays: 1,
    makeupHour: 12,
    hideLevels: true,
    floor: "min",
    flag: null,
    tags: null,
    rev: 0,
  },
  // Presentasi: a table of two examiners sits every turn of its team (12 minutes); no Susulan, the Ketua decides in the Cutting.
  tubes: {
    mode: "panel",
    params: TUBES_PARAMS,
    levels: LEVELS_DEFAULT,
    cut: [55, 40],
    wide: 20,
    groups: [],
    questions: [],
    per: 2,
    pjOut: 0,
    pjIn: 1,
    minutes: 12,
    maxMinutes: 15,
    gap: 0,
    late: 10,
    excuse: 30,
    makeupDays: 0,
    makeupHour: 12,
    hideLevels: true,
    floor: "min",
    flag: null,
    tags: null,
    rev: 0,
  },
};

/* ------------------------------------------------------------ the check of a saved template */

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
const bi = (v: unknown, max: number): Bi | null => {
  if (!isObj(v)) return null;
  const id = str(v.id, max);
  const en = str(v.en, max);
  return id && en ? { id, en } : null;
};

/** The cleaned template, or null when something in it cannot be used. */
export function checkTemplate(v: unknown): IvTemplate | null {
  if (!isObj(v)) return null;
  const mode = v.mode === "booth" || v.mode === "panel" ? v.mode : null;
  if (!mode) return null;
  if (!Array.isArray(v.params) || v.params.length < 1 || v.params.length > 12) return null;
  const keys = new Set<string>();
  const params: IvParam[] = [];
  for (const raw of v.params) {
    if (!isObj(raw)) return null;
    const key =
      typeof raw.key === "string" && /^[a-z][a-z0-9_]{1,23}$/.test(raw.key) ? raw.key : null;
    const label = bi(raw.label, 80);
    const eg = bi(raw.eg, 240);
    const min = int(raw.min, 0, 9);
    const max = int(raw.max, 1, 10);
    const weight = num(raw.weight, 0.1, 100);
    if (!key || !label || !eg || min === null || max === null || max <= min || weight === null)
      return null;
    if (keys.has(key)) return null;
    keys.add(key);
    const ind: Bi[] = [];
    for (const i of Array.isArray(raw.ind) ? raw.ind : []) {
      const x = bi(i, 120);
      if (!x) return null;
      ind.push(x);
    }
    params.push({
      key,
      label,
      ind,
      eg,
      min,
      max,
      weight,
      ...(raw.example === true ? { example: true } : {}),
    });
  }
  const levels: Bi[] = [];
  for (const raw of Array.isArray(v.levels) ? v.levels : []) {
    const x = bi(raw, 40);
    if (!x) return null;
    levels.push(x);
  }
  const span = Math.max(...params.map((p) => p.max - p.min)) + 1;
  if (levels.length < span) return null;
  const cut = Array.isArray(v.cut) ? [num(v.cut[0], 0, 100), num(v.cut[1], 0, 100)] : [null, null];
  if (cut[0] === null || cut[1] === null || cut[1] > cut[0]) return null;
  const groups: IvGroup[] = [];
  for (const raw of Array.isArray(v.groups) ? v.groups : []) {
    if (!isObj(raw)) return null;
    const key =
      typeof raw.key === "string" && /^[a-z][a-z0-9_]{0,23}$/.test(raw.key) ? raw.key : null;
    const label = bi(raw.label, 60);
    if (!key || !label) return null;
    groups.push({ key, label });
  }
  const questions: IvQuestion[] = [];
  const qids = new Set<string>();
  for (const raw of Array.isArray(v.questions) ? v.questions : []) {
    if (!isObj(raw)) return null;
    const id = typeof raw.id === "string" && /^[a-z0-9_-]{1,24}$/i.test(raw.id) ? raw.id : null;
    const t = bi(raw.t, 300);
    const g = typeof raw.g === "string" && groups.some((x) => x.key === raw.g) ? raw.g : null;
    const m = num(raw.m, 0, 60);
    const p = typeof raw.p === "string" && keys.has(raw.p) ? raw.p : null;
    const h = raw.h === null || raw.h === undefined ? null : bi(raw.h, 400);
    const only = (IV_ONLY as readonly unknown[]).includes(raw.only) ? (raw.only as IvOnly) : null;
    // A saved card from before the priority existed has none; one with a value we do not know is refused.
    const prio =
      raw.prio === undefined || raw.prio === null
        ? undefined
        : (IV_PRIOS as readonly unknown[]).includes(raw.prio)
          ? (raw.prio as IvPrio)
          : null;
    if (!id || !t || !g || m === null || !p || prio === null || (raw.h && !h) || qids.has(id))
      return null;
    qids.add(id);
    questions.push({
      id,
      g,
      m,
      p,
      ...(prio ? { prio } : {}),
      t,
      h,
      only,
      ...(raw.reveal === true ? { reveal: true } : {}),
    });
  }
  if (questions.length > 120) return null;
  const per = int(v.per, 1, 8);
  const pjOut = int(v.pjOut, 0, 6);
  const pjIn = int(v.pjIn, 0, 10);
  const minutes = int(v.minutes, 1, 600);
  const maxMinutes = int(v.maxMinutes, 1, 600);
  const gap = int(v.gap, 0, 60);
  const late = int(v.late, 0, 120);
  const excuse = int(v.excuse, 0, 1440);
  // Saved before the Susulan offer existed: the defaults stand in.
  const makeupDays = v.makeupDays === undefined ? 1 : int(v.makeupDays, 0, 14);
  const makeupHour = v.makeupHour === undefined ? 12 : int(v.makeupHour, 0, 23);
  if (
    per === null ||
    pjOut === null ||
    pjIn === null ||
    minutes === null ||
    maxMinutes === null ||
    gap === null ||
    late === null ||
    excuse === null ||
    makeupDays === null ||
    makeupHour === null ||
    maxMinutes < minutes
  )
    return null;
  const wide = num(v.wide, 1, 100);
  if (wide === null) return null;
  // Saved before these existed: the old behaviour stands in (level 1 is 0, no red flag, no checklists).
  const floor =
    v.floor === undefined ? "min" : v.floor === "min" || v.floor === "zero" ? v.floor : null;
  const flag = checkFlag(v.flag, keys);
  const tags = checkTags(v.tags);
  const rev = v.rev === undefined ? 0 : int(v.rev, 0, 99);
  if (floor === null || flag === undefined || tags === undefined || rev === null) return null;
  return {
    mode,
    params,
    levels,
    cut: [cut[0], cut[1]],
    wide,
    groups,
    questions,
    per,
    pjOut,
    pjIn,
    minutes,
    maxMinutes,
    gap,
    late,
    excuse,
    makeupDays,
    makeupHour,
    hideLevels: v.hideLevels !== false,
    floor,
    flag,
    tags,
    rev,
  };
}

/** The red-flag rule: null when none, undefined when what was saved cannot be used. */
function checkFlag(v: unknown, keys: ReadonlySet<string>): IvFlag | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObj(v) || !Array.isArray(v.keys)) return undefined;
  const max = int(v.max, 0, 9);
  const list = [...new Set(v.keys)];
  if (max === null || !list.length || !list.every((k) => typeof k === "string" && keys.has(k)))
    return undefined;
  return { keys: list as string[], max };
}

/** The Catatan Khusus checklists: null when none, undefined when what was saved cannot be used. */
function checkTags(v: unknown): IvTags | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObj(v) || !Array.isArray(v.red) || !Array.isArray(v.plus)) return undefined;
  const many = int(v.many, 1, 20);
  const jago = int(v.jago, 1, 20);
  if (many === null || jago === null || v.red.length > 20 || v.plus.length > 20) return undefined;
  const seen = new Set<string>();
  const list = (raw: unknown[]): IvTag[] | null => {
    const out: IvTag[] = [];
    for (const r of raw) {
      if (!isObj(r)) return null;
      const key = typeof r.key === "string" && /^[a-z][a-z0-9_]{0,23}$/.test(r.key) ? r.key : null;
      const label = bi(r.label, 80);
      if (!key || !label || seen.has(key)) return null;
      seen.add(key);
      out.push({ key, label });
    }
    return out;
  };
  const red = list(v.red);
  const plus = list(v.plus);
  return red && plus ? { red, plus, many, jago } : undefined;
}

/* ------------------------------------------------------------ scoring */

/**
 * Weighted level per parameter, out of 100. Parameters not yet set are left out. With floor "min" the lowest
 * level counts as 0 (level 1 of 5 scores 0); with "zero" the score is the weighted level over the top level
 * (level 1 of 5 scores 20), which is the workbook's (sum of weight x level) / 5 x 100.
 */
export function sheetScore(
  levels: Record<string, number>,
  params: readonly IvParam[],
  floor: IvFloor = "min",
): number {
  let num = 0;
  let den = 0;
  for (const p of params) {
    const v = levels[p.key];
    if (typeof v !== "number") continue;
    num += floor === "zero" ? (p.weight * v) / p.max : (p.weight * (v - p.min)) / (p.max - p.min);
    den += p.weight;
  }
  return den ? Math.round((100 * num) / den) : 0;
}

/** Every parameter has a level inside its range. */
export const levelsDone = (levels: Record<string, number>, params: readonly IvParam[]): boolean =>
  params.every((p) => {
    const v = levels[p.key];
    return Number.isInteger(v) && v >= p.min && v <= p.max;
  });

export type Verdict = "lolos" | "ragu" | "cut";
export const verdictOf = (mean: number, cut: readonly [number, number]): Verdict =>
  mean >= cut[0] ? "lolos" : mean >= cut[1] ? "ragu" : "cut";

export interface SheetLevels {
  by: string;
  levels: Record<string, number>;
}

export const meanScore = (
  sheets: readonly SheetLevels[],
  params: readonly IvParam[],
  floor: IvFloor = "min",
): number | null =>
  sheets.length
    ? sheets.reduce((a, s) => a + sheetScore(s.levels, params, floor), 0) / sheets.length
    : null;

/** The gap between the highest and lowest examiner, or null with fewer than two sheets. */
export function spreadScore(
  sheets: readonly SheetLevels[],
  params: readonly IvParam[],
  floor: IvFloor = "min",
): number | null {
  if (sheets.length < 2) return null;
  const sc = sheets.map((s) => sheetScore(s.levels, params, floor));
  return Math.max(...sc) - Math.min(...sc);
}

/** Any examiner rated a flagged parameter at or below the limit. False with no rule. */
export function redFlag(sheets: readonly SheetLevels[], flag: IvFlag | null): boolean {
  if (!flag) return false;
  return sheets.some((s) =>
    flag.keys.some((k) => typeof s.levels[k] === "number" && s.levels[k] <= flag.max),
  );
}

export interface Suggestion {
  verdict: Verdict;
  /** A red flag was raised (shown even when the score alone already says Ragu-ragu or Fix Cut) */
  flag: boolean;
}

/** The suggested verdict: by the mean, but a red flag stops a Fix Lolos at Ragu-ragu. */
export function suggestVerdict(
  mean: number,
  sheets: readonly SheetLevels[],
  t: Pick<IvTemplate, "cut" | "flag">,
): Suggestion {
  const base = verdictOf(mean, t.cut);
  const flag = redFlag(sheets, t.flag);
  return { verdict: base === "lolos" && flag ? "ragu" : base, flag };
}

/* ------------------------------------------------------------ Catatan Khusus */

export const LABELS = ["jago", "perhatian", "banyak", "standar"] as const;
export type Label = (typeof LABELS)[number];
export const isLabel = (v: unknown): v is Label =>
  typeof v === "string" && (LABELS as readonly string[]).includes(v);

/** What the committee wrote about one CaAs at one stage, beside the sheets. */
export interface Catatan {
  /** Keys of the red notes ticked */
  red: string[];
  /** Keys of the plus points ticked */
  plus: string[];
  /** A label picked by hand; it replaces the automatic one */
  label: Label | null;
  /** Notes by who wrote them: an examiner's NIM, "pjDalam", "pjLuar" or "lain" */
  notes: Record<string, string>;
  /** The conclusion of the committee */
  final: string;
}

export const CATATAN_EMPTY: Catatan = { red: [], plus: [], label: null, notes: {}, final: "" };

/** The note a person may leave under their own name, and the roles that are not an examiner. */
export const NOTE_ROLES = ["pjDalam", "pjLuar", "lain"] as const;
export const NOTE_MAX = 800;
export const FINAL_MAX = 1500;

/** The cleaned Catatan from anything stored or sent. Keys the template does not know are dropped. */
export function checkCatatan(v: unknown, tags: IvTags | null): Catatan {
  if (!isObj(v)) return { ...CATATAN_EMPTY, notes: {} };
  const keep = (raw: unknown, allowed: IvTag[] | undefined): string[] => {
    const ok = new Set((allowed ?? []).map((x) => x.key));
    return Array.isArray(raw)
      ? [...new Set(raw.filter((k): k is string => typeof k === "string" && ok.has(k)))]
      : [];
  };
  const notes: Record<string, string> = {};
  if (isObj(v.notes))
    for (const [k, val] of Object.entries(v.notes)) {
      if (!/^[A-Za-z0-9_-]{1,24}$/.test(k) || typeof val !== "string") continue;
      const t = val.trim().slice(0, NOTE_MAX);
      if (t) notes[k] = t;
    }
  return {
    red: keep(v.red, tags?.red),
    plus: keep(v.plus, tags?.plus),
    label: isLabel(v.label) ? v.label : null,
    notes,
    final: typeof v.final === "string" ? v.final.trim().slice(0, FINAL_MAX) : "",
  };
}

/**
 * The label of a CaAs: the one picked by hand if there is one, else Banyak masalah (enough red notes), Jago
 * (enough plus points and no red note), Perlu perhatian (any red note), or Standar.
 */
export function labelOf(
  c: Pick<Catatan, "red" | "plus" | "label">,
  tags: Pick<IvTags, "many" | "jago">,
): Label {
  if (c.label) return c.label;
  if (c.red.length >= tags.many) return "banyak";
  if (c.red.length === 0 && c.plus.length >= tags.jago) return "jago";
  return c.red.length >= 1 ? "perhatian" : "standar";
}

/* ------------------------------------------------------------ who sits with whom */

/**
 * The examiners of the CaAs at `index` in a slot. Booth mode splits the crew in
 * pairs (positions 0 and 1 take the first CaAs); panel mode is the whole crew.
 */
export function crewFor(
  roster: readonly string[],
  index: number,
  t: Pick<IvTemplate, "mode" | "per">,
): string[] {
  if (t.mode === "panel") return [...roster];
  return roster.slice(index * t.per, index * t.per + t.per);
}

/** Examiners needed for `n` CaAs in a slot. */
export const crewNeed = (n: number, t: Pick<IvTemplate, "mode" | "per">): number =>
  t.mode === "panel" ? (n > 0 ? t.per : 0) : t.per * n;

/** Turns that fit in a window of `window` minutes (panel mode): n turns and n-1 changeovers. */
export const turnsFit = (window: number, t: Pick<IvTemplate, "minutes" | "gap">): number =>
  Math.max(1, Math.floor((window + t.gap) / (t.minutes + t.gap)));

/* ------------------------------------------------------------ special cases */

export const CASE_KINDS = [
  "telat",
  "absen",
  "sakit",
  "teknis",
  "lewat",
  "nametag",
  "keluar",
] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

/** The cases each stage offers (the interview form's, and the teaching test's own: a technical problem, time ran out). */
export const caseKindsFor = (stage: IvStage): readonly CaseKind[] =>
  stage === "mengajar"
    ? ["telat", "absen", "sakit", "teknis", "lewat", "nametag"]
    : ["telat", "absen", "sakit", "nametag", "keluar"];
export const LATE_WHY = ["akademik", "musibah", "lain"] as const;
export const EXCUSE_WHY = ["kuliah", "rohani", "sehat", "malang", "keluarga", "tanpa"] as const;

export interface CaseInput {
  kind: CaseKind;
  minutes?: number;
  why?: string;
}

export interface CaseOutcome {
  /** Susulan: offered the makeup. Gugur: out. null: carry on. */
  status: "susulan" | "gugur" | null;
  /** The interview stops here */
  end: boolean;
  /** A stable code the screens turn into words */
  code:
    | "grace"
    | "late_gugur"
    | "late_susulan"
    | "absen_gugur"
    | "absen_susulan"
    | "sakit"
    | "teknis"
    | "lewat"
    | "nametag"
    | "keluar";
}

/** The default rules of the interview template; Panitia confirms Gugur before it is final. */
export function caseOutcome(c: CaseInput, t: Pick<IvTemplate, "late">): CaseOutcome {
  if (c.kind === "telat") {
    const min = Math.max(0, Math.floor(c.minutes ?? 0));
    if (min <= t.late) return { status: null, end: false, code: "grace" };
    return c.why === "lain"
      ? { status: "gugur", end: true, code: "late_gugur" }
      : { status: "susulan", end: true, code: "late_susulan" };
  }
  if (c.kind === "absen")
    return c.why === "tanpa"
      ? { status: "gugur", end: true, code: "absen_gugur" }
      : { status: "susulan", end: true, code: "absen_susulan" };
  if (c.kind === "sakit") return { status: "susulan", end: true, code: "sakit" };
  if (c.kind === "teknis") return { status: null, end: false, code: "teknis" };
  if (c.kind === "lewat") return { status: null, end: false, code: "lewat" };
  if (c.kind === "nametag") return { status: null, end: false, code: "nametag" };
  return { status: null, end: false, code: "keluar" };
}

/* ------------------------------------------------------------ the sheet is ready to send */

export interface SheetDraft {
  levels: Record<string, number>;
  concl: Record<string, string>;
  verdict: Verdict | null;
}

/** What is still missing before a sheet may be sent: a level and a conclusion per parameter, and the verdict. */
export function sheetMissing(d: SheetDraft, params: readonly IvParam[]): string[] {
  const out: string[] = [];
  for (const p of params) {
    const v = d.levels[p.key];
    if (!(Number.isInteger(v) && v >= p.min && v <= p.max)) out.push(`lv-${p.key}`);
    if (!(d.concl[p.key] ?? "").trim()) out.push(`cl-${p.key}`);
  }
  if (!d.verdict) out.push("verdict");
  return out;
}
