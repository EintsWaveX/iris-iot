// Wraps every :hover rule in @media (hover: hover) and (pointer: fine), so a
// tap on a phone never leaves a control lifted or tinted. A selector list
// that mixes :hover with other states is split: the hover part moves into
// the media block placed where the rule was, the rest stays as it is.
//   node scripts/gate_hover.mjs <file.css> [...]
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

const GATE = "(hover: hover) and (pointer: fine)";

// ---------- Helpers ----------
// ---------- Helpers ----------
// ---------- Helpers ----------

/** True when a rule already sits inside a hover-capable media query */
function isGated(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "atrule" && p.name === "media" && /hover:\s*hover/.test(p.params)) return true;
  }
  return false;
}

/** True when a rule sits in a block a media wrapper must not enter */
function isInKeyframes(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "atrule" && /keyframes$/.test(p.name)) return true;
  }
  return false;
}

// ---------- Helpers ----------
// ---------- Helpers ----------
// ---------- Helpers ----------

// ---------- Rewrite ----------
// ---------- Rewrite ----------
// ---------- Rewrite ----------

function gate(css) {
  const root = postcss.parse(css);
  let moved = 0;

  root.walkRules((rule) => {
    if (!rule.selector.includes(":hover") || isGated(rule) || isInKeyframes(rule)) return;

    const hover = rule.selectors.filter((s) => s.includes(":hover"));
    const rest = rule.selectors.filter((s) => !s.includes(":hover"));
    const media = postcss.atRule({ name: "media", params: GATE });
    const copy = rule.clone({ selectors: hover });

    media.append(copy);
    if (rest.length) {
      rule.selectors = rest;
      rule.after(media);
    } else {
      rule.replaceWith(media);
    }
    moved++;
  });

  return { css: root.toString(), moved };
}

// ---------- Rewrite ----------
// ---------- Rewrite ----------
// ---------- Rewrite ----------

let total = 0;
for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, "utf8");
  const { css, moved } = gate(before);

  if (moved) {
    writeFileSync(file, css);
    console.log(`[INFO] ${file}: ${moved} hover rule(s) gated`);
  }
  total += moved;
}
console.log(`[STATUS] ${total} hover rule(s) gated`);
