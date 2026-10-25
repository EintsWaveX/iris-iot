/** Live Coding's objects in R2: a compiled image per job and a traffic log per seat (EXAM-ENGINE 9.4, 9.7). */
import { describe, expect, it } from "vitest";
import { kunciLcBin, kunciLcTraffic, isiCocok, putBebas } from "../recruitment/lc-r2";
import { bacaTiketTp, tandaiTp, sekarangDetik } from "../tp-r2";

const SECRET = "s".repeat(40);

describe("keys", () => {
  it("are recruitment/<edition>/lc/<seat>/<job>.bin and traffic.jsonl", () => {
    expect(kunciLcBin(4, 12, 301)).toBe("recruitment/4/lc/12/301.bin");
    expect(kunciLcTraffic(4, 12)).toBe("recruitment/4/lc/12/traffic.jsonl");
  });
  it("a warm-up job has no seat", () => {
    expect(kunciLcBin(4, "warm", 9)).toBe("recruitment/4/lc/warm/9.bin");
  });
  it("refuse ids that are not whole numbers", () => {
    expect(() => kunciLcBin(4, 12, -1)).toThrow();
    expect(() => kunciLcBin(4, 1.5, 3)).toThrow();
  });
});

describe("tickets for those keys", () => {
  const put = (k: string) =>
    tandaiTp({ j: "tp-put", k, n: 10, s: "a".repeat(64), h: 0, e: sekarangDetik() + 60 }, SECRET);

  it("the relay accepts a put ticket for an image key and for the traffic log", async () => {
    expect(await bacaTiketTp(await put(kunciLcBin(4, 12, 301)), SECRET, "tp-put")).not.toBeNull();
    expect(await bacaTiketTp(await put(kunciLcTraffic(4, 12)), SECRET, "tp-put")).not.toBeNull();
    expect(await bacaTiketTp(await put(kunciLcBin(4, "warm", 9)), SECRET, "tp-put")).not.toBeNull();
  });

  it("still refuses a key outside the known shapes", async () => {
    for (const k of [
      "recruitment/4/lc/12/../../x.bin",
      "recruitment/4/lc/12/301.exe",
      "recruitment/4/lc//301.bin",
      "recruitment/4/other/12/301.bin",
    ])
      expect(await bacaTiketTp(await put(k), SECRET, "tp-put"), k).toBeNull();
  });
});

describe("putBebas (an agent's upload, size and hash unknown until it has compiled)", () => {
  it("is for an exam image key with n 0 and no hash", () => {
    expect(putBebas({ k: kunciLcBin(4, 12, 1), n: 0, s: "" })).toBe(true);
    expect(putBebas({ k: kunciLcBin(4, "warm", 1), n: 0, s: "" })).toBe(true);
  });
  it("is not for the traffic log, a document, or a ticket that names a size", () => {
    expect(putBebas({ k: kunciLcTraffic(4, 12), n: 0, s: "" })).toBe(false);
    expect(
      putBebas({ k: `recruitment/4/101022300172/cv/${"a".repeat(64)}.pdf`, n: 0, s: "" }),
    ).toBe(false);
    expect(putBebas({ k: kunciLcBin(4, 12, 1), n: 5, s: "" })).toBe(false);
    expect(putBebas({ k: kunciLcBin(4, 12, 1), n: 0, s: "a".repeat(64) })).toBe(false);
  });
});

describe("isiCocok (what the relay checks before it keeps the bytes)", () => {
  const image = Uint8Array.of(0xe9, 1, 2, 3);
  it("an image key needs the ESP image magic", () => {
    expect(isiCocok(kunciLcBin(4, 12, 1), image)).toBe(true);
    expect(isiCocok(kunciLcBin(4, 12, 1), Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(false);
    expect(isiCocok(kunciLcBin(4, 12, 1), new Uint8Array(0))).toBe(false);
  });
  it("a document key still needs the PDF header", () => {
    const k = `recruitment/4/101022300172/cv/${"a".repeat(64)}.pdf`;
    expect(isiCocok(k, Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 1))).toBe(true);
    expect(isiCocok(k, image)).toBe(false);
  });
  it("the traffic log is text and has no header to check", () => {
    expect(isiCocok(kunciLcTraffic(4, 12), new TextEncoder().encode('{"t":1}\n'))).toBe(true);
  });
});
