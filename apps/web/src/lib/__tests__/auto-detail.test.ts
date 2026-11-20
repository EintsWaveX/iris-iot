import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { judgeWindow, DEMOTED_TOAST } from "../auto-detail";

/**
 * Otomatis (Nov 2026): the default detail level. public/theme-init.js resolves it before first paint (Normal, or
 * Low Detail for a weak or slow device) and scripts/auto-detail.ts watches real frames and demotes. These hold the
 * rules: what counts as weak, what counts as slow, what never overrides a reader's own choice.
 */

const frames = (n: number, ms: number) => Array<number>(n).fill(ms);

describe("judgeWindow", () => {
  it("is fine at 60 fps and at 40 fps", () => {
    expect(judgeWindow(frames(180, 16.7))).toBe("fine");
    expect(judgeWindow(frames(120, 25))).toBe("fine");
  });
  it("is slow when most frames are under 30 fps", () => {
    expect(judgeWindow(frames(90, 40))).toBe("slow");
    expect(judgeWindow(frames(60, 50))).toBe("slow");
  });
  it("is slow when a 3 s window managed fewer than 30 frames (under 10 fps) with no throttle gap", () => {
    expect(judgeWindow(frames(12, 250))).toBe("slow");
  });
  it("one slow stretch among good frames is not slow (the 75th percentile decides)", () => {
    const d = [...frames(150, 16.7), ...frames(20, 120)];
    expect(judgeWindow(d)).toBe("fine");
  });
  it("says nothing about a window with a throttle gap or no frames: a hidden tab is not a slow device", () => {
    expect(judgeWindow([...frames(100, 16.7), 900])).toBe("unreadable");
    expect(judgeWindow([])).toBe("unreadable");
  });
  it("is unreadable only for the throttle gap, not for ordinary hitches under 500 ms", () => {
    expect(judgeWindow([...frames(100, 16.7), 480])).toBe("fine");
  });
});

describe("the toast", () => {
  it("is written in all three languages and names the way back", () => {
    for (const l of ["id", "en", "zh"] as const)
      expect(DEMOTED_TOAST[l].length).toBeGreaterThan(20);
    expect(DEMOTED_TOAST.id).toContain("Tampilan");
    expect(DEMOTED_TOAST.en).toContain("Display");
  });
});

/** theme-init.js run against a fake browser */
function boot(opts: {
  store?: Record<string, string>;
  memory?: number;
  cores?: number;
  saveData?: boolean;
  reduced?: boolean;
  now?: number;
}) {
  const store = { ...(opts.store ?? {}) };
  const attrs: Record<string, string> = {};
  const root = {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    getAttribute: (k: string) => attrs[k] ?? null,
    removeAttribute: (k: string) => delete attrs[k],
    querySelector: () => null,
    style: { setProperty: () => {} },
  };
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
      removeItem: (k: string) => delete store[k],
    },
    matchMedia: (q: string) => ({
      matches: q.includes("reduced-motion") ? !!opts.reduced : false,
      addEventListener: () => {},
    }),
    navigator: {
      deviceMemory: opts.memory,
      hardwareConcurrency: opts.cores ?? 8,
      connection: opts.saveData ? { saveData: true } : undefined,
    },
  };
  win.window = win;
  const doc = { documentElement: root, addEventListener: () => {} };
  const realNow = Date.now;
  if (opts.now) Date.now = () => opts.now as number;
  try {
    const ctx = vm.createContext({
      window: win,
      document: doc,
      Date,
      Number,
      isFinite,
      Math,
      String,
    });
    vm.runInContext(
      readFileSync(
        fileURLToPath(new URL("../../../public/theme-init.js", import.meta.url)),
        "utf8",
      ),
      ctx,
    );
  } finally {
    Date.now = realNow;
  }
  const prefs = win.IrisPrefs as {
    detail(): string;
    detailPref(): string;
    demote(): void;
  };
  return {
    attrs,
    store,
    prefs,
    setNow: (t: number) => (Date.now = () => t),
    restore: () => (Date.now = realNow),
  };
}

describe("theme-init.js: Otomatis", () => {
  it("is the default: a new visitor on an ordinary device gets Normal", () => {
    const { attrs, prefs } = boot({});
    expect(prefs.detailPref()).toBe("auto");
    expect(prefs.detail()).toBe("normal");
    expect(attrs["data-detail"]).toBe("normal");
  });

  it.each([
    ["Save-Data on", { saveData: true }],
    ["2 GB of memory or less", { memory: 2 }],
    ["2 cores or fewer", { cores: 2 }],
    ["reduced motion asked for", { reduced: true }],
  ])("starts a plainly weak device at Low Detail: %s", (_n, o) => {
    expect(boot(o).prefs.detail()).toBe("ldm");
  });

  it("does not call a 4 GB, 8 core phone weak: the watcher decides that from real frames", () => {
    expect(boot({ memory: 4, cores: 8 }).prefs.detail()).toBe("normal");
  });

  it("never picks High Detail for itself", () => {
    expect(boot({ memory: 8, cores: 16 }).prefs.detail()).toBe("normal");
  });

  it("a reader's own choice always wins, even on a weak device", () => {
    for (const choice of ["ldm", "normal", "hd"]) {
      const { prefs } = boot({ store: { "iris-detail": choice }, saveData: true, memory: 1 });
      expect(prefs.detailPref()).toBe(choice);
      expect(prefs.detail()).toBe(choice);
    }
  });

  it("keeps the old iris-kurangi-efek 'penuh' reader at High Detail, and any other old value on Otomatis", () => {
    expect(boot({ store: { "iris-kurangi-efek": "penuh" } }).prefs.detail()).toBe("hd");
    expect(boot({ store: { "iris-kurangi-efek": "0" } }).prefs.detail()).toBe("hd");
    expect(boot({ store: { "iris-kurangi-efek": "kurangi" } }).prefs.detailPref()).toBe("auto");
  });

  it("ignores an unknown stored value", () => {
    expect(boot({ store: { "iris-detail": "ultra" } }).prefs.detailPref()).toBe("auto");
  });

  it("demote() drops Otomatis to Low Detail and re-stamps <html>", () => {
    const { attrs, prefs, store } = boot({});
    expect(attrs["data-detail"]).toBe("normal");
    prefs.demote();
    expect(attrs["data-detail"]).toBe("ldm");
    expect(Number(store["iris-auto-ldm"])).toBeGreaterThan(0);
    expect(prefs.detail()).toBe("ldm");
  });

  it("a demotion does not touch a reader who chose Normal", () => {
    const { attrs, prefs } = boot({ store: { "iris-detail": "normal" } });
    prefs.demote();
    expect(attrs["data-detail"]).toBe("normal");
  });

  it("a demotion lasts 14 days and then the device gets another chance", () => {
    const day = 24 * 60 * 60 * 1000;
    const t0 = 1_800_000_000_000;
    const young = boot({ store: { "iris-auto-ldm": String(t0 - 13 * day) } });
    young.setNow(t0);
    expect(young.prefs.detail()).toBe("ldm");
    const old = boot({ store: { "iris-auto-ldm": String(t0 - 15 * day) } });
    old.setNow(t0);
    expect(old.prefs.detail()).toBe("normal");
    old.restore();
  });
});

describe("the old probe is gone", () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  it("motion-tier.ts draws no canvas and keeps no cache", () => {
    const code = src("../../scripts/motion-tier.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(
      /createElement\(["']canvas["']\)|drawImage|localStorage|hardwareConcurrency/,
    );
  });
  it("auto-detail.ts only ever steps down and only for Otomatis at Normal", () => {
    const code = src("../../scripts/auto-detail.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/detailPref\(\) === "auto"/);
    expect(code).toMatch(/dataset\.detail === "normal"/);
    expect(code).not.toMatch(/setDetail\(["']hd["']\)/);
  });
});
