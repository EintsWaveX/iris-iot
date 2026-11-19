#!/usr/bin/env node
/**
 * Render harness (Phase 0 of the performance work): drives a real Chrome through a list of pages at a
 * chosen device, detail level and sign-in state, runs the on-device benchmark (window.__irisPerf, loaded
 * by ?perf=1, see src/scripts/perf-bench.ts) on each page and writes one JSON report plus a readable
 * table. It is the same code a phone runs by opening any page with ?perf=1, so the two can be compared.
 *
 *   npm i --no-save playwright-core          rig-only, like pg: not in package.json on purpose
 *   node scripts/render-harness.mjs http://127.0.0.1:4173 --pages home,dashboard --as praktikan --detail ldm
 *
 * base        a preview of the production build (npm run build, npx astro preview --port 4173) or the live
 *             site. Do NOT use `astro dev`: its unbundled modules make every number meaningless.
 * --pages     comma list of pages, "home" is / (default home,login,modules/1,recruitment). Write them without
 *             a leading slash: Git Bash turns a bare "/" argument into a Windows path.
 * --as        visitor | praktikan | asisten (default visitor). Every /api/ call is answered by a mock in the
 *             browser, so nothing reaches a real backend and no real person's data is used. The mocks are
 *             thin: Home and Dashboard shells render, data-heavy pages stay mostly empty.
 * --detail    ldm | normal | hd (default ldm, the setting of the reported phone)
 * --theme     dark | light (default dark)
 * --device    phone (390x844 @2.625, touch, default) | laptop (1280x720 @1)
 * --cpu       CPU slowdown factor (default 6; 1 = none). It does not slow the GPU, see the note below.
 * --idle, --scroll   ms per window (default 2500 each)
 * --only      comma list of switch ids (default all), e.g. baseline,no-backdrop,no-motion
 * --label     file label (default <as>-<detail>-<device>-cpu<N>)
 * --out       report path (default perf/render-<label>.json)
 * --headless  run without a window (default is a visible window, so the real GPU is used)
 * --chrome    path to a Chrome/Chromium executable (default: the installed Chrome)
 *
 * Read the numbers with these limits in mind, the plan says so too:
 * - CPU throttling does not throttle the GPU. Blur and fill-rate cost is mostly GPU on a real phone, so a
 *   laptop run under-reports it. The report names the GL renderer: "SwiftShader" or "llvmpipe" means
 *   software rendering, which exaggerates GPU effects. The real phone (?perf=1) outranks this harness.
 * - A window the OS hides or covers is held to about one frame a second. The benchmark flags those steps
 *   as THROTTLED; keep the window in front, or use --headless.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { formatReport } from "../src/lib/perf-stats.ts";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};

const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("Give a base URL, e.g. http://127.0.0.1:4173 (a preview of the production build).");
  process.exit(2);
}
if (/:(4321|4399)\b/.test(BASE) || /astro dev/i.test(process.env.npm_lifecycle_script ?? "")) {
  console.error(
    "That looks like the dev server. Dev numbers are meaningless; build and preview instead.",
  );
  process.exit(2);
}

const PAGES = opt("--pages", "home,login,modules/1,recruitment")
  .split(",")
  .map((p) => (p === "home" ? "/" : p.startsWith("/") ? p : `/${p}`));
// Git Bash (MSYS) rewrites an argument like "/" into "C:/Program Files/Git/" before node sees it
const mangled = PAGES.find((p) => /^\/[A-Za-z]:/.test(p) || /Program Files/i.test(p));
if (mangled) {
  console.error(
    `"${mangled}" is a Windows path, not a page: Git Bash rewrote the argument. Write the pages as "home,dashboard" (no leading slash) or run with MSYS_NO_PATHCONV=1.`,
  );
  process.exit(2);
}
const AS = opt("--as", "visitor");
const DETAIL = opt("--detail", "ldm");
const THEME = opt("--theme", "dark");
const DEVICE = opt("--device", "phone");
const CPU = Number(opt("--cpu", "6"));
const IDLE = Number(opt("--idle", "2500"));
const SCROLL = Number(opt("--scroll", "2500"));
const ONLY = opt("--only", "").split(",").filter(Boolean);
const LABEL = opt("--label", `${AS}-${DETAIL}-${DEVICE}-cpu${CPU}`);
const OUT = opt("--out", `perf/render-${LABEL}.json`);

for (const [name, ok] of [
  ["--as", ["visitor", "praktikan", "asisten"].includes(AS)],
  ["--detail", ["ldm", "normal", "hd"].includes(DETAIL)],
  ["--theme", ["dark", "light"].includes(THEME)],
  ["--device", ["phone", "laptop"].includes(DEVICE)],
  ["--cpu", Number.isFinite(CPU) && CPU >= 1 && CPU <= 20],
]) {
  if (!ok) {
    console.error(`Bad value for ${name}.`);
    process.exit(2);
  }
}

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core is missing. Run: npm i --no-save playwright-core");
  process.exit(2);
}

const DEVICES = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  laptop: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

// ---------- Mocked API ----------

const ME = {
  praktikan: {
    ok: true,
    role: "praktikan",
    nim: "101022300000",
    nama: "Uji Praktikan",
    kelompok: 1,
    kode: "UJI",
  },
  asisten: {
    ok: true,
    role: "asisten",
    nim: "101022300001",
    nama: "Uji Asisten",
    kode: "UJA",
    tier: "asisten",
    badges: [],
    kodeDivisi: "ASO",
    hak: { own: true, pair: "own" },
  },
};
// The empty list answers pages read before they draw (HomePage, Dashboard, ModuleCards)
const EMPTY = {
  ok: true,
  praktikum: [],
  modul: [],
  list: [],
  bantu: [],
  permintaan: [],
  tawaran: [],
  perluNilai: [],
  belumKirim: [],
};

function answer(url) {
  const p = new URL(url).pathname;
  if (p === "/api/auth/me") {
    return AS === "visitor" ? { status: 401, body: { ok: false } } : { status: 200, body: ME[AS] };
  }
  if (p === "/api/recruitment/banner") return { status: 200, body: { ok: true, kind: "none" } };
  if (p.startsWith("/api/recruitment/") || p.startsWith("/api/profil/")) {
    return { status: 404, body: { ok: false } };
  }
  return { status: 200, body: EMPTY };
}

// ---------- Run ----------

const browser = await chromium.launch({
  headless: flag("--headless"),
  ...(opt("--chrome", "") ? { executablePath: opt("--chrome", "") } : { channel: "chrome" }),
  args: [
    // A covered or minimised window is otherwise throttled to ~1 frame a second and the numbers are void
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
  ],
});

const context = await browser.newContext({
  ...DEVICES[DEVICE],
  colorScheme: THEME,
  serviceWorkers: "block",
});

await context.addInitScript(
  ([detail, theme, signedIn]) => {
    try {
      localStorage.setItem("iris-detail", detail);
      localStorage.setItem("iris-theme", theme);
      if (signedIn) localStorage.setItem("iris-pernah-masuk", "1");
    } catch {
      /* storage blocked: the page falls back to its defaults */
    }
  },
  [DETAIL, THEME, AS !== "visitor"],
);

await context.route("**/api/**", (route) => {
  const a = answer(route.request().url());
  return route.fulfill({
    status: a.status,
    contentType: "application/json",
    body: JSON.stringify(a.body),
  });
});

const out = {
  harness: 1,
  at: new Date().toISOString(),
  base: BASE,
  as: AS,
  detail: DETAIL,
  theme: THEME,
  device: DEVICE,
  cpu: CPU,
  gl: null,
  chrome: browser.version(),
  pages: {},
};

for (const path of PAGES) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  try {
    await page.goto(`${BASE}${path}?perf=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof window.__irisPerf?.run === "function", null, {
      timeout: 30_000,
    });
    if (AS !== "visitor") {
      await page.waitForFunction(() => document.documentElement.dataset.masuk === "yes", null, {
        timeout: 15_000,
      });
    }
    await page.waitForTimeout(2000); // islands hydrate and the first fetches settle
    if (!out.gl) {
      out.gl = await page.evaluate(() => {
        const g = document.createElement("canvas").getContext("webgl");
        const x = g?.getExtension("WEBGL_debug_renderer_info");
        return g && x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : "unknown";
      });
    }
    const report = await page.evaluate((o) => window.__irisPerf.run(o), {
      idleMs: IDLE,
      scrollMs: SCROLL,
      only: ONLY.length ? ONLY : undefined,
    });
    out.pages[path] = report;
    console.log(`\n=== ${path} (${AS}, ${DETAIL}, ${DEVICE}, cpu x${CPU}) ===`);
    console.log(formatReport(report));
  } catch (e) {
    out.pages[path] = { error: String(e?.message ?? e) };
    console.error(`\n=== ${path} FAILED: ${String(e?.message ?? e).split("\n")[0]}`);
  } finally {
    await page.close();
  }
}

console.log(`\nGL renderer: ${out.gl}`);
if (/swiftshader|llvmpipe|software/i.test(String(out.gl))) {
  console.log(
    "Software rendering: GPU effects (blur, fill) are exaggerated. Trust the phone over this.",
  );
}
await browser.close();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
