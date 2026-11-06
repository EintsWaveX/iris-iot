/**
 * The free-mode switch: false unless a hook says otherwise, and always restorable.
 */
import { afterEach, describe, expect, it } from "vitest";
import { bebas, setBebasHook } from "../recruitment/bebas";

afterEach(() => setBebasHook(() => false));

describe("bebas", () => {
  it("is false by default", () => {
    expect(bebas()).toBe(false);
  });
  it("follows the hook that was set", () => {
    setBebasHook(() => true);
    expect(bebas()).toBe(true);
  });
  it("reads the hook every time, not once", () => {
    let on = false;
    setBebasHook(() => on);
    expect(bebas()).toBe(false);
    on = true;
    expect(bebas()).toBe(true);
  });
  it("is restored to false by setting the false hook again", () => {
    setBebasHook(() => true);
    setBebasHook(() => false);
    expect(bebas()).toBe(false);
  });
});
