/**
 * apps/web's entry point into the shared cosmos. A single side-effecting
 * import so Base.astro has one line to load instead of four, in the exact
 * order that matters: GSAP must exist on window before motion.core.js
 * reads it, motion.core.js must exist before motion-tier.ts's probe calls
 * Motion.setTier(), and the tier must already be set before cosmos.core.js
 * checks window.Motion.getTier() to decide whether to mount the canvas.
 *
 * cosmos.core.js and motion.core.js stay plain window-assigning scripts
 * (no import/export) because apps/games concatenates them verbatim into
 * one <script> tag via build.py -- a real `export` in either file would be
 * a syntax error there. This file is the thin wrapper the plan called for,
 * so apps/web can still consume them as normal ES modules.
 *
 * This file lives in apps/web, NOT packages/kosmik, even though it wraps
 * kosmik's shared cores: it (and gsap-globals.js) import the bare "gsap"
 * specifier, and Node/Vite resolve a bare specifier by walking up from the
 * IMPORTING FILE's own directory looking for node_modules -- so if this
 * lived in packages/kosmik/js/, that walk would climb through packages/
 * and the repo root and never reach apps/web/node_modules/gsap, which is
 * the only place gsap is actually installed (found the hard way: Rolldown
 * failed to resolve "gsap" from packages/kosmik/js/gsap-globals.js during
 * the first `astro build`). games/ never imports this file at all --  it
 * vendors gsap as a plain <script> global instead -- so nothing about
 * this being web-only costs games anything, including motion-tier.ts,
 * which is apps/web-only and never runs there.
 */
import "./gsap-globals.js";
import "../../../../packages/kosmik/js/motion.core.js";
import "./motion-tier.ts";
import "../../../../packages/kosmik/js/cosmos.core.js";
