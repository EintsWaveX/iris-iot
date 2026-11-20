import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sceneHTML, skyBits, type SpriteSet } from "../../scripts/cosmos/painters";
import {
  birdX,
  petalAlpha,
  phase,
  shootAt,
  sparkleAlpha,
  sparkleSize,
  swell,
} from "../../scripts/cosmos/sky-motion";

/**
 * The sparkles, petals, birds and shooting star moved from ~60 animated elements to two canvases (performance
 * work, Nov 2026: at High Detail on a laptop they cost more than the whole rest of the sky). These hold that the
 * canvases follow the same numbers the keyframes had, and that the elements and keyframes did not come back.
 */

describe("phase", () => {
  it("is 0 to 1 and handles the negative delays the scene data uses", () => {
    expect(phase(0, 4)).toBe(0);
    expect(phase(1, 4)).toBe(0.25);
    expect(phase(0, 4, -1)).toBe(0.25); // started 1 s ago
    expect(phase(0, 4, -5)).toBe(0.25);
    expect(phase(3.9, 4, 0)).toBeCloseTo(0.975, 5);
    for (const t of [-7, 0, 1.3, 99.9]) {
      const p = phase(t, 3.3, -2.2);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe("sparkles", () => {
  it("swell 0.65x at 0.2 opacity, 1.2x at 1 opacity half a cycle later (the old scene-tw keyframes)", () => {
    const s = { t: 4, dl: 0 };
    expect(swell(0, s)).toBeCloseTo(0, 6);
    expect(swell(2, s)).toBeCloseTo(1, 6);
    expect(swell(4, s)).toBeCloseTo(0, 6);
    expect(sparkleSize(10, 0)).toBeCloseTo(6.5, 6);
    expect(sparkleSize(10, 1)).toBeCloseTo(12, 6);
    expect(sparkleAlpha(0)).toBeCloseTo(0.2, 6);
    expect(sparkleAlpha(1)).toBeCloseTo(1, 6);
  });
});

describe("petals", () => {
  it("fade in over the first 12 % and out over the last 12 %", () => {
    expect(petalAlpha(0)).toBe(0);
    expect(petalAlpha(0.06)).toBeCloseTo(0.45, 6);
    expect(petalAlpha(0.12)).toBeCloseTo(0.9, 6);
    expect(petalAlpha(0.5)).toBeCloseTo(0.9, 6);
    expect(petalAlpha(0.94)).toBeCloseTo(0.45, 6);
    expect(petalAlpha(1)).toBe(0);
  });
});

describe("birds and the shooting star", () => {
  it("a bird crosses from 8 % left of the screen to 117 % of its width", () => {
    expect(birdX(0)).toBeCloseTo(-0.08, 6);
    expect(birdX(1)).toBeCloseTo(1.17, 6);
  });
  it("the shooting star waits 3 s, flies for 78 % of 11 s, then rests", () => {
    expect(shootAt(0).alpha).toBe(0);
    expect(shootAt(2.9).alpha).toBe(0);
    expect(shootAt(3 + 11 * 0.3).alpha).toBe(1);
    expect(shootAt(3 + 11 * 0.3).run).toBeCloseTo(0.3 / 0.78, 6);
    expect(shootAt(3 + 11 * 0.9).alpha).toBe(0);
    expect(shootAt(3 + 11 * 0.9).run).toBe(1);
    expect(shootAt(3 + 11 + 11 * 0.3).alpha).toBe(1); // and again the next cycle
  });
});

describe("skyBits", () => {
  it("is the same every time (the sky must not reshuffle between page loads)", () => {
    expect(skyBits("night")).toEqual(skyBits("night"));
    expect(skyBits("day")).toEqual(skyBits("day"));
  });
  it("keeps the counts: 38 sparkles, 18 petals, birds by day and a shooting star by night", () => {
    const n = skyBits("night");
    const d = skyBits("day");
    expect([n.spk.length, n.pet.length, n.birds.length, n.shoot]).toEqual([38, 18, 0, true]);
    expect([d.spk.length, d.pet.length, d.birds.length, d.shoot]).toEqual([38, 18, 3, false]);
  });
  it("puts every sparkle in the top 62 % and every petal in the top 40 % of the screen", () => {
    for (const T of ["night", "day"] as const) {
      const b = skyBits(T);
      for (const s of b.spk) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThan(1);
        expect(s.y).toBeLessThan(0.62);
        expect(s.dl).toBeLessThanOrEqual(0);
      }
      for (const p of b.pet) expect(p.y).toBeLessThan(0.4);
    }
  });
});

describe("the scene no longer carries them as elements", () => {
  const fake = new Proxy({}, { get: () => ({ url: "x", w: 100, h: 50 }) }) as SpriteSet;
  for (const T of ["night", "day"] as const) {
    it(`${T}: two canvases (behind the islands, in front of them), no .spk .petal .bird .shoot`, () => {
      const html = sceneHTML(T, fake);
      expect(html).not.toMatch(/class="(spk|petal|bird|shoot)"/);
      const back = html.indexOf('class="fx fx-back"');
      const front = html.indexOf('class="fx fx-front"');
      const firstSprite = html.indexOf('class="sp ');
      const lastSprite = html.lastIndexOf('class="sp ');
      expect(back).toBeGreaterThan(-1);
      expect(back).toBeLessThan(firstSprite);
      expect(front).toBeGreaterThan(lastSprite);
    });
  }

  it("scene.css has none of their rules or keyframes", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../../styles/scene.css", import.meta.url)),
      "utf8",
    );
    expect(css).not.toMatch(/\.(spk|petal|bird|shoot)\b/);
    expect(css).not.toMatch(/@keyframes scene-(tw|petal|fly|flap-[lr]|shoot)\b/);
  });
});
