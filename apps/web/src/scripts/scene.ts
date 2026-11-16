/**
 * Mounts the painted cosmos (see cosmos/painters.ts) behind every page. It follows
 * html[data-theme] (dark = Night Watch, light = Golden Hour) and html[data-detail]:
 *   ldm     Low Detail: a still painting
 *   normal  Normal (the default): islands and clouds move, sparkles twinkle, waterfalls run
 *   hd      High Detail: adds mouse parallax, petals, birds and shooting stars
 * The motion itself is CSS (styles/scene.css), so this file only paints on theme or size changes.
 * Cosmos.astro persists the element across navigations, so this runs once per tab.
 */
import { layoutScene, paintBg, sceneHTML, type Theme } from "./cosmos/painters";

const html = document.documentElement;
const canvas = document.getElementById("iris-sky") as HTMLCanvasElement | null;
const scene = document.getElementById("iris-scene");

if (canvas && scene) {
  let built: Theme | null = null;
  let w = 0;
  let h = 0;

  const theme = (): Theme => (html.dataset.theme === "light" ? "day" : "night");

  const paint = () => {
    const T = theme();
    const nw = window.innerWidth;
    const nh = window.innerHeight;
    // A phone's address bar changes the height by a few dozen pixels while scrolling: not worth a repaint.
    const same = Math.abs(nw - w) < 40 && Math.abs(nh - h) < 140 && built === T;
    if (same) return;
    w = nw;
    h = nh;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBg(c, w, h, T);
    if (built !== T) {
      scene.innerHTML = sceneHTML(T);
      built = T;
    }
    layoutScene(scene, w, h);
    html.dataset.sceneReady = "yes";
  };

  // First paint after the page itself, so the sky never delays the content.
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(paint);
  else setTimeout(paint, 30);

  let rz = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(rz);
    rz = window.setTimeout(paint, 200);
  });
  new MutationObserver(paint).observe(html, { attributes: true, attributeFilter: ["data-theme"] });

  // Nothing to animate in a hidden tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) html.dataset.sceneIdle = "yes";
    else delete html.dataset.sceneIdle;
  });

  // High Detail: the layers lean a little toward the pointer.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (html.dataset.detail !== "hd" || reduce.matches || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        html.style.setProperty("--mx", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        html.style.setProperty("--my", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
      });
    },
    { passive: true },
  );
}
