/**
 * Perburuan LoRa IRIS - projector mode (?stage=1).
 *
 * The hunt board is designed to be read from a laptop. This is the same data
 * sized for the back of a room: rank, group, heat and a bar, nothing else.
 * Everything that needs a cursor is dropped, because nobody is going to walk
 * up to the projector to press a button.
 *
 * window.Stage = { active, mount, render }
 */
(function () {
  "use strict";

  var stageEl = null;
  var listEl = null;
  var headEl = null;
  var bannerEl = null;
  var rowsByGroup = {};
  var active = false;

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

  function buildRow(grup) {
    var root = el("div", "srow");
    root.style.setProperty("--hue", "var(--group-" + grup + ")");

    var rank = el("span", "srow__rank", "—");
    var name = el("span", "srow__name", I18N.t("card.group") + " " + grup);
    var bar = el("div", "srow__bar");
    var fill = el("span", "srow__fill");
    bar.appendChild(fill);
    var value = el("span", "srow__value", "—");
    var heat = el("span", "srow__heat", "—");

    root.appendChild(rank);
    root.appendChild(name);
    root.appendChild(bar);
    root.appendChild(value);
    root.appendChild(heat);
    listEl.appendChild(root);

    return { root: root, rank: rank, name: name, fill: fill,
             value: value, heat: heat };
  }

  function render(state) {
    if (!active || !state) return;

    headEl.textContent = mmss(state.berjalan || 0);
    // Five independent beacons now: "on" means at least one pair is
    // currently transmitting, not that a single shared beacon is alive.
    var anyBeaconOn = (state.grup || []).some(function (r) {
      return r.beacon && r.beacon.online;
    });
    headEl.setAttribute("data-beacon", anyBeaconOn ? "on" : "off");

    renderBanner(state);

    var rows = state.grup || [];
    var order = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var ref = rowsByGroup[row.grup];
      if (!ref) ref = rowsByGroup[row.grup] = buildRow(row.grup);

      ref.rank.textContent = String(row.rank);
      ref.name.textContent = window.Roster ? Roster.label(row.grup)
                                           : I18N.t("card.group") + " " + row.grup;
      ref.value.textContent = I18N.jarak(row.jarak_m);
      // A pending claim reads MENUNGGU rather than a heat word, so the room
      // can see that the endgame has started.
      ref.heat.textContent = I18N.t(
        row.status === "menunggu" ? "heat.menunggu" : "heat." + row.heat);
      ref.fill.style.clipPath =
        "inset(0 " + (100 - Math.round(row.progress * 100)) + "% 0 0)";
      ref.root.setAttribute("data-state",
        row.status === "menang" ? "found"
          : (row.status === "menunggu" ? "menunggu"
            : (row.online ? row.heat : "hilang")));

      order.push(String(row.grup));
    }

    for (var g in rowsByGroup) {
      if (!rowsByGroup.hasOwnProperty(g)) continue;
      if (order.indexOf(g) === -1) {
        listEl.removeChild(rowsByGroup[g].root);
        delete rowsByGroup[g];
      }
    }

    for (var j = 0; j < order.length; j++) {
      listEl.appendChild(rowsByGroup[order[j]].root);
    }
  }

  /**
   * The claim banner. Without it the endgame happens silently on two
   * phones while the room watches a board that has stopped changing.
   * The photo deliberately stays off the projector: nobody has looked at
   * what is in it yet.
   */
  function renderBanner(state) {
    var pending = (state.antrian || [])[0];
    if (!pending) {
      if (!bannerEl.hidden) {
        bannerEl.hidden = true;
        bannerEl.textContent = "";
        bannerEl.removeAttribute("data-grup");
        bannerEl.removeAttribute("data-key");
      }
      return;
    }

    // Keyed on the group AND the name, because the banner is usually built
    // before the roster has been fetched and would otherwise keep showing
    // "Kelompok 3" while every row beneath it says "Regu Garuda".
    var who = window.Roster ? Roster.label(pending.grup)
                            : I18N.t("card.group") + " " + pending.grup;
    var key = pending.grup + "|" + who;
    if (bannerEl.getAttribute("data-key") === key) return;
    bannerEl.setAttribute("data-key", key);
    bannerEl.setAttribute("data-grup", String(pending.grup));
    bannerEl.style.setProperty("--hue", "var(--group-" + pending.grup + ")");
    bannerEl.textContent = "";

    bannerEl.appendChild(el("span", "banner__who", who));
    bannerEl.appendChild(el("span", "banner__what", I18N.t("stage.claiming")));
    bannerEl.appendChild(el("span", "banner__note", I18N.t("stage.awaiting")));
    bannerEl.hidden = false;

    if (window.Motion && !Motion.isReduced()) {
      Motion.gsap.fromTo(bannerEl, { autoAlpha: 0, y: -12 },
        { autoAlpha: 1, y: 0, duration: Motion.DUR.mid, ease: "ease-out-expo" });
    }
  }

  function mount() {
    stageEl = document.getElementById("stage");
    active = /(?:^|[?&])stage=1(?:&|$)/.test(window.location.search);
    if (!active) return;

    document.body.setAttribute("data-stage", "1");
    if (window.Roster) {
      Roster.onChange(function () { render(Store.getState()); });
    }
    stageEl.hidden = false;
    stageEl.textContent = "";

    var head = el("header", "stage__head");
    head.appendChild(el("p", "stage__eyebrow", I18N.t("hunt.eyebrow")));
    head.appendChild(el("h1", "stage__title", I18N.t("hunt.title")));
    headEl = el("span", "stage__clock", "00:00");
    head.appendChild(headEl);
    stageEl.appendChild(head);

    bannerEl = el("div", "banner");
    bannerEl.hidden = true;
    bannerEl.setAttribute("role", "status");
    stageEl.appendChild(bannerEl);

    listEl = el("div", "stage__list");
    stageEl.appendChild(listEl);

    if (window.Cosmos) Cosmos.setScene("stage");
  }

  window.Stage = {
    mount: mount,
    render: render,
    active: function () { return active; }
  };
})();
