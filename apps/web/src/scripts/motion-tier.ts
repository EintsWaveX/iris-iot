/**
 * The motion-tier probe. Decides which of three tiers this device earns,
 * per docs/design-system.md's motion section, and mirrors it onto
 * window.Motion (packages/kosmik/js/motion.core.js's tier axis) so both
 * the CSS layers (cosmos.css, gated on data-motion-tier) and the canvas
 * starfield (cosmos.core.js, gated on Motion.getTier()) agree with it.
 *
 *   0  static painted CSS sky, no JavaScript animation anywhere.
 *   1  the CSS drift layers (nebula/grid/aurora) animate; no canvas.
 *   2  the canvas starfield/comets/planets also mount. The default.
 *
 * This is a capability measurement, independent of reduced motion (a
 * stated PREFERENCE that always wins outright over whatever this probe
 * decides -- see effectiveTier() below and motion.core.js's own comment
 * on why the two axes are kept separate).
 *
 * Declared device signals (deviceMemory, Save-Data, hardwareConcurrency)
 * are checked first as a fast, synchronous "definitely weak" filter, but
 * are never trusted alone to say a device is CAPABLE -- they are known to
 * lie in that direction (a mid phone can report 8GB and still choke on
 * fill-rate). Anything not caught by that filter gets an actual measured
 * frame rate under a synthetic draw load shaped like the starfield's own
 * per-frame cost, over a short window, once per device, cached.
 *
 * Import order matters and is enforced by cosmos-web.js: this module must
 * run after motion.core.js (so window.Motion exists) and before
 * cosmos.core.js (so its init() reads a tier that has already been set
 * for the synchronous cases -- a cache hit, or the declared-weak fast
 * path).
 *
 * The interim tier for the one case that cannot resolve synchronously --
 * a first-ever visit with no cache and no declared weak signal -- is 1,
 * not 2, and this is deliberate rather than merely cautious: the interim
 * has to hold until the measurement below finishes, and if it granted
 * tier 2 up front, cosmos.core.js would mount and start ticking the real
 * starfield WHILE this probe is still measuring, so the measurement
 * would be timing the combined cost of two concurrent canvas loops
 * rather than the one thing it is trying to describe. Measured directly:
 * an idle canvas draws this exact synthetic load at ~140fps on ordinary
 * hardware, but with the real starfield ticker already running
 * underneath it that reading collapsed under 30fps, tiering a perfectly
 * capable machine down to 0. Holding at 1 during the probe keeps the
 * canvas untouched (no ticker, no contention) while the CSS drift layers
 * still animate, and cosmos.core.js's own onTierChange subscription
 * (see its init()) is what mounts the canvas once the real result lands
 * a few hundred milliseconds later, or keeps it at rest if the result
 * turns out to be 0 or 1 after all.
 */

type Tier = 0 | 1 | 2;

// v2 (Stage 6): bumped alongside the Otomatis/Penuh/Kurangi setting --
// `probedAt` was written but never read, so a device that once measured
// badly stayed pinned at that tier forever even after conditions changed.
// The explicit tri-state setting is the real fix for "stuck reduced", but
// bumping the key here also gives every existing session one fresh,
// unpinned measurement rather than trusting a possibly-stale old one.
// v3 (Phase 8): a single 400ms reading taken while the page was still
// hydrating its islands pinned capable desktops at tier 0 (a frozen sky)
// for a week. The probe now keeps the better of two readings, floors
// multi-core machines at tier 1, and re-measures a low verdict after 12
// hours; bumping the key gives every stuck browser that fresh measurement.
const TIER_CACHE_KEY = "iris-motion-tier-v3";
const PROBE_MS = 400;
const SPRITE_COUNT = 180; // roughly cosmos.core.js's near-layer star density

function readDeclaredWeakSignal(): boolean {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  const conn = nav.connection;
  if (conn && conn.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2) {
    return true;
  }
  return false;
}

// P6.4/B10: a device that once measured tier 0 (a busy first load, a
// throttled background tab that slipped through) stayed pinned there
// forever -- `probedAt` was written but never read back. Seven days is
// long enough that this never re-probes on every visit, short enough that
// a since-upgraded phone or a since-closed background tab is not stuck
// with a stale verdict indefinitely.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// A below-best verdict is the one most likely to be a busy-moment artefact,
// so it is trusted for much less time than a tier 2 one.
const LOW_TIER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readCachedTier(): Tier | null {
  try {
    const raw = window.localStorage.getItem(TIER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tier?: number; probedAt?: number };
    const maxAge = parsed.tier === 2 ? CACHE_MAX_AGE_MS : LOW_TIER_MAX_AGE_MS;
    if (typeof parsed.probedAt !== "number" || Date.now() - parsed.probedAt > maxAge) {
      return null;
    }
    if (parsed.tier === 0 || parsed.tier === 1 || parsed.tier === 2) return parsed.tier;
  } catch {
    // Private mode, disabled storage, or a corrupted value -- re-probe
    // rather than trust it.
  }
  return null;
}

function writeCachedTier(tier: Tier): void {
  try {
    window.localStorage.setItem(TIER_CACHE_KEY, JSON.stringify({ tier, probedAt: Date.now() }));
  } catch {
    // The probe result still applies for this page load; it just won't
    // persist to skip the probe next time.
  }
}

/**
 * Draws SPRITE_COUNT pre-rendered glow sprites per frame via drawImage, on
 * an offscreen canvas nobody sees, for PROBE_MS -- the same shape of work
 * cosmos.core.js's own makeGlowSprite()/drawImage pattern does per frame,
 * so the measurement means something rather than timing an unrelated,
 * cheaper draw call.
 *
 * Resolves `null` rather than a number if the tab was hidden at any point
 * during the window: a backgrounded tab gets its rAF callbacks throttled
 * by the browser itself, sometimes down to a couple of frames a second,
 * which has nothing to do with the device's real capability and would
 * otherwise tier a fully capable machine down to 0 for the rest of that
 * cached period. probeTier() below retries on `null` rather than caching
 * it.
 */
function measureFrameRate(): Promise<number | null> {
  return new Promise((resolve) => {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    try {
      canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 160;
      ctx = canvas.getContext("2d");
    } catch {
      resolve(0);
      return;
    }
    if (!ctx) {
      resolve(0);
      return;
    }
    const drawCtx = ctx;

    const sprite = document.createElement("canvas");
    sprite.width = 16;
    sprite.height = 16;
    const sctx = sprite.getContext("2d");
    if (sctx) {
      const glow = sctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      glow.addColorStop(0, "rgba(255,255,255,0.9)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      sctx.fillStyle = glow;
      sctx.fillRect(0, 0, 16, 16);
    }

    let frames = 0;
    let wasHidden = document.hidden;
    const start = performance.now();

    function tick(now: number) {
      if (document.hidden) wasHidden = true;
      drawCtx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < SPRITE_COUNT; i++) {
        const x = (i * 37) % canvas.width;
        const y = (i * 53) % canvas.height;
        drawCtx.drawImage(sprite, x, y);
      }
      frames++;
      if (now - start < PROBE_MS) {
        requestAnimationFrame(tick);
      } else if (wasHidden) {
        resolve(null);
      } else {
        const elapsedSec = (now - start) / 1000;
        resolve(elapsedSec > 0 ? frames / elapsedSec : 0);
      }
    }
    requestAnimationFrame(tick);
  });
}

function waitForVisible(): Promise<void> {
  return new Promise((resolve) => {
    if (!document.hidden) {
      resolve();
      return;
    }
    document.addEventListener(
      "visibilitychange",
      function onChange() {
        if (!document.hidden) {
          document.removeEventListener("visibilitychange", onChange);
          resolve();
        }
      },
      false,
    );
  });
}

function tierFromFps(fps: number): Tier {
  if (fps >= 50) return 2;
  if (fps >= 30) return 1;
  return 0;
}

/** Four or more cores always handle the CSS drift layers (tier 1); only
 *  the canvas tier is left to the measurement. */
function floorTier(t: Tier): Tier {
  const cores = navigator.hardwareConcurrency;
  return typeof cores === "number" && cores >= 4 && t < 1 ? 1 : t;
}

/**
 * Resolves once the page has reached a quiet point: after `load` (so the
 * measurement below never contends with the rest of the page's own
 * critical-path work -- other scripts evaluating, layout, first paint,
 * remaining network requests), then a further idle callback so it lands
 * after that too. Measured directly during development: running the
 * probe immediately, at this module's own top-level evaluation, produced
 * well under 30fps on an ordinary desktop Chrome that draws the exact
 * same synthetic load at 140fps+ once the page has settled -- the page
 * load itself was the competing cost, not (only) a concurrently-running
 * starfield ticker.
 */
function waitForQuietMoment(): Promise<void> {
  return new Promise((resolve) => {
    const onIdle = () => {
      const ric = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback;
      if (typeof ric === "function") {
        ric(() => resolve(), { timeout: 1000 });
      } else {
        setTimeout(resolve, 300);
      }
    };
    if (document.readyState === "complete") {
      onIdle();
    } else {
      window.addEventListener("load", onIdle, { once: true });
    }
  });
}

const MAX_MEASUREMENT_ATTEMPTS = 3;

async function probeTier(): Promise<Tier> {
  if (readDeclaredWeakSignal()) return 0;
  try {
    await waitForQuietMoment();
    let best: number | null = null;
    for (let attempt = 0; attempt < MAX_MEASUREMENT_ATTEMPTS + 1; attempt++) {
      await waitForVisible();
      const fps = await measureFrameRate();
      if (fps !== null) {
        // Contention (hydration, a late script) only ever lowers a reading,
        // so the better of two is the truer one. A first reading that is
        // already tier 2 needs no second.
        best = best === null ? fps : Math.max(best, fps);
        if (best >= 50 || attempt > 0) return floorTier(tierFromFps(best));
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      // The tab went hidden mid-measurement; loop back to waitForVisible()
      // and try again rather than caching a throttled reading. A device
      // stuck backgrounded for the whole session never gets a tier
      // decided, which is correct -- there is nothing meaningful to
      // measure until someone is actually looking at the page.
    }
    return floorTier(best === null ? 0 : tierFromFps(best)); // repeatedly interrupted
  } catch {
    return 0; // fail safe: a broken probe gets the cheapest tier, not the most expensive
  }
}

function applyTier(tier: Tier): void {
  document.documentElement.dataset.motionTier = String(tier);
  window.Motion?.setTier?.(tier);
}

function effectiveTier(measured: Tier): Tier {
  if (window.Motion?.isReduced?.()) return 0;
  // "Penuh" (see cosmos-router.js) is the explicit rescue for a device
  // whose FPS probe once measured low and got pinned there by the cache
  // below: without this, the tri-state toggle only ever reached the
  // reduced-motion axis, never this measured-capability one, so clicking
  // it did nothing for a session stuck at tier 0 or 1. isReduced() above
  // still wins over it in the (never co-selected) case both are somehow
  // true, since Kurangi/OS reduced-motion is a stated preference and
  // preferences outrank a capability override.
  if (window.CosmosRouter?.getMotionPref?.() === "penuh") return 2;
  return measured;
}

// The tier this device actually measures at, independent of reduced
// motion -- kept separate so effectiveTier() can recompute the combined
// result whenever reduced motion changes, without re-probing.
let measuredTier: Tier = 1;

function runProbe(): void {
  // Pessimistic interim (see the module header for why 1, not 2): CSS
  // drift shows immediately, the canvas stays uninitialised, and the
  // probe below measures with nothing else competing for the frame.
  applyTier(effectiveTier(measuredTier));
  void probeTier().then((tier) => {
    measuredTier = tier;
    writeCachedTier(tier);
    applyTier(effectiveTier(measuredTier));
  });
}

const cached = readCachedTier();
if (cached !== null) {
  measuredTier = cached;
  applyTier(effectiveTier(measuredTier));
} else {
  runProbe();
}

window.Motion?.onReducedChange?.(() => {
  applyTier(effectiveTier(measuredTier));
});

// P6.4/B10: cosmos-router.js's "Otomatis" setting calls this so a device
// stuck at a stale or wrong cached tier gets one fresh measurement on
// request, rather than only ever after the 7-day cache expiry above (see
// env.d.ts for the ambient type).
window.IrisMotionTier = {
  reprobe: () => {
    try {
      window.localStorage.removeItem(TIER_CACHE_KEY);
    } catch {
      // Storage disabled: nothing to clear, but the re-probe below still
      // runs and still applies for the rest of this page's life.
    }
    runProbe();
  },
};

// data-motion-tier on <html> does not reliably survive a ClientRouter
// swap -- the same reason cosmos-router.js re-applies data-scene on
// every astro:page-load rather than trusting it to persist. Reapplying
// the already-resolved tier here is cheap and does not re-probe, which
// would defeat the point of caching it once per device.
document.addEventListener("astro:page-load", () => {
  applyTier(effectiveTier(measuredTier));
});
