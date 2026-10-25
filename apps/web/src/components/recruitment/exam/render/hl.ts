/**
 * Code in the runner is coloured by lib/highlight.ts, the same look as the
 * Kode Jurnal editor. The whole source is tokenized once (so a block comment
 * or a string that spans lines stays one token) and then cut into lines.
 */
import { tokenize, type Token } from "../../../../lib/highlight";
import type { CodeLang } from "../../../../lib/recruitment/exam-types";

export function highlightLines(src: string, lang: CodeLang): Token[][] {
  if (lang === "text") return src.split("\n").map((l) => (l ? [{ text: l }] : []));
  const out: Token[][] = [[]];
  for (const tok of tokenize(src, lang)) {
    tok.text.split("\n").forEach((piece, i) => {
      if (i > 0) out.push([]);
      if (piece) out[out.length - 1].push({ text: piece, kind: tok.kind });
    });
  }
  return out;
}

export type BlankItem = Token | { blank: number };

const BLANK_AT = /_{2,}\((\d+)\)_{2,}/g;
const MARK = "\u0000";

/**
 * Code with FITB blanks (`__(n)__`): each blank is cut out and stood in for
 * by a mark while the rest is tokenized as one source, so a string that runs
 * through a blank stays one string, then put back as `{ blank: n }`.
 */
export function highlightBlanks(src: string, lang: CodeLang): BlankItem[][] {
  const ns: number[] = [];
  const plain = src.replace(BLANK_AT, (_, n: string) => {
    ns.push(Number(n));
    return MARK;
  });
  let next = 0;
  const out: BlankItem[][] = [[]];
  for (const tok of highlightLines(plain, lang).flatMap((l, i, all) =>
    i < all.length - 1 ? [...l, { text: "\n" } as Token] : l,
  )) {
    tok.text.split("\n").forEach((line, li) => {
      if (li > 0) out.push([]);
      line.split(MARK).forEach((piece, pi) => {
        if (pi > 0) out[out.length - 1].push({ blank: ns[next++] });
        if (piece) out[out.length - 1].push({ text: piece, kind: tok.kind });
      });
    });
  }
  return out;
}
