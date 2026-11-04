/**
 * The pieces of the teaching test sheet that the interview sheet does not have
 * (mockup r6-lembar): the Observing step (timed notes tied to the rubric rows,
 * the lesson taught, quick chips), the panel progress of the sent view and the
 * pause button of the turn clock. The notes live in the shared sheet as
 * answers named `_n:<id>` (a JSON with the stamp, the row and the text) and the
 * lesson as `_topic`, so the panel reads them at once and nothing new is stored.
 */
import { PauseIcon, PlayIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import Dropdown from "../../../ui/Dropdown";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import type { IvTemplate } from "../../../../lib/recruitment/interview";
import { IV, bi } from "./ivStrings";
import { M6 } from "./lembar6Strings";

export interface TeachNote {
  id: string;
  /** The turn clock when it was written, mm:ss */
  t: string;
  /** A rubric row key, or "" for a general note */
  row: string;
  text: string;
}

export const NOTE_PREFIX = "_n:";
export const TOPIC_KEY = "_topic";
export const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The notes of a sheet, oldest first. A note removed is an answer set to empty text. */
export function readNotes(ans: Record<string, string>): TeachNote[] {
  const out: TeachNote[] = [];
  for (const [k, v] of Object.entries(ans)) {
    if (!k.startsWith(NOTE_PREFIX) || !v) continue;
    try {
      const o = JSON.parse(v) as Partial<TeachNote>;
      if (typeof o.text === "string" && typeof o.t === "string")
        out.push({ id: k.slice(NOTE_PREFIX.length), t: o.t, row: o.row ?? "", text: o.text });
    } catch {
      /* a broken note is skipped, never shown */
    }
  }
  return out.sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id));
}

export const noteValue = (n: Omit<TeachNote, "id">) =>
  JSON.stringify({ t: n.t, row: n.row, text: n.text });
export const newNoteId = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** The countdown of the turn: minutes left, "+" once it ran over. */
export function TurnClock({
  lang,
  minutes,
  left,
  running,
  onToggle,
}: {
  lang: Lang;
  minutes: number;
  left: number;
  running: boolean;
  onToggle: () => void;
}) {
  const m = M6[lang];
  const over = left < 0;
  return (
    <span
      className="r4clock r6clock"
      data-over={over ? "yes" : undefined}
      data-low={!over && left <= 120 ? "yes" : undefined}
      role="timer"
      aria-label={m.clockAria}
    >
      <b className="num">
        {over ? "+" : ""}
        {mmss(Math.abs(left))}
      </b>
      <span className="hint num">{m.clockOf(minutes)}</span>
      <IconButton
        sm
        icon={running ? PauseIcon : PlayIcon}
        label={running ? m.pause : m.resume}
        onClick={onToggle}
      />
    </span>
  );
}

/** Step 1 of the teaching sheet: what the examiner sees while the Praktikan are taught. */
export function Amati({
  lang,
  tpl,
  notes,
  topic,
  tag,
  txt,
  locked,
  mates,
  partnerLive,
  setTopic,
  setTag,
  setTxt,
  addNote,
  removeNote,
}: {
  lang: Lang;
  tpl: IvTemplate;
  notes: TeachNote[];
  topic: string;
  tag: string;
  txt: string;
  locked: boolean;
  mates: string[];
  partnerLive: boolean;
  setTopic: (v: string) => void;
  setTag: (v: string) => void;
  setTxt: (v: string) => void;
  addNote: (text: string, row?: string) => void;
  removeNote: (id: string) => void;
}) {
  const m = M6[lang];
  const w = IV(lang);
  const count = (key: string) => notes.filter((n) => n.row === key).length;
  const example = tpl.params.some((p) => p.example);
  return (
    <div className="r4qa r6obs">
      <aside className="r4rail r6rail" aria-label={m.rowLabel}>
        <div className="r4rail__sum">
          <b className="num">{notes.length}</b>
          <span className="hint">{m.railHint}</span>
        </div>
        <ol className="r4rail__l">
          {tpl.params.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                className="r4rail__b r6row"
                aria-pressed={tag === p.key}
                aria-current={tag === p.key ? "step" : undefined}
                onClick={() => setTag(tag === p.key ? "" : p.key)}
              >
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b className="r4rail__t">{bi(p.label, lang)}</b>
                  <span className="hint">{p.ind.map((x) => bi(x, lang)).join(" · ")}</span>
                </span>
                <span className="num r6row__n">{count(p.key)}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <div className="stack" style={{ minWidth: 0 }}>
        <section className="panel r4qc r6notes" data-key="notes">
          <div className="row r4qc__top">
            <span className="eyebrow num">{m.noteTitle(tpl.minutes)}</span>
            <span className="grow" />
            {example && (
              <span title={w.tpl.exampleTip}>
                <Pill tone="warn">{m.sampleRubric}</Pill>
              </span>
            )}
          </div>
          <label className="stack stack--sm">
            <span className="hint">{m.topic}</span>
            <input
              className="field__input input"
              value={topic}
              disabled={locked}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={m.topicPh}
            />
          </label>
          {!locked && (
            <>
              <div className="r6add">
                <input
                  className="field__input input"
                  value={txt}
                  onChange={(e) => setTxt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addNote(txt);
                  }}
                  placeholder={m.addPh}
                  aria-label={m.addAria}
                />
                <div style={{ width: 200 }}>
                  <Dropdown
                    id="iv-note-row"
                    label={m.rowLabel}
                    hideLabel
                    value={tag}
                    onChange={setTag}
                    options={[
                      { value: "", label: m.general },
                      ...tpl.params.map((p) => ({ value: p.key, label: bi(p.label, lang) })),
                    ]}
                  />
                </div>
                <IconButton
                  icon={PlusIcon}
                  label={m.addNote}
                  onClick={() => addNote(txt)}
                  disabled={!txt.trim()}
                />
              </div>
              <div className="rec-chips">
                {m.quick.map((x) => (
                  <button key={x} type="button" className="chipbtn" onClick={() => addNote(x)}>
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
          {notes.length ? (
            <ul className="r6nl">
              {notes.map((n) => {
                const r = tpl.params.find((x) => x.key === n.row);
                return (
                  <li key={n.id}>
                    <span className="num r6nl__t">{n.t}</span>
                    <span className="r6nl__x">{n.text}</span>
                    {r && <Pill>{bi(r.label, lang)}</Pill>}
                    {!locked && (
                      <IconButton
                        sm
                        icon={XIcon}
                        label={m.removeNote}
                        onClick={() => removeNote(n.id)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-note empty-note--sm">{m.none}</p>
          )}
        </section>
        {mates.length > 0 && (
          <div className="rec-note r4mate">
            <span className="r4mate__d" aria-hidden="true" />
            <span>{partnerLive ? m.mateLive(mates.join(", ")) : m.mate(mates.join(", "))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The sent view of the teaching sheet: who of the panel has sent, the levels once everyone has, the next turn. */
export function PanelSent({
  lang,
  tpl,
  me,
  panel,
  levelsOf,
  revealed,
  nextName,
  nextWhen,
}: {
  lang: Lang;
  tpl: IvTemplate;
  me: string;
  panel: { kode: string; sent: boolean }[];
  levelsOf: (kode: string) => Record<string, number>;
  revealed: boolean;
  nextName: string | null;
  nextWhen: string | null;
}) {
  const m = M6[lang];
  const sentN = panel.filter((p) => p.sent).length;
  const waiting = panel.filter((p) => !p.sent && p.kode !== me).map((p) => p.kode);
  return (
    <>
      <section className="panel r4next r6panel">
        <span className="eyebrow">
          {m.panel}{" "}
          <span className="num">
            {sentN}/{panel.length}
          </span>
        </span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {panel.map((p) => (
            <span key={p.kode} className="r6pc" data-sent={p.sent ? "yes" : undefined}>
              <span className={`acode${p.kode === me ? " acode--me" : ""}`}>{p.kode}</span>
              <span className="hint">{p.sent ? m.sentWord : m.notYet}</span>
            </span>
          ))}
        </div>
        {revealed ? (
          <>
            <span className="hint">{m.allSent}</span>
            <div className="scrollx">
              <table className="rec-table r4bd__t">
                <thead>
                  <tr>
                    <th>{m.rubricRow}</th>
                    {panel.map((p) => (
                      <th key={p.kode} className="num">
                        <span className={`acode${p.kode === me ? " acode--me" : ""}`}>
                          {p.kode}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tpl.params.map((r) => (
                    <tr key={r.key}>
                      <td>{bi(r.label, lang)}</td>
                      {panel.map((p) => {
                        const v = levelsOf(p.kode)[r.key];
                        return (
                          <td key={p.kode} className="num">
                            {v == null ? "-" : v}
                            <span className="hint">/{r.max}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <span className="hint">{m.hiddenUntil(waiting.join(", "))}</span>
        )}
      </section>
      {nextName && (
        <div className="panel r4next">
          <span className="eyebrow">{m.nextTurn}</span>
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b className="r4next__n">{nextName}</b>
            {nextWhen && <span className="hint num">{nextWhen}</span>}
          </span>
        </div>
      )}
    </>
  );
}
