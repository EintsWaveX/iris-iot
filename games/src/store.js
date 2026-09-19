/**
 * Store — realtime state layer for Arena Asisten IRIS.
 *
 * Wraps the `db` and `room` capabilities (contract 0.2.37) behind a small
 * synchronous-read / async-write API. See the data model and public API
 * comments below; this file assigns a single global, `window.Store`.
 *
 * Modes:
 *   - "offline"   claude.use("db") resolved null. Everything lives in an
 *                 in-memory object; every setter is synchronous-feeling
 *                 (resolves immediately) and still notifies subscribers.
 *   - "operator"  db is available and this viewer's writes succeed (probed
 *                 once at init via a throwaway doc).
 *   - "spectator" db is available but this viewer cannot write. Setters
 *                 become safe no-ops: they resolve, never reject/throw, and
 *                 perform no network write.
 *
 * Fixed document set (never grows): event/meta, event/attendance,
 * event/_probe, games/g1..g6 — nine documents total.
 */
(function () {
  "use strict";

  var DEBUG = false;

  function dlog() {
    if (DEBUG && typeof console !== "undefined") {
      console.log.apply(console, ["[Store]"].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function jitter(base, spread) {
    return base + Math.random() * spread;
  }

  // ---------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------

  var state = {
    meta: { activeGame: "g1", phase: "lobby" },
    attendance: { hadir: {} },
    games: {}
  };

  var subscribers = [];
  var mode = "offline"; // 'operator' | 'spectator' | 'offline' — valid after init()
  var db = null;
  var room = null;
  var initPromise = null;

  var celebrateHandlers = [];
  var peersHandlers = [];

  function getState() {
    return { meta: state.meta, attendance: state.attendance, games: state.games };
  }

  function notify() {
    var snapshot = getState();
    for (var i = 0; i < subscribers.length; i++) {
      try {
        subscribers[i](snapshot);
      } catch (e) {
        if (typeof console !== "undefined") console.error("[Store] subscriber threw", e);
      }
    }
    // After the render, so a takeover fired from here is drawn over a screen
    // that already shows the crowned bracket rather than the previous one.
    observeCelebrate();
  }

  function subscribe(fn) {
    subscribers.push(fn);
    try {
      fn(getState());
    } catch (e) {
      if (typeof console !== "undefined") console.error("[Store] subscriber threw", e);
    }
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------

  function handleWriteError(e) {
    var code = e && e.code;
    if (code === "revoked") {
      // Terminal for this page load: flip to spectator permanently and let
      // the UI degrade. Never re-probe.
      mode = "spectator";
      notify();
      if (typeof console !== "undefined") console.warn("[Store] db grant revoked; switching to spectator", e);
      return;
    }
    if (code === "resource_exhausted" || code === "quota_exceeded") {
      // A budget/cap — retrying cannot succeed. Surface, don't hammer.
      if (typeof console !== "undefined") console.warn("[Store] write throttled (" + code + ")", e);
      return;
    }
    if (typeof console !== "undefined") console.warn("[Store] write failed", e);
  }

  // ---------------------------------------------------------------------
  // db subscriptions
  // ---------------------------------------------------------------------

  function subscribeToDb() {
    db.doc("event/meta").onSnapshot(
      function (snap) {
        if (snap.exists) {
          markRemoteApplied();
          state.meta = snap.data();
          notify();
        }
      },
      function (err) {
        dlog("meta subscription error", err);
        if (err && err.code === "revoked") {
          mode = "spectator";
        }
        // Degrade to last known state; do not blank the UI.
        notify();
      }
    );

    db.doc("event/attendance").onSnapshot(
      function (snap) {
        if (snap.exists) {
          state.attendance = snap.data();
          notify();
        }
      },
      function (err) {
        dlog("attendance subscription error", err);
        if (err && err.code === "revoked") {
          mode = "spectator";
        }
        notify();
      }
    );

    db.collection("games").onSnapshot(
      function (qsnap) {
        var games = {};
        for (var i = 0; i < qsnap.docs.length; i++) {
          var d = qsnap.docs[i];
          if (d.exists) games[d.id] = d.data();
        }
        state.games = games;
        notify();
      },
      function (err) {
        dlog("games subscription error", err);
        if (err && err.code === "revoked") {
          mode = "spectator";
        }
        notify();
      }
    );
  }

  // ---------------------------------------------------------------------
  // Seeding (operator only, once, via set() so it works on empty docs)
  // ---------------------------------------------------------------------

  function readRosterCodes() {
    var codes = [];
    try {
      var roster = (typeof window !== "undefined" && window.DATA && window.DATA.roster) || null;
      if (Array.isArray(roster)) {
        for (var i = 0; i < roster.length; i++) {
          var entry = roster[i];
          var kode = typeof entry === "string" ? entry : entry && entry.kode;
          if (kode) codes.push(kode);
        }
      }
    } catch (e) {
      dlog("readRosterCodes failed", e);
    }
    return codes;
  }

  /**
   * Fill the in-memory attendance map with every roster code present.
   * Used by offline mode, which has no stored document to read defaults
   * from. Never overwrites entries that already exist.
   */
  function seedLocalAttendance() {
    var codes = readRosterCodes();
    if (!state.attendance || typeof state.attendance !== "object") {
      state.attendance = { hadir: {} };
    }
    if (!state.attendance.hadir || typeof state.attendance.hadir !== "object") {
      state.attendance.hadir = {};
    }
    for (var i = 0; i < codes.length; i++) {
      if (!(codes[i] in state.attendance.hadir)) {
        state.attendance.hadir[codes[i]] = true;
      }
    }
  }

  function seedDefaults() {
    var metaSeed = db
      .doc("event/meta")
      .get()
      .then(function (snap) {
        if (!snap.exists) {
          return db.doc("event/meta").set({ activeGame: "g1", phase: "lobby" });
        }
      })
      .catch(function (e) {
        handleWriteError(e);
      });

    var attSeed = db
      .doc("event/attendance")
      .get()
      .then(function (snap) {
        if (!snap.exists) {
          var codes = readRosterCodes();
          var hadir = {};
          for (var i = 0; i < codes.length; i++) hadir[codes[i]] = true;
          return db.doc("event/attendance").set({ hadir: hadir });
        }
      })
      .catch(function (e) {
        handleWriteError(e);
      });

    return Promise.all([metaSeed, attSeed]);
  }

  // ---------------------------------------------------------------------
  // room
  // ---------------------------------------------------------------------

  function setupRoom() {
    if (!room) return;

    try {
      room.on(
        "juara",
        function (msg) {
          // emit() broadcasts to everyone "you included" -- our own moment
          // comes back as isMe && sameTab. The page already renders the
          // celebration locally at send time (App.celebrateChampion), so
          // replaying the echo here would double-fire the confetti on the
          // operator's screen. The contract's rule is render-on-send OR
          // render-on-echo, never both; we render on send, so drop the echo.
          if (msg && msg.sameTab) return;
          var data = msg && msg.data;
          for (var i = 0; i < celebrateHandlers.length; i++) {
            try {
              celebrateHandlers[i](data);
            } catch (e) {
              if (typeof console !== "undefined") console.error("[Store] onCelebrate handler threw", e);
            }
          }
        },
        function (err) {
          dlog("room.on(juara) error", err);
        }
      );
    } catch (e) {
      dlog("room.on threw", e);
    }

    try {
      room.onPeers(
        function (change) {
          var count = change.peers.length;
          for (var i = 0; i < peersHandlers.length; i++) {
            try {
              peersHandlers[i](count);
            } catch (e) {
              if (typeof console !== "undefined") console.error("[Store] onPeers handler threw", e);
            }
          }
        },
        function (err) {
          dlog("room.onPeers error", err);
        }
      );
    } catch (e) {
      dlog("room.onPeers threw", e);
    }
  }

  // --- the champion broadcast ------------------------------------------
  //
  // The takeover used to be driven purely by each client noticing a champion
  // appear in the game document it happened to be rendering. That works for
  // anyone looking at the right game and silently skips everyone else: a
  // spectator who had wandered into a different game saw nothing at all,
  // because ui-game.js only ever renders the one game it has open.
  //
  // So the moment is broadcast explicitly. Two transports, because the two
  // runtimes offer different primitives:
  //
  //   - Artifact runtime: room.emit("juara"), a real pub/sub channel.
  //   - Firebase: there is no channel, so the moment is stamped into the
  //     state document at meta.celebrate, which already syncs to every
  //     client, and everyone watches that one field for a change.
  //
  // `at` is an opaque change marker and NOT a timestamp anyone compares
  // against their own clock. Twenty-five phones have twenty-five slightly
  // wrong clocks, so a wall-clock freshness test would have some of them
  // replaying an old takeover and others refusing to fire at all. Instead a
  // client seeds itself from the first remote snapshot it applies and reacts
  // only to changes after that -- which makes joining late silent and being
  // in the room when it happens reliable, with no clock involved.

  // --- connection status ------------------------------------------------
  //
  // This replaces the viewer count, which could never have worked: a real
  // presence number needs unauthenticated writes from spectators, and
  // firebase-rules.json deliberately forbids them -- /state is ".write":
  // false and every write goes through the Admin SDK behind the operator
  // token. So the chip reports something the client can actually know: is
  // this page still in touch with the room.
  //
  //   live          a snapshot landed recently
  //   reconnecting  nothing has landed for a while; the watchdog is retrying
  //   offline       no backend at all, or the browser says the network is gone
  var statusHandlers = [];
  var connStatus = "offline";
  var fbLastOkAt = 0;

  function setStatus(next) {
    if (next === connStatus) return;
    connStatus = next;
    for (var i = 0; i < statusHandlers.length; i++) {
      try {
        statusHandlers[i](connStatus);
      } catch (e) {
        if (typeof console !== "undefined") console.error("[Store] onStatus handler threw", e);
      }
    }
  }

  function onStatus(fn) {
    statusHandlers.push(fn);
    try {
      fn(connStatus);
    } catch (e) {
      dlog("onStatus immediate call threw", e);
    }
    return function unsubscribe() {
      var idx = statusHandlers.indexOf(fn);
      if (idx !== -1) statusHandlers.splice(idx, 1);
    };
  }

  var remoteApplied = false;
  var celebrateSeeded = false;
  var lastCelebrateAt = null;
  var ownCelebrateStamps = {}; // at -> true, for stamps this client authored

  function markRemoteApplied() {
    remoteApplied = true;
  }

  function fireCelebrateHandlers(data) {
    for (var i = 0; i < celebrateHandlers.length; i++) {
      try {
        celebrateHandlers[i](data);
      } catch (e) {
        if (typeof console !== "undefined") console.error("[Store] onCelebrate handler threw", e);
      }
    }
  }

  function celebrateStampAt() {
    var stamp = state.meta && state.meta.celebrate;
    if (!stamp || typeof stamp !== "object") return null;
    return typeof stamp.at === "number" ? stamp.at : null;
  }

  function observeCelebrate() {
    // Before the first remote snapshot there is nothing to compare against,
    // and seeding from the local defaults would make the first real snapshot
    // look like a change even when it carries an hour-old celebration.
    if (!remoteApplied) return;

    var at = celebrateStampAt();

    if (!celebrateSeeded) {
      celebrateSeeded = true;
      lastCelebrateAt = at;
      return;
    }

    if (at === null || at === lastCelebrateAt) return;
    lastCelebrateAt = at;

    // A stamp this client authored. The page rendered the moment locally at
    // send time, so record it as seen and stop, rather than replaying the
    // takeover on the operator's own screen.
    if (ownCelebrateStamps[at]) {
      delete ownCelebrateStamps[at];
      return;
    }

    var stamp = state.meta.celebrate;
    var gameId = typeof stamp.gameId === "string" ? stamp.gameId : null;
    var g = gameId ? state.games[gameId] : null;

    fireCelebrateHandlers({
      gameId: gameId,
      groupIndex: g && g.champion != null ? g.champion : null,
      at: at
    });
  }

  function celebrate(gameId) {
    var g = state.games[gameId];
    var groupIndex = g && g.champion != null ? g.champion : null;
    var at = Date.now();

    if (room) {
      var payload = { gameId: gameId, groupIndex: groupIndex, at: at };
      try {
        var p = room.emit("juara", payload);
        if (p && typeof p.catch === "function") {
          p.catch(function (e) {
            dlog("room.emit(juara) rejected", e);
          });
        }
      } catch (e) {
        dlog("room.emit threw", e);
      }
      return Promise.resolve();
    }

    // Only the operator may write, and only the operator should: a spectator
    // observing the champion must not re-broadcast it back to the room.
    if (mode === "spectator") return Promise.resolve();

    // Our own stamp returns through the state document like anyone else's.
    // Remember that we authored this one so observeCelebrate() records it
    // without replaying it.
    //
    // Note what does NOT work here: pre-setting lastCelebrateAt to the value
    // we are about to write. Until that write lands, incoming snapshots still
    // carry the PREVIOUS stamp, which would then compare unequal and fire the
    // previous game's takeover -- crowning a second game replayed the first
    // one, and then the real echo fired on top of it.
    ownCelebrateStamps[at] = true;

    var stamp = { gameId: gameId, at: at };

    if (!db) return fbPush({ meta: { celebrate: stamp } });

    return db
      .doc("event/meta")
      .update({ celebrate: stamp })
      .catch(function (e) {
        dlog("celebrate stamp rejected", e);
      });
  }

  function onCelebrate(fn) {
    celebrateHandlers.push(fn);
    return function unsubscribe() {
      var idx = celebrateHandlers.indexOf(fn);
      if (idx !== -1) celebrateHandlers.splice(idx, 1);
    };
  }

  function onPeers(fn) {
    peersHandlers.push(fn);
    try {
      fn(room ? room.peers().length : 0);
    } catch (e) {
      dlog("onPeers immediate call threw", e);
    }
    return function unsubscribe() {
      var idx = peersHandlers.indexOf(fn);
      if (idx !== -1) peersHandlers.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------

  function probeIsOperator() {
    return db
      .doc("event/_probe")
      .set({ t: Date.now() })
      .then(function () {
        return true;
      })
      .catch(function (e) {
        // Any rejection => spectator. Fail closed: invalid_argument is the
        // documented "not admin" signal, but every other code fails closed
        // too — better a spectator who can't click than 25 phones writing.
        dlog("operator probe rejected", e);
        return false;
      });
  }

  // ---------------------------------------------------------------------
  // Firebase transport (self-hosted / Vercel deployment)
  // ---------------------------------------------------------------------
  // Reads stream straight from the Realtime Database over its REST
  // streaming endpoint, so spectators cost the deployment nothing: no
  // serverless invocation, no polling. Writes are the only thing that goes
  // through the app's own /api/write, which holds the credentials and
  // checks the operator token. That asymmetry is deliberate -- 25 phones
  // watching for three hours must not translate into 25 open functions.

  var fb = null; // { databaseURL, token, es } once configured

  function fbApiBase() {
    // Relative so it works at the deployment root or under a path prefix.
    var p = window.location.pathname;
    if (p.charAt(p.length - 1) !== "/") p = p.replace(/[^/]*$/, "");
    return p + "api/";
  }

  function fbReadToken() {
    try {
      var m = /[?&]op=([^&#]+)/.exec(window.location.search);
      if (m) {
        var t = decodeURIComponent(m[1]);
        try {
          window.sessionStorage.setItem("arena_op", t);
        } catch (e) {}
        return t;
      }
      return window.sessionStorage.getItem("arena_op") || null;
    } catch (e) {
      return null;
    }
  }

  function fbJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw { code: "http_" + r.status, status: r.status };
      return r.json();
    });
  }

  /**
   * Apply one RTDB stream frame.
   *
   * The REST stream emits two kinds, and conflating them corrupts state:
   *   put   -- the value AT this path is exactly `data`; replace it.
   *   patch -- only the named children changed; MERGE them, leaving the
   *            siblings alone.
   * Treating a patch as a replace silently drops every key the frame did
   * not mention. Here that wiped `draw` out of the local game document, and
   * because setWinner posts the whole document back (the server replaces a
   * game wholesale by contract), the truncated copy then destroyed the real
   * draw in Firebase.
   */
  function fbApplyStreamEvent(kind, msg) {
    if (!msg || typeof msg !== "object") return;
    markRemoteApplied();
    var path = msg.path === "/" || !msg.path ? [] : msg.path.replace(/^\//, "").split("/");
    var data = msg.data;

    if (path.length === 0) {
      if (kind === "patch") {
        // Root-level merge: only the named top-level keys changed.
        var incomingPatch = data && typeof data === "object" ? data : {};
        for (var pk in incomingPatch) {
          if (Object.prototype.hasOwnProperty.call(incomingPatch, pk)) {
            if (incomingPatch[pk] === null) delete state[pk];
            else state[pk] = incomingPatch[pk];
          }
        }
        normalizeState();
        notify();
        return;
      }
      var incoming = data && typeof data === "object" ? data : {};
      state.meta = incoming.meta || { activeGame: "g1", phase: "lobby" };
      state.attendance = incoming.attendance || { hadir: {} };
      state.games = incoming.games || {};
      if (!incoming.attendance || !incoming.attendance.hadir) {
        // Empty database on first run: fall back to everyone present so the
        // roster never opens at 0/25.
        seedLocalAttendance();
      }
      notify();
      return;
    }

    // Walk to the parent of the addressed node, creating containers as needed.
    var cursor = state;
    for (var i = 0; i < path.length - 1; i++) {
      var seg = path[i];
      if (!cursor[seg] || typeof cursor[seg] !== "object") cursor[seg] = {};
      cursor = cursor[seg];
    }
    var last = path[path.length - 1];

    if (data === null) {
      delete cursor[last];
    } else if (kind === "patch" && data && typeof data === "object" && !Array.isArray(data)) {
      var target = cursor[last];
      if (!target || typeof target !== "object" || Array.isArray(target)) target = cursor[last] = {};
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
          if (data[k] === null) delete target[k];
          else target[k] = data[k];
        }
      }
    } else {
      cursor[last] = data;
    }
    normalizeState();
    notify();
  }

  /** Keep the top-level shape valid no matter what the stream delivered. */
  function normalizeState() {
    if (!state.meta || typeof state.meta !== "object") state.meta = { activeGame: "g1", phase: "lobby" };
    if (!state.attendance || typeof state.attendance !== "object") state.attendance = { hadir: {} };
    if (!state.attendance.hadir || typeof state.attendance.hadir !== "object") state.attendance.hadir = {};
    if (!state.games || typeof state.games !== "object") state.games = {};
  }

  // --- stream liveness -------------------------------------------------
  // A bare EventSource is not enough here. Observed in production: the
  // connection opens, delivers its first frame, then silently stops
  // delivering without firing onerror and without reconnecting -- the page
  // just goes quiet while Firebase happily accepts writes. On phones this is
  // the normal case, not an edge case: locking the screen, switching apps, or
  // moving between wifi and mobile data all kill it.
  //
  // So the stream is treated as a fast path, not the source of truth:
  //   - every frame stamps fbLastFrameAt
  //   - a watchdog reopens the stream when it looks dead and reconciles over
  //     plain REST, which is cheap (one small GET) and always authoritative
  //   - becoming visible or regaining network reconciles immediately
  // Worst case the page is a few seconds stale; it can never sit silently
  // wrong for the rest of the night.

  var fbLastFrameAt = 0;
  var fbWatchdog = null;
  // Measured against the real deployment: the SSE stream delivers its first
  // frame and then goes quiet, so it cannot be the primary mechanism. A small
  // periodic read is. One GET of a ~2KB document every few seconds, for 25
  // viewers over a three-hour event, is a rounding error against Firebase's
  // free tier -- and it is the difference between the room seeing a champion
  // instantly and seeing it half a minute later.
  var FB_POLL_MS = 3000;    // reconcile cadence while the page is visible
  var FB_STALE_MS = 15000;  // no frames for this long => rebuild the stream

  function fbNow() {
    return Date.now();
  }

  /** Authoritative read. Applied exactly like a root `put` frame. */
  function fbReconcile() {
    if (!fb || !fb.databaseURL) return Promise.resolve();
    var url = fb.databaseURL.replace(/\/$/, "") + "/state.json";
    return fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.json();
      })
      .then(function (data) {
        fbLastFrameAt = fbNow();
        fbLastOkAt = fbNow();
        fbApplyStreamEvent("put", { path: "/", data: data });
        refreshFbStatus();
      })
      .catch(function (e) {
        dlog("reconcile failed", e);
        refreshFbStatus();
      });
  }

  function fbCloseStream() {
    if (fb && fb.es) {
      try {
        fb.es.close();
      } catch (e) {}
      fb.es = null;
    }
  }

  function fbOpenStream(databaseURL) {
    var url = databaseURL.replace(/\/$/, "") + "/state.json";
    var es;
    try {
      es = new EventSource(url);
    } catch (e) {
      dlog("EventSource unavailable", e);
      return null;
    }
    var onFrame = function (kind) {
      return function (ev) {
        fbLastFrameAt = fbNow();
        fbLastOkAt = fbNow();
        refreshFbStatus();
        try {
          fbApplyStreamEvent(kind, JSON.parse(ev.data));
        } catch (e) {
          dlog("bad " + kind + " frame", e);
        }
      };
    };
    es.addEventListener("put", onFrame("put"));
    es.addEventListener("patch", onFrame("patch"));
    es.onopen = function () {
      fbLastFrameAt = fbNow();
    };
    es.onerror = function () {
      // Do not tear the page down; the watchdog decides whether to reopen.
      dlog("RTDB stream error; readyState=" + (es && es.readyState));
    };
    fbLastFrameAt = fbNow();
    return es;
  }

  /** Reopen the stream if it is closed or has gone quiet, then reconcile. */
  function fbEnsureStream(force) {
    if (!fb || !fb.databaseURL) return;
    var es = fb.es;
    var dead = !es || es.readyState === 2 /* CLOSED */;
    var stale = fbNow() - fbLastFrameAt > FB_STALE_MS;
    if (!force && !dead && !stale) return;
    fbCloseStream();
    fb.es = fbOpenStream(fb.databaseURL);
    fbReconcile();
  }

  /** Derive the chip's state from what the client can actually observe. */
  function refreshFbStatus() {
    if (!fb) return;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus("offline");
        return;
      }
    } catch (e) {}
    if (!fbLastOkAt) {
      setStatus("reconnecting");
      return;
    }
    setStatus(fbNow() - fbLastOkAt <= FB_STALE_MS ? "live" : "reconnecting");
  }

  function fbPollTick() {
    if (!fb) return;
    // Nothing to show while hidden, and phones should not burn battery or
    // quota in a pocket. Becoming visible reconciles immediately below.
    try {
      if (document.hidden) return;
    } catch (e) {}
    fbReconcile();
    // Let the chip decay to "reconnecting" on its own if reads stop landing,
    // rather than sitting on a stale "live" until something else notices.
    refreshFbStatus();
    // Rebuild the stream only when it has actually gone quiet, so a healthy
    // connection is left alone.
    var es = fb.es;
    if (!es || es.readyState === 2 || fbNow() - fbLastFrameAt > FB_STALE_MS) {
      fbCloseStream();
      fb.es = fbOpenStream(fb.databaseURL);
    }
  }

  function fbStartWatchdog() {
    if (fbWatchdog !== null) return;
    fbWatchdog = setInterval(fbPollTick, FB_POLL_MS);

    try {
      document.addEventListener("visibilitychange", function () {
        // Returning from a locked phone is the most common way the stream is
        // found dead; force a fresh one and read straight away.
        if (!document.hidden) fbEnsureStream(true);
      });
      window.addEventListener("online", function () {
        fbEnsureStream(true);
      });
      window.addEventListener("offline", function () {
        refreshFbStatus();
      });
      window.addEventListener("focus", function () {
        fbReconcile();
      });
    } catch (e) {
      dlog("liveness listeners unavailable", e);
    }
  }

  /** Send a patch to /api/write. Returns a promise that never rejects. */
  function fbPush(patch) {
    if (!fb || !fb.token) return Promise.resolve();
    return fbJson(fbApiBase() + "write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Operator-Token": fb.token
      },
      body: JSON.stringify({ patch: patch })
    }).then(function (r) {
      // Confirm our own optimistic update against the server shortly after.
      setTimeout(fbReconcile, 600);
      return r;
    }).catch(function (e) {
      // The stream is the source of truth; a failed write simply won't be
      // reflected there, and the next snapshot corrects the optimistic UI.
      if (typeof console !== "undefined") {
        console.warn("[Store] write rejected", e && e.code);
      }
      if (e && (e.status === 401 || e.status === 403)) {
        mode = "spectator";
        notify();
      }
    });
  }

  /**
   * Try the self-hosted backend. Resolves the mode when it takes over, or
   * null to let the caller fall through to the Artifact capabilities.
   */
  function fbInit() {
    if (typeof fetch !== "function" || typeof EventSource !== "function") {
      return Promise.resolve(null);
    }
    // Opened straight off disk there is no backend to ask, and the attempt
    // only produces alarming-looking CORS errors in the console. Skip it.
    try {
      if (window.location.protocol === "file:") return Promise.resolve(null);
    } catch (e) {
      return Promise.resolve(null);
    }
    return fbJson(fbApiBase() + "config")
      .then(function (cfg) {
        if (!cfg || !cfg.ok || !cfg.databaseURL) return null;

        var token = fbReadToken();
        fb = { databaseURL: cfg.databaseURL, token: token, es: null };
        fb.es = fbOpenStream(cfg.databaseURL);
        fbStartWatchdog();
        // Read once up front so the page is correct even if the stream's
        // first frame never arrives.
        fbReconcile();

        if (!token) {
          mode = "spectator";
          return { mode: mode };
        }
        return fbJson(fbApiBase() + "whoami?op=" + encodeURIComponent(token))
          .then(function (who) {
            mode = who && who.operator ? "operator" : "spectator";
            if (mode !== "operator") fb.token = null;
            return { mode: mode };
          })
          .catch(function () {
            mode = "spectator";
            fb.token = null;
            return { mode: mode };
          });
      })
      .catch(function () {
        // No /api/config at all -- not a self-hosted deployment.
        return null;
      });
  }

  function init() {
    if (initPromise) return initPromise;

    initPromise = (function () {
      // The self-hosted backend wins when present: it is the only transport
      // that can reach viewers outside the owner's organization, which the
      // Artifact db capability cannot do. Fall through to the capabilities
      // only when there is no /api/config to answer.
      return fbInit().then(function (fbResult) {
        if (fbResult) {
          seedLocalAttendance();
          notify();
          refreshFbStatus();
          return fbResult;
        }
        return initCapabilities().then(function (capResult) {
          // The Artifact db capability keeps its own live subscription, so
          // reaching it at all means the page is connected. With no backend
          // of any kind there is nothing to be connected to, and the chip
          // should say so rather than claim a link that does not exist.
          setStatus(db ? "live" : "offline");
          return capResult;
        });
      });
    })();

    return initPromise;
  }

  function initCapabilities() {
    return (function () {
      var hasClaude =
        typeof window !== "undefined" && window.claude && typeof window.claude.use === "function";

      var dbPromise = hasClaude
        ? Promise.resolve()
            .then(function () {
              return window.claude.use("db");
            })
            .catch(function () {
              return null;
            })
        : Promise.resolve(null);

      var roomPromise = hasClaude
        ? Promise.resolve()
            .then(function () {
              return window.claude.use("room");
            })
            .catch(function () {
              return null;
            })
        : Promise.resolve(null);

      return Promise.all([dbPromise, roomPromise]).then(function (results) {
        var resolvedDb = results[0];
        var resolvedRoom = results[1];

        room = resolvedRoom || null;
        setupRoom();

        if (!resolvedDb) {
          mode = "offline";
          db = null;
          // Offline has no document to seed from, so apply the same defaults
          // the operator path writes to event/attendance. Without this every
          // assistant reads as absent and the roster opens at 0/25, which
          // would make whoever opens the page tap 25 cards before the first
          // draw is even possible. The workbook has everyone present by
          // default; match it.
          seedLocalAttendance();
          notify();
          return { mode: mode };
        }

        db = resolvedDb;

        return probeIsOperator().then(function (isOperator) {
          mode = isOperator ? "operator" : "spectator";
          subscribeToDb();

          var after = mode === "operator" ? seedDefaults() : Promise.resolve();
          return after
            .catch(function (e) {
              handleWriteError(e);
            })
            .then(function () {
              notify();
              return { mode: mode };
            });
        });
      });
    })();
  }

  // ---------------------------------------------------------------------
  // Attendance — nested single-key update, debounced per key (~150ms)
  // ---------------------------------------------------------------------

  var attendancePending = {}; // kode -> { timer, value, resolvers: [], prev }

  function cloneHadirWith(kode, value) {
    var hadir = {};
    var current = state.attendance && state.attendance.hadir;
    if (current) {
      for (var k in current) {
        if (Object.prototype.hasOwnProperty.call(current, k)) hadir[k] = current[k];
      }
    }
    hadir[kode] = value;
    var next = {};
    if (state.attendance) {
      for (var f in state.attendance) {
        if (Object.prototype.hasOwnProperty.call(state.attendance, f)) next[f] = state.attendance[f];
      }
    }
    next.hadir = hadir;
    return next;
  }

  function revertAttendance(kode, prevValue) {
    state.attendance = cloneHadirWith(kode, prevValue);
    notify();
  }

  function writeAttendanceNow(kode, value, prevValue) {
    var ref = db.doc("event/attendance");
    var patch = { hadir: {} };
    patch.hadir[kode] = value;

    return ref.update(patch).catch(function (e) {
      var code = e && e.code;

      if (code === "invalid_argument") {
        // update() rejects on a missing document — fall back to set()
        // with the full current map.
        var full = { hadir: {} };
        var current = state.attendance && state.attendance.hadir;
        if (current) {
          for (var k in current) {
            if (Object.prototype.hasOwnProperty.call(current, k)) full.hadir[k] = current[k];
          }
        }
        full.hadir[kode] = value;
        return db
          .doc("event/attendance")
          .set(full)
          .catch(function (e2) {
            revertAttendance(kode, prevValue);
            handleWriteError(e2);
          });
      }

      if (code === "unavailable") {
        return delay(jitter(150, 250))
          .then(function () {
            return ref.update(patch);
          })
          .catch(function (e2) {
            revertAttendance(kode, prevValue);
            handleWriteError(e2);
          });
      }

      revertAttendance(kode, prevValue);
      handleWriteError(e);
    });
  }

  function setAttendance(kode, hadir) {
    if (mode === "spectator") return Promise.resolve();

    if (!db) {
      state.attendance = cloneHadirWith(kode, hadir);
      notify();
      var hadirPatch = {};
      hadirPatch[kode] = !!hadir;
      return fbPush({ attendance: { hadir: hadirPatch } });
    }

    // operator: optimistic echo, coalesced/debounced write per key
    var prev = state.attendance && state.attendance.hadir ? state.attendance.hadir[kode] : undefined;
    state.attendance = cloneHadirWith(kode, hadir);
    notify();

    return new Promise(function (resolve) {
      var pending = attendancePending[kode];
      if (!pending) {
        pending = attendancePending[kode] = { timer: null, resolvers: [], prev: prev };
      }
      pending.value = hadir;
      pending.resolvers.push(resolve);
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(function () {
        delete attendancePending[kode];
        writeAttendanceNow(kode, pending.value, pending.prev).then(function () {
          for (var i = 0; i < pending.resolvers.length; i++) pending.resolvers[i]();
        });
      }, 150);
    });
  }

  /**
   * Set many people at once, in one write.
   *
   * "Hadir semua" over 25 people through setAttendance() is 25 separate
   * writes -- on the Firebase path that is 25 POSTs fired back to back,
   * which is exactly the shape of thing that falls over on venue wifi.
   * /api/write already merges attendance.hadir key by key, so the whole
   * bulk action fits in a single patch.
   *
   * @param {Object.<string, boolean>} map - kode -> present
   */
  function setAttendanceMany(map) {
    if (mode === "spectator") return Promise.resolve();

    var keys = [];
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) keys.push(k);
    }
    if (!keys.length) return Promise.resolve();

    var prevAttendance = state.attendance;

    var current = (state.attendance && state.attendance.hadir) || {};
    var nextHadir = {};
    for (var c in current) {
      if (Object.prototype.hasOwnProperty.call(current, c)) nextHadir[c] = current[c];
    }

    var patch = {};
    for (var i = 0; i < keys.length; i++) {
      var value = !!map[keys[i]];
      nextHadir[keys[i]] = value;
      patch[keys[i]] = value;
    }

    state.attendance = { hadir: nextHadir };
    notify();

    function revert(e) {
      state.attendance = prevAttendance;
      notify();
      handleWriteError(e);
    }

    if (!db) return fbPush({ attendance: { hadir: patch } });

    var ref = db.doc("event/attendance");
    return ref.update({ hadir: patch }).catch(function (e) {
      // update() rejects on a missing document -- fall back to writing the
      // whole map, which we already have locally.
      if (e && e.code === "invalid_argument") {
        return ref.set({ hadir: nextHadir }).catch(revert);
      }
      revert(e);
    });
  }

  // ---------------------------------------------------------------------
  // Games — draw / winners / phase / reset
  // ---------------------------------------------------------------------

  function defaultGameDoc() {
    return { draw: null, sf1: null, sf2: null, champion: null, drawnAt: null };
  }

  function replaceGameLocal(gameId, doc) {
    var next = {};
    for (var k in state.games) {
      if (Object.prototype.hasOwnProperty.call(state.games, k)) next[k] = state.games[k];
    }
    next[gameId] = doc;
    state.games = next;
  }

  function mergeGameLocal(gameId, patch) {
    var existing = state.games[gameId] || defaultGameDoc();
    var merged = {};
    for (var k in existing) {
      if (Object.prototype.hasOwnProperty.call(existing, k)) merged[k] = existing[k];
    }
    for (var p in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, p)) merged[p] = patch[p];
    }
    replaceGameLocal(gameId, merged);
  }

  function revertGame(gameId, prevDoc) {
    if (prevDoc === undefined) {
      var next = {};
      for (var k in state.games) {
        if (Object.prototype.hasOwnProperty.call(state.games, k) && k !== gameId) next[k] = state.games[k];
      }
      state.games = next;
    } else {
      replaceGameLocal(gameId, prevDoc);
    }
    notify();
  }

  function writeGameFull(gameId, doc, prevDoc) {
    return db
      .doc("games/" + gameId)
      .set(doc)
      .catch(function (e) {
        var code = e && e.code;
        if (code === "unavailable") {
          return delay(jitter(150, 250))
            .then(function () {
              return db.doc("games/" + gameId).set(doc);
            })
            .catch(function (e2) {
              revertGame(gameId, prevDoc);
              handleWriteError(e2);
            });
        }
        revertGame(gameId, prevDoc);
        handleWriteError(e);
      });
  }

  function setDraw(gameId, draw) {
    if (mode === "spectator") return Promise.resolve();

    var prev = state.games[gameId];
    var doc = { draw: draw, sf1: null, sf2: null, champion: null, drawnAt: Date.now() };

    if (!db) {
      replaceGameLocal(gameId, doc);
      notify();
      var drawPatch = {};
      drawPatch[gameId] = doc;
      return fbPush({ games: drawPatch });
    }

    replaceGameLocal(gameId, doc);
    notify();
    return writeGameFull(gameId, doc, prev);
  }

  function setWinner(gameId, round, groupIndex) {
    if (round !== "sf1" && round !== "sf2" && round !== "champion") {
      dlog("setWinner: unknown round", round);
      return Promise.resolve();
    }

    if (mode === "spectator") return Promise.resolve();

    var patch = {};
    patch[round] = groupIndex;

    if (!db) {
      mergeGameLocal(gameId, patch);
      notify();
      var winPatch = {};
      winPatch[gameId] = state.games[gameId];
      return fbPush({ games: winPatch });
    }

    var prev = state.games[gameId];
    mergeGameLocal(gameId, patch);
    notify();

    var ref = db.doc("games/" + gameId);
    return ref.update(patch).catch(function (e) {
      var code = e && e.code;

      if (code === "invalid_argument") {
        // Document doesn't exist yet — create it from local + defaults.
        var full = defaultGameDoc();
        var localDoc = state.games[gameId] || {};
        for (var k in localDoc) {
          if (Object.prototype.hasOwnProperty.call(localDoc, k)) full[k] = localDoc[k];
        }
        full[round] = groupIndex;
        if (!full.drawnAt) full.drawnAt = Date.now();
        return db
          .doc("games/" + gameId)
          .set(full)
          .catch(function (e2) {
            revertGame(gameId, prev);
            handleWriteError(e2);
          });
      }

      if (code === "unavailable") {
        return delay(jitter(150, 250))
          .then(function () {
            return ref.update(patch);
          })
          .catch(function (e2) {
            revertGame(gameId, prev);
            handleWriteError(e2);
          });
      }

      revertGame(gameId, prev);
      handleWriteError(e);
    });
  }

  function setPhase(gameId, phase) {
    if (mode === "spectator") return Promise.resolve();

    var patch = { activeGame: gameId, phase: phase };

    if (!db) {
      var nextMeta = {};
      for (var k in state.meta) {
        if (Object.prototype.hasOwnProperty.call(state.meta, k)) nextMeta[k] = state.meta[k];
      }
      nextMeta.activeGame = gameId;
      nextMeta.phase = phase;
      state.meta = nextMeta;
      notify();
      return fbPush({ meta: { activeGame: gameId, phase: phase } });
    }

    var prevMeta = state.meta;
    var optimisticMeta = {};
    for (var f in prevMeta) {
      if (Object.prototype.hasOwnProperty.call(prevMeta, f)) optimisticMeta[f] = prevMeta[f];
    }
    optimisticMeta.activeGame = gameId;
    optimisticMeta.phase = phase;
    state.meta = optimisticMeta;
    notify();

    var ref = db.doc("event/meta");
    return ref.update(patch).catch(function (e) {
      var code = e && e.code;

      if (code === "invalid_argument") {
        return ref
          .set(patch)
          .catch(function (e2) {
            state.meta = prevMeta;
            notify();
            handleWriteError(e2);
          });
      }

      if (code === "unavailable") {
        return delay(jitter(150, 250))
          .then(function () {
            return ref.update(patch);
          })
          .catch(function (e2) {
            state.meta = prevMeta;
            notify();
            handleWriteError(e2);
          });
      }

      state.meta = prevMeta;
      notify();
      handleWriteError(e);
    });
  }

  function resetGame(gameId) {
    if (mode === "spectator") return Promise.resolve();

    var doc = defaultGameDoc();

    if (!db) {
      replaceGameLocal(gameId, doc);
      notify();
      var resetPatch = {};
      resetPatch[gameId] = doc;
      return fbPush({ games: resetPatch });
    }

    var prev = state.games[gameId];
    replaceGameLocal(gameId, doc);
    notify();
    return writeGameFull(gameId, doc, prev);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  var Store = {
    init: init,
    getState: getState,
    subscribe: subscribe,
    setAttendance: setAttendance,
    setAttendanceMany: setAttendanceMany,
    setDraw: setDraw,
    setWinner: setWinner,
    setPhase: setPhase,
    resetGame: resetGame,
    celebrate: celebrate,
    onCelebrate: onCelebrate,
    onStatus: onStatus,
    onPeers: onPeers
  };

  Object.defineProperty(Store, "status", {
    get: function () {
      return connStatus;
    },
    enumerable: true
  });

  Object.defineProperty(Store, "mode", {
    get: function () {
      return mode;
    },
    enumerable: true
  });

  var root = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this;
  root.Store = Store;
})();
