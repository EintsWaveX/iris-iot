/**
 * The Live Coding editor (prompt 12, EXAM-ENGINE 9.3, mockup r3-lc): CodeMirror
 * 6 with the C++ grammar in the kosmik colours, ligatures off (JetBrains Mono
 * turns <= into one glyph, which is wrong in an exam), the lines between a
 * `// TODO-MULAI` and its `// TODO-SELESAI` striped gold, and `jumpTo(line)`
 * for the build log's error links (scroll, then flash the line). This file is
 * loaded on demand so CodeMirror stays out of the test page's first bundle.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { todoRanges } from "../../../lib/recruitment/lc-ui";

export interface CodeEditorHandle {
  /** Scrolls a 1-based line into the middle and flashes it */
  jumpTo(line: number): void;
  focus(): void;
}

const css = (v: string, fallback: string) => `var(${v}, ${fallback})`;

const theme = EditorView.theme({
  "&": {
    color: css("--text", "#e8e9f2"),
    backgroundColor: "transparent",
    fontSize: "13px",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
    lineHeight: "1.55",
    fontVariantLigatures: "none",
    fontFeatureSettings: '"liga" 0, "calt" 0',
  },
  ".cm-content": { caretColor: css("--accent", "#7c8cff"), padding: "10px 0" },
  ".cm-cursor": { borderLeftColor: css("--accent", "#7c8cff") },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: css("--text-faint", "#7d8099"),
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--text) 5%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: css("--text", "#e8e9f2") },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    outline: "none",
  },
  ".cm-line.r3cm-todo": {
    backgroundImage:
      "repeating-linear-gradient(135deg, color-mix(in srgb, var(--gold, #e6b450) 11%, transparent) 0 7px, transparent 7px 14px)",
  },
  ".cm-line.r3cm-flash": { animation: "rec-s3-flash 1.2s var(--r3-ease, ease-out)" },
  ".cm-line.r3cm-err": {
    backgroundColor: "color-mix(in srgb, var(--danger, #ff6b6b) 14%, transparent)",
  },
});

const highlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier],
    color: "var(--syn-keyword, #c3a6ff)",
  },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type, #6fd6e3)" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--syn-string, #8fe3b0)" },
  { tag: [t.number, t.bool, t.null], color: "var(--syn-number, #f5c77e)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "var(--syn-func, #7cc4ff)",
  },
  { tag: [t.processingInstruction, t.meta], color: "var(--syn-preproc, #ff9ecf)" },
  {
    tag: [t.standard(t.variableName), t.constant(t.variableName), t.macroName],
    color: "var(--syn-const, #ffb38a)",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--syn-comment, #7d8099)",
    fontStyle: "italic",
  },
]);

/** Stripes the lines of every TODO region; recomputed when the text changes. */
const todoStripes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      for (const r of todoRanges(doc.toString()))
        for (let n = r.from; n <= r.to && n <= doc.lines; n++)
          b.add(doc.line(n).from, doc.line(n).from, Decoration.line({ class: "r3cm-todo" }));
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

interface Props {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  /** Lines with a build error, underlined in the gutter colour */
  errorLines?: number[];
  ariaLabel: string;
  /** Reduced motion: scroll at once, no flash */
  still?: boolean;
}

const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, onChange, readOnly, errorLines, ariaLabel, still },
  ref,
) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const lock = useRef(new Compartment());
  const errs = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          cpp(),
          syntaxHighlighting(highlight),
          theme,
          todoStripes,
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
          lock.current.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
          errs.current.of([]),
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
    // The editor is made once; value, readOnly and errors are pushed in below.
  }, []);

  // A new value from outside (a re-roll, a protocol switch): replace without echoing it back.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const now = v.state.doc.toString();
    if (now !== value) v.dispatch({ changes: { from: 0, to: now.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: lock.current.reconfigure([
        EditorState.readOnly.of(!!readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const lines = [...new Set(errorLines ?? [])].filter((n) => n >= 1 && n <= v.state.doc.lines);
    const plugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }
        update(u: ViewUpdate) {
          if (u.docChanged) this.decorations = this.build(u.view);
        }
        build(view: EditorView): DecorationSet {
          const b = new RangeSetBuilder<Decoration>();
          for (const n of lines)
            if (n <= view.state.doc.lines) {
              const at = view.state.doc.line(n).from;
              b.add(at, at, Decoration.line({ class: "r3cm-err" }));
            }
          return b.finish();
        }
      },
      { decorations: (p) => p.decorations },
    );
    v.dispatch({ effects: errs.current.reconfigure([plugin]) });
  }, [errorLines]);

  useImperativeHandle(
    ref,
    () => ({
      jumpTo(line: number) {
        const v = view.current;
        if (!v) return;
        const n = Math.min(Math.max(1, line), v.state.doc.lines);
        const l = v.state.doc.line(n);
        v.dispatch({
          selection: { anchor: l.from },
          effects: EditorView.scrollIntoView(l.from, { y: "center", yMargin: 40 }),
        });
        v.focus();
        if (still) return;
        const el = v.domAtPos(l.from).node;
        const row = (el instanceof Element ? el : el.parentElement)?.closest(".cm-line");
        if (row) {
          row.classList.remove("r3cm-flash");
          void (row as HTMLElement).offsetWidth;
          row.classList.add("r3cm-flash");
          setTimeout(() => row.classList.remove("r3cm-flash"), 1300);
        }
      },
      focus() {
        view.current?.focus();
      },
    }),
    [still],
  );

  return <div ref={host} className="r3code" data-ro={readOnly ? "yes" : "no"} />;
});

export default CodeEditor;
