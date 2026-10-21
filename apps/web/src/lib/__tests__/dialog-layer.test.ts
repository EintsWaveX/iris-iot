// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useDialogLayer } from "../../components/ui/dialogLayer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A stand-in dialog: shows the z-index pair the hook hands it. */
function Probe({ open, id }: { open: boolean; id: string }) {
  const z = useDialogLayer(open);
  return createElement("i", { id, "data-o": z.overlay, "data-p": z.panel });
}

const roots: ReturnType<typeof createRoot>[] = [];
// Every dialog a test opened closes with it: slots are shared module state.
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount());
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const draw = (a: boolean, b: boolean, c = false) =>
    act(() =>
      root.render(
        createElement("div", null, [
          createElement(Probe, { key: "a", id: "a", open: a }),
          createElement(Probe, { key: "b", id: "b", open: b }),
          createElement(Probe, { key: "c", id: "c", open: c }),
        ]),
      ),
    );
  const z = (id: string) => {
    const e = host.querySelector(`#${id}`)!;
    return [Number(e.getAttribute("data-o")), Number(e.getAttribute("data-p"))];
  };
  return { draw, z };
}

describe("dialog layers", () => {
  it("a lone dialog keeps 100 and 101", () => {
    const { draw, z } = mount();
    draw(true, false);
    expect(z("a")).toEqual([100, 101]);
  });

  it("a dialog opened over another covers it: its scrim is above the first panel", () => {
    const { draw, z } = mount();
    draw(true, false);
    draw(true, true);
    const [, panelA] = z("a");
    const [overlayB, panelB] = z("b");
    expect(overlayB).toBeGreaterThan(panelA);
    expect(panelB).toBeGreaterThan(overlayB);
  });

  it("closing the top one frees its slot for the next", () => {
    const { draw, z } = mount();
    draw(true, true);
    draw(true, false);
    draw(true, false, true);
    expect(z("c")).toEqual([102, 103]);
  });

  it("stays under the popovers' 150 however many are stacked", () => {
    const { draw, z } = mount();
    draw(true, true, true);
    for (const id of ["a", "b", "c"]) expect(z(id)[1]).toBeLessThan(150);
  });
});
