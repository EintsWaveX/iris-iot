// @vitest-environment jsdom
/**
 * A view switch in Fade plays the old view out before the new one comes in,
 * except when motion is reduced, where it switches at once.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Fade from "../Fade";

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

const pause = (ms: number) => act(async () => new Promise<void>((r) => setTimeout(r, ms)));

async function start() {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  const draw = (k: string) =>
    root!.render(h(Fade, { k, children: h("p", { className: "view" }, `view ${k}`) }));
  await act(async () => draw("a"));
  return draw;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = box = null;
});

describe("Fade exit", { timeout: 20_000 }, () => {
  it("keeps the old view fading out, then shows the new one", async () => {
    reduced(false);
    const draw = await start();
    await act(async () => draw("b"));
    const wrap = box!.querySelector(".fade") as HTMLElement;
    expect(wrap.className).toContain("fade--out");
    expect(wrap.getAttribute("aria-hidden")).toBe("true");
    expect(wrap.textContent).toBe("view a");
    await pause(200);
    const now = box!.querySelector(".fade") as HTMLElement;
    expect(now.className).not.toContain("fade--out");
    expect(now.textContent).toBe("view b");
  });

  it("switches at once when motion is reduced", async () => {
    reduced(true);
    const draw = await start();
    await act(async () => draw("b"));
    const wrap = box!.querySelector(".fade") as HTMLElement;
    expect(wrap.className).not.toContain("fade--out");
    expect(wrap.textContent).toBe("view b");
  });
});
