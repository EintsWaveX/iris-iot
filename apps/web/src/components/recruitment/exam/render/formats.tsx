/**
 * The seven formats as the candidate works them (prompt 10, mockup r3-soal,
 * EXAM-ENGINE 1.3). Each takes the View (the seat's shuffle applied, no key)
 * and the candidate's Value, and calls onChange with the format's own value
 * shape, which is what `checkValue` and `credit` take. 09's bank preview
 * imports these and does not fork them. No native widgets: the kit's
 * Dropdown for the fix slots and the match rows, and dnd-kit for the order.
 */
import { Fragment, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckIcon, DotsSixVerticalIcon, FlagIcon } from "@phosphor-icons/react";
import Dropdown, { type DropdownOption } from "../../../ui/Dropdown";
import { MAX_BLANK } from "../../../../lib/recruitment/formats";
import type { CodeLang, Value, View } from "../../../../lib/recruitment/exam-types";
import type { Lang } from "../../../../lib/kelas";
import { HlLine, Inl, Md, Tokens, useCodeLines } from "./text";
import { highlightBlanks } from "./hl";
import { RX } from "./renderStrings";

export interface FormatProps<F extends View["format"]> {
  view: Extract<View, { format: F }>;
  value: Value;
  onChange: (v: Value) => void;
  disabled?: boolean;
  lang: Lang;
}

const letter = (i: number) => String.fromCharCode(65 + i);
const rec = (v: Value) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/* -------------------------------------------------- single and checkbox */

export function Choice({ view, value, onChange, disabled, lang }: FormatProps<"single" | "multi">) {
  const t = RX[lang];
  const multi = view.format === "multi";
  const v = rec(value);
  const picks: string[] = multi
    ? Array.isArray(v.picks)
      ? (v.picks as string[])
      : []
    : typeof v.pick === "string"
      ? [v.pick]
      : [];
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const tap = (id: string) => {
    if (disabled) return;
    if (!multi) return onChange({ pick: picks[0] === id ? null : id });
    onChange({ picks: picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id] });
  };
  // A radio group is one tab stop; the arrows move the choice (ARIA radio group).
  const arrow = (e: KeyboardEvent, i: number) => {
    if (multi || disabled) return;
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const n = view.options.length;
    const next = (i + step + n) % n;
    btns.current[next]?.focus();
    onChange({ pick: view.options[next].id });
  };
  const stop =
    picks[0] && view.options.some((o) => o.id === picks[0]) ? picks[0] : view.options[0]?.id;
  return (
    <div className="stack stack--sm">
      {multi && <span className="hint">{t.multiHint}</span>}
      <div className="r3opts" role={multi ? "group" : "radiogroup"}>
        {view.options.map((o, i) => (
          <button
            key={o.id}
            ref={(el) => {
              btns.current[i] = el;
            }}
            type="button"
            className="r3opt"
            data-multi={multi ? "yes" : "no"}
            role={multi ? "checkbox" : "radio"}
            aria-checked={picks.includes(o.id)}
            tabIndex={multi || o.id === stop ? 0 : -1}
            disabled={disabled}
            onClick={() => tap(o.id)}
            onKeyDown={(e) => arrow(e, i)}
          >
            <span className="r3opt__k" aria-hidden="true">
              {multi ? <CheckIcon weight="bold" /> : letter(i)}
            </span>
            <span className="r3opt__t">
              <Inl text={o.text} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- click the lines */

export function Lines({ view, value, onChange, disabled, lang }: FormatProps<"lines">) {
  const t = RX[lang];
  const v = rec(value);
  const picks = Array.isArray(v.picks) ? (v.picks as number[]) : [];
  const toks = useCodeLines(view.code.src, view.code.lang);
  const flip = (n: number) =>
    onChange({
      picks: picks.includes(n) ? picks.filter((x) => x !== n) : [...picks, n].sort((a, b) => a - b),
    });
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <span className="hint">{t.linesHint}</span>
        <span className="hint num">{t.linesPicked(picks.length)}</span>
      </div>
      <div className="r3code r3lines" data-lang={view.code.lang}>
        {toks.map((line, i) => {
          const n = i + 1;
          const blank = line.every((x) => !x.text.trim());
          if (blank)
            return (
              <span key={n} className="r3code__l r3lines__blank">
                <span className="ln">{n}</span>
                {"​"}
              </span>
            );
          return (
            <button
              key={n}
              type="button"
              className="r3code__l r3lines__l"
              aria-pressed={picks.includes(n)}
              disabled={disabled}
              onClick={() => flip(n)}
            >
              <span className="ln">{n}</span>
              <span className="r3hl">
                <Tokens tokens={line} />
              </span>
              <span className="r3lines__mark" aria-hidden="true">
                <FlagIcon weight="fill" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- pick the fix */

export function Fix({ view, value, onChange, disabled, lang }: FormatProps<"fix">) {
  const t = RX[lang];
  const base = useId();
  const v = rec(value);
  const picks = (v.picks && typeof v.picks === "object" ? v.picks : {}) as Record<
    string,
    string | null
  >;
  const toks = useCodeLines(view.code.src, view.code.lang);
  const src = view.code.src.split("\n");
  return (
    <div className="stack stack--sm">
      <span className="hint">{t.fixHint}</span>
      <div className="r3code r3fix" data-lang={view.code.lang}>
        {toks.map((line, i) => {
          const n = i + 1;
          const slot = view.slots.find((s) => s.line === n);
          const text = src[i] ?? "";
          if (!slot)
            return (
              <span key={n} className="r3code__l">
                <span className="ln">{n}</span>
                <span className="r3hl">{line.length ? <Tokens tokens={line} /> : "​"}</span>
              </span>
            );
          const cur = picks[n] ?? "";
          const options: DropdownOption[] = [
            {
              value: "",
              label: text,
              node: (
                <span className="r3fix__orig">
                  <HlLine text={text} lang={view.code.lang} />
                </span>
              ),
              chip: t.fixPick,
            },
            ...slot.options.map((o) => ({
              value: o.id,
              label: o.text,
              node: <HlLine text={o.text} lang={view.code.lang} />,
            })),
          ];
          return (
            <span key={n} className="r3code__l r3fix__slot" data-set={cur ? "yes" : "no"}>
              <span className="ln">{n}</span>
              <span className="r3fix__dd">
                {disabled ? (
                  <HlLine text={text} lang={view.code.lang} />
                ) : (
                  <Dropdown
                    id={`${base}-fix-${n}`}
                    label={t.fixSlot(n)}
                    hideLabel
                    options={options}
                    value={cur}
                    onChange={(id) => onChange({ picks: { ...picks, [n]: id || null } })}
                  />
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- order the lines */

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function OrderRow({
  id,
  n,
  text,
  lang,
  disabled,
}: {
  id: string;
  n: number;
  text: string;
  lang: CodeLang;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    transition: { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  });
  return (
    <li
      ref={setNodeRef}
      className="r3order__l"
      data-drag={isDragging ? "yes" : "no"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className="r3order__grip" aria-hidden="true">
        <DotsSixVerticalIcon />
      </span>
      <span className="r3order__n num">{n}</span>
      <code className="r3order__t">
        <HlLine text={text} lang={lang} />
      </code>
    </li>
  );
}

/**
 * Drag anywhere on a row, or Space to pick it up, the arrows to move it and
 * Space to put it down (dnd-kit's keyboard sensor). The value stays null until
 * the first move, so an untouched question earns nothing.
 */
export function Order({ view, value, onChange, disabled, lang }: FormatProps<"order">) {
  const t = RX[lang];
  const v = rec(value);
  const ids = view.lines.map((l) => l.id);
  const saved = Array.isArray(v.order) ? (v.order as string[]) : null;
  const order = saved && saved.length === ids.length ? saved : ids;
  const byId = useMemo(() => new Map(view.lines.map((l) => [l.id, l])), [view]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const pos = (id: unknown) => order.indexOf(String(id)) + 1;
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onChange({ order: arrayMove(order, from, to) });
  }
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <span className="hint">{t.orderHint}</span>
        <span className="r3badge" data-tone={saved ? "ok" : ""}>
          {saved ? t.orderSaved : t.orderTodo}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        onDragEnd={end}
        accessibility={{
          screenReaderInstructions: { draggable: t.orderInstructions },
          announcements: {
            onDragStart: ({ active }) => t.orderLift(pos(active.id)),
            onDragOver: ({ over }) => (over ? t.orderOver(pos(over.id)) : ""),
            onDragEnd: ({ over }) => (over ? t.orderDrop(pos(over.id)) : t.orderCancel),
            onDragCancel: () => t.orderCancel,
          },
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="r3order" data-lang={view.lang} aria-label={t.orderLabel}>
            {order.map((id, i) => (
              <OrderRow
                key={id}
                id={id}
                n={i + 1}
                text={byId.get(id)?.text ?? ""}
                lang={view.lang}
                disabled={disabled}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <span className="hint r3keys">{t.orderKeys}</span>
    </div>
  );
}

/* ------------------------------------------------------------- match pairs */

export function Match({ view, value, onChange, disabled, lang }: FormatProps<"match">) {
  const t = RX[lang];
  const base = useId();
  const v = rec(value);
  const pairs = (v.pairs && typeof v.pairs === "object" ? v.pairs : {}) as Record<
    string,
    string | null
  >;
  const [moved, setMoved] = useState<string | null>(null);
  const holder = (rid: string) => Object.keys(pairs).find((l) => pairs[l] === rid);
  const pick = (lid: string, rid: string) => {
    const next = { ...pairs, [lid]: rid || null };
    const from = rid ? holder(rid) : undefined;
    // A right-hand choice is held by one row: picking it moves it, and the loser says so.
    if (from && from !== lid) {
      next[from] = null;
      setMoved(from);
      window.setTimeout(() => setMoved((m) => (m === from ? null : m)), 1400);
    }
    onChange({ pairs: next });
  };
  const rowOf = (lid: string) => view.left.findIndex((x) => x.id === lid) + 1;
  return (
    <div className="stack stack--sm">
      <span className="hint">{t.matchHint}</span>
      <div className="r3match">
        {view.left.map((l, i) => {
          const options: DropdownOption[] = [
            { value: "", label: t.matchNone },
            ...view.right.map((r) => {
              const h = holder(r.id);
              return {
                value: r.id,
                label: r.text,
                node: <Inl text={r.text} />,
                note: h && h !== l.id ? t.matchUsed(rowOf(h)) : undefined,
              };
            }),
          ];
          const cur = pairs[l.id] ?? "";
          return (
            <div key={l.id} className="r3match__row" data-moved={moved === l.id ? "yes" : "no"}>
              <span className="r3match__l">
                <span className="r3match__n num">{i + 1}</span>
                <span>
                  <Inl text={l.text} />
                </span>
              </span>
              {disabled ? (
                <span className="r3match__ro">
                  {cur ? (
                    <Inl text={view.right.find((r) => r.id === cur)?.text ?? ""} />
                  ) : (
                    t.matchNone
                  )}
                </span>
              ) : (
                <Dropdown
                  id={`${base}-m-${l.id}`}
                  label={t.matchRow(i + 1)}
                  hideLabel
                  options={options}
                  value={cur}
                  onChange={(rid) => pick(l.id, rid)}
                />
              )}
              {moved === l.id && <span className="r3match__note hint">{t.matchMoved}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- fill the blanks */

const BLANK_TEXT = /(_{2,}\(\d+\)_{2,})/;

function Blank({
  n,
  width,
  hint,
  val,
  onInput,
  disabled,
  lang,
}: {
  n: number;
  width: number;
  hint?: string;
  val: string;
  onInput: (s: string) => void;
  disabled?: boolean;
  lang: Lang;
}) {
  const t = RX[lang];
  const w = Math.max(width, val.length + 1);
  return (
    <span className="r3blank" data-filled={val ? "yes" : "no"}>
      <input
        className="r3blank__in"
        style={{ width: `${w}ch` }}
        value={val}
        disabled={disabled}
        maxLength={MAX_BLANK}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        aria-label={t.blank(n) + (hint ? `, ${hint}` : "")}
        placeholder={"_".repeat(Math.min(width, 12))}
        onChange={(e) => onInput(e.target.value)}
      />
      <sup className="r3blank__n num">({n})</sup>
    </span>
  );
}

const blanksOf = (value: Value) => {
  const v = rec(value);
  return (v.blanks && typeof v.blanks === "object" ? v.blanks : {}) as Record<string, string>;
};

export function Fitb({ view, value, onChange, disabled, lang }: FormatProps<"fitb">) {
  const t = RX[lang];
  const vals = blanksOf(value);
  const set = (n: number, s: string) => onChange({ blanks: { ...vals, [n]: s } });
  const info = new Map(view.blanks.map((b) => [b.n, b]));
  const filled = view.blanks.filter((b) => (vals[b.n] ?? "").trim()).length;
  const lines = useMemo(
    () => (view.code ? highlightBlanks(view.code.src, view.code.lang) : []),
    [view.code],
  );
  const put = (n: number) => {
    const b = info.get(n);
    if (!b) return null;
    return (
      <Blank
        n={n}
        width={b.width}
        hint={b.hint}
        val={vals[n] ?? ""}
        onInput={(s) => set(n, s)}
        disabled={disabled}
        lang={lang}
      />
    );
  };
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <span className="hint">{t.fitbHint}</span>
        <span className="hint num">{t.fitbFilled(filled, view.blanks.length)}</span>
      </div>
      {view.code && (
        <div className="r3code r3fitb" data-lang={view.code.lang}>
          {lines.map((items, i) => (
            <span key={i} className="r3code__l">
              <span className="ln">{i + 1}</span>
              <span className="r3hl">
                {items.length
                  ? items.map((it, j) =>
                      "blank" in it ? (
                        <Fragment key={j}>{put(it.blank)}</Fragment>
                      ) : (
                        <Tokens key={j} tokens={[it]} />
                      ),
                    )
                  : "​"}
              </span>
            </span>
          ))}
        </div>
      )}
      {view.blanks.some((b) => b.hint) && (
        <div className="row r3hints">
          {view.blanks
            .filter((b) => b.hint)
            .map((b) => (
              <span key={b.n} className="hint">
                ({b.n}) {b.hint}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/** The prompt of a FITB question: blanks written in the text sit inline as inputs. */
export function FitbPrompt({ view, value, onChange, disabled, lang }: FormatProps<"fitb">) {
  const vals = blanksOf(value);
  const info = new Map(view.blanks.map((b) => [b.n, b]));
  const inline = (text: string) =>
    text.split(BLANK_TEXT).map((s, i) => {
      const m = s.match(/^_{2,}\((\d+)\)_{2,}$/);
      if (!m) return <Inl key={i} text={s} />;
      const b = info.get(Number(m[1]));
      return b ? (
        <Blank
          key={i}
          n={b.n}
          width={b.width}
          hint={b.hint}
          val={vals[b.n] ?? ""}
          onInput={(x) => onChange({ blanks: { ...vals, [b.n]: x } })}
          disabled={disabled}
          lang={lang}
        />
      ) : null;
    });
  return <Md src={view.prompt} images={view.images} inline={inline} />;
}
