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

describe("checkSketch evasions (the regex is a first gate, the sandbox is the real one)", () => {
  const cases: [string, string][] = [
    ["a line continuation inside the directive", '#inc\\\nlude "/etc/passwd"'],
    ["a comment between # and include", '# /* x */ include "/etc/passwd"'],
    ["a comment after include", '#include/* x */"/etc/passwd"'],
    ["a macro as the operand", '#define P "/etc/passwd"\n#include P'],
    ["a digraph for #", '%:include "/etc/passwd"'],
    ["a trigraph for #", '??=include "/etc/passwd"'],
    ["include_next", '#include_next "/etc/passwd"'],
    ["import", '#import "/etc/passwd"'],
    ["embed", '#embed "/etc/passwd"'],
    ["__has_include", '#if __has_include("/etc/passwd")\n#endif'],
    [
      "a /* inside a string hiding the line from a comment stripper",
      'const char* s = "/*";\n#include "/etc/passwd"\n/* */',
    ],
    ["inline asm", 'void f() { asm volatile ("nop"); }'],
    ["__asm__", 'void f() { __asm__ ("nop"); }'],
    [
      "incbin split across string pieces (asm is refused whole)",
      'void f() { __asm__(".inc" "bin \\"/etc/passwd\\""); }',
    ],
    ["a raw string", 'const char* s = R"x(a)x";'],
    ["a prefixed raw string", 'auto s = u8R"(a)";'],
  ];
  for (const [name, code] of cases)
    it(`refuses ${name}`, () => {
      expect(checkSketch(code), code).toMatchObject({ ok: false, kode: "berbahaya" });
    });

  it("still lets ordinary code through", () => {
    const fine = [
      "// includes are fine to mention in words\nvoid setup() {}",
      'const char* r = "R"; // an R\nint x = 1;',
      '#include <WiFi.h> // ok\n#include "DHT.h"',
      "/* #include <WiFi.h> */ #include <Wire.h>",
      'void f() { Serial.println("passwd"); }',
    ];
    for (const code of fine) expect(checkSketch(code), code).toEqual({ ok: true });
  });

  it("does not crawl on a file built to make the scan backtrack", () => {
    const t0 = performance.now();
    checkSketch("#/*".repeat(21_000));
    checkSketch("# ".repeat(30_000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
