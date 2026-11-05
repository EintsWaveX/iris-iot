/**
 * The code and Markdown boxes of Bank Soal: a real code editor (CodeMirror 6, the same
 * kosmik theme as the Live Coding page) instead of a plain textarea. JetBrains Mono, line
 * numbers, bracket matching, closing pairs and C suggestions (cmAssist.ts), no spelling or
 * grammar lines, auto indent, Tab to indent, highlighting for C, Python and
 * Markdown (with C and Python inside code fences). It grows with its text up to a ceiling,
 * then scrolls. Loaded on demand through CodeBox so CodeMirror stays out of the panel's
 * first bundle.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { cmHighlight, cmTheme } from "../../../livecode/CodeEditor";
import { codeAssist, cSupport, noProofreading } from "../../../livecode/cmAssist";

export type CodeFieldLang = "c" | "py" | "text" | "md";

export interface CodeFieldProps {
  value: string;
  onChange: (v: string) => void;
  lang: CodeFieldLang;
  ariaLabel: string;
  id?: string;
  readOnly?: boolean;
  /** Lines the box shows when empty (it grows from here) */
  rows?: number;
  /** Lines it grows to before it scrolls */
  maxRows?: number;
  placeholder?: string;
}

/** Headings, bold, quotes and the like for the Markdown boxes; code inside a fence uses cmHighlight */
const mdHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--syn-func, #7cc4ff)", fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--syn-type, #6fd6e3)" },
  { tag: t.monospace, color: "var(--syn-string, #8fe3b0)" },
  { tag: t.quote, color: "var(--syn-comment, #7d8099)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.contentSeparator], color: "var(--syn-preproc, #ff9ecf)" },
]);

const fences = [
  LanguageDescription.of({
    name: "C",
    alias: ["c", "cpp", "c++", "h"],
    support: cpp() as LanguageSupport,
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py", "python"],
    support: python() as LanguageSupport,
  }),
];

function language(lang: CodeFieldLang): Extension {
  if (lang === "c") return cSupport();
  if (lang === "py") return python();
  if (lang === "md") return [markdown({ codeLanguages: fences }), syntaxHighlighting(mdHighlight)];
  return [];
}

function lock(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

export default function CodeField({
  value,
  onChange,
  lang,
  ariaLabel,
  id,
  readOnly = false,
  rows = 6,
  maxRows = 24,
  placeholder,
}: CodeFieldProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const langBox = useRef(new Compartment());
  const lockBox = useRef(new Compartment());
  const prose = lang === "md";

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...(prose ? [] : [lineNumbers()]),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          // C and Python: closing pairs and suggestions; prose and plain text: only no proofreading
          lang === "c" || lang === "py" ? codeAssist() : noProofreading,
          keymap.of([...defaultKeymap, ...historyKeymap, ...(prose ? [] : [indentWithTab])]),
          langBox.current.of(language(lang)),
          syntaxHighlighting(cmHighlight),
          cmTheme,
          ...(prose ? [EditorView.lineWrapping] : []),
          ...(placeholder ? [cmPlaceholder(placeholder)] : []),
          EditorView.contentAttributes.of({
            ...(id ? { id } : {}),
            "aria-label": ariaLabel,
          }),
          lockBox.current.of(lock(readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Made once; value, language and lock are pushed in below.
  }, []);

  // A new value from outside (a re-roll, a format change): replace without echoing it back.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const now = v.state.doc.toString();
    if (now !== value) v.dispatch({ changes: { from: 0, to: now.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: langBox.current.reconfigure(language(lang)) });
  }, [lang]);

  useEffect(() => {
    view.current?.dispatch({ effects: lockBox.current.reconfigure(lock(readOnly)) });
  }, [readOnly]);

  return (
    <div
      ref={host}
      className="bkcode"
      data-ro={readOnly ? "yes" : "no"}
      data-prose={prose ? "yes" : "no"}
      style={{ ["--bk-rows" as string]: rows, ["--bk-max" as string]: maxRows }}
    />
  );
}
