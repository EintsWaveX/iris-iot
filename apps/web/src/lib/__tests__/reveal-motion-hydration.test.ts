/**
 * useRevealMotion's first render must not read the browser (prompt 14).
 *
 * The test page, the candidate page and two panel tabs are rendered on the
 * server, where prefers-reduced-motion is unknown, and hydrated in the
 * browser. React needs the first client render to match the server's. The
 * hook used to read matchMedia in its useState initialiser, so with reduced
 * motion on the client rendered data-m="reduce" over the server's "ldm";
 * React logged a hydration mismatch and kept "ldm", and the page moved as
 * if only Low Detail were on. Here a render with a window that asks for
 * reduced motion stands in for the hydration render: it must equal the
 * server's.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useRevealMotion } from "../../components/recruitment/reveal/fx";

function Probe() {
  return createElement("div", { "data-m": useRevealMotion() });
}

const g = globalThis as unknown as { window?: unknown };
const had = "window" in g;
const saved = g.window;
afterEach(() => {
  if (had) g.window = saved;
  else delete g.window;
});

describe("useRevealMotion and hydration", () => {
  it("renders the same first markup whether or not the browser asks for reduced motion", () => {
    delete g.window;
    const server = renderToString(createElement(Probe));
    g.window = {
      matchMedia: (q: string) => ({
        matches: q.includes("reduce"),
        media: q,
        addEventListener() {},
        removeEventListener() {},
      }),
      localStorage: { getItem: () => null, setItem() {} },
      addEventListener() {},
      removeEventListener() {},
    };
    const firstClient = renderToString(createElement(Probe));
    expect(firstClient).toBe(server);
  });
});
