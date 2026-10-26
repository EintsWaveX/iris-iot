/**
 * The bank's R2 keys (prompt 09): a reference snapshot under `ref/`, a picture
 * under `bank/`. Content addressed, under the edition, and nothing else; and
 * the header check the relay runs on a picture.
 */
import { describe, expect, it } from "vitest";
import {
  REK_AWALAN_RE,
  REK_BANK_RE,
  REK_REF_RE,
  awalOk,
  bacaTiketTp,
  kunciBank,
  kunciRef,
  tandaiTp,
} from "../tp-r2";

const RAHASIA = "r".repeat(40);
const SHA = "c".repeat(64);
const kini = 1_800_000_000;

describe("bank keys", () => {
  it("sit under the edition, content addressed", () => {
    expect(kunciRef(1, SHA)).toBe(`recruitment/1/ref/${SHA}.html`);
    expect(kunciBank(1, SHA, "png")).toBe(`recruitment/1/bank/${SHA}.png`);
    expect(REK_REF_RE.test(kunciRef(12, SHA))).toBe(true);
    expect(REK_BANK_RE.test(kunciBank(12, SHA, "svg"))).toBe(true);
  });

  it("never escape their folder or take another type", () => {
    for (const k of [
      `recruitment/1/ref/../x/${SHA}.html`,
      `recruitment/1/ref/${SHA}.pdf`,
      `recruitment/1/ref/${"C".repeat(64)}.html`,
      `recruitment/1/ref/${SHA.slice(2)}.html`,
      `recruitment/x/ref/${SHA}.html`,
    ])
      expect(REK_REF_RE.test(k), k).toBe(false);
    for (const k of [
      `recruitment/1/bank/${SHA}.html`,
      `recruitment/1/bank/${SHA}.gif`,
      `recruitment/1/bank/${SHA}.png/../x`,
      `recruitment/1/bank/a/${SHA}.png`,
    ])
      expect(REK_BANK_RE.test(k), k).toBe(false);
    expect(() => kunciBank(1, SHA, "exe")).toThrow();
    expect(() => kunciRef(1, "nope")).toThrow();
  });
});

describe("relay tickets for a bank key", () => {
  it("are accepted for put, read and the API's own calls", async () => {
    for (const k of [kunciRef(1, SHA), kunciBank(1, SHA, "webp")]) {
      const put = await tandaiTp({ j: "tp-put", k, n: 10, s: SHA, h: 1, e: kini + 60 }, RAHASIA);
      expect((await bacaTiketTp(put, RAHASIA, "tp-put", kini))?.k).toBe(k);
      const srv = await tandaiTp({ j: "tp-srv", op: "put", k, s: SHA, e: kini + 60 }, RAHASIA);
      expect((await bacaTiketTp(srv, RAHASIA, "tp-srv", kini))?.k).toBe(k);
    }
  });

  it("still refuse a prefix as a file and a file as a prefix", async () => {
    const a = await tandaiTp(
      { j: "tp-put", k: "recruitment/1/ref/", n: 1, s: SHA, h: 1, e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(a, RAHASIA, "tp-put", kini)).toBeNull();
    const b = await tandaiTp(
      { j: "tp-srv", op: "hapus-awalan", k: kunciRef(1, SHA), s: "", e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(b, RAHASIA, "tp-srv", kini)).toBeNull();
    expect(REK_AWALAN_RE.test("recruitment/1/")).toBe(true);
  });
});

describe("awalOk (the header of an upload)", () => {
  const b = (...xs: number[]) => new Uint8Array([...xs, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const text = (s: string) => new TextEncoder().encode(s);

  it("a picture must start like its key says", () => {
    expect(awalOk("x/a.png", b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(awalOk("x/a.jpg", b(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(awalOk("x/a.webp", text("RIFF\0\0\0\0WEBPVP8 "))).toBe(true);
    expect(awalOk("x/a.pdf", text("%PDF-1.7"))).toBe(true);
    // A PDF, a script or HTML under a picture's name is refused.
    expect(awalOk("x/a.png", text("%PDF-1.7 pad pad"))).toBe(false);
    expect(awalOk("x/a.jpg", text("<html><script>alert(1)"))).toBe(false);
    expect(awalOk("x/a.webp", text("RIFF\0\0\0\0WAVEfmt "))).toBe(false);
  });

  it("an SVG must open a tag, and an unknown type is refused", () => {
    expect(awalOk("x/a.svg", text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(true);
    expect(awalOk("x/a.svg", text('﻿  <?xml version="1.0"?><!-- c --><svg></svg>'))).toBe(true);
    expect(awalOk("x/a.svg", text("<html></html>"))).toBe(false);
    expect(awalOk("x/a.svg", text("plain text"))).toBe(false);
    expect(awalOk("x/a.html", text("<html>"))).toBe(false);
    expect(awalOk("x/a", text("<svg>"))).toBe(false);
  });
});
