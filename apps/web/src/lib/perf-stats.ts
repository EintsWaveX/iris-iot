/**
 * Phase 0 of the performance work (19 Nov 2026): the numbers and the switches behind the on-device
 * benchmark (scripts/perf-bench.ts). Nothing in here touches the DOM, so node tests can import it.
 *
 * The benchmark answers one question the code alone cannot: "which feature costs the frames on THIS
 * phone?". It runs the page as it is, then again with one kind of effect switched off at a time, and
 * reports frames per second for each. Every switch is plain CSS with !important, injected for a few
 * seconds and removed again, so nothing about the real page changes.
 */

// ---------- Frame statistics ----------

export interface FrameStats {
  /** Frames counted (the first, warm-up frame is dropped) */
  frames: number;
  /** Frames per second over the window */
  fps: number;
  /** Median frame time in ms */
  p50: number;
  /** 95th percentile frame time in ms (the slow frames a reader feels) */
  p95: number;
  /** Slowest single frame in ms */
  worst: number;
  /** Share of frames slower than 33.4 ms (under 30 fps), 0 to 1 */
  slow: number;
  /** True when the browser throttled the tab (half a second or more between frames) */
  throttled: boolean;
}

/** Nearest-rank percentile of an ascending list */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Frame times (ms between two animation frames, in order) to stats. The first value is a warm-up and is dropped. */
export function summarize(deltas: readonly number[]): FrameStats {
  const d = deltas.slice(1).filter((x) => Number.isFinite(x) && x > 0);
  if (d.length === 0) {
    return { frames: 0, fps: 0, p50: 0, p95: 0, worst: 0, slow: 0, throttled: false };
  }
  const sorted = [...d].sort((a, b) => a - b);
  const total = d.reduce((a, b) => a + b, 0);
  const p50 = percentile(sorted, 50);
  return {
    frames: d.length,
    fps: round1(1000 / (total / d.length)),
    p50: round1(p50),
    p95: round1(percentile(sorted, 95)),
    worst: round1(sorted[sorted.length - 1]),
    slow: Math.round((d.filter((x) => x > 33.4).length / d.length) * 100) / 100,
    // A tab the OS hides or occludes is held to about one frame a second. That is not the page's speed.
    throttled: p50 >= 500,
  };
}

// ---------- Long frames (scripting versus rendering) ----------

export interface LoafStats {
  /** Long animation frames seen (Chrome 123+; 0 when the browser has no such entries) */
  n: number;
  /** Their total length in ms */
  totalMs: number;
  /** Time inside script in those frames, ms */
  scriptMs: number;
  /** Forced style and layout inside script, ms */
  forcedMs: number;
}

export interface ScriptCost {
  src: string;
  ms: number;
}

// ---------- The switches ----------

export interface FxSwitch {
  id: string;
  /** What a reader of the results sees */
  label: string;
  /** What is switched off, in plain words */
  off: string;
  /** CSS injected for the step. Every declaration ends in !important. */
  css: string;
  /**
   * Places the selectors above must still exist, so a rename cannot leave a switch that silently
   * does nothing (perf-stats.test.ts checks them against the real stylesheets, paths from src/).
   */
  anchors: readonly { file: string; text: string }[];
}

const ALL = "*,*::before,*::after";

export const NO_BACKDROP = `${ALL}{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}`;
export const NO_SKY = ".sky{display:none!important}";
export const NO_SCENE_BLUR = "#iris-scene{filter:none!important;scale:none!important}";
export const NO_SCENE_ANIM = "#iris-scene,#iris-scene *{animation:none!important}";
export const NO_FOG =
  '.n7-mist,.rkal__d[data-fog="yes"]::after{display:none!important;animation:none!important}';
/** The infinite background-position sweeps (controls.css notes they run at every detail level) */
export const NO_SWEEPS =
  ".btn::after,.btn--primary::before,.btn--nilai::before,.panel--key::before,.tabs__tab::after,.rec-bn,.pl-sweep,.pbadge--pencipta{animation:none!important}";
export const NO_SHADOWS = `${ALL}{box-shadow:none!important;text-shadow:none!important}`;
export const NO_FILTERS = `${ALL}{filter:none!important;mask-image:none!important;-webkit-mask-image:none!important;mix-blend-mode:normal!important}`;
export const NO_MOTION = `${ALL}{animation:none!important;transition:none!important}`;

export const SWITCHES: readonly FxSwitch[] = [
  {
    id: "baseline",
    label: "As it is",
    off: "nothing",
    css: "",
    anchors: [],
  },
  {
    id: "no-backdrop",
    label: "No backdrop blur",
    off: "every backdrop-filter (glass cards, navbar, dialogs, scrims)",
    css: NO_BACKDROP,
    anchors: [{ file: "styles/glass.css", text: "backdrop-filter" }],
  },
  {
    id: "no-sky",
    label: "No sky",
    off: "the whole painted sky (canvas and layers)",
    css: NO_SKY,
    anchors: [{ file: "components/Cosmos.astro", text: 'class="sky"' }],
  },
  {
    id: "no-scene-blur",
    label: "No sky blur",
    off: "the blur and scale on the sky (signed in)",
    css: NO_SCENE_BLUR,
    anchors: [{ file: "styles/scene.css", text: "filter: blur(calc(var(--bg-blur" }],
  },
  {
    id: "no-scene-anim",
    label: "Sky stands still",
    off: "every animation inside the sky",
    css: NO_SCENE_ANIM,
    anchors: [{ file: "styles/scene.css", text: "#iris-scene" }],
  },
  {
    id: "no-fog",
    label: "No fog",
    off: "the Oprec fog (journey and calendar)",
    css: NO_FOG,
    anchors: [
      { file: "components/recruitment/recruitment.css", text: ".n7-mist" },
      { file: "components/recruitment/recruitment-calendar.css", text: 'data-fog="yes"' },
    ],
  },
  {
    id: "no-sweeps",
    label: "No sweeps",
    off: "the always-on sweep animations on buttons, tabs and banners",
    css: NO_SWEEPS,
    anchors: [
      { file: "styles/controls.css", text: "kit-sweep" },
      { file: "styles/app.css", text: ".panel--key::before" },
    ],
  },
  {
    id: "no-shadows",
    label: "No shadows",
    off: "box-shadow and text-shadow",
    css: NO_SHADOWS,
    anchors: [{ file: "styles/glass.css", text: "box-shadow" }],
  },
  {
    id: "no-filters",
    label: "No filters or masks",
    off: "filter, mask-image and mix-blend-mode",
    css: NO_FILTERS,
    anchors: [{ file: "styles/scene.css", text: "mix-blend-mode" }],
  },
  {
    id: "no-motion",
    label: "No animation at all",
    off: "every CSS animation and transition",
    css: NO_MOTION,
    anchors: [{ file: "styles/controls.css", text: "animation" }],
  },
  {
    id: "bare",
    label: "Everything off",
    off: "all of the above together: the ceiling for what CSS effects can give back",
    css: [NO_BACKDROP, NO_SKY, NO_FOG, NO_SHADOWS, NO_FILTERS, NO_MOTION].join("\n"),
    anchors: [],
  },
  {
    // The first run showed steps wobbling by +-15 fps with no cause. Measuring the untouched page again at
    // the end says how much of any difference is just noise (and whether the page slowed down over time).
    id: "baseline-end",
    label: "As it is (again)",
    off: "nothing; a second baseline that measures the noise",
    css: "",
    anchors: [],
  },
];

/** Both untouched baselines (first and last) */
export const isBaseline = (id: string) => id === "baseline" || id === "baseline-end";

// ---------- The report ----------

export interface StepResult {
  id: string;
  label: string;
  idle: FrameStats;
  /** Null when the page is too short to scroll */
  scroll: FrameStats | null;
  loaf: LoafStats;
}

export interface BenchEnv {
  /** Path only, never the query or hash */
  path: string;
  detail: string;
  motionTier: string;
  theme: string;
  signedIn: string;
  dpr: number;
  viewport: string;
  cores: number | null;
  memoryGb: number | null;
  saveData: boolean;
  userAgent: string;
  /** Animations running at the start (document.getAnimations) */
  animations: number;
  /** What they are: "name on element", grouped, at most 20 */
  animationList: string[];
  /** Elements whose computed backdrop-filter is not none */
  backdropElements: number;
  domNodes: number;
  scrollable: boolean;
}

export interface BenchReport {
  v: 1;
  at: string;
  env: BenchEnv;
  steps: StepResult[];
  /** Scripts that spent the most time inside long frames during the "As it is" step */
  scripts: ScriptCost[];
  /**
   * The long frames the page had before the test began: its load (hydration, the sky painter). It is the
   * freeze a visitor feels on opening the page. Null when the browser has no long-frame entries.
   */
  startup: { loaf: LoafStats; scripts: ScriptCost[]; busyUntilMs: number } | null;
  notes: string[];
}

/** fps gained over the baseline, one decimal; null when either is missing */
export function gain(base: FrameStats | null, step: FrameStats | null): number | null {
  if (!base || !step || base.frames === 0 || step.frames === 0) return null;
  return round1(step.fps - base.fps);
}

/**
 * How far the untouched page moved between the first and the last baseline, in fps (absolute). A switch
 * whose gain is smaller than this proves nothing. Null when either baseline is missing or throttled.
 */
export function noise(first: FrameStats | null, last: FrameStats | null): number | null {
  if (!first || !last || first.frames === 0 || last.frames === 0) return null;
  if (first.throttled || last.throttled) return null;
  return round1(Math.abs(last.fps - first.fps));
}

const sign = (n: number | null) => (n === null ? "-" : `${n >= 0 ? "+" : ""}${n}`);
const cell = (s: FrameStats | null) =>
  s ? (s.throttled ? "THROTTLED" : `${s.fps} fps (p95 ${s.p95} ms)`) : "n/a";

/**
 * The result in three plain lines for a phone screen: how smooth the page is as it is, and which switched-off
 * effects gained more than the noise (so they are real). Indonesian, because it is read by a person on the device.
 */
const EFEK: Record<string, string> = {
  "no-backdrop": "blur kaca",
  "no-sky": "latar langit",
  "no-scene-blur": "blur latar",
  "no-scene-anim": "gerak latar",
  "no-fog": "kabut",
  "no-sweeps": "kilap tombol",
  "no-shadows": "bayangan",
  "no-filters": "filter dan masker",
  "no-motion": "semua animasi",
  bare: "semua efek sekaligus",
};

export function headline(r: BenchReport): string[] {
  const base = r.steps.find((s) => s.id === "baseline");
  const last = r.steps.find((s) => s.id === "baseline-end");
  if (!base || base.idle.throttled) {
    return ["Tes tidak bisa dibaca: tabnya diperlambat browser. Ulangi dengan tab di depan."];
  }
  const out: string[] = [];
  const verdict = (fps: number) => (fps >= 50 ? "mulus" : fps >= 30 ? "agak berat" : "patah-patah");
  out.push(
    `Halaman ini: ${base.idle.fps} fps diam (${verdict(base.idle.fps)})` +
      (base.scroll ? `, ${base.scroll.fps} fps saat digulir (${verdict(base.scroll.fps)}).` : "."),
  );
  const smooth = base.idle.fps >= 50 && (base.scroll?.fps ?? 50) >= 50;
  if (smooth) {
    out.push("Sudah mulus. Tidak ada yang perlu dikurangi di halaman ini.");
    if (r.startup && r.startup.loaf.n > 0)
      out.push(`Saat dibuka, halaman macet ${(r.startup.loaf.totalMs / 1000).toFixed(1)} detik.`);
    return out;
  }
  const floor = Math.max(
    noise(base.idle, last?.idle ?? null) ?? 0,
    noise(base.scroll, last?.scroll ?? null) ?? 0,
    3,
  );
  const wins = r.steps
    .filter((s) => !isBaseline(s.id) && s.idle.frames > 0)
    .map((s) => ({
      label: EFEK[s.id] ?? s.label.toLowerCase(),
      g: Math.max(gain(base.idle, s.idle) ?? 0, s.scroll ? (gain(base.scroll, s.scroll) ?? 0) : 0),
    }))
    .filter((w) => w.g > floor)
    .sort((a, b) => b.g - a.g)
    .slice(0, 3);
  out.push(
    wins.length === 0
      ? "Mematikan satu efek tidak menambah fps secara berarti, jadi beban utamanya bukan di efek tampilan."
      : "Yang paling menahan: " +
          wins.map((w) => `${w.label} (+${round1(w.g)} fps)`).join(", ") +
          ".",
  );
  if (r.startup && r.startup.loaf.n > 0)
    out.push(`Saat dibuka, halaman macet ${(r.startup.loaf.totalMs / 1000).toFixed(1)} detik.`);
  return out;
}

/** A report as plain text a person can paste into a chat */
export function formatReport(r: BenchReport): string {
  const e = r.env;
  const lines: string[] = [];
  lines.push(`IRIS perf ${r.at}`);
  lines.push(
    `${e.path} | detail ${e.detail} | tier ${e.motionTier} | ${e.theme} | signed in: ${e.signedIn} | ${e.viewport} @${e.dpr}x`,
  );
  lines.push(
    `cores ${e.cores ?? "?"} | memory ${e.memoryGb ?? "?"} GB | saveData ${e.saveData} | ${e.animations} animations | ${e.backdropElements} backdrop elements | ${e.domNodes} nodes`,
  );
  lines.push(e.userAgent);
  if (e.animationList.length > 0) lines.push(`Running: ${e.animationList.join("; ")}`);
  lines.push("");
  const base = r.steps.find((s) => s.id === "baseline");
  for (const s of r.steps) {
    const g = isBaseline(s.id) ? null : gain(base?.idle ?? null, s.idle);
    const gs = isBaseline(s.id) || !s.scroll ? null : gain(base?.scroll ?? null, s.scroll);
    lines.push(
      `${s.label.padEnd(22)} idle ${cell(s.idle)}${g === null ? "" : ` [${sign(g)}]`} | scroll ${cell(s.scroll)}${gs === null ? "" : ` [${sign(gs)}]`} | long frames ${s.loaf.n} (${s.loaf.totalMs} ms, script ${s.loaf.scriptMs} ms)`,
    );
  }
  const last = r.steps.find((s) => s.id === "baseline-end");
  const ni = noise(base?.idle ?? null, last?.idle ?? null);
  const ns = noise(base?.scroll ?? null, last?.scroll ?? null);
  if (ni !== null || ns !== null) {
    lines.push(
      `Noise (the untouched page, first vs last): idle ${ni ?? "-"} fps, scroll ${ns ?? "-"} fps. A gain smaller than this proves nothing.`,
    );
  }
  if (r.startup && r.startup.loaf.n > 0) {
    const l = r.startup.loaf;
    lines.push("");
    lines.push(
      `Page load froze the main thread: ${l.n} long frames, ${l.totalMs} ms (script ${l.scriptMs} ms) before the test; busy until ${r.startup.busyUntilMs} ms after the page began loading`,
    );
    for (const c of r.startup.scripts) lines.push(`  ${c.ms} ms  ${c.src}`);
  }
  if (r.scripts.length > 0) {
    lines.push("");
    lines.push("Scripts inside long frames (as it is):");
    for (const c of r.scripts) lines.push(`  ${c.ms} ms  ${c.src}`);
  }
  for (const n of r.notes) lines.push(`! ${n}`);
  return lines.join("\n");
}

/** Group the script entries of long frames into the few that cost the most */
export function topScripts(
  entries: readonly { src: string; ms: number }[],
  limit = 5,
): ScriptCost[] {
  const by = new Map<string, number>();
  for (const e of entries) by.set(e.src, (by.get(e.src) ?? 0) + e.ms);
  return [...by.entries()]
    .map(([src, ms]) => ({ src, ms: Math.round(ms) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);
}
