/**
 * The on-device benchmark (Phase 0 of the performance work, 19 Nov 2026).
 *
 * Open any page with ?perf=1 (Base.astro loads this file only then) and a small panel appears. "Mulai tes"
 * measures the frame rate of that very page, idle and while scrolling, then again with one kind of
 * effect switched off at a time (lib/perf-stats.ts SWITCHES), and prints a table that can be pasted back.
 * It is how we learn which feature costs the frames on a real phone, instead of guessing.
 *
 * The same run is exposed as window.__irisPerf.run() so a headless harness (perf/render-harness.mjs)
 * gets the same numbers from the same code.
 *
 * Rules it keeps: it measures with requestAnimationFrame deltas only (no extra work per frame beyond a
 * scroll step), the panel is opaque with no blur so the tool does not add to what it measures, every
 * injected style is removed when the run ends, and the report carries the path but never the query,
 * the hash or anything about the person.
 */
import {
  SWITCHES,
  formatReport,
  headline,
  isBaseline,
  summarize,
  topScripts,
  type BenchEnv,
  type BenchReport,
  type FxSwitch,
  type LoafStats,
  type ScriptCost,
  type StepResult,
} from "../lib/perf-stats";

export interface RunOptions {
  /** Idle window per step in ms (default 2500) */
  idleMs?: number;
  /** Scrolling window per step in ms (default 2500) */
  scrollMs?: number;
  /** Only these switch ids, in the order of SWITCHES ("baseline" is always included) */
  only?: readonly string[];
  /** Called before each step, for the panel's progress line */
  onStep?: (label: string, index: number, total: number) => void;
  /** Return true to stop early */
  cancelled?: () => boolean;
}

declare global {
  interface Window {
    __irisPerf?: {
      run: (o?: RunOptions) => Promise<BenchReport>;
      switches: readonly string[];
      last: BenchReport | null;
    };
  }
}

interface ScriptSample {
  src: string;
  ms: number;
}

interface LoafEntry extends PerformanceEntry {
  blockingDuration?: number;
  scripts?: {
    sourceURL?: string;
    invoker?: string;
    duration: number;
    forcedStyleAndLayoutDuration?: number;
  }[];
}

const FX_ID = "iris-perf-fx";
const UI_ID = "iris-perf";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function setFx(css: string) {
  let el = document.getElementById(FX_ID);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = FX_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/** Times between animation frames for `ms`; with `scroll` the page also ping-pongs up and down at 900 px/s */
function frames(ms: number, scroll: boolean): Promise<number[]> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    const startY = window.scrollY;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    let last = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (last) deltas.push(now - last);
      else t0 = now;
      last = now;
      if (scroll && max > 0) {
        const dist = ((now - t0) / 1000) * 900;
        const cycle = dist % (2 * max);
        window.scrollTo({ top: cycle <= max ? cycle : 2 * max - cycle, behavior: "instant" });
      }
      if (now - t0 < ms) requestAnimationFrame(tick);
      else {
        if (scroll) window.scrollTo({ top: startY, behavior: "instant" });
        resolve(deltas);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Adds long animation frames to a running tally: how many, how long, how much of it inside script */
function tally(list: readonly PerformanceEntry[], loaf: LoafStats, scripts: ScriptSample[]) {
  for (const raw of list) {
    const e = raw as LoafEntry;
    loaf.n += 1;
    loaf.totalMs += e.duration;
    for (const s of e.scripts ?? []) {
      loaf.scriptMs += s.duration;
      loaf.forcedMs += s.forcedStyleAndLayoutDuration ?? 0;
      scripts.push({ src: s.sourceURL || s.invoker || "(inline)", ms: s.duration });
    }
  }
}

const rounded = (l: LoafStats): LoafStats => ({
  n: l.n,
  totalMs: Math.round(l.totalMs),
  scriptMs: Math.round(l.scriptMs),
  forcedMs: Math.round(l.forcedMs),
});

/**
 * The long frames the page already had before the test started (its load: hydration, the sky painter).
 * This is the freeze a visitor feels on opening the page, kept apart from the test windows so it cannot
 * land in whichever step happens to be running.
 */
function startupLongFrames(): BenchReport["startup"] {
  try {
    const loaf: LoafStats = { n: 0, totalMs: 0, scriptMs: 0, forcedMs: 0 };
    const scripts: ScriptSample[] = [];
    const entries = performance.getEntriesByType("long-animation-frame");
    tally(entries, loaf, scripts);
    // When the last long frame ended, in ms since the page began loading: until then the page can freeze
    const busyUntilMs = Math.round(
      entries.reduce((m, e) => Math.max(m, e.startTime + e.duration), 0),
    );
    return { loaf: rounded(loaf), scripts: topScripts(scripts), busyUntilMs };
  } catch {
    return null;
  }
}

/** Waits until the sky has painted (scene.ts sets data-scene-ready) so its one-off cost is not measured as a step */
async function waitForStartup(maxMs = 12000) {
  const root = document.documentElement;
  const t0 = performance.now();
  while (
    document.getElementById("iris-scene") &&
    root.dataset.sceneReady !== "yes" &&
    performance.now() - t0 < maxMs
  ) {
    await sleep(200);
  }
  await sleep(800);
}

/** Collects long animation frames (Chrome 123+) so scripting and rendering can be told apart */
function watchLongFrames() {
  const loaf: LoafStats = { n: 0, totalMs: 0, scriptMs: 0, forcedMs: 0 };
  const scripts: ScriptSample[] = [];
  let po: PerformanceObserver | null = null;
  const take = (list: PerformanceEntry[]) => tally(list, loaf, scripts);
  try {
    po = new PerformanceObserver((l) => take(l.getEntries()));
    po.observe({ type: "long-animation-frame", buffered: false });
  } catch {
    po = null;
  }
  return {
    supported: po !== null,
    stop() {
      if (po) {
        take(po.takeRecords());
        po.disconnect();
      }
      return { loaf: rounded(loaf), scripts };
    },
  };
}

/** "kit-sweep on button.btn.btn--primary::before": what an animation is and where it runs */
function describeAnimation(a: Animation): string {
  const effect = a.effect as KeyframeEffect | null;
  const target = effect?.target ?? null;
  const name =
    typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation
      ? a.animationName
      : typeof CSSTransition !== "undefined" && a instanceof CSSTransition
        ? `transition ${a.transitionProperty}`
        : "script animation";
  if (!target) return name;
  const cls = [...target.classList]
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  const id = target.id ? `#${target.id}` : "";
  return `${name} on ${target.tagName.toLowerCase()}${id}${cls}${effect?.pseudoElement ?? ""}`;
}

/** The animations running right now, grouped (a sweep on twelve buttons is one line with x12) */
function runningAnimations(): string[] {
  const by = new Map<string, number>();
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue;
    const k = describeAnimation(a);
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([k, n]) => (n > 1 ? `${k} x${n}` : k))
    .sort()
    .slice(0, 20);
}

function readEnv(scrollable: boolean): BenchEnv {
  const root = document.documentElement;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  let backdrop = 0;
  for (const el of document.querySelectorAll("*")) {
    const v = getComputedStyle(el).backdropFilter;
    if (v && v !== "none") backdrop += 1;
  }
  return {
    path: location.pathname,
    detail: root.dataset.detail ?? "?",
    motionTier: root.dataset.motionTier ?? "?",
    theme: root.dataset.theme ?? "?",
    signedIn: root.dataset.masuk ?? "?",
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    saveData: Boolean(nav.connection?.saveData),
    userAgent: navigator.userAgent,
    animations: document.getAnimations().length,
    animationList: runningAnimations(),
    backdropElements: backdrop,
    domNodes: document.getElementsByTagName("*").length,
    scrollable,
  };
}

export async function runBench(o: RunOptions = {}): Promise<BenchReport> {
  const idleMs = o.idleMs ?? 2500;
  const scrollMs = o.scrollMs ?? 2500;
  const chosen: FxSwitch[] = SWITCHES.filter(
    (s) => isBaseline(s.id) || !o.only || o.only.includes(s.id),
  );
  const scrollable = document.documentElement.scrollHeight - window.innerHeight > 200;
  const notes: string[] = [];
  const steps: StepResult[] = [];
  let scripts: ScriptCost[] = [];
  // Startup work (hydration, the sky painter) must finish first, or it lands in whichever step is running
  await waitForStartup();
  const startup = startupLongFrames();
  const env = readEnv(scrollable);
  if (!scrollable) notes.push("The page is too short to scroll, so there are no scroll numbers.");

  try {
    for (let i = 0; i < chosen.length; i++) {
      const sw = chosen[i];
      if (o.cancelled?.()) {
        notes.push("Stopped early.");
        break;
      }
      if (document.hidden) {
        notes.push("The tab went to the background. Keep it in front for the whole test.");
        break;
      }
      o.onStep?.(sw.label, i, chosen.length);
      setFx(sw.css);
      await sleep(600);
      const watch = watchLongFrames();
      const idle = summarize(await frames(idleMs, false));
      const scroll = scrollable ? summarize(await frames(scrollMs, true)) : null;
      const seen = watch.stop();
      if (sw.id === "baseline") {
        scripts = topScripts(seen.scripts);
        if (!watch.supported)
          notes.push("This browser reports no long-frame data (needs Chrome 123+).");
      }
      steps.push({ id: sw.id, label: sw.label, idle, scroll, loaf: seen.loaf });
      if (idle.throttled || scroll?.throttled) {
        notes.push(`"${sw.label}" was throttled by the browser; its numbers mean nothing.`);
      }
    }
  } finally {
    setFx("");
  }

  const report: BenchReport = {
    v: 1,
    at: new Date().toISOString(),
    env,
    steps,
    scripts,
    startup,
    notes,
  };
  if (window.__irisPerf) window.__irisPerf.last = report;
  return report;
}

// ---------- The panel ----------

const PANEL_CSS = `
#${UI_ID}{position:fixed;left:8px;bottom:8px;z-index:500;width:min(380px,calc(100vw - 16px));max-height:72dvh;overflow:auto;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--hairline-strong,#4a5470);background:var(--bg-elevated,#181c2c);color:var(--text,#eef1f6);font:13px/1.45 system-ui,sans-serif;box-shadow:none}
#${UI_ID} h2{margin:0 0 4px;font:700 14px/1.3 system-ui,sans-serif}
#${UI_ID} p{margin:0 0 8px;color:var(--text-muted,#b0b8c8)}
#${UI_ID} pre{margin:8px 0 0;white-space:pre-wrap;word-break:break-word;font:11px/1.45 ui-monospace,monospace;user-select:text}
#${UI_ID} .sum p{margin:0 0 6px;color:var(--text,#fff);font:600 14px/1.4 system-ui,sans-serif}
#${UI_ID} .row{display:flex;gap:8px;flex-wrap:wrap}
#${UI_ID} button{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--hairline-strong,#4a5470);background:var(--surface-3,#1d2238);color:inherit;font:600 13px system-ui,sans-serif;cursor:pointer}
#${UI_ID} button.go{background:var(--accent,#40b0ff);color:var(--accent-ink,#04121d);border-color:transparent}
`;

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  return Promise.resolve(false);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
}

export function mountPerfBench(opts: { autorun?: boolean } = {}) {
  if (document.getElementById(UI_ID)) return;
  window.__irisPerf = {
    run: runBench,
    switches: SWITCHES.map((s) => s.id),
    last: null,
  };

  const style = el("style", { id: `${UI_ID}-css`, textContent: PANEL_CSS });
  const status = el("p", {
    textContent:
      "Tes ini ngukur FPS halaman ini, lalu mematikan satu efek per langkah. Butuh sekitar 1 menit. Biarkan tab ini di depan dan jangan pindah aplikasi.",
  });
  const out = el("pre", { hidden: true });
  const go = el("button", { className: "go", type: "button", textContent: "Mulai tes" });
  const copy = el("button", { type: "button", textContent: "Salin hasil", hidden: true });
  const share = el("button", { type: "button", textContent: "Bagikan", hidden: true });
  const sum = el("div", { className: "sum", hidden: true });
  const close = el("button", { type: "button", textContent: "Tutup" });
  const box = el(
    "section",
    { id: UI_ID, ariaLabel: "Tes kecepatan" },
    el("h2", { textContent: "Tes kecepatan IRIS" }),
    status,
    sum,
    el("div", { className: "row" }, go, copy, share, close),
    out,
  );
  document.head.appendChild(style);
  document.body.appendChild(box);

  let running = false;
  let stop = false;
  const start = async () => {
    if (running) {
      stop = true;
      return;
    }
    running = true;
    stop = false;
    go.textContent = "Berhenti";
    copy.hidden = true;
    share.hidden = true;
    sum.hidden = true;
    out.hidden = true;
    const report = await runBench({
      onStep: (label, i, n) => {
        status.textContent = `Langkah ${i + 1} dari ${n}: ${label}. Jangan pindah tab.`;
      },
      cancelled: () => stop,
    });
    running = false;
    go.textContent = "Ulangi tes";
    status.textContent = "Selesai. Tekan Salin hasil (atau Bagikan) lalu kirim ke aku.";
    const text = formatReport(report);
    out.textContent = text;
    out.hidden = false;
    copy.hidden = false;
    share.hidden = typeof navigator.share !== "function";
    sum.replaceChildren(...headline(report).map((l) => el("p", { textContent: l })));
    sum.hidden = false;
    // A browser with a console but no clipboard (or a person who can only reach the console) still gets the text
    // eslint-disable-next-line no-console -- the report is the point
    console.info(text);
  };
  go.addEventListener("click", () => void start());
  copy.addEventListener("click", () => {
    const text = out.textContent ?? "";
    void copyText(text).then((ok) => {
      copy.textContent = ok ? "Tersalin" : "Pilih teks lalu salin sendiri";
    });
  });
  share.addEventListener("click", () => {
    void navigator
      .share?.({ title: "Tes kecepatan IRIS", text: out.textContent ?? "" })
      .catch(() => {});
  });
  close.addEventListener("click", () => {
    stop = true;
    box.remove();
    // So a reload does not start the test again
    history.replaceState(history.state, "", location.pathname + location.hash);
    style.remove();
    setFx("");
  });
  if (opts.autorun) void start();
}
