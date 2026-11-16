/**
 * The painted cosmos (Nov 2026 redesign): a fantasy-modernistic, Genshin-style sky in two scenes,
 * night ("Night Watch") and day ("Golden Hour"), with IRIS's own astronomy (orbit rings,
 * constellations, a ground-station dish). Everything is drawn once onto canvases:
 *   - paintBg()       the sky gradient, glows, sparkles, constellations and misty ridges
 *   - sprites()       islands, clouds, a ringed planet, orbit rings and the aurora, as PNG data URLs
 * scene.ts then lays the sprites out as DOM and scene.css moves them. Nothing here runs per frame.
 */

type Ctx = CanvasRenderingContext2D;
export type Theme = "night" | "day";
export type Sprite = {
  url: string;
  w: number;
  h: number;
  wf?: { x: number; y: number };
  tip?: { x: number; y: number };
};
export type SpriteSet = Record<string, Sprite>;

/* ---------------------------------------------------------------- small maths */

function ih(a: number, b: number, s: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
function vn(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = ih(ix, iy, s);
  const b = ih(ix + 1, iy, s);
  const c = ih(ix, iy + 1, s);
  const d = ih(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** "#rrggbb" plus an alpha, for gradients that must fade without turning grey. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext("2d") as Ctx];
}
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- shared drawing helpers */

export function sparkle(c: Ctx, x: number, y: number, r: number, col: string, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, col);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.save();
  c.globalAlpha = a * 0.32;
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r * 2.4, 0, TAU);
  c.fill();
  c.globalAlpha = a;
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + r * 0.1, y - r * 0.1, x + r, y);
  c.quadraticCurveTo(x + r * 0.1, y + r * 0.1, x, y + r);
  c.quadraticCurveTo(x - r * 0.1, y + r * 0.1, x - r, y);
  c.quadraticCurveTo(x - r * 0.1, y - r * 0.1, x, y - r);
  c.fill();
  c.restore();
}

function ringCel(c: Ctx, R: number, tilt: number, front: boolean, o: Planet): void {
  c.save();
  c.rotate(tilt);
  c.beginPath();
  c.rect(-R * 3, front ? 0 : -R * 3, R * 6, R * 3);
  c.clip();
  c.strokeStyle = o.ring1;
  c.lineWidth = R * 0.13;
  c.beginPath();
  c.ellipse(0, 0, R * 1.72, R * 1.72 * 0.27, 0, 0, TAU);
  c.stroke();
  c.strokeStyle = o.ring2;
  c.lineWidth = R * 0.05;
  c.beginPath();
  c.ellipse(0, 0, R * 2.1, R * 2.1 * 0.27, 0, 0, TAU);
  c.stroke();
  c.restore();
}

type Planet = {
  glow: string;
  b1: string;
  b2: string;
  b3: string;
  shade: string;
  rim: string;
  ring1: string;
  ring2: string;
};

function planetCel(c: Ctx, cx: number, cy: number, R: number, o: Planet): void {
  const gl = c.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.6);
  gl.addColorStop(0, o.glow);
  gl.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = gl;
  c.fillRect(cx - R * 2.7, cy - R * 2.7, R * 5.4, R * 5.4);
  c.save();
  c.translate(cx, cy);
  ringCel(c, R, -0.32, false, o);
  c.save();
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.clip();
  c.fillStyle = o.b1;
  c.fillRect(-R, -R, R * 2, R * 2);
  c.rotate(-0.32);
  c.fillStyle = o.b2;
  c.fillRect(-R, -R * 0.5, R * 2, R * 0.3);
  c.fillStyle = o.b3;
  c.fillRect(-R, R * 0.04, R * 2, R * 0.4);
  c.fillStyle = o.b2;
  c.fillRect(-R, R * 0.56, R * 2, R * 0.2);
  c.rotate(0.32);
  c.fillStyle = o.shade;
  c.beginPath();
  c.arc(0, 0, R * 1.02, 0, TAU);
  c.arc(-R * 0.34, -R * 0.3, R * 1.0, 0, TAU, true);
  c.fill("evenodd");
  c.restore();
  c.strokeStyle = o.rim;
  c.lineWidth = Math.max(2, R * 0.045);
  c.lineCap = "round";
  c.beginPath();
  c.arc(0, 0, R - 1, Math.PI * 1.03, Math.PI * 1.62);
  c.stroke();
  ringCel(c, R, -0.32, true, o);
  c.restore();
}

function crescent(c: Ctx, cx: number, cy: number, R: number, col: string, halo: string): void {
  const g = c.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 3.2);
  g.addColorStop(0, halo);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(cx - R * 3.3, cy - R * 3.3, R * 6.6, R * 6.6);
  const S = Math.ceil(R * 2 + 4);
  const [t, tc] = canvas(S, S);
  tc.fillStyle = col;
  tc.beginPath();
  tc.arc(S / 2, S / 2, R, 0, TAU);
  tc.fill();
  tc.globalCompositeOperation = "destination-out";
  tc.beginPath();
  tc.arc(S / 2 + R * 0.46, S / 2 - R * 0.14, R * 0.9, 0, TAU);
  tc.fill();
  c.drawImage(t, cx - S / 2, cy - S / 2);
}

function ribbon(
  c: Ctx,
  w: number,
  h: number,
  y0: number,
  amp: number,
  freq: number,
  ph: number,
  c1: string,
  c2: string,
  thick: number,
  edge: string,
): void {
  const N = 70;
  const yy = (xv: number) =>
    h * y0 +
    Math.sin(xv * freq + ph) * h * amp +
    Math.sin(xv * freq * 2.3 + ph * 1.7) * h * amp * 0.35;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.beginPath();
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    if (i) c.lineTo(x, yy(x));
    else c.moveTo(x, yy(x));
  }
  for (let i = N; i >= 0; i--) {
    const x = (i / N) * w;
    c.lineTo(x, yy(x) + h * thick * (0.6 + 0.4 * Math.sin(x * freq * 1.4 + ph)));
  }
  c.closePath();
  const g = c.createLinearGradient(0, h * (y0 - amp), 0, h * (y0 + amp + thick));
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  c.fillStyle = g;
  c.fill();
  c.beginPath();
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    if (i) c.lineTo(x, yy(x));
    else c.moveTo(x, yy(x));
  }
  c.strokeStyle = edge;
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
}

function ridgeY(w: number, base: number, amp: number, seed: number): [number, number][] {
  const N = 257;
  const pts = new Float32Array(N);
  const r = rnd(seed);
  pts[0] = r() - 0.5;
  pts[N - 1] = r() - 0.5;
  let d = 1;
  for (let step = N - 1; step > 1; step >>= 1, d *= 0.52) {
    for (let i = step >> 1; i < N; i += step)
      pts[i] = (pts[i - (step >> 1)] + pts[i + (step >> 1)]) / 2 + (r() - 0.5) * d;
  }
  const out: [number, number][] = [];
  for (let i = 0; i < N; i++) out.push([(i / (N - 1)) * w, base + pts[i] * amp]);
  return out;
}
function drawRidge(
  c: Ctx,
  pts: [number, number][],
  h: number,
  c1: string,
  c2: string,
  rim: string,
): void {
  const miny = Math.min(...pts.map((p) => p[1]));
  const g = c.createLinearGradient(0, miny, 0, h);
  c.beginPath();
  c.moveTo(pts[0][0], h);
  pts.forEach((p) => c.lineTo(p[0], p[1]));
  c.lineTo(pts[pts.length - 1][0], h);
  c.closePath();
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  c.fillStyle = g;
  c.fill();
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.strokeStyle = rim;
  c.lineWidth = 1;
  c.stroke();
}
function mountains(c: Ctx, w: number, h: number, cols: string[], mist: string): void {
  const far = ridgeY(w, h * 0.78, h * 0.06, 21);
  const mid = ridgeY(w, h * 0.85, h * 0.07, 25);
  const near = ridgeY(w, h * 0.93, h * 0.045, 29);
  drawRidge(c, far, h, cols[0], cols[1], cols[4]);
  const m = c.createLinearGradient(0, h * 0.7, 0, h * 0.92);
  m.addColorStop(0, "rgba(255,255,255,0)");
  m.addColorStop(1, mist);
  c.fillStyle = m;
  c.fillRect(0, h * 0.7, w, h * 0.24);
  drawRidge(c, mid, h, cols[1], cols[2], cols[4]);
  drawRidge(c, near, h, cols[2], cols[3], cols[4]);
}

/** IRIS's own astronomy: orbit rings with a tick scale and riding bodies. */
function astro(
  c: Ctx,
  fx: number,
  fy: number,
  r0: number,
  col: string,
  col2: string,
  a: number,
): void {
  const Rt = r0 * 1.38;
  c.save();
  c.lineCap = "round";
  c.globalAlpha = a;
  const rings: [number, number[], number][] = [
    [1, [], 1],
    [1.38, [2, 7], 1.3],
    [1.8, [14, 10, 2, 10], 1],
  ];
  rings.forEach((m) => {
    c.strokeStyle = m[1].length === 4 ? col : m[1].length ? col2 : col;
    c.lineWidth = m[2];
    c.setLineDash(m[1]);
    c.beginPath();
    c.arc(fx, fy, r0 * m[0], 0, TAU);
    c.stroke();
  });
  c.setLineDash([]);
  c.strokeStyle = col;
  c.lineWidth = 1;
  for (let i = 0; i < 72; i++) {
    const an = (i / 72) * TAU;
    const l = i % 6 === 0 ? 10 : 4;
    c.beginPath();
    c.moveTo(fx + Math.cos(an) * Rt, fy + Math.sin(an) * Rt);
    c.lineTo(fx + Math.cos(an) * (Rt + l), fy + Math.sin(an) * (Rt + l));
    c.stroke();
  }
  const bodies: [number, number, number][] = [
    [0.9, 1, 5],
    [3.5, 1.38, 4],
    [5.5, 1.8, 6.5],
  ];
  bodies.forEach((b) => {
    const R = r0 * b[1];
    const px = fx + Math.cos(b[0]) * R;
    const py = fy + Math.sin(b[0]) * R;
    c.fillStyle = col2;
    c.beginPath();
    c.arc(px, py, b[2], 0, TAU);
    c.fill();
    c.strokeStyle = col2;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(px, py, b[2] + 4, 0, TAU);
    c.stroke();
  });
  c.restore();
}

/** The four module constellations (the same shapes ModConstellation draws), as line art. */
const CON: Record<number, [number, number][]> = {
  1: [
    [10, 34],
    [28, 14],
    [50, 26],
    [72, 10],
    [90, 32],
  ],
  2: [
    [10, 28],
    [30, 40],
    [50, 16],
    [70, 38],
    [90, 20],
  ],
  3: [
    [14, 12],
    [40, 30],
    [24, 42],
    [66, 16],
    [86, 36],
  ],
  4: [
    [12, 38],
    [36, 12],
    [56, 30],
    [78, 14],
    [90, 40],
  ],
};
function conArt(c: Ctx, x: number, y: number, s: number, n: number, col: string, a: number): void {
  const p = CON[n];
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = col;
  c.lineWidth = 1.1;
  c.lineCap = "round";
  c.beginPath();
  p.forEach((q, k) =>
    k ? c.lineTo(x + q[0] * s, y + q[1] * s) : c.moveTo(x + q[0] * s, y + q[1] * s),
  );
  c.stroke();
  c.restore();
  p.forEach((q, k) => sparkle(c, x + q[0] * s, y + q[1] * s, k === 2 ? 6 : 4, col, a + 0.15));
}

/** The ground-station dish on its mast. */
function dishDraw(c: Ctx, x: number, y: number, s: number, col: string, rim: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = col;
  c.strokeStyle = col;
  c.beginPath();
  c.moveTo(-12, 0);
  c.lineTo(0, -34);
  c.lineTo(12, 0);
  c.closePath();
  c.fill();
  c.save();
  c.translate(0, -36);
  c.rotate(-0.62);
  c.beginPath();
  c.moveTo(-30, 0);
  c.quadraticCurveTo(0, -34, 30, 0);
  c.quadraticCurveTo(0, -12, -30, 0);
  c.fill();
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -16);
  c.lineTo(0, -40);
  c.stroke();
  c.beginPath();
  c.arc(0, -42, 3, 0, 6.3);
  c.fill();
  c.strokeStyle = rim;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-30, 0);
  c.quadraticCurveTo(0, -34, 30, 0);
  c.stroke();
  c.restore();
  c.restore();
}

/* ---------------------------------------------------------------- floating islands */

type Pal = Record<string, string>;
const PAL: Record<Theme, Pal> = {
  night: {
    rock1: "#4d3f92",
    rock2: "#1c1552",
    shade: "#0b0832",
    band: "rgba(255,255,255,.07)",
    bandD: "rgba(0,0,24,.2)",
    grass1: "#52e4be",
    grass2: "#1f8596",
    grassHi: "#c4fff0",
    canopy1: "#5cf0c4",
    canopy2: "#1b7d8c",
    trunk: "#2a2058",
    stone1: "#a39adc",
    stone2: "#50449a",
    crystal: "#aef7ff",
    crystalD: "#38b7e2",
    glow: "rgba(150,240,255,.6)",
    rim: "rgba(210,255,245,.95)",
    vine: "#2fc9a0",
    tower: "#0c0a2e",
  },
  day: {
    rock1: "#b6a2e8",
    rock2: "#705cb4",
    shade: "#40318a",
    band: "rgba(255,255,255,.18)",
    bandD: "rgba(40,20,100,.16)",
    grass1: "#b8f29c",
    grass2: "#44c184",
    grassHi: "#f4ffcc",
    canopy1: "#9eed88",
    canopy2: "#30a970",
    trunk: "#6e4e8a",
    stone1: "#f6f1fd",
    stone2: "#baacdc",
    crystal: "#c6fbff",
    crystalD: "#50d1f1",
    glow: "rgba(150,245,255,.65)",
    rim: "#fff6c4",
    vine: "#44c184",
    tower: "#2a3a68",
  },
};
const CLOUD: Record<Theme, { hi: string; mid: string; lo: string }> = {
  day: { hi: "#ffffff", mid: "#edf5ff", lo: "#b2cbf0" },
  night: { hi: "#ffe3f4", mid: "#c6b1f4", lo: "#5f4cae" },
};
const PLANET: Record<Theme, Planet> = {
  night: {
    glow: "rgba(190,160,255,.30)",
    b1: "#7d5fe0",
    b2: "#9a80f2",
    b3: "#5b43b8",
    shade: "rgba(14,8,60,.55)",
    rim: "rgba(170,245,255,.9)",
    ring1: "rgba(255,214,150,.9)",
    ring2: "rgba(255,170,210,.8)",
  },
  day: {
    glow: "rgba(255,255,255,.35)",
    b1: "#c9b7ff",
    b2: "#dccfff",
    b3: "#a994f0",
    shade: "rgba(90,70,170,.35)",
    rim: "rgba(255,255,255,.95)",
    ring1: "rgba(255,226,170,.95)",
    ring2: "rgba(255,190,220,.85)",
  },
};
const ISL: Record<
  string,
  {
    W: number;
    H: number;
    hw: number;
    top: number;
    trees: number;
    ruin: number;
    crystal: number;
    dish: number;
  }
> = {
  big: { W: 460, H: 540, hw: 150, top: 150, trees: 2, ruin: 1, crystal: 0, dish: 1 },
  mid: { W: 340, H: 400, hw: 112, top: 120, trees: 1, ruin: 1, crystal: 1, dish: 0 },
  small: { W: 250, H: 290, hw: 78, top: 96, trees: 1, ruin: 0, crystal: 1, dish: 0 },
  rock: { W: 130, H: 150, hw: 36, top: 40, trees: 0, ruin: 0, crystal: 0, dish: 0 },
};

function treeDraw(c: Ctx, x: number, y: number, s: number, P: Pal): void {
  c.fillStyle = P.trunk;
  c.fillRect(x - 3 * s, y - 30 * s, 6 * s, 32 * s);
  const puffs: [number, number, number][] = [
    [0, -30, 18],
    [-15, -34, 16],
    [15, -34, 16],
    [0, -46, 22],
  ];
  puffs.forEach((b) => {
    const bx = x + b[0] * s;
    const by = y + b[1] * s;
    const br = b[2] * s;
    const g = c.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br * 1.05);
    g.addColorStop(0, P.grassHi);
    g.addColorStop(0.45, P.canopy1);
    g.addColorStop(1, P.canopy2);
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, br, 0, TAU);
    c.fill();
  });
}
function pillarDraw(c: Ctx, x: number, y: number, wd: number, ht: number, P: Pal): void {
  const g = c.createLinearGradient(x, 0, x + wd, 0);
  g.addColorStop(0, P.stone1);
  g.addColorStop(1, P.stone2);
  c.fillStyle = g;
  c.fillRect(x, y - ht, wd, ht);
  c.fillRect(x - 3, y - ht - 5, wd + 6, 6);
  c.fillRect(x - 3, y - 4, wd + 6, 5);
  c.fillStyle = "rgba(0,0,0,.12)";
  c.fillRect(x + wd * 0.62, y - ht, wd * 0.38, ht);
}
function archDraw(c: Ctx, x: number, y: number, P: Pal): void {
  pillarDraw(c, x, y, 9, 46, P);
  pillarDraw(c, x + 40, y, 9, 34, P);
  c.lineCap = "butt";
  c.strokeStyle = P.stone2;
  c.lineWidth = 8;
  c.beginPath();
  c.arc(x + 24.5, y - 46, 24, Math.PI, Math.PI * 1.55);
  c.stroke();
  c.strokeStyle = P.stone1;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x + 24.5, y - 48, 24, Math.PI, Math.PI * 1.55);
  c.stroke();
}
function crystalDraw(c: Ctx, x: number, y: number, s: number, P: Pal): void {
  const g = c.createRadialGradient(x, y - 24 * s, 0, x, y - 24 * s, 56 * s);
  g.addColorStop(0, P.glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.globalCompositeOperation = "lighter";
  c.fillStyle = g;
  c.fillRect(x - 60 * s, y - 84 * s, 120 * s, 120 * s);
  c.restore();
  const prisms: [number, number, number, number][] = [
    [-14, 0, 12, 40],
    [0, 2, 16, 58],
    [16, 0, 11, 34],
  ];
  prisms.forEach((q) => {
    const bx = x + q[0] * s;
    const bw = q[2] * s;
    const bh = q[3] * s;
    const by = y + q[1];
    c.fillStyle = P.crystal;
    c.beginPath();
    c.moveTo(bx - bw / 2, by);
    c.lineTo(bx - bw * 0.35, by - bh * 0.72);
    c.lineTo(bx, by - bh);
    c.lineTo(bx, by);
    c.closePath();
    c.fill();
    c.fillStyle = P.crystalD;
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx, by - bh);
    c.lineTo(bx + bw * 0.35, by - bh * 0.72);
    c.lineTo(bx + bw / 2, by);
    c.closePath();
    c.fill();
  });
}

function islandSprite(kind: string, P: Pal): Sprite {
  const K = ISL[kind];
  const { W, H, hw, top } = K;
  const cx = W / 2;
  const depth = hw * 1.18;
  const [cv, c] = canvas(W, H);
  const r = rnd(kind.charCodeAt(0) * 17 + kind.length);
  const n = 10;
  const Rr: [number, number][] = [];
  const Ll: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = top + 6 + t * depth;
    const w0 = hw * Math.pow(1 - t, 0.85) * (1 + (r() - 0.5) * 0.22 + (i % 2 ? -0.07 : 0.05));
    Rr.push([cx + w0, y]);
    Ll.push([cx - w0 * (1 + (r() - 0.5) * 0.14), y + (r() - 0.5) * 8]);
  }
  Rr[n] = [cx + 2, top + 6 + depth];
  Ll[n] = [cx - 2, top + 6 + depth];
  const rockPath = () => {
    c.beginPath();
    c.moveTo(cx - hw - 4, top + 6);
    c.lineTo(cx + hw + 4, top + 6);
    Rr.forEach((p) => c.lineTo(p[0], p[1]));
    for (let j = n; j >= 0; j--) c.lineTo(Ll[j][0], Ll[j][1]);
    c.closePath();
  };
  rockPath();
  const g = c.createLinearGradient(0, top, 0, top + depth);
  g.addColorStop(0, P.rock1);
  g.addColorStop(1, P.rock2);
  c.fillStyle = g;
  c.fill();
  c.save();
  rockPath();
  c.clip();
  for (let i = 1; i <= 5; i++) {
    const by = top + 6 + (depth * i) / 6.3;
    c.fillStyle = i % 2 ? P.band : P.bandD;
    c.beginPath();
    c.moveTo(cx - hw - 6, by);
    c.lineTo(cx + hw + 6, by + (r() - 0.5) * 10);
    c.lineTo(cx + hw + 6, by + 6 + r() * 6);
    c.lineTo(cx - hw - 6, by + 5 + r() * 6);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = "rgba(0,0,0,.22)";
  c.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const sx = cx + (r() - 0.5) * hw * 1.2;
    const sy = top + 12;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + (r() - 0.5) * 14, sy + depth * (0.25 + r() * 0.3));
    c.lineTo(sx + (r() - 0.5) * 20, sy + depth * (0.5 + r() * 0.3));
    c.stroke();
  }
  c.globalAlpha = 0.5;
  c.fillStyle = P.shade;
  c.beginPath();
  c.moveTo(cx + hw * 0.08, top);
  c.quadraticCurveTo(cx + hw * 0.3, top + depth * 0.45, cx + 2, top + 6 + depth);
  c.lineTo(cx + hw + 10, top + depth + 10);
  c.lineTo(cx + hw + 10, top);
  c.closePath();
  c.fill();
  c.globalAlpha = 1;
  c.restore();
  c.strokeStyle = P.rim;
  c.globalAlpha = 0.75;
  c.lineWidth = 2;
  c.lineCap = "round";
  c.beginPath();
  Ll.slice(0, 7).forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.stroke();
  c.globalAlpha = 1;
  c.strokeStyle = P.vine;
  c.lineWidth = 2.2;
  for (let i = 0; i < 6; i++) {
    const vp = Ll[1 + Math.floor(r() * 5)];
    c.beginPath();
    c.moveTo(vp[0], vp[1]);
    c.quadraticCurveTo(vp[0] - 6, vp[1] + 14, vp[0] - 2 + r() * 6, vp[1] + 18 + r() * 22);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(cx - hw - 8, top + 8);
  c.quadraticCurveTo(cx - hw * 0.55, top - 20, cx, top - 12);
  c.quadraticCurveTo(cx + hw * 0.55, top - 22, cx + hw + 8, top + 8);
  for (let x = cx + hw + 8; x > cx - hw - 8; x -= 18)
    c.quadraticCurveTo(x - 9, top + 28, x - 18, top + 8);
  c.closePath();
  const gg = c.createLinearGradient(0, top - 20, 0, top + 24);
  gg.addColorStop(0, P.grass1);
  gg.addColorStop(1, P.grass2);
  c.fillStyle = gg;
  c.fill();
  c.strokeStyle = P.grassHi;
  c.lineWidth = 2;
  c.globalAlpha = 0.9;
  c.beginPath();
  c.moveTo(cx - hw - 6, top + 7);
  c.quadraticCurveTo(cx - hw * 0.55, top - 20, cx, top - 12);
  c.quadraticCurveTo(cx + hw * 0.55, top - 22, cx + hw + 6, top + 7);
  c.stroke();
  c.globalAlpha = 1;
  const gy = top - 2;
  const sc = hw > 100 ? 1.05 : 0.8;
  if (K.ruin) archDraw(c, cx + hw * 0.2, gy, P);
  if (K.crystal) crystalDraw(c, cx - hw * 0.5, gy + 2, sc, P);
  if (K.trees) treeDraw(c, cx - hw * (K.crystal ? 0.1 : 0.66), gy, sc, P);
  if (K.trees > 1) treeDraw(c, cx + hw * 0.74, gy, 0.85, P);
  if (K.dish) dishDraw(c, cx - hw * 0.3, gy, 1.2, P.tower, P.rim);
  return {
    url: cv.toDataURL(),
    w: W,
    h: H,
    wf: { x: (cx - hw * 0.6) / W, y: (top + 10) / H },
    tip: { x: (cx - hw * 0.3 - 18) / W, y: (gy - 76) / H },
  };
}

function cloudSprite(v: number, T: { hi: string; mid: string; lo: string }): Sprite {
  const W = 560;
  const H = 250;
  const [cv, c] = canvas(W, H);
  const s = 118;
  const ox = W / 2;
  const oy = H * 0.56;
  const SH: [number, number, number][][] = [
    [
      [-1.15, 0.2, 0.5],
      [-0.6, -0.05, 0.72],
      [0, -0.3, 0.95],
      [0.7, -0.1, 0.78],
      [1.25, 0.18, 0.55],
      [0.1, 0.12, 0.8],
    ],
    [
      [-1, 0.25, 0.45],
      [-0.4, -0.15, 0.7],
      [0.3, -0.35, 0.9],
      [1, 0, 0.62],
      [0.2, 0.2, 0.7],
    ],
    [
      [-1.2, 0.2, 0.5],
      [-0.7, 0, 0.62],
      [-0.1, 0.1, 0.7],
      [0.5, -0.2, 0.82],
      [1.1, 0.1, 0.6],
      [1.5, 0.25, 0.42],
    ],
  ];
  // Flatter than a ball, and soft: each puff only fades from light to mid; one shared shadow settles under the whole cloud.
  c.setTransform(1, 0, 0, 0.8, 0, H * 0.13);
  SH[v % 3]
    .slice()
    .sort((a, b) => b[1] - a[1])
    .forEach((p) => {
      const x = ox + p[0] * s;
      const y = oy + p[1] * s;
      const rr = p[2] * s * 0.62;
      const g = c.createRadialGradient(x - rr * 0.25, y - rr * 0.4, rr * 0.1, x, y, rr * 1.05);
      g.addColorStop(0, T.hi);
      g.addColorStop(0.7, T.mid);
      g.addColorStop(1, T.mid);
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, rr, 0, TAU);
      c.fill();
    });
  c.setTransform(1, 0, 0, 1, 0, 0);
  const belly = c.createLinearGradient(0, H * 0.32, 0, H * 0.82);
  belly.addColorStop(0, rgba(T.lo, 0));
  belly.addColorStop(1, rgba(T.lo, 0.85));
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = belly;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = "source-over";
  return { url: cv.toDataURL(), w: W, h: H };
}

const cache: Partial<Record<Theme, SpriteSet>> = {};
/** Every sprite of one theme, painted once and cached. */
export function sprites(T: Theme): SpriteSet {
  const hit = cache[T];
  if (hit) return hit;
  const P = PAL[T];
  const o: SpriteSet = {};
  ["big", "mid", "small", "rock"].forEach((k) => (o[k] = islandSprite(k, P)));
  o.c0 = cloudSprite(0, CLOUD[T]);
  o.c1 = cloudSprite(1, CLOUD[T]);
  o.c2 = cloudSprite(2, CLOUD[T]);
  const [pc, pctx] = canvas(400, 280);
  planetCel(pctx, 200, 140, 74, PLANET[T]);
  o.planet = { url: pc.toDataURL(), w: 400, h: 280 };
  const [rc, rctx] = canvas(640, 640);
  astro(
    rctx,
    320,
    320,
    140,
    T === "day" ? "rgba(255,255,255,.95)" : "rgba(170,235,255,.9)",
    T === "day" ? "rgba(255,214,120,1)" : "rgba(255,226,160,.95)",
    T === "day" ? 0.85 : 0.55,
  );
  o.rings = { url: rc.toDataURL(), w: 640, h: 640 };
  if (T === "night") {
    const [ac, actx] = canvas(1400, 520);
    ribbon(
      actx,
      1400,
      520,
      0.45,
      0.09,
      0.0023,
      0,
      "rgba(110,255,220,.55)",
      "rgba(130,120,255,0)",
      0.26,
      "rgba(210,255,245,.8)",
    );
    ribbon(
      actx,
      1400,
      520,
      0.55,
      0.07,
      0.003,
      2.2,
      "rgba(255,140,220,.4)",
      "rgba(110,150,255,0)",
      0.2,
      "rgba(255,215,245,.6)",
    );
    // Fade the ribbons out toward every edge, so sliding sideways never shows where the sprite ends.
    actx.globalCompositeOperation = "destination-in";
    const fx = actx.createLinearGradient(0, 0, 1400, 0);
    fx.addColorStop(0, "rgba(0,0,0,0)");
    fx.addColorStop(0.2, "rgba(0,0,0,1)");
    fx.addColorStop(0.8, "rgba(0,0,0,1)");
    fx.addColorStop(1, "rgba(0,0,0,0)");
    actx.fillStyle = fx;
    actx.fillRect(0, 0, 1400, 520);
    const fy = actx.createLinearGradient(0, 0, 0, 520);
    fy.addColorStop(0, "rgba(0,0,0,0)");
    fy.addColorStop(0.22, "rgba(0,0,0,1)");
    fy.addColorStop(0.78, "rgba(0,0,0,1)");
    fy.addColorStop(1, "rgba(0,0,0,0)");
    actx.fillStyle = fy;
    actx.fillRect(0, 0, 1400, 520);
    actx.globalCompositeOperation = "source-over";
    o.aurora = { url: ac.toDataURL(), w: 1400, h: 520 };
  }
  cache[T] = o;
  return o;
}

/** The static backdrop: gradient, glows, still sparkles, constellations and misty ridges. */
export function paintBg(c: Ctx, w: number, h: number, T: Theme): void {
  const r = rnd(9);
  const g = c.createLinearGradient(0, 0, 0, h);
  if (T === "night") {
    g.addColorStop(0, "#070b2b");
    g.addColorStop(0.4, "#1a1a5e");
    g.addColorStop(0.7, "#4b2b88");
    g.addColorStop(0.9, "#a34e95");
    g.addColorStop(1, "#d97e92");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    c.globalCompositeOperation = "lighter";
    const glows: [number, number, number, string][] = [
      [0.2, 0.26, 0.55, "rgba(60,190,230,.30)"],
      [0.8, 0.18, 0.55, "rgba(160,100,255,.32)"],
      [0.5, 0.6, 0.65, "rgba(255,125,175,.24)"],
      [0.92, 0.6, 0.35, "rgba(80,230,210,.2)"],
    ];
    glows.forEach((q) => {
      const rg = c.createRadialGradient(
        w * q[0],
        h * q[1],
        0,
        w * q[0],
        h * q[1],
        Math.max(w, h) * q[2] * 0.6,
      );
      rg.addColorStop(0, q[3]);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    });
    c.restore();
    const cols = ["#e8fbff", "#fff3c4", "#ffd2f0", "#cfe6ff"];
    for (let i = 0; i < 70; i++)
      sparkle(
        c,
        r() * w,
        r() * h * 0.72,
        0.6 + r() * 1.8,
        cols[Math.floor(r() * 4)],
        0.4 + r() * 0.45,
      );
    crescent(c, w * 0.12, h * 0.2, Math.max(22, h * 0.04), "#fff0c9", "rgba(255,230,170,.34)");
    conArt(c, w * 0.035, h * 0.33, 1.3, 1, "#bff3ff", 0.55);
    conArt(c, w * 0.58, h * 0.2, 1.2, 4, "#ffe9b0", 0.5);
    mountains(
      c,
      w,
      h,
      ["#4a2f8f", "#35237a", "#241a5e", "#150f3d", "rgba(190,170,255,.4)"],
      "rgba(255,170,210,.3)",
    );
  } else {
    const sx = w * 0.17;
    const sy = h * 0.6;
    g.addColorStop(0, "#3a9bff");
    g.addColorStop(0.34, "#78c2ff");
    g.addColorStop(0.64, "#c0e6ff");
    g.addColorStop(0.86, "#ffe9d2");
    g.addColorStop(1, "#ffd5c4");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.8);
    sg.addColorStop(0, "rgba(255,246,200,.95)");
    sg.addColorStop(0.18, "rgba(255,236,170,.5)");
    sg.addColorStop(1, "rgba(255,225,170,0)");
    c.fillStyle = sg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#fffdf0";
    c.beginPath();
    c.arc(sx, sy, Math.max(20, h * 0.034), 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,240,180,.8)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(sx, sy, Math.max(30, h * 0.052), 0, TAU);
    c.stroke();
    for (let i = 1; i <= 5; i++) {
      c.fillStyle = "rgba(255,255,255," + (0.16 - i * 0.02) + ")";
      c.beginPath();
      c.arc(sx + (w * 0.5 - sx) * i * 0.3, sy + (h * 0.35 - sy) * i * 0.3, 10 + i * 7, 0, TAU);
      c.fill();
    }
    conArt(c, w * 0.035, h * 0.33, 1.3, 1, "#ffffff", 0.75);
    conArt(c, w * 0.58, h * 0.2, 1.2, 4, "#fff2c0", 0.7);
    mountains(
      c,
      w,
      h,
      ["#a6b6ee", "#8aa0e0", "#6a82cc", "#4a62ad", "rgba(255,255,255,.5)"],
      "rgba(255,246,236,.6)",
    );
  }
}

/* ---------------------------------------------------------------- scene layout */

export type SceneItem = {
  s: string;
  x: number;
  y: number;
  w: number;
  cls: string;
  t: number;
  d: number;
  wf?: 1;
  tower?: 1;
  hn?: 1;
  nx?: number;
  ny?: number;
  nw?: number;
};

/** What goes where, as fractions of the viewport. `n*` is the phone variant; `hn` hides it on phones. */
export function sceneItems(T: Theme): SceneItem[] {
  const I: SceneItem[] = [];
  if (T === "night")
    I.push(
      { s: "aurora", x: 0.5, y: 0.46, w: 1500, cls: "aur", t: 9, d: 3, nw: 1100 },
      { s: "aurora", x: 0.46, y: 0.54, w: 1250, cls: "aur aur2", t: 12, d: 3, nw: 950 },
    );
  I.push({
    s: "planet",
    x: 0.89,
    y: 0.25,
    w: 330,
    cls: "bob",
    t: 12,
    d: 8,
    nx: 0.86,
    ny: 0.2,
    nw: 230,
  });
  I.push({
    s: "rings",
    x: 0.5,
    y: 0.46,
    w: 560,
    cls: "spin",
    t: 220,
    d: 4,
    nx: 0.5,
    ny: 0.5,
    nw: 440,
  });
  I.push(
    { s: "c0", x: 0.34, y: 0.22, w: 420, cls: "drift", t: 72, d: 7, nw: 260 },
    { s: "c1", x: 0.7, y: 0.13, w: 330, cls: "drift", t: 92, d: 6, nw: 220 },
    { s: "c2", x: 0.2, y: 0.58, w: 300, cls: "drift", t: 84, d: 8, hn: 1 },
    { s: "small", x: 0.93, y: 0.5, w: 200, cls: "bob", t: 9, d: 18, hn: 1 },
    { s: "rock", x: 0.9, y: 0.72, w: 64, cls: "bob", t: 7, d: 24, hn: 1 },
    {
      s: "big",
      x: 0.12,
      y: 0.72,
      w: 330,
      cls: "bob",
      t: 10,
      d: 22,
      wf: 1,
      tower: 1,
      nx: 0.5,
      ny: 0.9,
      nw: 260,
    },
    { s: "c1", x: 0.12, y: 0.97, w: 600, cls: "drift", t: 58, d: 12, nw: 380 },
    { s: "c0", x: 0.62, y: 1.0, w: 660, cls: "drift", t: 66, d: 13, nw: 420 },
  );
  if (T === "day")
    I.push(
      { s: "c2", x: 0.36, y: 0.93, w: 720, cls: "drift", t: 74, d: 10, nw: 460 },
      { s: "c1", x: 0.88, y: 0.96, w: 640, cls: "drift", t: 62, d: 11, nw: 400 },
    );
  return I;
}

/** The scene's DOM (sprites plus the CSS-only sparkles, petals, birds and shooting star). */
export function sceneHTML(T: Theme): string {
  const S = sprites(T);
  const R = rnd(T === "day" ? 5 : 11);
  let o = "";
  if (T === "day") o += '<div class="rays" style="--rx:17%;--ry:60%"></div>';
  const spk = T === "day" ? ["#fff", "#fff4c0", "#d6f1ff"] : ["#bff3ff", "#fff0b8", "#ffd2f0"];
  for (let i = 0; i < 38; i++) {
    o += `<i class="spk" style="left:${(R() * 100).toFixed(1)}%;top:${(R() * 62).toFixed(1)}%;--s:${(6 + R() * 12).toFixed(0)}px;--t:${(3 + R() * 4).toFixed(1)}s;--dl:${(-R() * 6).toFixed(1)}s;--c:${spk[i % 3]}"></i>`;
  }
  sceneItems(T).forEach((it) => {
    const sp = S[it.s];
    // Livelier than the first mockup: islands bob faster and further, clouds drift faster.
    const tt = it.cls.includes("drift") ? it.t * 0.62 : it.cls.includes("bob") ? it.t * 0.75 : it.t;
    const amp = it.s === "planet" ? 10 : it.s === "rock" ? 22 : 16;
    const dl = (-(R() * tt)).toFixed(1);
    let inner = `<img alt="" draggable="false" src="${sp.url}">`;
    if (it.wf && sp.wf) {
      const fx = (sp.wf.x * 100).toFixed(1);
      inner += `<i class="wf" style="left:${fx}%;top:${(sp.wf.y * 100 + 1).toFixed(1)}%"></i><i class="mist" style="left:${fx}%;top:${(sp.wf.y * 100 + 38).toFixed(1)}%"></i>`;
    }
    if (it.tower && sp.tip)
      inner += `<i class="ping" style="left:${(sp.tip.x * 100).toFixed(1)}%;top:${(sp.tip.y * 100).toFixed(1)}%"></i>`;
    o += `<div class="sp ${it.cls}" data-s="${it.s}" data-x="${it.x}" data-y="${it.y}" data-w="${it.w}" data-nx="${it.nx ?? ""}" data-ny="${it.ny ?? ""}" data-nw="${it.nw ?? ""}" data-hn="${it.hn ? 1 : 0}" data-ar="${(sp.h / sp.w).toFixed(4)}" style="--t:${tt.toFixed(1)}s;--d:${it.d};--amp:${amp};--dl:${dl}s">${inner}</div>`;
  });
  const pet = T === "day" ? ["#ffd1e6", "#fff", "#ffe9a8"] : ["#aef4ff", "#ffe9a8", "#ffc4e6"];
  for (let i = 0; i < 18; i++) {
    o += `<i class="petal" style="left:${(R() * 100).toFixed(1)}%;top:${(R() * 40).toFixed(1)}%;--s:${(6 + R() * 8).toFixed(0)}px;--c:${pet[i % 3]};--dx:${(40 + R() * 160).toFixed(0)}px;--dy:${(200 + R() * 260).toFixed(0)}px;--t:${(11 + R() * 9).toFixed(1)}s;--dl:${(-R() * 14).toFixed(1)}s"></i>`;
  }
  if (T === "day")
    for (let a = 0; a < 3; a++)
      o += `<i class="bird" style="top:${14 + a * 7}%;--t:${46 + a * 9}s;--dl:${-a * 15}s"></i>`;
  else o += '<i class="shoot" style="left:78%;top:14%;--dl:3s"></i>';
  // A soft light that follows the cursor (Normal and High Detail).
  o += '<div class="glow"></div>';
  return o;
}

/** Sizes and places every sprite for a w x h viewport. */
export function layoutScene(root: HTMLElement, w: number, h: number): void {
  const u = Math.min(h / 760, w / 900);
  const nar = w < 700;
  root.querySelectorAll<HTMLElement>(".sp[data-s]").forEach((e) => {
    const hide = nar && e.dataset.hn === "1";
    e.hidden = hide;
    if (hide) return;
    const x = Number((nar && e.dataset.nx) || e.dataset.x);
    const y = Number((nar && e.dataset.ny) || e.dataset.y);
    // The aurora always spans the whole viewport with room to spare, so its swaying edges stay off screen.
    const bw =
      e.dataset.s === "aurora"
        ? w * (e.classList.contains("aur2") ? 1.45 : 1.6)
        : Number((nar && e.dataset.nw) || e.dataset.w) * u;
    const bh = bw * Number(e.dataset.ar);
    e.style.width = bw + "px";
    e.style.height = bh + "px";
    e.style.left = x * w - bw / 2 + "px";
    e.style.top = y * h - bh / 2 + "px";
  });
}

export { vn };
