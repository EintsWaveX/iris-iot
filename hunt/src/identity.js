/**
 * Perburuan LoRa IRIS - who is holding this phone.
 *
 * Until this file existed, every browser on the hotspot was the same
 * anonymous god: it could award the win to anybody and wipe the session.
 * Now a client is one of three things, and it says so on every connect.
 *
 *   tamu      nobody in particular. Watches, touches nothing.
 *   anggota   a practitioner, matched to a group by their student ID.
 *   asisten   holds the token. Rules on claims, edits the day plan.
 *
 * The group is no longer something the phone chooses. It used to be: you
 * tapped a coloured tile and the server believed you, which meant a
 * mistyped tap put somebody in the wrong group and a hand-edited message
 * could put them anywhere. Now the phone stores a student ID and the
 * server resolves it against whichever session is running. The group here
 * is a cached answer, never an assertion - every reconnect asks again.
 *
 * That also gives session rollover for free. When the running session
 * changes, the same ID stops resolving, and the phone puts itself back on
 * the login screen without needing to be told.
 *
 * window.Identity = { nim, setNim, clear, group, nama, session,
 *                     token, setToken, clearToken, role, isAssistant,
 *                     onChange, hydrate }
 */
(function () {
  "use strict";

  var KEY_NIM = "iris_hunt_nim";
  var KEY_TOKEN = "iris_hunt_token";

  var nim = null;
  var nama = "";
  var grup = null;            // resolved by the server, never by us
  var sesi = null;            // which session that resolution belongs to
  var token = null;
  var role = "tamu";          // mirrors what the server last told us
  var listeners = [];

  // Every storage access is wrapped: private windows, blocked site data and
  // some kiosk browsers all throw rather than returning null.
  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (err) {
      // Not being able to remember is not a reason to refuse the login;
      // the session simply lasts until the tab closes.
    }
  }

  function fire() {
    for (var i = 0; i < listeners.length; i++) listeners[i](role, grup);
  }

  function cleanNim(value) {
    if (typeof value !== "string") return null;
    var v = value.replace(/\s+/g, "").toUpperCase();
    return /^[A-Z0-9]{4,20}$/.test(v) ? v : null;
  }

  function recompute() {
    if (token) role = "asisten";
    else if (grup !== null) role = "anggota";
    else role = "tamu";
  }

  function hydrate() {
    nim = cleanNim(read(KEY_NIM));
    token = read(KEY_TOKEN) || null;
    // grup stays null until the server answers. A stored ID is a claim to
    // be checked, not a membership already granted.
    grup = null;
    sesi = null;
    recompute();
  }

  window.Identity = {
    hydrate: hydrate,

    nim: function () { return nim; },
    nama: function () { return nama; },
    group: function () { return grup; },
    session: function () { return sesi; },

    /** Remember an ID the server has just accepted. */
    accept: function (value, info) {
      nim = cleanNim(value);
      write(KEY_NIM, nim);
      grup = (info && typeof info.grup === "number") ? info.grup : null;
      nama = (info && info.nama) || "";
      sesi = info ? info.sesi : null;
      recompute();
      if (window.Store) Store.hello();
      fire();
    },

    /** Forget the practitioner. Leaves an assistant token alone. */
    clear: function () {
      if (nim === null && grup === null) return;
      nim = null;
      nama = "";
      grup = null;
      sesi = null;
      write(KEY_NIM, null);
      recompute();
      if (window.Store) Store.hello();
      fire();
    },

    token: function () { return token; },
    setToken: function (value) {
      token = value ? String(value).trim().toUpperCase() : null;
      write(KEY_TOKEN, token);
      recompute();
      if (window.Store) Store.hello();
      fire();
    },
    clearToken: function () { window.Identity.setToken(null); },

    role: function () { return role; },
    isAssistant: function () { return role === "asisten"; },

    /**
     * The server is the authority, on both counts. A stored token that a
     * restart rotated must re-lock the assistant tab, and a student ID
     * that no longer resolves - because the session rolled over - must
     * drop the phone back to the login screen rather than leave it
     * showing a group it is no longer part of.
     */
    acceptServerRole: function (reply) {
      if (!reply) return;
      var changed = false;

      if (reply.peran && reply.peran !== role) {
        role = reply.peran;
        changed = true;
        if (role !== "asisten" && token) {
          token = null;
          write(KEY_TOKEN, null);
        }
      }

      var nextGrup = (typeof reply.grup === "number") ? reply.grup : null;
      if (nextGrup !== grup) {
        grup = nextGrup;
        changed = true;
      }
      if (grup === null && nim !== null) {
        nim = null;
        nama = "";
        sesi = null;
        write(KEY_NIM, null);
        changed = true;
      }
      if (typeof reply.sesi !== "undefined" && grup !== null) sesi = reply.sesi;

      if (changed) {
        recompute();
        fire();
      }
    },

    onChange: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    }
  };
})();
