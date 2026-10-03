/**
 * Phase 8: post-practicum feedback, in the journal's two sections (Asisten
 * and Lab). Ratings are 1-5; each section also takes a few quick-pick
 * chips (stored as stable keys, labelled per language in the UI) and an
 * optional comment. Summaries never carry the student's NIM: feedback is
 * anonymous to every assistant.
 */
export const CHIPS_ASISTEN = ["jelas", "sabar", "cepat", "kurang_jelas", "sulit_ditemui"] as const;
export const CHIPS_LAB = [
  "alat_lengkap",
  "wifi_stabil",
  "alat_rusak",
  "ruang_panas",
  "waktu_kurang",
] as const;
export const KOMENTAR_MAX = 500;

export const LABEL_CHIP: Record<string, { id: string; en: string; zh: string }> = {
  jelas: { id: "Penjelasan jelas", en: "Clear explanations", zh: "讲解清楚" },
  sabar: { id: "Sabar", en: "Patient", zh: "有耐心" },
  cepat: { id: "Cepat membantu", en: "Quick to help", zh: "帮忙很快" },
  kurang_jelas: { id: "Perlu lebih jelas", en: "Could be clearer", zh: "可以更清楚" },
  sulit_ditemui: { id: "Sulit ditemui", en: "Hard to reach", zh: "很难找到" },
  alat_lengkap: { id: "Alat lengkap", en: "Tools complete", zh: "器材齐全" },
  wifi_stabil: { id: "Wi-Fi stabil", en: "Stable Wi-Fi", zh: "Wi-Fi 稳定" },
  alat_rusak: { id: "Alat rusak", en: "Broken tools", zh: "器材坏了" },
  ruang_panas: { id: "Ruangan panas", en: "Room too hot", zh: "教室太热" },
  waktu_kurang: { id: "Waktu kurang", en: "Not enough time", zh: "时间不够" },
};

export interface UmpanBalikInput {
  asistenNim: string;
  ratingAsisten: number;
  komentarAsisten: string | null;
  chipsAsisten: string[];
  ratingLab: number;
  komentarLab: string | null;
  chipsLab: string[];
}

type Hasil =
  | { ok: true; nilai: UmpanBalikInput }
  | { ok: false; kode: "format_salah" | "butuh_alasan"; bagian?: "asisten" | "lab" };

/** A rating at or below this needs a reason: a quick-pick chip, or a
 *  comment that says something. Without one a 1 star is noise the
 *  assistant can neither learn from nor answer. */
export const RATING_BUTUH_ALASAN = 2;

/** At least two real words (two or more letters, with a vowel), so "asdf"
 *  or a row of keyboard mash does not count as a reason. */
export function komentarBermakna(teks: string | null | undefined): boolean {
  const kata = (teks ?? "").toLowerCase().match(/\p{L}{2,}/gu) ?? [];
  return kata.filter((k) => /[aeiouy]/.test(k)).length >= 2;
}

/** True when this section's rating is low and nothing says why. */
export function kurangAlasan(
  rating: number,
  chips: readonly string[],
  komentar: string | null,
): boolean {
  return rating <= RATING_BUTUH_ALASAN && chips.length === 0 && !komentarBermakna(komentar);
}

function rating(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** undefined = invalid, null = empty. */
function komentar(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t.length > KOMENTAR_MAX) return undefined;
  return t.length ? t : null;
}

function chips(v: unknown, boleh: readonly string[]): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const c of v) {
    if (typeof c !== "string" || !boleh.includes(c)) return null;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export function validasiUmpanBalik(body: Record<string, unknown>): Hasil {
  const asistenNim = typeof body.asistenNim === "string" ? body.asistenNim.trim() : "";
  const ra = rating(body.ratingAsisten);
  const rl = rating(body.ratingLab);
  const ka = komentar(body.komentarAsisten);
  const kl = komentar(body.komentarLab);
  const ca = chips(body.chipsAsisten, CHIPS_ASISTEN);
  const cl = chips(body.chipsLab, CHIPS_LAB);
  if (
    !asistenNim ||
    ra === null ||
    rl === null ||
    ka === undefined ||
    kl === undefined ||
    ca === null ||
    cl === null
  ) {
    return { ok: false, kode: "format_salah" };
  }
  if (kurangAlasan(ra, ca, ka)) return { ok: false, kode: "butuh_alasan", bagian: "asisten" };
  if (kurangAlasan(rl, cl, kl)) return { ok: false, kode: "butuh_alasan", bagian: "lab" };
  return {
    ok: true,
    nilai: {
      asistenNim,
      ratingAsisten: ra,
      komentarAsisten: ka,
      chipsAsisten: ca,
      ratingLab: rl,
      komentarLab: kl,
      chipsLab: cl,
    },
  };
}

export interface Ringkasan {
  jumlah: number;
  /** One decimal, or null when there is nothing yet. */
  rataRata: number | null;
  /** Count of ratings 1..5. */
  sebaran: [number, number, number, number, number];
  /** Most frequent first. */
  chips: { chip: string; n: number }[];
  /** Newest first, never with an author. */
  komentar: { teks: string; pada: string }[];
}

export interface BarisRingkas {
  rating: number;
  komentar: string | null;
  chips: readonly string[];
  pada: Date;
}

export function ringkas(rows: readonly BarisRingkas[]): Ringkasan {
  const sebaran: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const hitung = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    sebaran[r.rating - 1]++;
    total += r.rating;
    for (const c of r.chips) hitung.set(c, (hitung.get(c) ?? 0) + 1);
  }
  const komentar = rows
    .filter((r) => r.komentar)
    .slice()
    .sort((a, b) => b.pada.getTime() - a.pada.getTime())
    .map((r) => ({ teks: r.komentar as string, pada: r.pada.toISOString() }));
  return {
    jumlah: rows.length,
    rataRata: rows.length ? Math.round((total / rows.length) * 10) / 10 : null,
    sebaran,
    chips: [...hitung.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([chip, n]) => ({ chip, n })),
    komentar,
  };
}
