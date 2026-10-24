import { describe, expect, it } from "vitest";
import { motionLevel } from "../recruitment/motion-level";

describe("the reveal's motion level", () => {
  it("reduced motion always gets the still version", () => {
    for (const detail of ["ldm", "normal", "hd"] as const)
      for (const tier of [0, 1, 2] as const)
        expect(motionLevel({ reduced: true, tier, detail })).toBe("reduce");
  });

  it("Low Detail, the default, gets the lighter animated version, not the still one", () => {
    // Low Detail is tier 0 in the site's tier probe, so the tier alone must not decide.
    expect(motionLevel({ reduced: false, tier: 0, detail: "ldm" })).toBe("ldm");
  });

  it("a weak device in Normal or High Detail also gets the lighter version", () => {
    expect(motionLevel({ reduced: false, tier: 0, detail: "normal" })).toBe("ldm");
    expect(motionLevel({ reduced: false, tier: 0, detail: "hd" })).toBe("ldm");
  });

  it("Normal and High Detail on a capable device get the full version", () => {
    expect(motionLevel({ reduced: false, tier: 1, detail: "normal" })).toBe("full");
    expect(motionLevel({ reduced: false, tier: 2, detail: "hd" })).toBe("full");
  });

  it("Low Detail is the lighter version even when the probe measured high", () => {
    expect(motionLevel({ reduced: false, tier: 2, detail: "ldm" })).toBe("ldm");
  });
});
