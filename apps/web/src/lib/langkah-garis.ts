/**
 * The module page's line stepper (Phase 21, f1): one dot per step on a
 * line, the same in every mode.
 *
 * - selesai: finished (a check), kini: the step on screen, buka: open,
 *   kunci: locked behind an unfinished step, tunggu: waiting on its own
 *   clock (TP before its window, Module 4's hunt before it starts). A
 *   waiting step never locks the ones after it.
 */
import type { StepId } from "../components/module/useLangkah";

export type Titik = "selesai" | "kini" | "buka" | "kunci" | "tunggu";

/** Each step's dot: the current one is "kini"; tunggu wins over kunci. */
export function titikLangkah(
  steps: StepId[],
  kini: StepId,
  tahu: {
    selesai: (s: StepId) => boolean;
    terbuka: (s: StepId) => boolean;
    tunggu: (s: StepId) => boolean;
  },
): Titik[] {
  return steps.map((s) =>
    s === kini
      ? "kini"
      : tahu.tunggu(s)
        ? "tunggu"
        : !tahu.terbuka(s)
          ? "kunci"
          : tahu.selesai(s)
            ? "selesai"
            : "buka",
  );
}

/** How far the line is filled, 0 to 1: up to the furthest of the current
 *  dot and the step after the last finished one. */
export function isiGaris(titik: Titik[]): number {
  if (titik.length < 2) return 0;
  const kini = titik.indexOf("kini");
  const akhir = titik.lastIndexOf("selesai");
  const sampai = Math.max(kini, akhir < 0 ? 0 : Math.min(titik.length - 1, akhir + 1));
  return sampai / (titik.length - 1);
}

/**
 * The steps Prev and Next open from `kini`, passing over any step `lewat`
 * names (a TP whose window is not open), so their labels name where they go.
 */
export function tetangga(
  steps: StepId[],
  kini: StepId,
  lewat: (s: StepId) => boolean,
): { prev: StepId | null; next: StepId | null } {
  const i = steps.indexOf(kini);
  return {
    prev:
      steps
        .slice(0, Math.max(0, i))
        .reverse()
        .find((s) => !lewat(s)) ?? null,
    next: steps.slice(i + 1).find((s) => !lewat(s)) ?? null,
  };
}
