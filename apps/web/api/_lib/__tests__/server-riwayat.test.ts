import { describe, expect, it } from "vitest";
import { downsample } from "../../../src/lib/server-lib";
import { jarakPilih } from "../server-riwayat";

/** The test the chart query runs per row, as integer arithmetic: position k stays when i * n < maks * (k + 1)
 *  for i = ceil(maks * k / n). Must pick exactly the positions `jarakPilih` and `downsample` name. */
const sqlMemilih = (k: number, n: number, maks: number) =>
  n <= maks || Math.floor((k * maks + n - 1) / n) * n < maks * (k + 1);

describe("which heartbeats the chart keeps", () => {
  it("jarakPilih names the rows downsample picks", () => {
    for (const n of [0, 1, 5, 299, 300, 301, 450, 1000, 8639, 30088]) {
      const rows = Array.from({ length: n }, (_, k) => k);
      expect(jarakPilih(n, 300)).toEqual(downsample(rows, 300));
    }
  });

  it("the SQL's integer test keeps exactly those positions", () => {
    for (const n of [1, 2, 299, 300, 301, 302, 450, 599, 601, 1000, 9878, 30088]) {
      const kept = Array.from({ length: n }, (_, k) => k).filter((k) => sqlMemilih(k, n, 300));
      expect(kept).toEqual(jarakPilih(n, 300));
    }
  });
});
