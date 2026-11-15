import { afterEach, describe, expect, it } from "vitest";
import {
  ambilBersama,
  lupakanBersama,
  pakaiSekali,
  pasangBersama,
  taruhBersama,
  terimaBersama,
} from "../bersama.js";

afterEach(() => lupakanBersama());

describe("things used once", () => {
  it("lets the first caller through and refuses the rest until the time is up", async () => {
    expect(await pakaiSekali("a", 1000, 0)).toBe(true);
    expect(await pakaiSekali("a", 1000, 500)).toBe(false);
    expect(await pakaiSekali("b", 1000, 500)).toBe(true);
    expect(await pakaiSekali("a", 1000, 1500)).toBe(true);
  });

  it("asks the supervisor when there is one, and refuses when it fails", async () => {
    const asked: string[] = [];
    pasangBersama({
      sekali: async (k) => {
        asked.push(k);
        return k === "baru";
      },
      taruh: () => {},
    });
    expect(await pakaiSekali("baru", 1000)).toBe(true);
    expect(await pakaiSekali("lama", 1000)).toBe(false);
    pasangBersama({
      sekali: async () => {
        throw new Error("gone");
      },
      taruh: () => {},
    });
    expect(await pakaiSekali("x", 1000)).toBe(false);
    expect(asked).toEqual(["baru", "lama"]);
  });
});

describe("shared values", () => {
  it("remembers a value for its time and sends it to the other workers", () => {
    const dikirim: unknown[][] = [];
    pasangBersama({ sekali: async () => true, taruh: (...a) => void dikirim.push(a) });
    taruhBersama("bangun:1", "nim", 5000, 1000);
    expect(ambilBersama("bangun:1", 2000)).toBe("nim");
    expect(ambilBersama("bangun:1", 6001)).toBeUndefined();
    expect(dikirim).toEqual([["bangun:1", "nim", 5000]]);
  });

  it("takes what another worker put, unless it has already expired", () => {
    terimaBersama("k", "v", 5000, 1000);
    expect(ambilBersama("k", 2000)).toBe("v");
    terimaBersama("lama", "v", 900, 1000);
    expect(ambilBersama("lama", 500)).toBeUndefined();
  });
});
