// @vitest-environment jsdom
/**
 * Live Upload's settings: which boxes a module shows, how a typed value reaches the
 * parent, when a mistake is named, and what this laptop is allowed to remember
 * (the Wi-Fi name and group for good, the password for the tab only, never in localStorage).
 */
import { createElement as h, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadValues } from "../../../lib/live-build";

vi.mock("../../ui/GroupPicker", () => ({
  default: (p: { value: number; groups: number[]; mark?: number }) =>
    h(
      "div",
      { "data-testid": "group", "data-value": p.value, "data-mark": p.mark ?? "" },
      p.groups.join(","),
    ),
}));

import UploadPanel from "../UploadPanel";
import { useUploadSettings } from "../useUploadSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let box: HTMLElement | null = null;

function mount(el: ReturnType<typeof h>) {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(el));
  return box;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  box?.remove();
  root = null;
  box = null;
});

const base: UploadValues = { ssid: "", password: "", group: 2, key: "" };

function panel(
  modul: number,
  values = base,
  onChange: (v: UploadValues) => void = () => undefined,
  keyFilled = false,
) {
  return h(UploadPanel, {
    lang: "en",
    modul,
    groups: [1, 2, 3, 4, 5],
    ownGroup: 2,
    values,
    onChange,
    keyFilled,
  });
}

describe("UploadPanel", () => {
  it("Module 1 shows the group alone: its boards have no Wi-Fi and no key", () => {
    const b = mount(panel(1));
    expect(b.querySelectorAll("input")).toHaveLength(0);
    expect(b.querySelector('[data-testid="group"]')?.getAttribute("data-value")).toBe("2");
  });

  it("Module 2 asks for the Wi-Fi name and password, Module 4 also for the board key", () => {
    const m2 = mount(panel(2));
    expect(m2.querySelectorAll("input")).toHaveLength(2); // name and password
    act(() => root?.unmount());
    box?.remove();
    const m4 = mount(panel(4));
    expect(m4.querySelectorAll("input")).toHaveLength(3);
    expect(m4.textContent).toContain("Board Key");
  });

  it("says where a filled key came from", () => {
    expect(mount(panel(4, base, undefined, true)).textContent).toContain(
      "Filled in from the Hunt step",
    );
  });

  it("passes a typed Wi-Fi name up", () => {
    const seen: UploadValues[] = [];
    const b = mount(panel(4, base, (v) => seen.push(v)));
    const input = b.querySelector("input") as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      set.call(input, "LabWifi");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(seen.at(-1)).toMatchObject({ ssid: "LabWifi", group: 2 });
  });

  it("names a mistake only after the box was left", () => {
    const bad: UploadValues = { ...base, ssid: "x".repeat(33), password: "", key: "" };
    const b = mount(panel(4, bad));
    expect(b.querySelector(".field__error")).toBeNull();
    const input = b.querySelector("input") as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(b.querySelector(".field__error")?.textContent).toContain("32 characters");
  });
});

describe("useUploadSettings", () => {
  function Probe(props: { own: number | null; huntKey?: string | null }) {
    const s = useUploadSettings(props.own, props.huntKey ?? null);
    const [, force] = useState(0);
    void force;
    return h(
      "button",
      {
        id: "go",
        "data-v": JSON.stringify(s.values),
        onClick: () => s.change({ ssid: "MyNet", password: "pw-123456", group: 4, key: "" }),
      },
      "x",
    );
  }
  const read = () =>
    JSON.parse(document.getElementById("go")!.getAttribute("data-v")!) as UploadValues;

  it("starts on the person's own group and keeps the key from the Hunt step", () => {
    mount(h(Probe, { own: 3, huntKey: "HD9LAUK9" }));
    expect(read()).toMatchObject({ group: 3, key: "HD9LAUK9" });
  });

  it("remembers the Wi-Fi name and group for good and the password for the tab only", () => {
    mount(h(Probe, { own: 3 }));
    act(() => document.getElementById("go")!.click());
    expect(JSON.parse(localStorage.getItem("iris.upload.v1")!)).toEqual({
      ssid: "MyNet",
      group: 4,
    });
    expect(localStorage.getItem("iris.upload.v1")).not.toContain("pw-123456");
    expect(sessionStorage.getItem("iris.upload.pw")).toBe("pw-123456");
    // A new visit in this tab finds the lot again
    act(() => root?.unmount());
    box?.remove();
    mount(h(Probe, { own: null }));
    expect(read()).toMatchObject({ ssid: "MyNet", group: 4, password: "pw-123456" });
  });

  it("still works when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount(h(Probe, { own: 1 }));
    act(() => document.getElementById("go")!.click());
    expect(read()).toMatchObject({ ssid: "MyNet" });
    get.mockRestore();
    set.mockRestore();
  });
});
