// @vitest-environment jsdom
/**
 * The countdown ring keeps one start point for a phase. The clock ticks ten times a second; when every tick was
 * fed back in as the animation delay, the sweep jumped ahead and emptied before the number reached 0.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Cincin } from "../parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let box: HTMLElement | null = null;

const draw = (sisaMs: number | null, extra: { dijeda?: boolean; kunci?: string } = {}) =>
  root!.render(
    h(Cincin, {
      totalMs: 20_000,
      sisaMs,
      dijeda: extra.dijeda ?? false,
      detik: sisaMs === null ? null : Math.ceil(sisaMs / 1000),
      kunci: extra.kunci ?? "1",
    }),
  );
const delay = () =>
  (box!.querySelector(".kz__cincin") as HTMLElement).style.getPropertyValue("--kz-tunda");

async function start() {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
}

afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = box = null;
});

describe("Cincin", () => {
  it("does not move its start point as the clock ticks", async () => {
    await start();
    await act(async () => draw(15_000));
    expect(delay()).toBe("-5000ms");
    await act(async () => draw(14_900));
    await act(async () => draw(14_800));
    await act(async () => draw(10_000));
    expect(delay()).toBe("-5000ms");
  });

  it("draws the sweep only once the clock is known, so it starts at the right point", async () => {
    await start();
    await act(async () => draw(null));
    expect(box!.querySelector(".kz__cincin-isi")).toBeNull();
    await act(async () => draw(12_000));
    expect(box!.querySelector(".kz__cincin-isi")).not.toBeNull();
    expect(delay()).toBe("-8000ms");
  });

  it("starts a new phase from the top", async () => {
    await start();
    await act(async () => draw(3_000, { kunci: "1" }));
    expect(delay()).toBe("-17000ms");
    await act(async () => draw(20_000, { kunci: "2" }));
    expect(delay()).toBe("0ms");
  });
});
