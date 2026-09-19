/**
 * The roster paste grammar — ported unchanged from parsePaste() in
 * hunt/src/ui-assistant.js. Same regexes, same rules, on purpose: this
 * grammar is already proven (it shipped, it is documented in
 * hunt/SETUP.md section 4, and assistants have been taught it), so this
 * port is a translation to TypeScript, not a redesign.
 *
 *   #N Label            opens group N; label is optional and may be
 *                        repeated on a later #N line to rename it
 *   NIM<sep>Name         a member line; separator is a comma, semicolon,
 *                        tab, or any whitespace run
 *   NIM                  a bare ID with no name is still a member
 *
 * One difference from the original: this version returns error CODES
 * rather than pre-translated strings, matching the pattern this project
 * settled on for hunt/'s login refusals (server emits a kode, the client
 * looks up I18N.t("paste.err." + kode)) — a server-side parser has no
 * business deciding which language to answer in.
 *
 * Cross-session NIM uniqueness (the "one NIM per day" rule) is enforced
 * by the database's unique(tanggal, nim) constraint on `praktikan`, not
 * here — this parser only catches a duplicate NIM within the SAME pasted
 * block, which is the one case a database constraint can't catch before
 * the rows even exist.
 */

export interface ParsedMember {
  nim: string;
  nama: string;
}

export interface ParsedGroup {
  nomor: number;
  nama: string;
  anggota: ParsedMember[];
}

export interface ParseError {
  baris: number; // 1-indexed line number, for a message like "Baris 7: ..."
  kode: "tanpa_kelompok" | "baris_tidak_valid" | "nim_ganda";
  nim?: string; // set only for kode === "nim_ganda"
}

export interface ParseResult {
  groups: ParsedGroup[];
  total: number;
  errors: ParseError[];
}

const GROUP_HEADER = /^#\s*(\d{1,2})\s*(.*)$/;
const MEMBER_LINE = /^([A-Za-z0-9]{4,20})\s*(?:[,;\t]|\s)\s*(.+)$/;
const BARE_NIM = /^[A-Za-z0-9]{4,20}$/;
const MAX_NAME_LEN = 40;

export function parseRosterPaste(text: string): ParseResult {
  const groups = new Map<number, ParsedGroup>();
  const errors: ParseError[] = [];
  const seen = new Set<string>();
  let current: number | null = null;
  let total = 0;

  const lines = String(text ?? "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const lineNo = i + 1;

    const head = GROUP_HEADER.exec(line);
    if (head) {
      const nomor = parseInt(head[1], 10);
      const label = head[2].trim();
      const existing = groups.get(nomor);
      if (!existing) {
        groups.set(nomor, { nomor, nama: label, anggota: [] });
      } else if (label) {
        existing.nama = label;
      }
      current = nomor;
      continue;
    }

    if (current === null) {
      errors.push({ baris: lineNo, kode: "tanpa_kelompok" });
      continue;
    }

    let match = MEMBER_LINE.exec(line);
    let nim: string;
    let nama: string;

    if (match) {
      nim = match[1];
      nama = match[2];
    } else if (BARE_NIM.test(line)) {
      // A bare ID with no name is still a member.
      nim = line;
      nama = "";
    } else {
      errors.push({ baris: lineNo, kode: "baris_tidak_valid" });
      continue;
    }

    nim = nim.toUpperCase();
    if (seen.has(nim)) {
      errors.push({ baris: lineNo, kode: "nim_ganda", nim });
      continue;
    }
    seen.add(nim);

    groups.get(current)!.anggota.push({ nim, nama: nama.trim().slice(0, MAX_NAME_LEN) });
    total += 1;
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.nomor - b.nomor),
    total,
    errors,
  };
}

/** Renders a saved roster back into the paste format, so an assistant who
 *  re-opens a session sees exactly the text they'd type again — the
 *  round-trip property toPaste() in hunt/src/ui-assistant.js already
 *  established. */
export function rosterToPaste(groups: ParsedGroup[]): string {
  const out: string[] = [];
  for (const g of [...groups].sort((a, b) => a.nomor - b.nomor)) {
    out.push(`#${g.nomor}${g.nama ? " " + g.nama : ""}`);
    for (const m of g.anggota) {
      out.push(`${m.nim}${m.nama ? ", " + m.nama : ""}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}
