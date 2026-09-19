/**
 * Arena Asisten IRIS - app shell: router, Store wiring, viewer count/mode
 * indicator, and the confetti canvas.
 */
(function () {
  "use strict";

  var currentScreen = "roster";
  var appEl = null;

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // The native `hidden` attribute loses to any author rule that sets its
  // own `display` (e.g. `.btn { display: inline-flex }`), because origin
  // beats specificity. Several elements we need to hide here carry such a
  // class, so drive visibility through inline `display` directly instead
  // of relying on `.hidden`.
  function setHidden(el, hide) {
    if (el) el.style.display = hide ? "none" : "";
  }

  // -------------------------------------------------------------------------
  // router
  // -------------------------------------------------------------------------

  function show(screenName) {
    var changed = screenName !== currentScreen;
    currentScreen = screenName;

    // Every screen has its own sky. Changing tabs punches into hyperspace,
    // swaps the scene while the streaks cover the change, then decelerates
    // out -- so navigation reads as travelling somewhere rather than as a
    // panel swap. No-ops into a plain scene set under reduced motion.
    if (window.Cosmos) {
      if (changed) window.Cosmos.warpTo(screenName);
      else window.Cosmos.setScene(screenName);
    }

    var screens = document.querySelectorAll(".screen");
    var incoming = null;
    for (var i = 0; i < screens.length; i++) {
      var s = screens[i];
      var active = s.id === "screen-" + screenName;
      s.classList.toggle("is-active", active);
      if (active) incoming = s;
      setScreenInLayout(s, active);
    }

    // The incoming screen's blocks rise in rather than the whole panel
    // cross-fading. Only on an actual change: re-running this when show() is
    // called for the screen already on display would restage a screen the
    // viewer is in the middle of reading.
    if (changed && incoming) animateIn(incoming);

    var navLinks = document.querySelectorAll(".nav-link");
    for (var j = 0; j < navLinks.length; j++) {
      var link = navLinks[j];
      var active = link.getAttribute("data-screen") === screenName;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  // All five screens share one grid cell and cross-fade. Hidden-by-visibility
  // screens still size that cell and still add to the document's scrollable
  // height, so the page was always as tall as the tallest screen (Aturan,
  // ~3300px) no matter which one you were on -- on Klasemen, 415px of content
  // and ~2900px of empty scroll behind it. Taking the outgoing screen out of
  // layout is the only thing that actually shortens the document.
  //
  // It has to happen AFTER the fade, or the screen would vanish instead of
  // fading. Must stay >= --dur-mid (280ms) in tokens.css.
  var FADE_OUT_MS = 280;
  var hideTimers = {};

  function setScreenInLayout(screen, active) {
    if (hideTimers[screen.id]) {
      clearTimeout(hideTimers[screen.id]);
      hideTimers[screen.id] = null;
    }
    if (active) {
      screen.style.display = "";
      return;
    }
    hideTimers[screen.id] = setTimeout(function () {
      hideTimers[screen.id] = null;
      // Re-check: the viewer may have come back to this screen mid-fade.
      if (!screen.classList.contains("is-active")) screen.style.display = "none";
    }, FADE_OUT_MS);
  }

  // The warp hides the swap for roughly its first third, so the content
  // arrives just as the streaks let go of it rather than underneath them.
  var ENTER_DELAY_S = 0.18;

  function animateIn(screen) {
    if (!window.Motion) return;

    var blocks = [];
    for (var i = 0; i < screen.children.length; i++) {
      var child = screen.children[i];
      // Skip anything currently hidden -- an empty state that is display:none
      // would otherwise be staggered in as an invisible gap in the sequence.
      if (child.style.display === "none") continue;
      blocks.push(child);
    }
    if (blocks.length) window.Motion.enter(blocks, { delay: ENTER_DELAY_S });

    var title = screen.querySelector(".screen__title");
    if (title) window.Motion.revealText(title, { delay: ENTER_DELAY_S });
  }

  function wireNav() {
    var nav = document.getElementById("nav");
    if (!nav) return;
    nav.addEventListener("click", function (evt) {
      var target = evt.target.closest ? evt.target.closest("[data-screen]") : null;
      if (!target || !nav.contains(target)) return;
      var screenName = target.getAttribute("data-screen");
      if (screenName) show(screenName);
    });
  }

  // -------------------------------------------------------------------------
  // mode / viewer widget
  // -------------------------------------------------------------------------

  // The old widget promised a viewer count the backend can never produce
  // (see the note in store.js). It now reports connection state, which is
  // both knowable and the thing an operator actually needs at a glance:
  // whether the room is still seeing what they are doing.
  var STATUS_TEXT = {
    live: "Terhubung",
    reconnecting: "Menyambung ulang",
    offline: "Terputus"
  };

  var viewerCountEl = null;
  var viewerDotEl = null;
  var viewerValueEl = null;
  var modeNoteEl = null;
  var lastStatus = "offline";

  function setupViewerWidget() {
    viewerCountEl = document.getElementById("viewer-count");
    if (!viewerCountEl) return;
    viewerDotEl = viewerCountEl.querySelector(".viewer-count__dot");
    viewerValueEl = viewerCountEl.querySelector(".viewer-count__value");

    modeNoteEl = document.createElement("span");
    // Its own class so it can carry a separator: the status and the mode are
    // both uppercase mono, and side by side they read as one run-on phrase
    // ("TERHUBUNG MODE LIHAT SAJA") rather than as two facts.
    modeNoteEl.className = "viewer-count__value viewer-count__mode";
    modeNoteEl.id = "mode-note";
    setHidden(modeNoteEl, true);
    viewerCountEl.appendChild(modeNoteEl);
  }

  function updateViewerWidget(status, mode) {
    if (!viewerCountEl) return;

    lastStatus = status || lastStatus;

    viewerCountEl.setAttribute("data-status", lastStatus);
    setHidden(viewerDotEl, false);
    if (viewerValueEl) {
      setHidden(viewerValueEl, false);
      viewerValueEl.textContent = STATUS_TEXT[lastStatus] || STATUS_TEXT.offline;
    }

    var showModeNote = mode === "spectator";
    if (modeNoteEl) {
      setHidden(modeNoteEl, !showModeNote);
      if (showModeNote) modeNoteEl.textContent = "Mode lihat saja";
    }

    setHidden(viewerCountEl, false);
  }

  function applyMode(mode) {
    if (appEl) appEl.setAttribute("data-mode", mode);

    // Only a genuine spectator (someone else is driving) gets these hidden.
    // Offline mode is a single local user who must be able to drive too.
    var operatorOnly = document.querySelectorAll("[data-operator-only]");
    for (var i = 0; i < operatorOnly.length; i++) {
      setHidden(operatorOnly[i], mode === "spectator");
    }
  }

  // -------------------------------------------------------------------------
  // confetti
  // -------------------------------------------------------------------------

  var confettiCanvas = null;
  var confettiCtx = null;
  var confettiParticles = [];
  var confettiRafId = null;

  function setupConfetti() {
    confettiCanvas = document.getElementById("confetti");
    if (!confettiCanvas) return;
    confettiCtx = confettiCanvas.getContext("2d");
    resizeConfetti();
    window.addEventListener("resize", resizeConfetti);
  }

  function resizeConfetti() {
    if (!confettiCanvas) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  function themeColor(varName, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(varName);
    return (value && value.trim()) || fallback;
  }

  function fireConfetti() {
    if (!confettiCanvas || !confettiCtx) return;
    if (prefersReducedMotion()) return;

    var colors = [
      themeColor("--gold", "#e8b64d"),
      themeColor("--accent", "#40b0ff"),
      themeColor("--gold-soft", "#f6e6c4")
    ];

    var w = confettiCanvas.width;
    var count = 90;
    for (var i = 0; i < count; i++) {
      confettiParticles.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.6,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
        maxLife: 90 + Math.random() * 60
      });
    }

    if (confettiRafId === null) confettiRafId = requestAnimationFrame(stepConfetti);
  }

  function stepConfetti() {
    confettiRafId = null;
    if (!confettiCtx) return;

    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    var alive = [];
    for (var i = 0; i < confettiParticles.length; i++) {
      var p = confettiParticles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.rotation += p.vr;

      if (p.life < p.maxLife && p.y < confettiCanvas.height + 20) {
        var fade = 1 - p.life / p.maxLife;
        confettiCtx.save();
        confettiCtx.globalAlpha = Math.max(0, fade);
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rotation);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        confettiCtx.restore();
        alive.push(p);
      }
    }
    confettiParticles = alive;

    if (confettiParticles.length > 0) {
      confettiRafId = requestAnimationFrame(stepConfetti);
    }
  }

  // -------------------------------------------------------------------------
  // the champion celebration
  //
  // One place decides what a celebration looks like, because the same moment
  // can arrive from two directions: this client noticing the champion in the
  // game document it is rendering, and the broadcast that reaches every
  // other client regardless of which game they are looking at. Both are
  // wanted -- the local observation is instant, the broadcast is what makes
  // the moment reach someone sitting on a different screen -- so the pair is
  // de-duplicated here rather than either being dropped.
  // -------------------------------------------------------------------------

  var CELEBRATE_DEDUPE_MS = 15000;
  // Keyed by game+group rather than a single last-seen slot: two games can be
  // crowned inside the dedupe window, and a single slot would be clobbered by
  // the second one and let the first fire again.
  var recentCelebrations = {};

  function celebrationKey(gameId, info) {
    return String(gameId) + ":" + (info ? info.groupIndex : "?");
  }

  function runCelebration(gameId, info) {
    var key = celebrationKey(gameId, info);
    var now = Date.now();

    for (var k in recentCelebrations) {
      if (
        Object.prototype.hasOwnProperty.call(recentCelebrations, k) &&
        now - recentCelebrations[k] >= CELEBRATE_DEDUPE_MS
      ) {
        delete recentCelebrations[k];
      }
    }

    if (recentCelebrations[key] && now - recentCelebrations[key] < CELEBRATE_DEDUPE_MS) return;
    recentCelebrations[key] = now;

    fireConfetti();
    if (info && window.Champion && typeof window.Champion.show === "function") {
      // A projector holds the moment far longer than a phone does: the room
      // needs time to look up and react, where a phone is already in the
      // viewer's hand. Champion.show takes holdMs precisely for this.
      if (window.Stage && window.Stage.isOn()) {
        info = Object.assign({}, info, { holdMs: window.Stage.championHoldMs });
      }
      window.Champion.show(info);
    }
  }

  // Champions are watched across every game document rather than only the
  // one on screen. ui-game.js used to own this, but it only ever renders the
  // game it has open, so the moment silently depended on someone looking at
  // the right screen -- and never fired at all on a projector, which opens no
  // detail screen by design.
  var championBaseline = {}; // gameId -> last seen champion index, or null

  function watchChampions(state) {
    if (!window.Engine) return;
    var games = (state && state.games) || {};

    for (var gameId in games) {
      if (!Object.prototype.hasOwnProperty.call(games, gameId)) continue;
      var doc = games[gameId];
      if (!doc) continue;

      var champion = window.Engine.resolveBracket(doc).champion;
      // Only a document that actually exists in the snapshot establishes a
      // baseline; seeding from a placeholder would make the first real
      // snapshot look like a crowning and replay old games on page load.
      var hadBaseline = Object.prototype.hasOwnProperty.call(championBaseline, gameId);
      var previous = championBaseline[gameId];
      championBaseline[gameId] = champion;

      if (!hadBaseline) continue;
      if (champion === null) continue; // cleared by a reset or a re-draw
      if (previous === champion) continue;

      App.celebrateChampion(gameId);
    }
  }

  function celebrationInfoFor(gameId) {
    if (!gameId || !window.UIGame || typeof window.UIGame.celebrationInfo !== "function") {
      return null;
    }
    return window.UIGame.celebrationInfo(gameId);
  }

  // -------------------------------------------------------------------------
  // Store wiring
  // -------------------------------------------------------------------------

  // Follow-the-operator. meta.activeGame says which game the room is on.
  // Without this a spectator opens the link and lands on "pick a game" while
  // the bracket is live on the projector -- 25 people each having to find the
  // right game by hand defeats the point of sharing a link at all.
  var lastFollowedGame = null;

  function followActiveGame(state) {
    var mode = window.Store ? window.Store.mode : "offline";
    if (mode !== "spectator") return; // the operator drives; never yank them
    var active = state && state.meta && state.meta.activeGame;
    if (!active || active === lastFollowedGame) return;
    lastFollowedGame = active;
    if (window.UIGame && typeof window.UIGame.open === "function") {
      window.UIGame.open(active);
    }
  }

  function distribute(state) {
    if (window.UIRoster) window.UIRoster.render(state);
    if (window.UIGame) window.UIGame.render(state);
    if (window.UIBoard) window.UIBoard.render(state);
    if (window.Stage) window.Stage.render(state);
    applyMode(window.Store ? window.Store.mode : "offline");
    followActiveGame(state);
    // Last, so the UI modules have already taken this snapshot -- the
    // celebration reads members and group names back out of them.
    watchChampions(state);
  }

  function init() {
    appEl = document.getElementById("app");
    wireNav();

    // The rules screen is static copy out of DATA, with nothing a Store
    // snapshot can change, so it is built once here and deliberately left
    // out of distribute().
    if (window.UIRules) window.UIRules.render();

    setupViewerWidget();
    setupConfetti();

    // Render immediately from whatever the Store already has (before init()
    // resolves) so the UI never waits on the network.
    if (window.Store) {
      distribute(window.Store.getState());
      applyMode(window.Store.mode);
    }

    if (window.Store) {
      window.Store.onStatus(function (status) {
        updateViewerWidget(status, window.Store.mode);
      });
      window.Store.onCelebrate(function (data) {
        var gameId = data && data.gameId;
        runCelebration(gameId, celebrationInfoFor(gameId));
      });

      window.Store.init().then(function () {
        applyMode(window.Store.mode);
        updateViewerWidget(window.Store.status, window.Store.mode);
        window.Store.subscribe(function (state) {
          distribute(state);
          updateViewerWidget(window.Store.status, window.Store.mode);
        });
      });
    }

    show(currentScreen);
  }

  var App = {
    show: show,
    celebrateChampion: function (gameId) {
      runCelebration(gameId, celebrationInfoFor(gameId));
      // Tell the rest of the room. A no-op for a spectator, who is only
      // echoing a champion someone else already crowned.
      if (window.Store) window.Store.celebrate(gameId);
    }
  };

  window.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
