/**
 * The Asisten's day as one strip (Phase 10, mockups c11-home and h11-home):
 * 06:00 to 18:30 drawn to scale, each slot a 150 minute block (the session
 * cap) with its start window as a hatched lead in, the hours under it and a
 * now line. On phones the strip stands up: the slots stack in time order and
 * now is its own row between them. The small copy on Home drops the codes
 * and the hours.
 */
import type { CSSProperties } from "react";
import Pill from "../ui/Pill";
import Tooltip from "../ui/Tooltip";
import { SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { jamDariMenit, menitDariJam } from "../../lib/sesi-mulai";
import { kelasLabel, modulLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import type { GantiKursi } from "../../lib/penugasan-minggu";
import { D } from "./dayStrings";
import "./day.css";

export type DayState = "done" | "now" | "live" | "next" | "later";

export interface DaySlot {
  slot: number;
  state: DayState;
  mine: boolean;
  kelas: Kelas;
  /** Everyone teaching it today, upper case, once each. */
  codes: string[];
  /** Covers today (code -> kind and whose seat). */
  ganti?: Record<string, GantiKursi>;
  /** No practicum today (holiday, empty, or not yet in the schedule). */
  kosong: boolean;
  /** What it ran today: the module and when it ended (null while running). */
  ran: { modul: number; selesai: string | null } | null;
  /** Its start window in minutes before the slot. */
  win: number;
}

const AX0 = 6 * 60;
const AX1 = 18 * 60 + 30;
const pct = (m: number) => ((m - AX0) / (AX1 - AX0)) * 100;
const TICKS = [6, 8, 10, 12, 14, 16, 18];

/** Done, Window open, Running, Next or Later for each slot, from the
 *  clock and what ran: the first upcoming slot with a practicum is Next. */
export function dayStates(
  slots: { slot: number; win: number; kosong: boolean; jalan: "berjalan" | "selesai" | null }[],
  now: number,
): Record<number, DayState> {
  const out: Record<number, DayState> = {};
  const upcoming: number[] = [];
  for (const s of slots) {
    const a = menitDariJam(SLOT_MULAI[s.slot]);
    if (s.jalan === "berjalan") out[s.slot] = "live";
    else if (s.jalan === "selesai" || now >= a + SESI_CAP_MENIT) out[s.slot] = "done";
    else if (now >= a - s.win) out[s.slot] = "now";
    else {
      out[s.slot] = "later";
      upcoming.push(s.slot);
    }
  }
  const next = upcoming.find((n) => !slots.find((s) => s.slot === n)?.kosong) ?? upcoming[0];
  if (next) out[next] = "next";
  return out;
}

/** The codes on one line: four, then +N (mine always shows). */
function Codes({
  codes,
  me,
  max,
  nameOf,
  ganti,
}: {
  codes: string[];
  me: string;
  max?: number;
  nameOf: (kode: string) => string;
  ganti?: Record<string, GantiKursi>;
}) {
  let shown = max && codes.length > max ? codes.slice(0, max - 1) : codes;
  if (shown !== codes && codes.includes(me) && !shown.includes(me))
    shown = [...shown.slice(0, -1), me];
  const rest = codes.filter((k) => !shown.includes(k));
  return (
    <span className={`day__codes${max ? " day__codes--one" : ""}`}>
      {shown.map((k) => (
        <Tooltip key={k} label={nameOf(k)}>
          <span
            className={["acode", k === me && "acode--me", ganti?.[k] && `acode--${ganti[k].jenis}`]
              .filter(Boolean)
              .join(" ")}
          >
            {k}
          </span>
        </Tooltip>
      ))}
      {rest.length > 0 && (
        <Tooltip label={rest.map(nameOf).join(", ")}>
          <span className="acode day__more">+{rest.length}</span>
        </Tooltip>
      )}
    </span>
  );
}

export function SlotCodes(props: {
  codes: string[];
  me: string;
  nameOf: (kode: string) => string;
  /** Covers today, marked like on the Schedule. */
  ganti?: Record<string, GantiKursi>;
}) {
  return <Codes {...props} />;
}

export default function DayStrip({
  slots,
  now,
  sel,
  onPick,
  small,
  me,
  nameOf,
  lang,
}: {
  slots: DaySlot[];
  /** Minutes since midnight, lab time. */
  now: number;
  sel: number | null;
  onPick: (slot: number) => void;
  small?: boolean;
  me: string;
  nameOf: (kode: string) => string;
  lang: Lang;
}) {
  const d = D[lang];
  const word: Record<DayState, [string, "ok" | "accent" | undefined] | null> = {
    done: [d.stDone, undefined],
    now: [d.stNow, "ok"],
    live: [d.stLive, "ok"],
    next: [d.stNext, "accent"],
    later: null,
  };
  const nowIn = now > AX0 && now < AX1;
  const nowAt = slots.filter((s) => menitDariJam(SLOT_MULAI[s.slot]) <= now).length;
  return (
    <div className={`day${small ? " day--sm" : ""}`} role="group" aria-label={d.stripAria}>
      <div className="day__rail" style={{ "--now": `${pct(now)}%` } as CSSProperties}>
        {!small &&
          TICKS.map((h, i) => (
            <span
              key={h}
              className={`day__tick${i === 0 ? " day__tick--a" : i === TICKS.length - 1 ? " day__tick--z" : ""}`}
              style={{ "--x": `${pct(h * 60)}%` } as CSSProperties}
              aria-hidden="true"
            >
              <b className="mono">{String(h).padStart(2, "0")}.00</b>
            </span>
          ))}
        {slots.map((s) => {
          const a = menitDariJam(SLOT_MULAI[s.slot]);
          const w = word[s.state];
          const fill =
            s.state === "live" ? Math.min(1, Math.max(0, (now - a) / SESI_CAP_MENIT)) : 0;
          return [
            <span
              key={`l${s.slot}`}
              className="day__lead"
              data-state={s.state}
              style={
                {
                  "--x": `${pct(a - s.win)}%`,
                  "--w": `${pct(a) - pct(a - s.win)}%`,
                  "--o": s.slot * 10 - 1,
                } as CSSProperties
              }
              aria-hidden="true"
            />,
            <button
              key={`b${s.slot}`}
              type="button"
              className="slot sweep-hover day__blk"
              data-state={s.state}
              data-mine={s.mine ? "yes" : "no"}
              aria-pressed={sel === s.slot}
              style={
                {
                  "--x": `${pct(a)}%`,
                  "--w": `${pct(a + SESI_CAP_MENIT) - pct(a)}%`,
                  "--fill": fill,
                  "--o": s.slot * 10,
                } as CSSProperties
              }
              onClick={() => onPick(s.slot)}
              aria-label={`Slot ${s.slot}, ${SLOT_MULAI[s.slot]}${s.mine ? d.yoursAria : ""}`}
            >
              <span className="day__top">
                <b className="mono day__t">
                  {SLOT_MULAI[s.slot]}
                  <span className="day__end">
                    {d.to}
                    {jamDariMenit(a + SESI_CAP_MENIT)}
                  </span>
                </b>
                {w && (
                  <Pill tone={w[1]}>
                    {s.state === "live" && (
                      <span className="dot dot--ok dot--pulse" aria-hidden="true" />
                    )}
                    {w[0]}
                  </Pill>
                )}
              </span>
              <span className="day__mid">
                <span className="hint">Slot {s.slot}</span>
                {s.mine && <Pill tone="accent">{d.yours}</Pill>}
                {s.kelas === "internasional" && (
                  <span className="day__intl">
                    <Pill tone="violet">{kelasLabel("internasional", lang)}</Pill>
                  </span>
                )}
              </span>
              {!small &&
                (s.kosong ? (
                  <span className="hint day__none">{d.noSession}</span>
                ) : (
                  <Codes codes={s.codes} me={me} max={4} nameOf={nameOf} ganti={s.ganti} />
                ))}
              {!small && s.ran && (
                <span className="hint day__ran">
                  {s.ran.selesai
                    ? d.ranLine(modulLabel(s.ran.modul, lang), s.ran.selesai)
                    : d.liveLine(modulLabel(s.ran.modul, lang))}
                </span>
              )}
            </button>,
          ];
        })}
        {nowIn && (
          <span className="day__now" style={{ "--o": nowAt * 10 + 5 } as CSSProperties}>
            <b className="mono">{jamDariMenit(now)}</b>
            <span className="day__nowword">{d.nowWord}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** The start window as a ring: counting down to it, then how long it stays
 *  open, then closed. */
export function WinClock({
  now,
  slot,
  win,
  lang,
  size = 118,
}: {
  now: number;
  slot: number;
  win: number;
  lang: Lang;
  size?: number;
}) {
  const d = D[lang];
  const a = menitDariJam(SLOT_MULAI[slot]);
  const open = a - win;
  const close = a + SESI_CAP_MENIT;
  const R = 44;
  const C = 2 * Math.PI * R;
  let p: number;
  let big: string;
  let small: string;
  let tone: string;
  if (now < open) {
    p = Math.max(0, 1 - (open - now) / 120);
    big = `T-${jamDariMenit(Math.min(open - now, 23 * 60 + 59))}`;
    small = d.clockOpens(jamDariMenit(open));
    tone = "idle";
  } else if (now < close) {
    p = (now - open) / (close - open);
    big = jamDariMenit(close);
    small = d.clockOpenUntil;
    tone = "ok";
  } else {
    p = 1;
    big = d.clockClosed;
    small = d.clockClosedAt(jamDariMenit(close));
    tone = "past";
  }
  return (
    <div
      className="mclock wclock"
      data-tone={tone}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="timer"
      aria-label={`${small} ${big}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="mclock__track" cx="50" cy="50" r={R} />
        <circle
          className="mclock__arc"
          cx="50"
          cy="50"
          r={R}
          style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="mclock__in">
        <span className="mclock__left">{small}</span>
        <span className="mclock__t mono">{big}</span>
      </span>
    </div>
  );
}
