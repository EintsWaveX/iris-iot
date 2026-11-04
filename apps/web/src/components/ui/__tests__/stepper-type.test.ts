// @vitest-environment jsdom
/**
 * The number in the middle of a Stepper is a field: click it, type the number,
 * press Enter. Nobody has to hold the arrows down to reach 90 from 5.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "../Controls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let box: HTMLElement | null = null;

async function pasang(value = 90) {
  const onChange = vi.fn();
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  await act(async () =>
    root!.render(
      h(Stepper, {
        value,
        onChange,
        min: 10,
        max: 120,
        step: 15,
        label: "Panjang",
        fmt: (v: number) => `${v} menit`,
        lessLabel: "Kurangi",
        moreLabel: "Tambah",
      }),
    ),
  );
  const input = box.querySelector("input") as HTMLInputElement;
  return { input, onChange };
}

async function ketik(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const tekan = (input: HTMLInputElement, key: string) =>
  act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });

afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = box = null;
});

// The first render pays for importing the date picker kit; give a loaded CI machine room.
describe("Stepper typing", { timeout: 20_000 }, () => {
  it("shows the formatted value, and the bare number while you edit", async () => {
    const { input } = await pasang();
    expect(input.value).toBe("90 menit");
    await act(async () => input.focus());
    expect(input.value).toBe("90");
  });

  it("commits a typed number on Enter", async () => {
    const { input, onChange } = await pasang();
    await act(async () => input.focus());
    await ketik(input, "47");
    await tekan(input, "Enter");
    expect(onChange).toHaveBeenCalledWith(47);
  });

  it("clamps to the ends", async () => {
    const { input, onChange } = await pasang();
    await act(async () => input.focus());
    await ketik(input, "999");
    await tekan(input, "Enter");
    expect(onChange).toHaveBeenLastCalledWith(120);
    await ketik(input, "2");
    await tekan(input, "Enter");
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("ignores text that is not a number", async () => {
    const { input, onChange } = await pasang();
    await act(async () => input.focus());
    await ketik(input, "abc");
    await tekan(input, "Enter");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Esc drops what was typed", async () => {
    const { input, onChange } = await pasang();
    await act(async () => input.focus());
    await ketik(input, "33");
    await tekan(input, "Escape");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("90 menit");
  });

  it("Up and Down step by the step size", async () => {
    const { input, onChange } = await pasang();
    await act(async () => input.focus());
    await tekan(input, "ArrowUp");
    expect(onChange).toHaveBeenLastCalledWith(105);
    // Down steps from what the field shows now (105), not from the stored 90.
    await tekan(input, "ArrowDown");
    expect(onChange).toHaveBeenLastCalledWith(90);
  });
});
