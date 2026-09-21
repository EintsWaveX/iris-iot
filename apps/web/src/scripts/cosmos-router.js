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
 * from Base.astro, so it only ever executes once), which is what makes
 * a plain page-to-page link double as the hyperspace warp. warpTo fires
 * on astro:before-swap so the sky is already streaking before the new
 * page's content lands, and setScene on astro:page-load is the (idempotent)
 * fallback that also establishes the very first page's scene.
 *
 * Performance: a phone reporting the Save-Data header or <=2GB of
 * deviceMemory gets the reduced-motion sky by default -- the same static
 * single frame prefers-reduced-motion produces, since that is the one
 * lever cosmos.core.js/motion.core.js already expose and it is a real,
 * total cost win (one paint instead of 60/s) rather than a half-measure.
 * A stored "Kurangi efek" choice (apps/web's nav toggle) always wins over
 * the device guess, and only an explicit choice is ever persisted, so the
 * device-based default keeps re-evaluating (e.g. if Save-Data gets turned
 * off) until someone actually picks something.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "iris-kurangi-efek";

  function readStoredPreference() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {
      /* storage disabled (private mode, locked-down browser): fall through */
    }
    return null;
  }

  function shouldAutoReduce() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.saveData) return true;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 2) return true;
    return false;
  }

  function applyPreference() {
    if (!window.Motion) return;
    var stored = readStoredPreference();
    window.Motion.setReduced(stored !== null ? stored : shouldAutoReduce() ? true : null);
  }

  function setKurangiEfek(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch (e) {
      /* the toggle still works for this page load, it just won't persist */
    }
    if (window.Motion) window.Motion.setReduced(value);
  }

  function isKurangiEfek() {
    var stored = readStoredPreference();
    if (stored !== null) return stored;
    return !!(window.Motion && window.Motion.isReduced());
  }

  window.CosmosRouter = {
    setKurangiEfek: setKurangiEfek,
    isKurangiEfek: isKurangiEfek,
  };

  function sceneOf(doc) {
    return doc.documentElement.getAttribute("data-cosmos-scene") || "beranda";
  }

  // The nav (and its toggle button) is NOT transition:persist -- it's a
  // fresh DOM node on every navigation -- but this script is, so it has to
  // re-find and re-bind the button each time rather than binding once.
  function bindReduceToggle() {
    var btn = document.getElementById("kurangi-efek-toggle");
    if (!btn || btn.dataset.cosmosBound) return;
    btn.dataset.cosmosBound = "1";
    btn.addEventListener("click", function () {
      setKurangiEfek(!isKurangiEfek());
      syncReduceToggle(btn);
    });
    syncReduceToggle(btn);
  }

  function syncReduceToggle(btn) {
    btn = btn || document.getElementById("kurangi-efek-toggle");
    if (btn) btn.setAttribute("aria-pressed", isKurangiEfek() ? "true" : "false");
  }

  document.addEventListener("astro:before-swap", function (event) {
    if (window.Cosmos && event.newDocument) {
      window.Cosmos.warpTo(sceneOf(event.newDocument));
    }
  });

  document.addEventListener("astro:page-load", function () {
    applyPreference();
    if (window.Cosmos) window.Cosmos.setScene(sceneOf(document));
    bindReduceToggle();
  });

  // Covers the very first paint too: astro:page-load also fires on initial
  // load, but only once this script has already finished, so calling it
  // here as well means a Save-Data phone never gets even one frame of full
  // motion before the reduction kicks in.
  applyPreference();
  bindReduceToggle();
})();
