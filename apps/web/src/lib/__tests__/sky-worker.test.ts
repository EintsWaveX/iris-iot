import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toBase64 } from "../../scripts/cosmos/painters";

/**
 * The painted sky is drawn in a worker (performance work, Nov 2026): at a 6x slower CPU, drawing and encoding
 * its sprites cost 0.7 s of main thread on every full page load, even at Low Detail. A worker has no DOM, so
 * these hold the two things that keep that working: the PNG encoder, and painters.ts staying DOM-free.
 */

const SCRIPTS = fileURLToPath(new URL("../../scripts/cosmos/", import.meta.url));
const read = (name: string) => readFileSync(SCRIPTS + name, "utf8");

/** Source without comments, so a sentence that mentions "document" does not count */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("toBase64", () => {
  const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) % 256);
  // Around the 0x8000 slice size, which is where a bad slice would drop or repeat a byte
  it.each([0, 1, 2, 3, 4, 0x7fff, 0x8000, 0x8001, 0x10000, 100_003])(
    "matches Node's own encoder for %i bytes",
    (n) => {
      expect(toBase64(bytes(n))).toBe(Buffer.from(bytes(n)).toString("base64"));
    },
  );
  it("encodes a PNG signature the way a data URL expects", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(toBase64(png)).toBe("iVBORw0KGgo=");
  });
});

describe("painters.ts can run in a worker", () => {
  const src = code(read("painters.ts"));

  it("touches the DOM only to pick a canvas, and only after checking there is a document", () => {
    const mentions = src.match(/\bdocument\b/g) ?? [];
    // `typeof document === "undefined"` and `document.createElement("canvas")`, both inside canvas()
    expect(mentions).toHaveLength(2);
    expect(src).toMatch(/typeof document === "undefined"/);
    expect(src).toMatch(/document\.createElement\("canvas"\)/);
  });

  it("uses no other page-only API", () => {
    for (const api of [
      /\bwindow\b/,
      /\bnavigator\b/,
      /\bgetComputedStyle\b/,
      /\bdevicePixelRatio\b/,
      /\binnerWidth\b/,
      /\binnerHeight\b/,
      /\bgetElementById\b/,
    ]) {
      expect(src, String(api)).not.toMatch(api);
    }
  });

  it("queries the page only through the element layoutScene() is handed, which a worker never calls", () => {
    // layoutScene(root, ...) is main-thread only: it takes its element as a parameter, never the global document
    expect(src.match(/\bquerySelector\w*/g)).toEqual(["querySelectorAll"]);
    expect(src).toMatch(/root\.querySelectorAll</);
  });

  it("encodes through encodePng, never by calling toDataURL on a sprite directly in a builder", () => {
    // toDataURL belongs to sprites() (main thread) and encodePng() (page canvases), nowhere else
    const calls = src.match(/\.toDataURL\(/g) ?? [];
    expect(calls).toHaveLength(2);
  });
});

describe("the sky worker", () => {
  const worker = code(read("sky.worker.ts"));

  it("imports only the painters (nothing that needs a page)", () => {
    const imports = [...worker.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./painters"]);
  });

  it("answers with data URLs: the Content-Security-Policy allows data: but not blob: images", () => {
    expect(worker).not.toMatch(/createObjectURL/);
    const csp = readFileSync(
      fileURLToPath(new URL("../../../vercel.json", import.meta.url)),
      "utf8",
    );
    expect(csp).toMatch(/img-src 'self' data: https:/);
    expect(csp).not.toMatch(/img-src[^;"]*blob:/);
  });
});
