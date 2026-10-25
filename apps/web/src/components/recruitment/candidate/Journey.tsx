/**
 * The candidate's journey as a constellation (prompt 03, mockup r1-caas):
 * eight stars, Daftar then the seven stages. Done stars are filled, the
 * current one is gold with a slow halo, the rest hollow and numbered. A star
 * opens a popover with that stage's public dates. On a phone the path
 * becomes a vertical list with a rail. The done part of the path draws in
 * once; Low Detail and reduced motion keep it still.
 */
import { useState, type CSSProperties } from "react";
import { CheckIcon, FlagIcon, StarIcon } from "@phosphor-icons/react";
import Popover from "../../ui/Popover";
import type { Lang } from "../../../lib/kelas";
import { STAGES, type RecEvent, type StageKey } from "../../../lib/recruitment/types";
import { REC } from "../recruitmentStrings";
import { Baris } from "../calendar/RecCalendar";
import { CP } from "./candidateStrings";

export const JOURNEY: (StageKey | "daftar")[] = ["daftar", ...STAGES];

/** Where each star sits in the sky (percent). */
const POS: [number, number][] = [
  [4, 62],
  [17, 38],
  [30, 58],
  [43, 30],
  [57, 52],
  [70, 28],
  [83, 48],
  [96, 24],
];

function datesOf(stage: StageKey | "daftar", events: RecEvent[]) {
  const pub = events.filter((e) => !e.internal);
  return stage === "daftar"
    ? pub.filter((e) => e.gates.includes("daftar"))
    : pub.filter((e) => e.stage === stage);
}

export default function Journey({
  cur,
  events,
  lang,
  hariIni,
  out = false,
}: {
  /** null: nobody's own journey (an Asisten looking), every star hollow */
  cur: StageKey | "daftar" | null;
  events: RecEvent[];
  lang: Lang;
  hariIni: string;
  /** Cut: the journey stops at the stage reached, a flag marks it, the rest fades (S2) */
  out?: boolean;
}) {
  const t = CP[lang].journey;
  const r = REC[lang];
  const [open, setOpen] = useState<number | null>(null);
  const ci = cur ? JOURNEY.indexOf(cur) : -1;
  const pts = POS.map(([x, y]) => `${x * 10},${y * 2}`);
  return (
    <div className="rec-journey">
      <svg
        className="rec-journey__svg"
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline className="rec-journey__track" points={pts.join(" ")} />
        {ci > 0 && (
          <polyline
            className="rec-journey__done"
            points={pts.slice(0, ci + 1).join(" ")}
            pathLength={100}
          />
        )}
      </svg>
      <ol className="rec-journey__list" aria-label={t.list}>
        {JOURNEY.map((s, i) => {
          const st = out
            ? i < ci
              ? "done"
              : i === ci
                ? "ended"
                : "off"
            : i < ci
              ? "done"
              : i === ci
                ? "cur"
                : "next";
          const ds = datesOf(s, events);
          return (
            <li
              key={s}
              className="rec-star"
              data-st={st}
              style={{ "--x": `${POS[i][0]}%`, "--y": `${POS[i][1]}%` } as CSSProperties}
            >
              <Popover
                open={open === i}
                onOpenChange={(v) => setOpen(v ? i : null)}
                align="center"
                trigger={
                  <button
                    type="button"
                    className="rec-star__dot"
                    aria-label={`${r.stage[s]}, ${
                      st === "done"
                        ? t.ariaDone
                        : st === "cur" || st === "ended"
                          ? t.ariaCur
                          : t.ariaNext
                    }`}
                  >
                    {st === "done" ? (
                      <CheckIcon size={18} weight="bold" />
                    ) : st === "ended" ? (
                      <FlagIcon size={18} weight="fill" />
                    ) : st === "cur" ? (
                      <StarIcon size={20} weight="fill" />
                    ) : (
                      <span className="num">{i}</span>
                    )}
                  </button>
                }
              >
                <div className="stack stack--sm rec-starpop">
                  <span className="eyebrow">
                    {st === "done" ? t.done : st === "cur" || st === "ended" ? t.cur : t.stage(i)}
                  </span>
                  <b>{r.stage[s]}</b>
                  {ds.length ? (
                    <ul className="rkal__list">
                      {ds.map((e) => (
                        <Baris key={e.id} e={e} lang={lang} hariIni={hariIni} />
                      ))}
                    </ul>
                  ) : (
                    <span className="hint">{s === "penerimaan" ? t.date : t.none}</span>
                  )}
                </div>
              </Popover>
              <span className="rec-star__label">{r.stageShort[s]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
