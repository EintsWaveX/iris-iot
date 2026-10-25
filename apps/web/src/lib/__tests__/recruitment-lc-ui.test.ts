// Live Coding's page rules without React (prompt 12): the build log read into editor links, the chip esptool
// found, the reels' timing for each motion level, the TODO region and the traffic list.
import { describe, expect, it } from "vitest";
import {
  addLines,
  bleText,
  chipOf,
  clock,
  FLASH_BAUDS,
  isProblemLine,
  lastPerTopic,
  myPlace,
  otherChip,
  parseBuildLog,
  reelTiming,
  shouldPlay,
  todoRanges,
  type TrafficLine,
} from "../recruitment/lc-ui";

describe("parseBuildLog", () => {
  const log = [
    "Sketch uses 1155728 bytes (88%)",
    "sketch/s.ino: In function 'void setup()':",
    "sketch/s.ino:14:3: error: 'led' was not declared in this scope",
    "sketch/s.ino:20: warning: unused variable 'x'",
    "iris_seat.h:3:1: error: not the candidate's file",
    "sketch/s.ino:31:12: fatal error: Nope.h: No such file or directory",
  ].join("\n");

  it("reads errors and warnings of the candidate's file with line and column", () => {
    expect(parseBuildLog(log)).toEqual([
      { line: 14, col: 3, level: "error", text: "'led' was not declared in this scope" },
      { line: 20, col: null, level: "warning", text: "unused variable 'x'" },
      { line: 31, col: 12, level: "error", text: "Nope.h: No such file or directory" },
    ]);
  });
  it("leaves the header's and the compiler's other lines alone", () => {
    expect(parseBuildLog("iris_seat.h:3:1: error: x\nanything else")).toEqual([]);
  });
  it("marks the lines that carry a problem", () => {
    expect(isProblemLine("sketch/s.ino:14:3: error: x")).toBe(true);
    expect(isProblemLine("Sketch uses 1 bytes")).toBe(false);
  });
});

describe("chipOf", () => {
  it("tells the two chips from esptool's descriptions", () => {
    expect(chipOf("ESP32-D0WD-V3 (revision v3.1)")).toBe("esp32");
    expect(chipOf("ESP32-S3 (QFN56) (revision v0.2)")).toBe("esp32s3");
    expect(chipOf("ESP32-PICO-D4 (revision v1.1)")).toBe("esp32");
    expect(chipOf("ESP32-C3 (revision v0.4)")).toBe("other");
    expect(chipOf("ESP32-S2")).toBe("other");
    expect(chipOf("ESP8266")).toBe("other");
  });
  it("offers the other chip", () => {
    expect(otherChip("esp32")).toBe("esp32s3");
    expect(otherChip("esp32s3")).toBe("esp32");
  });
  it("flashes fast first and falls back", () => {
    expect([...FLASH_BAUDS]).toEqual([921600, 460800, 115200]);
  });
});

describe("reelTiming", () => {
  it("follows the motion specs", () => {
    expect(reelTiming("topic", "full")).toMatchObject({
      perCell: 55,
      steady: 14,
      decel: 2100,
      blur: true,
      ring: true,
      jump: false,
    });
    expect(reelTiming("protocol", "full")).toMatchObject({ steady: 8, decel: 1500 });
    expect(reelTiming("topic", "ldm")).toMatchObject({
      perCell: 45,
      decel: 1200,
      blur: false,
      ring: false,
    });
    expect(reelTiming("protocol", "ldm").decel).toBe(900);
  });
  it("does not move at all under reduced motion", () => {
    const r = reelTiming("topic", "reduce");
    expect(r).toMatchObject({ jump: true, decel: 0, blur: false });
  });
});

describe("shouldPlay", () => {
  it("plays a new result once", () => {
    const seen = new Set<string>();
    expect(shouldPlay(seen, "topic", 1000, 2000, false)).toBe(true);
    seen.add("topic:1000");
    expect(shouldPlay(seen, "topic", 1000, 2000, false)).toBe(false);
  });
  it("does not replay what a reload finds old", () => {
    expect(shouldPlay(new Set(), "protocol", 1000, 100_000, true)).toBe(false);
    expect(shouldPlay(new Set(), "protocol", 90_000, 100_000, true)).toBe(true);
  });
});

describe("todoRanges", () => {
  it("finds the marked regions", () => {
    const code = [
      "a",
      "// TODO-MULAI",
      "x",
      "// TODO-SELESAI",
      "b",
      "  // TODO-MULAI",
      "// TODO-SELESAI",
    ].join("\n");
    expect(todoRanges(code)).toEqual([
      { from: 2, to: 4 },
      { from: 6, to: 7 },
    ]);
  });
  it("ignores an end without a start", () => {
    expect(todoRanges("// TODO-SELESAI")).toEqual([]);
  });
});

describe("traffic", () => {
  const l = (t: number, d = "x", extra: Partial<TrafficLine> = {}): TrafficLine => ({
    t,
    s: 7,
    via: "ws",
    dir: "up",
    k: "frame",
    n: 1,
    d,
    ...extra,
  });
  it("keeps lines in time order without duplicates", () => {
    const a = addLines([], [l(2), l(1)]);
    expect(a.map((x) => x.t)).toEqual([1, 2]);
    expect(addLines(a, [l(2), l(3)]).map((x) => x.t)).toEqual([1, 2, 3]);
  });
  it("caps the list at the newest 400", () => {
    const many = Array.from({ length: 450 }, (_, i) => l(i, String(i)));
    const r = addLines([], many);
    expect(r).toHaveLength(400);
    expect(r[0].t).toBe(50);
  });
  it("keeps the last value per MQTT topic of the seat", () => {
    const lines = [
      l(1, "28", { via: "mqtt", k: "rec/s7/up/suhu" }),
      l(2, "29", { via: "mqtt", k: "rec/s7/up/suhu" }),
      l(3, "nyala", { via: "mqtt", dir: "down", k: "rec/s7/down/led" }),
      l(4, "x", { via: "mqtt", k: "rec/s9/up/suhu" }),
    ];
    const m = lastPerTopic(lines, 7);
    expect([...m.keys()].sort()).toEqual(["rec/s7/down/led", "rec/s7/up/suhu"]);
    expect(m.get("rec/s7/up/suhu")?.d).toBe("29");
  });
  it("stamps a time like the serial lines", () => {
    expect(clock(0)).toMatch(/^\d\d:\d\d:\d\d:\d{3}$/);
  });
});

describe("bleText", () => {
  it("reads clean UTF-8 and keeps the base64", () => {
    expect(bleText(new TextEncoder().encode("nyala"))).toEqual({
      text: "nyala",
      b64: btoa("nyala"),
    });
  });
  it("shows raw bytes as hex", () => {
    expect(bleText(Uint8Array.of(1, 255, 16)).text).toBe("01 ff 10");
  });
});

describe("myPlace", () => {
  const chips = [
    { seat: 3, board: 1, state: "diambil", mine: false },
    { seat: 9, board: 1, state: "antre", mine: false },
    { seat: 5, board: 2, state: "antre", mine: true },
    { seat: 5, board: 1, state: "antre", mine: true },
  ] as const;
  it("counts the waiting chips up to mine", () => {
    expect(myPlace([...chips], 2)).toBe(2);
    expect(myPlace([...chips], 1)).toBe(3);
  });
  it("is 0 while it compiles and null when not in line", () => {
    expect(myPlace([{ seat: 1, board: 1, state: "diambil", mine: true }], 1)).toBe(0);
    expect(myPlace([...chips], 2 as 1 | 2)).not.toBeNull();
    expect(myPlace([], 1)).toBeNull();
  });
});
