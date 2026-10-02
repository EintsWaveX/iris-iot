/**
 * Puts GSAP + CustomEase on window before motion.core.js runs (apps/web
 * no longer loads cosmos.core.js; Phase 9 draws the sky in sky.ts). The
 * kosmik cores are shared verbatim with apps/games (see this
 * package's README-less header comments in each), so they stay plain
 * scripts that read window.gsap rather than importing it -- games loads
 * the same gsap.min.js + CustomEase.min.js pair as vendored <script> tags,
 * apps/web gets it from npm instead and Vite bundles it. This file is the
 * one place that difference lives.
 *
 * Import this before motion.core.js --
 * ES module evaluation order guarantees this file's top-level code (and
 * therefore the window assignments below) finishes before that plain
 * script's own top-level IIFE runs.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

window.gsap = gsap;
window.CustomEase = CustomEase;
