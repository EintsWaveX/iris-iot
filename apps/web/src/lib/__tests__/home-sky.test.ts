import { describe, expect, it } from "vitest";
import { placeLinks, placeStars } from "../home-sky";

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

  describe("placeLinks", () => {
    const cross = (a: [number, number], b: [number, number], q: { x: number; y: number }[]) => {
      const o = (
        p: { x: number; y: number },
        r: { x: number; y: number },
        s: { x: number; y: number },
      ) => Math.sign((r.x - p.x) * (s.y - p.y) - (r.y - p.y) * (s.x - p.x));
      if (a.some((i) => b.includes(i))) return false;
      const [p1, p2, p3, p4] = [q[a[0]], q[a[1]], q[b[0]], q[b[1]]];
      return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2);
    };

    it("joins every star with one line fewer than there are stars", () => {
      expect(placeLinks(placeStars(0))).toEqual([]);
      expect(placeLinks(placeStars(1))).toEqual([]);
      for (let n = 2; n <= 12; n++) {
        const links = placeLinks(placeStars(n));
        expect(links).toHaveLength(n - 1);
        expect(new Set(links.flat()).size).toBe(n);
      }
    });

    it("never draws two lines across each other", () => {
      for (let n = 3; n <= 12; n++) {
        const pts = placeStars(n);
        const links = placeLinks(pts);
        for (let i = 0; i < links.length; i++)
          for (let j = i + 1; j < links.length; j++)
            expect(cross(links[i], links[j], pts)).toBe(false);
      }
    });
  });
});
