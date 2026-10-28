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
import { DOC_KINDS, type CommitteeDivision, type DocKind } from "./types.js";

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

/** One envelope's wording: a title and a body, in both languages. */
export interface WordSetting {
  id: { title: string; body: string };
  en: { title: string; body: string };
}

/** Where the Cutting starts and how many the deck aims for, per stage. */
export interface CuttingSetting {
  top: number;
  min: number;
  target: number;
}

export const ENVELOPE_KEYS = ["berkas", "tulis", "wawancara", "tubes", "mengajar"] as const;
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

function checkWords(v: unknown): SettingMap["words"] | null {
  if (!isObj(v)) return null;
  const out: SettingMap["words"] = {};
  for (const [k, w] of Object.entries(v)) {
    if (!(ENVELOPE_KEYS as readonly string[]).includes(k) || !isObj(w)) return null;
    const side = (s: unknown) =>
      isObj(s) && txt(s.title, 80) && txt(s.body, 600)
        ? { title: txt(s.title, 80)!, body: txt(s.body, 600)! }
        : null;
    const id = side(w.id);
    const en = side(w.en);
    if (!id || !en) return null;
    out[k as EnvelopeKey] = { id, en };
  }
  return out;
}

function checkCutting(v: unknown): SettingMap["cutting"] | null {
  if (!isObj(v)) return null;
  const out: SettingMap["cutting"] = {};
  for (const [stage, c] of Object.entries(v)) {
    if (!(CUTTING_STAGES as readonly string[]).includes(stage) || !isObj(c)) return null;
    const top = int(c.top, 1, 500);
    const min = int(c.min, 0, 100);
    const target = int(c.target, 1, 500);
    if (top === null || min === null || target === null) return null;
    out[stage] = { top, min, target };
  }
  return out;
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
