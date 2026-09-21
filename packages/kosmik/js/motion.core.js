/**
 * Arena Asisten IRIS - motion layer.
 *
 * Owns three things:
 *
 *   1. GSAP setup. Registers the vendored plugins and defines CustomEase
 *      curves whose names and control points match the --ease-* CSS tokens,
 *      so a transition written in CSS and a timeline written in JS move the
 *      same way.
 *
 *   2. The single app-wide animation loop. gsap.ticker is already a shared
 *      rAF loop, so everything that needs per-frame work (the starfield, the
 *      confetti fallback, the champion takeover) subscribes to it rather
 *      than calling requestAnimationFrame itself. One loop means one place to
 *      pause when the tab is hidden, and no two loops competing for the frame
 *      budget during the champion moment, which is exactly when the budget
 *      matters most.
 *
 *   3. Reduced-motion policy. A live matchMedia subscription rather than a
 *      one-shot read, mirrored onto the --motion-off custom property so CSS
 *      can react without duplicating rules inside a media query.
 *
 * Loaded after the vendor bundle and before every module that animates.
 */
(function () {
  "use strict";

  var gsap = window.gsap || null;

  // ---------------------------------------------------------------------
  // reduced motion
  // ---------------------------------------------------------------------

  var reducedQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  var osReduced = !!(reducedQuery && reducedQuery.matches);
  // null defers to the OS query; true/false is an explicit override, so a
  // persisted "Kurangi efek" toggle (apps/web only -- games never calls
  // setReduced, so this stays null there and behaves exactly as before).
  var manualReduced = null;
  var reduced = osReduced;
  var reducedListeners = [];

  function applyReduced() {
    document.documentElement.style.setProperty(
      "--motion-off",
      reduced ? "1" : "0",
    );
    for (var i = 0; i < reducedListeners.length; i++) {
      try {
        reducedListeners[i](reduced);
      } catch (err) {
        /* a misbehaving listener must not take the rest down */
      }
    }
  }

  if (reducedQuery) {
    var onReducedChange = function (evt) {
      osReduced = !!evt.matches;
      reduced = manualReduced === null ? osReduced : manualReduced;
      applyReduced();
    };
    // Safari below 14 only has the deprecated addListener.
    if (typeof reducedQuery.addEventListener === "function") {
      reducedQuery.addEventListener("change", onReducedChange);
    } else if (typeof reducedQuery.addListener === "function") {
      reducedQuery.addListener(onReducedChange);
    }
  }

  // ---------------------------------------------------------------------
  // GSAP setup
  // ---------------------------------------------------------------------

  if (gsap) {
    var plugins = [];
    if (window.CustomEase) plugins.push(window.CustomEase);
    if (window.SplitText) plugins.push(window.SplitText);
    if (window.DrawSVGPlugin) plugins.push(window.DrawSVGPlugin);
    if (plugins.length) gsap.registerPlugin.apply(gsap, plugins);

    if (window.CustomEase) {
      // Control points copied verbatim from the --ease-* tokens.
      window.CustomEase.create("reveal", "0.2,0.7,0.3,1");
      window.CustomEase.create("outExpo", "0.16,1,0.3,1");
      window.CustomEase.create("inOutSoft", "0.65,0,0.35,1");
    }

    // A long stall (a slow first paint, a background tab waking) otherwise
    // makes GSAP jump every tween forward at once. Smoothing over ~0.5s keeps
    // the recovery graceful instead of visibly snapping.
    gsap.ticker.lagSmoothing(500, 33);

    gsap.defaults({
      ease: window.CustomEase ? "reveal" : "power3.out",
      duration: 0.52,
    });
  }

  // ---------------------------------------------------------------------
  // shared ticker
  // ---------------------------------------------------------------------

  var tickers = [];
  var tickerRunning = false;
  var pausedByVisibility = false;

  function dispatchTick(time, deltaMs) {
    for (var i = 0; i < tickers.length; i++) {
      try {
        tickers[i](time, deltaMs);
      } catch (err) {
        /* keep the loop alive even if one subscriber throws */
      }
    }
  }

  // gsap.ticker hands over (time, deltaTime, frame, elapsed) with deltaTime
  // already in milliseconds. The rAF fallback below normalises to the same
  // shape so subscribers never have to care which is driving them.
  var rafId = null;
  var lastRafTime = 0;

  function rafStep(now) {
    rafId = requestAnimationFrame(rafStep);
    var delta = lastRafTime ? now - lastRafTime : 16.7;
    lastRafTime = now;
    dispatchTick(now / 1000, delta);
  }

  function startTicker() {
    if (tickerRunning || pausedByVisibility || !tickers.length) return;
    tickerRunning = true;
    if (gsap) {
      gsap.ticker.add(dispatchTick);
    } else {
      lastRafTime = 0;
      rafId = requestAnimationFrame(rafStep);
    }
  }

  function stopTicker() {
    if (!tickerRunning) return;
    tickerRunning = false;
    if (gsap) {
      gsap.ticker.remove(dispatchTick);
    } else if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onTick(fn) {
    if (typeof fn !== "function" || tickers.indexOf(fn) !== -1) return;
    tickers.push(fn);
    startTicker();
  }

  function offTick(fn) {
    var idx = tickers.indexOf(fn);
    if (idx === -1) return;
    tickers.splice(idx, 1);
    if (!tickers.length) stopTicker();
  }

  // Browsers already throttle rAF in a hidden tab, but a phone that has been
  // locked for ten minutes should not wake up owing ten minutes of starfield
  // integration. Detaching entirely makes the resume clean.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      pausedByVisibility = true;
      stopTicker();
    } else {
      pausedByVisibility = false;
      lastRafTime = 0;
      startTicker();
    }
  });

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  /**
   * Animates an element's text from one integer to another. Falls back to
   * setting the final value outright when motion is reduced or GSAP is
   * missing, so a caller never has to branch.
   */
  function countUp(el, to, options) {
    if (!el) return;
    var opts = options || {};
    var format = opts.format || String;
    var target = Number(to) || 0;

    if (!gsap || reduced) {
      el.textContent = format(target);
      return;
    }

    var from = Number(el.getAttribute("data-count")) || 0;
    if (from === target) {
      el.textContent = format(target);
      return;
    }

    var state = { value: from };
    el.setAttribute("data-count", String(target));
    gsap.killTweensOf(state);
    gsap.to(state, {
      value: target,
      duration: opts.duration || 0.7,
      ease: opts.ease || "outExpo",
      onUpdate: function () {
        el.textContent = format(Math.round(state.value));
      },
      onComplete: function () {
        el.textContent = format(target);
      },
    });
  }

  /**
   * The house entrance: children rise and fade in sequence. Used for screen
   * transitions and for any list that has just been rebuilt.
   */
  function enter(targets, options) {
    var opts = options || {};
    if (!gsap || reduced) {
      return null;
    }
    return gsap.fromTo(
      targets,
      { opacity: 0, y: opts.distance === undefined ? 14 : opts.distance },
      {
        opacity: 1,
        y: 0,
        duration: opts.duration || 0.6,
        ease: opts.ease || "outExpo",
        stagger: opts.stagger === undefined ? 0.045 : opts.stagger,
        delay: opts.delay || 0,
        clearProps: "opacity,transform",
        overwrite: "auto",
      },
    );
  }

  /**
   * Splits a heading into characters (or words) and reveals them in
   * sequence. Returns the SplitText instance so the caller can revert() it —
   * important, because SplitText rewrites the element's innerHTML and leaving
   * it split breaks later textContent updates.
   */
  // SplitText.revert() restores the markup captured when the split was made,
  // so a second split over already-split content would later revert to that
  // intermediate wrapped state rather than to the real text. Track the live
  // split per element and undo it before splitting again.
  var activeSplits = typeof WeakMap === "function" ? new WeakMap() : null;

  function revertSplit(el) {
    if (!activeSplits || !el) return;
    var existing = activeSplits.get(el);
    if (!existing) return;
    activeSplits.delete(el);
    try {
      existing.revert();
    } catch (err) {
      /* already reverted */
    }
  }

  /**
   * A name materialising out of a star: the pieces start collapsed onto a
   * single point at the left of the element and expand into place.
   *
   * Split by WORDS, not characters, on purpose. The draw reveals 25 names at
   * once across four columns; per-character that is roughly 800 elements
   * being created, tweened and reverted at the same moment, on the phones
   * this has to run on. Per-word it is nearer 140, and at the size these
   * names render the difference is not visible anyway.
   *
   * @param {Element} el
   * @param {{originX?: number, duration?: number, stagger?: number, delay?: number}} [options]
   */
  function materialise(el, options) {
    var opts = options || {};
    if (!el || !gsap || !window.SplitText || reduced) return null;

    revertSplit(el);

    var split;
    try {
      split = new window.SplitText(el, { type: "words" });
    } catch (err) {
      return null;
    }

    var words = split.words;
    if (!words || !words.length) {
      try {
        split.revert();
      } catch (err) {
        /* nothing to undo */
      }
      return null;
    }

    if (activeSplits) activeSplits.set(el, split);

    var originX = opts.originX === undefined ? -10 : opts.originX;

    var tl = gsap.timeline({
      delay: opts.delay || 0,
      onComplete: function () {
        if (activeSplits && activeSplits.get(el) !== split) return;
        if (activeSplits) activeSplits.delete(el);
        try {
          split.revert();
        } catch (err) {
          /* already reverted */
        }
      },
    });

    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      tl.fromTo(
        word,
        {
          opacity: 0,
          scale: 0.35,
          // Collapsed onto the origin point rather than merely offset from
          // where it belongs, so every piece appears to come from the star.
          x: originX - word.offsetLeft,
          y: 0,
        },
        {
          opacity: 1,
          scale: 1,
          x: 0,
          duration: opts.duration || 0.6,
          ease: "outExpo",
        },
        i * (opts.stagger === undefined ? 0.035 : opts.stagger),
      );
    }

    return tl;
  }

  function revealText(el, options) {
    var opts = options || {};
    if (!el || !gsap || !window.SplitText || reduced) return null;

    revertSplit(el);

    var split;
    try {
      split = new window.SplitText(el, { type: opts.type || "chars" });
    } catch (err) {
      return null;
    }
    if (activeSplits) activeSplits.set(el, split);

    var pieces = opts.type === "words" ? split.words : split.chars;
    gsap.fromTo(
      pieces,
      { opacity: 0, y: opts.distance === undefined ? "0.4em" : opts.distance },
      {
        opacity: 1,
        y: 0,
        duration: opts.duration || 0.75,
        ease: opts.ease || "outExpo",
        stagger: opts.stagger === undefined ? 0.022 : opts.stagger,
        delay: opts.delay || 0,
        onComplete: function () {
          if (opts.keepSplit) return;
          // Only revert if this is still the live split for the element. If
          // something re-split it in the meantime, that newer split owns the
          // markup and reverting ours would stamp stale text over it.
          if (activeSplits && activeSplits.get(el) !== split) return;
          if (activeSplits) activeSplits.delete(el);
          try {
            split.revert();
          } catch (err) {
            /* already reverted */
          }
        },
      },
    );
    return split;
  }

  applyReduced();

  window.Motion = {
    gsap: gsap,
    onTick: onTick,
    offTick: offTick,
    countUp: countUp,
    enter: enter,
    revealText: revealText,
    materialise: materialise,
    revertSplit: revertSplit,
    isReduced: function () {
      return reduced;
    },
    onReducedChange: function (fn) {
      if (typeof fn === "function") reducedListeners.push(fn);
    },
    // Explicit override for a persisted "Kurangi efek" toggle, independent
    // of the OS preference. Pass null to defer back to the OS query.
    setReduced: function (value) {
      manualReduced = value === null || value === undefined ? null : !!value;
      reduced = manualReduced === null ? osReduced : manualReduced;
      applyReduced();
    },
    DUR: { fast: 0.16, mid: 0.28, slow: 0.52 },
  };
})();
