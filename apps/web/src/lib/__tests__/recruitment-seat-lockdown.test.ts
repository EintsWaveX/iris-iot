import { describe, expect, it } from "vitest";
import {
  DEBOUNCE_MS,
  FOKUS_GRACE_MS,
  FS_QUIET_MS,
  MAX_STRIKES_PER_PART,
  PageWatch,
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

describe("PageWatch (what the page state calls for, whatever events arrive)", () => {
  const T = FOKUS_GRACE_MS;

  it("calls for nothing while the page is fine", () => {
    const w = new PageWatch();
    expect(w.read(ok, 0)).toEqual([]);
    expect(w.read(ok, 10_000)).toEqual([]);
  });

  it("calls for tab when the page is hidden, and not for fokus on top of it", () => {
    const w = new PageWatch();
    expect(w.read({ fullscreen: true, visible: false, focused: false }, 0)).toEqual(["tab"]);
    expect(w.read({ fullscreen: true, visible: false, focused: false }, 5000)).toEqual(["tab"]);
  });

  it("calls for layar when fullscreen is gone, and not for fokus on top of it (Linux blurs on exit)", () => {
    const w = new PageWatch();
    expect(w.read({ fullscreen: false, visible: true, focused: false }, 0)).toEqual(["layar"]);
    expect(w.read({ fullscreen: false, visible: true, focused: false }, 5000)).toEqual(["layar"]);
  });

  it("waits out a short blur before calling for fokus, then calls for it", () => {
    const w = new PageWatch();
    const out = { fullscreen: true, visible: true, focused: false };
    expect(w.read(out, 0)).toEqual([]);
    expect(w.read(out, T - 1)).toEqual([]);
    expect(w.read(out, T)).toEqual(["fokus"]);
  });

  it("a blur that ends within the grace never counts, and the clock starts over", () => {
    const w = new PageWatch();
    const out = { fullscreen: true, visible: true, focused: false };
    w.read(out, 0);
    w.read(ok, T - 100);
    expect(w.read(out, T + 100)).toEqual([]);
    expect(w.read(out, T + 100 + T)).toEqual(["fokus"]);
  });

  it("keeps fokus quiet right after a fullscreen change (the window manager blurs and refocuses)", () => {
    const w = new PageWatch();
    const out = { fullscreen: true, visible: true, focused: false };
    w.quiet(0);
    expect(w.read(out, 100)).toEqual([]);
    expect(w.read(out, FS_QUIET_MS - 1)).toEqual([]);
    // the grace counts from when the quiet ends
    expect(w.read(out, FS_QUIET_MS)).toEqual([]);
    expect(w.read(out, FS_QUIET_MS + T - 1)).toEqual([]);
    expect(w.read(out, FS_QUIET_MS + T)).toEqual(["fokus"]);
  });
});

describe("StrikeTracker with a missed event", () => {
  it("a strike left open by a lost focus event closes on the next look at the page", () => {
    let n = 0;
    const t = new StrikeTracker(() => `s${++n}`);
    t.signal("fokus", 0);
    // the `focus` event never came, a later look finds the page fine
    expect(t.settle(ok, 700)).toMatchObject({ type: "close", strike: { id: "s1", back: 700 } });
    // and the next violation is a new record, not swallowed by the old one
    expect(t.signal("fokus", 700 + DEBOUNCE_MS + 1)).toMatchObject({
      type: "open",
      strike: { id: "s2" },
    });
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
