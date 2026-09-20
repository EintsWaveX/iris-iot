/**
 * Perburuan LoRa IRIS - the member roster, fetched rather than broadcast.
 *
 * Seven groups with their names is five or six hundred bytes. Riding the
 * 10 Hz frame that would be 6 KB/s per phone of data that changes maybe
 * five times in an afternoon, on a hotspot that also has to carry the
 * hunt. So the frame carries only a revision counter, and this module
 * refetches the real thing when that number moves.
 *
 * What comes back is the running session's groups and the names in them.
 * Student IDs are never in it: the server projects each member down to a
 * name before serialising. This module could not show a NIM if it wanted
 * to, which is the point - /roster.json has no token on it.
 *
 * window.Roster = { get, group, names, label, isActive, remaining,
 *                   session, onChange, sync, refresh }
 */
(function () {
  "use strict";

  var regu = {};
  // The cache key for "have we already fetched this version of the roster".
  // Deliberately NOT the server's own rev number: it is a composite of the
  // rev and the running session, and it is written in exactly one place.
  // It used to be a single variable that sync() wrote a string into and the
  // fetch handler wrote the server's integer back over, so the two never
  // compared equal and every single frame refetched /roster.json - roughly
  // ten requests a second, per phone, for a file that changes about five
  // times in an afternoon.
  var stamp = null;
  var sisa = null;
  var sesi = null;
  var pending = false;
  var listeners = [];

  function fire() {
    for (var i = 0; i < listeners.length; i++) listeners[i](regu);
  }

  function fetchRoster() {
    if (pending) return;
    pending = true;
    window.fetch("roster.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        pending = false;
        if (!data) return;
        regu = data.regu || {};
        sisa = data.sisa;
        sesi = typeof data.sesi === "undefined" ? null : data.sesi;
        fire();
      })
      .catch(function () {
        // An offline hotspot drops requests now and then. Clearing the
        // stamp is what makes the next frame try again - without it a
        // dropped fetch would leave the phone showing group numbers for
        // the rest of the session.
        //
        // Cleared on a timer rather than immediately, because frames arrive
        // at 10 Hz: an endpoint that is genuinely down would otherwise be
        // retried ten times a second, which is the loop this whole stamp
        // exists to prevent.
        pending = false;
        window.setTimeout(function () { stamp = null; }, 2000);
      });
  }

  /** Called on every frame. Cheap: an integer compare. */
  function sync(state) {
    if (!state) return;
    sisa = state.sesi_sisa;
    // A session change moves the roster wholesale even when nobody edited
    // it, so the session id counts as a revision for refetch purposes.
    var seen = String(state.roster_rev) + "/" + String(state.sesi);
    if (seen !== stamp) {
      stamp = seen;
      fetchRoster();
    }
  }

  function group(grup) {
    return regu[String(grup)] || null;
  }

  window.Roster = {
    sync: sync,
    refresh: fetchRoster,
    get: function () { return regu; },
    group: group,
    names: function (grup) {
      var entry = group(grup);
      return (entry && entry.anggota) || [];
    },
    label: function (grup) {
      var entry = group(grup);
      if (entry && entry.nama) return entry.nama;
      return I18N.t("card.group") + " " + grup;
    },
    isActive: function (grup) {
      var entry = group(grup);
      return entry ? entry.aktif !== false : true;
    },
    remaining: function () { return sisa; },
    session: function () { return sesi; },
    onChange: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    }
  };
})();
