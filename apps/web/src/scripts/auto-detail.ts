/**
 * The speed watcher behind Otomatis. If the reader's Detail choice is Otomatis and the device is running at
 * Normal, this watches real frames on the real page once the page has settled, and when they are slow it
 * drops the device to Low Detail for two weeks (IrisPrefs.demote) and says so in a toast.
 *
 * Why watch instead of probing: a synthetic canvas test cannot see what makes a phone slow (compositing, blur,
 * repaint), and it cost 100 ms of main thread inside the page load. Real frames of the real page can.
 *
 *   - Only when the choice is Otomatis and the level in force is Normal. A reader's own choice is never overridden,
 *     and nothing steps UP: High Detail stays a choice.
 *   - Two 3 s windows, 4 s and 25 s after the page loaded (a hydrating page is not the device). One slow window is
 *     enough to demote; a window in which the tab was hidden or throttled says nothing and is retried once.
 *   - It samples with requestAnimationFrame deltas only, so it adds no work per frame.
 */
import { DEMOTED_TOAST, judgeWindow } from "../lib/auto-detail";

const WINDOW_MS = 3000;
const FIRST_AFTER_LOAD_MS = 4000;
const SECOND_AFTER_LOAD_MS = 25000;

const html = document.documentElement;

const watching = () =>
  window.IrisPrefs?.detailPref() === "auto" && html.dataset.detail === "normal";

function sample(): Promise<number[] | null> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (document.hidden) return resolve(null);
      if (last) deltas.push(now - last);
      last = now;
      if (now - start < WINDOW_MS) requestAnimationFrame(tick);
      else resolve(deltas);
    };
    requestAnimationFrame(tick);
  });
}

function lang(): "id" | "en" | "zh" {
  const l = html.lang;
  return l === "en" || l === "zh" ? l : "id";
}

/** The toast island hydrates when the page is idle, which on a slow device can be many seconds; a toast raised before
 *  that is dropped after a few seconds, so wait for the island (up to 30 s) before saying anything. */
async function toastReady(): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    const island = document.querySelector('astro-island[component-url*="Toast"]');
    if (island && !island.hasAttribute("ssr")) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function run() {
  for (const after of [FIRST_AFTER_LOAD_MS, SECOND_AFTER_LOAD_MS]) {
    await new Promise((r) => setTimeout(r, after));
    // A hidden tab: wait until someone looks at the page, then measure
    while (document.hidden) await new Promise((r) => setTimeout(r, 1000));
    if (!watching()) return;
    const deltas = await sample();
    if (!deltas) continue;
    const verdict = judgeWindow(deltas);
    if (verdict === "slow") {
      if (!watching()) return;
      window.IrisPrefs?.demote();
      window.IrisMotionTier?.reapply();
      window.dispatchEvent(new Event("iris-prefs"));
      if (await toastReady()) window.Toast?.show(DEMOTED_TOAST[lang()], "info", { duration: 9000 });
      return;
    }
  }
}

function begin() {
  if (!watching()) return;
  void run();
}

// After the page itself has loaded: a window during hydration measures the load, not the device
if (document.readyState === "complete") begin();
else window.addEventListener("load", begin, { once: true });
