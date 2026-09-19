/**
 * Arena Asisten IRIS - Kehadiran (roster) screen.
 *
 * Builds the division lanes + assistant cards once, then patches classes
 * and text on every subsequent render so CSS transitions and focus survive
 * repeated Store snapshots.
 *
 * The control bar is sticky because marking 25 people is a long scroll on a
 * phone: without it the counter and the bulk actions are wherever the
 * operator last scrolled past, which is never where they are needed.
 * Filtering hides plates with a class rather than rebuilding the list, so a
 * search keystroke cannot cost focus or restart a transition.
 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  // The progress arc. r is in the same user units as the viewBox; the
  // circumference is precomputed because it drives the dash offset on every
  // render and is not worth recalculating 60 times a second.
  var ARC_R = 19;
  var ARC_C = 2 * Math.PI * ARC_R;

  var root = null; // #screen-roster
  var emptyState = null;
  var controlsEl = null;
  var summaryEl = null;
  var lanesEl = null;
  var built = false;

  var DENSITY_KEY = "arena_roster_density";

  var densityBtn = null;
  var searchEl = null;
  var meterArcEl = null;
  var meterTextEl = null;
  var allBtn = null;
  var noneBtn = null;

  var query = "";

  // kode -> { button }
  var cardRefs = {};
  // divisi -> { countEl, lane, total, members }
  var laneRefs = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isSpectator() {
    return !!(window.Store && window.Store.mode === "spectator");
  }

  function rosterList() {
    return (window.DATA && window.DATA.roster) || [];
  }

  // -------------------------------------------------------------------------
  // the control bar
  // -------------------------------------------------------------------------

  function buildMeter() {
    var meter = el("div", "roster-meter");

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "roster-meter__arc");
    svg.setAttribute("viewBox", "0 0 44 44");
    svg.setAttribute("aria-hidden", "true");

    var track = document.createElementNS(SVG_NS, "circle");
    track.setAttribute("class", "roster-meter__track");
    track.setAttribute("cx", "22");
    track.setAttribute("cy", "22");
    track.setAttribute("r", String(ARC_R));
    svg.appendChild(track);

    meterArcEl = document.createElementNS(SVG_NS, "circle");
    meterArcEl.setAttribute("class", "roster-meter__value");
    meterArcEl.setAttribute("cx", "22");
    meterArcEl.setAttribute("cy", "22");
    meterArcEl.setAttribute("r", String(ARC_R));
    meterArcEl.setAttribute("stroke-dasharray", String(ARC_C));
    meterArcEl.setAttribute("stroke-dashoffset", String(ARC_C));
    svg.appendChild(meterArcEl);

    meter.appendChild(svg);

    meterTextEl = el("span", "roster-meter__text tabular", "0 / 0");
    meterTextEl.id = "roster-present-value";
    meter.appendChild(meterTextEl);

    return meter;
  }

  function buildControls() {
    var bar = el("div", "roster-controls");

    bar.appendChild(buildMeter());

    var searchWrap = el("div", "roster-search");
    searchEl = document.createElement("input");
    searchEl.type = "search";
    searchEl.className = "roster-search__input";
    searchEl.placeholder = "Cari nama atau kode";
    searchEl.setAttribute("aria-label", "Cari asisten");
    searchEl.addEventListener("input", function () {
      query = searchEl.value.trim().toLowerCase();
      applyFilter();
    });
    searchWrap.appendChild(searchEl);
    bar.appendChild(searchWrap);

    var actions = el("div", "roster-actions");

    allBtn = el("button", "btn btn--ghost", "Hadir semua");
    allBtn.type = "button";
    allBtn.setAttribute("data-operator-only", "");
    allBtn.addEventListener("click", function () {
      setAll(true);
    });
    actions.appendChild(allBtn);

    noneBtn = el("button", "btn btn--ghost", "Kosongkan");
    noneBtn.type = "button";
    noneBtn.setAttribute("data-operator-only", "");
    noneBtn.addEventListener("click", function () {
      setAll(false);
    });
    actions.appendChild(noneBtn);

    densityBtn = el("button", "btn btn--ghost", "Rapat");
    densityBtn.type = "button";
    densityBtn.setAttribute("aria-pressed", "false");
    densityBtn.setAttribute("aria-label", "Ubah kerapatan daftar");
    densityBtn.addEventListener("click", function () {
      setDensity(root && root.getAttribute("data-density") === "compact"
        ? "comfortable"
        : "compact");
    });
    actions.appendChild(densityBtn);

    bar.appendChild(actions);
    return bar;
  }

  /**
   * Bulk-set everyone currently visible. Scoping it to the filtered set is
   * what makes the two work together: search a division, mark that division.
   * One write, not 25 -- see Store.setAttendanceMany.
   */
  function setAll(present) {
    if (isSpectator() || !window.Store) return;

    var map = {};
    rosterList().forEach(function (person) {
      var ref = cardRefs[person.kode];
      if (!ref) return;
      if (ref.button.classList.contains("is-filtered-out")) return;
      map[person.kode] = present;
    });

    if (typeof window.Store.setAttendanceMany === "function") {
      window.Store.setAttendanceMany(map);
      return;
    }
    for (var kode in map) {
      if (Object.prototype.hasOwnProperty.call(map, kode)) {
        window.Store.setAttendance(kode, map[kode]);
      }
    }
  }

  // --- density ------------------------------------------------------------
  //
  // 25 plates across 7 sections is a long scroll on a phone even with the
  // search. Compact drops each plate from two rows to one, which roughly
  // halves the height of the list.
  //
  // The choice is remembered per device in localStorage: it is a display
  // preference, not shared state, so it has no business going near the Store
  // and every business surviving a reload. Reads and writes are guarded --
  // a private window or blocked site data makes even the accessor throw.

  function readDensity() {
    try {
      return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
    } catch (e) {
      return "comfortable";
    }
  }

  function applyDensity(density) {
    if (root) root.setAttribute("data-density", density);
    if (densityBtn) {
      var compact = density === "compact";
      densityBtn.setAttribute("aria-pressed", compact ? "true" : "false");
      densityBtn.textContent = compact ? "Renggang" : "Rapat";
    }
  }

  function setDensity(density) {
    applyDensity(density);
    try {
      window.localStorage.setItem(DENSITY_KEY, density);
    } catch (e) {
      /* preference simply will not persist; the toggle still works */
    }
  }

  function matchesQuery(person) {
    if (!query) return true;
    return (
      person.nama.toLowerCase().indexOf(query) !== -1 ||
      person.kode.toLowerCase().indexOf(query) !== -1
    );
  }

  /** Hide non-matching plates with a class; never rebuild the list. */
  function applyFilter() {
    var visibleByDivision = {};

    rosterList().forEach(function (person) {
      var ref = cardRefs[person.kode];
      if (!ref) return;
      var match = matchesQuery(person);
      ref.button.classList.toggle("is-filtered-out", !match);
      if (match) {
        visibleByDivision[person.divisi] = (visibleByDivision[person.divisi] || 0) + 1;
      }
    });

    // A lane whose every member is filtered out would otherwise leave its
    // heading stranded above nothing.
    for (var divName in laneRefs) {
      if (!Object.prototype.hasOwnProperty.call(laneRefs, divName)) continue;
      laneRefs[divName].lane.classList.toggle("is-empty", !visibleByDivision[divName]);
    }

    if (controlsEl) {
      controlsEl.classList.toggle("is-filtering", !!query);
    }
  }

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  function buildOnce() {
    root = document.getElementById("screen-roster");
    if (!root) return false;

    emptyState = root.querySelector('[data-empty="roster"]');

    controlsEl = buildControls();
    summaryEl = el("div", "roster__summary");
    lanesEl = el("div", "roster__lanes");

    root.insertBefore(controlsEl, emptyState);
    root.insertBefore(summaryEl, emptyState);
    root.insertBefore(lanesEl, emptyState);

    var balanceTile = el("div", "division-balance");
    balanceTile.id = "roster-division-balance";
    summaryEl.appendChild(balanceTile);

    var divisi = (window.DATA && window.DATA.divisi) || [];
    var roster = rosterList();

    divisi.forEach(function (divName) {
      var members = roster.filter(function (p) {
        return p.divisi === divName;
      });
      if (!members.length) return;

      var lane = el("div", "division-lane");
      var laneHeader = el("div", "division-lane__header");
      laneHeader.appendChild(el("h3", "division-lane__name", divName));
      var laneCount = el("span", "division-lane__count", "0/" + members.length);
      laneHeader.appendChild(laneCount);
      lane.appendChild(laneHeader);

      var membersEl = el("div", "division-lane__members");

      members.forEach(function (person) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "assistant-card";
        card.setAttribute("aria-pressed", "false");
        card.setAttribute(
          "aria-label",
          person.nama + " (" + person.kode + ") - ketuk untuk menandai hadir/absen"
        );

        card.appendChild(el("div", "assistant-card__kode", person.kode));
        var nameEl = el("div", "assistant-card__name", person.nama);
        // Compact density puts the name on one line and ellipsises the few
        // that overrun. The full name stays reachable on hover, and the
        // card's aria-label carries it for assistive tech regardless.
        nameEl.title = person.nama;
        card.appendChild(nameEl);

        card.addEventListener("click", function () {
          var currentlyPresent = card.classList.contains("is-present");
          window.Store.setAttendance(person.kode, !currentlyPresent);
        });

        membersEl.appendChild(card);
        cardRefs[person.kode] = { button: card };
      });

      lane.appendChild(membersEl);
      lanesEl.appendChild(lane);
      laneRefs[divName] = { countEl: laneCount, lane: lane, total: members.length };
    });

    applyDensity(readDensity());

    built = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  function updateMeter(present, total) {
    if (meterTextEl) {
      if (window.Motion && typeof window.Motion.countUp === "function") {
        window.Motion.countUp(meterTextEl, present, {
          format: function (v) {
            return Math.round(v) + " / " + total;
          }
        });
      } else {
        meterTextEl.textContent = present + " / " + total;
      }
    }
    if (!meterArcEl) return;
    var ratio = total > 0 ? present / total : 0;
    // The dash offset is what animates; the transition lives in CSS so it is
    // suppressed under prefers-reduced-motion with everything else.
    meterArcEl.setAttribute("stroke-dashoffset", String(ARC_C * (1 - ratio)));
  }

  function render(state) {
    if (!built && !buildOnce()) return;

    var hadir = (state && state.attendance && state.attendance.hadir) || {};
    var roster = rosterList();
    var divisi = (window.DATA && window.DATA.divisi) || [];

    var presentCount = 0;
    var byDivision = {};
    divisi.forEach(function (d) {
      byDivision[d] = 0;
    });

    var spectator = isSpectator();

    roster.forEach(function (person) {
      var isPresent = !!hadir[person.kode];
      if (isPresent) {
        presentCount++;
        if (byDivision[person.divisi] !== undefined) byDivision[person.divisi]++;
      }

      var ref = cardRefs[person.kode];
      if (ref) {
        ref.button.classList.toggle("is-present", isPresent);
        ref.button.classList.toggle("is-absent", !isPresent);
        ref.button.setAttribute("aria-pressed", isPresent ? "true" : "false");
        ref.button.disabled = spectator;
      }
    });

    updateMeter(presentCount, roster.length);

    divisi.forEach(function (d) {
      var ref = laneRefs[d];
      if (ref) ref.countEl.textContent = byDivision[d] + "/" + ref.total;
    });

    var balanceTile = document.getElementById("roster-division-balance");
    if (balanceTile) {
      balanceTile.textContent = "";
      divisi.forEach(function (d) {
        if (laneRefs[d] === undefined) return;
        var item = el("div", "division-balance__item");
        item.appendChild(el("span", null, d));
        item.appendChild(el("span", "division-balance__count", String(byDivision[d])));
        balanceTile.appendChild(item);
      });
    }

    // The filter is re-applied rather than assumed: a snapshot can add cards
    // that were never passed through it.
    applyFilter();

    if (emptyState) emptyState.style.display = "none";
  }

  window.UIRoster = { render: render };
})();
