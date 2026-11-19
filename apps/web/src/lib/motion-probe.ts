/**
 * When the frame-rate probe (scripts/motion-tier.ts) is worth running.
 *
 * effectiveTier() there ignores the measurement at Low Detail (always tier 0) and at High Detail (always
 * tier 2); only Normal takes the measured tier. The probe draws 180 sprites per frame for 400 ms on the main
 * thread, which showed up as ~100 ms inside the page load on a 6x slower CPU. So it runs only when Normal is
 * the level in force and nothing measured or cached is in hand, and again if the reader later switches to
 * Normal.
 */
export function probeNeeded(detail: string | undefined, haveMeasurement: boolean): boolean {
  return !haveMeasurement && (detail ?? "normal") === "normal";
}
