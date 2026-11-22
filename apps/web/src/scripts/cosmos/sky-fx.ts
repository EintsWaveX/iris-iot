/**
 * Runs the small moving things over the painted sky (sparkles, petals, birds, the shooting star) on two canvases.
 * They were 59 to 62 animated elements; on a laptop at High Detail they cost more than all the islands and clouds
 * together. See sky-motion.ts for what each one does and painters.ts skyBits() for where they are.
 *
 *   Low Detail, motion tier 0, reduced motion,
 *   a page with sky="still" (the Konsol)         one still frame of sparkles, no loop
 *   Normal                                      sparkles twinkle, drawn at 30 frames a second
 *   High Detail                                 adds petals, birds and the shooting star, at the screen's rate
 *   hidden tab                                  no loop
 */
import { skyBits, type Theme } from "./painters";
import {
  drawFront,
  drawGlowSprite,
  drawSparkles,
  drawStarSprite,
  type Sprites,
} from "./sky-motion";

export type SkyFx = {
  /** The viewport changed size */
  resize(w: number, h: number): void;
  /** The scene is being thrown away (another theme): stop drawing */
  stop(): void;
};

const html = document.documentElement;

function sprites(colors: string[]): Sprites {
  const stars = new Map<string, CanvasImageSource>();
  for (const col of colors) {
    if (stars.has(col)) continue;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 48;
    const c = cv.getContext("2d");
    if (c) drawStarSprite(c, 48, col);
    stars.set(col, cv);
  }
  const g = document.createElement("canvas");
  g.width = g.height = 56;
  const gc = g.getContext("2d");
  if (gc) drawGlowSprite(gc, 56);
  return { stars, glow: g };
}

export function mountSkyFx(scene: HTMLElement, T: Theme, w: number, h: number): SkyFx | null {
  const back = scene.querySelector<HTMLCanvasElement>("canvas.fx-back");
  const front = scene.querySelector<HTMLCanvasElement>("canvas.fx-front");
  const bc = back?.getContext("2d");
  const fc = front?.getContext("2d");
  if (!back || !front || !bc || !fc) return null;

  const bits = skyBits(T);
  const art = sprites(bits.spk.map((s) => s.c));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const start = performance.now();
  let raf = 0;
  let last = 0;
  let dead = false;
  let vw = 0;
  let vh = 0;

  const size = (nw: number, nh: number) => {
    vw = nw;
    vh = nh;
    // The sparkles are a few pixels wide and sit under a blur when signed in: no need for a crisp 3x screen
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    for (const [cv, c] of [
      [back, bc],
      [front, fc],
    ] as const) {
      cv.width = Math.round(nw * dpr);
      cv.height = Math.round(nh * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  const hd = () => html.dataset.detail === "hd";
  const still = () =>
    html.dataset.detail === "ldm" ||
    html.dataset.motionTier === "0" ||
    html.dataset.sky === "still" ||
    reduce.matches;

  /** One frame at the given time */
  const frame = (t: number, animated: boolean) => {
    drawSparkles(bc, bits, art, t, vw, vh, animated);
    const showFront = animated && hd();
    front.hidden = !showFront;
    if (showFront) drawFront(fc, bits, art, t, vw, vh);
  };

  const loop = (now: number) => {
    raf = 0;
    if (dead) return;
    // Below High Detail the twinkle is gentle enough for 30 frames a second, and a full-screen canvas costs per frame
    if (!hd() && now - last < 30) {
      raf = requestAnimationFrame(loop);
      return;
    }
    last = now;
    frame((now - start) / 1000, true);
    raf = requestAnimationFrame(loop);
  };

  const sync = () => {
    if (dead) return;
    // A page with no sky (html[data-sky="off"]) draws nothing, and stops the loop it had
    const skyOff = html.dataset.sky === "off";
    const animated = !still() && !document.hidden && !skyOff;
    if (animated) {
      if (!raf) raf = requestAnimationFrame(loop);
      return;
    }
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    // A hidden tab keeps whatever it showed; Low Detail and reduced motion show the still painting
    if (!document.hidden && !skyOff) frame(0, false);
  };

  size(w, h);
  sync();

  const mo = new MutationObserver(sync);
  mo.observe(html, {
    attributes: true,
    attributeFilter: ["data-detail", "data-motion-tier", "data-sky"],
  });
  document.addEventListener("visibilitychange", sync);
  reduce.addEventListener("change", sync);

  return {
    resize(nw, nh) {
      size(nw, nh);
      if (!raf && !document.hidden) frame(0, false);
    },
    stop() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      mo.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduce.removeEventListener("change", sync);
    },
  };
}
