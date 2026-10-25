/** iris_seat.h (EXAM-ENGINE 9.3): the per-seat values the agent writes beside the sketch. */
import { describe, expect, it } from "vitest";
import { HEADER_NAMES, buildHeader, type HeaderInput } from "../recruitment/lc-header";
import { checkHeader } from "../recruitment/lc-sketch";

const base: HeaderInput = {
  ssid: "Ponsel Nue",
  pass: "kata sandi 12345",
  seatId: 12,
  board: 2,
  token: "abc.def",
  mqtt: { user: "rec3s12", pass: "test".repeat(6) },
};

describe("buildHeader", () => {
  it("defines every name of 9.3", () => {
    const h = buildHeader(base);
    for (const n of HEADER_NAMES) expect(h, n).toMatch(new RegExp(`^#define ${n}\\b`, "m"));
  });

  it("derives the seat's endpoints from its token and board", () => {
    const h = buildHeader(base);
    expect(h).toContain('#define IRIS_SEAT "s12"');
    expect(h).toContain("#define IRIS_BOARD 2");
    expect(h).toContain('#define IRIS_TOPIC "rec/s12/"');
    expect(h).toContain('#define IRIS_BLE_NAME "IRIS-s12-2"');
    expect(h).toContain('#define IRIS_WS_HOST "ws.irisiotlab.com"');
    expect(h).toContain('#define IRIS_WS_PATH "/rec/w/abc.def/2"');
    expect(h).toContain('#define IRIS_HTTP_URL "http://ws.irisiotlab.com:80/rec/h/abc.def/2"');
    expect(h).toContain('#define IRIS_MQTT_URI "ws://broker.irisiotlab.com:80/rec/s/abc.def"');
    expect(h).toContain('#define IRIS_MQTT_USER "rec3s12"');
  });

  it("leaves the hotspot and MQTT account empty for a seat without them (BLE)", () => {
    const h = buildHeader({ ...base, ssid: null, pass: null, mqtt: null });
    expect(h).toContain('#define IRIS_WIFI_SSID ""');
    expect(h).toContain('#define IRIS_MQTT_PASS ""');
  });

  it("escapes quotes, backslashes and the question mark of a trigraph", () => {
    const h = buildHeader({ ...base, ssid: 'a"b\\c', pass: "??=x" });
    expect(h).toContain('#define IRIS_WIFI_SSID "a\\"b\\\\c"');
    expect(h).toContain('#define IRIS_WIFI_PASS "\\?\\?=x"');
  });

  it("keeps a non-ASCII hotspot name as it is", () => {
    expect(buildHeader({ ...base, ssid: "Ponsel Çağlar" })).toContain('"Ponsel Çağlar"');
  });

  it("refuses a value with a line break or a control character", () => {
    expect(() => buildHeader({ ...base, ssid: "a\nb" })).toThrow();
    expect(() => buildHeader({ ...base, pass: "a\u0000b" })).toThrow();
    expect(() => buildHeader({ ...base, token: "a\rb" })).toThrow();
  });

  it("is a header the agent's own check accepts", () => {
    expect(checkHeader(buildHeader(base))).toEqual({ ok: true });
  });

  it("uses only a board of 1 or 2", () => {
    expect(() => buildHeader({ ...base, board: 3 as 1 })).toThrow();
  });
});
