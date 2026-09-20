/**
 * Perburuan LoRa IRIS - the hunt board.
 *
 * Frames arrive ten times a second, so this screen never rebuilds its markup.
 * Cards are created once per group, keyed by group number, and every later
 * frame only writes the values that actually changed. Rebuilding innerHTML at
 * 10 Hz would restart every CSS transition on every frame and the proximity
 * bars would sit frozen at their target width instead of sliding toward it.
 *
 * Reordering uses FLIP: measure where a card is, move it in the DOM, measure
 * again, then play the difference as a transform. Ranks change constantly in
 * a live hunt and cards that teleport are impossible to follow.
 *
 * window.UIHunt = { mount, render, follow }
 */
(function () {
  "use strict";

  var cardsEl = null;
  var emptyEl = null;
  var hudElapsed = null;
  var hudBeacon = null;
  var hudSeq = null;
  var hudRadio = null;

  var cards = {};        // grup -> { root, refs... }
  var lastOrder = [];

  // Own-group hero and the compact list of everyone else.
  var mine = {};
  var othersEl = null;
  var othersListEl = null;
  var otherRows = {};    // grup -> { root, refs... }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mmss(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function trendLabel(trend) {
    if (trend > 1.2) return I18N.t("trend.closer");
    if (trend < -1.2) return I18N.t("trend.further");
    return I18N.t("trend.flat");
  }

  function trendState(trend) {
    if (trend > 1.2) return "up";
    if (trend < -1.2) return "down";
    return "flat";
  }

  function buildCard(grup) {
    var root = el("article", "card");
    root.setAttribute("data-grup", String(grup));
    root.style.setProperty("--hue", "var(--group-" + grup + ")");

    var rail = el("span", "card__rail");
    rail.setAttribute("aria-hidden", "true");
    root.appendChild(rail);

    var head = el("div", "card__head");
    var rank = el("span", "card__rank", "1");
    var name = el("h2", "card__name", window.Roster
      ? Roster.label(grup) : I18N.t("card.group") + " " + grup);
    var heat = el("span", "card__heat", "—");
    head.appendChild(rank);
    head.appendChild(name);
    head.appendChild(heat);
    root.appendChild(head);

    var bar = el("div", "bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    var fill = el("span", "bar__fill");
    bar.appendChild(fill);
    root.appendChild(bar);

    var readout = el("div", "readout");
    var big = el("span", "readout__value", "—");
    var unit = el("span", "readout__unit", "m");
    var trend = el("span", "readout__trend", "");
    readout.appendChild(big);
    readout.appendChild(unit);
    readout.appendChild(trend);
    root.appendChild(readout);

    // The band is the honest half of the estimate: indoors a single RSSI
    // reading maps to a wide spread of possible distances, and hiding that
    // would turn a rough guess into a false measurement.
    var band = el("p", "readout__band", "");
    root.appendChild(band);

    var stats = el("dl", "stats");
    var refs = {};
    var rows = [
      ["smoothed", "card.smoothed"],
      ["raw", "card.raw"],
      ["best", "card.best"],
      ["snr", "card.snr"],
      ["loss", "card.loss"],
      ["delay", "card.delay"]
    ];
    for (var i = 0; i < rows.length; i++) {
      var pair = el("div", "stats__pair");
      var dt = el("dt", "stats__key");
      dt.setAttribute("data-i18n", rows[i][1]);
      dt.textContent = I18N.t(rows[i][1]);
      var dd = el("dd", "stats__val", "—");
      pair.appendChild(dt);
      pair.appendChild(dd);
      stats.appendChild(pair);
      refs[rows[i][0]] = dd;
    }
    root.appendChild(stats);

    var action = el("div", "card__action");

    var calibrate = el("button", "btn btn--ghost btn--calibrate",
                       I18N.t("card.calibrate"));
    calibrate.type = "button";
    calibrate.title = I18N.t("card.calibrate");
    calibrate.addEventListener("click", function () {
      Store.calibrate(grup);
    });
    action.appendChild(calibrate);

    var confirm = el("button", "btn btn--confirm", I18N.t("card.confirm"));
    confirm.type = "button";
    confirm.addEventListener("click", function () {
      Store.confirmFind(grup);
    });
    action.appendChild(confirm);
    root.appendChild(action);

    cardsEl.appendChild(root);

    return {
      root: root, rank: rank, name: name, heat: heat, fill: fill, bar: bar,
      big: big, unit: unit, trend: trend, confirm: confirm, calibrate: calibrate,
      stats: refs, band: band,
      prev: {}
    };
  }

  function write(node, key, value, card) {
    if (card.prev[key] === value) return;
    card.prev[key] = value;
    node.textContent = value;
  }

  function renderCard(row, found) {
    var card = cards[row.grup];
    if (!card) {
      card = cards[row.grup] = buildCard(row.grup);
    }

    var isFound = (found === row.grup);

    write(card.rank, "rank", String(row.rank), card);
    // Roster.label(), not the bare number: the compact list, the projector
    // and the review queue all name a group by its team name, and this was
    // the one place that did not - so the same group could read "Kelompok
    // Gana" and "Kelompok 3" on one screen.
    write(card.name, "name", window.Roster
      ? Roster.label(row.grup) : I18N.t("card.group") + " " + row.grup, card);
    write(card.heat, "heat", I18N.t("heat." + row.heat), card);

    var pct = Math.round(row.progress * 100);
    if (card.prev.pct !== pct) {
      card.prev.pct = pct;
      // Clipped rather than resized: no layout on any frame, and the
      // gradient stays anchored to the full track so the colour at the bar's
      // tip means the same thing at every length.
      card.fill.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
      card.bar.setAttribute("aria-valuenow", String(pct));
    }

    // The unit rides along with the number because a hunt that spans a whole
    // building crosses from metres into kilometres mid-round.
    var jarak = I18N.jarakBagian(row.jarak_m);
    write(card.big, "big", jarak.nilai, card);
    write(card.unit, "unit", jarak.satuan, card);
    write(card.band, "band",
          I18N.rentang(row.jarak_dekat, row.jarak_jauh), card);
    write(card.trend, "trend", row.online ? trendLabel(row.trend) : "", card);

    var tState = row.online ? trendState(row.trend) : "flat";
    if (card.prev.tState !== tState) {
      card.prev.tState = tState;
      card.trend.setAttribute("data-trend", tState);
    }

    write(card.stats.smoothed, "smoothed",
          row.halus === null ? "—" : row.halus.toFixed(1) + " dBm", card);
    write(card.stats.raw, "raw", row.rssi === null ? "—" : row.rssi + " dBm", card);
    write(card.stats.best, "best", row.best === null ? "—" : row.best.toFixed(1) + " dBm", card);
    write(card.stats.snr, "snr", row.snr === null ? "—" : row.snr.toFixed(1) + " dB", card);
    write(card.stats.loss, "loss", row.hilang + " (" + row.rugi_persen + "%)", card);
    write(card.stats.delay, "delay",
          row.delay_ms === null ? "—" : row.delay_ms + " ms", card);

    var state = isFound ? "found" : (row.online ? row.heat : "hilang");
    if (card.prev.state !== state) {
      card.prev.state = state;
      card.root.setAttribute("data-state", state);
    }

    // The confirm control only appears on the group the server has nominated,
    // so an assistant cannot hand the win to a group that is nowhere near.
    var boleh = window.Identity ? Identity.isAssistant() : false;
    var showConfirm = boleh && !found && row.nominated;
    if (card.prev.showConfirm !== showConfirm || card.prev.boleh !== boleh) {
      card.prev.showConfirm = showConfirm;
      card.prev.boleh = boleh;
      card.root.setAttribute("data-confirmable", showConfirm ? "yes" : "no");
      card.calibrate.hidden = !boleh;
      card.confirm.textContent = I18N.t("card.confirm");
      card.calibrate.textContent = I18N.t("card.calibrate");
    }
  }

  // FLIP: cards must slide between ranks, not jump.
  function reorder(order) {
    var same = order.length === lastOrder.length;
    if (same) {
      for (var i = 0; i < order.length; i++) {
        if (order[i] !== lastOrder[i]) { same = false; break; }
      }
    }
    if (same) return;
    lastOrder = order.slice();

    // Ranks can change on any of the ten frames a second, so a FLIP is often
    // started while the previous one is still running. Measuring then would
    // read the mid-animation position and the deltas would compound, piling
    // the cards on top of each other. Clear any in-flight transform first so
    // every measurement is of the settled layout.
    var g;
    for (g in cards) {
      if (!cards.hasOwnProperty(g)) continue;
      cards[g].root.style.transition = "none";
      cards[g].root.style.transform = "";
    }

    var first = {};
    for (g in cards) {
      if (cards.hasOwnProperty(g)) {
        first[g] = cards[g].root.getBoundingClientRect().top;
      }
    }

    for (var j = 0; j < order.length; j++) {
      cardsEl.appendChild(cards[order[j]].root);
    }

    if (window.Motion && Motion.isReduced()) return;

    for (var k in cards) {
      if (!cards.hasOwnProperty(k)) continue;
      var node = cards[k].root;
      var delta = first[k] - node.getBoundingClientRect().top;
      if (!delta) continue;

      node.style.transition = "none";
      node.style.transform = "translateY(" + delta + "px)";
      // Read back so the browser accepts the next change as a transition
      // rather than collapsing both writes into one frame.
      void node.offsetHeight;
      node.style.transition = "transform var(--dur-mid) var(--ease-out-expo)";
      node.style.transform = "";
    }
  }

  // ------------------------------------------------------------ own view
  //
  // With a group chosen the board stops being a grid of seven equal cards
  // and becomes one big readout plus a glance at everyone else. That is
  // what a phone held at arm's length in a field actually needs.

  var STAT_KEYS = ["smoothed", "raw", "best", "snr", "loss", "delay"];

  function statValue(key, row) {
    if (key === "smoothed") return row.halus === null ? "—" : row.halus.toFixed(1) + " dBm";
    if (key === "raw") return row.rssi === null ? "—" : row.rssi + " dBm";
    if (key === "best") return row.best === null ? "—" : row.best.toFixed(1) + " dBm";
    if (key === "snr") return row.snr === null ? "—" : row.snr.toFixed(1) + " dB";
    if (key === "loss") return row.hilang + " (" + row.rugi_persen + "%)";
    return row.delay_ms === null ? "—" : row.delay_ms + " ms";
  }

  function buildMineStats() {
    mine.stats.textContent = "";
    mine.statVals = {};
    for (var i = 0; i < STAT_KEYS.length; i++) {
      var key = STAT_KEYS[i];
      var pair = document.createElement("div");
      pair.className = "stats__pair";
      var dt = document.createElement("dt");
      dt.className = "stats__key";
      dt.setAttribute("data-i18n", "card." + key);
      dt.textContent = I18N.t("card." + key);
      var dd = document.createElement("dd");
      dd.className = "stats__val";
      dd.textContent = "—";
      pair.appendChild(dt);
      pair.appendChild(dd);
      mine.stats.appendChild(pair);
      mine.statVals[key] = dd;
    }
  }

  function renderMine(row, state) {
    if (!mine.root) return;

    mine.root.hidden = false;
    mine.root.style.setProperty("--hue", "var(--group-" + row.grup + ")");
    mine.root.setAttribute("data-state",
      state.ditemukan === row.grup ? "found"
        : (row.status === "menunggu" ? "menunggu"
          : (row.online ? row.heat : "hilang")));

    mine.rank.textContent = row.rank ? "#" + row.rank : "—";
    mine.name.textContent = Roster.label(row.grup);
    mine.heat.textContent = I18N.t("heat." + row.heat);

    var jarak = I18N.jarakBagian(row.jarak_m);
    mine.value.textContent = jarak.nilai;
    mine.unit.textContent = jarak.satuan;
    mine.band.textContent = I18N.rentang(row.jarak_dekat, row.jarak_jauh);

    mine.trend.textContent = row.online ? trendLabel(row.trend) : "";
    mine.trend.setAttribute("data-trend", row.online ? trendState(row.trend) : "flat");

    var pct = Math.round(row.progress * 100);
    mine.fill.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
    mine.bar.setAttribute("aria-valuenow", String(pct));

    if (!mine.statVals) buildMineStats();
    for (var i = 0; i < STAT_KEYS.length; i++) {
      var key = STAT_KEYS[i];
      mine.statVals[key].textContent = statValue(key, row);
    }

    // The claim button arms itself by proximity. Below the burning
    // threshold it is disabled and says why, which is what stops a group
    // claiming the beacon from the far side of the field.
    var armed = UIClaim.armed(row) && state.ditemukan === null;
    mine.claim.disabled = !armed;
    mine.claim.setAttribute("data-armed", armed ? "yes" : "no");
    mine.why.textContent = armed ? I18N.t("claim.armed")
                                 : UIClaim.armReason(row, state);

    if (row.status === "ditolak" && row.tolak_alasan) {
      mine.verdict.hidden = false;
      mine.verdict.setAttribute("data-kind", "tolak");
      mine.verdict.textContent = I18N.t("claim.wasRejected", row.tolak_alasan);
    } else if (row.status === "menunggu") {
      mine.verdict.hidden = false;
      mine.verdict.setAttribute("data-kind", "tunggu");
      mine.verdict.textContent = I18N.t("claim.inReview");
    } else if (row.status === "menang") {
      mine.verdict.hidden = false;
      mine.verdict.setAttribute("data-kind", "menang");
      mine.verdict.textContent = I18N.t("claim.youWon");
    } else {
      mine.verdict.hidden = true;
    }

    paintSense();
  }

  /** Keeps the toggle's own label and hint honest. */
  function paintSense() {
    if (!mine.senseBtn || !window.Sense) return;
    var on = Sense.enabled();
    mine.senseBtn.setAttribute("aria-pressed", on ? "true" : "false");
    mine.senseBtn.setAttribute("data-on", on ? "yes" : "no");
    mine.senseLabel.textContent = I18N.t(on ? "sense.on" : "sense.off");

    if (!on) {
      mine.senseNote.hidden = true;
      return;
    }
    var canHear = !!(window.AudioContext || window.webkitAudioContext);
    mine.senseNote.hidden = false;
    mine.senseNote.textContent = I18N.t(canHear ? "sense.hint"
                                                : "sense.noAudio");
  }

  function renderOthers(rows, mineGrup, state) {
    var list = rows.filter(function (r) { return r.grup !== mineGrup; });
    othersEl.hidden = list.length === 0;
    if (!list.length) return;

    var order = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var key = String(row.grup);
      var ref = otherRows[key];
      if (!ref) ref = otherRows[key] = buildOtherRow(row.grup);

      ref.rank.textContent = String(row.rank);
      ref.name.textContent = Roster.label(row.grup);
      ref.value.textContent = I18N.jarak(row.jarak_m);
      ref.heat.textContent = I18N.t("heat." + row.heat);
      ref.fill.style.clipPath =
        "inset(0 " + (100 - Math.round(row.progress * 100)) + "% 0 0)";
      ref.root.setAttribute("data-state",
        state.ditemukan === row.grup ? "found"
          : (row.status === "menunggu" ? "menunggu"
            : (row.online ? row.heat : "hilang")));
      order.push(key);
    }

    for (var g in otherRows) {
      if (!otherRows.hasOwnProperty(g)) continue;
      if (order.indexOf(g) === -1) {
        othersListEl.removeChild(otherRows[g].root);
        delete otherRows[g];
      }
    }
    for (var j = 0; j < order.length; j++) {
      othersListEl.appendChild(otherRows[order[j]].root);
    }
  }

  function buildOtherRow(grup) {
    var root = document.createElement("div");
    root.className = "orow";
    root.style.setProperty("--hue", "var(--group-" + grup + ")");

    function span(cls, text) {
      var n = document.createElement("span");
      n.className = cls;
      n.textContent = text;
      return n;
    }

    var rank = span("orow__rank", "—");
    var name = span("orow__name", "");
    var bar = document.createElement("div");
    bar.className = "orow__bar";
    var fill = document.createElement("span");
    fill.className = "orow__fill";
    bar.appendChild(fill);
    var value = span("orow__value", "—");
    var heat = span("orow__heat", "—");

    root.appendChild(rank);
    root.appendChild(name);
    root.appendChild(bar);
    root.appendChild(value);
    root.appendChild(heat);
    othersListEl.appendChild(root);

    return { root: root, rank: rank, name: name, fill: fill,
             value: value, heat: heat };
  }

  function clearCards() {
    for (var g in cards) {
      if (!cards.hasOwnProperty(g)) continue;
      cardsEl.removeChild(cards[g].root);
      delete cards[g];
    }
    lastOrder = [];
  }

  function render(state) {
    if (!state) return;

    hudElapsed.textContent = mmss(state.berjalan || 0);

    var beaconOn = state.beacon && state.beacon.online;
    hudBeacon.textContent = I18N.t(beaconOn ? "hud.beaconOn" : "hud.beaconOff");
    hudBeacon.setAttribute("data-state", beaconOn ? "on" : "off");
    hudSeq.textContent = String((state.beacon && state.beacon.seq) || 0);

    if (state.radio) {
      hudRadio.textContent = state.radio.freq + " · SF" + state.radio.sf +
                             " · " + state.radio.bw;
    }

    var rows = state.grup || [];
    emptyEl.hidden = rows.length > 0;

    var mineGrup = Identity.group();
    var mineRow = null;
    for (var m = 0; m < rows.length; m++) {
      if (rows[m].grup === mineGrup) { mineRow = rows[m]; break; }
    }

    if (mineRow) {
      // Own view. The all-cards grid is torn down so it is not sitting
      // invisible underneath costing layout on every frame.
      if (cardsEl.children.length) clearCards();
      cardsEl.hidden = true;
      renderMine(mineRow, state);
      renderOthers(rows, mineGrup, state);
      return;
    }

    // No group chosen, or chosen but not yet reporting: the original
    // seven-card board, which is what a spare laptop or the assistant wants.
    if (mine.root) {
      mine.root.hidden = true;
      othersEl.hidden = true;
    }
    cardsEl.hidden = false;

    var order = [];
    for (var i = 0; i < rows.length; i++) {
      rows[i].nominated = (state.calon === rows[i].grup);
      renderCard(rows[i], state.ditemukan);
      order.push(String(rows[i].grup));
    }

    // A group that vanishes from the feed entirely (server restart, session
    // reset) must not leave a stale card behind.
    for (var g in cards) {
      if (!cards.hasOwnProperty(g)) continue;
      if (order.indexOf(g) === -1) {
        cardsEl.removeChild(cards[g].root);
        delete cards[g];
      }
    }

    reorder(order);
  }

  /**
   * Hand the member's own row to the eyes-free channels.
   *
   * Called from the app shell on every frame, not from render(), and that
   * distinction is the whole point. render() only runs while the hunt
   * screen is the one on show; somebody who opens Layers for a moment is
   * still out on the field, and a tick that froze at the last distance it
   * saw would be worse than one that stopped - it would keep confidently
   * reporting ground the group has already left.
   */
  function follow(state) {
    if (!window.Sense) return;
    if (!state) { Sense.update(null, null); return; }

    var mineGrup = Identity.group();
    var rows = state.grup || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].grup === mineGrup) { Sense.update(rows[i], state); return; }
    }
    // No group, or a group that is not reporting: a spare laptop watching
    // the board has no distance of its own to tick about.
    Sense.update(null, state);
  }

  function mount() {
    cardsEl = document.getElementById("cards");
    emptyEl = document.getElementById("hunt-empty");
    hudElapsed = document.getElementById("hud-elapsed");
    hudBeacon = document.getElementById("hud-beacon");
    hudSeq = document.getElementById("hud-seq");
    hudRadio = document.getElementById("hud-radio");

    othersEl = document.getElementById("others");
    othersListEl = document.getElementById("others-list");

    mine = {
      root: document.getElementById("mine"),
      rank: document.getElementById("mine-rank"),
      name: document.getElementById("mine-name"),
      heat: document.getElementById("mine-heat"),
      value: document.getElementById("mine-value"),
      unit: document.getElementById("mine-unit"),
      trend: document.getElementById("mine-trend"),
      band: document.getElementById("mine-band"),
      bar: document.getElementById("mine-bar"),
      fill: document.getElementById("mine-fill"),
      claim: document.getElementById("mine-claim"),
      why: document.getElementById("mine-why"),
      stats: document.getElementById("mine-stats"),
      verdict: document.getElementById("mine-verdict"),
      senseBtn: document.getElementById("sense-toggle"),
      senseLabel: document.getElementById("sense-label"),
      senseNote: document.getElementById("sense-note"),
      statVals: null
    };

    if (mine.senseBtn) {
      mine.senseBtn.addEventListener("click", function () {
        if (!window.Sense) return;
        // This tap is the only moment a browser will let an AudioContext
        // start, which is why the toggle exists as a button rather than as
        // something the page decides for itself.
        Sense.setEnabled(!Sense.enabled(), true);
        paintSense();
      });
    }

    mine.claim.addEventListener("click", function () {
      var grup = Identity.group();
      if (grup !== null) UIClaim.open(grup);
    });

    document.getElementById("btn-reset").addEventListener("click", function () {
      Store.reset();
    });

    // A language switch changes text inside cards that are patched by value,
    // so the memo has to be cleared or the old strings stick.
    I18N.onChange(function () {
      for (var g in cards) {
        if (cards.hasOwnProperty(g)) cards[g].prev = {};
      }
      mine.statVals = null;
      render(Store.getState());
    });

    Identity.onChange(function () { render(Store.getState()); });
    if (window.Roster) Roster.onChange(function () { render(Store.getState()); });
  }

  window.UIHunt = { mount: mount, render: render, follow: follow };
})();
