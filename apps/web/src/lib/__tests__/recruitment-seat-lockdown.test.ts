import { describe, expect, it } from "vitest";
import {
  DEBOUNCE_MS,
  MAX_STRIKES_PER_PART,
  StrikeTracker,
  devtoolsLikelyOpen,
  isDevtoolsKey,
} from "../recruitment/seat-lockdown";

const ok = { fullscreen: true, visible: true, focused: true };

describe("StrikeTracker", () => {
  it("opens a strike on the first signal and closes it when the page is back", () => {
    const t = new StrikeTracker(() => "s1");
    const open = t.signal("layar", 1000);
    expect(open).toMatchObject({
      type: "open",
      strike: { id: "s1", kinds: ["layar"], at: 1000, back: null },
    });
    expect(t.settle(ok, 5000)).toMatchObject({ type: "close", strike: { id: "s1", back: 5000 } });
  });

  it("does not close while any of fullscreen, visible, focused is missing", () => {
    const t = new StrikeTracker(() => "s1");
    t.signal("tab", 0);
    expect(t.settle({ ...ok, fullscreen: false }, 100)).toBeNull();
    expect(t.settle({ ...ok, visible: false }, 100)).toBeNull();
    expect(t.settle({ ...ok, focused: false }, 100)).toBeNull();
    expect(t.settle(ok, 100)?.type).toBe("close");
  });

  it("adds a second kind to the open strike instead of opening another", () => {
    const t = new StrikeTracker(() => "s1");
    t.signal("tab", 0);
    const u = t.signal("fokus", 40);
    expect(u).toMatchObject({ type: "update", strike: { kinds: ["tab", "fokus"] } });
    expect(t.all()).toHaveLength(1);
  });

  it("does not repeat a kind already on the strike", () => {
    const t = new StrikeTracker(() => "s1");
    t.signal("tab", 0);
    expect(t.signal("tab", 10)).toBeNull();
  });

  it("joins a signal that comes within 1.5 s after the strike closed, and reopens it", () => {
    let n = 0;
    const t = new StrikeTracker(() => `s${++n}`);
    t.signal("layar", 0);
    t.settle(ok, 1000);
    const u = t.signal("fokus", 1000 + DEBOUNCE_MS - 1);
    expect(u).toMatchObject({
      type: "update",
      strike: { id: "s1", kinds: ["layar", "fokus"], back: null },
    });
    expect(t.all()).toHaveLength(1);
  });

  it("opens a new strike once 1.5 s have passed since the last one closed", () => {
    let n = 0;
    const t = new StrikeTracker(() => `s${++n}`);
    t.signal("layar", 0);
    t.settle(ok, 1000);
    const o = t.signal("fokus", 1000 + DEBOUNCE_MS + 1);
    expect(o).toMatchObject({ type: "open", strike: { id: "s2" } });
    expect(t.all()).toHaveLength(2);
  });

  it("a paste is an instant strike: opened and closed at once", () => {
    const t = new StrikeTracker(() => "p1");
    const e = t.signal("tempel", 500, { instant: true });
    expect(e).toMatchObject({ type: "close", strike: { kinds: ["tempel"], at: 500, back: 500 } });
  });

  it("stops recording past the cap per part and says so", () => {
    let n = 0;
    const t = new StrikeTracker(() => `s${++n}`);
    let last = null;
    for (let i = 0; i < MAX_STRIKES_PER_PART + 3; i++) {
      last = t.signal("tempel", i * 10_000, { instant: true });
    }
    expect(t.all().length).toBe(MAX_STRIKES_PER_PART);
    expect(last).toBeNull();
    expect(t.capped).toBe(true);
  });

  it("settle with nothing open does nothing", () => {
    expect(new StrikeTracker(() => "x").settle(ok, 0)).toBeNull();
  });
});

describe("devtools heuristic", () => {
  it("flags a window much wider or taller outside than inside while fullscreen", () => {
    expect(
      devtoolsLikelyOpen({
        outerWidth: 1920,
        innerWidth: 1500,
        outerHeight: 1080,
        innerHeight: 1000,
      }),
    ).toBe(true);
    expect(
      devtoolsLikelyOpen({
        outerWidth: 1920,
        innerWidth: 1920,
        outerHeight: 1080,
        innerHeight: 800,
      }),
    ).toBe(true);
  });
  it("ignores the browser's own chrome", () => {
    expect(
      devtoolsLikelyOpen({
        outerWidth: 1920,
        innerWidth: 1905,
        outerHeight: 1080,
        innerHeight: 960,
      }),
    ).toBe(false);
  });
  it("knows the shortcuts that open devtools", () => {
    const k = (key: string, o: Partial<KeyboardEvent> = {}) => ({
      key,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...o,
    });
    expect(isDevtoolsKey(k("F12"))).toBe(true);
    expect(isDevtoolsKey(k("I", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsKey(k("j", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsKey(k("C", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsKey(k("i", { metaKey: true, altKey: true }))).toBe(true);
    expect(isDevtoolsKey(k("i", { ctrlKey: true }))).toBe(false);
    expect(isDevtoolsKey(k("a"))).toBe(false);
  });
});
