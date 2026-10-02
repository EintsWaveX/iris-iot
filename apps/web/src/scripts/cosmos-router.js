/**
 * The Astro-specific glue between the shared cosmos and apps/web's
 * multi-page site: which scene each page wants, firing the warp on
 * navigation, and the two performance levers Stage 3 adds on top of what
 * cosmos.core.js/motion.core.js already carry from games (sprite-cached
 * planets, no mix-blend-mode grain, DPR capped at 2, one shared ticker).
 *
 * Scene selection: apps/web/src/layouts/Base.astro stamps the page's
 * chosen scene as data-cosmos-scene on <html> (a static, author-declared
 * "what this page wants"). That is a different attribute from data-scene,
 * which cosmos.core.js itself owns and writes as "what's currently
 * showing" -- keeping them separate means this file never fights the
 * library over who writes data-scene.
 *
 * Navigation: <ClientRouter /> keeps this whole module alive across
 * pages (it's a persisted, deduplicated <script type="module"> included
 * from Base.astro, so it only ever executes once). Navigation is a
 * content-only crossfade now (see Base.astro's ::view-transition-* rules)
 * -- the sky itself never reacts to a page change, only to which scene
 * the new page declares. setScene on astro:page-load retunes the sky to
 * that scene over its own existing ~1.2s opacity transition, which is
 * also the (idempotent) call that establishes the very first page's
 * scene. This deliberately does NOT call Cosmos.warpTo(): the warp
 * re-shapes every star into a radial streak on every navigation, which
 * measured as the single most expensive thing on the page and cost the
 * most on exactly the phones least able to pay for it. apps/games still
 * fires it (a single-page app, so "navigation" there means switching
 * screens within one document, a different situation) -- warpTo stays in
 * cosmos.core.js unchanged for that caller.
 *
 * Phase 9: detail levels. The reader picks one in the nav's Tampilan
 * panel, and Low Detail (LDM) is the default:
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
  var LEGACY_KEY = "iris-kurangi-efek";
  var LEVELS = ["ldm", "normal", "hd"];

  function readDetail() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (LEVELS.indexOf(v) !== -1) return v;
      var old = window.localStorage.getItem(LEGACY_KEY);
      if (old === "penuh" || old === "0") return "hd";
    } catch (e) {
      /* storage disabled (private mode, locked-down browser): fall through */
    }
    return "ldm";
  }

  function applyDetail() {
    if (!window.Motion) return;
    // null hands the decision back to prefers-reduced-motion.
    window.Motion.setReduced(readDetail() === "ldm" ? true : null);
  }

  function setDetail(level) {
    if (LEVELS.indexOf(level) === -1) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, level);
    } catch (e) {
      /* the setting still works for this page load, it just won't persist */
    }
    if (window.IrisPrefs) window.IrisPrefs.apply();
    else document.documentElement.setAttribute("data-detail", level);
    applyDetail();
    window.IrisMotionTier?.reapply();
  }

  window.CosmosRouter = {
    setDetail: setDetail,
    getDetail: readDetail,
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
