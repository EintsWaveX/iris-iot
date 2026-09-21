/**
 * Arena Asisten IRIS - Klasemen (standings) screen.
 *
 * Keyed patching, not a rebuild. The Store reconciles every 3s, and this
 * screen animates its numbers: a wholesale rebuild would hand every count-up
 * a brand new element on every snapshot, so each one would restart from zero
 * three times a second and never arrive. Rows are therefore kept in a map by
 * `kode` and reordered in place with appendChild, which moves an existing
 * node rather than replacing it.
 */
(function () {
  "use strict";

  var root = null;
  var emptyState = null;
  var podiumEl = null;
  var listEl = null;
  var built = false;

  // kode -> { row, rankEl, pointsEl, titlesEl }
  var rowRefs = {};
  // placeIndex (1..3) -> { place, rankEl, nameEl, pointsEl, kode }
  var podiumRefs = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function countUp(node, value) {
    if (!node) return;
    if (window.Motion && typeof window.Motion.countUp === "function") {
      window.Motion.countUp(node, value, {
        format: function (v) {
          return String(Math.round(v));
        }
      });
      return;
    }
    node.textContent = String(value);
  }

  function buildOnce() {
    root = document.getElementById("screen-board");
    if (!root) return false;

    emptyState = root.querySelector('[data-empty="board"]');

    podiumEl = el("div", "podium");
    podiumEl.id = "board-podium";

    listEl = el("div", "leaderboard-list");
    listEl.id = "board-list";

    root.insertBefore(podiumEl, emptyState);
    root.insertBefore(listEl, emptyState);

    // The three podium places are structural: they always exist and are
    // patched, so the medal tiers never animate in from scratch.
    for (var i = 1; i <= 3; i++) {
      var place = el("div", "podium__place podium__place--" + i);
      var rankEl = el("div", "podium__rank tabular", "#" + i);
      var nameEl = el("div", "podium__name", "");
      var pointsEl = el("div", "podium__points tabular", "0");
      place.appendChild(rankEl);
      place.appendChild(nameEl);
      place.appendChild(pointsEl);
      podiumEl.appendChild(place);
      podiumRefs[i] = { place: place, rankEl: rankEl, nameEl: nameEl, pointsEl: pointsEl };
    }

    built = true;
    return true;
  }

  /**
   * Attaches a `rank` field using standard competition ranking (1224):
   * ties share a rank, and the next distinct value skips ahead by the
   * number of tied entries. `standings` must already be sorted by points
   * descending (Engine.computeStandings guarantees this).
   */
  function withRanks(standings) {
    var out = [];
    var prevPoints = null;
    var prevRank = 0;
    for (var i = 0; i < standings.length; i++) {
      var entry = standings[i];
      var rank;
      if (prevPoints !== null && entry.points === prevPoints) {
        rank = prevRank;
      } else {
        rank = i + 1;
      }
      out.push(Object.assign({}, entry, { rank: rank }));
      prevPoints = entry.points;
      prevRank = rank;
    }
    return out;
  }

  function titleText(entry) {
    var parts = [];
    if (entry.juara > 0) parts.push(entry.juara + "x Juara");
    if (entry.finalis > 0) parts.push(entry.finalis + "x Finalis");
    return parts.join(" · ");
  }

  function rowFor(entry) {
    var ref = rowRefs[entry.kode];
    if (ref) return ref;

    var row = el("div", "leaderboard-row");
    var rankEl = el("div", "leaderboard-row__rank tabular", "#" + entry.rank);
    row.appendChild(rankEl);

    var nameCell = el("div", "leaderboard-row__name");
    nameCell.appendChild(el("div", null, entry.nama + " (" + entry.kode + ")"));
    nameCell.appendChild(el("div", "leaderboard-row__division", entry.divisi));
    row.appendChild(nameCell);

    var pointsEl = el("div", "leaderboard-row__points tabular", "0");
    row.appendChild(pointsEl);

    var titlesEl = el("div", "leaderboard-row__titles tabular", "—");
    row.appendChild(titlesEl);

    ref = { row: row, rankEl: rankEl, pointsEl: pointsEl, titlesEl: titlesEl };
    rowRefs[entry.kode] = ref;
    return ref;
  }

  function renderPodium(top3) {
    for (var i = 1; i <= 3; i++) {
      var ref = podiumRefs[i];
      var entry = top3[i - 1];
      if (!entry) {
        ref.place.style.display = "none";
        continue;
      }
      ref.place.style.display = "";
      ref.rankEl.textContent = "#" + entry.rank;
      ref.nameEl.textContent = entry.nama + " (" + entry.kode + ")";
      countUp(ref.pointsEl, entry.points);
    }
  }

  function renderList(rest) {
    var seen = {};

    rest.forEach(function (entry) {
      var ref = rowFor(entry);
      seen[entry.kode] = true;

      ref.rankEl.textContent = "#" + entry.rank;
      countUp(ref.pointsEl, entry.points);
      ref.titlesEl.textContent = titleText(entry) || "—";

      // appendChild on a node already in the list MOVES it, so the ordering
      // falls out of iterating in rank order without touching the others.
      listEl.appendChild(ref.row);
    });

    // Anyone promoted into the podium this snapshot has a row that must
    // leave the list, but keep the ref so its count-up state survives.
    for (var kode in rowRefs) {
      if (!Object.prototype.hasOwnProperty.call(rowRefs, kode)) continue;
      if (seen[kode]) continue;
      var stale = rowRefs[kode].row;
      if (stale.parentNode === listEl) listEl.removeChild(stale);
    }
  }

  function render(state) {
    if (!built && !buildOnce()) return;
    if (!window.Engine || !window.DATA) return;

    var games = (state && state.games) || {};
    var standings = window.Engine.computeStandings(games, window.DATA.roster);
    var hasAnyPoints = standings.length > 0 && standings[0].points > 0;

    if (!hasAnyPoints) {
      podiumEl.style.display = "none";
      listEl.style.display = "none";
      if (emptyState) emptyState.style.display = "";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    podiumEl.style.display = "";
    listEl.style.display = "";

    var ranked = withRanks(standings);
    renderPodium(ranked.slice(0, 3));
    renderList(ranked.slice(3));
  }

  window.UIBoard = { render: render };
})();
