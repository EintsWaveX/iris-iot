/**
 * apps/web's entry point into the shared motion core. One side-effecting
 * import so Cosmos.astro has one line to load, in the order that matters:
 * GSAP must exist on window before motion.core.js reads it, and
 * motion.core.js must exist before motion-tier.ts's probe calls
 * Motion.setTier(). (Phase 9: the sky is src/scripts/sky.ts; kosmik's
 * cosmos.core.js is apps/games' sky and the web app no longer loads it.)
 *
 * motion.core.js stays a plain window-assigning script (no import/export)
 * because apps/games concatenates it verbatim into one <script> tag via
 * build.py, where a real `export` would be a syntax error.
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
