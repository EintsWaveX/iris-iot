/**
 * The event editor (prompt 03, mockup r1-kalender), for the Ketua and Acara:
 * name, kind, the stage it belongs to, from and to, all day or set hours,
 * place, and whether candidates see it. It only builds the request; the
 * caller sends it (and asks again with confirm when the stage has started).
 * Delete asks first and says what the stage loses.
 */
import { useState } from "react";
import Dialog from "../../ui/Dialog";
import Dropdown from "../../ui/Dropdown";
import SegmentedControl from "../../ui/SegmentedControl";
import { DateField, Switch, TimeField } from "../../ui/Controls";
import Confirm from "../../ui/Confirm";
import type { Lang } from "../../../lib/kelas";
import { cekEvent } from "../../../lib/recruitment/validate";
import {
  EVENT_KINDS,
  STAGES,
  type EventKind,
  type EventSaveRequest,
  type RecEvent,
  type StageKey,
} from "../../../lib/recruitment/types";
import { REC } from "../recruitmentStrings";
import { rentangAcara } from "../shared";
import { CAL } from "./calendarStrings";

/** Kinds that start out internal: only the Panitia talk about them. */
const INTERNAL_KINDS: EventKind[] = ["pleno", "cutting", "review"];

export default function EventDialog({
  lang,
  open,
  onOpenChange,
  event,
  hariIni,
  onSave,
  onDelete,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The event to edit, or null for a new one */
  event: RecEvent | null;
  hariIni: string;
  /** Resolves true when it saved (the dialog then closes) */
  onSave: (r: EventSaveRequest) => Promise<boolean>;
  onDelete: (e: RecEvent) => Promise<boolean>;
}) {
  const c = CAL[lang].editor;
  const r = REC[lang];
  const isNew = !event;
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "meeting");
  const [stage, setStage] = useState<StageKey | "">(event?.stage ?? "");
  const [from, setFrom] = useState(event?.startsOn ?? hariIni);
  const [to, setTo] = useState(event?.endsOn ?? hariIni);
  const [hours, setHours] = useState(isNew ? true : !!event?.dayStart);
  const [start, setStart] = useState(event?.dayStart ?? "18:30");
  const [end, setEnd] = useState(event?.dayEnd ?? "21:00");
  const [place, setPlace] = useState(event?.place ?? "");
  const [internal, setInternal] = useState(event?.internal ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  const body = (): EventSaveRequest => ({
    ...(event ? { id: event.id } : {}),
    kind,
    title: title.trim(),
    startsOn: from,
    endsOn: to,
    dayStart: hours ? start : null,
    dayEnd: hours ? end : null,
    place: place.trim() || null,
    internal,
    audience: event?.audience ?? "all",
    gates: event?.gates ?? [],
    stage: stage || null,
    color: event?.color ?? null,
  });

  async function simpan() {
    const b = body();
    const ok = cekEvent(b);
    if (!ok.ok) {
      setError(
        ok.field === "title"
          ? c.errName
          : ok.field === "endsOn"
            ? c.errRange
            : ok.field === "dayEnd"
              ? c.errTime
              : CAL[lang].fail,
      );
      return;
    }
    setError(null);
    setBusy(true);
    const done = await onSave(b);
    setBusy(false);
    if (done) onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? c.add : c.edit}
        description={isNew ? c.addDesc : rentangAcara(event, lang)}
        size="lg"
        lang={lang}
        alt={
          event ? (
            <button type="button" className="btn btn--ghost" onClick={() => setDel(true)}>
              {c.remove}
            </button>
          ) : undefined
        }
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
              {r.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void simpan()}
            >
              <span className="btn__label">{r.save}</span>
            </button>
          </>
        }
      >
        <div className="rec-form">
          {error && (
            <p className="banner banner--warn rec-form__wide" role="alert">
              {error}
            </p>
          )}
          <label className="field rec-form__wide">
            <span className="field__label">{c.name}</span>
            <input
              className="field__input"
              value={title}
              maxLength={80}
              placeholder={c.namePh}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="field">
            <span className="field__label">{c.kind}</span>
            <Dropdown
              id="rec-ev-kind"
              label={c.kind}
              hideLabel
              value={kind}
              onChange={(k) => {
                setKind(k as EventKind);
                if (INTERNAL_KINDS.includes(k as EventKind)) setInternal(true);
              }}
              options={EVENT_KINDS.map((k) => ({ value: k, label: r.kind[k] }))}
            />
          </div>
          <div className="field">
            <span className="field__label">{c.stage}</span>
            <Dropdown
              id="rec-ev-stage"
              label={c.stage}
              hideLabel
              value={stage}
              onChange={(s) => setStage(s as StageKey | "")}
              options={[
                { value: "", label: c.stageNone },
                ...STAGES.map((s) => ({ value: s, label: r.stage[s] })),
              ]}
            />
          </div>
          <div className="field">
            <span className="field__label" id="rec-ev-from-l">
              {c.from}
            </span>
            <DateField
              value={from}
              label={c.from}
              lang={lang}
              onChange={(v) => {
                setFrom(v);
                if (v > to) setTo(v);
              }}
            />
          </div>
          <div className="field">
            <span className="field__label" id="rec-ev-to-l">
              {c.to}
            </span>
            <DateField value={to} min={from} label={c.to} lang={lang} onChange={setTo} />
          </div>
          <div className="field rec-form__wide">
            <span className="field__label">{c.time}</span>
            <SegmentedControl
              fill
              aria-label={c.time}
              value={hours ? "jam" : "hari"}
              onValueChange={(v) => setHours(v === "jam")}
              options={[
                { value: "hari", label: c.allDay },
                { value: "jam", label: c.setHours },
              ]}
            />
            {hours && (
              <div className="rec-form__time">
                <TimeField value={start} from={6} label={c.start} lang={lang} onChange={setStart} />
                <span className="hint">{c.until}</span>
                <TimeField value={end} from={6} label={c.end} lang={lang} onChange={setEnd} />
                <span className="hint">{c.everyDay}</span>
              </div>
            )}
          </div>
          <label className="field rec-form__wide">
            <span className="field__label">{c.place}</span>
            <input
              className="field__input"
              value={place}
              maxLength={80}
              placeholder={c.placePh}
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <div className="rec-switchrow rec-form__wide">
            <span className="stack" style={{ gap: 2 }}>
              <b>{c.shown}</b>
              <span className="hint">{internal ? c.internalOn : c.internalOff}</span>
            </span>
            <Switch on={!internal} label={c.shown} onChange={(v) => setInternal(!v)} />
          </div>
        </div>
      </Dialog>
      {event && (
        <Confirm
          open={del}
          onOpenChange={setDel}
          title={c.removeTitle}
          body={c.removeBody(event.title, event.gates.length > 0)}
          confirmLabel={r.delete}
          cancelLabel={r.cancel}
          tone="danger"
          lang={lang}
          onConfirm={async () => {
            const ok = await onDelete(event);
            if (ok) onOpenChange(false);
            return ok;
          }}
        />
      )}
    </>
  );
}
