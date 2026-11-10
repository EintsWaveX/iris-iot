/**
 * The exam page's guard against a click lock nobody owns (lib/recruitment/unstick.ts).
 */
import { describe, expect, it } from "vitest";
import {
  OPEN_MODAL_SELECTOR,
  UNSTICK_NEEDED,
  looksOrphaned,
  nextUnstick,
} from "../recruitment/unstick";

const orphan = { bodyPointerEvents: "none", modalsOpen: 0 };

describe("looksOrphaned", () => {
  it("is a body lock with no modal open", () => {
    expect(looksOrphaned(orphan)).toBe(true);
  });
  it("is not a lock a modal owns", () => {
    expect(looksOrphaned({ bodyPointerEvents: "none", modalsOpen: 1 })).toBe(false);
    expect(looksOrphaned({ bodyPointerEvents: "none", modalsOpen: 3 })).toBe(false);
  });
  it("is not a body that takes clicks", () => {
    expect(looksOrphaned({ bodyPointerEvents: "", modalsOpen: 0 })).toBe(false);
    expect(looksOrphaned({ bodyPointerEvents: "auto", modalsOpen: 0 })).toBe(false);
  });
});

describe("nextUnstick", () => {
  it("clears only after the lock was seen several times in a row", () => {
    let streak = 0;
    for (let i = 1; i < UNSTICK_NEEDED; i++) {
      const r = nextUnstick(streak, orphan);
      expect(r.clear, `check ${i}`).toBe(false);
      streak = r.streak;
    }
    const last = nextUnstick(streak, orphan);
    expect(last.clear).toBe(true);
    expect(last.streak).toBe(0);
  });
  it("starts over when a modal opens or the body takes clicks again", () => {
    let s = nextUnstick(0, orphan);
    expect(s.streak).toBe(1);
    s = nextUnstick(s.streak, { bodyPointerEvents: "none", modalsOpen: 1 });
    expect(s).toEqual({ clear: false, streak: 0 });
    s = nextUnstick(nextUnstick(0, orphan).streak, { bodyPointerEvents: "", modalsOpen: 0 });
    expect(s).toEqual({ clear: false, streak: 0 });
  });
  it("never clears a lock a dialog is part way through opening or closing", () => {
    // The dialog shows up in some checks and not in others: no run is long enough
    let streak = 0;
    for (let i = 0; i < 20; i++) {
      const r = nextUnstick(streak, { bodyPointerEvents: "none", modalsOpen: i % 2 });
      expect(r.clear).toBe(false);
      streak = r.streak;
    }
  });
  it("keeps clearing if the lock comes back", () => {
    let streak = 0;
    let cleared = 0;
    for (let i = 0; i < UNSTICK_NEEDED * 3; i++) {
      const r = nextUnstick(streak, orphan);
      if (r.clear) cleared += 1;
      streak = r.streak;
    }
    expect(cleared).toBe(3);
  });
});

describe("OPEN_MODAL_SELECTOR", () => {
  it("names only layers that are open", () => {
    expect(OPEN_MODAL_SELECTOR).toContain('[role="dialog"][data-state="open"]');
    expect(OPEN_MODAL_SELECTOR).toContain('[role="alertdialog"][data-state="open"]');
    expect(OPEN_MODAL_SELECTOR).not.toContain("closed");
  });
});
