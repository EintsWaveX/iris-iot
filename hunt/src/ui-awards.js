/**
 * Perburuan LoRa IRIS - the awards tab.
 *
 * Four results, and only one of them is "who won". The other three exist
 * because the hunt measures things that finding the beacon does not:
 * closing efficiently, getting physically closest, and holding the
 * steadiest link. A group that never found it can still have the best
 * radio story of the afternoon, which is the part worth teaching.
 *
 * Everything is provisional while the hunt runs and freezes the moment a
 * win is confirmed - the server does the freezing, so every device shows
 * the same frozen result.
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
    { key: "sinyal_terkuat", label: "award.signal", note: "award.signalNote" },
    { key: "tautan_terandal", label: "award.link", note: "award.linkNote" }
  ];

  var MEDAL = ["gold", "silver", "bronze"];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildChampion(state) {
    champEl.textContent = "";
    if (state.ditemukan === null) {
      champEl.hidden = true;
      return;
    }
    champEl.hidden = false;
    var grup = state.ditemukan;
    champEl.style.setProperty("--hue", "var(--group-" + grup + ")");

    champEl.appendChild(el("p", "champ__eyebrow", I18N.t("award.champion")));
    champEl.appendChild(el("h2", "champ__name", Roster.label(grup)));

    var names = Roster.names(grup);
    if (names.length) {
      champEl.appendChild(el("p", "champ__members", names.join(" · ")));
    }
    champEl.appendChild(el("p", "champ__time",
      I18N.t("found.in") + " " + mmss(state.berjalan)));

    var url = state.foto_menang;
    if (url) {
      var img = new Image();
      img.className = "champ__shot";
      img.alt = "";
      img.src = url;
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
      card.appendChild(el("span", "podium__value", I18N.jarak(row.jarak_m)));
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

    buildChampion(state);
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
