/**
 * Splits a sketch source into text/blank segments for the editor. Safe to
 * import from client code: this only knows WHERE a blank sits and what its
 * hint says, never what the correct value is -- that lives in the
 * module's published code version, served by api/_lib/kode-aktif.ts.
 *
 * The practicum's blank convention (see iris-blank-format-underscores): a
 * run of four or more underscores, followed later on the SAME line by a
 * `// (n) hint` or `# (n) hint` comment. Every blank across all four
 * modules' sketches fits one per line, which is what keeps this a per-line
 * regex instead of a real tokenizer.
 */
export interface TextSegment {
  kind: "text";
  text: string;
}

export interface BlankSegment {
  kind: "blank";
  nomor: number;
  hint: string;
}

export type Segment = TextSegment | BlankSegment;

const BLANK_LINE = /^(.*?)_{4,}(.*?)(?:\/\/|#)\s*\((\d+)\)\s*(.*)$/;

export function parseBlanks(source: string): Segment[] {
  const lines = source.split("\n");
  const segments: Segment[] = [];
  let buffer = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    const match = BLANK_LINE.exec(line);

    if (match) {
      const [, pre, mid, nomorStr] = match;
      buffer += pre;
      segments.push({ kind: "text", text: buffer });
      segments.push({ kind: "blank", nomor: Number(nomorStr), hint: match[4].trim() });
      buffer = mid.trimEnd() + (isLast ? "" : "\n");
    } else {
      buffer += line + (isLast ? "" : "\n");
    }
  }

  if (buffer.length > 0) segments.push({ kind: "text", text: buffer });
  return segments;
}

export function countBlanks(source: string): number {
  return parseBlanks(source).filter((s): s is BlankSegment => s.kind === "blank").length;
}

/** `m{modul}.{berkasSlug}.{nomor}` -- the `soalKode` address every code
 *  blank's row in the `jawaban` table uses, shared by the client (to know
 *  which draft belongs to which input) and the server (to look up the
 *  matching answer-key entry). */
export function soalKode(modul: number, berkasSlug: string, nomor: number): string {
  return `m${modul}.${berkasSlug}.${nomor}`;
}

/** Every blank in one berkas shares this prefix -- used to fetch or scope
 *  a whole file's worth of `jawaban` rows in one LIKE query. */
export function soalKodePrefix(modul: number, berkasSlug: string): string {
  return `m${modul}.${berkasSlug}.`;
}
