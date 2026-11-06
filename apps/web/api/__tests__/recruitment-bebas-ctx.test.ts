/**
 * Free mode on the server follows the practice context, and nothing else: a request that never entered
 * practice must see it false, even while a practice request is in flight at the same time.
 */
import { describe, expect, it } from "vitest";
import { bebas } from "../../src/lib/recruitment/bebas";
import { jalankanLatihan, type KonteksLatihan } from "../_lib/recruitment-latihan-ctx";

const konteks: KonteksLatihan = {
  mode: "caas",
  nim: "101022300001",
  nama: "Latih",
  edisi: { id: 2, year: 3026, title: "Latihan", status: "latihan" } as KonteksLatihan["edisi"],
};
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("bebas on the server", () => {
  it("is false outside a practice context", () => {
    expect(bebas()).toBe(false);
  });
  it("is true inside one, and false again right after", async () => {
    const dalam = await jalankanLatihan(konteks, async () => bebas());
    expect(dalam).toBe(true);
    expect(bebas()).toBe(false);
  });
  it("stays false for a live request that runs while a practice request is awaiting", async () => {
    const lihat: Record<string, boolean> = {};
    await Promise.all([
      jalankanLatihan(konteks, async () => {
        await tunggu(30);
        lihat.latihan = bebas();
      }),
      (async () => {
        await tunggu(5);
        lihat.live = bebas();
      })(),
    ]);
    expect(lihat).toEqual({ latihan: true, live: false });
  });
});
