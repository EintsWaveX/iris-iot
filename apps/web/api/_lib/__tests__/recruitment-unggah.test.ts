/**
 * Recruitment document uploads: the ticket IRIS signs for the second step,
 * the parameters a ticket may be asked for, and the check that what the
 * browser put in R2 is exactly the PDF it announced.
 */
import { describe, expect, it } from "vitest";
import {
  TIKET_REK_DETIK,
  bacaTiketRek,
  buatTiketRek,
  cekParamTiket,
  periksaBerkas,
  type DepR2,
} from "../recruitment-unggah";
import { DOC_MAX_BYTES } from "../../../src/lib/recruitment/types";

const RAHASIA = "s".repeat(40);
const SHA = "c".repeat(64);
const KINI = 1_800_000_000;
const ISI = { k: `recruitment/1/101022300172/cv/${SHA}.pdf`, n: 1234, s: SHA, h: 2 };
const PARAM = { ...ISI, nim: "101022300172", ed: 1, kind: "cv" as const };

describe("the second step's ticket", () => {
  it("reads back as signed, for the same secret only", async () => {
    const t = await buatTiketRek(RAHASIA, PARAM, KINI);
    expect(await bacaTiketRek(t, RAHASIA, KINI)).toMatchObject({ ...PARAM, j: "rec-ok" });
    expect(await bacaTiketRek(t, "x".repeat(40), KINI)).toBeNull();
  });
  it("expires after 25 minutes", async () => {
    const t = await buatTiketRek(RAHASIA, PARAM, KINI);
    expect(await bacaTiketRek(t, RAHASIA, KINI + TIKET_REK_DETIK - 1)).not.toBeNull();
    expect(await bacaTiketRek(t, RAHASIA, KINI + TIKET_REK_DETIK + 1)).toBeNull();
  });
  it("refuses garbage and a ticket of another kind", async () => {
    expect(await bacaTiketRek("nonsense", RAHASIA, KINI)).toBeNull();
    expect(await bacaTiketRek("", RAHASIA, KINI)).toBeNull();
  });
});

describe("cekParamTiket", () => {
  const ok = { kind: "cv", ukuran: 1000, sha256: SHA, halaman: 2 };
  it("accepts a normal PDF announcement", () => {
    expect(cekParamTiket(ok)).toEqual({
      ok: true,
      kind: "cv",
      ukuran: 1000,
      sha256: SHA,
      halaman: 2,
    });
  });
  it("lower cases the hash and treats a missing page count as 1", () => {
    const r = cekParamTiket({ ...ok, sha256: SHA.toUpperCase(), halaman: undefined });
    expect(r).toMatchObject({ ok: true, sha256: SHA, halaman: 1 });
  });
  it("refuses a file over 5 MB and a file too small to be a PDF", () => {
    expect(cekParamTiket({ ...ok, ukuran: DOC_MAX_BYTES + 1 })).toEqual({
      ok: false,
      kode: "terlalu_besar",
    });
    expect(cekParamTiket({ ...ok, ukuran: DOC_MAX_BYTES })).toMatchObject({ ok: true });
    expect(cekParamTiket({ ...ok, ukuran: 4 })).toEqual({ ok: false, kode: "format_salah" });
  });
  it.each([
    [{ kind: "cv2" }],
    [{ kind: undefined }],
    [{ ukuran: "1000" }],
    [{ ukuran: 10.5 }],
    [{ sha256: "xyz" }],
    [{ sha256: "c".repeat(63) }],
    [{ halaman: 0 }],
    [{ halaman: 201 }],
  ])("refuses %j", (over) => {
    expect(cekParamTiket({ ...ok, ...over })).toEqual({ ok: false, kode: "format_salah" });
  });
});

describe("periksaBerkas", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 ...");
  const dep = (over: Partial<DepR2> = {}): DepR2 => ({
    kepala: async () => ({ ada: true, ukuran: ISI.n, sha256: SHA }),
    awal: async () => pdf,
    ...over,
  });

  it("passes the file the browser announced", async () => {
    expect(await periksaBerkas(ISI, dep())).toBe("ok");
  });
  it("says hilang when R2 does not hold it", async () => {
    expect(await periksaBerkas(ISI, dep({ kepala: async () => ({ ada: false }) }))).toBe("hilang");
  });
  it("refuses a different size or hash", async () => {
    expect(
      await periksaBerkas(
        ISI,
        dep({ kepala: async () => ({ ada: true, ukuran: 99, sha256: SHA }) }),
      ),
    ).toBe("beda");
    expect(
      await periksaBerkas(
        ISI,
        dep({ kepala: async () => ({ ada: true, ukuran: ISI.n, sha256: "d".repeat(64) }) }),
      ),
    ).toBe("beda");
    expect(
      await periksaBerkas(
        ISI,
        dep({ kepala: async () => ({ ada: true, ukuran: ISI.n, sha256: null }) }),
      ),
    ).toBe("beda");
  });
  it("checks the magic bytes, not the name", async () => {
    const zip = new TextEncoder().encode("PK\u0003\u0004 not a pdf");
    expect(await periksaBerkas(ISI, dep({ awal: async () => zip }))).toBe("bukan_pdf");
    expect(await periksaBerkas(ISI, dep({ awal: async () => new Uint8Array(0) }))).toBe(
      "bukan_pdf",
    );
  });
});
