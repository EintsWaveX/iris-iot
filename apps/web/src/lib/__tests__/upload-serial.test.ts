import { describe, expect, it } from "vitest";
import { ESP32_ATTEMPTS, PICO_CHUNK, pyBytes, writeStatements } from "../upload-serial";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("pyBytes", () => {
  it("keeps printable ASCII and escapes the quote, the backslash, controls and non-ASCII", () => {
    expect(pyBytes(bytes("abc XYZ 123"))).toBe("b'abc XYZ 123'");
    expect(pyBytes(bytes("it's"))).toBe("b'it\\x27s'");
    expect(pyBytes(bytes("a\\b"))).toBe("b'a\\x5cb'");
    expect(pyBytes(bytes("l1\nl2\t"))).toBe("b'l1\\x0al2\\x09'");
    expect(pyBytes(bytes("é"))).toBe("b'\\xc3\\xa9'");
  });

  it("a literal can never end early or carry a statement (nothing but the escapes and safe characters)", () => {
    const every = new Uint8Array(256).map((_, i) => i);
    const lit = pyBytes(every);
    expect(lit.startsWith("b'") && lit.endsWith("'")).toBe(true);
    expect(lit.slice(2, -1)).not.toMatch(/['\\](?!x[0-9a-f]{2})/);
    expect(lit).not.toMatch(/[\r\n]/);
  });
});

describe("writeStatements", () => {
  it("the first piece truncates main.py and the others append, one short statement each", () => {
    expect(writeStatements(bytes("a"), true)).toBe(
      "f=open('main.py','wb')\nf.write(b'a')\nf.close()\n",
    );
    expect(writeStatements(bytes("b"), false)).toBe(
      "f=open('main.py','ab')\nf.write(b'b')\nf.close()\n",
    );
  });

  it("a worst-case piece (every byte escaped) stays well under a raw REPL's input window", () => {
    const worst = writeStatements(new Uint8Array(PICO_CHUNK).fill(0x01), true);
    expect(worst.length).toBeLessThan(900);
  });
});

describe("ESP32_ATTEMPTS", () => {
  it("starts fast with the stub and ends on the plain ROM loader at the safe speed", () => {
    expect(ESP32_ATTEMPTS[0]).toEqual({ baud: 460800, stub: true });
    expect(ESP32_ATTEMPTS.at(-1)).toEqual({ baud: 115200, stub: false });
  });
});
