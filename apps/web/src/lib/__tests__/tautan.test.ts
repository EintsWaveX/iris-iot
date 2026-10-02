import { describe, expect, it } from "vitest";
import { bacaTautan, namaLayanan, tautanBingkai, TAUTAN_SKEMA, TAUTAN_SLIDES } from "../tautan";

describe("slide links", () => {
  it("turns a Canva view link into its embed address", () => {
    expect(
      bacaTautan(
        "https://www.canva.com/design/DAF8xQ2abcd/k3yAbc-_9/view?utm_content=x&utm_source=share",
        TAUTAN_SLIDES,
      ),
    ).toEqual({
      ok: true,
      jenis: "canva",
      url: "https://www.canva.com/design/DAF8xQ2abcd/k3yAbc-_9/view?embed",
    });
  });
  it("accepts a watch link and a link without the share key", () => {
    expect(bacaTautan("https://canva.com/design/DAF8x/abc/watch", TAUTAN_SLIDES)).toMatchObject({
      ok: true,
      url: "https://www.canva.com/design/DAF8x/abc/view?embed",
    });
    expect(bacaTautan("https://www.canva.com/design/DAF8x/view", TAUTAN_SLIDES)).toMatchObject({
      ok: true,
      url: "https://www.canva.com/design/DAF8x/view?embed",
    });
  });
  it("refuses an edit link with its own reason", () => {
    expect(bacaTautan("https://www.canva.com/design/DAF8x/abc/edit", TAUTAN_SLIDES)).toEqual({
      ok: false,
      kode: "canva_edit",
    });
  });
  it("refuses Wokwi and images for slides", () => {
    expect(bacaTautan("https://wokwi.com/projects/322062421191557714", TAUTAN_SLIDES).ok).toBe(
      false,
    );
    expect(bacaTautan("https://example.com/a.png", TAUTAN_SLIDES).ok).toBe(false);
  });
  it("refuses anything that is not an https link", () => {
    for (const s of [
      "",
      "canva.com/design/DAF8x/abc/view",
      "http://www.canva.com/design/DAF8x/abc/view",
      "javascript:alert(1)",
      "https://user:pw@www.canva.com/design/DAF8x/abc/view",
      `https://www.canva.com/design/${"x".repeat(600)}/view`,
    ]) {
      expect(bacaTautan(s, TAUTAN_SLIDES)).toEqual({ ok: false, kode: "bukan_tautan" });
    }
  });
  it("does not trust a look-alike host", () => {
    expect(
      bacaTautan("https://www.canva.com.evil.io/design/DAF8x/abc/view", TAUTAN_SLIDES),
    ).toEqual({ ok: false, kode: "tidak_didukung" });
  });
});

describe("schematic links", () => {
  it("keeps a Wokwi project link", () => {
    expect(bacaTautan("https://wokwi.com/projects/322062421191557714/", TAUTAN_SKEMA)).toEqual({
      ok: true,
      jenis: "wokwi",
      url: "https://wokwi.com/projects/322062421191557714",
    });
  });
  it("turns a Tinkercad share link into its embed address", () => {
    for (const s of [
      "https://www.tinkercad.com/things/bprAfOab3cl",
      "https://www.tinkercad.com/things/bprAfOab3cl-arduino-code-example",
      "https://www.tinkercad.com/things/bprAfOab3cl-arduino-code-example/edit",
      "https://www.tinkercad.com/embed/bprAfOab3cl?editbtn=1",
    ]) {
      expect(bacaTautan(s, TAUTAN_SKEMA)).toEqual({
        ok: true,
        jenis: "tinkercad",
        url: "https://www.tinkercad.com/embed/bprAfOab3cl",
      });
    }
  });
  it("accepts a direct https image and keeps it as an image", () => {
    const r = bacaTautan("https://i.imgur.com/AbC123.PNG", TAUTAN_SKEMA);
    expect(r).toEqual({ ok: true, jenis: "gambar", url: "https://i.imgur.com/AbC123.PNG" });
    expect(tautanBingkai("https://i.imgur.com/AbC123.PNG")).toBe(false);
    expect(tautanBingkai("https://wokwi.com/projects/322062421191557714")).toBe(true);
  });
  it("refuses a page that is neither a known service nor an image", () => {
    expect(bacaTautan("https://example.com/schematic", TAUTAN_SKEMA)).toEqual({
      ok: false,
      kode: "tidak_didukung",
    });
    expect(bacaTautan("https://wokwi.com/arduino/libraries", TAUTAN_SKEMA)).toEqual({
      ok: false,
      kode: "tidak_didukung",
    });
  });
  it("names the service for labels", () => {
    expect(namaLayanan("https://www.tinkercad.com/embed/bprAfOab3cl")).toBe("Tinkercad");
    expect(namaLayanan("https://i.imgur.com/a.png")).toBe("i.imgur.com");
    expect(namaLayanan("https://example.com/x")).toBe("");
  });
});
