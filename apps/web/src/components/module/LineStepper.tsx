/**
 * The module page's line stepper (Phase 21, f1, f10, f11): numbered dots on
 * one line in every mode, each a button, with Prev and Next on the same row
 * at the top. Finished dots carry a check and fill the line with the kit's
 * rainbow; a locked dot carries a lock and says why when pressed; a step on
 * its own clock (TP, the hunt) is a dashed ring that never holds anything.
 *
 * Below 640 px: Prev, "Step 5 of 6" over the step's name, Next, then the
 * dots on their own row without labels (each still a button with its name
 * as the tip).
 *
 * Generic over the step ids: the Konsol's session wrap-up uses it too
 * (2026-10-22), so its CSS is lstep.css, not the module page's.
 */
import { useRef, type CSSProperties } from "react";
import { CaretLeftIcon, CaretRightIcon, CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { isiGaris, type Titik } from "../../lib/langkah-garis";
import type { Lang } from "../../lib/kelas";
import type { Nada } from "./useLangkah";
import { M } from "./moduleStrings";
import "./lstep.css";

interface Props<S extends string> {
  lang: Lang;
  steps: S[];
  step: S;
  label: Record<S, string>;
  /** Shorter labels for the dots below 1024 px ("TP"). */
  pendek?: Partial<Record<S, string>>;
  titik: Titik[];
  /** Where Prev and Next go: a waiting TP is passed over. */
  prev: S | null;
  next: S | null;
  /** Visited and left unfinished (yellow) or finished (green). */
  nada?: (s: S) => Nada | undefined;
  /** The step on screen is finished: Next turns primary. */
  siap: boolean;
  /** Why Next is held, if it is. */
  alasan: string | null;
  /** Next is held: the step after this one is locked. */
  tertahan: boolean;
  tip: (s: S, t: Titik) => string | undefined;
  onGo: (s: S) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function LineStepper<S extends string>(p: Props<S>) {
  const t = M[p.lang];
  const i = Math.max(0, p.steps.indexOf(p.step));
  const { prev, next } = p;
  const row = useRef<HTMLOListElement | null>(null);

  const pindah = (j: number) => {
    const k = Math.max(0, Math.min(p.steps.length - 1, j));
    p.onGo(p.steps[k]);
    requestAnimationFrame(() =>
      row.current?.querySelector<HTMLElement>(`[data-langkah="${p.steps[k]}"]`)?.focus(),
    );
  };

  return (
    <nav
      className="lstep"
      aria-label={t.steps}
      style={{ "--n": p.steps.length, "--isi": isiGaris(p.titik) } as CSSProperties}
    >
      <button
        type="button"
        className="btn btn--ghost lstep__nav lstep__prev"
        disabled={!prev}
        aria-label={prev ? t.prevStep(p.label[prev]) : undefined}
        onClick={p.onPrev}
      >
        <CaretLeftIcon size={16} weight="bold" aria-hidden="true" />
        {prev && <span className="lstep__navl">{p.label[prev]}</span>}
      </button>

      <div className="lstep__mid">
        <div className="lstep__now" aria-hidden="true">
          <small>{t.stepOf(i + 1, p.steps.length)}</small>
          <b>{p.label[p.step]}</b>
        </div>
        <ol className="lstep__track" ref={row}>
          <span className="lstep__line" aria-hidden="true">
            <i />
          </span>
          {p.steps.map((s, k) => {
            const st = p.titik[k];
            return (
              <li key={s}>
                <button
                  type="button"
                  className="lstep__dot"
                  id={`step-${s}`}
                  data-langkah={s}
                  data-st={st}
                  data-tone={st === "kini" || st === "buka" ? p.nada?.(s) : undefined}
                  aria-current={st === "kini" ? "step" : undefined}
                  aria-disabled={st === "kunci" || undefined}
                  aria-label={`${k + 1}. ${p.label[s]}`}
                  data-tip={p.tip(s, st)}
                  tabIndex={st === "kini" ? 0 : -1}
                  onClick={() => p.onGo(s)}
                  onKeyDown={(e) => {
                    const j =
                      e.key === "ArrowRight"
                        ? k + 1
                        : e.key === "ArrowLeft"
                          ? k - 1
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? p.steps.length - 1
                              : null;
                    if (j === null) return;
                    e.preventDefault();
                    pindah(j);
                  }}
                >
                  <span className="lstep__mark">
                    {st === "selesai" ? (
                      <CheckIcon size={14} weight="bold" aria-hidden="true" />
                    ) : st === "kunci" ? (
                      <LockSimpleIcon size={13} weight="bold" aria-hidden="true" />
                    ) : (
                      k + 1
                    )}
                  </span>
                  <span className="lstep__lbl">
                    <span className={p.pendek?.[s] ? "lstep__full" : undefined} id={`step-${s}-l`}>
                      {p.label[s]}
                    </span>
                    {p.pendek?.[s] && (
                      <span className="lstep__short" aria-hidden="true">
                        {p.pendek[s]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="lstep__end">
        <button
          type="button"
          className={`btn lstep__nav lstep__next ${p.siap && !p.tertahan ? "btn--primary" : "btn--secondary"}`}
          disabled={!next}
          aria-disabled={p.tertahan || undefined}
          aria-label={next ? t.nextStep(p.label[next]) : undefined}
          onClick={p.onNext}
        >
          {next && <span className="btn__label lstep__navl">{p.label[next]}</span>}
          <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        {p.alasan && <span className="hint lstep__why">{p.alasan}</span>}
      </div>
    </nav>
  );
}
