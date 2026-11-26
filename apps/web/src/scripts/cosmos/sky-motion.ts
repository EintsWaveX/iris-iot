/**
 * How the small things over the painted sky move, as plain functions of time, plus the drawing of them.
 * No DOM in here: sky-fx.ts owns the canvases and the loop, this file only knows what one frame looks like.
 *
 * These used to be CSS keyframes on 59 to 62 elements (scene.css). The numbers are the same ones:
 * a sparkle swells 0.65x to 1.2x while its opacity goes 0.2 to 1, a petal fades in over its first 12 %
 * and out over its last 12 % while it drifts and turns 420 degrees, a bird crosses 125 % of the screen
 * width, the shooting star flies for 78 % of an 11 s cycle after a 3 s wait.
 */
import type { Bird, Petal, SkyBits, Sparkle } from "./painters";

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Where a thing with this period is in its cycle, 0 to 1. Delays in the data are negative: the cycle already started. */
export function phase(t: number, period: number, delay = 0): number {
  const p = ((((t - delay) % period) + period) % period) / period;
  return p;
}

/** The sparkle's swell, 0 (dim, small) to 1 (bright, big): the same ease-in-out CSS gave the 0 / 50 / 100 % keyframes. */
export function swell(t: number, s: Pick<Sparkle, "t" | "dl">): number {
  return 0.5 - 0.5 * Math.cos(TAU * phase(t, s.t, s.dl));
}
export const sparkleSize = (s: number, k: number) => s * (0.65 + 0.55 * k);
export const sparkleAlpha = (k: number) => 0.2 + 0.8 * k;
/** A still sparkle (Low Detail, reduced motion): the opacity the stylesheet always gave it */
export const STILL_ALPHA = 0.8;

/** A petal's opacity over its cycle u (0 to 1) */
export function petalAlpha(u: number): number {
  const a = u < 0.12 ? u / 0.12 : u > 0.88 ? (1 - u) / 0.12 : 1;
  return 0.9 * a;
}
export const PETAL_TURN = (420 * Math.PI) / 180;

/** The shooting star's opacity and how far along its path (0 to 1) it is, from the time since the page started. */
export function shootAt(t: number, period = 11, wait = 3): { alpha: number; run: number } {
  if (t < wait) return { alpha: 0, run: 0 };
  const u = phase(t, period, wait);
  const alpha = u < 0.03 ? u / 0.03 : u <= 0.6 ? 1 : u < 0.78 ? 1 - (u - 0.6) / 0.18 : 0;
  return { alpha, run: Math.min(u / 0.78, 1) };
}
/** Where a bird is, as a fraction of the viewport width, from its cycle u */
export const birdX = (u: number) => -0.08 + 1.25 * u;

/* ---------------------------------------------------------------- drawing */

/** One star sprite, the shape and colours the `.spk` element had: a white core fading to its colour, cut to a four-point star. */
export function drawStarSprite(c: Ctx, size: number, color: string): void {
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7071);
  g.addColorStop(0.24, "#fff");
  g.addColorStop(0.7, color);
  g.addColorStop(1, color);
  c.clearRect(0, 0, size, size);
  c.fillStyle = g;
  c.beginPath();
  [
    [50, 0],
    [58, 42],
    [100, 50],
    [58, 58],
    [50, 100],
    [42, 58],
    [0, 50],
    [42, 42],
  ].forEach(([x, y], i) => {
    if (i) c.lineTo((x / 100) * size, (y / 100) * size);
    else c.moveTo((x / 100) * size, (y / 100) * size);
  });
  c.closePath();
  c.fill();
}

/** A soft round glow for the shooting star's head */
export function drawGlowSprite(c: Ctx, size: number): void {
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.3, "#fff");
  g.addColorStop(0.45, "rgba(190,243,255,.9)");
  g.addColorStop(1, "rgba(190,243,255,0)");
  c.clearRect(0, 0, size, size);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
}

export type Sprites = { stars: Map<string, CanvasImageSource>; glow: CanvasImageSource };

/** The sparkles, behind the islands. `animated` false = the still painting. */
export function drawSparkles(
  c: Ctx,
  bits: Pick<SkyBits, "spk">,
  sprites: Sprites,
  t: number,
  w: number,
  h: number,
  animated: boolean,
): void {
  c.clearRect(0, 0, w, h);
  for (const s of bits.spk) {
    const img = sprites.stars.get(s.c);
    if (!img) continue;
    const k = animated ? swell(t, s) : 0;
    const size = animated ? sparkleSize(s.s, k) : s.s;
    c.globalAlpha = animated ? sparkleAlpha(k) : STILL_ALPHA;
    c.drawImage(img, s.x * w - size / 2, s.y * h - size / 2, size, size);
  }
  c.globalAlpha = 1;
}

/** The leaf shape of `border-radius: 80% 0 80% 0` on a w x h box, centred on the origin */
function petalPath(c: Ctx, w: number, h: number): void {
  const rx = 0.8 * w;
  const ry = 0.8 * h;
  c.beginPath();
  c.moveTo(-w / 2 + rx, -h / 2);
  c.lineTo(w / 2, -h / 2);
  c.lineTo(w / 2, -h / 2 + (h - ry));
  c.ellipse(w / 2 - rx, h / 2 - ry, rx, ry, 0, 0, Math.PI / 2);
  c.lineTo(-w / 2, h / 2);
  c.lineTo(-w / 2, -h / 2 + ry);
  c.ellipse(-w / 2 + rx, -h / 2 + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  c.closePath();
}

function drawPetal(c: Ctx, p: Petal, t: number, w: number, h: number): void {
  const u = phase(t, p.t, p.dl);
  const a = petalAlpha(u);
  if (a <= 0.004) return;
  c.globalAlpha = a;
  c.fillStyle = p.c;
  c.save();
  c.translate(p.x * w + p.dx * u + p.s / 2, p.y * h + p.dy * u + (p.s * 0.62) / 2);
  c.rotate(u * PETAL_TURN);
  petalPath(c, p.s, p.s * 0.62);
  c.fill();
  c.restore();
}

/** Two wings, each a half-ellipse outline, flapping in step: the four corners the two CSS pseudo-elements had. */
function drawBird(c: Ctx, b: Bird, t: number, w: number, h: number): void {
  const u = phase(t, b.t, b.dl);
  const x = birdX(u) * w;
  const y = b.y * h;
  // 0.42 s each way, ease-in-out, alternating: 0 = wings up and long, 1 = wings flat and short
  const k = 0.5 - 0.5 * Math.cos((TAU * t) / 0.84);
  const sy = 1 - 0.5 * k;
  const lift = (-12 + 26 * k) * (Math.PI / 180);
  c.strokeStyle = "rgba(30,50,110,.7)";
  c.lineWidth = 2;
  for (const side of [-1, 1] as const) {
    c.save();
    // The wing's pivot is the bottom middle of its 11 x 7 box, at the body's edge
    c.translate(x + 11 + side * 5.5, y + 7);
    c.rotate(side * lift);
    c.scale(1, sy);
    c.beginPath();
    c.ellipse(0, 0, 5.5, 7, 0, Math.PI, TAU);
    c.stroke();
    c.restore();
  }
}

function drawShoot(c: Ctx, sprites: Sprites, t: number, w: number, h: number): void {
  const { alpha, run } = shootAt(t);
  if (alpha <= 0.004) return;
  // The head starts at (78 % + 200 px, 14 % + 1.5 px) and the comet's body trails 155 degrees round from it
  const hx = 0.78 * w + 200 - 540 * run;
  const hy = 0.14 * h + 1.5 + 245 * run;
  const tailX = hx + 200 * Math.cos((25 * Math.PI) / 180);
  const ty = hy - 200 * Math.sin((25 * Math.PI) / 180);
  const g = c.createLinearGradient(tailX, ty, hx, hy);
  g.addColorStop(0, "rgba(190,243,255,0)");
  g.addColorStop(0.6, "rgba(190,243,255,.55)");
  g.addColorStop(1, "#fff");
  c.globalAlpha = alpha;
  c.lineCap = "round";
  c.strokeStyle = g;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(tailX, ty);
  c.lineTo(hx, hy);
  c.stroke();
  c.drawImage(sprites.glow, hx - 14, hy - 14, 28, 28);
}

/** The petals, birds and shooting star, in front of the islands (High Detail only) */
export function drawFront(
  c: Ctx,
  bits: SkyBits,
  sprites: Sprites,
  t: number,
  w: number,
  h: number,
): void {
  c.clearRect(0, 0, w, h);
  for (const p of bits.pet) drawPetal(c, p, t, w, h);
  c.globalAlpha = 1;
  for (const b of bits.birds) drawBird(c, b, t, w, h);
  if (bits.shoot) drawShoot(c, sprites, t, w, h);
  c.globalAlpha = 1;
}
