/**
 * TP files on R2 (2026-10-21): keys and the tickets the API signs for the
 * relay. The relay's own suite (apps/relay/test/uji-tp.mjs) checks the same
 * format from the other side.
 */
import { describe, expect, it } from "vitest";
import {
  TP_KUNCI_RE,
  awalanSemester,
  bacaTiketTp,
  extTp,
  kunciTp,
  relayHttps,
  sha256Hex,
  tandaiTp,
} from "../tp-r2";

const RAHASIA = "r".repeat(40);
const SHA = "a".repeat(64);

describe("keys", () => {
  it("are content addressed under the semester", () => {
    expect(kunciTp("2026-ganjil", 2, "1032231301", SHA)).toBe(
      `tp/2026-ganjil/2/1032231301/${SHA}.pdf`,
    );
    expect(kunciTp("2026-ganjil", 1, "100002", SHA, "image/jpeg")).toMatch(/\.jpg$/);
    expect(TP_KUNCI_RE.test(kunciTp("2026-genap", 4, "100002", SHA))).toBe(true);
    expect(awalanSemester("2026-ganjil")).toBe("tp/2026-ganjil/");
  });

  it("keep an unknown type as bytes", () => {
    expect(extTp("text/html")).toBe("bin");
    expect(extTp("application/pdf; charset=binary")).toBe("pdf");
  });

  it("never escape the semester's folder", () => {
    for (const k of [
      "tp/../x.pdf",
      `tp/2026-ganjil/2/../../${SHA}.pdf`,
      `tp/2026-ganjil/9/1/${SHA}.pdf`,
    ])
      expect(TP_KUNCI_RE.test(k)).toBe(false);
  });
});

describe("tickets", () => {
  const k = kunciTp("2026-ganjil", 2, "100002", SHA);
  const kini = 1_800_000_000;

  it("read back as signed, only as their own kind", async () => {
    const t = await tandaiTp({ j: "tp-put", k, n: 10, s: SHA, h: 1, e: kini + 60 }, RAHASIA);
    expect((await bacaTiketTp(t, RAHASIA, "tp-put", kini))?.n).toBe(10);
    expect(await bacaTiketTp(t, RAHASIA, "tp-baca", kini)).toBeNull();
    expect(await bacaTiketTp(t, "x".repeat(40), "tp-put", kini)).toBeNull();
  });

  it("expire", async () => {
    const t = await tandaiTp(
      { j: "tp-baca", k, e: kini - 1, d: "i", nm: "a.pdf", m: "application/pdf" },
      RAHASIA,
    );
    expect(await bacaTiketTp(t, RAHASIA, "tp-baca", kini)).toBeNull();
  });

  it("refuse a key outside the pattern", async () => {
    const t = await tandaiTp(
      { j: "tp-put", k: "tp/../x.pdf", n: 1, s: SHA, h: 1, e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(t, RAHASIA, "tp-put", kini)).toBeNull();
  });

  it("let only the API delete a semester, and only one", async () => {
    const satu = await tandaiTp(
      { j: "tp-srv", op: "hapus-awalan", k: "tp/2026-ganjil/", s: "", e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(satu, RAHASIA, "tp-srv", kini)).not.toBeNull();
    const semua = await tandaiTp(
      { j: "tp-srv", op: "hapus-awalan", k: "tp/", s: "", e: kini + 60 },
      RAHASIA,
    );
    expect(await bacaTiketTp(semua, RAHASIA, "tp-srv", kini)).toBeNull();
  });
});

describe("helpers", () => {
  it("hash bytes", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("turn the relay's socket address into its https one", () => {
    expect(relayHttps("wss://konsol.irisiotlab.com/")).toBe("https://konsol.irisiotlab.com");
    expect(relayHttps("ws://127.0.0.1:8788")).toBe("http://127.0.0.1:8788");
  });
});
