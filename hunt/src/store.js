/**
 * Perburuan LoRa IRIS - realtime state.
 *
 * A single WebSocket to the Orange Pi carries the whole scoreboard: the
 * server pushes a complete snapshot ten times a second, so there is no patch
 * protocol to get wrong and no way for the page to drift out of step with the
 * server. The page sends only two things back, both of them assistant
 * decisions: confirm a find, and start a new session.
 *
 * The watchdog is the part that matters. games/src/store.js learned the hard
 * way that a realtime stream can deliver its first frame and then go quiet
 * without ever firing an error -- a laptop lid closing, a projector machine
 * sleeping, wifi handing over. So this file does not trust onclose alone: it
 * tracks the time of the last frame and rebuilds the socket when frames stop,
 * and it re-checks on visibilitychange and online.
 *
 * window.Store = { init, getState, subscribe, onStatus, onEvents, onReply,
 *                  masuk, claim, jadwalSet, sesiMulai, confirmFind, reset,
 *                  status }
 */
(function () {
  "use strict";

  var STALE_MS = 3000;    // No frame for this long => the socket is dead
  var CHECK_MS = 1000;    // How often the watchdog looks
  var RETRY_MIN = 500;
  var RETRY_MAX = 8000;

  var state = null;
  var socket = null;
  var status = "offline";  // live | reconnecting | offline

  var lastFrameAt = 0;
  var retry = RETRY_MIN;
  var timer = null;
  var seenEvents = {};
  var started = false;

  var subscribers = [];
  var statusListeners = [];
  var eventListeners = [];
  var replyListeners = [];

  function now() {
    return Date.now();
  }

  function endpoint() {
    // Served from the Pi itself, so the socket rides the same host and port
    // the page came from. That also means opening the page by IP, by mDNS
    // name or through a tunnel all keep working with no configuration.
    var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    var host = window.location.host || "127.0.0.1:8080";
    return proto + "//" + host + "/live";
  }

  function setStatus(next) {
    if (next === status) return;
    status = next;
    for (var i = 0; i < statusListeners.length; i++) statusListeners[i](status);
  }

  function publish() {
    for (var i = 0; i < subscribers.length; i++) subscribers[i](state);
  }

  // Events arrive as a rolling tail of the server's log, so the same entry is
  // present in many consecutive frames. Key them so a toast fires once.
  function drainEvents(list) {
    if (!list || !list.length) return;

    var fresh = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      var key = ev.kind + "|" + ev.grup + "|" + ev.at;
      if (seenEvents[key]) continue;
      seenEvents[key] = true;
      fresh.push(ev);
    }

    // The first frame after a (re)connect carries history, not news. Showing
    // it would flood the screen with toasts for things that already happened.
    if (!started) {
      started = true;
      return;
    }

    if (!fresh.length) return;
    for (var j = 0; j < eventListeners.length; j++) eventListeners[j](fresh);
  }

  function onFrame(raw) {
    var frame;
    try {
      frame = JSON.parse(raw);
    } catch (err) {
      return;
    }

    lastFrameAt = now();
    retry = RETRY_MIN;
    setStatus("live");

    // The server sends two different things down one socket: the 10 Hz
    // broadcast that every client gets, and replies addressed to this
    // client alone. Older frames carry no "tipe", so a missing one means
    // broadcast.
    var tipe = frame.tipe || "bingkai";
    if (tipe !== "bingkai") {
      for (var i = 0; i < replyListeners.length; i++) replyListeners[i](frame);
      return;
    }

    state = frame;
    drainEvents(frame.peristiwa);
    publish();
  }

  function open() {
    try {
      socket = new WebSocket(endpoint());
    } catch (err) {
      setStatus("offline");
      return;
    }

    socket.onopen = function () {
      lastFrameAt = now();
      setStatus("live");
      // Roles live on the connection, not on the device, so every reopen
      // has to say who we are again.
      hello();
    };

    socket.onmessage = function (ev) {
      onFrame(ev.data);
    };

    socket.onclose = function () {
      setStatus("reconnecting");
      schedule();
    };

    socket.onerror = function () {
      // onclose always follows, and that is where the retry is scheduled.
      // Reconnecting from both would open two sockets.
    };
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(function () {
      timer = null;
      open();
    }, retry);
    retry = Math.min(RETRY_MAX, retry * 2);
  }

  function rebuild() {
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      try { socket.close(); } catch (err) { /* already gone */ }
      socket = null;
    }
    setStatus("reconnecting");
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    open();
  }

  function watchdog() {
    if (document.hidden) return;

    var stale = (now() - lastFrameAt) > STALE_MS;
    var closed = !socket ||
                 socket.readyState === 2 /* CLOSING */ ||
                 socket.readyState === 3 /* CLOSED */;

    if (closed) {
      schedule();
    } else if (stale && socket.readyState === 1 /* OPEN */) {
      // Open, but silent. This is the failure the watchdog exists for.
      rebuild();
    }
  }

  function send(message) {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Privileged actions carry the token on the message itself, so a tab that
  // reconnects mid-action is still authorised without waiting for a fresh
  // handshake.
  function sendAuth(message) {
    var token = window.Identity ? Identity.token() : null;
    if (token) message.token = token;
    return send(message);
  }

  function sendBinary(buffer) {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(buffer);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Announce who this browser is. Called on every open, because roles live
  // on the connection rather than on the device.
  //
  // It sends the student ID, not a group number. The group is the server's
  // answer to that ID against the running session, so a phone cannot name
  // its own group and a phone left over from an earlier session stops
  // resolving the moment the session rolls over.
  function hello() {
    if (!window.Identity) return false;
    var msg = { aksi: "halo" };
    var nim = Identity.nim();
    var token = Identity.token();
    if (nim) msg.nim = nim;
    if (token) msg.token = token;
    return send(msg);
  }

  function init() {
    open();
    window.setInterval(watchdog, CHECK_MS);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) watchdog();
    });
    window.addEventListener("online", watchdog);
    window.addEventListener("offline", function () { setStatus("offline"); });
  }

  window.Store = {
    init: init,
    getState: function () { return state; },
    subscribe: function (fn) {
      if (typeof fn !== "function") return;
      subscribers.push(fn);
      if (state) fn(state);
    },
    onStatus: function (fn) {
      if (typeof fn !== "function") return;
      statusListeners.push(fn);
      fn(status);
    },
    onEvents: function (fn) {
      if (typeof fn === "function") eventListeners.push(fn);
    },
    onReply: function (fn) {
      if (typeof fn === "function") replyListeners.push(fn);
    },
    hello: hello,
    send: send,
    sendAuth: sendAuth,
    sendBinary: sendBinary,
    masuk: function (nim) {
      return send({ aksi: "masuk", nim: nim });
    },
    claim: function (grup, foto) {
      return send({ aksi: "klaim", grup: grup, foto: foto || null });
    },
    photoStart: function (grup, bytes, mime) {
      return send({ aksi: "foto_mulai", grup: grup, ukuran: bytes, mime: mime });
    },
    reject: function (grup, alasan) {
      return sendAuth({ aksi: "tolak", grup: grup, alasan: alasan });
    },
    jadwalBaca: function () {
      return sendAuth({ aksi: "jadwal_baca" });
    },
    jadwalSet: function (sesi, regu, jam) {
      var msg = { aksi: "jadwal_set", sesi: sesi, regu: regu };
      if (jam) msg.jam = jam;
      return sendAuth(msg);
    },
    jadwalClear: function () {
      return sendAuth({ aksi: "jadwal_hapus" });
    },
    sesiMulai: function (sesi) {
      return sendAuth({ aksi: "sesi_mulai", sesi: sesi });
    },
    sesiAkhiri: function () {
      return sendAuth({ aksi: "sesi_akhiri" });
    },
    confirmFind: function (grup, paksa) {
      return sendAuth({ aksi: "konfirmasi", grup: grup, paksa: !!paksa });
    },
    calibrate: function (grup) {
      return sendAuth({ aksi: "kalibrasi", grup: grup });
    },
    reset: function () {
      seenEvents = {};
      started = false;
      return sendAuth({ aksi: "reset" });
    },
    status: function () { return status; }
  };
})();
