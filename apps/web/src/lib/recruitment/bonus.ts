/**
 * How many bonus questions a seat is offered, and what each is worth (4 Nov 2026, the Akademik's
 * rule). Pure and browser safe: the API works it out from the seat's own answers, the page only
 * shows the numbers it is given.
 *
 *   bonus = floor(time left / time per question) + (questions fully right)
 *           - (questions answered wrong) - (questions left blank)
 *
 * clamped to 0 .. every question of the part the seat was not dealt. A part of 20 minutes with 20
 * questions shown is 1 minute a question: 13 min 7 s left, 12 right, 8 wrong and none blank gives
 * 13 + 12 - 8 - 0 = 17. A question left blank counts as -1, like a wrong one (user, 2026-11-07:
 * handing in an empty part used to keep the whole time bonus). Blank questions do not take
 * anything from the part's own score. Each bonus question is worth half of a normal one
 * (bonusWorth, scoring.ts), and the bonuses are drawn at random from the rest.
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
  /** Dealt questions left blank (never answered, or answered with nothing) */
  blank: number;
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
  blank: number;
  rest: number;
}): BonusQuote {
  const time = i.perQuestionMs > 0 ? Math.floor(Math.max(0, i.leftMs) / i.perQuestionMs) : 0;
  const quota = Math.min(
    Math.max(0, time + i.correct - i.wrong - Math.max(0, i.blank)),
    Math.max(0, i.rest),
  );
  return {
    rest: i.rest,
    time,
    correct: i.correct,
    wrong: i.wrong,
    blank: Math.max(0, i.blank),
    quota,
  };
}
