import { describe, expect, it } from "vitest";
import { HOST_KUIS, tautanKuis, tiketDariAlamat } from "../kuis";

describe("quiz link helpers", () => {
  it("names the games host", () => {
    expect(HOST_KUIS).toBe("games.irisiotlab.com");
    expect(tautanKuis()).toBe("https://games.irisiotlab.com/");
  });

  it("reads a ticket from the address fragment", () => {
    expect(tiketDariAlamat("#t=abc.def")).toBe("abc.def");
    expect(tiketDariAlamat("#x=1&t=a%2Bb")).toBe("a+b");
    expect(tiketDariAlamat("")).toBeNull();
    expect(tiketDariAlamat("#other=1")).toBeNull();
    expect(tiketDariAlamat("#t=%E0%A4%A")).toBeNull();
  });
});
