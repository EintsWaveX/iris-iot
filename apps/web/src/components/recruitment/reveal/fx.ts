/**
 * The envelope's effects (06, handoffs/05 motion specs): the motion level,
 * the chime and the confetti.
 *
 * Sound is made in Web Audio, so no file ships. It only ever starts from the
 * candidate's own hold or drag (a user gesture, so browsers allow it) and
 * only while Suara in Tampilan is on (lib/prefs.ts, soundOn).
 *
 * Particles are canvas-confetti (lazy loaded with the reveal island) in the
 * kosmik palette; every timeline is GSAP. Low Detail, the site default,
 * fires about 30 percent of the confetti and drops the extra bursts.
 */
import type { CreateTypes } from "canvas-confetti";
import { useSyncExternalStore } from "react";
import { useMotionTier } from "../../../lib/hooks";
import { soundOn, usePrefs } from "../../../lib/prefs";
import { motionLevel, type MotionLevel } from "../../../lib/recruitment/motion-level";

/** full: Normal and High Detail. ldm: Low Detail, the default. reduce: reduced motion. */
export type { MotionLevel };

const REDUCED = "(prefers-reduced-motion: reduce)";

const ikutReduced = (on: () => void) => {
  const mq = window.matchMedia?.(REDUCED);
  mq?.addEventListener?.("change", on);
  return () => mq?.removeEventListener?.("change", on);
};
const reducedKini = () => window.matchMedia?.(REDUCED).matches ?? false;
// The server cannot know the setting. React hydrates with this and then
// re-renders with the browser's answer, so the markup never mismatches; a
// page rendered only in the browser gets the right answer on its first paint.
const reducedServer = () => false;

export function useRevealMotion(): MotionLevel {
  const tier = useMotionTier();
  const { detail } = usePrefs();
  const reduced = useSyncExternalStore(ikutReduced, reducedKini, reducedServer);
  return motionLevel({ reduced, tier, detail });
}

let actx: AudioContext | null = null;

/** Four notes, 90 ms apart; five for the final acceptance. */
export function chime(kind: "lolos" | "terima"): void {
  if (!soundOn()) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    actx = actx ?? new Ctx();
    const t0 = actx.currentTime + 0.02;
    const notes =
      kind === "terima"
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : [659.25, 830.61, 987.77, 1318.5];
    notes.forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = i === notes.length - 1 ? "sine" : "triangle";
      o.frequency.value = f;
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(actx!.destination);
      o.start(t);
      o.stop(t + 0.95);
    });
  } catch {
    /* no audio device or the browser refused: the reveal goes on without sound */
  }
}

const KOSMIK = ["#40b0ff", "#a78bfa", "#fb7185", "#f5b544", "#5eead4", "#7dd3fc", "#8ed0ff"];

type Confetti = typeof import("canvas-confetti");

let lib: Promise<Confetti> | null = null;
export const loadConfetti = (): Promise<Confetti> =>
  (lib ??= import("canvas-confetti").then((m) => m.default));

/** One canvas for the whole stage; the worker keeps big bursts off the main thread. */
export async function makeShooter(canvas: HTMLCanvasElement): Promise<{
  shoot: CreateTypes;
  star: ReturnType<Confetti["shapeFromPath"]> | null;
}> {
  const c = await loadConfetti();
  const shoot = c.create(canvas, { resize: true, useWorker: true });
  let star: ReturnType<Confetti["shapeFromPath"]> | null = null;
  try {
    star = c.shapeFromPath({
      path: "M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z",
    });
  } catch {
    star = null;
  }
  return { shoot, star };
}

type Kind = "seal" | "lolos" | "terima";

/** The bursts of one moment: the seal's sparks, the corner cannons, the centre, the fireworks. */
export function burst(
  shooter: { shoot: CreateTypes; star: unknown } | null,
  kind: Kind,
  m: MotionLevel,
  timers: number[],
): void {
  if (!shooter || m === "reduce") return;
  const { shoot, star } = shooter;
  const shapes = star ? [star, star, "circle", "square"] : ["circle", "square"];
  const base = {
    colors: KOSMIK,
    shapes: shapes as never,
    ticks: 240,
    gravity: 0.9,
    scalar: 0.95,
    disableForReducedMotion: true,
  };
  const n = (x: number) => Math.round(m === "ldm" ? x * 0.3 : x);
  if (kind === "seal") {
    if (m === "ldm") return;
    void shoot({
      ...base,
      particleCount: 14,
      spread: 360,
      startVelocity: 9,
      ticks: 70,
      scalar: 0.55,
      origin: { x: 0.5, y: 0.42 },
      colors: ["#f5b544", "#ffe066"],
    });
    return;
  }
  void shoot({
    ...base,
    particleCount: n(80),
    angle: 62,
    spread: 62,
    startVelocity: 56,
    origin: { x: 0, y: 0.92 },
  });
  void shoot({
    ...base,
    particleCount: n(80),
    angle: 118,
    spread: 62,
    startVelocity: 56,
    origin: { x: 1, y: 0.92 },
  });
  if (m === "ldm") return;
  timers.push(
    window.setTimeout(
      () =>
        void shoot({
          ...base,
          particleCount: 60,
          spread: 120,
          startVelocity: 34,
          origin: { x: 0.5, y: 0.38 },
        }),
      260,
    ),
  );
  if (kind === "terima") {
    for (let i = 0; i < 4; i++)
      timers.push(
        window.setTimeout(
          () =>
            void shoot({
              ...base,
              particleCount: 46,
              spread: 360,
              startVelocity: 26,
              ticks: 200,
              gravity: 0.7,
              origin: { x: 0.18 + 0.64 * Math.random(), y: 0.12 + 0.22 * Math.random() },
            }),
          700 + i * 520,
        ),
      );
  }
}
