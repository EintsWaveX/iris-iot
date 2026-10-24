/**
 * Exact fractions for the exam (EXAM-ENGINE 4.1). Every credit, weight and
 * ratio is one of these, so the API, the Cutting board and the tests never
 * disagree by a point. Always reduced, with the sign on the numerator.
 */

export interface Frac {
  readonly n: bigint;
  readonly d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** n/d reduced. A zero denominator throws. */
export function frac(n: bigint | number, d: bigint | number = 1n): Frac {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new RangeError("frac: zero denominator");
  if (dd < 0n) [nn, dd] = [-nn, -dd];
  const g = gcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}

export const ZERO: Frac = frac(0);
export const ONE: Frac = frac(1);

export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
export const sum = (xs: readonly Frac[]) => xs.reduce(add, ZERO);

/** -1, 0 or 1. */
export function cmp(a: Frac, b: Frac): -1 | 0 | 1 {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}

export const eq = (a: Frac, b: Frac) => cmp(a, b) === 0;
export const isOne = (a: Frac) => a.n === a.d;
export const maxFrac = (xs: readonly Frac[]) => xs.reduce((m, x) => (cmp(x, m) > 0 ? x : m));

/** round(cap × r), a half going up: floor((2·cap·n + d) / (2·d)). For r ≥ 0. */
export function roundHalfUp(cap: number, r: Frac): number {
  const c = BigInt(cap);
  return Number((2n * c * r.n + r.d) / (2n * r.d));
}

/** "n/d", or "n" for a whole number: the form the score freeze stores. */
export const fracText = (a: Frac) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);

export function parseFrac(s: string): Frac {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(s.trim());
  if (!m) throw new RangeError(`parseFrac: ${s}`);
  return frac(BigInt(m[1]), BigInt(m[2] ?? "1"));
}
