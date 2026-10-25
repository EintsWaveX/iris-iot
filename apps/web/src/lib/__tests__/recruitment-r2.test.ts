/**
 * Recruitment documents in R2: the key shape under recruitment/ and the
 * relay's tickets accepting it. The TP suite (tp-r2.test.ts) keeps checking
 * that tp/ keys behave as before.
 */
import { describe, expect, it } from "vitest";
import {
  REK_AWALAN_RE,
  REK_KUNCI_RE,
  TP_KUNCI_RE,
  awalanRekrutmen,
  bacaTiketTp,
  kunciRekrutmen,
  tandaiTp,
} from "../tp-r2";
import { DOC_KINDS } from "../recruitment/types";

const RAHASIA = "r".repeat(40);
const SHA = "b".repeat(64);
const kini = 1_800_000_000;

describe("recruitment keys", () => {
  it("sit under the edition, the NIM and the kind, content addressed", () => {
    const k = kunciRekrutmen(1, "101022300172", "cv", SHA);
    expect(k).toBe(`recruitment/1/101022300172/cv/${SHA}.pdf`);
    expect(REK_KUNCI_RE.test(k)).toBe(true);
    expect(TP_KUNCI_RE.test(k)).toBe(false);
    expect(awalanRekrutmen(1)).toBe("recruitment/1/");
    expect(REK_AWALAN_RE.test(awalanRekrutmen(12))).toBe(true);
  });
  it("never escape their folder or take another kind or type", () => {
    for (const k of [
      `recruitment/1/../x/cv/${SHA}.pdf`,
      `recruitment/1/101022300172/cv/../../${SHA}.pdf`,
      `recruitment/1/101022300172/payroll/${SHA}.pdf`,
      `recruitment/1/101022300172/cv/${SHA}.zip`,
      `recruitment/x/101022300172/cv/${SHA}.pdf`,
      `recruitment/1/101022300172/cv/${"B".repeat(64)}.pdf`,
      `recruitment/1/12/cv/${SHA}.pdf`,
    ])
      expect(REK_KUNCI_RE.test(k), k).toBe(false);
  });
  it("take every document kind, so the relay accepts each one the API hands a ticket for", () => {
    for (const kind of DOC_KINDS)
      expect(REK_KUNCI_RE.test(kunciRekrutmen(1, "101022300172", kind, SHA)), kind).toBe(true);
  });
  it("throw on a NIM that is not safe in a key", () => {
    expect(() => kunciRekrutmen(1, "../etc", "cv", SHA)).toThrow();
  });
});

describe("relay tickets for a recruitment key", () => {
  const k = kunciRekrutmen(1, "101022300172", "letter", SHA);

  it("are accepted for put, read and the API's own calls", async () => {
    const put = await tandaiTp({ j: "tp-put", k, n: 10, s: SHA, h: 1, e: kini + 60 }, RAHASIA);
    expect((await bacaTiketTp(put, RAHASIA, "tp-put", kini))?.k).toBe(k);
    const baca = await tandaiTp(
      { j: "tp-baca", k, e: kini + 60, d: "i", nm: "x.pdf", m: "application/pdf" },
      RAHASIA,
    );
    expect((await bacaTiketTp(baca, RAHASIA, "tp-baca", kini))?.k).toBe(k);
    const srv = await tandaiTp({ j: "tp-srv", op: "head", k, s: "", e: kini + 60 }, RAHASIA);
    expect((await bacaTiketTp(srv, RAHASIA, "tp-srv", kini))?.k).toBe(k);
  });
  it("delete a whole edition by its prefix and nothing broader", async () => {
    const ok = await tandaiTp(
      { j: "tp-srv", op: "hapus-awalan", k: awalanRekrutmen(1), s: "", e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(ok, RAHASIA, "tp-srv", kini)).not.toBeNull();
    for (const awalan of ["recruitment/", "recruitment/1/101022300172/", "recruitment/"]) {
      const t = await tandaiTp(
        { j: "tp-srv", op: "hapus-awalan", k: awalan, s: "", e: kini + 60 },
        RAHASIA,
      );
      expect(await bacaTiketTp(t, RAHASIA, "tp-srv", kini), awalan).toBeNull();
    }
  });
  it("refuse a prefix as a file key and a file key as a prefix", async () => {
    const a = await tandaiTp(
      { j: "tp-put", k: awalanRekrutmen(1), n: 1, s: SHA, h: 1, e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(a, RAHASIA, "tp-put", kini)).toBeNull();
    const b = await tandaiTp({ j: "tp-srv", op: "hapus-awalan", k, s: "", e: kini + 60 }, RAHASIA);
    expect(await bacaTiketTp(b, RAHASIA, "tp-srv", kini)).toBeNull();
  });
});
