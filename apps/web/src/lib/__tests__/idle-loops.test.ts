import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss, { type Root, type Rule } from "postcss";

/**
 * No new idle loops (performance work, Nov 2026).
 *
 * A CSS animation that loops forever on a property the compositor cannot animate (background-position,
 * mask-position, box-shadow, stroke-dashoffset, a registered @property, ...) makes the main thread produce a
 * frame on every screen refresh, even for an element nobody can see. Measured on Dashboard at Low Detail with
 * a 6x slower CPU: two or three such loops took the page from 143 to 81-90 fps idle and from 88-97 to ~50 fps
 * scrolling (perf/render-2026-11-19-praktikan-ldm-phone-cpu6.json).
 *
 * So a rule may loop such an animation only while the pointer or keyboard is on the element (:hover, :focus,
 * :focus-visible, :focus-within, :active), or it must be on the list below. The list is a ratchet: it can only
 * shrink. Adding to it needs a reason in the commit; a stale entry (fixed but still listed) fails too.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const KOSMIK = fileURLToPath(new URL("../../../../../packages/kosmik/style/", import.meta.url));

/** Properties the compositor can animate without the main thread */
const COMPOSITOR = new Set([
  "transform",
  "opacity",
  "translate",
  "scale",
  "rotate",
  "offset-distance",
  "filter",
  "backdrop-filter",
]);
// filter and backdrop-filter are compositor-capable in Chrome but costly; they are policed by the
// backdrop-filter and filter budgets (phase 1.5 and 1.7), not by this idle-loop rule.

const KEYWORDS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "infinite",
  "alternate",
  "alternate-reverse",
  "reverse",
  "normal",
  "forwards",
  "backwards",
  "both",
  "none",
  "running",
  "paused",
  "step-start",
  "step-end",
]);

const STATE = /:(hover|focus|focus-visible|focus-within|active)\b/;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(css|astro)$/.test(name)) out.push(path);
  }
  return out;
}

function cssOf(path: string): string {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".css")) return text;
  return [...text.matchAll(/^\s*<style[^>]*>([\s\S]*?)<\/style>/gm)].map((m) => m[1]).join("\n");
}

const sources: [string, Root][] = [...files(SRC), ...files(KOSMIK)]
  .map((p) => [p, cssOf(p)] as const)
  .filter(([, css]) => css.trim() !== "")
  .map(([p, css]) => {
    const rel = p.startsWith(SRC) ? p.slice(SRC.length) : `kosmik/${p.slice(KOSMIK.length)}`;
    // Forward slashes, so the same key reads the same on Windows and on CI
    return [rel.replace(/\\/g, "/"), postcss.parse(css)];
  });

/** Every property each @keyframes animates, merged across files */
const keyframes = new Map<string, Set<string>>();
for (const [, root] of sources) {
  root.walkAtRules("keyframes", (at) => {
    const props = keyframes.get(at.params) ?? new Set<string>();
    at.walkDecls((d) => {
      props.add(d.prop.replace(/^-webkit-/, ""));
    });
    keyframes.set(at.params, props);
  });
}

function nameOf(segment: string): string | null {
  for (const word of segment.trim().split(/\s+/)) {
    if (/^[a-zA-Z_][\w-]*$/.test(word) && !KEYWORDS.has(word)) return word;
  }
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Rules that loop an animation on a non-compositor property while idle: "file | selector | keyframes" */
function offenders(): string[] {
  const out = new Set<string>();
  for (const [file, root] of sources) {
    const check = (rule: Rule, names: string[]) => {
      if (rule.selectors.every((s) => STATE.test(s))) return;
      for (const name of names) {
        const props = keyframes.get(name);
        if (!props) continue; // keyframes not found anywhere: nothing runs
        const heavy = [...props].some((p) => !COMPOSITOR.has(p));
        if (heavy) out.add(`${file} | ${norm(rule.selector)} | ${name}`);
      }
    };
    root.walkRules((rule) => {
      let iteration = false;
      let longhandName: string | null = null;
      rule.each((d) => {
        if (d.type !== "decl") return;
        if (d.prop === "animation") {
          const names = d.value
            .split(",")
            .filter((seg) => /\binfinite\b/.test(seg))
            .map(nameOf)
            .filter((n): n is string => n !== null);
          check(rule, names);
        } else if (d.prop === "animation-iteration-count" && /\binfinite\b/.test(d.value)) {
          iteration = true;
        } else if (d.prop === "animation-name") {
          longhandName = nameOf(d.value);
        }
      });
      if (iteration && longhandName) check(rule, [longhandName]);
    });
  }
  return [...out].sort();
}

/**
 * Idle loops still to fix, with the phase that removes each. Do NOT add to this list to make a test pass:
 * make the animation hover/focus-only, one pass, or compositor-only (transform, opacity) instead.
 */
const KNOWN: readonly string[] = [
  // The painted sky's waterfall and the glass border spin (phase 1.2, phase 2)
  "styles/scene.css | .wf | scene-fall",
  'styles/glass.css | :root:not([data-detail="ldm"]):not([data-motion-tier="0"]) .glass--aurora::before | glass-spin',
  // Skeleton shimmer: a transform-moved highlight instead of background-position (phase 1.4b)
  'components/ui/Display.css | :root:not([data-motion-tier="0"]) .skeleton | skeleton-shimmer',
  // Live-dot pulses animate box-shadow: a transform/opacity ring instead (phase 1.4b)
  'components/shell/AppNav.css | :root:not([data-motion-tier="0"]) .appnav__live-dot | appnav-live',
  'components/shell/SessionMiniBar.css | :root:not([data-motion-tier="0"]) .minibar__dot | appnav-live',
  'styles/app.css | :root:not([data-motion-tier="0"]) .dot--pulse | appnav-live',
  'components/recruitment/recruitment.css | :root:not([data-motion-tier="0"]) .rec-bn__sticker::before | appnav-live',
  'components/recruitment/recruitment-shell.css | :root:not([data-motion-tier="0"]) .rec-labpc__dot | rec-labpc-pulse',
  'components/recruitment/recruitment-shell.css | :root:not([data-motion-tier="0"]) .rec-oprec__dot | rec-blip',
  // Oprec reveal and celebration screens: short-lived, one pass or transform (phase 6, Oprec sweep)
  "components/recruitment/recruitment-s2.css | .r2env::before | rec-s2-sweep",
  'components/recruitment/recruitment-s2.css | .r2mini[data-st="sealed"]::after | rec-s2-edgespin',
  "components/recruitment/recruitment-s2.css | .r2proj__ring rect | rec-s2-drain",
  'components/recruitment/recruitment-s3-lc.css | .r3reel[data-phase="landed"] .r3reel__ring[data-ring="yes"] | aurora-sweep',
  'components/recruitment/recruitment-s3-runner.css | html:not([data-motion-tier="0"]) .r3bonus__card::before | r3bonus-spin',
  // Module pages: the wiring pulse and the jumper hint (phase 6, Praktikum sweep)
  'components/module/PinSchematic.css | :root:not([data-motion-tier="0"]) .jumper__pad[data-ok="yes"] | jumper-boleh',
  'components/module/PinSchematic.css | :root:not([data-motion-tier="0"]) .wiring__pulse | wiring-flow',
  'components/module/lstep.css | :root:not([data-motion-tier="0"]) .lstep__line i | kit-sweep',
  'components/tp/tp.css | :root:not([data-motion-tier="0"]) .cdown--pelangi .cdown__d b | kit-sweep',
  // Popover edges and open or current ring: only while a menu is open or an item is current (phase 1.4b)
  'styles/sky.css | :root:not([data-motion-tier="0"]) .sweep-edge::before | aurora-sweep',
  'styles/sky.css | :root:not([data-motion-tier="0"]) .sweep-hover:focus-visible::after, :root:not([data-motion-tier="0"]) .sweep-hover[aria-current="true"]::after, :root:not([data-motion-tier="0"]) .sweep-hover[data-state="open"]::after | aurora-sweep',
];

describe("idle loops on the main thread", () => {
  const found = offenders();

  it("has no new rule that loops a non-compositor animation while idle", () => {
    const fresh = found.filter((f) => !KNOWN.includes(f));
    expect(
      fresh,
      "new idle loops (make them hover/focus-only, one pass, or transform/opacity)",
    ).toEqual([]);
  });

  it("lists nothing that has already been fixed", () => {
    const stale = KNOWN.filter((k) => !found.includes(k));
    expect(stale, "fixed: remove these from KNOWN").toEqual([]);
  });

  it("never loops the shared button, panel, tab and nav sweeps while idle (the Dashboard finding)", () => {
    const shared = [
      "styles/controls.css",
      "styles/app.css",
      "components/ui/Tabs.css",
      "components/ui/PersonBadges.css",
      "components/home/profil/profil.css",
      "components/shell/AppNav.css",
      "components/console/console.css",
    ];
    const sweeps = found.filter(
      (f) => shared.some((p) => f.startsWith(`${p} |`)) && /\| (kit|aurora)-sweep$/.test(f),
    );
    expect(sweeps).toEqual([]);
  });
});
