/**
 * The web app's background detail setting (Phase 9). The sky itself is
 * src/scripts/sky.ts; this file owns the iris-detail choice and tells
 * motion.core.js (window.Motion) whether the reader asked for a still sky,
 * which motion-tier.ts and the GSAP paths read.
 *
 * Scenes: Base.astro still stamps data-cosmos-scene on <html>, and
 * astro:page-load hands it to window.Cosmos.setScene when a Cosmos exists.
 * That is apps/games' kosmik sky (cosmos.core.js); the web app no longer
 * loads it, so on the web the call is skipped and sky.ts paints one sky
 * for every page. Navigation is a content-only crossfade (Base.astro's
 * ::view-transition-* rules); the sky never reacts to a page change.
 *
 * Phase 9: detail levels. The reader picks one in the nav's Tampilan
 * panel; Otomatis is the default (Nov 2026: it is Normal, or Low Detail on a weak or slow device,
 * see theme-init.js and scripts/auto-detail.ts):
 *   ldm     the still, painted sky (motion tier 0), the lightest
 *   normal  twinkling stars and the odd meteor (tier 1 at most)
 *   hd      everything, including planets, comets and the moving aurora
 *           (tier 2, even on a device that measured lower: a stated
 *           choice outranks the probe)
 * prefers-reduced-motion still wins over normal and hd. The choice is
 * iris-detail in localStorage; public/theme-init.js reads the same key
 * (with the same migration from the old three-way iris-kurangi-efek) to
 * stamp html[data-detail] before first paint, for the CSS layers.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "iris-detail";
  var CHOICES = ["auto", "ldm", "normal", "hd"];

  // The level IN FORCE (public/theme-init.js decides it: the reader's choice, or what Otomatis resolves to)
  function readDetail() {
    if (window.IrisPrefs) return window.IrisPrefs.detail();
    return document.documentElement.getAttribute("data-detail") || "normal";
  }

  // What the reader chose, which can be "auto"
  function readChoice() {
    if (window.IrisPrefs) return window.IrisPrefs.detailPref();
    return "auto";
  }

  function applyDetail() {
    if (!window.Motion) return;
    // null hands the decision back to prefers-reduced-motion.
    window.Motion.setReduced(readDetail() === "ldm" ? true : null);
  }

  function setDetail(level) {
    if (CHOICES.indexOf(level) === -1) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, level);
      // Choosing Otomatis again gives the device a fresh start
      if (level === "auto") window.localStorage.removeItem("iris-auto-ldm");
    } catch (e) {
      /* the setting still works for this page load, it just won't persist */
    }
    if (window.IrisPrefs) window.IrisPrefs.apply();
    else document.documentElement.setAttribute("data-detail", level === "auto" ? "normal" : level);
    applyDetail();
    window.IrisMotionTier?.reapply();
  }

  window.CosmosRouter = {
    setDetail: setDetail,
    getDetail: readDetail,
    getChoice: readChoice,
  };

  function sceneOf(doc) {
    return doc.documentElement.getAttribute("data-cosmos-scene") || "beranda";
  }

  document.addEventListener("astro:page-load", function () {
    applyDetail();
    if (window.Cosmos) window.Cosmos.setScene(sceneOf(document));
  });

  // Covers the very first paint too: astro:page-load also fires on initial
  // load, but only once this script has already finished, so calling it
  // here as well means a Low Detail reader never gets one frame of motion.
  applyDetail();
})();
