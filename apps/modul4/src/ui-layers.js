/**
 * Perburuan LoRa IRIS - the layer view.
 *
 * The teaching centrepiece. One RSSI reading crosses five layers on its way
 * from a radio in a corridor to a number on a projector, and this screen
 * shows each of them with the live value that is actually passing through it
 * right now, for whichever group is selected.
 *
 * Every value here is real and comes from the device or the server; nothing
 * is illustrative. The network row prints the address the Orange Pi's DHCP
 * actually leased to that board.
 *
 * window.UILayers = { mount, render }
 */
(function () {
  "use strict";

  var pickerEl = null;
  var layersEl = null;
  var emptyEl = null;

  var selected = null;
  var built = false;
  var rows = {};

  var LAYERS = [
    { key: "application", note: "layers.applicationNote" },
    { key: "transport", note: "layers.transportNote" },
    { key: "network", note: "layers.networkNote" },
    { key: "datalink", note: "layers.datalinkNote" },
    { key: "physical", note: "layers.physicalNote" }
  ];

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

  function build() {
    layersEl.textContent = "";
    rows = {};

    for (var i = 0; i < LAYERS.length; i++) {
      var spec = LAYERS[i];
      var row = el("div", "layer");
      row.setAttribute("data-layer", spec.key);

      var head = el("div", "layer__head");
      var name = el("span", "layer__name");
      name.setAttribute("data-i18n", "layers." + spec.key);
      name.textContent = I18N.t("layers." + spec.key);
      var index = el("span", "layer__index", String(LAYERS.length - i));
      head.appendChild(index);
      head.appendChild(name);
      row.appendChild(head);

      var value = el("p", "layer__value", "—");
      row.appendChild(value);

      var estimate = null;
      if (spec.key === "physical") {
        estimate = el("p", "layer__estimate", "");
        row.appendChild(estimate);
      }

      var note = el("p", "layer__note");
      note.setAttribute("data-i18n", spec.key === "physical" ? "layers.modelNote" : spec.note);
      note.textContent = I18N.t(spec.key === "physical" ? "layers.modelNote" : spec.note);
      row.appendChild(note);

      layersEl.appendChild(row);
      rows[spec.key] = { root: row, value: value, estimate: estimate };
    }
    built = true;
  }

  function buildPicker(state) {
    var list = state.grup || [];
    var wanted = list.map(function (r) { return r.grup; }).sort(function (a, b) {
      return a - b;
    }).join(",");

    if (pickerEl.getAttribute("data-keys") === wanted) return;
    pickerEl.setAttribute("data-keys", wanted);
    pickerEl.textContent = "";

    var sorted = list.slice().sort(function (a, b) { return a.grup - b.grup; });
    for (var i = 0; i < sorted.length; i++) {
      (function (grup) {
        var btn = el("button", "picker__btn", I18N.t("card.group") + " " + grup);
        btn.type = "button";
        btn.setAttribute("role", "tab");
        btn.style.setProperty("--hue", "var(--group-" + grup + ")");
        btn.addEventListener("click", function () {
          selected = grup;
          render(Store.getState());
        });
        pickerEl.appendChild(btn);
      })(sorted[i].grup);
    }
  }

  function markPicker() {
    var buttons = pickerEl.querySelectorAll(".picker__btn");
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].textContent === I18N.t("card.group") + " " + selected;
      buttons[i].classList.toggle("is-on", on);
      buttons[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function render(state) {
    if (!state) return;

    var list = state.grup || [];
    emptyEl.hidden = list.length > 0;
    layersEl.hidden = list.length === 0;
    pickerEl.hidden = list.length === 0;
    if (!list.length) return;

    if (!built) build();
    buildPicker(state);

    // Default to whoever is leading, so the screen is useful before anyone
    // touches it, but never steal the selection once a choice was made.
    var known = list.some(function (r) { return r.grup === selected; });
    if (!known) selected = list[0].grup;
    markPicker();

    var row = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].grup === selected) { row = list[i]; break; }
    }
    if (!row) return;

    var radio = state.radio || {};

    rows.application.value.textContent =
      I18N.t("layers.rank") + " " + row.rank + " " + I18N.t("layers.of") + " " +
      list.length + " · " + I18N.t("heat." + row.heat);

    rows.transport.value.textContent =
      "WebSocket " + I18N.t("layers.open") + " " + mmss(row.uptime) +
      (row.delay_ms === null ? "" : " · " + row.delay_ms + " ms");

    rows.network.value.textContent =
      (row.ip || "—") + " → " + row.gateway + " · " + I18N.t("layers.hop");

    rows.datalink.value.textContent =
      I18N.t("layers.packet") + " " + row.seq + " · " + row.hilang + " " +
      I18N.t("layers.lost") + " (" + row.rugi_persen + "%) · " +
      I18N.t("layers.sync") + " " + (radio.sync || "—");

    rows.physical.value.textContent =
      (radio.freq || "—") + " · SF" + (radio.sf || "—") + " · " +
      (radio.bw || "—") + " · " +
      (row.rssi === null ? "—" : row.rssi + " dBm") +
      (row.snr === null ? "" : " · SNR " + row.snr.toFixed(1) + " dB");

    var model = state.model || {};
    var estimate = "—";
    if (row.jarak_m !== null) {
      estimate = "≈ " + I18N.jarak(row.jarak_m);
      var band = I18N.rentang(row.jarak_dekat, row.jarak_jauh);
      if (band) estimate += "  (" + band + ")";
    }
    rows.physical.estimate.textContent =
      I18N.t("layers.estimate") + ": " + estimate + "   ·   " +
      I18N.t("layers.model") + ": RSSI(1 m) = " + model.rssi_1m + " dBm, n = " +
      model.n + ", " + I18N.t("layers.arena") + " " + I18N.jarak(model.arena_m);

    for (var key in rows) {
      if (rows.hasOwnProperty(key)) {
        rows[key].root.style.setProperty("--hue", "var(--group-" + selected + ")");
      }
    }
  }

  function mount() {
    pickerEl = document.getElementById("layer-picker");
    layersEl = document.getElementById("layers");
    emptyEl = document.getElementById("layers-empty");

    I18N.onChange(function () {
      built = false;
      pickerEl.removeAttribute("data-keys");
      render(Store.getState());
    });
  }

  window.UILayers = { mount: mount, render: render };
})();
