/**
 * Perburuan LoRa IRIS - notifications and the find takeover.
 *
 * Two things live here because they are the same idea at two volumes. A toast
 * is the quiet one: a group joined, a group lost signal, a group is heating
 * up. The takeover is the loud one, and it only ever fires once per session,
 * when an assistant confirms that a group physically has the beacon.
 *
 * Both are announced to screen readers through the live regions in
 * shell.html, and both collapse to a plain fade when the viewer has asked for
 * reduced motion.
 *
 * window.UINotify = { mount, render, toast }
 */
(function () {
  "use strict";

  var toastsEl = null;
  var foundEl = null;
  var confettiCanvas = null;
  var fire = null;

  var shown = false;       // The takeover fires once per session
  var heatSeen = {};       // Group -> already announced as heating up

  var TOAST_MS = 4200;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function reduced() {
    return window.Motion ? Motion.isReduced() : false;
  }

  function toast(text, tone) {
    if (!toastsEl) return;

    var node = el("div", "toast", text);
    node.setAttribute("data-tone", tone || "info");
    toastsEl.appendChild(node);

    // Never let a long hunt stack a column of toasts off the top of the
    // screen; the oldest one is always the least interesting.
    while (toastsEl.children.length > 4) {
      toastsEl.removeChild(toastsEl.firstChild);
    }

    if (reduced() || !window.Motion) {
      node.style.opacity = "1";
      node.style.transform = "none";
    } else {
      Motion.gsap.fromTo(node,
        { autoAlpha: 0, x: 24, scale: 0.96 },
        { autoAlpha: 1, x: 0, scale: 1, duration: Motion.DUR.mid,
          ease: "ease-reveal" });
    }

    window.setTimeout(function () {
      if (!node.parentNode) return;
      if (reduced() || !window.Motion) {
        node.parentNode.removeChild(node);
        return;
      }
      Motion.gsap.to(node, {
        autoAlpha: 0, x: 16, duration: Motion.DUR.fast,
        onComplete: function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }
      });
    }, TOAST_MS);
  }

  function toneFor(kind) {
    if (kind === "ditemukan") return "win";
    if (kind === "hilang" || kind === "beacon-hening") return "warn";
    if (kind === "panas") return "hot";
    return "info";
  }

  function who(grup) {
    return window.Roster ? Roster.label(grup)
                         : I18N.t("card.group") + " " + grup;
  }

  function textFor(ev) {
    switch (ev.kind) {
      case "bergabung": return I18N.t("toast.bergabung", ev.grup);
      case "hilang": return I18N.t("toast.hilang", ev.grup);
      case "kembali": return I18N.t("toast.kembali", ev.grup);
      case "ditemukan": return I18N.t("toast.ditemukan", ev.grup);
      case "mulai": return I18N.t("toast.mulai");
      case "reset": return I18N.t("toast.reset");
      case "beacon-hening": return I18N.t("toast.beaconHening");
      case "panas": return I18N.t("toast.panas", ev.grup);
      case "kalibrasi": return I18N.t("toast.kalibrasi", ev.grup);
      default: return null;
    }
  }

  function onEvents(list) {
    for (var i = 0; i < list.length; i++) {
      var text = textFor(list[i]);
      if (text) toast(text, toneFor(list[i].kind));
    }
  }

  function showFound(grup, seconds) {
    if (shown) return;
    shown = true;

    foundEl.textContent = "";
    foundEl.style.setProperty("--hue", "var(--group-" + grup + ")");

    var inner = el("div", "found__inner");
    inner.appendChild(el("p", "found__eyebrow", I18N.t("found.title")));

    // The roster name if the assistant entered one, the number otherwise.
    var name = el("h2", "found__name", window.Roster ? Roster.label(grup)
                  : I18N.t("found.by") + " " + grup);
    inner.appendChild(name);

    var members = window.Roster ? Roster.names(grup) : [];
    if (members.length) {
      inner.appendChild(el("p", "found__members", members.join(" · ")));
    }

    inner.appendChild(el("p", "found__time",
                         I18N.t("found.in") + " " + formatClock(seconds)));

    var dismiss = el("button", "btn btn--ghost found__close", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Tutup");
    dismiss.addEventListener("click", hideFound);
    inner.appendChild(dismiss);

    foundEl.appendChild(inner);
    foundEl.hidden = false;

    if (window.Cosmos) Cosmos.warpTo("found");

    if (reduced() || !window.Motion) {
      foundEl.style.opacity = "1";
      return;
    }

    var tl = Motion.gsap.timeline();
    tl.fromTo(foundEl, { autoAlpha: 0 },
              { autoAlpha: 1, duration: Motion.DUR.mid });
    tl.fromTo(inner, { scale: 0.9, y: 18 },
              { scale: 1, y: 0, duration: Motion.DUR.slow, ease: "ease-out-expo" },
              "<");
    tl.fromTo(name, { letterSpacing: "0.4em", autoAlpha: 0 },
              { letterSpacing: "0em", autoAlpha: 1, duration: Motion.DUR.slow,
                ease: "ease-reveal" }, "-=0.35");

    if (fire) {
      fire({ particleCount: 140, spread: 78, origin: { y: 0.55 },
             disableForReducedMotion: true });
      window.setTimeout(function () {
        fire({ particleCount: 90, spread: 110, origin: { y: 0.6 },
               disableForReducedMotion: true });
      }, 320);
    }
  }

  function hideFound() {
    if (!window.Motion || reduced()) {
      foundEl.hidden = true;
      return;
    }
    Motion.gsap.to(foundEl, {
      autoAlpha: 0, duration: Motion.DUR.mid,
      onComplete: function () { foundEl.hidden = true; }
    });
  }

  function formatClock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function render(state) {
    if (!state) return;

    // A session reset clears the takeover so the next hunt can fire it again.
    if (state.ditemukan === null && shown) {
      shown = false;
      heatSeen = {};
      foundEl.hidden = true;
    }

    if (state.ditemukan !== null && !shown) {
      showFound(state.ditemukan, state.berjalan);
    }

    // "Heating up" is a client-side observation rather than a server event,
    // because it is about the drama of the race rather than about state.
    var rows = state.grup || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.online) continue;
      if (row.heat === "membara" && !heatSeen[row.grup]) {
        heatSeen[row.grup] = true;
        toast(I18N.t("toast.panas", row.grup), "hot");
      } else if (row.heat !== "membara" && row.heat !== "panas") {
        heatSeen[row.grup] = false;
      }
    }
  }

  function mount() {
    toastsEl = document.getElementById("toasts");
    foundEl = document.getElementById("found-overlay");
    confettiCanvas = document.getElementById("confetti");

    if (window.confetti && confettiCanvas) {
      fire = window.confetti.create(confettiCanvas, {
        resize: true, useWorker: true
      });
    }

    Store.onEvents(onEvents);
  }

  window.UINotify = { mount: mount, render: render, toast: toast };
})();
