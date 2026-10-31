/**
 * Interview and teaching sheets (Wawancara and Mengajar), pure and browser
 * safe. One engine serves both stages: the template (parameters, 1 to 5
 * levels, question cards, crew size, the minutes and the case rules) is an
 * editable setting with the defaults below, so nothing here is a fixed rule.
 *
 * Defaults follow the mockup (rec4-data.js, rec6-data.js). The reference
 * interview form has no numbers; the 1 to 5 level per parameter is our own
 * proposal so results can be averaged and compared. Mengajar's rubric rows
 * are examples until the Akademik edits them.
 */

export const IV_STAGES = ["wawancara", "mengajar"] as const;
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
  t: Bi;
  h: Bi | null;
  /** Only asked when this applies to the CaAs */
  only: "fm" | "lab" | null;
  /** The card that shows the real test scores */
  reveal?: boolean;
}

export interface IvGroup {
  key: string;
  label: Bi;
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
  /** Who sees what */
  hideLevels: boolean;
}

const b = (id: string, en: string): Bi => ({ id, en });

export const LEVELS_DEFAULT: Bi[] = [
  b("Kurang Sekali", "Very Weak"),
  b("Kurang", "Weak"),
  b("Cukup", "Fair"),
  b("Baik", "Good"),
  b("Sangat Baik", "Very Good"),
];

const P = (key: string, label: Bi, ind: Bi[], eg: Bi, example = false): IvParam => ({
  key,
  label,
  ind,
  eg,
  min: 1,
  max: 5,
  weight: 1,
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
  ),
  P(
    "konsisten",
    b("Konsistensi jawaban", "Consistency of answers"),
    [b("Jawaban cocok dengan data di CV", "Answers match the CV")],
    b(
      "Contoh: jawaban sesuai CV dan berkas yang dikumpulkan.",
      "E.g. answers match the CV and the files handed in.",
    ),
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

const GROUPS: IvGroup[] = [
  { key: "buka", label: b("Pembuka", "Opening") },
  { key: "santai", label: b("Santai", "Relaxed") },
  { key: "serius", label: b("Lebih serius", "More serious") },
  { key: "inggris", label: b("Bahasa Inggris", "In English") },
  { key: "khusus", label: b("Khusus", "Special") },
  { key: "tutup", label: b("Penutup", "Closing") },
];

type Q = [string, number, string, string, string, string?, string?, ("fm" | "lab")?];
/** [group, minutes, parameter, id, en, hint id, hint en, only-for] */
const QS: Q[] = [
  [
    "buka",
    3,
    "attitude",
    "Perkenalan dan cerita tentang diri",
    "Introduce yourself",
    "Pertanyaan awal santai. Suasana baru jadi serius mulai pertanyaan tes tulis.",
    "The first questions are relaxed. It turns serious from the test-score questions.",
  ],
  ["buka", 2, "keaktifan", "Kelebihan (cek CV)", "Strengths (check the CV)"],
  [
    "buka",
    2,
    "profesional",
    "Kekurangan dan cara mengatasinya (cek CV)",
    "Weaknesses and how they cope (check the CV)",
  ],
  [
    "buka",
    1,
    "keaktifan",
    "Skill selain bahasa C (minta portofolio)",
    "Skills beyond C (ask for a portfolio)",
    "Jangan beri contoh dulu. Beri contoh hanya bila mereka sudah selesai dan tidak menyebut apa pun.",
    "Don't give examples first. Only if they finish without naming any.",
  ],
  [
    "buka",
    0.5,
    "komitmen",
    "Siap jika bahasa praktikum diganti?",
    "Ready if the practicum language changes?",
    "Jawaban yang diharapkan: siap.",
    "The expected answer: ready.",
  ],
  [
    "buka",
    1.5,
    "profesional",
    "Sulit bangun pagi?",
    "Hard to wake up early?",
    "Bila menjawab sulit, lanjutkan: bagaimana kalau jadwalnya pagi?",
    "If they say yes, follow up: and if the shift is in the morning?",
  ],
  [
    "buka",
    1.5,
    "komitmen",
    "Kenapa tertarik pada bahasa C dan pemrograman",
    "Why they like C and programming",
  ],
  [
    "santai",
    2,
    "profesional",
    "Arti pemimpin dan gaya kepemimpinannya",
    "What a leader is and their style",
  ],
  [
    "santai",
    2,
    "profesional",
    "Anggota tim banyak menentang: apa yang dilakukan",
    "Most of the team pushes back: what do they do",
  ],
  [
    "santai",
    1.5,
    "profesional",
    "Cara mengukur keberhasilan sebuah tim",
    "How they measure a team's success",
  ],
  [
    "santai",
    2,
    "profesional",
    "Tim yang tidak sesuai harapan: sikapnya",
    "A team that falls short: their attitude",
  ],
  [
    "santai",
    1.5,
    "komitmen",
    "Kesibukan lain sekarang",
    "Other commitments now",
    "Kuliah, UKM, organisasi, rekrutmen lain, dan seterusnya.",
    "Classes, clubs, organisations, other recruitments and so on.",
  ],
  ["santai", 1.5, "komitmen", "Kegiatan lain setelah diterima", "Other activities after joining"],
  [
    "serius",
    2,
    "attitude",
    "Kejujuran saat tes tulis dan tes koding",
    "Honesty during the written and coding tests",
    "Mulai dari sini suasana lebih serius.",
    "From here on, the room is more serious.",
  ],
  [
    "serius",
    1,
    "konsisten",
    "Tebak nilai tes tulis dan tes koding",
    "Guess the written and coding test scores",
  ],
  [
    "serius",
    2,
    "attitude",
    "Beri tahu nilai sebenarnya, tanya apakah layak jadi asisten",
    "Tell the real scores; ask if they deserve to be an assistant",
    "Nilai sebenarnya ada di tombol di bawah. Hanya kartu ini yang menampilkannya.",
    "The real scores are behind the button below. Only this card shows them.",
  ],
  [
    "serius",
    3,
    "konsisten",
    "Tujuan, visi, misi dan motivasi",
    "Goal, vision, mission and motivation",
    "Cocokkan dengan CV: konsisten atau tidak.",
    "Check against the CV: consistent or not.",
  ],
  [
    "serius",
    1.5,
    "keaktifan",
    "Inovasi untuk lab bila sudah jadi asisten",
    "Ideas for the lab once an assistant",
  ],
  ["serius", 1, "keaktifan", "Pernah terlibat proyek atau riset", "Past projects or research"],
  ["serius", 1, "komitmen", "Bersedia ikut riset di lab", "Willing to join lab research"],
  [
    "serius",
    2,
    "keaktifan",
    "Yang dia ketahui tentang pekerjaan asisten lab",
    "What they know of an assistant's job",
    "Kalau hanya menjawab mengajar, tanyakan lagi.",
    "If they only say teaching, ask again.",
  ],
  [
    "serius",
    1.5,
    "komitmen",
    "Kenapa memilih lab ini",
    "Why this lab",
    "Sekitar separuh pertanyaan inti ada di kartu ini.",
    "About half the core questions sit on this card.",
  ],
  [
    "serius",
    1.5,
    "profesional",
    "Gaji yang diharapkan dan shift per minggu",
    "Expected pay and shifts a week",
    "Bila meminta Rp 50.000 atau lebih, tanya apakah itu layak untuknya.",
    "If they ask for Rp 50,000 or more, ask whether that is fair for them.",
  ],
  ["serius", 1, "attitude", "Kode asisten yang diinginkan", "Preferred assistant code"],
  [
    "serius",
    2,
    "profesional",
    "Lebih sibuk bila diterima: bagaimana mengatur waktu",
    "Busier once accepted: how they manage time",
  ],
  [
    "serius",
    2,
    "profesional",
    "Skala prioritas sekarang, dalam persen",
    "Priorities today, in percent",
  ],
  [
    "serius",
    2,
    "profesional",
    "Skala prioritas setelah jadi asisten, dalam persen",
    "Priorities as an assistant, in percent",
  ],
  [
    "serius",
    1,
    "komitmen",
    "Riwayat kesehatan dan cara menjaganya",
    "Health history and how they manage it",
  ],
  [
    "serius",
    4,
    "profesional",
    "Studi kasus praktikan (pilih beberapa saja)",
    "Praktikan case studies (pick a few)",
    "Tidak perlu semuanya. Pilih yang paling relevan dengan jawaban sebelumnya.",
    "Not all of them. Pick what fits their earlier answers.",
  ],
  [
    "inggris",
    4,
    "attitude",
    "In English: asisten ideal menurutmu seperti apa",
    "In English: what an ideal assistant is",
    "Dua pertanyaan berikutnya dalam bahasa Inggris. Beri tahu CaAs lebih dulu.",
    "The next two are in English. Tell the CaAs first.",
  ],
  [
    "inggris",
    2.5,
    "profesional",
    "In English: sudahkah kamu memenuhi kriteria itu",
    "In English: do you meet those criteria",
  ],
  [
    "inggris",
    2.5,
    "profesional",
    "Arti sikap profesional menurutnya",
    "What being professional means to them",
  ],
  [
    "inggris",
    2,
    "komitmen",
    "Sikap hilang-hilangan: profesional atau tidak",
    "Going missing: professional or not",
  ],
  [
    "inggris",
    3,
    "komitmen",
    "Komitmen dan konsekuensi bila hilang-hilangan",
    "Commitment and the consequence of vanishing",
    "Bila dia menawarkan keluar atau denda, jawab bahwa konsekuensinya masuk daftar hitam semua rekrutmen lab FTE.",
    "If they offer to leave or pay a fine, answer that it means a blacklist from every FTE lab recruitment.",
  ],
  [
    "khusus",
    3,
    "komitmen",
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
    "Mendaftar lab lain: mana yang diutamakan",
    "Applying to another lab: which comes first",
    "Hanya untuk CaAs yang juga mendaftar lab lain.",
    "Only for CaAs who also applied to another lab.",
    "lab",
  ],
  ["tutup", 1.5, "komitmen", "Alasan agar kami yakin menerima kamu", "Why we should accept you"],
  ["tutup", 2, "komitmen", "Nazar bila diterima", "Vow if accepted"],
  [
    "tutup",
    1.5,
    "konsisten",
    "Pengecekan berkas (tanya alasannya bila ada yang kurang)",
    "File check (ask why if something is missing)",
  ],
  [
    "tutup",
    0,
    "keaktifan",
    "Pertanyaan bebas (opsional, bila waktu masih ada)",
    "Free questions (optional, if time is left)",
  ],
  ["tutup", 0.5, "attitude", "Tahu rekrutmen ini dari mana", "How they heard of this recruitment"],
  [
    "tutup",
    3,
    "keaktifan",
    "Ada yang ingin ditanyakan tentang lab",
    "Anything they want to ask about the lab",
    "Beri kesempatan. Bila tidak ada, langsung tutup.",
    "Give them the chance. If none, close.",
  ],
];

const WAW_QUESTIONS: IvQuestion[] = QS.map(([g, m, p, id, en, hid, hen, only], i) => ({
  id: `q${i + 1}`,
  g,
  m,
  p,
  t: b(id, en),
  h: hid ? b(hid, hen ?? hid) : null,
  only: only ?? null,
  ...(en.startsWith("Tell the real scores") ? { reveal: true } : {}),
}));

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
    pjIn: 3,
    minutes: 105,
    maxMinutes: 120,
    gap: 0,
    late: 10,
    excuse: 30,
    hideLevels: true,
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
    hideLevels: true,
  },
};

/* ------------------------------------------------------------ the check of a saved template */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
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
    const weight = num(raw.weight, 0.1, 10);
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
    const only = raw.only === "fm" || raw.only === "lab" ? raw.only : null;
    if (!id || !t || !g || m === null || !p || (raw.h && !h) || qids.has(id)) return null;
    qids.add(id);
    questions.push({ id, g, m, p, t, h, only, ...(raw.reveal === true ? { reveal: true } : {}) });
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
  if (
    per === null ||
    pjOut === null ||
    pjIn === null ||
    minutes === null ||
    maxMinutes === null ||
    gap === null ||
    late === null ||
    excuse === null ||
    maxMinutes < minutes
  )
    return null;
  const wide = num(v.wide, 1, 100);
  if (wide === null) return null;
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
    hideLevels: v.hideLevels !== false,
  };
}

/* ------------------------------------------------------------ scoring */

/** Weighted level over min..max per parameter, out of 100. Parameters not yet set are left out. */
export function sheetScore(levels: Record<string, number>, params: readonly IvParam[]): number {
  let num = 0;
  let den = 0;
  for (const p of params) {
    const v = levels[p.key];
    if (typeof v !== "number") continue;
    num += (p.weight * (v - p.min)) / (p.max - p.min);
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
): number | null =>
  sheets.length
    ? sheets.reduce((a, s) => a + sheetScore(s.levels, params), 0) / sheets.length
    : null;

/** The gap between the highest and lowest examiner, or null with fewer than two sheets. */
export function spreadScore(
  sheets: readonly SheetLevels[],
  params: readonly IvParam[],
): number | null {
  if (sheets.length < 2) return null;
  const sc = sheets.map((s) => sheetScore(s.levels, params));
  return Math.max(...sc) - Math.min(...sc);
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

export const CASE_KINDS = ["telat", "absen", "sakit", "nametag", "keluar"] as const;
export type CaseKind = (typeof CASE_KINDS)[number];
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
