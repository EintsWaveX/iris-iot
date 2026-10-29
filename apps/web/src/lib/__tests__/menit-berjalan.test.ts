import { afterEach, describe, expect, it } from "vitest";
import { menitBerjalan } from "../app";
import { aturUlangJam, catatJam } from "../jam";

afterEach(() => aturUlangJam());

describe("menitBerjalan with a wrong device clock", () => {
  const mulai = "2026-10-29T02:24:35.621Z"; // session 48 started
  const sebenarnya = Date.parse("2026-10-29T03:10:54Z"); // 46 minutes in

  it("counts from the device clock when nothing is measured", () => {
    expect(menitBerjalan(mulai, sebenarnya)).toBe(46);
  });

  it("a device 80 minutes ahead would read 126 minutes in (the bug)", () => {
    expect(menitBerjalan(mulai, sebenarnya + 80 * 60_000)).toBe(126);
  });

  it("with the server's offset measured, the same wrong clock reads right", () => {
    // The device's clock is 80 minutes ahead of the server's.
    const perangkat = sebenarnya + 80 * 60_000;
    catatJam(new Date(sebenarnya).toUTCString(), perangkat - 100, perangkat + 100);
    expect(menitBerjalan(mulai, perangkat)).toBe(46);
  });

  it("an explicit offset can be passed", () => {
    expect(menitBerjalan(mulai, sebenarnya + 80 * 60_000, -80 * 60_000)).toBe(46);
  });
});
