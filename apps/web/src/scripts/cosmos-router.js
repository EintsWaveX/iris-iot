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
 * Performance: a phone reporting the Save-Data header or <=2GB of
 * deviceMemory gets the reduced-motion sky by default under "Otomatis" --
 * the same static single frame prefers-reduced-motion produces, since
 * that is the one lever cosmos.core.js/motion.core.js already expose and
 * it is a real, total cost win (one paint instead of 60/s) rather than a
 * half-measure.
 *
 * Stage 6: the toggle became a real three-way setting rather than a
 * binary switch that could only ever reduce motion, never force it back
 * on for a device the auto-heuristic above guessed wrong about --
 * "Otomatis" defers to that heuristic (re-evaluating live, e.g. if
 * Save-Data gets turned off, since nothing is persisted for this state),
 * "Penuh" and "Kurangi" are explicit overrides that always win regardless
 * of the heuristic. Older sessions' plain "1"/"0" values (the pre-Stage-6
 * binary toggle) are migrated on read rather than wiped, since they are a
 * real choice someone already made, not noise.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "iris-kurangi-efek";
  var PREFS = ["auto", "penuh", "kurangi"];
  var LABELS = { auto: "Otomatis", penuh: "Penuh", kurangi: "Kurangi" };

  function readStoredPref() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "auto" || v === "penuh" || v === "kurangi") return v;
      if (v === "1") return "kurangi";
      if (v === "0") return "penuh";
    } catch (e) {
      /* storage disabled (private mode, locked-down browser): fall through */
    }
    return "auto";
  }

  function writeStoredPref(pref) {
    try {
      window.localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {
      /* the setting still works for this page load, it just won't persist */
    }
  }

  function shouldAutoReduce() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.saveData) return true;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 2) return true;
    return false;
  }

  function applyPreference() {
    if (!window.Motion) return;
    var pref = readStoredPref();
    if (pref === "kurangi") window.Motion.setReduced(true);
    else if (pref === "penuh") window.Motion.setReduced(false);
    else window.Motion.setReduced(shouldAutoReduce() ? true : null);
  }

  function setMotionPref(pref) {
    if (PREFS.indexOf(pref) === -1) return;
    writeStoredPref(pref);
    applyPreference();
    // P6.4/B10: choosing "Otomatis" forces one fresh capability probe
    // rather than trusting whatever tier is already cached -- the one
    // moment a person is deliberately asking "figure this out again",
    // separate from the 7-day passive expiry in motion-tier.ts.
    if (pref === "auto") window.IrisMotionTier?.reprobe();
  }

  function cycleMotionPref() {
    var next = PREFS[(PREFS.indexOf(readStoredPref()) + 1) % PREFS.length];
    setMotionPref(next);
    return next;
  }

  window.CosmosRouter = {
    setMotionPref: setMotionPref,
    getMotionPref: readStoredPref,
    cycleMotionPref: cycleMotionPref,
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
      cycleMotionPref();
      syncReduceToggle(btn);
    });
    syncReduceToggle(btn);
  }

  function syncReduceToggle(btn) {
    btn = btn || document.getElementById("kurangi-efek-toggle");
    if (!btn) return;
    var pref = readStoredPref();
    var label = LABELS[pref];
    btn.dataset.motionPref = pref;
    btn.title = "Efek gerak pada latar: " + label;
    btn.setAttribute("aria-label", "Efek gerak pada latar: " + label + ". Ketuk untuk mengubah.");
    var labelEl = document.getElementById("kurangi-efek-label");
    if (labelEl) labelEl.textContent = label;
  }

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
