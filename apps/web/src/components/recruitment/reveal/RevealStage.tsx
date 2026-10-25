/**
 * The envelope reveal (06, PRD 5.4, mockup r2-amplop, motion specs in
 * handoffs/05.md). A full frame layer over the page: the sky dims, the
 * sealed envelope floats in the middle, and the candidate opens it with a
 * drag on the flap or a hold on the envelope. Only then does the page ask the
 * server for the result (envelope-open), so a sealed envelope carries
 * nothing: no result sits in the DOM or in the answer until it is opened.
 * The result card then takes the letter's place (a FLIP from the letter's
 * rect). Every timeline is GSAP, built in one context and reverted on
 * replay and unmount; Low Detail and reduced motion have their own paths.
 *
 * Loaded lazily by the candidate page, so GSAP and canvas-confetti only
 * ship when an envelope is opened.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  XIcon,
} from "@phosphor-icons/react";
import gsap from "gsap";
import IconButton from "../../ui/IconButton";
import type { Lang } from "../../../lib/kelas";
import { setSound, usePrefs } from "../../../lib/prefs";
import type { EventLite, Proposal, StageKey } from "../../../lib/recruitment/types";
import { S2 } from "../s2Strings";
import { burst, chime, makeShooter, useRevealMotion, type MotionLevel } from "./fx";

export type RevealResult = Proposal | "terima";

export interface NextText {
  title: string;
  when: string;
  extra: string | null;
}

export interface RevealProps {
  lang: Lang;
  stage: StageKey;
  /** First name, for the line */
  name: string;
  /** Known up front when an opened envelope is replayed; null until the first opening */
  result: RevealResult | null;
  /** What they got through (Gagal copy) */
  through: StageKey[];
  /** The server's answer once the envelope is opened: the result and the next event */
  open: () => Promise<{ result: Proposal; next: EventLite | null } | null>;
  describeNext: (next: EventLite | null) => NextText | null;
  /** Called after the last step of the timeline, and on replay */
  onSeen?: () => void;
  onClose: () => void;
}

const HOLD_MS = 1100;

/** Eight stage stars across the top of the Penerimaan card. */
const STAR_PTS: [number, number][] = [
  [4, 70],
  [17, 40],
  [30, 62],
  [43, 30],
  [57, 56],
  [70, 26],
  [83, 50],
  [96, 22],
];

export default function RevealStage(p: RevealProps) {
  const t = S2[p.lang].reveal;
  const m = useRevealMotion();
  const { sound } = usePrefs();
  const [res, setRes] = useState<RevealResult | null>(p.result);
  const [next, setNext] = useState<NextText | null>(null);
  const [phase, setPhase] = useState<"sealed" | "waiting" | "opening" | "open">("sealed");
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState(false);
  const big = res === "terima";

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const flap = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const letter = useRef<HTMLDivElement>(null);
  const seal = useRef<HTMLButtonElement>(null);
  const halfL = useRef<HTMLSpanElement>(null);
  const halfR = useRef<HTMLSpanElement>(null);
  const ctx = useRef<gsap.Context | null>(null);
  const shooter = useRef<Awaited<ReturnType<typeof makeShooter>> | null>(null);
  const timers = useRef<number[]>([]);
  const gesture = useRef({
    mode: null as null | "press" | "drag",
    y0: 0,
    t0: 0,
    p: 0,
    hold: null as gsap.core.Tween | null,
    done: false,
  });
  const mRef = useRef<MotionLevel>(m);
  mRef.current = m;
  const resRef = useRef(res);
  resRef.current = res;

  /* The stage's canvas, Escape to close, and the page behind kept still */
  useEffect(() => {
    let alive = true;
    if (canvas.current)
      void makeShooter(canvas.current).then((s) => {
        if (alive) shooter.current = s;
      });
    const k = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    seal.current?.focus();
    return () => {
      alive = false;
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
      timers.current.forEach((x) => window.clearTimeout(x));
      void shooter.current?.shoot.reset();
      ctx.current?.revert();
      gesture.current.hold?.kill();
    };
  }, []);

  /* Idle float while sealed (full motion only) */
  useEffect(() => {
    if (phase !== "sealed" || m !== "full" || !root.current) return;
    const tw = gsap.to(root.current, {
      y: -6,
      duration: 1.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    return () => {
      tw.kill();
      if (root.current) gsap.set(root.current, { y: 0 });
    };
  }, [phase, run, m]);

  const apply = (v: number) => {
    gesture.current.p = v;
    if (mRef.current === "reduce") return;
    if (flap.current) flap.current.style.transform = `rotateX(${v * 150}deg)`;
    /* The seal sits on the flap's tip, so it rides up with it */
    if (seal.current && flap.current)
      seal.current.style.transform = `translateY(${flap.current.offsetHeight * (Math.cos((v * 150 * Math.PI) / 180) - 1)}px)`;
  };
  const back = () => {
    const from = gesture.current.p;
    if (mRef.current === "reduce") return apply(0);
    const o = { v: from };
    gsap.to(o, { v: 0, duration: 0.22, ease: "power3.out", onUpdate: () => apply(o.v) });
  };
  const clearHold = () => {
    gesture.current.hold?.kill();
    gesture.current.hold = null;
  };
  const startHold = () => {
    const g = gesture.current;
    if (g.done || g.hold) return;
    const o = { v: 0 };
    g.hold = gsap.to(o, {
      v: 1,
      duration: HOLD_MS / 1000,
      ease: "none",
      onUpdate: () => {
        ring.current?.style.setProperty("--hold", String(o.v));
        root.current?.setAttribute(
          "data-shiver",
          o.v > 0.62 && mRef.current === "full" ? "yes" : "no",
        );
      },
      onComplete: () => {
        g.hold = null;
        finish();
      },
    });
  };
  const stopHold = () => {
    const g = gesture.current;
    if (!g.hold) return;
    g.hold.kill();
    g.hold = null;
    root.current?.setAttribute("data-shiver", "no");
    const o = { v: parseFloat(ring.current?.style.getPropertyValue("--hold") || "0") || 0 };
    gsap.to(o, {
      v: 0,
      duration: 0.2,
      ease: "power3.out",
      onUpdate: () => ring.current?.style.setProperty("--hold", String(o.v)),
    });
  };

  /** The gesture is complete: ask the server (unless the result is already known), then play. */
  const finish = () => {
    const g = gesture.current;
    if (g.done) return;
    g.done = true;
    clearHold();
    const fromP = g.p;
    const known = resRef.current;
    if (known) return void begin(known, fromP);
    setPhase("waiting");
    void p.open().then((r) => {
      if (!r) {
        // Not opened (offline, or the time has not come): the flap goes back and it can be tried again.
        g.done = false;
        setFailed(true);
        setPhase("sealed");
        ring.current?.style.setProperty("--hold", "0");
        back();
        return;
      }
      setNext(p.describeNext(r.next));
      setRes(r.result);
      resRef.current = r.result;
      begin(r.result, fromP);
    });
  };

  const begin = (r: RevealResult, fromP: number) => {
    if (r !== "gagal") chime(r === "terima" ? "terima" : "lolos");
    setPhase("opening");
    requestAnimationFrame(() => requestAnimationFrame(() => play(r, fromP)));
  };

  const play = (r: RevealResult, fromP: number) => {
    const env = root.current;
    const c = card.current;
    const st = stage.current;
    if (!env || !c || !st) return void setPhase("open");
    const copy = c.querySelectorAll("[data-r2-copy]");
    const level = mRef.current;
    if (level === "reduce") {
      /* Reduced: no movement. The envelope fades out, the card fades in. */
      env.style.transition = "opacity 280ms ease";
      env.style.opacity = "0";
      c.style.transition = "opacity 280ms ease";
      c.style.opacity = "1";
      c.style.visibility = "visible";
      timers.current.push(window.setTimeout(() => setPhase("open"), 300));
      return;
    }
    ctx.current?.revert();
    ctx.current = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setPhase("open") });
      const gag = r === "gagal";
      const bigEnv = r === "terima";
      /* FLIP: at the swap the card jumps to where the risen letter is, then grows into place */
      const flip = () => {
        if (!letter.current) return;
        const lr = letter.current.getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        gsap.set(c, {
          opacity: 1,
          x: lr.left + lr.width / 2 - (cr.left + cr.width / 2),
          y: lr.top + lr.height / 2 - (cr.top + cr.height / 2),
          scale: lr.width / cr.width,
        });
        gsap.set(letter.current, { opacity: 0 });
      };
      gsap.set(c, { visibility: "visible", opacity: 0 });
      gsap.set(copy, { opacity: 0, y: 10 });
      /* 1. the seal: cracks in two (Lolos, Penerimaan) or peels away (Gagal) */
      if (gag)
        tl.to(seal.current, { rotation: -24, opacity: 0, duration: 0.42, ease: "sine.out" }, 0);
      else {
        tl.to(
          halfL.current,
          { x: -12, y: 6, rotation: -20, opacity: 0, duration: 0.26, ease: "power2.out" },
          0,
        )
          .to(
            halfR.current,
            { x: 12, y: 6, rotation: 20, opacity: 0, duration: 0.26, ease: "power2.out" },
            0,
          )
          .to(
            seal.current?.querySelector(".r2env__mark") ?? [],
            { scale: 0.6, opacity: 0, duration: 0.2, ease: "power2.out" },
            0,
          )
          .call(() => burst(shooter.current, "seal", level, timers.current), undefined, 0.02);
      }
      tl.set(ring.current, { opacity: 0 }, 0);
      /* 2. the flap swings up and behind */
      tl.fromTo(
        flap.current,
        { rotationX: fromP * 150 },
        { rotationX: 180, duration: gag ? 0.7 : 0.52, ease: gag ? "sine.inOut" : "power3.inOut" },
        gag ? 0.1 : 0.08,
      ).set(flap.current, { zIndex: 0 }, gag ? 0.45 : 0.34);
      /* 3. the letter rises out of the pocket */
      tl.to(
        letter.current,
        {
          yPercent: gag ? -42 : -62,
          duration: gag ? 0.8 : 0.64,
          ease: gag ? "sine.out" : "power4.out",
        },
        gag ? 0.82 : 0.45,
      );
      /* 4. the card takes the letter's place; the envelope sinks away */
      const swap = gag ? 1.5 : 1.0;
      tl.call(flip, undefined, swap)
        .to(
          c,
          {
            x: 0,
            y: 0,
            scale: 1,
            duration: gag ? 0.7 : 0.56,
            ease: gag ? "sine.out" : "power3.out",
          },
          swap,
        )
        .to(env, { y: 46, opacity: 0, duration: 0.42, ease: "power3.out" }, swap);
      if (gag) {
        /* Gagal: a slow exhale and a dim, then soft rain (full motion only) */
        tl.to(st, { "--r2-dim": 1, duration: 0.9, ease: "sine.inOut" }, 0.3)
          .to(
            c,
            { scaleY: 0.975, scaleX: 1.012, rotation: -1, duration: 0.5, ease: "sine.inOut" },
            swap + 0.72,
          )
          .to(
            c,
            { scaleY: 1, scaleX: 1, rotation: -0.6, duration: 0.7, ease: "sine.out" },
            swap + 1.22,
          );
        if (level === "full") tl.call(() => rain(st), undefined, swap + 0.2);
      } else {
        /* Lolos: the bloom, then confetti */
        const bloom = st.querySelector(".r2stage__bloom");
        if (level === "full" && bloom)
          tl.fromTo(
            bloom,
            { opacity: 0, scale: 0.6 },
            { opacity: 0.6, scale: 1.25, duration: 0.7, ease: "power2.out" },
            swap,
          ).to(bloom, { opacity: 0.22, scale: 1.4, duration: 1.1, ease: "sine.out" }, swap + 0.7);
        tl.call(
          () => burst(shooter.current, bigEnv ? "terima" : "lolos", level, timers.current),
          undefined,
          swap + 0.05,
        );
        if (bigEnv) tl.call(() => drawStars(st), undefined, swap + 0.1);
      }
      tl.to(
        copy,
        {
          opacity: 1,
          y: 0,
          duration: gag ? 0.42 : 0.36,
          ease: gag ? "sine.out" : "power3.out",
          stagger: gag ? 0.09 : 0.06,
        },
        swap + (gag ? 0.5 : 0.18),
      );
    }, st);
  };

  const replay = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
    void shooter.current?.shoot.reset();
    ctx.current?.revert();
    ctx.current = null;
    const st = stage.current;
    if (st) {
      st.style.removeProperty("--r2-dim");
      st.querySelectorAll(".r2rain i, .r2stars").forEach((x) => x.remove());
    }
    card.current?.removeAttribute("style");
    gesture.current = { mode: null, y0: 0, t0: 0, p: 0, hold: null, done: false };
    setPhase("sealed");
    setRun((x) => x + 1);
  };

  useLayoutEffect(() => {
    // A fresh envelope after a replay starts shut.
    gesture.current.p = 0;
  }, [run]);

  /* ---- the pointer: a drag on the flap, or a hold anywhere on the envelope */
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.done || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.mode = "press";
    g.y0 = e.clientY;
    g.t0 = performance.now();
    startHold();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g.mode || g.done) return;
    const dy = g.y0 - e.clientY;
    if (g.mode === "press" && dy > 8) {
      g.mode = "drag";
      stopHold();
    }
    if (g.mode === "drag") apply(Math.max(0, Math.min(1, dy / (big ? 220 : 170))));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g.mode) return;
    const was = g.mode;
    g.mode = null;
    if (was === "press") return stopHold();
    const v = (g.y0 - e.clientY) / Math.max(1, performance.now() - g.t0);
    if (g.p > 0.5 || v > 0.6) finish();
    else back();
  };

  const eyebrow = t.eyebrow[p.stage];
  const lolos = res === "lolos" || res === "terima";
  return createPortal(
    <div
      className="r2stage"
      ref={stage}
      data-res={res ?? "lolos"}
      data-big={big ? "yes" : undefined}
      data-phase={phase}
      data-motion={m}
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
    >
      <div className="r2stage__sky" />
      <div className="r2stage__bloom" aria-hidden="true" />
      <div className="r2rain" aria-hidden="true" />
      <canvas className="r2stage__fx" ref={canvas} aria-hidden="true" />
      <div className="r2stage__bar">
        <span className="r2stage__eyebrow">{eyebrow}</span>
        <span className="grow" style={{ flex: 1 }} />
        <IconButton
          icon={sound ? SpeakerHighIcon : SpeakerSlashIcon}
          label={sound ? S2[p.lang].sound.on : S2[p.lang].sound.off}
          pressed={!sound}
          onClick={() => setSound(!sound)}
        />
        <IconButton icon={XIcon} label={t.close} onClick={p.onClose} />
      </div>
      <div className="r2stage__mid" key={run}>
        <div className="r2stage__env">
          <div
            className="r2env"
            ref={root}
            data-big={big ? "yes" : undefined}
            data-motion={m}
            data-shiver="no"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <div className="r2env__back" />
            <div className="r2env__letter" ref={letter}>
              <span className="r2env__peek">{eyebrow}</span>
              <i />
              <i />
              <i />
            </div>
            <div className="r2env__front" />
            <div className="r2env__flap" ref={flap}>
              <div className="r2env__flapface" />
            </div>
            <button
              type="button"
              className="r2env__seal"
              ref={seal}
              aria-label={t.sealLabel}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(e) => (e.key === " " || e.key === "Enter") && stopHold()}
              onBlur={stopHold}
            >
              <span className="r2env__ring" ref={ring} />
              <span className="r2env__half r2env__half--l" ref={halfL} />
              <span className="r2env__half r2env__half--r" ref={halfR} />
              <span className="r2env__mark">
                {big ? (
                  <img src="/brand/iris-logo-mark.png" alt="" />
                ) : (
                  <span className="r2env__star" aria-hidden="true" />
                )}
              </span>
              <span className="r2env__crack" />
            </button>
          </div>
          {phase === "sealed" && (
            <div className="r2stage__hint" aria-live="polite">
              <b>{failed ? t.cantOpen : t.pull}</b>
              <span className="hint">{t.hold}</span>
            </div>
          )}
        </div>
        <div
          className={`r2res${big ? " r2res--big" : ""}`}
          ref={card}
          data-res={res ?? "lolos"}
          aria-live="polite"
        >
          {big && <div className="r2stars__slot" />}
          {res && (
            <ResultBody
              lang={p.lang}
              stage={p.stage}
              res={res}
              name={p.name}
              next={next}
              through={p.through}
              onClose={p.onClose}
              replay={replay}
            />
          )}
        </div>
      </div>
      {m === "reduce" && phase !== "sealed" && lolos && (
        <div className="r2stage__still" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: i }} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ResultBody({
  lang,
  stage,
  res,
  name,
  next,
  through,
  onClose,
  replay,
}: {
  lang: Lang;
  stage: StageKey;
  res: RevealResult;
  name: string;
  next: NextText | null;
  through: StageKey[];
  onClose: () => void;
  replay: () => void;
}) {
  const t = S2[lang].reveal;
  const gag = res === "gagal";
  const got = through.map((k) => t.passed[k]).filter(Boolean);
  return (
    <div className="r2res__in">
      <span className="r2res__eyebrow" data-r2-copy>
        {t.eyebrow[stage]}
      </span>
      <h2 className="r2res__title" data-r2-copy>
        {gag ? t.gagalTitle : t.lolosTitle}
      </h2>
      <p className="r2res__line" data-r2-copy>
        {gag ? t.gagalLine(name) : t.lolosLine(name)}
      </p>
      {!gag && next && (
        <div className="r2res__next" data-r2-copy>
          <span className="eyebrow">{t.next}</span>
          <b>{next.title}</b>
          <span className="hint">{next.when}</span>
          {next.extra && <span className="hint">{next.extra}</span>}
        </div>
      )}
      {gag && (
        <div className="r2res__got" data-r2-copy>
          {got.length > 0 && (
            <>
              <span className="eyebrow">{t.got}</span>
              <ul>
                {got.map((g) => (
                  <li key={g}>
                    <span aria-hidden="true">✓</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <span className="hint">{t.stays}</span>
        </div>
      )}
      <div className="r2res__acts" data-r2-copy>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          <span className="btn__label">{t.seeJourney}</span>
        </button>
        <button type="button" className="btn btn--ghost" onClick={replay}>
          <ArrowCounterClockwiseIcon size={16} aria-hidden="true" />
          <span className="btn__label">{t.replay}</span>
        </button>
      </div>
    </div>
  );
}

/** Soft rain for Gagal: 28 thin drops, two passes, then it stops. */
function rain(st: HTMLElement) {
  const box = st.querySelector(".r2rain");
  if (!box) return;
  for (let i = 0; i < 28; i++) {
    const d = document.createElement("i");
    d.style.left = `${(Math.random() * 100).toFixed(1)}%`;
    box.appendChild(d);
    gsap.fromTo(
      d,
      { yPercent: -120, opacity: 0 },
      {
        yPercent: 1200,
        opacity: 0.16 + Math.random() * 0.2,
        duration: 1.6 + Math.random() * 0.8,
        ease: "none",
        delay: Math.random() * 1.4,
        repeat: 1,
        onComplete: () => d.remove(),
      },
    );
  }
}

/** Penerimaan: the eight stages light up across the top of the card. */
function drawStars(st: HTMLElement) {
  const slot = st.querySelector(".r2stars__slot");
  if (!slot) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "r2stars");
  svg.setAttribute("viewBox", "0 0 1000 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("points", STAR_PTS.map(([x, y]) => `${x * 10},${y}`).join(" "));
  line.setAttribute("pathLength", "100");
  svg.appendChild(line);
  const dots = document.createElement("div");
  dots.className = "r2stars r2stars__dots";
  for (const [x, y] of STAR_PTS) {
    const i = document.createElement("i");
    i.style.left = `${x}%`;
    i.style.top = `${y}%`;
    dots.appendChild(i);
  }
  slot.append(svg, dots);
  gsap.fromTo(
    line,
    { strokeDashoffset: 100 },
    { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" },
  );
  gsap.fromTo(
    dots.querySelectorAll("i"),
    { scale: 0.4, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2)", stagger: 0.11 },
  );
}
