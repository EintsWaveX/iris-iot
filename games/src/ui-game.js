/**
 * Arena Asisten IRIS - Daftar Game (list) + Game (detail/bracket) screens.
 *
 * window.UIGame.render(state) keeps the game list in #screen-games patched
 * (status chip per game) and, if a game is currently open, patches the
 * detail screen in #screen-game. window.UIGame.open(gameId) is called by
 * the list card click handler (and can be called from elsewhere) to switch
 * the detail screen to a given game and navigate there via App.show.
 */
(function () {
  "use strict";

  var MIN_PRESENT = 4; // Engine.drawGroups needs >=1 person per group (4 groups)
  var FLICKER_MS = 1100;
  var FLICKER_TICK_MS = 90;
  var COLUMN_STAGGER_MS = 90;

  var SVG_NS = "http://www.w3.org/2000/svg";

  // ---- module state ------------------------------------------------------
  var lastState = null;
  var openGameId = null;

  // Daftar Game (list) refs, built once.
  var listBuilt = false;
  var listRoot = null;
  var listEmptyState = null;
  var listCardRefs = {}; // gameId -> { chip, foot }

  // Detail screen refs — rebuilt whenever the open game changes.
  var detailRoot = null;
  var builtGameId = null;
  var dom = null; // holds all the detail-screen element refs for builtGameId

  // Per-gameId history, so re-opening a game doesn't replay animations or
  // re-fire the champion celebration.
  var drawKeyState = {}; // gameId -> last-seen JSON of draw (or null)
  var championState = {}; // gameId -> last-seen champion index (or null)
  var resetOpen = false; // whether the reset confirmation popover is showing

  var revealToken = null; // the in-flight reveal animation controller, if any

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

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

  // Anyone who can actually write to the Store: real operators, and the
  // single local user in offline mode (there is no spectator distinction
  // when there's no realtime backing at all). Only a true "spectator" -
  // someone else's operator is already driving - is locked out.
  function isOperator() {
    return !window.Store || window.Store.mode !== "spectator";
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // The native `hidden` attribute loses to any author rule that sets its
  // own `display` (e.g. `.btn`/`.game-card__link` set `display: inline-flex`),
  // because origin beats specificity. Drive visibility through inline
  // `display` directly for anything that carries such a class.
  function setHidden(el, hide) {
    if (el) el.style.display = hide ? "none" : "";
  }

  function gameDocFor(gameId) {
    var games = (lastState && lastState.games) || {};
    return games[gameId] || { draw: null, sf1: null, sf2: null, champion: null };
  }

  function setGroupColorClass(sideEl, groupIndex) {
    sideEl.classList.remove("match-side--1", "match-side--2", "match-side--3", "match-side--4");
    if (groupIndex !== null && groupIndex !== undefined) {
      sideEl.classList.add("match-side--" + (groupIndex + 1));
    }
  }

  /**
   * The group's constellation crest, drawn from the `stars` / `lines` in
   * data.js. ui-champion.js has its own copy sized for the takeover; this one
   * is small enough to sit in a column head, so the two do not share code --
   * they share the data, which is the part that has to stay in step.
   */
  function buildCrest(group) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "group-column__crest");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    if (!group) return svg;

    (group.lines || []).forEach(function (pair) {
      var a = (group.stars || [])[pair[0]];
      var b = (group.stars || [])[pair[1]];
      if (!a || !b) return;
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", a[0]);
      line.setAttribute("y1", a[1]);
      line.setAttribute("x2", b[0]);
      line.setAttribute("y2", b[1]);
      line.setAttribute("class", "group-column__crest-line");
      svg.appendChild(line);
    });

    (group.stars || []).forEach(function (point, i) {
      var dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", point[0]);
      dot.setAttribute("cy", point[1]);
      dot.setAttribute("r", i === 0 ? 7 : 4.5);
      dot.setAttribute("class", "group-column__crest-star");
      svg.appendChild(dot);
    });

    return svg;
  }

  function groupLabel(groupIndex) {
    return "Grup " + (groupIndex + 1);
  }

  function groupMembersText(draw, groupIndex) {
    var members = (draw && draw[groupIndex]) || [];
    return members
      .map(function (kode) {
        var p = findPerson(kode);
        return p ? p.kode : kode;
      })
      .join(", ");
  }

  /**
   * Full names rather than kode. The bracket is dense enough that three-letter
   * kode are the right call there, but the champion takeover is the one place
   * where people should see their own name spelled out.
   */
  function groupMemberNames(draw, groupIndex) {
    var members = (draw && draw[groupIndex]) || [];
    return members.map(function (kode) {
      var p = findPerson(kode);
      return p ? p.nama : kode;
    });
  }

  // -------------------------------------------------------------------------
  // Daftar Game (list screen)
  // -------------------------------------------------------------------------

  function statusOf(gameDoc) {
    if (!gameDoc || !gameDoc.draw) return "pending";
    var resolved = window.Engine.resolveBracket(gameDoc);
    return resolved.champion !== null ? "done" : "ready";
  }

  function statusLabel(status) {
    if (status === "done") return "Selesai";
    if (status === "ready") return "Berlangsung";
    return "Belum diundi";
  }

  function buildListOnce() {
    listRoot = document.getElementById("screen-games");
    if (!listRoot) return false;

    listEmptyState = listRoot.querySelector('[data-empty="games"]');

    var grid = el("div", "games-grid");
    grid.id = "games-grid";
    listRoot.insertBefore(grid, listEmptyState);

    var games = (window.DATA && window.DATA.games) || [];
    games.forEach(function (game) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "game-card";
      card.setAttribute("aria-label", "Buka game: " + game.nama);

      var head = el("div", "game-card__head");
      head.appendChild(el("span", "game-card__no tabular", "No. " + game.no));
      head.appendChild(el("h3", "game-card__title", game.nama));
      card.appendChild(head);

      card.appendChild(el("p", "game-card__desc", game.deskripsi));

      // The status chip goes in the head, not the foot: .game-card__head is
      // display:contents, so the chip becomes a direct grid item and the
      // layout can park it top-right where it is scannable down the column.
      var chip = el("span", "chip status--pending", statusLabel("pending"));
      head.appendChild(chip);

      var foot = el("div", "game-card__foot");
      foot.appendChild(el("span", null, "Diusulkan oleh " + game.pengusul));
      card.appendChild(foot);

      card.addEventListener("click", function () {
        UIGame.open(game.id);
      });

      grid.appendChild(card);
      listCardRefs[game.id] = { chip: chip };
    });

    listBuilt = true;
    return true;
  }

  function renderList() {
    if (!listBuilt && !buildListOnce()) return;

    var games = (window.DATA && window.DATA.games) || [];
    games.forEach(function (game) {
      var ref = listCardRefs[game.id];
      if (!ref) return;
      var doc = gameDocFor(game.id);
      var status = statusOf(doc);
      ref.chip.className = "chip status--" + status;
      ref.chip.textContent = statusLabel(status);
    });

    if (listEmptyState) listEmptyState.style.display = "none";
  }

  // -------------------------------------------------------------------------
  // Detail screen — build (once per opened game)
  // -------------------------------------------------------------------------

  function cancelReveal() {
    if (revealToken) {
      revealToken.cancelled = true;
      if (revealToken.flickerInterval) clearInterval(revealToken.flickerInterval);
      revealToken.timeouts.forEach(function (t) {
        clearTimeout(t);
      });
      revealToken = null;
    }
  }

  function buildDetail(gameId) {
    detailRoot = document.getElementById("screen-game");
    if (!detailRoot) return false;

    cancelReveal();

    var emptyState = detailRoot.querySelector('[data-empty="game"]');
    var titleEl = document.getElementById("game-title");
    var subtitleEl = detailRoot.querySelector(".screen__subtitle");

    // Remove any previously-built body from a different game.
    var oldBody = document.getElementById("game-detail-body");
    if (oldBody) oldBody.parentNode.removeChild(oldBody);

    var body = el("div", null);
    body.id = "game-detail-body";
    detailRoot.appendChild(body);

    // ---- back to the list ----
    // This screen has no nav entry of its own, so without this the only way
    // out is the tab bar -- which is not where anyone looks for "back".
    var backBtn = el("button", "game-back");
    backBtn.type = "button";
    backBtn.appendChild(el("span", "game-back__arrow", "\u2190"));
    backBtn.appendChild(el("span", null, "Daftar Game"));
    body.appendChild(backBtn);

    // ---- meta (pengusul + contoh link) ----
    var meta = el("div", "game-meta");
    var pengusulEl = el("p", null, "");
    meta.appendChild(pengusulEl);
    var linkEl = document.createElement("a");
    linkEl.className = "game-card__link";
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.textContent = "Lihat contoh";
    setHidden(linkEl, true);
    meta.appendChild(linkEl);
    body.appendChild(meta);

    // ---- draw guard message ----
    var drawWarning = el("p", "empty-state__text", "");
    drawWarning.hidden = true;
    body.appendChild(drawWarning);

    // ---- no-draw-yet empty state (reuses .empty-state) ----
    var noDrawState = el("div", "empty-state");
    var noDrawIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    noDrawIcon.setAttribute("class", "empty-state__icon icon");
    noDrawIcon.setAttribute("viewBox", "0 0 24 24");
    noDrawIcon.setAttribute("aria-hidden", "true");
    var noDrawPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    noDrawPath.setAttribute("d", "M7 4h10v5a5 5 0 0 1-10 0V4Z");
    noDrawIcon.appendChild(noDrawPath);
    noDrawState.appendChild(noDrawIcon);
    noDrawState.appendChild(el("p", "empty-state__text", "Belum ada undian untuk game ini."));
    body.appendChild(noDrawState);

    // ---- group columns ----
    var columns = el("div", "group-columns");
    var columnRefs = []; // [{ el, numeral, membersEl }]
    for (var g = 0; g < 4; g++) {
      var col = el("div", "group-column group-column--" + (g + 1));
      var head = el("div", "group-column__head");
      head.appendChild(el("span", "group-column__numeral", String(g + 1)));

      var titleWrap = el("span", "group-column__titles");
      titleWrap.appendChild(el("span", "group-column__title", "Grup " + (g + 1)));
      var groupData = ((window.DATA && window.DATA.groups) || [])[g];
      if (groupData && groupData.nama) {
        titleWrap.appendChild(el("span", "group-column__constellation", groupData.nama));
      }
      head.appendChild(titleWrap);

      // The crest is what makes "Grup 2" tell itself apart from "Grup 4"
      // across a room; it existed in data.js but was only ever drawn in the
      // champion takeover.
      head.appendChild(buildCrest(groupData));
      col.appendChild(head);
      var membersEl = el("div", "group-column__members");
      col.appendChild(membersEl);
      columns.appendChild(col);
      columnRefs.push({ el: col, membersEl: membersEl, memberRefs: [] });
    }
    body.appendChild(columns);

    // ---- controls ----
    var controls = el("div", "game-controls");
    var drawBtn = el("button", "btn btn--primary");
    drawBtn.type = "button";
    drawBtn.textContent = "Undi Ulang";
    drawBtn.setAttribute("data-operator-only", "");
    controls.appendChild(drawBtn);

    var resetBtn = el("button", "btn btn--ghost");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";
    resetBtn.setAttribute("data-operator-only", "");
    controls.appendChild(resetBtn);

    // An explicit popover rather than the old label swap on the same button.
    // That swap reverted silently after 3s, so a double-tap -- or a tap on a
    // button whose label had just changed under the finger -- destroyed a
    // live bracket with no way back.
    var resetConfirm = el("div", "confirm");
    resetConfirm.hidden = true;
    resetConfirm.setAttribute("role", "dialog");
    resetConfirm.setAttribute("aria-label", "Konfirmasi reset");
    resetConfirm.appendChild(
      el(
        "p",
        "confirm__text",
        "Reset menghapus undian dan seluruh hasil pertandingan game ini."
      )
    );
    var confirmActions = el("div", "confirm__actions");
    var confirmCancel = el("button", "btn btn--ghost", "Batal");
    confirmCancel.type = "button";
    var confirmOk = el("button", "btn btn--danger", "Ya, reset");
    confirmOk.type = "button";
    confirmActions.appendChild(confirmCancel);
    confirmActions.appendChild(confirmOk);
    resetConfirm.appendChild(confirmActions);
    controls.appendChild(resetConfirm);

    body.appendChild(controls);

    // ---- bracket ----
    var bracket = el("div", "bracket");

    function buildMatch(labelText) {
      var match = el("div", "match panel");
      // labelText used to be accepted and then thrown away, which left both
      // semifinals sharing a single round heading with nothing in the DOM to
      // tell SF1 from SF2.
      match.appendChild(el("div", "match__label", labelText));
      var sideA = document.createElement("button");
      sideA.type = "button";
      sideA.className = "match-side";
      var groupA = el("span", "match-side__group", "");
      var membersA = el("span", null, "");
      sideA.appendChild(groupA);
      sideA.appendChild(membersA);

      var vs = el("span", "match-vs", "VS");

      var sideB = document.createElement("button");
      sideB.type = "button";
      sideB.className = "match-side";
      var groupB = el("span", "match-side__group", "");
      var membersB = el("span", null, "");
      sideB.appendChild(groupB);
      sideB.appendChild(membersB);

      match.appendChild(sideA);
      match.appendChild(vs);
      match.appendChild(sideB);

      return {
        match: match,
        sideA: sideA,
        groupA: groupA,
        membersA: membersA,
        sideB: sideB,
        groupB: groupB,
        membersB: membersB
      };
    }

    // Connector wires. The bracket was two flex columns separated by a gap,
    // so the semifinal -> final relationship was carried by position alone.
    // The paths are drawn to measured coordinates by layoutWires() rather
    // than hard-coded, because the rounds reflow and scroll at narrow widths.
    var wires = document.createElementNS(SVG_NS, "svg");
    wires.setAttribute("class", "bracket__wires");
    wires.setAttribute("aria-hidden", "true");
    var wireSf1 = document.createElementNS(SVG_NS, "path");
    wireSf1.setAttribute("class", "bracket__wire");
    var wireSf2 = document.createElementNS(SVG_NS, "path");
    wireSf2.setAttribute("class", "bracket__wire");

    // A short segment that travels the wire when a winner advances, drawn
    // over the resting wire on the same geometry. The wire itself only
    // changes colour; this is what makes the advance read as movement from
    // the semifinal into the final rather than as a recolour.
    var pulseSf1 = document.createElementNS(SVG_NS, "path");
    pulseSf1.setAttribute("class", "bracket__wire-pulse");
    var pulseSf2 = document.createElementNS(SVG_NS, "path");
    pulseSf2.setAttribute("class", "bracket__wire-pulse");

    wires.appendChild(wireSf1);
    wires.appendChild(wireSf2);
    wires.appendChild(pulseSf1);
    wires.appendChild(pulseSf2);
    bracket.appendChild(wires);

    var roundSf = el("div", "bracket__round");
    var sf1 = buildMatch("Semifinal 1");
    var sf2 = buildMatch("Semifinal 2");
    roundSf.appendChild(sf1.match);
    roundSf.appendChild(sf2.match);
    bracket.appendChild(roundSf);

    var roundFinal = el("div", "bracket__round bracket__round--final");
    var final = buildMatch("Final");
    roundFinal.appendChild(final.match);
    bracket.appendChild(roundFinal);

    body.appendChild(bracket);

    // ---- champion banner ----
    var championBanner = el("div", "champion-banner");
    championBanner.hidden = true;
    championBanner.appendChild(el("div", "champion-banner__title", "Juara"));
    var championGroupEl = el("div", "champion-banner__group", "");
    championBanner.appendChild(championGroupEl);
    var championMembersEl = el("p", null, "");
    championBanner.appendChild(championMembersEl);
    body.appendChild(championBanner);

    dom = {
      wires: wires,
      wireSf1: wireSf1,
      wireSf2: wireSf2,
      pulseSf1: pulseSf1,
      pulseSf2: pulseSf2,
      titleEl: titleEl,
      subtitleEl: subtitleEl,
      emptyState: emptyState,
      pengusulEl: pengusulEl,
      linkEl: linkEl,
      drawWarning: drawWarning,
      noDrawState: noDrawState,
      columns: columns,
      columnRefs: columnRefs,
      backBtn: backBtn,
      drawBtn: drawBtn,
      resetBtn: resetBtn,
      resetConfirm: resetConfirm,
      confirmCancel: confirmCancel,
      confirmOk: confirmOk,
      bracket: bracket,
      sf1: sf1,
      sf2: sf2,
      final: final,
      championBanner: championBanner,
      championGroupEl: championGroupEl,
      championMembersEl: championMembersEl
    };

    drawBtn.addEventListener("click", function () {
      handleDraw(gameId);
    });
    resetBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      setResetOpen(!resetOpen);
    });
    confirmCancel.addEventListener("click", function () {
      setResetOpen(false);
    });
    confirmOk.addEventListener("click", function () {
      setResetOpen(false);
      if (isOperator()) window.Store.resetGame(gameId);
    });
    resetConfirm.addEventListener("click", function (evt) {
      evt.stopPropagation();
    });
    backBtn.addEventListener("click", function () {
      if (window.App && typeof window.App.show === "function") window.App.show("games");
    });

    sf1.sideA.addEventListener("click", function () {
      window.Store.setWinner(gameId, "sf1", 0);
    });
    sf1.sideB.addEventListener("click", function () {
      window.Store.setWinner(gameId, "sf1", 1);
    });
    sf2.sideA.addEventListener("click", function () {
      window.Store.setWinner(gameId, "sf2", 2);
    });
    sf2.sideB.addEventListener("click", function () {
      window.Store.setWinner(gameId, "sf2", 3);
    });
    final.sideA.addEventListener("click", function () {
      var resolved = window.Engine.resolveBracket(gameDocFor(gameId));
      if (resolved.sf1 !== null) window.Store.setWinner(gameId, "champion", resolved.sf1);
    });
    final.sideB.addEventListener("click", function () {
      var resolved = window.Engine.resolveBracket(gameDocFor(gameId));
      if (resolved.sf2 !== null) window.Store.setWinner(gameId, "champion", resolved.sf2);
    });

    builtGameId = gameId;
    if (emptyState) emptyState.style.display = "none";
    return true;
  }

  // -------------------------------------------------------------------------
  // Detail screen — patch (every render, for the currently-open game)
  // -------------------------------------------------------------------------

  function updateHeader(gameId, game) {
    if (dom.titleEl) dom.titleEl.textContent = game.nama;
    if (dom.subtitleEl) dom.subtitleEl.textContent = game.deskripsi;
    dom.pengusulEl.textContent = "Diusulkan oleh " + game.pengusul;
    if (game.contoh) {
      dom.linkEl.href = game.contoh;
      setHidden(dom.linkEl, false);
    } else {
      setHidden(dom.linkEl, true);
      dom.linkEl.removeAttribute("href");
    }
  }

  function buildColumnsSkeleton(draw) {
    dom.columnRefs.forEach(function (col, i) {
      col.membersEl.textContent = "";
      col.memberRefs = [];
      var members = (draw && draw[i]) || [];
      members.forEach(function () {
        var m = el("div", "group-member", "");
        col.membersEl.appendChild(m);
        col.memberRefs.push(m);
      });
    });
  }

  /**
   * The point of light a name condenses out of. Added per reveal and removed
   * when it has burned out, so nothing accumulates across repeated draws.
   */
  function flareStar(m, delay) {
    if (!window.gsap || prefersReducedMotion()) return;

    var star = el("span", "group-member__star");
    m.appendChild(star);

    window.gsap.fromTo(
      star,
      { opacity: 0, scale: 0.2 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.22,
        delay: delay,
        ease: "outExpo",
        onComplete: function () {
          window.gsap.to(star, {
            opacity: 0,
            scale: 0.4,
            duration: 0.5,
            ease: "power2.in",
            onComplete: function () {
              if (star.parentNode) star.parentNode.removeChild(star);
            }
          });
        }
      }
    );
  }

  function lockColumn(colIndex, groupMembers) {
    var col = dom.columnRefs[colIndex];
    groupMembers.forEach(function (kode, i) {
      var person = findPerson(kode);
      var m = col.memberRefs[i];
      if (!m) return;
      m.classList.remove("is-revealing");
      m.textContent = person ? person.kode + " — " + person.nama : kode;
      m.classList.remove("stagger-item");
      // Force reflow so re-adding the class restarts the settle animation.
      void m.offsetWidth;
      m.style.setProperty("--i", i);

      // Names condense out of a star point. Motion.materialise returns null
      // under reduced motion or without SplitText, in which case the plain
      // staggered settle below is the whole reveal -- so the CSS path stays
      // the fallback rather than being replaced.
      var tl =
        window.Motion && typeof window.Motion.materialise === "function"
          ? window.Motion.materialise(m, { delay: i * 0.05 })
          : null;

      if (tl) {
        flareStar(m, i * 0.05);
      } else {
        m.classList.add("stagger-item");
      }
    });
  }

  function showFinalGroupsImmediately(draw) {
    buildColumnsSkeleton(draw);
    draw.forEach(function (groupMembers, colIndex) {
      lockColumn(colIndex, groupMembers);
    });
  }

  function runRevealAnimation(draw) {
    cancelReveal();
    var token = { cancelled: false, flickerInterval: null, timeouts: [] };
    revealToken = token;

    buildColumnsSkeleton(draw);

    var allKodes = ((window.DATA && window.DATA.roster) || []).map(function (p) {
      return p.kode;
    });

    dom.columnRefs.forEach(function (col) {
      col.memberRefs.forEach(function (m) {
        m.classList.add("is-revealing");
      });
    });

    token.flickerInterval = setInterval(function () {
      if (token.cancelled) return;
      dom.columnRefs.forEach(function (col) {
        col.memberRefs.forEach(function (m) {
          m.textContent = allKodes[Math.floor(Math.random() * allKodes.length)] || "???";
        });
      });
    }, FLICKER_TICK_MS);

    var startLocking = setTimeout(function () {
      if (token.cancelled) return;
      clearInterval(token.flickerInterval);
      draw.forEach(function (groupMembers, colIndex) {
        var t = setTimeout(function () {
          if (token.cancelled) return;
          lockColumn(colIndex, groupMembers);
        }, colIndex * COLUMN_STAGGER_MS);
        token.timeouts.push(t);
      });
    }, FLICKER_MS);
    token.timeouts.push(startLocking);
  }

  function updateGroups(gameId, gameDoc) {
    var draw = gameDoc.draw;
    var currentKey = draw ? JSON.stringify(draw) : null;
    var isFirstObservation = !Object.prototype.hasOwnProperty.call(drawKeyState, gameId);
    var prevKey = drawKeyState[gameId];
    drawKeyState[gameId] = currentKey;

    if (!draw) {
      cancelReveal();
      dom.noDrawState.style.display = "";
      dom.columns.style.display = "none";
      dom.bracket.style.display = "none";
      dom.championBanner.hidden = true;
      return;
    }

    dom.noDrawState.style.display = "none";
    dom.columns.style.display = "";
    dom.bracket.style.display = "";

    if (isFirstObservation || prefersReducedMotion()) {
      showFinalGroupsImmediately(draw);
    } else if (currentKey !== prevKey) {
      runRevealAnimation(draw);
    }
    // else: unchanged draw, leave the columns exactly as they are.
  }

  function updateMatchSide(sideEl, groupEl, membersEl, groupIndex, draw, state) {
    // state: 'tbd' | 'idle' | 'winner' | 'loser'
    setGroupColorClass(sideEl, groupIndex);
    sideEl.classList.toggle("is-tbd", state === "tbd");
    sideEl.classList.toggle("is-winner", state === "winner");
    sideEl.classList.toggle("is-loser", state === "loser");

    if (state === "tbd") {
      groupEl.textContent = "Menunggu";
      membersEl.textContent = "";
      sideEl.disabled = true;
      sideEl.setAttribute("aria-label", "Menunggu hasil semifinal");
    } else {
      groupEl.textContent = groupLabel(groupIndex);
      membersEl.textContent = groupMembersText(draw, groupIndex);
      sideEl.disabled = !isOperator();
      sideEl.setAttribute("aria-label", "Pilih " + groupLabel(groupIndex) + " sebagai pemenang");
    }
  }

  /**
   * Draws the two semifinal -> final connectors as elbows through the gap
   * between the rounds.
   *
   * Coordinates are measured rather than assumed: the bracket becomes a
   * horizontally scrolling row below 900px, the round columns are flex-sized,
   * and match heights vary with how many kode fit on a line. The SVG is sized
   * to scrollWidth so the wires stay attached while the row is scrolled.
   */
  function layoutWires() {
    if (!dom || !dom.wires || !dom.bracket) return;

    var bracket = dom.bracket;
    var box = bracket.getBoundingClientRect();
    var w = Math.max(bracket.scrollWidth, box.width);
    var h = box.height;
    if (!w || !h) return;

    dom.wires.setAttribute("viewBox", "0 0 " + w + " " + h);
    dom.wires.setAttribute("width", w);
    dom.wires.setAttribute("height", h);

    // Rects are viewport-relative; convert to the bracket's own scrolled
    // coordinate space.
    function local(node) {
      var r = node.getBoundingClientRect();
      return {
        left: r.left - box.left + bracket.scrollLeft,
        right: r.right - box.left + bracket.scrollLeft,
        mid: r.top - box.top + r.height / 2
      };
    }

    var a = local(dom.sf1.match);
    var b = local(dom.sf2.match);
    var f = local(dom.final.match);

    // The elbow turns halfway across the gap between the two rounds.
    var turn = a.right + (f.left - a.right) / 2;

    function elbow(from) {
      return (
        "M " + from.right + " " + from.mid +
        " H " + turn +
        " V " + f.mid +
        " H " + f.left
      );
    }

    var dSf1 = elbow(a);
    var dSf2 = elbow(b);
    dom.wireSf1.setAttribute("d", dSf1);
    dom.wireSf2.setAttribute("d", dSf2);
    // The pulse rides the same path, so it has to be re-measured too.
    if (dom.pulseSf1) dom.pulseSf1.setAttribute("d", dSf1);
    if (dom.pulseSf2) dom.pulseSf2.setAttribute("d", dSf2);
  }

  function updateBracket(gameId, gameDoc) {
    var draw = gameDoc.draw;
    if (!draw) return;

    var resolved = window.Engine.resolveBracket(gameDoc);

    function sfState(pickedIndex, thisIndex) {
      if (pickedIndex === null) return "idle";
      return pickedIndex === thisIndex ? "winner" : "loser";
    }

    updateMatchSide(dom.sf1.sideA, dom.sf1.groupA, dom.sf1.membersA, 0, draw, sfState(resolved.sf1, 0));
    updateMatchSide(dom.sf1.sideB, dom.sf1.groupB, dom.sf1.membersB, 1, draw, sfState(resolved.sf1, 1));
    updateMatchSide(dom.sf2.sideA, dom.sf2.groupA, dom.sf2.membersA, 2, draw, sfState(resolved.sf2, 2));
    updateMatchSide(dom.sf2.sideB, dom.sf2.groupB, dom.sf2.membersB, 3, draw, sfState(resolved.sf2, 3));

    // Final side A = sf1 winner, side B = sf2 winner.
    if (resolved.sf1 === null) {
      updateMatchSide(dom.final.sideA, dom.final.groupA, dom.final.membersA, null, draw, "tbd");
    } else {
      var stateA = resolved.champion === null ? "idle" : resolved.champion === resolved.sf1 ? "winner" : "loser";
      updateMatchSide(dom.final.sideA, dom.final.groupA, dom.final.membersA, resolved.sf1, draw, stateA);
    }

    if (resolved.sf2 === null) {
      updateMatchSide(dom.final.sideB, dom.final.groupB, dom.final.membersB, null, draw, "tbd");
    } else {
      var stateB = resolved.champion === null ? "idle" : resolved.champion === resolved.sf2 ? "winner" : "loser";
      updateMatchSide(dom.final.sideB, dom.final.groupB, dom.final.membersB, resolved.sf2, draw, stateB);
    }

    // A decided semifinal lights its wire, so the path a group took to the
    // final is readable at a glance from across the room.
    setWireLive(dom.wireSf1, dom.pulseSf1, resolved.sf1 !== null, resolved.sf1);
    setWireLive(dom.wireSf2, dom.pulseSf2, resolved.sf2 !== null, resolved.sf2);

    // Measure after the side updates have been applied, since a side
    // switching to "Menunggu" changes the match height.
    requestAnimationFrame(layoutWires);
  }

  /**
   * Marks a connector as carrying a result and tints it with that group's
   * colour. DrawSVG animates the stroke in the first time it goes live;
   * without the plugin (or under reduced motion) the class alone is enough.
   */
  /**
   * Sends a short lit segment travelling from the semifinal end of the wire
   * to the final end. DrawSVG's "start% end%" form is what makes this a
   * moving segment rather than a growing one: both ends advance together.
   */
  function firePulse(pulse, groupIndex) {
    if (!pulse || !window.gsap || !window.DrawSVGPlugin) return;
    if (prefersReducedMotion()) return;

    for (var i = 1; i <= 4; i++) pulse.classList.remove("bracket__wire--" + i);
    if (groupIndex !== null && groupIndex !== undefined) {
      pulse.classList.add("bracket__wire--" + (groupIndex + 1));
    }

    window.gsap.killTweensOf(pulse);
    window.gsap.fromTo(
      pulse,
      { drawSVG: "0% 0%", opacity: 1 },
      {
        drawSVG: "100% 100%",
        duration: 0.9,
        ease: "power2.inOut",
        onComplete: function () {
          window.gsap.set(pulse, { opacity: 0 });
        }
      }
    );
  }

  function setWireLive(wire, pulse, live, groupIndex) {
    if (!wire) return;
    var wasLive = wire.classList.contains("is-live");
    // The winner can change without the wire ever going dark -- the operator
    // corrects a mis-tap and picks the other side. That is still an advance
    // and should still light the wire, so compare the group too rather than
    // only the live/not-live edge.
    var prevGroup = wire.getAttribute("data-group");
    var nextGroup =
      live && groupIndex !== null && groupIndex !== undefined ? String(groupIndex) : null;

    wire.classList.toggle("is-live", !!live);

    for (var i = 1; i <= 4; i++) wire.classList.remove("bracket__wire--" + i);
    if (nextGroup !== null) {
      wire.classList.add("bracket__wire--" + (groupIndex + 1));
      wire.setAttribute("data-group", nextGroup);
    } else {
      wire.removeAttribute("data-group");
    }

    var advanced = live && (!wasLive || prevGroup !== nextGroup);

    if (live && !wasLive && window.gsap && window.DrawSVGPlugin && !prefersReducedMotion()) {
      window.gsap.fromTo(
        wire,
        { drawSVG: "0%" },
        { drawSVG: "100%", duration: 0.7, ease: "outExpo" }
      );
    }

    if (advanced) firePulse(pulse, groupIndex);
  }

  function updateChampion(gameId, gameDoc) {
    // Until the first real snapshot lands, gameDocFor() hands back a synthetic
    // all-null document. Recording THAT as the baseline makes the first real
    // snapshot look like a champion being crowned right now, so a phone that
    // opens the link after a game has already finished replays that game's
    // takeover. Wait for an actual document before establishing a baseline.
    var loadedGames = (lastState && lastState.games) || {};
    if (!Object.prototype.hasOwnProperty.call(loadedGames, gameId)) {
      dom.championBanner.hidden = true;
      return;
    }

    var resolved = window.Engine.resolveBracket(gameDoc);
    var isFirstObservation = !Object.prototype.hasOwnProperty.call(championState, gameId);
    var prevChampion = championState[gameId];
    championState[gameId] = resolved.champion;

    if (resolved.champion === null) {
      dom.championBanner.hidden = true;
      return;
    }

    dom.championGroupEl.textContent = groupLabel(resolved.champion);
    dom.championMembersEl.textContent = groupMembersText(gameDoc.draw, resolved.champion);
    dom.championBanner.hidden = false;

    var isTransition = !isFirstObservation && prevChampion !== resolved.champion;
    if (isTransition) {
      dom.championBanner.classList.remove("is-champion");
      void dom.championBanner.offsetWidth;
      dom.championBanner.classList.add("is-champion");

      var logo = document.getElementById("brand-logo");
      if (logo) {
        logo.classList.remove("logo-pulse");
        void logo.offsetWidth;
        logo.classList.add("logo-pulse");
      }

      // The takeover itself is NOT fired from here. This function only runs
      // for the one game the detail screen has open, so triggering from it
      // made the celebration depend on which screen someone happened to be
      // looking at -- and on a projector running ?stage=1, where no detail
      // is ever opened, it meant the moment never fired for anyone and the
      // operator never broadcast it either. app.js watches every game
      // document instead. What stays here is the local decoration: the gold
      // strip and the brand pulse on the screen that is showing this game.
    }
  }

  function updateControlsVisibility() {
    var operatorOnly = detailRoot.querySelectorAll("[data-operator-only]");
    for (var i = 0; i < operatorOnly.length; i++) {
      setHidden(operatorOnly[i], !isOperator());
    }
  }

  function renderDetail() {
    if (!openGameId) return;
    var game = findGame(openGameId);
    if (!game) return;

    if (builtGameId !== openGameId) {
      if (!buildDetail(openGameId)) return;
    }

    var gameDoc = gameDocFor(openGameId);

    // "Undi Ulang" on a game that has never been drawn invites the operator
    // to look for the draw they missed. The label states what the button
    // will actually do.
    if (dom.drawBtn) {
      dom.drawBtn.textContent = gameDoc && gameDoc.draw ? "Undi Ulang" : "Undi Grup";
    }
    // A reset popover left open while the bracket changed underneath it is
    // confirming something the operator can no longer see.
    if (resetOpen && builtGameId !== openGameId) setResetOpen(false);

    updateHeader(openGameId, game);
    updateGroups(openGameId, gameDoc);
    updateBracket(openGameId, gameDoc);
    updateChampion(openGameId, gameDoc);
    updateControlsVisibility();
  }

  // -------------------------------------------------------------------------
  // interactions
  // -------------------------------------------------------------------------

  function presentCodes() {
    var hadir = (lastState && lastState.attendance && lastState.attendance.hadir) || {};
    return Object.keys(hadir).filter(function (k) {
      return hadir[k];
    });
  }

  function handleDraw(gameId) {
    if (!isOperator()) return;
    var present = presentCodes();

    if (present.length < MIN_PRESENT) {
      dom.drawWarning.hidden = false;
      dom.drawWarning.textContent =
        "Minimal " + MIN_PRESENT + " asisten harus hadir untuk membagi 4 grup (saat ini " + present.length + ").";
      return;
    }
    dom.drawWarning.hidden = true;

    var draw = window.Engine.drawGroups(present, window.DATA.roster, 4);
    window.Store.setDraw(gameId, draw);
  }

  function setResetOpen(open) {
    if (!dom || !dom.resetConfirm) return;
    resetOpen = !!open && isOperator();
    dom.resetConfirm.hidden = !resetOpen;
    dom.resetBtn.setAttribute("aria-expanded", resetOpen ? "true" : "false");
    if (resetOpen && dom.confirmCancel) dom.confirmCancel.focus();
  }

  // A confirmation that can only be dismissed by hitting one of its own two
  // buttons is a trap on a phone, so a tap anywhere else or Escape cancels.
  // Cancelling is always the safe outcome here.
  document.addEventListener("click", function () {
    if (resetOpen) setResetOpen(false);
  });

  document.addEventListener("keydown", function (evt) {
    if (resetOpen && evt.key === "Escape") setResetOpen(false);
  });

  // -------------------------------------------------------------------------
  // The wires are drawn to measured geometry, so anything that reflows the
  // bracket has to re-run the measurement. Registered once at module level
  // rather than per build, so repeatedly opening games cannot leak listeners.
  // -------------------------------------------------------------------------
  var relayoutTimer = null;

  function scheduleRelayout() {
    if (relayoutTimer) clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(layoutWires, 120);
  }

  window.addEventListener("resize", scheduleRelayout);

  // Horizontal scrolling of the bracket row moves the matches under a
  // viewBox that is anchored to the scroll container, so redraw on scroll
  // too. Delegated with capture because the scrolling element is rebuilt
  // every time a different game is opened.
  document.addEventListener(
    "scroll",
    function (evt) {
      if (!dom || !dom.bracket) return;
      if (evt.target === dom.bracket) layoutWires();
    },
    true
  );

  // -------------------------------------------------------------------------
  // public API
  // -------------------------------------------------------------------------

  var UIGame = {
    /**
     * Everything the champion takeover needs for `gameId`, or null when that
     * game has no champion. Lives here rather than in app.js so the roster
     * lookups and the group/member naming stay in one module.
     */
    celebrationInfo: function (gameId) {
      if (!gameId || !window.Engine) return null;
      var doc = gameDocFor(gameId);
      var resolved = window.Engine.resolveBracket(doc);
      if (resolved.champion === null) return null;
      return {
        groupIndex: resolved.champion,
        members: groupMemberNames(doc.draw, resolved.champion),
        gameName: (findGame(gameId) || {}).nama
      };
    },
    render: function (state) {
      lastState = state;
      renderList();
      if (openGameId) renderDetail();
    },
    open: function (gameId) {
      if (!findGame(gameId)) return;
      openGameId = gameId;
      // Render BEFORE navigating. show() splits the screen title per
      // character to reveal it, and SplitText restores whatever the text was
      // when it split -- so navigating first meant the title was split while
      // it still read "Game", updateHeader wrote the real name, and the
      // reveal finished by putting "Game" back.
      renderDetail();
      if (window.App && typeof window.App.show === "function") {
        window.App.show("game");
      }
      // Publish which game the room is on so spectators follow along. Only
      // the operator may write; for everyone else this is a no-op setter.
      if (window.Store && window.Store.mode === "operator" &&
          typeof window.Store.setPhase === "function") {
        try {
          window.Store.setPhase(gameId, "draw");
        } catch (e) {}
      }
    }
  };

  window.UIGame = UIGame;
})();
