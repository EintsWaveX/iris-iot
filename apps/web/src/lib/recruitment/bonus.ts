/**
 * How many bonus questions a seat is offered, and what each is worth (4 Nov 2026, the Akademik's
 * rule). Pure and browser safe: the API works it out from the seat's own answers, the page only
 * shows the numbers it is given.
 *
 *   bonus = floor(time left / time per question) + (questions fully right) - (questions answered wrong)
 *
 * clamped to 0 .. every question of the part the seat was not dealt. A part of 20 minutes with 20
 * questions shown is 1 minute a question: 13 min 7 s left, 12 right and 8 wrong gives 13 + 12 - 8 =
 * 17. A question left blank is neither right nor wrong. Each bonus question is worth half of a
 * normal one (bonusWorth, scoring.ts), and the bonuses are drawn at random from the rest.
 */

export interface BonusQuote {
  /** Questions the seat was not dealt, so the most it can get */
  rest: number;
  /** Whole question-lengths of time left */
  time: number;
  /** Dealt questions answered fully right */
  correct: number;
  /** Dealt questions answered, but not fully right */
  wrong: number;
  /** What the seat gets */
  quota: number;
}

/** A bonus question is worth 1 / BONUS_OVER of a normal one (half). */
export const BONUS_OVER = 2;
export const BONUS_SHARE = 1 / BONUS_OVER;

/** A bonus problem's points: half of its normal worth, never below 1. */
export const bonusWorth = (points: number) => Math.max(1, Math.round(points * BONUS_SHARE));

export function bonusQuota(i: {
  leftMs: number;
  /** The part's planned time over the questions a seat is shown, ms */
  perQuestionMs: number;
  correct: number;
  wrong: number;
  rest: number;
}): BonusQuote {
  const time = i.perQuestionMs > 0 ? Math.floor(Math.max(0, i.leftMs) / i.perQuestionMs) : 0;
  const quota = Math.min(Math.max(0, time + i.correct - i.wrong), Math.max(0, i.rest));
  return { rest: i.rest, time, correct: i.correct, wrong: i.wrong, quota };
}
