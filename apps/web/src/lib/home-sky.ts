/**
 * Where each group's star sits in Langit Lab. Points live in a 100 by 60 field; the pane stretches the
 * field across its width, so the layout spreads sideways. A golden-angle spiral inside a wide ellipse,
 * with no randomness: a group's star stays put between polls, and ten groups never overlap
 * (the old six-spot table wrapped and stacked them).
 */
export type StarPoint = { x: number; y: number };

const CX = 50;
const CY = 30;
const RX = 45;
const RY = 24;
const GOLDEN = 2.399963;
const TURN = 2; // radians; picked so ten groups keep 12 units apart

export function placeStars(n: number): StarPoint[] {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  if (count === 1) return [{ x: CX, y: CY }];
  const out: StarPoint[] = [];
  for (let k = 0; k < count; k++) {
    const r = Math.sqrt((k + 0.5) / count);
    const a = k * GOLDEN + TURN;
    out.push({ x: CX + RX * r * Math.cos(a), y: CY + RY * r * Math.sin(a) });
  }
  return out;
}

/**
 * Which stars the constellation lines join: the shortest tree over all of them (Prim's). Its lines are
 * short, never cross, and branch like a drawn constellation, where joining stars in spiral order
 * drew long lines straight through the others.
 */
export function placeLinks(pts: StarPoint[]): [number, number][] {
  const out: [number, number][] = [];
  if (pts.length < 2) return out;
  const inTree = new Set<number>([0]);
  while (inTree.size < pts.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < pts.length; j++) {
        if (inTree.has(j)) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    if (!best) break;
    out.push(best);
    inTree.add(best[1]);
  }
  return out;
}
