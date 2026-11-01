/**
 * Penerimaan and Jadikan Asisten (Open Recruitment R8), pure: the three-letter
 * code proposed for each accepted CaAs, and the checks a list of codes must pass
 * before the Ketua confirms. Nothing here talks to the database; the API
 * (api/_lib/recruitment-s5.ts) feeds it the codes already taken.
 */

export const KODE_RE = /^[A-Z]{3}$/;

export const normKode = (v: unknown): string =>
  typeof v === "string" ? v.trim().toUpperCase() : "";

/** The letters of a name, one word at a time, with accents and punctuation dropped. */
function kata(nama: string): string[] {
  return nama
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

/**
 * A code that is free: the first letters of the first three words, then the
 * first three letters of the first name, the first letter of each word plus the
 * second letter of the first, the first and last two letters, and at last any
 * three letters from the name in order. The first one not in `taken` wins; null
 * when the name offers none (fewer than three letters).
 */
export function usulKode(nama: string, taken: ReadonlySet<string>): string | null {
  const w = kata(nama);
  const letters = w.join("");
  if (letters.length < 3) return null;
  const tries: string[] = [];
  const add = (s: string) => {
    if (s.length === 3 && !tries.includes(s)) tries.push(s);
  };
  if (w.length >= 3) add(w[0][0] + w[1][0] + w[2][0]);
  add(w[0].slice(0, 3));
  if (w.length >= 2) {
    add(w[0][0] + w[w.length - 1].slice(0, 2));
    add(w[0].slice(0, 2) + w[w.length - 1][0]);
    add(w[0][0] + w[1][0] + (w[0][1] ?? w[1][1] ?? ""));
  }
  add(letters.slice(0, 3));
  // Any three letters of the name in order, scanning from the front.
  for (let i = 0; i < letters.length; i++)
    for (let j = i + 1; j < letters.length; j++)
      for (let k = j + 1; k < letters.length; k++) add(letters[i] + letters[j] + letters[k]);
  return tries.find((c) => !taken.has(c)) ?? null;
}

export type KodeProblem = "format" | "ganda" | "dipakai" | "kosong";

export interface KodeCek {
  id: number;
  code: string;
  problem: KodeProblem | null;
}

/**
 * Every accepted CaAs needs a code that is three letters, unique inside the
 * list and not held by an Asisten (or another new one) already. `taken` is the
 * codes of existing Asisten. Returns one row per item in order.
 */
export function cekKode(
  items: readonly { id: number; code: string | null }[],
  taken: ReadonlySet<string>,
): KodeCek[] {
  const hitung = new Map<string, number>();
  for (const i of items) {
    const c = normKode(i.code);
    if (c) hitung.set(c, (hitung.get(c) ?? 0) + 1);
  }
  return items.map((i) => {
    const code = normKode(i.code);
    let problem: KodeProblem | null = null;
    if (!code) problem = "kosong";
    else if (!KODE_RE.test(code)) problem = "format";
    else if ((hitung.get(code) ?? 0) > 1) problem = "ganda";
    else if (taken.has(code)) problem = "dipakai";
    return { id: i.id, code, problem };
  });
}

/** The day the edition closes by itself: N days after the reveal, or null with no reveal yet. */
export function tutupOtomatis(revealAt: Date | null, hari: number): Date | null {
  return revealAt ? new Date(revealAt.getTime() + hari * 86_400_000) : null;
}

/** When the documents and answers are purged: the retention months after the edition closed. */
export function simpanSampai(tutup: Date, bulan: number): Date {
  const d = new Date(tutup);
  d.setUTCMonth(d.getUTCMonth() + bulan);
  return d;
}
