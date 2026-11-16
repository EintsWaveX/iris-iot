// @vitest-environment jsdom
/**
 * usePresence keeps something on screen for its exit fade after it stops being wanted, then lets go.
 * With reduced motion or Low Detail it lets go at once.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { usePresence } from "../usePresence";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let box: HTMLElement | null = null;

function reduced(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Probe({ on, ms }: { on: boolean; ms?: number }) {
  const p = usePresence(on, ms);
  return p.shown ? h("p", { className: p.className }, "here") : null;
}

const pause = (ms: number) => act(async () => new Promise<void>((r) => setTimeout(r, ms)));

async function start(on: boolean, ms = 60) {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  const draw = (v: boolean) => root!.render(h(Probe, { on: v, ms }));
  await act(async () => draw(on));
  return draw;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = box = null;
});

describe("usePresence", { timeout: 20_000 }, () => {
  it("shows at once with the entrance class and nothing while it is not wanted", async () => {
    reduced(false);
    const draw = await start(false);
    expect(box!.querySelector("p")).toBeNull();
    await act(async () => draw(true));
    expect(box!.querySelector("p")!.className).toBe("fade");
  });

  it("stays through the exit fade, marked as leaving, then goes", async () => {
    reduced(false);
    const draw = await start(true);
    await act(async () => draw(false));
    expect(box!.querySelector("p")!.className).toBe("fade fade--out");
    await pause(120);
    expect(box!.querySelector("p")).toBeNull();
  });

  it("comes back in without leaving when wanted again mid-fade", async () => {
    reduced(false);
    const draw = await start(true);
    await act(async () => draw(false));
    await act(async () => draw(true));
    await pause(120);
    expect(box!.querySelector("p")!.className).toBe("fade");
  });

  it("goes at once when motion is reduced", async () => {
    reduced(true);
    const draw = await start(true);
    await act(async () => draw(false));
    expect(box!.querySelector("p")).toBeNull();
  });
});
