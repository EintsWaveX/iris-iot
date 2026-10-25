/**
 * The bank's Live Coding tab (prompt 12, mockup r3-bank, EXAM-ENGINE 9.2, 9.3,
 * 9.8): the topic cards, the starting sketch of each protocol and the grading
 * rubric. The six default topics and four templates ship marked "Bawaan" and
 * are the edition's own rows from then on. The `bank` right edits all of it;
 * a topic a seat holds cannot be deleted, a template must keep its
 * `#include "iris_seat.h"` and pass the sketch check, and the rubric is locked
 * once a sheet exists.
 */
import { useMemo, useState } from "react";
import Confirm from "../../ui/Confirm";
import { Checkbox, Stepper } from "../../ui/Controls";
import Dialog from "../../ui/Dialog";
import Dropdown from "../../ui/Dropdown";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import { usePoll } from "../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import { PROTOCOLS, type Protocol, type RubricRow } from "../../../lib/recruitment/exam-types";
import type { TemplatesView, TopicsView } from "../../../lib/recruitment/lc-api";
import { TEMPLATE_KEYS, type LcTopic, type TemplateKey } from "../../../lib/recruitment/lc-types";
import { PROTOCOL_NAME } from "../../../lib/recruitment/lc-ui";
import { TopicIcon, topicIconNames } from "./icons";
import { LC } from "./lcStrings";

import "../recruitment-s3-lc.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

type Both = { topics: LcTopic[]; tpl: TemplatesView };

async function fetchBoth(): Promise<Both | null> {
  const [a, b] = await Promise.all([
    recGet<TopicsView & { ok: true }>("lc-topics"),
    recGet<TemplatesView & { ok: true }>("lc-templates"),
  ]);
  if (isFail(a) || isFail(b)) {
    const f = isFail(a) ? a : (b as { kode: string; status: number });
    if (f.kode === "offline" || f.status >= 500) throw new Error(String(f.status || 408));
    return null;
  }
  return { topics: a.topics, tpl: b };
}

export default function LcPoolTab({ lang }: { lang: Lang }) {
  const L = LC[lang].pool;
  const poll = usePoll<Both | null>(fetchBoth, 300_000, true, ["reclive"], 300);
  const [edit, setEdit] = useState<LcTopic | "new" | null>(null);
  const [del, setDel] = useState<LcTopic | null>(null);
  const d = poll.data;
  if (!d) return <span className="skeleton" style={{ height: 180 }} />;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="stack">
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="panel__title">{L.title}</h3>
            <span className="hint">{L.lede}</span>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setEdit("new")}>
            {L.newTopic}
          </button>
        </div>
        <div className="r3pool">
          {d.topics.map((t) => (
            <article key={t.id} className="r3pool__card">
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span className="row" style={{ gap: 8, fontWeight: 700 }}>
                  <TopicIcon name={t.icon} />
                  {t.title}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {t.sample && <Pill>{L.sample}</Pill>}
                  <Pill tone={t.status === "ready" ? "ok" : "warn"}>
                    {t.status === "ready" ? L.ready : L.draft}
                  </Pill>
                </span>
              </div>
              <div className="r3chips">
                {t.fits.map((p) => (
                  <Pill key={p} mono>
                    {PROTOCOL_NAME[p]}
                  </Pill>
                ))}
              </div>
              {t.parts.length > 0 && <span className="hint">{t.parts.join(", ")}</span>}
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn--inverse" onClick={() => setEdit(t)}>
                  {L.edit}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setDel(t)}>
                  {L.remove}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Templates lang={lang} view={d.tpl} onSaved={poll.refresh} />
      <Rubric lang={lang} rows={d.tpl.rubric.rows} onSaved={poll.refresh} />

      {edit && (
        <TopicForm
          lang={lang}
          topic={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            poll.refresh();
          }}
        />
      )}
      <Confirm
        open={del !== null}
        onOpenChange={(o) => !o && setDel(null)}
        title={L.removeTitle}
        body={L.removeBody}
        confirmLabel={L.removeConfirm}
        cancelLabel={L.cancel}
        lang={lang}
        onConfirm={async () => {
          if (!del) return true;
          const r = await recPost<{ ok: true }>("lc-topic-delete", { id: del.id });
          if (isFail(r)) {
            toast((r.kode as string) === "dipakai" ? L.inUse : L.fail, "danger");
            return false;
          }
          toast(L.saved);
          poll.refresh();
          return true;
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- topic editor */

const csv = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function TopicForm({
  lang,
  topic,
  onClose,
  onSaved,
}: {
  lang: Lang;
  topic: LcTopic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const L = LC[lang].pool;
  const [title, setTitle] = useState(topic?.title ?? "");
  const [brief, setBrief] = useState(topic?.brief ?? "");
  const [fits, setFits] = useState<Protocol[]>(topic?.fits ?? ["ble", "httpws", "mqtt"]);
  const [parts, setParts] = useState((topic?.parts ?? []).join(", "));
  const [libs, setLibs] = useState((topic?.libs ?? []).join(", "));
  const [hints, setHints] = useState(topic?.hints ?? "");
  const [icon, setIcon] = useState(topic?.icon ?? "chip");
  const [status, setStatus] = useState<"draft" | "ready">(topic?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await recPost<{ ok: true }>("lc-topic-save", {
      ...(topic ? { id: topic.id } : {}),
      title,
      brief,
      fits,
      parts: csv(parts),
      libs: csv(libs),
      hints,
      icon,
      status,
    });
    setBusy(false);
    if (isFail(r))
      return setErr(
        typeof r.field === "string"
          ? L.bad(L.form[r.field as keyof typeof L.form] ?? r.field)
          : L.fail,
      );
    toast(L.saved);
    onSaved();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={topic ? topic.title : L.newTopic}
      size="lg"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {L.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {L.save}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="field__label">{L.form.title}</span>
          <input
            className="field__input"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field__label">{L.form.brief}</span>
          <textarea
            className="field__textarea"
            rows={6}
            maxLength={4000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="field__label">{L.form.fits}</span>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {PROTOCOLS.map((p) => (
              <Checkbox
                key={p}
                checked={fits.includes(p)}
                label={PROTOCOL_NAME[p]}
                onChange={(on) => setFits((f) => (on ? [...f, p] : f.filter((x) => x !== p)))}
              />
            ))}
          </div>
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field__label">{L.form.parts}</span>
          <input
            className="field__input"
            value={parts}
            onChange={(e) => setParts(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field__label">{L.form.libs}</span>
          <input className="field__input" value={libs} onChange={(e) => setLibs(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field__label">{L.form.hints}</span>
          <textarea
            className="field__textarea"
            rows={3}
            maxLength={2000}
            value={hints}
            onChange={(e) => setHints(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Dropdown
            id="lc-topic-icon"
            label={L.form.icon}
            value={icon}
            onChange={setIcon}
            options={topicIconNames.map((n) => ({ value: n, label: n }))}
          />
          <div className="stack" style={{ gap: 4 }}>
            <span className="field__label">{L.form.status}</span>
            <SegmentedControl
              value={status}
              onValueChange={(v) => v && setStatus(v as "draft" | "ready")}
              options={[
                { value: "draft", label: L.draft },
                { value: "ready", label: L.ready },
              ]}
              aria-label={L.form.status}
            />
          </div>
        </div>
        {err && <p className="field__error">{err}</p>}
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------- templates */

function Templates({
  lang,
  view,
  onSaved,
}: {
  lang: Lang;
  view: TemplatesView;
  onSaved: () => void;
}) {
  const L = LC[lang].pool;
  return (
    <section className="stack">
      <div className="stack" style={{ gap: 2 }}>
        <h3 className="panel__title">{L.templates}</h3>
        <span className="hint">{L.templatesHint}</span>
      </div>
      <div className="r3pool">
        {TEMPLATE_KEYS.map((k) => {
          const t = view.templates.find((x) => x.key === k);
          return t ? (
            <TemplateCard
              key={k}
              lang={lang}
              k={k}
              code={t.code}
              sample={t.sample}
              onSaved={onSaved}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}

function TemplateCard({
  lang,
  k,
  code,
  sample,
  onSaved,
}: {
  lang: Lang;
  k: TemplateKey;
  code: string;
  sample: boolean;
  onSaved: () => void;
}) {
  const L = LC[lang].pool;
  const [text, setText] = useState(code);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    const r = await recPost<{ ok: true }>("lc-template-save", { key: k, code: text });
    setBusy(false);
    if (isFail(r)) return setErr(L.templateBad[r.kode as keyof typeof L.templateBad] ?? L.fail);
    toast(L.saved);
    onSaved();
  }
  return (
    <article className="r3pool__card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{L.templateKey[k]}</b>
        {sample && <Pill>{L.sample}</Pill>}
      </div>
      <textarea
        className="field__textarea r3pool__code"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        aria-label={L.templateKey[k]}
      />
      {err && <p className="field__error">{err}</p>}
      <div className="row">
        <button
          type="button"
          className="btn btn--inverse"
          disabled={busy || text === code}
          onClick={() => void save()}
        >
          {L.save}
        </button>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- rubric */

/** A row key the API accepts (two to twelve lower case letters) that no row has yet */
function newKey(rows: readonly RubricRow[]): string {
  const taken = new Set(rows.map((r) => r.key));
  for (let i = 0; i < 26 * 26; i++) {
    const k = "baris" + String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26));
    if (!taken.has(k)) return k;
  }
  return "barisxx";
}

function Rubric({ lang, rows, onSaved }: { lang: Lang; rows: RubricRow[]; onSaved: () => void }) {
  const L = LC[lang].pool;
  const [list, setList] = useState<RubricRow[]>(rows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const same = useMemo(() => JSON.stringify(list) === JSON.stringify(rows), [list, rows]);
  const patch = (i: number, p: Partial<RubricRow>) =>
    setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  async function save() {
    setBusy(true);
    setErr(null);
    const r = await recPost<{ ok: true }>("lc-rubric-save", { rows: list });
    setBusy(false);
    if (isFail(r)) return setErr((r.kode as string) === "sudah_dinilai" ? L.rubricLocked : L.fail);
    toast(L.saved);
    onSaved();
  }
  return (
    <section className="stack">
      <div className="stack" style={{ gap: 2 }}>
        <h3 className="panel__title">{L.rubric}</h3>
        <span className="hint">{L.rubricHint}</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {list.map((r, i) => (
          <div key={r.key} className="r3row">
            <input
              className="field__input"
              aria-label={L.rowLabel}
              value={r.label}
              maxLength={80}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span className="row" style={{ gap: 8 }}>
                <span className="hint">{L.rowMax}</span>
                <Stepper
                  value={r.max}
                  min={1}
                  max={10}
                  label={L.rowMax}
                  lessLabel={L.less}
                  moreLabel={L.more}
                  onChange={(v) => patch(i, { max: v })}
                />
              </span>
              <span className="row" style={{ gap: 8 }}>
                <span className="hint">{L.rowWeight}</span>
                <Stepper
                  value={r.weight}
                  min={1}
                  max={10}
                  label={L.rowWeight}
                  lessLabel={L.less}
                  moreLabel={L.more}
                  onChange={(v) => patch(i, { weight: v })}
                />
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={list.length <= 1}
                onClick={() => setList((l) => l.filter((_, j) => j !== i))}
              >
                {L.removeRow}
              </button>
            </div>
          </div>
        ))}
      </div>
      {err && <p className="field__error">{err}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={list.length >= 12}
          onClick={() => setList((l) => [...l, { key: newKey(l), label: "", max: 4, weight: 1 }])}
        >
          {L.addRow}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || same}
          onClick={() => void save()}
        >
          {L.save}
        </button>
      </div>
    </section>
  );
}
