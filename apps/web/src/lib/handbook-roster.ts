/**
 * The handbook's assistant roster, parsed from the vendored
 * scripts/data_asisten.typ (the same parse as scripts/seed_asisten.py, which
 * seeds the table). The Tim page's Impor (Phase 9 mockup t-list) matches the
 * table against it. Phone numbers and Line IDs are never read.
 */
import { isDivisi, type Divisi } from "./hak.js";

export interface HandbookAsisten {
  nim: string;
  nama: string;
  kode: string;
  /** The handbook's division key: "ketua", "k-ASO", "ASO", ... */
  kunci: string;
  /** ASO, ARD, ...; null for the Inti (ketua, wakil, sekretaris, bendahara). */
  divisi: Divisi | null;
  divisiId: string;
  divisiEn: string;
}

// Phase 9 rulings on top of the finalized handbook (seed_asisten.py has the same).
export const KODE_BARU: Record<string, string> = { RGZ: "REG", FAT: "TIR" };
export const NAMA_BARU: Record<string, string> = { NUE: "Immanuel Eben Haezer Joseph Aletheia" };

const DIVISION_RE =
  /"(?<key>[\w-]+)"\s*:\s*\(\s*id:\s*"(?<id>[^"]*)"\s*,\s*en:\s*"(?<en>[^"]*)"\s*\)/g;
const ASISTEN_RE =
  /div-id:\s*divisions\.at\("(?<divkey>[\w-]+)"\)\.id\s*,\s*div-en:\s*divisions\.at\("[\w-]+"\)\.en\s*,\s*nim:\s*"(?<nim>\d+)"\s*,\s*nama:\s*"(?<nama>[^"]*)"\s*,\s*kode:\s*"(?<kode>[^"]*)"/g;

/** The parenthesised body of `#let <name> = ( ... )`, nested parens included. */
function block(text: string, name: string): string {
  const start = text.indexOf(`#let ${name}`);
  if (start < 0) throw new Error(`#let ${name} not found`);
  const open = text.indexOf("(", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open, i + 1);
  }
  throw new Error(`unbalanced parentheses in #let ${name}`);
}

export function parseHandbookRoster(text: string): HandbookAsisten[] {
  const divisions = new Map<string, { id: string; en: string }>();
  for (const m of block(text, "divisions").matchAll(DIVISION_RE)) {
    const g = m.groups!;
    divisions.set(g.key, { id: g.id, en: g.en });
  }
  const out: HandbookAsisten[] = [];
  const seen = new Set<string>();
  for (const m of block(text, "asistens").matchAll(ASISTEN_RE)) {
    const g = m.groups!;
    const div = divisions.get(g.divkey);
    if (!div) throw new Error(`unknown division ${g.divkey}`);
    if (seen.has(g.nim)) throw new Error(`duplicate NIM ${g.nim}`);
    seen.add(g.nim);
    const kodeAsli = g.kode.trim();
    const d = g.divkey.replace(/^k-/, "");
    out.push({
      nim: g.nim,
      nama: NAMA_BARU[kodeAsli] ?? g.nama.trim(),
      kode: KODE_BARU[kodeAsli] ?? kodeAsli,
      kunci: g.divkey,
      divisi: isDivisi(d) ? d : null,
      divisiId: div.id,
      divisiEn: div.en,
    });
  }
  if (!out.length) throw new Error("no assistants in #let asistens");
  return out;
}
