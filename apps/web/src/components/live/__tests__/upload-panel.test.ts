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
import { useUploadSettings, useWifiDiketik, wifiDiketik } from "../useUploadSettings";

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

describe("what was typed in Live reaches the Hunt step", () => {
  function Hunt() {
    const w = useWifiDiketik();
    return h("div", { id: "hunt", "data-w": JSON.stringify(w) }, "x");
  }
  function Live() {
    const s = useUploadSettings(1, null);
    return h(
      "button",
      {
        id: "type",
        onClick: () => s.change({ ssid: "PhoneNet", password: "pw-654321", group: 1, key: "" }),
      },
      "x",
    );
  }
  const shown = () =>
    JSON.parse(document.getElementById("hunt")!.getAttribute("data-w")!) as {
      ssid: string;
      password: string;
    };

  it("is empty until something is typed", () => {
    mount(h(Hunt));
    expect(shown()).toEqual({ ssid: "", password: "" });
    expect(wifiDiketik()).toEqual({ ssid: "", password: "" });
  });

  it("follows the name and password as they are typed, without a reload", () => {
    mount(h("div", null, h(Hunt), h(Live)));
    act(() => document.getElementById("type")!.click());
    expect(shown()).toEqual({ ssid: "PhoneNet", password: "pw-654321" });
  });

  it("finds what an earlier visit in this tab typed", () => {
    localStorage.setItem("iris.upload.v1", JSON.stringify({ ssid: "OldNet", group: 2 }));
    sessionStorage.setItem("iris.upload.pw", "old-password");
    mount(h(Hunt));
    expect(shown()).toEqual({ ssid: "OldNet", password: "old-password" });
  });

  it("stays empty when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount(h(Hunt));
    expect(shown()).toEqual({ ssid: "", password: "" });
    get.mockRestore();
  });
});

describe("the board key follows the group on the form", () => {
  function Harness() {
    const [key, setKey] = useState<string | null>("KEYGROUP");
    const s = useUploadSettings(1, key);
    return h(
      "div",
      { id: "k", "data-key": s.values.key, "data-filled": String(s.keyFilled) },
      h("button", { id: "g2", onClick: () => setKey("KEYTWO22") }, "g2"),
      h("button", { id: "none", onClick: () => setKey(null) }, "none"),
      h(
        "button",
        { id: "typed", onClick: () => s.change({ ...s.values, key: "TYPED123" }) },
        "typed",
      ),
    );
  }
  const key = () => document.getElementById("k")!.getAttribute("data-key");
  const filled = () => document.getElementById("k")!.getAttribute("data-filled");
  const press = (id: string) => act(() => document.getElementById(id)!.click());

  it("replaces a key it put in itself when another group's key arrives", () => {
    mount(h(Harness));
    expect(key()).toBe("KEYGROUP");
    press("g2");
    expect(key()).toBe("KEYTWO22");
    expect(filled()).toBe("true");
  });

  it("takes its key back while the new group has none, so the old one is never sent", () => {
    mount(h(Harness));
    press("none");
    expect(key()).toBe("");
    expect(filled()).toBe("false");
  });

  it("never overwrites a key the person typed", () => {
    mount(h(Harness));
    press("typed");
    expect(key()).toBe("TYPED123");
    expect(filled()).toBe("false");
    press("g2");
    expect(key()).toBe("TYPED123");
    press("none");
    expect(key()).toBe("TYPED123");
  });
});
