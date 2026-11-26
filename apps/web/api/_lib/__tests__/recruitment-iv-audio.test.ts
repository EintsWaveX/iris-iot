import { describe, expect, it } from "vitest";
import { audioCocok, bacaRentang, tipeDasar } from "../recruitment-iv-audio";

const buf = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("the voice recording upload", () => {
  it("accepts audio only when the first bytes agree with the type", () => {
    expect(audioCocok("audio/webm", buf(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(audioCocok("audio/webm", buf(0x00, 0x45, 0xdf, 0xa3))).toBe(false);
    expect(audioCocok("audio/ogg", Buffer.from("OggS\0\0\0\0\0\0\0\0\0"))).toBe(true);
    expect(audioCocok("audio/ogg", buf(0x1a, 0x45, 0xdf, 0xa3))).toBe(false);
    expect(audioCocok("audio/mp4", Buffer.from("\0\0\0\x18ftypM4A \0\0\0\0"))).toBe(true);
    expect(audioCocok("audio/mp4", Buffer.from("not audio at all, really"))).toBe(false);
    expect(audioCocok("text/html", Buffer.from("<script>"))).toBe(false);
  });

  it("keeps only the type before the codecs", () => {
    expect(tipeDasar("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(tipeDasar(" Audio/OGG ; codecs=opus")).toBe("audio/ogg");
    expect(tipeDasar(undefined)).toBe("");
  });
});

describe("the byte ranges of a player seeking", () => {
  it("sends everything with no range", () => {
    expect(bacaRentang(undefined, 1000)).toBeNull();
    expect(bacaRentang("", 1000)).toBeNull();
  });
  it("reads a start, a closed range and the last n bytes", () => {
    expect(bacaRentang("bytes=0-", 1000)).toEqual({ mulai: 0, akhir: 999 });
    expect(bacaRentang("bytes=100-199", 1000)).toEqual({ mulai: 100, akhir: 199 });
    expect(bacaRentang("bytes=900-5000", 1000)).toEqual({ mulai: 900, akhir: 999 });
    expect(bacaRentang("bytes=-100", 1000)).toEqual({ mulai: 900, akhir: 999 });
    expect(bacaRentang("bytes=-5000", 1000)).toEqual({ mulai: 0, akhir: 999 });
  });
  it("refuses what cannot be met", () => {
    expect(bacaRentang("bytes=1000-", 1000)).toBe("salah");
    expect(bacaRentang("bytes=500-100", 1000)).toBe("salah");
    expect(bacaRentang("bytes=-", 1000)).toBe("salah");
    expect(bacaRentang("bytes=-0", 1000)).toBe("salah");
    expect(bacaRentang("items=0-1", 1000)).toBe("salah");
  });
});
