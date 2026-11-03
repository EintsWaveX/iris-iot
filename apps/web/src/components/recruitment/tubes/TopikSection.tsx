/**
 * Tubes, Topik dan Brief (mockup Topik): the mode (Akademik sets topics, or
 * they are drawn at the Techmeet), the topics and who holds each, the publish
 * switch and the draw screen. Teams are the unit; a CaAs only ever sees their
 * own team's topic. Akademik edits; any Panitia reads.
 */
import { useEffect, useRef, useState } from "react";
import {
  DiceFiveIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShuffleIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import { Stepper } from "../../ui/Controls";
import HoldButton from "../../ui/HoldButton";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { useLatihanMode } from "../../../lib/recruitment/latihan-client";
import type { TubesBoardTopic } from "../../../lib/recruitment/tubes-api";
import { kapan, toast, type PanelCtx } from "./panelShared";

/* ------------------------------------------------------------ the topic form */

function TopicDialog({
  c,
  topic,
  onClose,
}: {
  c: PanelCtx;
  topic: TubesBoardTopic | null;
  onClose: () => void;
}) {
  const { w } = c;
  const [title, setTitle] = useState(topic?.title ?? "");
  const [brief, setBrief] = useState(topic?.brief ?? "");
  const [cap, setCap] = useState(String(topic?.cap ?? 3));
  const [miss, setMiss] = useState<string | null>(null);
  const go = async () => {
    if (!title.trim()) return setMiss("title");
    if (!brief.trim()) return setMiss("brief");
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1 || n > 40) return setMiss("cap");
    const ok = await c.post(
      "tubes-topic-save",
      { id: topic?.id, title, brief, cap: n },
      w.topicSave,
    );
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={topic ? w.editTopic : w.addTopic}
      lang={c.lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={c.busy}
            onClick={() => void go()}
          >
            <span className="btn__label">{w.topicSave}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{w.topicTitle}</span>
          <input
            className="field__input"
            value={title}
            maxLength={80}
            aria-invalid={miss === "title" ? true : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{w.topicBrief}</span>
          <textarea
            className="field__input"
            rows={7}
            value={brief}
            maxLength={2000}
            aria-invalid={miss === "brief" ? true : undefined}
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{w.topicCap}</span>
          <input
            className="field__input"
            type="number"
            min={1}
            max={40}
            value={cap}
            aria-invalid={miss === "cap" ? true : undefined}
            onChange={(e) => setCap(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </label>
        {miss && (
          <p className="hint tb-warn" role="alert">
            {c.say("data_salah")}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ who holds it */

function WhoDialog({
  c,
  topic,
  onClose,
}: {
  c: PanelCtx;
  topic: TubesBoardTopic;
  onClose: () => void;
}) {
  const { w, b } = c;
  const can = b.rights.topics;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={topic.title}
      description={w.topicTeams(topic.used, topic.cap)}
      lang={c.lang}
      actions={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          <span className="btn__label">{w.close}</span>
        </button>
      }
    >
      {b.teams.length === 0 ? (
        <p className="hint">{w.noTeamYet}</p>
      ) : (
        <div className="tp-list" role="radiogroup" aria-label={topic.title}>
          {b.teams.map((t) => {
            const mine = t.topicId === topic.id;
            const other = b.topics.find((x) => x.id === t.topicId);
            return (
              <button
                key={t.id}
                type="button"
                className="tp-pick"
                role="radio"
                aria-checked={mine}
                disabled={!can || c.busy}
                onClick={() =>
                  void c.post("tubes-topic-set", { teamId: t.id, topicId: mine ? null : topic.id })
                }
              >
                <span className="stack" style={{ gap: 0 }}>
                  <b>{t.name}</b>
                  <span className="hint">
                    {mine ? w.topicSet : other ? `${w.topicSet}: ${other.title}` : w.topicNone}
                  </span>
                </span>
                <span className="hint num">{w.size(t.size)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------ the draw screen */

const ROW = 64;

function Reel({
  topics,
  target,
  runKey,
  onDone,
}: {
  topics: TubesBoardTopic[];
  target: number | null;
  runKey: number;
  onDone: () => void;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  const reps = 6;
  const items = Array.from(
    { length: (reps + 1) * topics.length },
    (_, i) => topics[i % topics.length],
  );
  useEffect(() => {
    const el = inner.current;
    if (!el || target === null) return;
    const to = -((reps * topics.length + target - 1) * ROW);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (calm) {
      el.style.transition = "none";
      el.style.transform = `translateY(${to}px)`;
      onDone();
      return;
    }
    el.style.transition = "none";
    el.style.transform = "translateY(0px)";
    void el.offsetHeight;
    el.style.transition = "transform 2.2s cubic-bezier(0.12, 0.8, 0.2, 1)";
    el.style.transform = `translateY(${to}px)`;
    const t = window.setTimeout(onDone, 2300);
    return () => window.clearTimeout(t);
  }, [runKey]);
  return (
    <div className="tp-reel" aria-live="polite">
      <div className="tp-reel__win" aria-hidden="true" />
      <div className="tp-reel__in" ref={inner} style={{ paddingTop: ROW }}>
        {items.map((t, i) => (
          <div key={i} className="tp-reel__r">
            {t.title}
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawDialog({ c, onClose }: { c: PanelCtx; onClose: () => void }) {
  const { w, b } = c;
  const [run, setRun] = useState(0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ teamId: number; topicId: number; done: boolean } | null>(null);
  const waiting = b.teams.filter((t) => !t.drawn && t.size > 0);
  const next = waiting[0];
  const drawn = b.teams.filter((t) => t.drawn).length;
  const idx = (id: number) =>
    Math.max(
      0,
      b.topics.findIndex((x) => x.id === id),
    );

  const spin = async () => {
    if (!next || busy) return;
    setBusy(true);
    const r = await recPost<{ ok: true; drawn: { teamId: number; topicId: number }[] }>(
      "tubes-draw",
      { teamId: next.id },
    );
    if (isFail(r) || !r.drawn[0]) {
      setBusy(false);
      return toast(c.say(isFail(r) ? r.kode : "lain"), "danger");
    }
    setRes({ ...r.drawn[0], done: false });
    setRun((x) => x + 1);
  };
  const landed = () => {
    setRes((r) => (r ? { ...r, done: true } : r));
    setBusy(false);
  };
  const teamName = (id: number) => b.teams.find((t) => t.id === id)?.name ?? "";
  const topicOf = res ? b.topics.find((x) => x.id === res.topicId) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={w.drawTitle}
      description={w.drawLede}
      lang={c.lang}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void c.post("tubes-draw-reset", {}).then(() => setRes(null))}
          >
            <span className="btn__label">{w.drawRestart}</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || !next}
            onClick={() => void c.post("tubes-draw", {})}
          >
            <span className="btn__label">{w.drawAll}</span>
          </button>
          <span className="grow" />
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            <span className="btn__label">{w.close}</span>
          </button>
        </>
      }
    >
      <div className="tp-draw">
        <div className="stack stack--sm" style={{ textAlign: "center" }}>
          <span className="eyebrow">
            {res && !res.done ? w.drawNow : next ? w.drawNext : w.drawDone}
          </span>
          <b style={{ fontSize: "1.6rem" }}>
            {res ? teamName(res.teamId) : next ? next.name : w.drawDone}
          </b>
          <span className="hint num">{w.drawn(drawn, b.teams.length)}</span>
        </div>
        {b.topics.length > 0 && (
          <Reel
            topics={b.topics}
            target={res ? idx(res.topicId) : null}
            runKey={run}
            onDone={landed}
          />
        )}
        <div className="row" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!next || busy}
            onClick={() => void spin()}
          >
            <DiceFiveIcon size={20} aria-hidden="true" />
            <span className="btn__label">{busy ? w.spinning : w.spin}</span>
          </button>
        </div>
        {res?.done && topicOf && (
          <div className="rec-note" role="status">
            <b>{topicOf.title}</b>
            <span>{topicOf.brief}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ the section */

const STEP: Record<Lang, { less: string; more: string }> = {
  id: { less: "Kurangi", more: "Tambah" },
  en: { less: "Less", more: "More" },
  zh: { less: "减少", more: "增加" },
};

export default function TopikSection({ c }: { c: PanelCtx }) {
  const { w, b, lang } = c;
  const can = b.rights.topics;
  const latihan = useLatihanMode() !== null;
  const [edit, setEdit] = useState<TubesBoardTopic | "new" | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [draw, setDraw] = useState(false);
  const [del, setDel] = useState<TubesBoardTopic | null>(null);
  const mode = b.setting.assign;
  const pub = b.times.published;
  const teamsWith = b.teams.filter((t) => t.size > 0);
  const unas = teamsWith.filter((t) => !t.topicId).length;
  const over = b.topics.filter((t) => t.used > t.cap).length;
  const drawn = b.teams.filter((t) => t.drawn).length;

  const step = { less: STEP[lang].less, more: STEP[lang].more };
  const setting = (patch: Partial<typeof b.setting>) =>
    c.post("setting-save", { key: "tim", value: { ...b.setting, ...patch } });

  return (
    <div className="stack">
      <section className="panel tp-ctl">
        <div className="tp-ctl__g">
          <div className="stack stack--sm">
            <span className="hint">{w.mode}</span>
            <div className="tp-seg" role="radiogroup" aria-label={w.mode}>
              {(["ditetapkan", "undi"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className="tp-seg__b"
                  disabled={!b.rights.config || c.busy}
                  onClick={() => void setting({ assign: m })}
                >
                  {m === "ditetapkan" ? w.modeSet : w.modeDraw}
                </button>
              ))}
            </div>
          </div>
          <div className="stack stack--sm">
            <span className="hint">{w.teamSize}</span>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <Stepper
                value={b.setting.teamMin}
                min={2}
                max={b.setting.teamMax}
                label={`${w.teamSize}: ${w.teamMin}`}
                fmt={(v) => `${w.teamMin} ${v}`}
                lessLabel={step.less}
                moreLabel={step.more}
                disabled={!b.rights.config || c.busy}
                onChange={(n) => void setting({ teamMin: n })}
              />
              <Stepper
                value={b.setting.teamMax}
                min={b.setting.teamMin}
                max={8}
                label={`${w.teamSize}: ${w.teamMax}`}
                fmt={(v) => `${w.teamMax} ${v}`}
                lessLabel={step.less}
                moreLabel={step.more}
                disabled={!b.rights.config || c.busy}
                onChange={(n) => void setting({ teamMax: n })}
              />
            </div>
          </div>
        </div>
        <div className="tp-ctl__p">
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <b>{w.publishTitle}</b>
              <Pill tone={pub || (mode === "undi" && drawn > 0) ? "ok" : "warn"}>
                {pub ? w.published : w.draft}
              </Pill>
            </div>
            <span className="hint">
              {b.times.techmeetAt ? w.publishBody(kapan(b.times.techmeetAt, lang)) : ""}{" "}
              {mode === "undi" ? w.publishDrawn : ""}
            </span>
          </div>
          {mode === "undi" ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!can}
              onClick={() => setDraw(true)}
            >
              <DiceFiveIcon size={18} aria-hidden="true" />
              <span className="btn__label">
                {w.drawScreen} · {drawn}/{b.teams.length}
              </span>
            </button>
          ) : pub ? (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!can || c.busy}
              onClick={() => void c.post("tubes-publish", { publish: false })}
            >
              <span className="btn__label">{w.withdraw}</span>
            </button>
          ) : (
            <HoldButton
              tone="primary"
              tint="warn"
              icon={EyeIcon}
              label={w.publishNow}
              disabled={!can || unas > 0 || over > 0 || teamsWith.length === 0}
              onDone={() => void c.post("tubes-publish", { publish: true })}
            />
          )}
        </div>
        {!can && <span className="hint">{w.topicsHint}</span>}
        {mode === "ditetapkan" && !pub && (unas > 0 || over > 0) && (
          <span className="hint tb-warn">{w.publishWait(unas, over)}</span>
        )}
      </section>

      <div className="tp-bar">
        <span className="hint">{latihan && b.topics.length > 0 ? w.topicExample : ""}</span>
        <span className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!can || mode === "undi" || c.busy || b.topics.length === 0}
            onClick={() => void c.post("tubes-topic-share", {})}
          >
            <ShuffleIcon size={16} aria-hidden="true" />
            <span className="btn__label">{w.shareEvenly}</span>
          </button>
          <button
            type="button"
            className="btn btn--inverse btn--sm"
            disabled={!can}
            onClick={() => setEdit("new")}
          >
            <PlusIcon size={16} aria-hidden="true" />
            <span className="btn__label">{w.addTopic}</span>
          </button>
        </span>
      </div>

      {b.topics.length === 0 ? (
        <p className="hint">{w.noTopics}</p>
      ) : (
        <div className="tp-grid">
          {b.topics.map((t) => (
            <section
              key={t.id}
              className="panel tp-top"
              data-over={t.used > t.cap ? "yes" : undefined}
            >
              <div className="row row--between" style={{ gap: 8, alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <h3 className="h4" style={{ margin: 0, overflowWrap: "anywhere" }}>
                    {t.title}
                  </h3>
                  <span className="row" style={{ gap: 6 }}>
                    {latihan && <Pill>{w.topicExampleTag}</Pill>}
                    <span className="hint num">{w.topicTeams(t.used, t.cap)}</span>
                  </span>
                </div>
                <span className="row" style={{ gap: 4 }}>
                  <IconButton
                    sm
                    icon={PencilSimpleIcon}
                    label={w.editTopic}
                    disabled={!can}
                    onClick={() => setEdit(t)}
                  />
                  <IconButton
                    sm
                    kind="danger"
                    icon={TrashIcon}
                    label={w.topicDelete}
                    disabled={!can}
                    onClick={() => setDel(t)}
                  />
                </span>
              </div>
              <p className="tp-top__b">{t.brief}</p>
              <div
                className="tp-bar2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round((t.used / t.cap) * 100))}
              >
                <i style={{ width: `${Math.min(100, Math.round((t.used / t.cap) * 100))}%` }} />
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn--inverse btn--sm"
                  onClick={() => setWho(t.id)}
                >
                  <UsersThreeIcon size={16} aria-hidden="true" />
                  <span className="btn__label">{w.topicWho}</span>
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && (
        <TopicDialog c={c} topic={edit === "new" ? null : edit} onClose={() => setEdit(null)} />
      )}
      {who !== null && b.topics.find((x) => x.id === who) && (
        <WhoDialog c={c} topic={b.topics.find((x) => x.id === who)!} onClose={() => setWho(null)} />
      )}
      {draw && <DrawDialog c={c} onClose={() => setDraw(false)} />}
      {del && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDel(null)}
          title={del.title}
          description={w.topicDelete}
          lang={lang}
          size="sm"
          blocking
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDel(null)}>
                <span className="btn__label">{w.cancel}</span>
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() =>
                  void c.post("tubes-topic-delete", { id: del.id }).then(() => setDel(null))
                }
              >
                <span className="btn__label">{w.topicDelete}</span>
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
