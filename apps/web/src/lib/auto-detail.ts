/**
 * The speed watcher's verdict (scripts/auto-detail.ts), kept free of the DOM so it can be tested.
 *
 * Otomatis starts a device at Normal (public/theme-init.js). Then it watches real frames on the real page and,
 * if the page is slow, drops the device to Low Detail for two weeks. It only ever steps DOWN: High Detail stays a
 * choice, and a reader's own choice is never overridden.
 */
import { percentile } from "./perf-stats";

/** Frame time at the 75th percentile above which a page counts as slow: under 30 fps for most frames */
export const SLOW_P75_MS = 33.4;
/** Frames a 3 s window needs to be judged by its percentile (30 = 10 fps); fewer is itself slow */
export const MIN_FRAMES = 30;
/** A gap this long between two frames means the browser throttled the tab: the window says nothing about the device */
export const THROTTLED_GAP_MS = 500;

export type WindowVerdict = "slow" | "fine" | "unreadable";

/** One sampling window's verdict from its frame deltas (ms between rAF callbacks, first one excluded) */
export function judgeWindow(deltas: readonly number[]): WindowVerdict {
  if (deltas.length === 0 || Math.max(...deltas) >= THROTTLED_GAP_MS) return "unreadable";
  // A 3 s window with fewer than 30 frames is under 10 fps and no gap was a throttle: that is a slow device
  if (deltas.length < MIN_FRAMES) return "slow";
  const sorted = [...deltas].sort((a, b) => a - b);
  return percentile(sorted, 75) > SLOW_P75_MS ? "slow" : "fine";
}

/** The plain-language toast when the watcher demotes a device */
export const DEMOTED_TOAST: Record<"id" | "en" | "zh", string> = {
  id: "Halaman ini terasa berat di perangkatmu, jadi latarnya diturunkan ke Low Detail. Bisa diubah lagi di Tampilan.",
  en: "This page felt heavy on your device, so the background went down to Low Detail. You can change it in Display.",
  zh: "此页面在你的设备上比较卡，已将背景降为低细节。可在“显示”中更改。",
};
