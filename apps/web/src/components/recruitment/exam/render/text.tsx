/**
 * The text pieces every format shares: a highlighted line of code, a code
 * block, inline Markdown and the prompt. Everything is built from parseMd and
 * parseInline data and printed through React, so nothing in a question can
 * become markup. Ligatures are off in code (CSS), because `<=` as one glyph
 * is wrong in an exam.
 */
import { Fragment, useMemo, type ReactNode } from "react";
import type { Token } from "../../../../lib/highlight";
import type { CodeLang, Image } from "../../../../lib/recruitment/exam-types";
import { highlightLines } from "./hl";
import { parseInline, parseMd } from "./md";

/** One run of coloured tokens */
export function Tokens({ tokens }: { tokens: readonly Token[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.kind ? (
          <span key={i} className={`tok--${t.kind}`}>
            {t.text}
          </span>
        ) : (
          <Fragment key={i}>{t.text}</Fragment>
        ),
      )}
    </>
  );
}

/** One line of code on its own (a fix option, an order line) */
export function HlLine({ text, lang }: { text: string; lang: CodeLang }) {
  const tokens = useMemo(() => highlightLines(text, lang)[0] ?? [], [text, lang]);
  return <span className="r3hl">{tokens.length ? <Tokens tokens={tokens} /> : "​"}</span>;
}

/** Highlighted lines of a source, numbered from 1, cut once per source */
export function useCodeLines(src: string, lang: CodeLang) {
  return useMemo(() => highlightLines(src, lang), [src, lang]);
}

export function CodeBlock({ src, lang }: { src: string; lang: CodeLang }) {
  const lines = useCodeLines(src, lang);
  return (
    <pre className="r3code" data-lang={lang}>
      {lines.map((toks, i) => (
        <span key={i} className="r3code__l">
          <span className="ln">{i + 1}</span>
          <span className="r3hl">{toks.length ? <Tokens tokens={toks} /> : "​"}</span>
        </span>
      ))}
    </pre>
  );
}

export function Inl({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.t === "code" ? (
          <code key={i} className="r3ic">
            {p.s}
          </code>
        ) : p.t === "b" ? (
          <b key={i}>{p.s}</b>
        ) : p.t === "i" ? (
          <i key={i}>{p.s}</i>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </>
  );
}

const asLang = (l: string): CodeLang => (l === "c" ? l : "text");

/** An image is fetched only through the API while the question is in the seat's draw (EXAM-ENGINE 1.2) */
const imageUrl = (key: string) => `/api/recruitment/media?key=${encodeURIComponent(key)}`;

export function Md({
  src,
  images,
  inline,
}: {
  src: string;
  images?: readonly Image[];
  /** Renders a paragraph's text yourself (FITB prints its blanks inside the prompt) */
  inline?: (text: string) => ReactNode;
}) {
  const blocks = useMemo(() => parseMd(src), [src]);
  return (
    <div className="r3md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return <p key={i}>{inline ? inline(b.text) : <Inl text={b.text} />}</p>;
          case "code":
            return <CodeBlock key={i} src={b.src} lang={asLang(b.lang)} />;
          case "ul":
          case "ol": {
            const List = b.t;
            return (
              <List key={i} className="r3list">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inl text={it} />
                  </li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={i} className="r3tablewrap">
                <table className="r3table">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j}>
                          <Inl text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>
                            <Inl text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "img": {
            const im = images?.find((x) => x.id === b.id);
            if (!im) return null;
            return (
              <img
                key={i}
                className="r3img"
                src={imageUrl(im.key)}
                alt={im.alt || b.alt}
                width={im.w}
                height={im.h}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            );
          }
        }
      })}
    </div>
  );
}
