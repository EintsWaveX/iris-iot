/**
 * Which version of the envelope reveal (and the small motions around it) a
 * visitor gets. Reduced motion is a stated preference and always wins. Low
 * Detail, the site default, is tier 0 in the tier probe (scripts/motion-tier.ts),
 * so the tier alone cannot tell Low Detail from reduced motion: the preference
 * is read first, and tier 0 without it only ever means the lighter version.
 */
export type MotionLevel = "full" | "ldm" | "reduce";

export function motionLevel(o: {
  reduced: boolean;
  tier: 0 | 1 | 2;
  detail: "ldm" | "normal" | "hd";
}): MotionLevel {
  if (o.reduced) return "reduce";
  return o.detail === "ldm" || o.tier === 0 ? "ldm" : "full";
}
