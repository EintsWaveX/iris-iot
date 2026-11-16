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
