/**
 * Phase 8: the practicum's two class types and the language each implies.
 * Reguler classes use the Indonesian UI, the International class uses the
 * English one. That is only the default: praktikan and assistants can both
 * pick their own language, and that choice wins (see resolveLang).
 *
 * Kept free of drizzle so client code can import it; schema.ts re-exports
 * KELAS for the column enums.
 */
export const KELAS = ["reguler", "internasional"] as const;
export type Kelas = (typeof KELAS)[number];

/** Phase 9: Mandarin (Simplified) is the third interface language, under
 *  /zh/. The handbook, journals and sketches stay Indonesian and English,
 *  so a Mandarin reader gets the English content (bahasaKonten). */
export type Lang = "id" | "en" | "zh";
export const LANGS: readonly Lang[] = ["id", "en", "zh"];

/** The language content exists in (modules, handbook, sketches, journals). */
export type BahasaKonten = "id" | "en";

export function bahasaKonten(lang: Lang): BahasaKonten {
  return lang === "id" ? "id" : "en";
}

/** The BCP 47 tag for <html lang> and Intl formatting. */
export function langTag(lang: Lang): string {
  return lang === "zh" ? "zh-Hans" : lang;
}

/** Cookie + localStorage key for a person's own language choice. */
export const LANG_PREF_KEY = "iris-lang";

export function isKelas(v: unknown): v is Kelas {
  return typeof v === "string" && (KELAS as readonly string[]).includes(v);
}

export function isLang(v: unknown): v is Lang {
  return v === "id" || v === "en" || v === "zh";
}

/** The language a class type defaults to. */
export function langForKelas(kelas: Kelas | null | undefined): Lang {
  return kelas === "internasional" ? "en" : "id";
}

/**
 * The language to render in: an explicit personal choice first, then the
 * running session's class, then Indonesian. `pref` is whatever was read
 * from the cookie or localStorage, so anything malformed is ignored.
 */
export function resolveLang(pref: unknown, kelas: Kelas | null | undefined): Lang {
  if (isLang(pref)) return pref;
  return langForKelas(kelas);
}

/**
 * Map a path to its counterpart in another language, keeping the same
 * page: "/modules/2/live" <-> "/en/modules/2/live" <-> "/zh/modules/2/live",
 * "/" <-> "/en/" <-> "/zh/". Query and hash are preserved.
 */
export function pathForLang(path: string, lang: Lang): string {
  const m = /^([^?#]*)(.*)$/.exec(path);
  const pathname = m ? m[1] : path;
  const rest = m ? m[2] : "";
  const bare = /^\/(en|zh)$/.test(pathname)
    ? "/"
    : /^\/(en|zh)\//.test(pathname)
      ? pathname.slice(3)
      : pathname;
  if (lang === "id") return (bare || "/") + rest;
  return (bare === "/" ? `/${lang}/` : `/${lang}` + bare) + rest;
}

/** The language a path is in, from its prefix. */
export function langOfPath(pathname: string): Lang {
  const m = /^\/(en|zh)(\/|$)/.exec(pathname);
  return m ? (m[1] as Lang) : "id";
}
