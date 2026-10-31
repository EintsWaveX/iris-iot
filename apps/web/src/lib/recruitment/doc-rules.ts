/**
 * The documents a CaAs sends, as the Ketua and Admin set them (Atur Berkas,
 * settings.ts "docs"). The edition response carries the list; this turns it
 * into what the screens need and falls back to the 2026 defaults while it is
 * not loaded. Browser safe.
 */
import type { Lang } from "../kelas";
import { useRecEdition } from "./client";
import { DOCS_DEFAULT, type DocSetting } from "./settings";
import { DOC_MAX_BYTES, type DocKind } from "./types";

export interface DocRules {
  docs: DocSetting[];
  required: DocKind[];
  optional: DocKind[];
  /** A name for the screen: the edited one, else the translated fallback. */
  label(kind: DocKind, lang: Lang, fallback: string): string;
  maxBytes(kind: DocKind): number;
}

export function docRules(docs: readonly DocSetting[] = DOCS_DEFAULT): DocRules {
  const base = new Map(DOCS_DEFAULT.map((d) => [d.kind, d]));
  return {
    docs: [...docs],
    required: docs.filter((d) => d.required).map((d) => d.kind),
    optional: docs.filter((d) => !d.required).map((d) => d.kind),
    label(kind, lang, fallback) {
      const d = docs.find((x) => x.kind === kind);
      if (!d) return fallback;
      const b = base.get(kind);
      const edited = !b || b.label.id !== d.label.id || b.label.en !== d.label.en;
      return edited ? (lang === "id" ? d.label.id : d.label.en) : fallback;
    },
    maxBytes(kind) {
      const d = docs.find((x) => x.kind === kind);
      return d ? d.maxMb * 1024 * 1024 : DOC_MAX_BYTES;
    },
  };
}

/** The rules as the signed-in page sees them. */
export function useDocRules(): DocRules {
  const docs = useRecEdition().data?.docs;
  return docRules(docs ?? DOCS_DEFAULT);
}
