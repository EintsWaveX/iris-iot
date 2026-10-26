/**
 * The subset of Markdown a question may use (EXAM-ENGINE 1.2): paragraphs,
 * bold, italic, inline code, fenced code with a language, lists, simple
 * tables and images written `![alt](img:<id>)`. No raw HTML and no links: a
 * link renders as its text, so nothing in a test can navigate out. The
 * parser only produces data; the renderer escapes everything it prints.
 */
export type Inline = { t: "text" | "b" | "i" | "code"; s: string };

export type Block =
  | { t: "p"; text: string }
  | { t: "code"; lang: string; src: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "img"; alt: string; id: string };

const INLINE = /(`+)([^`]+?)\1|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]*)\]\(([^)]*)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.s += s;
    else out.push({ t: "text", s });
  };
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    text(src.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[2] !== undefined) out.push({ t: "code", s: m[2] });
    else if (m[3] !== undefined) out.push({ t: "b", s: m[3] });
    else if (m[4] !== undefined) out.push({ t: "i", s: m[4] });
    else text(m[5] ?? "");
  }
  text(src.slice(at));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);
const IMG = /^!\[([^\]]*)\]\(img:([a-z0-9]{1,12})\)$/;

export function parseMd(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ t: "code", lang: fence[1], src: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const img = line.trim().match(IMG);
    if (img) {
      flush();
      out.push({ t: "img", alt: img[1], id: img[2] });
      continue;
    }
    if (/^\s*[-*] /.test(line) || /^\s*\d+[.)] /.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const re = ordered ? /^\s*\d+[.)] / : /^\s*[-*] /;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i]); i++)
        items.push(lines[i].replace(re, "").trim());
      i--;
      out.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isRule(lines[i + 1]) &&
      lines[i + 1].includes("-")
    ) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++)
        rows.push(cells(lines[i]));
      i--;
      out.push({ t: "table", head, rows });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}
