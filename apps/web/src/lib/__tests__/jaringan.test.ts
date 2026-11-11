import { describe, expect, it } from "vitest";
import {
  ALAMAT_IRIS_IOT,
  JARINGAN,
  JARINGAN_BAWAAN,
  PORT_IRIS_IOT,
  bacaJaringan,
  jaringanValid,
} from "../jaringan";

describe("the Module 4 network setting", () => {
  it("offers exactly the two networks, IRIS_IOT by default", () => {
    expect([...JARINGAN].sort()).toEqual(["internet", "iris_iot"]);
    expect(JARINGAN_BAWAAN).toBe("iris_iot");
  });

  it("reads the stored value, and falls back to the default for anything else", () => {
    expect(bacaJaringan({ jaringan: "internet" })).toBe("internet");
    expect(bacaJaringan({ jaringan: "iris_iot" })).toBe("iris_iot");
    expect(bacaJaringan("internet")).toBe("internet");
    for (const buruk of [undefined, null, {}, { jaringan: "wifi" }, { jaringan: 1 }, 7, []]) {
      expect(bacaJaringan(buruk)).toBe(JARINGAN_BAWAAN);
    }
  });

  it("validates a value from a request", () => {
    expect(jaringanValid("internet")).toBe(true);
    expect(jaringanValid("iris_iot")).toBe(true);
    for (const buruk of ["", "IRIS_IOT", "lan", null, undefined, 3, {}]) {
      expect(jaringanValid(buruk)).toBe(false);
    }
  });

  it("keeps the address the sketches carry", () => {
    expect(ALAMAT_IRIS_IOT).toBe("192.168.4.1");
    expect(PORT_IRIS_IOT).toBe(8080);
  });
});
