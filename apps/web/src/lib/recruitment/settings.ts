/**
 * Editable oprec settings (user, 2026-10-28: anything that can reasonably be
 * edited is editable by the right Panitia role). One registry: each key has a
 * default, a checker that returns the cleaned value or null, and the committee
 * divisions that may change it. The values live in `pengaturan` (no
 * migration); no row means the default. Pure, so the API and the pages share
 * the checks. The API (api/_lib/recruitment-settings.ts) writes an audit line
 * with the before and after of every change.
 *
 * Events (Kalender), slots (Plotting), the exam parts config and the bank
 * already have their own edit surfaces; this registry holds the rest.
 */
import type { CommitteeDivision, DocKind } from "./types.js";

export const SETTING_PREFIX = "rec_cfg_";

export type SettingKey = "docs" | "words" | "cutting";

export interface DocSetting {
  /** One of DOC_KINDS; the `kind` stored with an upload. The keys never change once stored. */
  kind: DocKind;
  label: { id: string; en: string };
  required: boolean;
  /** "pdf" is uploaded; "typed" is written in the form. */
  mode: "pdf" | "typed";
  maxMb: number;
}

/**
 * One envelope's wording in one language: the heading and the line for a CaAs
 * who passed and for one who did not. A missing field keeps the built-in text.
 * `{nama}` in a line becomes the CaAs's first name.
 */
export interface WordSide {
  lolosTitle?: string;
  lolosLine?: string;
  gagalTitle?: string;
  gagalLine?: string;
}
export interface WordSetting {
  id?: WordSide;
  en?: WordSide;
}
export const WORD_FIELDS = ["lolosTitle", "lolosLine", "gagalTitle", "gagalLine"] as const;
export type WordField = (typeof WORD_FIELDS)[number];
/** The longest heading and line an editor may write. */
export const WORD_MAX: Record<WordField, number> = {
  lolosTitle: 60,
  lolosLine: 400,
  gagalTitle: 60,
  gagalLine: 400,
};

/**
 * Where a Cutting starts: the Top N and the minimum score the threshold card
 * opens on, and the range of CaAs the deck aims to pass (PRD 3, Targets).
 */
export interface CuttingSetting {
  top: number;
  minScore: number;
  targetMin: number;
  targetMax: number;
}

export const ENVELOPE_KEYS = [
  "berkas",
  "tulis",
  "wawancara",
  "tubes",
  "mengajar",
  "penerimaan",
] as const;
export type EnvelopeKey = (typeof ENVELOPE_KEYS)[number];
export const CUTTING_STAGES = ["berkas", "tes_tulis"] as const;

export interface SettingMap {
  docs: DocSetting[];
  words: Partial<Record<EnvelopeKey, WordSetting>>;
  cutting: Record<string, CuttingSetting>;
}

export interface SettingDef<K extends SettingKey> {
  key: K;
  /** Short name for the audit line and the edit surface. */
  label: { id: string; en: string };
  /** Divisions that may change it (hakPenuh always may). */
  roles: readonly CommitteeDivision[];
  /** The value used while no row exists. */
  def: SettingMap[K];
  /** The cleaned value, or null when the input is not acceptable. */
  check: (v: unknown) => SettingMap[K] | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
};
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

const DOC_LABELS: Partial<Record<DocKind, [string, string]>> = {
  biodata: ["Biodata", "Biodata"],
  cv: ["CV ATS", "ATS CV"],
  vision: ["Visi Misi", "Vision and Mission"],
  khs: ["KHS", "KHS"],
  ksm: ["KSM", "KSM"],
  ktm: ["KTM", "KTM"],
  portofolio: ["Portofolio", "Portfolio"],
};

/** The documents of the 2026 edition (types.ts DOC_KINDS and DOC_REQUIRED), as editable defaults. */
export const DOCS_DEFAULT: DocSetting[] = (
  Object.entries(DOC_LABELS) as [DocKind, [string, string]][]
).map(([kind, [id, en]]) => ({
  kind,
  label: { id, en },
  required: kind !== "portofolio",
  mode: "pdf",
  maxMb: 5,
}));

function checkDocs(v: unknown): DocSetting[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 20) return null;
  const out: DocSetting[] = [];
  const seen = new Set<string>();
  for (const r of v) {
    if (!isObj(r) || !isObj(r.label)) return null;
    const kind =
      typeof r.kind === "string" && /^[a-z][a-z0-9_]{1,23}$/.test(r.kind) ? r.kind : null;
    const id = txt(r.label.id, 40);
    const en = txt(r.label.en, 40);
    const maxMb = int(r.maxMb, 1, 25);
    if (!kind || !id || !en || maxMb === null || seen.has(kind)) return null;
    if (typeof r.required !== "boolean" || (r.mode !== "pdf" && r.mode !== "typed")) return null;
    seen.add(kind);
    out.push({
      kind: kind as DocKind,
      label: { id, en },
      required: r.required,
      mode: r.mode,
      maxMb,
    });
  }
  return out;
}

function checkSide(s: unknown): WordSide | null {
  if (!isObj(s)) return null;
  const out: WordSide = {};
  for (const [k, v] of Object.entries(s)) {
    if (!(WORD_FIELDS as readonly string[]).includes(k)) return null;
    const t = txt(v, WORD_MAX[k as WordField]);
    if (t === null) return null;
    out[k as WordField] = t;
  }
  return out;
}

function checkWords(v: unknown): SettingMap["words"] | null {
  if (!isObj(v)) return null;
  const out: SettingMap["words"] = {};
  for (const [k, w] of Object.entries(v)) {
    if (!(ENVELOPE_KEYS as readonly string[]).includes(k) || !isObj(w)) return null;
    const entry: WordSetting = {};
    for (const lang of ["id", "en"] as const) {
      if (w[lang] === undefined) continue;
      const side = checkSide(w[lang]);
      if (!side) return null;
      if (Object.keys(side).length) entry[lang] = side;
    }
    if (entry.id || entry.en) out[k as EnvelopeKey] = entry;
  }
  return out;
}

/** The setting key of a stage's envelope (the Written Test is "tulis"). */
export const envelopeKey = (stage: string): EnvelopeKey | null =>
  stage === "tes_tulis"
    ? "tulis"
    : (ENVELOPE_KEYS as readonly string[]).includes(stage)
      ? (stage as EnvelopeKey)
      : null;

/** The wording the editors set for one stage's envelope in one language; empty where the built-in text stands. */
export function wordsFor(
  words: SettingMap["words"] | undefined,
  stage: string,
  lang: "id" | "en",
): WordSide {
  const k = envelopeKey(stage);
  return (k && words?.[k]?.[lang]) || {};
}

/** A line with `{nama}` filled in. */
export const isiNama = (line: string, nama: string): string => line.replaceAll("{nama}", nama);

/** The built-in start of each Cutting that has an edit surface (the 2026 numbers). */
export const CUTTING_DEFAULT: Record<(typeof CUTTING_STAGES)[number], CuttingSetting> = {
  berkas: { top: 90, minScore: 0, targetMin: 80, targetMax: 100 },
  tes_tulis: { top: 60, minScore: 2000, targetMin: 60, targetMax: 80 },
};

function checkCutting(v: unknown): SettingMap["cutting"] | null {
  if (!isObj(v)) return null;
  const out: SettingMap["cutting"] = {};
  for (const [stage, c] of Object.entries(v)) {
    if (!(CUTTING_STAGES as readonly string[]).includes(stage) || !isObj(c)) return null;
    const top = int(c.top, 1, 500);
    const minScore = int(c.minScore, 0, 4000);
    const targetMin = int(c.targetMin, 1, 500);
    const targetMax = int(c.targetMax, 1, 500);
    if (top === null || minScore === null || targetMin === null || targetMax === null) return null;
    if (targetMin > targetMax) return null;
    out[stage] = { top, minScore, targetMin, targetMax };
  }
  return out;
}

/** The start of one Cutting: what the editors set, or the built-in numbers; null where a stage has none. */
export function cuttingFor(
  map: SettingMap["cutting"] | undefined,
  stage: string,
): CuttingSetting | null {
  if (!(CUTTING_STAGES as readonly string[]).includes(stage)) return null;
  const k = stage as (typeof CUTTING_STAGES)[number];
  return map?.[k] ?? CUTTING_DEFAULT[k];
}

export const SETTINGS: { [K in SettingKey]: SettingDef<K> } = {
  docs: {
    key: "docs",
    label: { id: "Dokumen yang dikirim CaAs", en: "Documents a CaAs sends" },
    roles: ["ketua", "admin"],
    def: DOCS_DEFAULT,
    check: checkDocs,
  },
  words: {
    key: "words",
    label: { id: "Teks amplop", en: "Envelope wording" },
    roles: ["ketua", "akademik"],
    def: {},
    check: checkWords,
  },
  cutting: {
    key: "cutting",
    label: { id: "Titik awal Cutting", en: "Cutting starting point" },
    roles: ["ketua", "akademik"],
    def: {},
    check: checkCutting,
  },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const isSettingKey = (k: unknown): k is SettingKey =>
  typeof k === "string" && (SETTING_KEYS as string[]).includes(k);
export const settingRow = (k: SettingKey) => `${SETTING_PREFIX}${k}`;

/** Whether a division (or hakPenuh) may change this setting. */
export const bolehUbah = (
  k: SettingKey,
  p: { penuh: boolean; kursi: { division: string } | null } | null,
): boolean =>
  !!p &&
  (p.penuh || (!!p.kursi && (SETTINGS[k].roles as readonly string[]).includes(p.kursi.division)));
