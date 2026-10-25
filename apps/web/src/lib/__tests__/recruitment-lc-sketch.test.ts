/** The sketch rules the API applies before a compile job is queued (the agent applies the same ones again). */
import { describe, expect, it } from "vitest";
import { checkHeader, checkSketch } from "../recruitment/lc-sketch";

const GOOD = '#include "iris_seat.h"\nvoid setup() {}\nvoid loop() {}\n';

describe("checkSketch", () => {
  it("lets a plain sketch through", () => {
    expect(checkSketch(GOOD)).toEqual({ ok: true });
    expect(checkSketch('#include <WiFi.h>\n#include "DHT.h"\n#include <esp_mqtt/x.h>')).toEqual({
      ok: true,
    });
  });

  it("refuses an include that reaches outside the sketch", () => {
    for (const s of [
      '#include "/etc/passwd"',
      "#include </etc/shadow>",
      '#include "C:/Windows/win.ini"',
      '#include "../secret.h"',
      '#include "a\\b.h"',
      "  #  include <sub/../../x.h>",
    ])
      expect(checkSketch(s), s).toMatchObject({ ok: false, kode: "berbahaya" });
  });

  it("refuses incbin in any spelling", () => {
    expect(checkSketch('__asm__(".incbin \\"/etc/passwd\\"");')).toMatchObject({
      kode: "berbahaya",
    });
    expect(checkSketch('asm volatile (".INCBIN foo");')).toMatchObject({ kode: "berbahaya" });
  });

  it("refuses a sketch that sets an IRIS_ name itself", () => {
    expect(checkSketch('#define IRIS_WIFI_PASS "x"')).toMatchObject({ kode: "berbahaya" });
    expect(checkSketch("# undef IRIS_TOKEN")).toMatchObject({ kode: "berbahaya" });
  });

  it("uses an IRIS_ name freely when it does not define one", () => {
    expect(checkSketch("const char* s = IRIS_SEAT;")).toEqual({ ok: true });
  });

  it("refuses code over 64 KB", () => {
    expect(checkSketch("// " + "a".repeat(70_000))).toMatchObject({ kode: "terlalu_besar" });
  });
});

describe("checkHeader", () => {
  it("holds IRIS_ defines and nothing else", () => {
    expect(checkHeader('#define IRIS_SEAT "s12"\n#define IRIS_BOARD 1\n')).toEqual({ ok: true });
    expect(checkHeader('#include "/etc/passwd"\n')).toMatchObject({ ok: false });
    expect(checkHeader("#define FOO 1\n")).toMatchObject({ ok: false });
    expect(checkHeader('#define IRIS_X "a" \\\n#include "/x"\n')).toMatchObject({ ok: false });
  });
});
