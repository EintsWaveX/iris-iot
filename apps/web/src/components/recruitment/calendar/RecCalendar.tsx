/**
 * The recruitment calendar's month grid and agenda (prompt 03, mockup
 * r1-kalender): the TP grid's look extended with spanning bars (lanes come
 * from lib/recruitment/calendar.ts layoutMonth), labels that span a bar
 * within its week, internal events hatched and dashed (Panitia only) and a
 * colour per kind.
 *
 * Read only, a click picks a day and lists its events beside the grid.
 * Editable (Ketua and Acara), a bar also drags: the bar moves by whole days,
 * a round end changes its length, a click opens the editor. While dragging
 * the legend row turns into a live readout of the new dates. The caller owns
 * what a drop does (onMove); nothing is saved here.
 */
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import { localeOf } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { geserBulan } from "../../../lib/tp-kalender";
import { addDays, daysBetween, layoutMonth } from "../../../lib/recruitment/calendar";
import {
  STAGES,
  type EventKind,
  type RecEvent,
  type StageKey,
} from "../../../lib/recruitment/types";
import { REC } from "../recruitmentStrings";
import { cs, jamAcara, rentangAcara, tgl, warna, warnaJenis } from "../shared";
import { CAL } from "./calendarStrings";
import { judulAcara, tempatAcara } from "../judul";

const DIA = (d: string, e: Pick<RecEvent, "startsOn" | "endsOn">) =>
  e.startsOn <= d && d <= e.endsOn;

/** A date range of an event as the drag currently shows it. */
function geser(e: RecEvent, mode: "move" | "start" | "end", delta: number): RecEvent {
  if (!delta) return e;
  if (mode === "move")
    return { ...e, startsOn: addDays(e.startsOn, delta), endsOn: addDays(e.endsOn, delta) };
  if (mode === "start") {
    const s = addDays(e.startsOn, delta);
    return { ...e, startsOn: s > e.endsOn ? e.endsOn : s };
  }
  const x = addDays(e.endsOn, delta);
  return { ...e, endsOn: x < e.startsOn ? e.startsOn : x };
}

export function Baris({
  e,
  lang,
  hariIni,
  onPick,
}: {
  e: RecEvent;
  lang: Lang;
  hariIni: string;
  onPick?: () => void;
}) {
  const t = REC[lang];
  const kini = e.startsOn <= hariIni && hariIni <= e.endsOn;
  const isi = (
    <>
      <i style={cs(warna(e))} data-internal={e.internal ? "yes" : undefined} aria-hidden="true" />
      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
        <b>
          {judulAcara(e, lang)}
          {kini && <span className="rkal__kini"> · {t.running}</span>}
        </b>
        <span className="hint">
          {rentangAcara(e, lang)}
          {e.dayStart ? ` · ${jamAcara(e, lang)}` : ""}
          {e.place ? ` · ${tempatAcara(e.place, lang)}` : ""}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {onPick ? (
        <button type="button" className="rkal__item" onClick={onPick}>
          {isi}
        </button>
      ) : (
        <span className="rkal__item">{isi}</span>
      )}
    </li>
  );
}

export function RecCalendar({
  events,
  lang,
  hariIni,
  viewer,
  editable = false,
  onEdit,
  onMove,
  side = true,
}: {
  events: RecEvent[];
  lang: Lang;
  hariIni: string;
  /** panitia sees the internal events and their legend */
  viewer: "candidate" | "panitia";
  editable?: boolean;
  onEdit?: (e: RecEvent) => void;
  onMove?: (e: RecEvent, startsOn: string, endsOn: string) => void;
  side?: boolean;
}) {
  const c = CAL[lang];
  const [ym, setYm] = useState(hariIni.slice(0, 7));
  const [pick, setPick] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: number;
    mode: "move" | "start" | "end";
    delta: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => (viewer === "candidate" ? events.filter((e) => !e.internal) : events),
    [events, viewer],
  );
  const live = useMemo(
    () => shown.map((e) => (drag && drag.id === e.id ? geser(e, drag.mode, drag.delta) : e)),
    [shown, drag],
  );
  const layout = useMemo(() => layoutMonth(live, ym), [live, ym]);
  const byId = useMemo(() => new Map(live.map((e) => [e.id, e])), [live]);

  const monthLabel = new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(localeOf(lang), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const hari = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 5 + i)).toLocaleDateString(localeOf(lang), {
      weekday: "short",
      timeZone: "UTC",
    }),
  );

  const dateAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-date]");
    return el ? el.getAttribute("data-date") : null;
  };
  const press = (ev: PointerEvent, e: RecEvent, mode: "move" | "start" | "end") => {
    if (!editable || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const d0 = dateAt(ev.clientX, ev.clientY);
    let moved = false;
    let delta = 0;
    const mv = (pe: globalThis.PointerEvent) => {
      const d = dateAt(pe.clientX, pe.clientY);
      if (!d || !d0) return;
      delta = daysBetween(d0, d);
      if (delta) moved = true;
      setDrag({ id: e.id, mode, delta });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moved) {
        onEdit?.(e);
        return;
      }
      if (!delta) return;
      const after = geser(e, mode, delta);
      if (after.startsOn !== e.startsOn || after.endsOn !== e.endsOn)
        onMove?.(e, after.startsOn, after.endsOn);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const dragging = drag && drag.delta ? byId.get(drag.id) : null;
  const upcoming = shown
    .filter((e) => e.endsOn >= hariIni)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : a.sort - b.sort))
    .slice(0, 6);
  const onDay = pick ? shown.filter((e) => DIA(pick, e)) : [];
  const kinds = [...new Set(shown.map((e) => e.kind))] as EventKind[];
  const lab = (e: RecEvent) => judulAcara(e, lang);

  return (
    <div className={`rkal${side ? " rkal--side" : ""}`}>
      <div className="stack">
        <div className="row rkal__nav">
          <b className="rkal__bulan" aria-live="polite">
            {monthLabel}
          </b>
          {ym !== hariIni.slice(0, 7) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setYm(hariIni.slice(0, 7))}
            >
              {c.thisMonth}
            </button>
          )}
          <IconButton
            icon={CaretLeftIcon}
            label={c.prev}
            onClick={() => setYm(geserBulan(ym, -1))}
          />
          <IconButton
            icon={CaretRightIcon}
            label={c.nextMonth}
            onClick={() => setYm(geserBulan(ym, 1))}
          />
        </div>
        <div
          className="rkal__grid"
          role="grid"
          aria-label={monthLabel}
          ref={gridRef}
          data-drag={drag ? "yes" : "no"}
        >
          <div className="rkal__wk" role="row">
            {hari.map((h) => (
              <span key={h} className="rkal__h" role="columnheader">
                {h}
              </span>
            ))}
          </div>
          {layout.weeks.map((w, wi) => (
            <div key={wi} className="rkal__wk" role="row">
              {w.days.map((day, col) => {
                if (!day.inMonth) return <span key={col} role="gridcell" />;
                const rows = Array.from({ length: w.lanes }, (_, k) =>
                  w.bars.find((b) => b.lane === k && b.col <= col && col < b.col + b.span),
                );
                while (rows.length && !rows[rows.length - 1]) rows.pop();
                const here = shown.filter((e) => DIA(day.date, e));
                return (
                  <span key={col} role="gridcell" data-date={day.date}>
                    <button
                      type="button"
                      className="rkal__d"
                      data-today={day.date === hariIni ? "yes" : undefined}
                      data-sun={col === 6 ? "yes" : undefined}
                      aria-pressed={pick === day.date}
                      aria-label={[
                        tgl(day.date, lang),
                        ...here.map((e) => judulAcara(e, lang)),
                      ].join(", ")}
                      onClick={() => setPick(pick === day.date ? null : day.date)}
                    >
                      <b>{Number(day.date.slice(8))}</b>
                      {rows.map((b, k) => {
                        if (!b) return <i key={k} className="rkal__gap" aria-hidden="true" />;
                        const e = byId.get(b.eventId)!;
                        const orig = shown.find((x) => x.id === e.id)!;
                        const awal = b.col === col;
                        const akhir = col === b.col + b.span - 1;
                        return (
                          <i
                            key={k}
                            className="rkal__bar"
                            style={cs(warna(e))}
                            data-k={e.kind}
                            data-internal={e.internal ? "yes" : undefined}
                            data-awal={awal ? "yes" : undefined}
                            data-akhir={akhir ? "yes" : undefined}
                            data-drag={drag && drag.id === e.id && drag.delta ? "yes" : undefined}
                            data-edit={editable ? "yes" : undefined}
                            onPointerDown={(ev) => press(ev, orig, "move")}
                            onClick={(ev) => editable && ev.stopPropagation()}
                          >
                            {editable && e.startsOn === day.date && (
                              <span
                                className="rkal__grip rkal__grip--s"
                                onPointerDown={(ev) => press(ev, orig, "start")}
                                aria-hidden="true"
                              />
                            )}
                            {awal && (
                              <span
                                className="rkal__lab"
                                style={{ "--n": b.span } as CSSProperties}
                              >
                                {lab(e)}
                              </span>
                            )}
                            {editable && e.endsOn === day.date && (
                              <span
                                className="rkal__grip rkal__grip--e"
                                onPointerDown={(ev) => press(ev, orig, "end")}
                                aria-hidden="true"
                              />
                            )}
                          </i>
                        );
                      })}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="rkal__status" aria-live="polite">
          {dragging ? (
            <span className="rkal__moving">
              <i style={cs(warna(dragging))} />
              <b>{judulAcara(dragging, lang)}</b>
              <span className="hint">{rentangAcara(dragging, lang)}</span>
            </span>
          ) : (
            <div className="row rkal__legend">
              {kinds.map((k) => (
                <span key={k}>
                  <i style={cs(warnaJenis(k))} data-k={k} />
                  {REC[lang].kind[k]}
                </span>
              ))}
              {viewer === "panitia" && shown.some((e) => e.internal) && (
                <span>
                  <i className="rkal__swatch-int" data-internal="yes" />
                  {c.legendInternal}
                </span>
              )}
            </div>
          )}
        </div>
        {editable && <p className="hint rkal__tip">{c.tipEdit}</p>}
      </div>
      {side && (
        <div className="stack rkal__side">
          {pick ? (
            <div className="stack stack--sm">
              <div className="row row--between">
                <b>{tgl(pick, lang)}</b>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPick(null)}
                >
                  {c.showComing}
                </button>
              </div>
              {onDay.length ? (
                <ul className="rkal__list">
                  {onDay.map((e) => (
                    <Baris
                      key={e.id}
                      e={e}
                      lang={lang}
                      hariIni={hariIni}
                      onPick={editable ? () => onEdit?.(e) : undefined}
                    />
                  ))}
                </ul>
              ) : (
                <span className="hint">{c.noneOnDay}</span>
              )}
            </div>
          ) : (
            <div className="stack stack--sm">
              <h3 className="rkal__sub">{c.coming}</h3>
              {upcoming.length ? (
                <ul className="rkal__list">
                  {upcoming.map((e) => (
                    <Baris
                      key={e.id}
                      e={e}
                      lang={lang}
                      hariIni={hariIni}
                      onPick={() => {
                        setYm(e.startsOn.slice(0, 7));
                        setPick(e.startsOn < hariIni ? hariIni : e.startsOn);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <span className="hint">{c.noEvents}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The same events listed by stage, past ones dimmed. */
export function Agenda({
  events,
  lang,
  hariIni,
  viewer,
  editable,
  onEdit,
}: {
  events: RecEvent[];
  lang: Lang;
  hariIni: string;
  viewer: "candidate" | "panitia";
  editable?: boolean;
  onEdit?: (e: RecEvent) => void;
}) {
  const c = CAL[lang];
  const r = REC[lang];
  const shown = viewer === "candidate" ? events.filter((e) => !e.internal) : events;
  const groups: [StageKey | null, RecEvent[]][] = [
    ...STAGES.map((s) => [s, shown.filter((e) => e.stage === s)] as [StageKey, RecEvent[]]),
    [null, shown.filter((e) => !e.stage)] as [null, RecEvent[]],
  ].filter(([, l]) => l.length > 0);
  if (!groups.length) return <span className="hint">{c.noEvents}</span>;
  return (
    <div className="rec-agenda">
      {groups.map(([s, list]) => (
        <section key={s ?? "none"} className="rec-agenda__stage">
          <h3 className="rec-agenda__h">{s ? r.stage[s] : c.other}</h3>
          <ul className="rec-agenda__list">
            {list.map((e) => (
              <li
                key={e.id}
                className="rec-agenda__row"
                data-past={e.endsOn < hariIni ? "yes" : undefined}
              >
                <i style={cs(warna(e))} data-internal={e.internal ? "yes" : undefined} />
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b>{judulAcara(e, lang)}</b>
                  <span className="hint">
                    {rentangAcara(e, lang)} · {jamAcara(e, lang)}
                    {e.place ? ` · ${tempatAcara(e.place, lang)}` : ""}
                  </span>
                </span>
                <span className="rec-agenda__tags">
                  {e.internal && <Pill>{r.internal}</Pill>}
                  {e.startsOn <= hariIni && hariIni <= e.endsOn && (
                    <Pill tone="ok">{r.runningBadge}</Pill>
                  )}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onEdit?.(e)}
                  >
                    {r.edit}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
