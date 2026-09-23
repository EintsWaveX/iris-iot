/**
 * Perburuan LoRa IRIS - the awards tab.
 *
 * Four results, and only one of them is "who's fastest". The other three
 * exist because the hunt measures things that finding a target does not:
 * closing efficiently, holding the snappiest link, and holding the
 * steadiest one. A group that has not found its own target yet can still
 * have the best radio story of the afternoon, which is the part worth
 * teaching.
 *
 * Five independent pairs finish independently, so "the champion" is really
 * "whoever is fastest so far" until every pair has found its own target --
 * the leader banner says which of those two it is showing. The server
 * freezes the whole result (hadiah.beku) only once every group that joined
 * has won, so every device shows the same frozen final result at that
 * point.
 *
 * window.UIAwards = { mount, render }
 */
(function () {
  "use strict";

  var podiumEl = null;
  var bestsEl = null;
  var emptyEl = null;
  var stateEl = null;
  var champEl = null;

  var BESTS = [
    { key: "pendekat_tercepat", label: "award.closer", note: "award.closerNote" },
    { key: "tautan_tercepat", label: "award.latency", note: "award.latencyNote" },
    { key: "tautan_terandal", label: "award.link", note: "award.linkNote" }
  ];

  var MEDAL = ["gold", "silver", "bronze"];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * The leader banner: whichever group's podium position is 1, which is
   * "fastest so far" while the round runs and "fastest overall" once
   * hadiah.beku freezes it. No single state.ditemukan any more -- this is
   * just the podium's own top entry, read back out for the hero treatment.
   */
  function buildChampion(hadiah) {
    champEl.textContent = "";
    var leader = (hadiah.podium || [])[0];
    if (!leader) {
      champEl.hidden = true;
      return;
    }
    champEl.hidden = false;
    var grup = leader.grup;
    champEl.style.setProperty("--hue", "var(--group-" + grup + ")");

    champEl.appendChild(el("p", "champ__eyebrow",
      I18N.t(hadiah.beku ? "award.champion" : "award.leader")));
    champEl.appendChild(el("h2", "champ__name", Roster.label(grup)));

    var names = Roster.names(grup);
    if (names.length) {
      champEl.appendChild(el("p", "champ__members", names.join(" · ")));
    }
    champEl.appendChild(el("p", "champ__time",
      I18N.t("found.in") + " " + mmss(leader.durasi || 0)));

    if (leader.foto_url) {
      var img = new Image();
      img.className = "champ__shot";
      img.alt = "";
      img.src = leader.foto_url;
      champEl.appendChild(img);
    }
  }

  function mmss(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function buildPodium(hadiah) {
    podiumEl.textContent = "";
    var rows = hadiah.podium || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var card = el("div", "podium");
      card.setAttribute("data-medal", MEDAL[i] || "none");
      card.style.setProperty("--hue", "var(--group-" + row.grup + ")");

      card.appendChild(el("span", "podium__pos", String(row.posisi)));
      card.appendChild(el("span", "podium__name", Roster.label(row.grup)));
      // Find time, not distance: the podium ranks groups by how fast each
      // one found ITS OWN target, since RSSI proximity to five different
      // targets hidden in five different places is not a fair comparison.
      card.appendChild(el("span", "podium__value",
        I18N.t("found.in") + " " + mmss(row.durasi || 0)));
      podiumEl.appendChild(card);
    }
  }

  function buildBests(hadiah) {
    bestsEl.textContent = "";
    for (var i = 0; i < BESTS.length; i++) {
      var spec = BESTS[i];
      var data = hadiah[spec.key];
      var card = el("div", "bestcard");

      card.appendChild(el("p", "bestcard__label", I18N.t(spec.label)));

      if (!data) {
        card.appendChild(el("p", "bestcard__none", I18N.t("award.none")));
      } else {
        card.style.setProperty("--hue", "var(--group-" + data.grup + ")");
        card.appendChild(el("p", "bestcard__who", Roster.label(data.grup)));
        var value = data.nilai + " " + data.satuan;
        card.appendChild(el("p", "bestcard__value", value));
      }
      card.appendChild(el("p", "bestcard__note", I18N.t(spec.note)));
      bestsEl.appendChild(card);
    }
  }

  function render(state) {
    if (!podiumEl || !state) return;

    var hadiah = state.penghargaan;
    var any = hadiah && (hadiah.podium || []).length;
    emptyEl.hidden = !!any;
    podiumEl.hidden = !any;
    bestsEl.hidden = !any;
    if (!any) {
      champEl.hidden = true;
      stateEl.textContent = "";
      return;
    }

    stateEl.textContent = hadiah.beku ? I18N.t("award.final")
                                      : I18N.t("award.provisional");
    stateEl.setAttribute("data-beku", hadiah.beku ? "yes" : "no");

    buildChampion(hadiah);
    buildPodium(hadiah);
    buildBests(hadiah);
  }

  function mount() {
    podiumEl = document.getElementById("awards-podium");
    bestsEl = document.getElementById("awards-bests");
    emptyEl = document.getElementById("awards-empty");
    stateEl = document.getElementById("awards-state");
    champEl = document.getElementById("awards-champ");

    I18N.onChange(function () { render(Store.getState()); });
    if (window.Roster) Roster.onChange(function () { render(Store.getState()); });
  }

  window.UIAwards = { mount: mount, render: render };
})();
