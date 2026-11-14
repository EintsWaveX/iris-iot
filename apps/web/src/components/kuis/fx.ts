/**
 * The quiz's sound and confetti. Sound is made in Web Audio (no files) and is
 * off unless Suara in Tampilan is on (lib/prefs.ts, soundOn). Confetti is
 * canvas-confetti, loaded on first use; Low Detail fires fewer, reduced
 * motion fires none.
 */
import type { CreateTypes } from "canvas-confetti";
import { soundOn } from "../../lib/prefs";
import type { MotionLevel } from "../../lib/recruitment/motion-level";
import { loadConfetti } from "../recruitment/reveal/fx";

let actx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    actx = actx ?? new C();
    if (actx.state === "suspended") void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

function nada(
  a: AudioContext,
  f: number,
  t0: number,
  dur: number,
  tipe: OscillatorType = "triangle",
  vol = 0.12,
  ke?: number,
) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = tipe;
  o.frequency.setValueAtTime(f, t0);
  if (ke) o.frequency.exponentialRampToValueAtTime(ke, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export type Bunyi = "masuk" | "tik" | "go" | "kunci" | "benar" | "salah" | "habis" | "juara";

export function bunyi(jenis: Bunyi): void {
  if (!soundOn()) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (jenis) {
    case "masuk":
      nada(a, 520, t, 0.12, "sine", 0.1, 880);
      break;
    case "tik":
      nada(a, 560, t, 0.09, "square", 0.05);
      break;
    case "go":
      nada(a, 880, t, 0.28, "triangle", 0.12);
      nada(a, 1320, t + 0.06, 0.28, "sine", 0.08);
      break;
    case "kunci":
      nada(a, 420, t, 0.07, "square", 0.06);
      nada(a, 640, t + 0.06, 0.1, "triangle", 0.08);
      break;
    case "benar":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        nada(a, f, t + i * 0.08, 0.5, "triangle", 0.11),
      );
      break;
    case "salah":
      nada(a, 220, t, 0.35, "sawtooth", 0.07, 110);
      break;
    case "habis":
      nada(a, 330, t, 0.22, "square", 0.06, 200);
      break;
    case "juara":
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        nada(a, f, t + i * 0.11, i === 5 ? 1.1 : 0.45, "triangle", 0.12),
      );
      break;
  }
}

const WARNA = ["#40b0ff", "#a78bfa", "#fb7185", "#f5b544", "#5eead4", "#7dd3fc"];

let kanvas: HTMLCanvasElement | null = null;
let tembakan: CreateTypes | null = null;

/**
 * One full-screen canvas for all the confetti. canvas-confetti's own default draws in a Web Worker
 * made from a blob, which the site's Content-Security-Policy refuses (no worker-src), so this
 * draws on the main thread instead.
 */
async function penembak(): Promise<CreateTypes> {
  const c = await loadConfetti();
  if (!kanvas || !kanvas.isConnected || !tembakan) {
    kanvas = document.createElement("canvas");
    kanvas.setAttribute("aria-hidden", "true");
    Object.assign(kanvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "60",
    });
    document.body.appendChild(kanvas);
    tembakan = c.create(kanvas, { resize: true, useWorker: false });
  }
  return tembakan as CreateTypes;
}

/** One celebration. `besar` is the podium; the small one is a right answer. */
export async function rayakan(m: MotionLevel, besar: boolean, x = 0.5, y = 0.6): Promise<void> {
  if (m === "reduce") return;
  try {
    const confetti = await penembak();
    const kurang = m === "ldm" ? 0.45 : 1;
    const dasar = {
      colors: WARNA,
      disableForReducedMotion: true,
      ticks: besar ? 260 : 160,
      zIndex: 60,
    };
    if (!besar) {
      void confetti({
        ...dasar,
        particleCount: Math.round(70 * kurang),
        spread: 70,
        startVelocity: 38,
        origin: { x, y },
      });
      return;
    }
    const tembak = (ox: number, sudut: number) =>
      confetti({
        ...dasar,
        particleCount: Math.round(90 * kurang),
        angle: sudut,
        spread: 62,
        startVelocity: 58,
        origin: { x: ox, y: 0.9 },
      });
    void tembak(0.05, 62);
    void tembak(0.95, 118);
    if (m === "full") {
      window.setTimeout(
        () =>
          void confetti({
            ...dasar,
            particleCount: 160,
            spread: 120,
            startVelocity: 34,
            origin: { x: 0.5, y: 0.4 },
          }),
        380,
      );
      window.setTimeout(() => {
        void tembak(0.1, 70);
        void tembak(0.9, 110);
      }, 900);
    }
  } catch {
    /* the celebration is a bonus: the game goes on without it */
  }
}
