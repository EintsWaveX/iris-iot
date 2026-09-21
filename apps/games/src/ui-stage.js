/**
 * Arena Asisten IRIS - Stage, the projector view.
 *
 * A dedicated full-viewport surface for the room's big screen: no nav, no
 * controls, no prose, and type sized to be read from the back row rather
 * than at arm's length. The 25 phones keep the normal UI -- this is only
 * ever the one machine driving the projector.
 *
 * Entered with `?stage=1` or the nav toggle. The toggle doubles as the user
 * gesture the Fullscreen API requires: it cannot be requested from a state
 * change, only from a real interaction, so the request rides on that click.
 *
 * It follows `meta.activeGame` and derives the phase from the game document
 * itself rather than `meta.phase` -- meta.phase is only ever written as
 * "draw" when a game is opened, so trusting it would leave the projector
 * showing a draw while the final was being played.
 *
 * Built once and patched from then on (see gotcha 9 in REBUILD.md): the
 * Store reconciles every 3s and a wholesale rebuild here would restart every
 * animation on the biggest screen in the room.
 */
(function () {
  "use strict";

  // The projector holds the champion moment far longer than a phone does --
  // a room needs time to look up, react, and applaud. app.js reads this when
  // it fires the takeover.
  var CHAMPION_HOLD_MS = 15000;

  var STANDINGS_SHOWN = 5;

  var on = false;
  var built = false;
  var root = null;
  var toggleEl = null;
  var lastState = null;
  var els = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function findGame(gameId) {
    var games = (window.DATA && window.DATA.games) || [];
    for (var i = 0; i < games.length; i++) {
      if (games[i].id === gameId) return games[i];
    }
    return null;
  }

  function findPerson(kode) {
    var roster = (window.DATA && window.DATA.roster) || [];
    for (var i = 0; i < roster.length; i++) {
      if (roster[i].kode === kode) return roster[i];
    }
    return null;
  }

  function groupName(index) {
    var group = ((window.DATA && window.DATA.groups) || [])[index];
    return group ? group.nama : "Grup " + (index + 1);
  }

  function memberNames(draw, index) {
    var codes = (draw && draw[index]) || [];
    return codes.map(function (kode) {
      var p = findPerson(kode);
      return p ? p.nama : kode;
    });
  }

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  function buildOnce() {
    root = document.getElementById("stage");
    if (!root) return false;

    root.textContent = "";

    var head = el("div", "stage__head");
    els.eyebrow = el("p", "stage__eyebrow", "");
    els.title = el("h2", "stage__title", "");
    head.appendChild(els.eyebrow);
    head.appendChild(els.title);
    root.appendChild(head);

    var body = el("div", "stage__body");

    // --- waiting -----------------------------------------------------------
    els.wait = el("div", "stage-wait");
    els.waitText = el("p", "stage-wait__text", "Menunggu undian");
    els.waitSub = el("p", "stage-wait__sub", "");
    els.wait.appendChild(els.waitText);
    els.wait.appendChild(els.waitSub);
    body.appendChild(els.wait);

    // --- the draw ----------------------------------------------------------
    els.groups = el("div", "stage-groups");
    els.groupRefs = [];
    for (var g = 0; g < 4; g++) {
      var col = el("div", "stage-group stage-group--" + (g + 1));
      var colHead = el("div", "stage-group__head");
      colHead.appendChild(el("span", "stage-group__numeral", String(g + 1)));
      colHead.appendChild(el("span", "stage-group__name", groupName(g)));
      col.appendChild(colHead);
      var list = el("ul", "stage-group__members");
      col.appendChild(list);
      els.groups.appendChild(col);
      els.groupRefs.push({ col: col, list: list });
    }
    body.appendChild(els.groups);

    // --- the bracket -------------------------------------------------------
    els.bracket = el("div", "stage-bracket");
    els.matchRefs = {};
    ["sf1", "sf2", "final"].forEach(function (key) {
      var labels = { sf1: "Semifinal 1", sf2: "Semifinal 2", final: "Final" };
      var row = el("div", "stage-match");
      row.appendChild(el("div", "stage-match__label", labels[key]));

      var sides = el("div", "stage-match__sides");
      var a = el("div", "stage-match__side");
      var vs = el("div", "stage-match__vs", "vs");
      var b = el("div", "stage-match__side");
      sides.appendChild(a);
      sides.appendChild(vs);
      sides.appendChild(b);
      row.appendChild(sides);

      els.bracket.appendChild(row);
      els.matchRefs[key] = { row: row, a: a, b: b };
    });
    body.appendChild(els.bracket);

    // --- standings ---------------------------------------------------------
    els.standings = el("div", "stage-standings");
    els.standingsHead = el("p", "stage-standings__head", "Klasemen sementara");
    els.standingsList = el("ol", "stage-standings__list");
    els.standings.appendChild(els.standingsHead);
    els.standings.appendChild(els.standingsList);
    body.appendChild(els.standings);

    root.appendChild(body);

    var foot = el("div", "stage__foot");
    els.hint = el("p", "stage__hint", "Esc untuk keluar");
    foot.appendChild(els.hint);
    root.appendChild(foot);

    built = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // phase
  // -------------------------------------------------------------------------

  function phaseFor(gameDoc) {
    if (!gameDoc || !gameDoc.draw) return "lobby";
    if (!window.Engine) return "lobby";
    var resolved = window.Engine.resolveBracket(gameDoc);
    if (resolved.champion !== null) return "champion";
    if (resolved.sf1 !== null || resolved.sf2 !== null) return "bracket";
    return "draw";
  }

  function setShown(node, shown) {
    if (node) node.style.display = shown ? "" : "none";
  }

  // -------------------------------------------------------------------------
  // patch
  // -------------------------------------------------------------------------

  function renderGroups(draw) {
    for (var g = 0; g < 4; g++) {
      var ref = els.groupRefs[g];
      var names = memberNames(draw, g);
      // Rebuild only when the membership actually changed, so a reconcile
      // every 3s does not restring the same names on the projector.
      var signature = names.join("|");
      if (ref.signature === signature) continue;
      ref.signature = signature;

      ref.list.textContent = "";
      names.forEach(function (name) {
        ref.list.appendChild(el("li", "stage-group__member", name));
      });
    }
  }

  function sideText(draw, index) {
    if (index === null || index === undefined) return "—";
    return groupName(index);
  }

  function applySideState(node, index, state) {
    node.textContent = sideText(null, index);
    node.className = "stage-match__side";
    if (index !== null && index !== undefined) {
      node.classList.add("stage-match__side--" + (index + 1));
    }
    if (state) node.classList.add("stage-match__side--" + state);
  }

  function renderBracket(draw, resolved) {
    var sf1 = els.matchRefs.sf1;
    applySideState(sf1.a, 0, resolved.sf1 === null ? null : resolved.sf1 === 0 ? "winner" : "loser");
    applySideState(sf1.b, 1, resolved.sf1 === null ? null : resolved.sf1 === 1 ? "winner" : "loser");

    var sf2 = els.matchRefs.sf2;
    applySideState(sf2.a, 2, resolved.sf2 === null ? null : resolved.sf2 === 2 ? "winner" : "loser");
    applySideState(sf2.b, 3, resolved.sf2 === null ? null : resolved.sf2 === 3 ? "winner" : "loser");

    var fin = els.matchRefs.final;
    var champ = resolved.champion;
    applySideState(
      fin.a,
      resolved.sf1,
      champ === null ? null : champ === resolved.sf1 ? "winner" : "loser"
    );
    applySideState(
      fin.b,
      resolved.sf2,
      champ === null ? null : champ === resolved.sf2 ? "winner" : "loser"
    );
  }

  function renderStandings(state) {
    if (!window.Engine || !window.DATA) return;
    var standings = window.Engine.computeStandings(state.games || {}, window.DATA.roster);

    els.standingsList.textContent = "";
    standings.slice(0, STANDINGS_SHOWN).forEach(function (entry, i) {
      var row = el("li", "stage-standings__row");
      row.appendChild(el("span", "stage-standings__rank tabular", String(i + 1)));
      row.appendChild(el("span", "stage-standings__name", entry.nama));
      row.appendChild(el("span", "stage-standings__points tabular", String(entry.points)));
      els.standingsList.appendChild(row);
    });
  }

  function render(state) {
    if (state) lastState = state;
    if (!on || !built) return;

    var s = lastState;
    if (!s) return;

    var gameId = (s.meta && s.meta.activeGame) || null;
    var game = gameId ? findGame(gameId) : null;
    var gameDoc = (s.games && s.games[gameId]) || null;
    var phase = phaseFor(gameDoc);

    root.setAttribute("data-phase", phase);

    els.eyebrow.textContent = game ? "Game " + game.no : "Arena Asisten IRIS";
    els.title.textContent = game ? game.nama : "Arena Asisten IRIS";

    setShown(els.wait, phase === "lobby");
    setShown(els.groups, phase === "draw");
    setShown(els.bracket, phase === "bracket");
    setShown(els.standings, phase === "champion");

    if (phase === "lobby") {
      var hadir = (s.attendance && s.attendance.hadir) || {};
      var count = Object.keys(hadir).filter(function (k) {
        return hadir[k];
      }).length;
      els.waitSub.textContent = count + " asisten hadir";
      return;
    }

    if (phase === "draw") {
      renderGroups(gameDoc.draw);
      return;
    }

    if (phase === "bracket") {
      renderBracket(gameDoc.draw, window.Engine.resolveBracket(gameDoc));
      return;
    }

    // champion: the takeover itself is fired by app.js, which holds it longer
    // while the stage is on. What stays behind on the projector afterwards is
    // the standings, which is what the room wants to look at next.
    renderStandings(s);
  }

  // -------------------------------------------------------------------------
  // fullscreen
  // -------------------------------------------------------------------------

  function requestFullscreen() {
    var node = document.documentElement;
    var fn =
      node.requestFullscreen ||
      node.webkitRequestFullscreen ||
      node.msRequestFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(node);
      // Refused when the click was not treated as a gesture. The stage still
      // works windowed, so swallow it rather than surfacing a console error.
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {}
  }

  function exitFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(document);
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // on / off
  // -------------------------------------------------------------------------

  function setOn(next, fromGesture) {
    next = !!next;
    if (next === on) return;
    on = next;

    if (on && !built) buildOnce();

    var docEl = document.documentElement;
    if (on) docEl.setAttribute("data-stage", "on");
    else docEl.removeAttribute("data-stage");

    if (root) root.hidden = !on;
    if (toggleEl) toggleEl.setAttribute("aria-pressed", on ? "true" : "false");

    // The Fullscreen API only honours a request that comes from a real user
    // interaction, so it can only ride on the toggle click -- never on a
    // state change or the ?stage=1 boot path.
    if (on && fromGesture) requestFullscreen();
    if (!on) exitFullscreen();

    if (on) render(null);
  }

  function toggle() {
    setOn(!on, true);
  }

  // -------------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------------

  function readStageParam() {
    try {
      return /[?&]stage=1(?:&|$)/.test(window.location.search);
    } catch (e) {
      return false;
    }
  }

  function init() {
    root = document.getElementById("stage");
    toggleEl = document.getElementById("stage-toggle");

    if (toggleEl) {
      toggleEl.addEventListener("click", function () {
        toggle();
      });
    }

    document.addEventListener("keydown", function (evt) {
      if (!on) return;
      if (evt.key === "Escape") setOn(false);
    });

    if (readStageParam()) setOn(true);
  }

  var Stage = {
    render: render,
    toggle: toggle,
    setOn: setOn,
    isOn: function () {
      return on;
    },
    championHoldMs: CHAMPION_HOLD_MS
  };

  window.Stage = Stage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
