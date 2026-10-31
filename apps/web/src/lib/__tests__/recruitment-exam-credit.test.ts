// @vitest-environment jsdom
/**
 * Credit through the renderers (prompt 10): what a candidate does on the page
 * produces the value `checkValue` accepts and `credit` scores. The formats
 * that are only a Dropdown or a drag (fix, match, order) are covered by the
 * rig in a real browser (rec_runner_flows.mjs), where the pickers can open.
 */
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Question, Value, View } from "../recruitment/exam-types";
import { checkValue, credit, makePerm, toView } from "../recruitment/formats";
import { fracText } from "../recruitment/frac";
import { rngFrom } from "../recruitment/draw";
import { QuestionBody } from "../../components/recruitment/exam/render";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Mounts a renderer that keeps its own value and reports the latest one */
function mount(view: View) {
  const seen: { v: Value } = { v: null };
  function Harness() {
    const [value, set] = useState<Value>(null);
    return createElement(QuestionBody, {
      view,
      value,
      lang: "id",
      onChange: (v: Value) => {
        seen.v = v;
        set(v);
      },
    });
  }
  act(() => root.render(createElement(Harness)));
  return seen;
}

const click = (el: Element | null) => {
  if (!el) throw new Error("no element");
  act(() => {
    (el as HTMLElement).click();
  });
};
const type = (input: HTMLInputElement, text: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const single: Question = {
  id: 1,
  part: "logika",
  lang: "c",
  format: "single",
  version: 1,
  body: {
    prompt: "p",
    shuffle: true,
    options: [
      { id: "aa", text: "alpha" },
      { id: "bb", text: "beta" },
      { id: "cc", text: "gamma" },
    ],
  },
  answer: { correct: "bb" },
};
const view = (q: Question, seed = "00".repeat(16)) =>
  toView(q, makePerm(q, rngFrom(seed, "q", q.id)));
const full = (q: Question, v: Value) =>
  fracText(credit(q, v)) === "1/1" || fracText(credit(q, v)) === "1";

describe("single choice", () => {
  it("clicking the option labelled beta scores 1, however it was shuffled", () => {
    const v = view(single);
    const seen = mount(v);
    const btn = [...host.querySelectorAll("button.r3opt")].find((b) =>
      b.textContent?.includes("beta"),
    );
    click(btn ?? null);
    expect(seen.v).toEqual({ pick: "bb" });
    expect(checkValue(single, seen.v)).toBe(true);
    expect(full(single, seen.v)).toBe(true);
  });
  it("clicking it twice clears the pick, and a cleared pick scores 0", () => {
    const seen = mount(view(single));
    const btn = () =>
      [...host.querySelectorAll("button.r3opt")].find((b) => b.textContent?.includes("beta"));
    click(btn() ?? null);
    click(btn() ?? null);
    expect(seen.v).toEqual({ pick: null });
    expect(checkValue(single, seen.v)).toBe(true);
    expect(full(single, seen.v)).toBe(false);
  });
  it("letters follow the screen order, not the ids", () => {
    mount(view(single));
    const letters = [...host.querySelectorAll(".r3opt__k")].map((e) => e.textContent);
    expect(letters).toEqual(["A", "B", "C"]);
  });
});

const multi: Question = {
  id: 2,
  part: "logika",
  lang: "c",
  format: "multi",
  version: 1,
  body: {
    prompt: "p",
    shuffle: false,
    options: [
      { id: "aa", text: "one" },
      { id: "bb", text: "two" },
      { id: "cc", text: "three" },
    ],
  },
  answer: { correct: ["aa", "cc"] },
};

describe("checkbox", () => {
  it("picking both right options scores 1 and a wrong one takes a point back", () => {
    const seen = mount(view(multi));
    const by = (t: string) =>
      [...host.querySelectorAll("button.r3opt")].find((b) => b.textContent?.includes(t)) ?? null;
    click(by("one"));
    click(by("three"));
    expect(checkValue(multi, seen.v)).toBe(true);
    expect(full(multi, seen.v)).toBe(true);
    click(by("two"));
    expect(full(multi, seen.v)).toBe(false);
  });
  it("never says how many are right", () => {
    mount(view(multi));
    expect(host.textContent).not.toMatch(/\b2\b.*benar|dua/i);
  });
});

const lines: Question = {
  id: 3,
  part: "kodingan",
  lang: "c",
  format: "lines",
  version: 1,
  body: { prompt: "p", code: { lang: "c", src: "int a = 1;\n\nint b = 2;\nint c = a +;" } },
  answer: { lines: [4] },
};

describe("click the lines", () => {
  it("clicking line 4 scores 1; a blank line cannot be clicked", () => {
    const seen = mount(view(lines));
    const rows = host.querySelectorAll(".r3code__l");
    expect(rows).toHaveLength(4);
    expect((rows[1] as HTMLElement).tagName).toBe("SPAN");
    click(rows[3]);
    expect(seen.v).toEqual({ picks: [4] });
    expect(checkValue(lines, seen.v)).toBe(true);
    expect(full(lines, seen.v)).toBe(true);
  });
  it("picking another line too is a wrong pick against the right one", () => {
    const seen = mount(view(lines));
    const rows = host.querySelectorAll(".r3code__l");
    click(rows[3]);
    click(rows[0]);
    expect(seen.v).toEqual({ picks: [1, 4] });
    expect(full(lines, seen.v)).toBe(false);
  });
  it("tells the candidate how many they picked and nothing about how many are wrong", () => {
    mount(view(lines));
    click(host.querySelectorAll(".r3code__l")[0]);
    expect(host.textContent).toContain("1 baris dipilih");
  });
});

const fitb: Question = {
  id: 4,
  part: "fitb",
  lang: "c",
  format: "fitb",
  version: 1,
  body: {
    prompt: "p",
    code: { lang: "c", src: "int ____(1)____ = ____(2)____;" },
    blanks: [{ n: 1 }, { n: 2, width: 4 }],
  },
  answer: { blanks: { 1: { accept: ["x"] }, 2: { accept: ["5"] } } },
};

describe("fill in the blanks", () => {
  it("typing both blanks scores 1; the value uses the blank numbers", () => {
    const seen = mount(view(fitb));
    const inputs = host.querySelectorAll<HTMLInputElement>("input.r3blank__in");
    expect(inputs).toHaveLength(2);
    type(inputs[0], "x");
    type(host.querySelectorAll<HTMLInputElement>("input.r3blank__in")[1], "5");
    expect(seen.v).toEqual({ blanks: { 1: "x", 2: "5" } });
    expect(checkValue(fitb, seen.v)).toBe(true);
    expect(full(fitb, seen.v)).toBe(true);
  });
  it("counts filled blanks", () => {
    mount(view(fitb));
    type(host.querySelector<HTMLInputElement>("input.r3blank__in")!, "x");
    expect(host.textContent).toContain("1 dari 2 celah terisi");
  });
  it("starts at the blank's width and grows as the candidate types", () => {
    mount(view(fitb));
    const second = () => host.querySelectorAll<HTMLInputElement>("input.r3blank__in")[1];
    expect(second().style.width).toBe("4ch");
    type(second(), "123456789");
    expect(second().style.width).toBe("10ch");
  });
});
