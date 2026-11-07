/**
 * The seat's violation points, read from what is stored (9 Nov 2026). The one place the API turns
 * rec_strike rows and the strikes past the cap into points, so the page's answer to a strike and
 * the pengawas' answer to a forgiveness agree. The rules themselves are in
 * src/lib/recruitment/violations.ts.
 */
import { and, eq } from "drizzle-orm";
import { recStrike } from "../../src/lib/schema.js";
import type { PartKey, ViolationRules } from "../../src/lib/recruitment/exam-types.js";
import { countedPoints, suggestedCut, warnLevel } from "../../src/lib/recruitment/violations.js";
import type { Db } from "./recruitment-data.js";

export interface SeatPoints {
  points: number;
  level: number;
  cut: number;
}

/** A seat's counted points in one part: forgiven strikes count nothing, overflow counts 1 each. */
export async function poinKursi(
  db: Db,
  seatId: number,
  part: PartKey,
  overflow: number,
  rules: ViolationRules,
): Promise<SeatPoints> {
  const list = await db
    .select({ kinds: recStrike.kinds, excusedAt: recStrike.excusedAt })
    .from(recStrike)
    .where(and(eq(recStrike.seatId, seatId), eq(recStrike.part, part)));
  const points = countedPoints(
    list.map((x) => ({ kinds: x.kinds ?? [], excused: !!x.excusedAt })),
    overflow,
    rules,
  );
  return { points, level: warnLevel(points, rules), cut: suggestedCut(points, rules) };
}
