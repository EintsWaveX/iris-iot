/**
 * Every Phosphor icon module carries six drawings (thin, light, regular,
 * bold, fill, duotone), and the shared icon chunk was 140 KB gzipped. The
 * app only draws regular, bold, fill and one duotone, so the thin and light
 * entries are cut from each icon's weights Map at build time. A test
 * (lib/__tests__/phosphor-weights.test.ts) fails if a thin or light icon
 * is ever asked for.
 */
import type { Plugin } from "vite";

const DROP = new Set(["thin", "light"]);

/** Removes the `["thin", ...]` and `["light", ...]` entries of one icon's weights Map. */
export function dropIconWeights(code: string): string {
  const head = /\[\s*"(thin|light)"\s*,/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = head.exec(code))) {
    if (!DROP.has(m[1]!)) continue;
    // Walk to the matching "]" of this entry, skipping string literals.
    let depth = 0;
    let i = m.index;
    for (; i < code.length; i++) {
      const c = code[i]!;
      if (c === '"' || c === "'" || c === "`") {
        for (i++; i < code.length && code[i] !== c; i++) if (code[i] === "\\") i++;
      } else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) break;
    }
    if (i >= code.length) return code; // not the shape we know: leave the module alone
    let end = i + 1;
    const comma = /^\s*,/.exec(code.slice(end));
    if (comma) end += comma[0].length;
    out += code.slice(last, m.index);
    last = end;
    head.lastIndex = end;
  }
  return out + code.slice(last);
}

export function phosphorWeights(): Plugin {
  return {
    name: "iris:phosphor-weights",
    enforce: "pre",
    apply: "build",
    transform(code, id) {
      if (!/@phosphor-icons[\/]react[\/]dist[\/]defs[\/][^\/]+\.es\.js$/.test(id)) return null;
      const next = dropIconWeights(code);
      return next === code ? null : { code: next, map: null };
    },
  };
}
