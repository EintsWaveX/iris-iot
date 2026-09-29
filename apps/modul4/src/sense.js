/**
 * Perburuan LoRa IRIS - the phone as an instrument.
 *
 * Everything else on this page assumes somebody is looking at it. Out on
 * the field nobody is: the phone is held at waist height while four people
 * walk across open ground watching where they put their feet. A number
 * that only exists on screen is a number nobody reads.
 *
 * So this file gives the hunt two channels that do not need eyes, and one
 * that keeps the eyes working when they do come back.
 *
 *   Wake lock   The screen stays awake while a member is on the hunt
 *               screen. A phone that sleeps every thirty seconds turns
 *               every glance into unlock-navigate-wait, and the reading
 *               they finally see is the one from after they stopped
 *               walking.
 *
 *   Ticking     A short tone repeated at a rate and pitch that rise as the
 *               group closes on the beacon, like a Geiger counter. Rate
 *               alone is hard to judge at the fast end, so the pitch
 *               carries the same information a second time.
 *
 *   Buzzing     navigator.vibrate on the same beat, but only once the
 *               server calls the group warm or better. A phone that buzzes
 *               continuously for 150 minutes is a phone with a flat
 *               battery and an owner who has stopped noticing it. Starting
 *               to buzz is itself the signal.
 *
 * Both feedback channels are OFF by default and behind one toggle. Audio
 * cannot legally start without a user gesture anyway, and a lab full of
 * phones all ticking at once is a decision that belongs to the people in
 * the lab, not to this file.
 *
 * Nothing in here is allowed to fail loudly. Wake Lock is absent on
 * Firefox for Android, vibration is absent on every iPhone, and an
 * AudioContext can refuse to start for reasons the page never learns. Each
 * is probed, each failure is swallowed, and the hunt carries on without
 * that channel.
 *
 * window.Sense = { mount, update, keepAwake, stop, enabled, setEnabled }
 */
(function () {
  "use strict";

  var STORE_KEY = "iris_hunt_sense";

  // Tick rate at the far edge of the arena and standing on the beacon.
  var RATE_FAR = 0.6;          // Hz
  var RATE_NEAR = 8.0;         // Hz
  var PITCH_FAR = 420;         // Hz
  var PITCH_NEAR = 1180;       // Hz
  var TONE_SEC = 0.045;        // length of one tick
  var BUZZ_MS = 18;

  // The reference distance the perceptual curve is anchored on. Three
  // metres is the burning radius floor, so the curve spends most of its
  // resolution exactly where the hunt is decided.
  var D0 = 3.0;

  var on = false;

  var ctx = null;              // AudioContext, once a gesture has allowed it
  var master = null;
  var timer = 0;
  var live = null;             // last row we were told about, or null

  var lock = null;             // WakeLockSentinel
  var lockPending = false;     // a request() is in flight
  var lockWanted = false;

  function read() {
    try {
      return window.localStorage.getItem(STORE_KEY);
    } catch (err) {
      return null;
    }
  }

  function write(value) {
    try {
      if (value === null) window.localStorage.removeItem(STORE_KEY);
      else window.localStorage.setItem(STORE_KEY, value);
    } catch (err) {
      /* private window, blocked site data - the preference just will not
         survive a reload, which is not worth breaking the hunt over. */
    }
  }

  // ---------------------------------------------------------------- audio

  /**
   * Build the audio graph, or report that we cannot.
   *
   * Must be reached from a user gesture the first time. Both callers are:
   * the toggle itself, and a one-shot listener for the case where the
   * preference was restored from a previous visit.
   */
  function ensureAudio() {
    if (ctx) {
      if (ctx.state === "suspended" && ctx.resume) {
        // Fire and forget: a rejection here only means no sound, and the
        // next gesture will try again.
        try { ctx.resume(); } catch (err) { /* no sound this time */ }
      }
      return ctx.state !== "closed";
    }

    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;

    try {
      ctx = new Ctor();
      master = ctx.createGain();
      // Well below unity. This is meant to be audible from a pocket, not
      // to carry across a field - the radio already does that.
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
      master = null;
      return false;
    }
    return true;
  }

  /**
   * One tick: a short sine burst with its own envelope.
   *
   * The envelope is not decoration. A bare oscillator switched on and off
   * clicks, and at eight ticks a second a train of clicks is unpleasant
   * enough that people turn the feature off.
   */
  function tone(hz) {
    if (!ctx || !master || ctx.state !== "running") return;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var env = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, now);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1.0, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + TONE_SEC);

    osc.connect(env);
    env.connect(master);
    osc.start(now);
    osc.stop(now + TONE_SEC + 0.01);
  }

  function buzz() {
    if (!navigator.vibrate) return;
    try { navigator.vibrate(BUZZ_MS); } catch (err) { /* refused */ }
  }

  // ------------------------------------------------------------- the curve

  /**
   * Where this group sits between the beacon and the far edge, 0..1.
   *
   * Deliberately logarithmic. Linear distance spends almost all of its
   * range on ground the hunt has already left behind: on a 300 m arena the
   * difference between 3 m and 30 m - which is the entire endgame - would
   * be nine per cent of the scale and inaudible. The log curve gives that
   * stretch a third of the range instead.
   *
   * It is driven by jarak_m and arena_m, both absolute, rather than by the
   * frame's `progress`. `progress` is rescaled against the best and worst
   * readings anyone has taken this round, so it moves when *other* groups
   * move. A tick that speeds up while you stand still is worse than no
   * tick at all.
   */
  function reach(jarak, arena) {
    if (!(arena > D0)) return 1;
    var x = Math.log(1 + jarak / D0) / Math.log(1 + arena / D0);
    return Math.max(0, Math.min(1, x));
  }

  /** Is there anything to say about this row? */
  function speaks(row) {
    if (!row || !row.online) return false;
    if (row.jarak_m === null || typeof row.jarak_m === "undefined") return false;
    // Once THIS group has found its own target the hunt is over for them,
    // and a phone still ticking in somebody's pocket on the walk back is
    // just noise. Other groups still racing their own targets are
    // unaffected -- there is no shared "the hunt is over" any more.
    if (row.status === "menang") return false;
    if (document.hidden) return false;
    return true;
  }

  // ------------------------------------------------------------ the beat

  function beat() {
    timer = 0;
    if (!on || !live) return;

    var arena = (live.arena && live.arena > 0) ? live.arena : 300;
    var x = reach(live.jarak, arena);

    tone(PITCH_FAR + (PITCH_NEAR - PITCH_FAR) * (1 - x));
    if (live.warm) buzz();

    var rate = RATE_FAR + (RATE_NEAR - RATE_FAR) * (1 - x);
    // Recomputed every tick rather than held in a setInterval, so a group
    // that has just walked into range hears it on the next beat instead of
    // whenever a fixed timer happens to come round.
    timer = window.setTimeout(beat, Math.round(1000 / rate));
  }

  function startBeat() {
    if (timer || !on || !live) return;
    beat();
  }

  function stopBeat() {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  }

  // -------------------------------------------------------------- wake lock

  function requestLock() {
    if (!lockWanted || lock || lockPending) return;
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    if (document.hidden) return;   // the request is rejected while hidden

    // The in-flight guard is not politeness. update() runs off the broadcast
    // frame at 10 Hz and asks for the lock every time; `lock` is only set
    // once the promise resolves, so without this flag every frame inside
    // that window starts its own request. They all resolve, each one
    // overwrites the handle, and every sentinel but the last is leaked -
    // held by the browser with nothing left that can release it. The screen
    // would then stay awake for the rest of the session, including after
    // the group logs out.
    lockPending = true;

    try {
      navigator.wakeLock.request("screen").then(function (sentinel) {
        lockPending = false;
        if (!lockWanted || lock) {
          try { sentinel.release(); } catch (err) { /* already gone */ }
          return;
        }
        lock = sentinel;
        // The browser drops the lock on its own - tab switch, battery
        // saver, a phone call. The sentinel says so, and clearing our
        // handle is what lets visibilitychange ask for a new one.
        sentinel.addEventListener("release", function () {
          if (lock === sentinel) lock = null;
        });
      }).catch(function () {
        lockPending = false;
        /* Battery saver refuses outright on some phones. The hunt does not
           depend on this; the screen just sleeps as it normally would. */
      });
    } catch (err) {
      lockPending = false;
      /* Non-secure origin. The lab serves over plain http on 192.168.4.1,
         which some browsers treat as insecure, so this is a real path. */
    }
  }

  function releaseLock() {
    var sentinel = lock;
    lock = null;
    if (!sentinel) return;
    try { sentinel.release(); } catch (err) { /* already gone */ }
  }

  // ------------------------------------------------------------------ api

  /**
   * Called from the hunt renderer on every frame with the member's own row,
   * or with null when there is nothing to follow - no group yet, the
   * projector view, or a screen other than the hunt.
   */
  /**
   * Hold the screen awake, or stop holding it.
   *
   * Separate from update() because the projector wants exactly this and
   * nothing else: it has no distance of its own to tick about, but a
   * scoreboard that blanks itself fifteen minutes into a session is the
   * same bug wearing a bigger screen.
   */
  function keepAwake(want) {
    lockWanted = !!want;
    if (lockWanted) requestLock();
    else releaseLock();
  }

  function update(row, state) {
    var wants = speaks(row);

    keepAwake(!!row && row.status !== "menang");

    if (!wants) {
      live = null;
      stopBeat();
      return;
    }

    live = {
      jarak: row.jarak_m,
      arena: (state && state.model) ? state.model.arena_m : 300,
      // Reading the server's own band rather than re-deriving the ladder
      // here: one copy of that table, on the side that owns it.
      warm: row.heat === "hangat" || row.heat === "panas"
            || row.heat === "membara"
    };

    if (on) startBeat();
  }

  /** Hard stop, for logout and session rollover. */
  function stop() {
    live = null;
    lockWanted = false;
    stopBeat();
    releaseLock();
  }

  function setEnabled(next, gesture) {
    next = !!next;
    if (next === on) return on;
    on = next;
    write(on ? "1" : "0");

    if (on) {
      // A gesture is the only moment audio is allowed to begin. When this
      // came from a tap we have one; when it came from a restored
      // preference we do not, and the document listener below will pick it
      // up on the first touch of the session.
      if (gesture !== false) ensureAudio();
      startBeat();
      if (navigator.vibrate) buzz();   // proof it is on, once
    } else {
      stopBeat();
    }
    return on;
  }

  function enabled() { return on; }

  function mount() {
    on = read() === "1";

    // Restored from a previous visit: the audio graph cannot exist yet, so
    // wait for the first touch anywhere on the page and build it then.
    if (on) {
      var wake = function () {
        document.removeEventListener("pointerdown", wake);
        document.removeEventListener("keydown", wake);
        if (on) { ensureAudio(); startBeat(); }
      };
      document.addEventListener("pointerdown", wake);
      document.addEventListener("keydown", wake);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        // Timers are throttled to a crawl in a hidden tab anyway, so a
        // beat left running would come back as an arrhythmic stutter.
        stopBeat();
      } else {
        requestLock();     // the lock is always dropped on hide
        if (on && live) startBeat();
      }
    });
  }

  window.Sense = {
    mount: mount,
    update: update,
    keepAwake: keepAwake,
    stop: stop,
    enabled: enabled,
    setEnabled: setEnabled
  };
})();
