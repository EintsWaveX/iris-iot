/**
 * Phase 9: the sky behind every page, ported from the signed-off mockup
 * (design-review/mockups/phase9/app/sky.js). It replaces the web app's use
 * of kosmik's cosmos.core.js, the WebGL aurora and the meteor canvas;
 * apps/games keeps those.
 *
 *   Low Detail (ldm)  one painted frame, nothing moves (the default)
 *   Normal            stars twinkle, the nebula drifts, a meteor now and
 *                     then; drawn at 30 fps
 *   High Detail (hd)  adds the ringed planet, banded gas giant, cratered
 *                     moon, an orbiting satellite, a spiral galaxy,
 *                     asteroids, comet showers and aurora ribbons
 *
 * The light theme ("Daylight sky") repaints the same layers: a dawn
 * gradient, sun glow, drifting clouds, pastel planets and a contrail.
 *
 * The theme and level come from html[data-theme] and html[data-detail]
 * (public/theme-init.js), and prefers-reduced-motion freezes the frame.
 * The canvas lives in Cosmos.astro under transition:persist, so this runs
 * once per visit and survives every ClientRouter navigation. The ground
 * and nebula are cached offscreen per size and theme, so a moving frame
 * is one image copy plus the small things that move.
 */

type Theme = "dark" | "light";
type Detail = "ldm" | "normal" | "hd";

interface Star {
  x: number;
  y: number;
  z: number;
  p: number;
}
interface Asteroid {
  x: number;
  y: number;
  s: number;
  v: number;
  a: number;
  va: number;
  pts: number[];
}
interface Cloud {
  x: number;
  y: number;
  s: number;
  v: number;
  o: number;
}
interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface World {
  stars: Star[];
  asteroids: Asteroid[];
  clouds: Cloud[];
  meteors: Streak[];
  comets: Streak[];
  nextMeteor: number;
  nextComet: number;
}

const TAU = Math.PI * 2;
const DRIFT = 40;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function makeWorld(w: number, h: number): World {
  const r = rng(7);
  return {
    stars: Array.from({ length: Math.round((w * h) / 5200) }, () => ({
      x: r() * w,
      y: r() * h,
      z: r(),
      p: r() * TAU,
    })),
    asteroids: Array.from({ length: 14 }, () => ({
      x: r() * w,
      y: h * (0.15 + r() * 0.5),
      s: 2 + r() * 5,
      v: 0.08 + r() * 0.18,
      a: r() * TAU,
      va: (r() - 0.5) * 0.01,
      pts: Array.from({ length: 7 }, () => 0.6 + r() * 0.5),
    })),
    clouds: Array.from({ length: 9 }, () => ({
      x: r() * w,
      y: h * (0.05 + r() * 0.75),
      s: 60 + r() * 140,
      v: 0.05 + r() * 0.12,
      o: 0.35 + r() * 0.4,
    })),
    meteors: [],
    comets: [],
    nextMeteor: 2,
    nextComet: 6,
  };
}

/* ------------------------------------------------------------ planets */

function ringedPlanet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  light: boolean,
) {
  const tilt = -0.32;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.lineWidth = R * 0.16;
  ctx.strokeStyle = light ? "rgba(160,140,210,0.35)" : "rgba(190,170,255,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 2.1, R * 0.52, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.restore();
  const g = ctx.createRadialGradient(x - R * 0.45, y - R * 0.5, R * 0.1, x, y, R);
  if (light) {
    g.addColorStop(0, "#fde7f3");
    g.addColorStop(0.55, "#d9c8f5");
    g.addColorStop(1, "#a99ad6");
  } else {
    g.addColorStop(0, "#b9a7ff");
    g.addColorStop(0.5, "#5b46b8");
    g.addColorStop(1, "#1a1240");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.clip();
  ctx.translate(x, y + R * 0.18);
  ctx.rotate(tilt);
  ctx.fillStyle = light ? "rgba(90,70,150,0.18)" : "rgba(0,0,0,0.35)";
  ctx.fillRect(-R * 2, -R * 0.07, R * 4, R * 0.14);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const rg = ctx.createLinearGradient(-R * 2.1, 0, R * 2.1, 0);
  rg.addColorStop(0, light ? "rgba(170,150,220,0.2)" : "rgba(200,180,255,0.15)");
  rg.addColorStop(0.5, light ? "rgba(150,130,210,0.7)" : "rgba(220,205,255,0.75)");
  rg.addColorStop(1, light ? "rgba(170,150,220,0.2)" : "rgba(200,180,255,0.15)");
  ctx.strokeStyle = rg;
  ctx.lineWidth = R * 0.16;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 2.1, R * 0.52, 0, 0, Math.PI);
  ctx.stroke();
  ctx.lineWidth = R * 0.05;
  ctx.strokeStyle = light ? "rgba(120,100,190,0.35)" : "rgba(240,230,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 2.4, R * 0.6, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function gasGiant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  light: boolean,
  t: number,
) {
  const glow = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 1.35);
  glow.addColorStop(0, light ? "rgba(255,190,150,0.45)" : "rgba(64,176,255,0.28)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, R * 1.35, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.clip();
  const bands = light
    ? ["#ffd9c2", "#f6c3b0", "#fde3cf", "#eab7a6", "#f9d0bb", "#f2c0ae", "#ffe2cf"]
    : ["#123a5a", "#1e5a7e", "#0f2e4c", "#2a6d8f", "#153f63", "#1c5274", "#0d2741"];
  const bh = (R * 2) / bands.length;
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    const wob = Math.sin(t * 0.0003 + i) * R * 0.02;
    ctx.fillRect(x - R, y - R + i * bh + wob, R * 2, bh + 2);
  });
  ctx.fillStyle = light ? "rgba(220,120,110,0.5)" : "rgba(255,160,120,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + R * 0.3, y + R * 0.25, R * 0.16, R * 0.08, 0, 0, TAU);
  ctx.fill();
  const sh = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
  sh.addColorStop(0, "rgba(255,255,255,0.12)");
  sh.addColorStop(0.55, "rgba(0,0,0,0)");
  sh.addColorStop(1, light ? "rgba(120,80,90,0.35)" : "rgba(0,0,0,0.7)");
  ctx.fillStyle = sh;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.restore();
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, light: boolean) {
  const glow = ctx.createRadialGradient(x, y, R, x, y, R * 1.8);
  glow.addColorStop(0, light ? "rgba(255,255,255,0.6)" : "rgba(180,220,255,0.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, R * 1.8, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.4, R * 0.1, x, y, R);
  g.addColorStop(0, light ? "#ffffff" : "#e8edf5");
  g.addColorStop(1, light ? "#c9d3e3" : "#5d6678");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = light ? "rgba(140,150,175,0.35)" : "rgba(40,45,60,0.45)";
  for (const [dx, dy, r] of [
    [-0.3, -0.2, 0.22],
    [0.35, 0.1, 0.16],
    [-0.05, 0.42, 0.12],
    [0.2, -0.45, 0.1],
    [-0.5, 0.25, 0.08],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * R, y + dy * R, r * R, 0, TAU);
    ctx.fill();
  }
}

function satellite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  light: boolean,
) {
  const a = t * 0.00025;
  const x = cx + Math.cos(a) * R * 3.2;
  const y = cy + Math.sin(a) * R * 1.1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a * 2);
  ctx.fillStyle = light ? "#6c7a96" : "#c9d4e6";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.fillStyle = light ? "#3b6db0" : "#3d7fd1";
  ctx.fillRect(-13, -2, 8, 4);
  ctx.fillRect(5, -2, 8, 4);
  ctx.restore();
  if (Math.floor(t / 600) % 2 === 0) {
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(x, y - 5, 1.6, 0, TAU);
    ctx.fill();
  }
}

function galaxy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  t: number,
  light: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 + t * 0.00002);
  ctx.scale(1, 0.42);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, light ? "rgba(255,240,220,0.7)" : "rgba(255,245,230,0.75)");
  g.addColorStop(0.3, light ? "rgba(200,180,240,0.25)" : "rgba(170,150,255,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = light ? "rgba(120,110,190,0.4)" : "rgba(220,215,255,0.5)";
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 46; i++) {
      const k = i / 46;
      const ang = arm * Math.PI + k * 5.2;
      const rr = k * R;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, 1.1 * (1 - k) + 0.4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function aurora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, light: boolean) {
  const cols = light
    ? ["rgba(140,200,255,0.18)", "rgba(200,170,255,0.16)", "rgba(255,190,200,0.14)"]
    : ["rgba(64,176,255,0.12)", "rgba(167,139,250,0.11)", "rgba(94,234,212,0.1)"];
  cols.forEach((c, i) => {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 20) {
      const y = h * (0.72 + i * 0.06) + Math.sin(x / (180 + i * 40) + t * 0.0004 * (i + 1)) * 34;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  });
}

/* ---------------------------------------------------------- the ground */

/** The ground gradient and nebula (or sun) glow, DRIFT px wider on each
 *  side so the drift can slide it without showing an edge. */
function paintGround(
  c: HTMLCanvasElement,
  w: number,
  h: number,
  scale: number,
  light: boolean,
  tint: string | null,
) {
  const cw = w + DRIFT * 2;
  c.width = Math.max(1, Math.round(cw * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  if (light) {
    bg.addColorStop(0, "#b9d7f6");
    bg.addColorStop(0.55, "#e7f1fc");
    bg.addColorStop(1, "#fbe7da");
  } else {
    bg.addColorStop(0, "#0b0e1a");
    bg.addColorStop(1, "#07080f");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, h);
  const blobs: [number, number, number, string][] = light
    ? [
        [0.86, 0.06, 0.45, "rgba(255,214,150,0.55)"],
        [0.15, 0.2, 0.5, "rgba(255,255,255,0.4)"],
      ]
    : [
        [0.15, 0.05, 0.6, "rgba(58,42,107,0.5)"],
        [0.9, 0.12, 0.5, "rgba(15,63,74,0.55)"],
        [0.55, 0.9, 0.55, "rgba(27,31,74,0.45)"],
      ];
  if (tint) blobs.push([0.5, 0.45, 0.5, tint]);
  for (const [bx, by, br, col] of blobs) {
    const x = DRIFT + bx * w;
    const g = ctx.createRadialGradient(x, by * h, 0, x, by * h, br * Math.max(w, h));
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, h);
  }
}

/* ------------------------------------------------------------ one frame */

function draw(
  ctx: CanvasRenderingContext2D,
  ground: HTMLCanvasElement,
  w: number,
  h: number,
  W: World,
  t: number,
  light: boolean,
  detail: Detail,
  moving: boolean,
  dt: number,
) {
  const drift = moving ? Math.sin(t * 0.00008) * DRIFT : 0;
  ctx.drawImage(ground, 0, 0, ground.width, ground.height, -DRIFT + drift, 0, w + DRIFT * 2, h);

  if (!light) {
    for (const s of W.stars) {
      const tw = moving ? 0.55 + 0.45 * Math.sin(t * 0.002 * (0.4 + s.z) + s.p) : 0.8;
      ctx.globalAlpha = (0.25 + s.z * 0.65) * tw;
      ctx.fillStyle = s.z > 0.92 ? "#cfe8ff" : "#ffffff";
      const size = s.z > 0.85 ? 2 : 1.2;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  } else {
    for (const c of W.clouds) {
      if (moving) {
        c.x += c.v * dt * 0.06;
        if (c.x - c.s * 1.6 > w) c.x = -c.s * 1.6;
      }
      ctx.globalAlpha = c.o * (detail === "ldm" ? 0.7 : 1);
      ctx.fillStyle = "#ffffff";
      for (const [dx, dy, k] of [
        [0, 0, 1],
        [0.6, 0.1, 0.75],
        [-0.6, 0.12, 0.7],
        [0.25, -0.25, 0.7],
      ]) {
        ctx.beginPath();
        ctx.ellipse(
          c.x + dx * c.s,
          c.y + dy * c.s * 0.5,
          c.s * 0.55 * k,
          c.s * 0.32 * k,
          0,
          0,
          TAU,
        );
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (detail === "hd") {
    const m = Math.min(w, h);
    aurora(ctx, w, h, t, light);
    galaxy(ctx, w * 0.36, h * 0.16, m * 0.09, t, light);
    gasGiant(ctx, w * 0.06, h * 0.98, m * 0.34, light, t);
    ringedPlanet(ctx, w * 0.86, h * 0.2, m * 0.075, light);
    moon(ctx, w * 0.7, h * 0.55, m * 0.035, light);
    satellite(ctx, w * 0.7, h * 0.55, m * 0.035, t, light);
    ctx.fillStyle = light ? "rgba(120,110,130,0.55)" : "rgba(170,160,150,0.7)";
    for (const a of W.asteroids) {
      if (moving) {
        a.x += a.v * dt * 0.06;
        a.a += a.va * dt * 0.06;
        if (a.x > w + 10) a.x = -10;
      }
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.a);
      ctx.beginPath();
      a.pts.forEach((p, i) => {
        const an = (i / a.pts.length) * TAU;
        const px = Math.cos(an) * a.s * p;
        const py = Math.sin(an) * a.s * p;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (moving) {
      W.nextComet -= dt / 1000;
      if (W.nextComet <= 0) {
        for (let i = 0; i < 4; i++) {
          W.comets.push({
            x: w * (0.3 + Math.random() * 0.7),
            y: -20 - i * 40,
            vx: -2.6 - Math.random(),
            vy: 1.6 + Math.random() * 0.6,
            life: 1,
          });
        }
        W.nextComet = 12 + Math.random() * 6;
      }
      W.comets = W.comets.filter((c) => c.life > 0 && c.y < h + 40);
      for (const c of W.comets) {
        c.x += c.vx * dt * 0.06;
        c.y += c.vy * dt * 0.06;
        c.life -= dt / 4000;
        const tail = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 40, c.y - c.vy * 40);
        tail.addColorStop(0, light ? "rgba(255,255,255,0.95)" : "rgba(200,235,255,0.95)");
        tail.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x - c.vx * 40, c.y - c.vy * 40);
        ctx.stroke();
      }
    }
  }

  if (moving && !light) {
    W.nextMeteor -= dt / 1000;
    if (W.nextMeteor <= 0) {
      W.meteors.push({
        x: w * (0.2 + Math.random() * 0.8),
        y: h * Math.random() * 0.4,
        vx: -7,
        vy: 3.2,
        life: 1,
      });
      W.nextMeteor = detail === "hd" ? 3 + Math.random() * 3 : 6 + Math.random() * 5;
    }
    W.meteors = W.meteors.filter((m) => m.life > 0);
    for (const m of W.meteors) {
      m.x += m.vx * dt * 0.06;
      m.y += m.vy * dt * 0.06;
      m.life -= dt / 900;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
      g.addColorStop(0, `rgba(255,255,255,${Math.max(0, m.life)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
      ctx.stroke();
    }
  }

  if (light && moving) {
    const k = ((t * 0.00003) % 1.4) - 0.2;
    const x = w * k;
    const y = h * (0.3 - k * 0.12);
    const g = ctx.createLinearGradient(x, y, x - 220, y + 26);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 220, y + 26);
    ctx.stroke();
  }

  // A legibility veil, so body text reads whatever moves behind it.
  ctx.fillStyle = light ? "rgba(238,243,250,0.28)" : "rgba(8,10,18,0.22)";
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------- runtime */

const MOD_TINT: Record<number, string> = {
  1: "rgba(108,196,255,0.10)",
  2: "rgba(163,156,255,0.10)",
  3: "rgba(95,224,176,0.09)",
  4: "rgba(255,173,107,0.09)",
};

function start(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const html = document.documentElement;
  const ground = document.createElement("canvas");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let w = 0;
  let h = 0;
  let world: World = makeWorld(1, 1);
  let raf = 0;
  let last = performance.now();
  let lastDrawn = 0;
  let tint = 0;
  let groundKey = "";

  const theme = (): Theme => (html.dataset.theme === "light" ? "light" : "dark");
  const detail = (): Detail => {
    const d = html.dataset.detail;
    return d === "normal" || d === "hd" ? d : "ldm";
  };
  const moving = () => detail() !== "ldm" && !reduce.matches && !document.hidden;
  // Capped device pixel ratio: a still frame may be crisp; a moving one
  // trades a little sharpness for a cool phone.
  const scale = () => Math.min(window.devicePixelRatio || 1, moving() ? 1.5 : 2);

  function fit() {
    w = window.innerWidth;
    h = window.innerHeight;
    const s = scale();
    canvas.width = Math.max(1, Math.round(w * s));
    canvas.height = Math.max(1, Math.round(h * s));
    ctx!.setTransform(s, 0, 0, s, 0, 0);
    world = makeWorld(w, h);
    groundKey = "";
  }

  function frame(now: number) {
    raf = 0;
    const mov = moving();
    // Normal runs at 30 fps; High Detail at the display's rate.
    if (mov && detail() === "normal" && now - lastDrawn < 32) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(64, now - last);
    last = now;
    lastDrawn = now;
    const light = theme() === "light";
    const key = `${w}x${h}@${scale()}:${light}:${tint}`;
    if (key !== groundKey) {
      paintGround(ground, w, h, scale(), light, tint ? (MOD_TINT[tint] ?? null) : null);
      groundKey = key;
    }
    draw(ctx!, ground, w, h, world, now, light, detail(), mov, dt);
    if (mov) raf = requestAnimationFrame(frame);
  }

  function redraw() {
    if (raf) cancelAnimationFrame(raf);
    const s = scale();
    if (Math.round(w * s) !== canvas.width) fit();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  fit();
  redraw();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      fit();
      redraw();
    }, 120);
  });
  new MutationObserver(redraw).observe(html, {
    attributes: true,
    attributeFilter: ["data-theme", "data-detail"],
  });
  reduce.addEventListener("change", redraw);
  document.addEventListener("visibilitychange", redraw);

  // The Console calls these; scenes no longer change the sky, a module
  // still tints it faintly while its session runs.
  window.Cosmos = {
    setScene: () => {},
    setModuleTint: (n: number) => {
      tint = MOD_TINT[n] ? n : 0;
      redraw();
    },
  };
}

const el = document.getElementById("iris-sky");
if (el instanceof HTMLCanvasElement && !el.dataset.started) {
  el.dataset.started = "1";
  start(el);
}
