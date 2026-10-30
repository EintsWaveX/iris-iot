/**
 * One question in the editor (mockup r3-bank): the form on the left, what a
 * candidate sees on the right (the runner's own card, shuffled for a made-up
 * seat). validateQuestion's problems show at the top and keep Simpan off. A
 * question that was shown keeps its structure; its key changes only through
 * Perbaiki Kunci, with a note. While a real room runs a ready question is
 * read only (EXAM-ENGINE 1.4).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ShuffleIcon } from "@phosphor-icons/react";
import Confirm from "../../../../ui/Confirm";
import Dialog from "../../../../ui/Dialog";
import Dropdown from "../../../../ui/Dropdown";
import HoldButton from "../../../../ui/HoldButton";
import SegmentedControl from "../../../../ui/SegmentedControl";
import TabLine from "../../../../ui/TabLine";
import { QuestionCard } from "../../../exam/render";
import type { Lang } from "../../../../../lib/kelas";
import { useBelumSimpan } from "../../../../../lib/belum-simpan";
import { canon } from "../../../../../lib/recruitment/bank-rules";
import {
  blankDraft,
  changeFormat,
  codeLangOf,
  fromFull,
  keySig,
  keySummary,
  previewOf,
  problems,
  savePayload,
  structureChanged,
  syncBlanks,
  type Draft,
} from "../../../../../lib/recruitment/bank-draft";
import type {
  ExamConfigResponse,
  QuestionFull,
  SaveResponse,
} from "../../../../../lib/recruitment/bank-api";
import { useBankQuestion } from "../../../../../lib/recruitment/bank-client";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import {
  FORMATS,
  type CodeLang,
  type Format,
  type Phase1Part,
  type Value,
} from "../../../../../lib/recruitment/exam-types";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import { tgl } from "../../../shared";
import { ImagesEditor } from "./BankAttach";
import {
  ChoiceKeys,
  FitbKeys,
  FixKeys,
  LinesKeys,
  MatchKeys,
  OrderKeys,
  type Tx,
} from "./BankKeys";
import { BK } from "./bankStrings";

import "../../../recruitment-s3-runner.css";
import "../../../recruitment-s3-bank.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const hm = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);

/** Every question is C now */
export function allowedLangs(_cfg: ExamConfigResponse["config"], _part: Phase1Part) {
  return ["c"] as const;
}

function CodeArea({
  value,
  lang,
  onChange,
  onLang,
  t,
  id,
}: {
  value: string;
  lang: CodeLang;
  onChange: (v: string) => void;
  onLang: (l: CodeLang) => void;
  t: Tx;
  id: string;
}) {
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <label className="label-caps" htmlFor={id}>
          {t.codeLabel}
        </label>
        <SegmentedControl
          aria-label={t.codeLang}
          value={lang}
          onValueChange={(v) => onLang(v as CodeLang)}
          options={(["cpp", "py", "text"] as const).map((v) => ({
            value: v,
            label: t.codeLangs[v],
          }))}
        />
      </div>
      <textarea
        className="field__input r3src"
        id={id}
        rows={9}
        value={value}
        spellCheck={false}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="hint">{t.codeHint}</span>
    </div>
  );
}

export default function BankEditor({
  lang,
  id,
  part,
  config,
  onBack,
  onOpen,
}: {
  lang: Lang;
  id: number | null;
  part: Phase1Part;
  config: ExamConfigResponse;
  onBack: () => void;
  onOpen: (id: number) => void;
}) {
  const t = BK[lang];
  const q = useBankQuestion(id, id !== null);
  const stored: QuestionFull | null = q.data?.question ?? null;
  const log = q.data?.log ?? [];

  const fresh = useMemo(() => {
    const langs = allowedLangs(config.config, part);
    return blankDraft(part, langs[0]);
  }, [config.config, part]);
  const [d, setD] = useState<Draft | null>(id === null ? fresh : null);
  const [orig, setOrig] = useState<Draft | null>(id === null ? fresh : null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDlg, setKeyDlg] = useState(false);
  const [voidDlg, setVoidDlg] = useState(false);
  const [delDlg, setDelDlg] = useState(false);
  const [leaveDlg, setLeaveDlg] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState(112);
  const [value, setValue] = useState<Value>(null);
  const [stale, setStale] = useState(false);
  const loaded = useRef<number | null>(null);

  // Take the stored question in when it first arrives, and again when someone else saved
  // while nothing here was edited. With edits in hand the person is told and chooses.
  useEffect(() => {
    if (!stored) return;
    const fresh2 = fromFull(stored);
    if (
      loaded.current === null ||
      (loaded.current !== stored.version && orig && d && canon(d) === canon(orig))
    ) {
      loaded.current = stored.version;
      setD(fresh2);
      setOrig(fresh2);
      setStale(false);
    } else if (loaded.current !== stored.version) setStale(true);
  }, [stored?.version, stored?.updatedAt]);

  const dirty = !!d && !!orig && canon(d) !== canon(orig);
  useBelumSimpan(dirty);

  if (!d || !orig) {
    return q.updatedAt !== null && !stored ? (
      <section className="panel stack stack--sm">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {t.back}
        </button>
        <b>{t.err.tidak_ada}</b>
      </section>
    ) : (
      <span className="skeleton" style={{ height: 420 }} />
    );
  }

  const shown = !!stored?.shown;
  const voided = !!stored?.voided;
  const running = config.running;
  const lock = shown;
  const keyLock = shown && !keyOpen;
  const probs = problems(d);
  const structure = shown && structureChanged(orig, d);
  const readyTouch = running && (orig.status === "ready" || d.status === "ready");
  const keyChanged = keySig(d) !== keySig(orig);
  const canSave = dirty && probs.length === 0 && !structure && !readyTouch && !busy && !stale;
  const view = previewOf(d, seat);
  const langs = allowedLangs(config.config, d.part);

  const set = (next: Draft) => setD(syncBlanks(next));
  const body = d.body as { prompt: string; code?: { lang: CodeLang; src: string } };

  async function save(withNote?: string) {
    if (!d || !orig) return;
    setBusy(true);
    const r = await recPost<SaveResponse>("question-save", savePayload(d, withNote));
    setBusy(false);
    if (isFail(r)) {
      if (r.kode === "versi_lama") setStale(true);
      if (r.kode === "perlu_catatan") setKeyDlg(true);
      toast(t.err[r.kode] ?? t.err.other, "danger");
      return;
    }
    const next = fromFull(r.question);
    loaded.current = r.question.version;
    setOrig(next);
    setD(next);
    setKeyOpen(false);
    setKeyDlg(false);
    setNote("");
    toast(r.kind === "same" ? t.savedSame : id === null ? t.savedNew : t.saved(r.question.version));
    if (id === null) onOpen(r.question.id);
    else q.refresh();
  }

  function press() {
    if (shown && keyChanged) setKeyDlg(true);
    else void save();
  }

  async function voidIt() {
    if (!id) return;
    const r = await recPost<{ ok: true }>("question-void", { id, note: note.trim() });
    if (isFail(r)) {
      toast(
        r.status === 404 || String(r.kode).startsWith("aksi")
          ? t.voidMissing
          : (t.err[r.kode] ?? t.err.other),
        "danger",
      );
      return;
    }
    setVoidDlg(false);
    setNote("");
    toast(t.voidDone, "warn");
    q.refresh();
  }

  async function remove(): Promise<boolean> {
    const r = await recPost<{ ok: true }>("question-delete", { id });
    if (isFail(r)) {
      toast(t.err[r.kode] ?? t.err.other, "danger");
      return false;
    }
    toast(t.deleted);
    onBack();
    return true;
  }

  const FormatPick = (
    <div className="r3fmts" role="radiogroup" aria-label={t.fieldFormat}>
      {FORMATS.map((f: Format) => (
        <button
          key={f}
          type="button"
          role="radio"
          className="r3fmt"
          aria-checked={d.format === f}
          disabled={lock && d.format !== f}
          onClick={() => {
            set(changeFormat(d, f));
            setValue(null);
          }}
        >
          <b>{t.formats[f]}</b>
          <span className="hint">{t.formatHint[f]}</span>
        </button>
      ))}
    </div>
  );

  const keyProps = { set, lock, keyLock, t };
  const KeyEditor =
    d.format === "single" || d.format === "multi" ? (
      <ChoiceKeys d={d} {...keyProps} />
    ) : d.format === "lines" ? (
      <LinesKeys d={d} {...keyProps} />
    ) : d.format === "fix" ? (
      <FixKeys d={d} {...keyProps} />
    ) : d.format === "order" ? (
      <OrderKeys d={d} {...keyProps} />
    ) : d.format === "match" ? (
      <MatchKeys d={d} {...keyProps} />
    ) : (
      <FitbKeys d={d} {...keyProps} />
    );

  const needsCode = d.format === "lines" || d.format === "fix" || d.format === "fitb";
  const codeLang: CodeLang =
    d.format === "order" ? d.body.lang : (body.code?.lang ?? codeLangOf(d.lang));

  return (
    <div className="stack" data-editing="yes">
      <div className="row r3ed__head">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => (dirty ? setLeaveDlg(true) : onBack())}
        >
          <ArrowLeftIcon size={16} aria-hidden="true" /> {t.back}
        </button>
        <span className="grow" />
        {shown && !voided && id !== null && (
          <button type="button" className="btn btn--danger-soft" onClick={() => setVoidDlg(true)}>
            {t.voidOpen}
          </button>
        )}
        <div style={{ width: 220 }}>
          <TabLine
            seg
            label={t.statusTabs}
            value={d.status}
            onChange={(v) => set({ ...d, status: v })}
            tabs={[
              { v: "draft", label: t.draft },
              { v: "ready", label: t.ready },
            ]}
          />
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSave}
          title={
            probs.length
              ? probs.length === 1
                ? t.problemsOne
                : t.problemsMany(probs.length)
              : readyTouch
                ? t.runningTip
                : structure
                  ? t.structureLocked
                  : undefined
          }
          onClick={press}
        >
          {busy ? t.saving : t.save}
        </button>
      </div>

      {stale && (
        <div className="rec-note rec-note--warn" role="alert">
          <b>{t.err.versi_lama}</b>
          <div className="row">
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              onClick={() => {
                loaded.current = null;
                setStale(false);
                q.refresh();
              }}
            >
              {t.reload}
            </button>
          </div>
        </div>
      )}
      {running && (
        <div className="rec-note rec-note--warn">
          <b>{t.running}</b>
          <span>{t.runningBody}</span>
        </div>
      )}
      {shown && (
        <div className="rec-note r3locknote">
          <b>{t.shownTitle}</b>
          <span>{t.shownBody}</span>
        </div>
      )}
      {voided && (
        <div className="rec-note rec-note--warn">
          <b>{t.voidedNote}</b>
          {stored?.voidNote && <span>{t.voidedWhy(stored.voidNote)}</span>}
        </div>
      )}

      <div className="r3bed">
        <div className="panel stack r3bed__form">
          {probs.length > 0 && (
            <div className="r3problems" role="status">
              <b>{t.problems}</b>
              <ul>
                {probs.map((p, i) => (
                  <li key={i}>{t.problem(p)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="r3bed__meta">
            <Dropdown
              id="r3-q-part"
              label={t.fieldPart}
              value={d.part}
              disabled={lock}
              options={(["logika", "fitb", "kodingan"] as const).map((p) => ({
                value: p,
                label: t.partsLong[p],
              }))}
              onChange={(v) => {
                const part2 = v as Phase1Part;
                const ok: readonly string[] = allowedLangs(config.config, part2);
                set({ ...d, part: part2, lang: ok.includes(d.lang) ? d.lang : ok[0] } as Draft);
              }}
            />
            <div className="stack stack--sm">
              <span className="label-caps">{t.fieldLang}</span>
              <SegmentedControl
                aria-label={t.fieldLang}
                value={d.lang}
                onValueChange={(v) => !lock && set({ ...d, lang: v as Draft["lang"] } as Draft)}
                options={langs.map((l) => ({ value: l, label: t.langs[l] }))}
              />
            </div>
          </div>
          <div className="stack stack--sm">
            <span className="label-caps">{t.fieldFormat}</span>
            {FormatPick}
            {lock && <span className="hint">{t.changeFormatNote}</span>}
          </div>
          <label className="stack stack--sm">
            <span className="label-caps">{t.fieldTitle}</span>
            <input
              className="field__input"
              id="r3-q-title"
              value={d.title}
              maxLength={200}
              onChange={(e) => set({ ...d, title: e.target.value })}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.fieldPrompt}</span>
            <textarea
              className="field__input r3prompt"
              id="r3-q-prompt"
              rows={6}
              value={body.prompt}
              onChange={(e) => set({ ...d, body: { ...d.body, prompt: e.target.value } } as Draft)}
            />
            <span className="hint">{t.promptHint}</span>
          </label>
          {needsCode && (
            <CodeArea
              id="r3-q-code"
              t={t}
              value={body.code?.src ?? ""}
              lang={codeLang}
              onChange={(src) =>
                set({
                  ...d,
                  body: { ...d.body, code: { lang: codeLang, src } },
                } as Draft)
              }
              onLang={(l) =>
                set({
                  ...d,
                  body: { ...d.body, code: { lang: l, src: body.code?.src ?? "" } },
                } as Draft)
              }
            />
          )}
          {d.format === "order" && (
            <div className="row row--between">
              <span className="label-caps">{t.codeLang}</span>
              <SegmentedControl
                aria-label={t.codeLang}
                value={d.body.lang}
                onValueChange={(l) =>
                  set({ ...d, body: { ...d.body, lang: l as CodeLang } } as Draft)
                }
                options={(["cpp", "py", "text"] as const).map((v) => ({
                  value: v,
                  label: t.codeLangs[v],
                }))}
              />
            </div>
          )}
          {KeyEditor}
          {shown && (
            <div className="row">
              <button
                type="button"
                className="btn btn--inverse"
                disabled={keyOpen}
                onClick={() => setKeyOpen(true)}
              >
                {t.keyOpen}
              </button>
              <span className="hint">{t.keyOpenHint}</span>
            </div>
          )}
          <ImagesEditor d={d} set={set} t={t} lang={lang} />
          {id !== null && log.length > 0 && (
            <div className="stack stack--sm">
              <span className="label-caps">{t.history}</span>
              <ul className="r3hist">
                {log.map((l) => (
                  <li key={l.id}>
                    <b>{t.historyKind[l.kind] ?? l.kind}</b>
                    <span className="hint">
                      {l.nama ?? l.who} · {tgl(tanggalWib(new Date(l.at)).tanggal, lang)} {hm(l.at)}
                    </span>
                    {l.note && <span>{l.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {id !== null && !shown && (
            <div className="row">
              <button
                type="button"
                className="btn btn--danger-soft btn--sm"
                onClick={() => setDelDlg(true)}
              >
                {t.delete}
              </button>
            </div>
          )}
        </div>

        <aside className="r3bed__prev">
          <div className="row row--between">
            <div className="stack" style={{ gap: 0 }}>
              <span className="eyebrow">{t.preview}</span>
              <b>{t.previewSub}</b>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setSeat(seat + 1);
                setValue(null);
              }}
            >
              <ShuffleIcon size={16} aria-hidden="true" /> {t.shuffleAgain}
            </button>
          </div>
          {view ? (
            <QuestionCard
              view={view}
              codeLang={codeLang}
              index={0}
              total={1}
              value={value}
              onChange={setValue}
              lang={lang}
            />
          ) : (
            <div className="panel">
              <span className="hint">{t.previewWait}</span>
            </div>
          )}
          <span className="hint">{t.previewSeat(seat)}</span>
        </aside>
      </div>

      <Dialog
        open={keyDlg}
        onOpenChange={(o) => !busy && setKeyDlg(o)}
        title={t.keyTitle}
        description={t.keyDesc}
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => setKeyDlg(false)}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || note.trim() === "" || !canSave}
              onClick={() => void save(note)}
            >
              {busy ? t.saving : t.keySave}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="r3kdiff">
            <span className="hint">{t.keyBefore}</span>
            <b>{keySummary(orig)}</b>
            <span className="hint">{t.keyAfter}</span>
            <b>{keySummary(d)}</b>
          </div>
          <label className="stack stack--sm">
            <span className="label-caps">{t.keyNote}</span>
            <textarea
              className="field__input"
              rows={3}
              value={note}
              maxLength={500}
              placeholder={t.keyNotePh}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={voidDlg}
        onOpenChange={setVoidDlg}
        title={t.voidTitle}
        description={t.voidDesc}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setVoidDlg(false)}>
              {t.cancel}
            </button>
            <HoldButton
              label={t.voidHold}
              disabled={note.trim() === ""}
              onDone={() => void voidIt()}
            />
          </>
        }
      >
        <label className="stack stack--sm">
          <span className="label-caps">{t.keyNote}</span>
          <textarea
            className="field__input"
            rows={3}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </Dialog>

      <Confirm
        open={delDlg}
        onOpenChange={setDelDlg}
        title={t.deleteTitle}
        body={t.deleteBody}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        lang={lang}
        onConfirm={remove}
      />
      <Confirm
        open={leaveDlg}
        onOpenChange={setLeaveDlg}
        title={t.leaveTitle}
        body={t.leaveBody}
        confirmLabel={t.leave}
        cancelLabel={t.cancel}
        lang={lang}
        onConfirm={() => {
          onBack();
        }}
      />
    </div>
  );
}
