/**
 * Mounts the painted cosmos (see cosmos/painters.ts) behind every page. It follows
 * html[data-theme] (dark = Night Watch, light = Golden Hour) and html[data-detail]:
 *   ldm     Low Detail: a still painting
 *   normal  Normal (the default): islands and clouds move, sparkles twinkle, waterfalls run,
 *           the layers follow the cursor (parallax plus a soft light)
 *   hd      High Detail: adds petals, birds and shooting stars
 * The islands, clouds and waterfalls move by CSS (styles/scene.css); the sparkles, petals, birds and shooting star
 * are drawn on two canvases (cosmos/sky-fx.ts), because as 60 elements they were the costliest part of the sky.
 * Cosmos.astro persists the element across navigations, so this runs once per tab.
 */
import { layoutScene, paintBg, sceneHTML, type Theme } from "./cosmos/painters";
import { mountSkyFx, type SkyFx } from "./cosmos/sky-fx";
import { loadSprites } from "./cosmos/sky-client";

const html = document.documentElement;
const canvas = document.getElementById("iris-sky") as HTMLCanvasElement | null;
const scene = document.getElementById("iris-scene");

if (canvas && scene) {
  // The theme whose sprites are in the scene, and the one whose sprites are on their way
  let built: Theme | null = null;
  let building: Theme | null = null;
  // The canvases for the sparkles, petals, birds and shooting star (cosmos/sky-fx.ts)
  let fx: SkyFx | null = null;
  let w = 0;
  let h = 0;

  const theme = (): Theme => (html.dataset.theme === "light" ? "day" : "night");
  // A page that turned the sky off (exam rooms, the QR wall: Base's `sky={false}`) gets none of it. The Konsol's
  // `sky="still"` is painted once like Low Detail and then never moves (the CSS, sky-fx and the pointer lean skip it).
  const off = () => html.dataset.sky === "off";

  // Ask for the sprites straight away: a worker draws them while the page hydrates, so the main thread never
  // pays for them (cosmos/sky-client.ts). Until they arrive the page shows the gradient and the painted
  // backdrop, exactly as scene.css's "before the sprites are painted" fallback intends.
  if (!off()) void loadSprites(theme());

  const install = (T: Theme) => {
    building = T;
    void loadSprites(T).then((set) => {
      if (building !== T) return; // a newer theme choice replaced this one
      building = null;
      fx?.stop();
      scene.innerHTML = sceneHTML(T, set);
      built = T;
      layoutScene(scene, w, h);
      fx = mountSkyFx(scene, T, w, h);
      html.dataset.sceneReady = "yes";
    });
  };

  const paint = () => {
    if (off()) return;
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
    if (built === T) {
      layoutScene(scene, w, h);
      fx?.resize(w, h);
    } else {
      if (built) {
        // A night sky never shows under a day backdrop while the new sprites are on their way
        fx?.stop();
        fx = null;
        scene.innerHTML = "";
        built = null;
      }
      if (building !== T) install(T);
    }
  };

  // Matahari (public/theme-init.js): at dawn and dusk the other theme's painting lies over this one and fades by
  // html's --sun, so the sky turns over gradually while the UI flips at the halfway point. Only the backdrop and the
  // sprites are painted for it (no sparkle loop), and it exists only inside the two windows.
  const sky = canvas.parentElement;
  let alt: { el: HTMLDivElement; T: Theme; w: number; h: number } | null = null;
  let altBuilding: Theme | null = null;
  const dropAlt = () => {
    altBuilding = null;
    alt?.el.remove();
    alt = null;
  };
  // Put every sprite of the overlay painting on exactly the same motion as its twin in the main painting (matched by data-s):
  // the same period, depth, amplitude and phase (the two paintings differ a little, e.g. the clouds drift at 36 s and 38.4 s),
  // then on the same animation clock. Otherwise each sprite is drawn twice, drifting in and out of step.
  const syncAltClock = (base: HTMLElement, over: HTMLElement) => {
    const pairs: Array<[HTMLElement, HTMLElement]> = [];
    base.querySelectorAll<HTMLElement>(".sp[data-s]").forEach((e) => {
      const twin = over.querySelector<HTMLElement>(`.sp[data-s="${e.dataset.s}"]`);
      if (!twin) return;
      for (const v of ["--t", "--d", "--amp", "--dl"])
        twin.style.setProperty(v, e.style.getPropertyValue(v));
      pairs.push([e, twin]);
    });
    void over.offsetHeight; // apply the new variables to the running animations before touching their clocks
    for (const [e, twin] of pairs) {
      const a = e.getAnimations()[0];
      const b = twin.getAnimations()[0];
      if (a && b && a.startTime !== null) b.startTime = a.startTime;
    }
  };
  const syncSun = () => {
    const phase = html.dataset.sun;
    const s = Number.parseFloat(html.style.getPropertyValue("--sun"));
    if (off() || !sky || (phase !== "dawn" && phase !== "dusk") || !Number.isFinite(s)) {
      dropAlt();
      return;
    }
    const main = theme();
    const other: Theme = main === "day" ? "night" : "day";
    const opacity = (main === "night" ? s : 1 - s).toFixed(3);
    if (alt && alt.T === other) {
      if (alt.w !== w || alt.h !== h) {
        const c = alt.el.querySelector("canvas");
        const sc = alt.el.querySelector<HTMLElement>(".scene");
        const g = c?.getContext("2d");
        if (c && sc && g) {
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          paintBg(g, w, h, other);
          layoutScene(sc, w, h);
        }
        alt.w = w;
        alt.h = h;
      }
      alt.el.style.opacity = opacity;
      return;
    }
    if (altBuilding === other || !w || !h) return;
    dropAlt();
    altBuilding = other;
    void loadSprites(other).then((set) => {
      if (altBuilding !== other) return;
      altBuilding = null;
      const el = document.createElement("div");
      el.className = "sky-alt";
      const c = document.createElement("canvas");
      const sc = document.createElement("div");
      sc.className = "scene";
      sc.innerHTML = sceneHTML(other, set);
      sc.querySelectorAll("canvas.fx").forEach((f) => f.remove());
      el.append(c, sc);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintBg(g, w, h, other);
      }
      sky.insertBefore(el, scene.nextSibling);
      layoutScene(sc, w, h);
      alt = { el, T: other, w, h };
      // Both paintings give a sprite the same timing now (painters.ts), but the overlay's CSS animations start when it is inserted.
      // Start each on its twin's clock so the two copies coincide, then let the browser lay it out at 0 first so it fades in rather than popping.
      requestAnimationFrame(() => {
        syncAltClock(scene, sc);
        syncSun();
      });
    });
  };
  window.addEventListener("iris-sun", syncSun);

  // First paint after the page itself, so the sky never delays the content.
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  const paintAll = () => {
    paint();
    syncSun();
  };
  if (idle) idle(paintAll);
  else setTimeout(paintAll, 30);

  let rz = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(rz);
    rz = window.setTimeout(paintAll, 200);
  });
  // data-theme: the reader switched theme. data-sky: a navigation to or from a page that has no sky.
  new MutationObserver(paintAll).observe(html, {
    attributes: true,
    attributeFilter: ["data-theme", "data-sky", "data-sun"],
  });

  // Nothing to animate in a hidden tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) html.dataset.sceneIdle = "yes";
    else delete html.dataset.sceneIdle;
  });

  // Normal and High Detail: the layers lean toward the pointer (deeper layers further) and a soft light follows it.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (
        html.dataset.detail === "ldm" ||
        html.dataset.motionTier === "0" ||
        html.dataset.sky === "off" ||
        html.dataset.sky === "still" ||
        reduce.matches ||
        raf
      )
        return;
      const x = e.clientX;
      const y = e.clientY;
      raf = requestAnimationFrame(() => {
        raf = 0;
        html.style.setProperty("--mx", ((x / window.innerWidth - 0.5) * 2).toFixed(3));
        html.style.setProperty("--my", ((y / window.innerHeight - 0.5) * 2).toFixed(3));
        html.style.setProperty("--cx", x + "px");
        html.style.setProperty("--cy", y + "px");
      });
    },
    { passive: true },
  );
}
