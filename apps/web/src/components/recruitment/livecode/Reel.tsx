/**
 * One slot machine reel (prompt 12, mockup r3-putar, motion specs in
 * handoffs/08c.md). The server decides first; the reel only plays it. A run
 * starts on the press (or by itself for an automatic or re-rolled result),
 * loops at a steady speed while lc-spin is in flight, and lands on whatever
 * answer comes: it decelerates to 16 percent short of the answer's cell, then
 * settles onto it. Decoys are never real titles. Low Detail drops the blur
 * and the ring and runs faster; reduced motion does not move the column.
 *
 * The column holds 40 cells and the window shows three. The decoys repeat
 * every 16 cells, so the steady run wraps unseen.
 */
import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { reelTiming, type MotionTier, type ReelKind } from "../../../lib/recruitment/lc-ui";

const CELLS = 40;
const PERIOD = 16;

export interface ReelAnswer {
  label: string;
  /** What the landed cell shows beside the label */
  glyph: ReactNode;
}

export type ReelMode = "idle" | "run" | "land";

interface Props {
  kind: ReelKind;
  tier: MotionTier;
  mode: ReelMode;
  /** The real result; the cell it lands on. Null while nothing landed. */
  answer: ReelAnswer | null;
  /** Decoy cells, cycled; for the protocol reel these are the real three names */
  decoys: { label: string; glyph: ReactNode }[];
  /** Plays once the cell has settled */
  onLanded?: () => void;
  /** Labels for the assistive reading of the window */
  ariaLabel: string;
}

export default function Reel({ kind, tier, mode, answer, decoys, onLanded, ariaLabel }: Props) {
  const col = useRef<HTMLDivElement | null>(null);
  const win = useRef<HTMLDivElement | null>(null);
  const [landIdx, setLandIdx] = useState<number | null>(answer ? 1 : null);
  const [phase, setPhase] = useState<"still" | "run" | "landing" | "landed">(
    answer ? "landed" : "still",
  );
  const answerKey = answer?.label ?? null;
  const t = reelTiming(kind, tier);
  const state = useRef({ y: 0, stop: null as null | (() => void), started: 0, ran: 0 });
  const landed = useRef(onLanded);
  landed.current = onLanded;

  const kill = () => {
    state.current.stop?.();
    state.current.stop = null;
    if (col.current) gsap.killTweensOf(col.current);
  };
  useEffect(() => kill, []);

  // Idle with an answer already there (a reload): the cell shows at rest.
  useLayoutEffect(() => {
    if (mode !== "idle" || !col.current) return;
    kill();
    if (answer) {
      setLandIdx(1);
      setPhase("landed");
      gsap.set(col.current, { y: 0, filter: "none" });
    } else {
      setLandIdx(null);
      setPhase("still");
      gsap.set(col.current, { y: 0, filter: "none" });
    }
  }, [mode, answerKey]);

  // The run: the press, then the steady loop.
  useEffect(() => {
    if (mode !== "run" || !col.current) return;
    kill();
    setLandIdx(null);
    setPhase("run");
    const el = col.current;
    const s = state.current;
    s.ran = 0;
    if (t.jump) return; // reduced motion: nothing moves until the answer
    gsap.set(el, { y: 0, filter: "none" });
    if (t.blur) gsap.to(el, { filter: "blur(2.4px)", duration: 0.2, ease: "none" });
    const lever = gsap.to(el, { y: 10, duration: t.press / 1000, ease: "power2.out" });
    const speed = t.cell / t.perCell; // px per ms
    let last = performance.now();
    let y = 10;
    const tick = () => {
      if (lever.isActive()) {
        y = gsap.getProperty(el, "y") as number;
        last = performance.now();
        return;
      }
      const now = performance.now();
      const dy = (now - last) * speed;
      last = now;
      y -= dy;
      s.ran += dy / t.cell;
      if (y <= -PERIOD * t.cell) y += PERIOD * t.cell;
      gsap.set(el, { y });
      s.y = y;
    };
    gsap.ticker.add(tick);
    s.stop = () => gsap.ticker.remove(tick);
    return kill;
  }, [mode, t.jump, t.blur, t.cell, t.perCell, t.press]);

  // The landing: after the steady cells have passed and the answer is there.
  useEffect(() => {
    if (mode !== "land" || !answer || !col.current) return;
    const el = col.current;
    const s = state.current;
    if (t.jump) {
      kill();
      setLandIdx(1);
      setPhase("landed");
      gsap.set(el, { y: 0, filter: "none" });
      landed.current?.();
      return;
    }
    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      // The steady run has to have shown its cells before the answer may land
      if (s.stop && s.ran < t.steady) return void requestAnimationFrame(go);
      const cur = -(gsap.getProperty(el, "y") as number) / t.cell;
      kill();
      const dist = t.decel / (3 * t.perCell); // cells covered at the steady speed's start
      const idx = Math.min(CELLS - 3, Math.max(4, Math.round(cur + dist)));
      setLandIdx(idx);
      setPhase("landing");
      const y0 = gsap.getProperty(el, "y") as number;
      const target = -(idx - 1) * t.cell;
      gsap
        .timeline({
          onComplete: () => {
            if (cancelled) return;
            setPhase("landed");
            landed.current?.();
          },
        })
        .fromTo(
          el,
          { y: y0 },
          { y: target + 0.16 * t.cell, duration: t.decel / 1000, ease: "power3.out" },
        )
        .to(
          el,
          { filter: "blur(0px)", duration: Math.min(0.9, t.decel / 1000), ease: "power2.out" },
          t.decel / 1000 - Math.min(0.9, t.decel / 1000),
        )
        .to(el, { y: target, duration: t.settle / 1000, ease: "back.out(2.2)" });
    };
    // Wait for the cells already in the DOM to reflect the landing index
    go();
    return () => {
      cancelled = true;
    };
  }, [mode, answerKey, t.jump, t.steady, t.decel, t.settle, t.cell, t.perCell]);

  const cells = Array.from({ length: CELLS }, (_, i) => {
    const real = landIdx !== null && i === landIdx && answer;
    if (real) return { key: i, real: true as const, label: answer.label, glyph: answer.glyph };
    const d = decoys[(i % PERIOD) % Math.max(decoys.length, 1)] ?? { label: "", glyph: null };
    return { key: i, real: false as const, label: d.label, glyph: d.glyph };
  });

  return (
    <div
      ref={win}
      className="r3reel"
      data-phase={phase}
      data-kind={kind}
      data-m={tier}
      role="img"
      aria-label={ariaLabel}
      style={{ ["--cell" as string]: `${t.cell}px` }}
    >
      <div className="r3reel__ring" aria-hidden="true" data-ring={t.ring ? "yes" : "no"} />
      <div className="r3reel__fade" aria-hidden="true" />
      <div ref={col} className="r3reel__col" aria-hidden="true">
        {cells.map((c) => (
          <div
            key={c.key}
            className={"r3reel__cell" + (c.real ? " is-landed" : "")}
            data-decoy={c.real ? "no" : "yes"}
          >
            <span className="r3reel__glyph">{c.glyph}</span>
            <span className="r3reel__label">{c.label}</span>
          </div>
        ))}
      </div>
      <span className="r3reel__sr" aria-live="polite">
        {phase === "landed" && answer ? answer.label : ""}
      </span>
    </div>
  );
}
