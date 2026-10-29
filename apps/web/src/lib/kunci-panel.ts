/**
 * The key of the module page's step panel (ModuleSteps' Fade). A new key
 * rebuilds everything inside, which is the fade between steps, but the TP
 * step holds a Praktikan's picked pages and a running send, so it must
 * not be rebuilt when the mode flips (their session starting or ending).
 */
export function kunciPanel(step: string, mode: string): string {
  return step === "tp" ? step : `${step}-${mode}`;
}
