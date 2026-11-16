import { describe, expect, it } from "vitest";
import { placeStars } from "../home-sky";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("placeStars", () => {
  it("returns n points, and none for zero or fewer", () => {
    expect(placeStars(0)).toEqual([]);
    expect(placeStars(-3)).toEqual([]);
    for (let n = 1; n <= 12; n++) expect(placeStars(n)).toHaveLength(n);
  });

  it("keeps every point inside the field (x 4 to 96, y 6 to 54 of a 100 by 60 field)", () => {
    for (let n = 1; n <= 12; n++) {
      for (const p of placeStars(n)) {
        expect(p.x).toBeGreaterThanOrEqual(4);
        expect(p.x).toBeLessThanOrEqual(96);
        expect(p.y).toBeGreaterThanOrEqual(6);
        expect(p.y).toBeLessThanOrEqual(54);
      }
    }
  });

  it("never lets two stars sit closer than 12 units for up to ten groups, 10 units up to twelve", () => {
    for (let n = 2; n <= 12; n++) {
      const pts = placeStars(n);
      let min = Infinity;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) min = Math.min(min, dist(pts[i], pts[j]));
      expect(min).toBeGreaterThanOrEqual(n <= 10 ? 12 : 10);
    }
  });

  it("is deterministic, so a group's star stays where the group last saw it", () => {
    expect(placeStars(7)).toEqual(placeStars(7));
  });

  it("puts a lone group in the middle", () => {
    expect(placeStars(1)).toEqual([{ x: 50, y: 30 }]);
  });
});
