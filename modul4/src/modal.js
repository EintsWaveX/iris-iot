/**
 * Perburuan LoRa IRIS - the modal primitive.
 *
 * There was no interactive dialog anywhere in this project before. The one
 * overlay that existed, #found-overlay, is a celebration: it has no focus
 * trap, no Escape, no backdrop dismiss, and nothing it can return. Every
 * new flow here - confirming which group you are, sending a photo, ruling
 * on a claim - is a question that needs an answer, so it needs a real one.
 *
 * Deliberately not <dialog>. showModal() puts the element in the top layer,
 * which sits above everything including the cosmos canvas, and Safari's
 * backdrop handling on iOS 15 is inconsistent enough to be a risk on the
 * exact devices this has to work on. A plain div with the focus rules
 * written out is boring and predictable.
 *
 * window.Modal = { open, close, isOpen }
 */
(function () {
  "use strict";

  var host = null;
  var current = null;
  var lastFocus = null;

  var FOCUSABLE = [
    "a[href]", "button:not([disabled])", "input:not([disabled])",
    "select:not([disabled])", "textarea:not([disabled])", "[tabindex]"
  ].join(",");

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function focusables() {
    if (!current) return [];
    var found = current.panel.querySelectorAll(FOCUSABLE);
    var live = [];
    for (var i = 0; i < found.length; i++) {
      if (found[i].getAttribute("tabindex") !== "-1" && found[i].offsetParent !== null) {
        live.push(found[i]);
      }
    }
    return live;
  }

  function onKey(ev) {
    if (!current) return;

    if (ev.key === "Escape" && current.dismissable) {
      ev.preventDefault();
      close(null);
      return;
    }

    if (ev.key !== "Tab") return;

    // Keep Tab inside the dialog. Without this the focus ring walks off
    // into the board behind and a keyboard user is simply lost.
    var list = focusables();
    if (!list.length) {
      ev.preventDefault();
      return;
    }
    var first = list[0];
    var last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  /**
   * open({ title, body, actions, dismissable, tone, hue }) -> Promise
   *
   * `body` is a DOM node, built by the caller. `actions` is a list of
   * { label, value, kind, primary }. The promise settles with the chosen
   * action's `value`, or null if it was dismissed.
   */
  function open(spec) {
    if (current) close(null);

    lastFocus = document.activeElement;

    var root = el("div", "modal");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    if (spec.tone) root.setAttribute("data-tone", spec.tone);
    if (spec.hue) root.style.setProperty("--hue", spec.hue);

    var scrim = el("div", "modal__scrim");
    var panel = el("div", "modal__panel");

    var titleId = "modal-title-" + Math.random().toString(36).slice(2, 8);
    var heading = el("h2", "modal__title", spec.title || "");
    heading.id = titleId;
    root.setAttribute("aria-labelledby", titleId);
    panel.appendChild(heading);

    if (spec.lede) panel.appendChild(el("p", "modal__lede", spec.lede));

    var bodyWrap = el("div", "modal__body");
    if (spec.body) bodyWrap.appendChild(spec.body);
    panel.appendChild(bodyWrap);

    var foot = el("div", "modal__actions");
    panel.appendChild(foot);

    root.appendChild(scrim);
    root.appendChild(panel);
    host.appendChild(root);
    host.hidden = false;

    var settle = null;
    var promise = new Promise(function (resolve) { settle = resolve; });

    current = {
      root: root, panel: panel, foot: foot, settle: settle,
      dismissable: spec.dismissable !== false
    };

    (spec.actions || []).forEach(function (action) {
      var btn = el("button", "btn " + (action.kind || "btn--ghost"), action.label);
      btn.type = "button";
      if (action.primary) btn.setAttribute("data-primary", "yes");
      btn.addEventListener("click", function () { close(action.value); });
      foot.appendChild(btn);
    });

    if (current.dismissable) {
      scrim.addEventListener("click", function () { close(null); });
    }
    document.addEventListener("keydown", onKey, true);

    if (window.Motion && !Motion.isReduced()) {
      Motion.gsap.fromTo(panel, { autoAlpha: 0, y: 18, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: Motion.DUR.mid,
          ease: "ease-out-expo" });
      Motion.gsap.fromTo(scrim, { autoAlpha: 0 },
        { autoAlpha: 1, duration: Motion.DUR.fast });
    }

    // Focus the primary action if there is one, else the panel, so a
    // screen reader lands inside the dialog rather than behind it.
    var wanted = panel.querySelector("[data-primary=yes]") ||
                 panel.querySelector("input, textarea, select") ||
                 focusables()[0] || panel;
    if (wanted === panel) panel.setAttribute("tabindex", "-1");
    window.setTimeout(function () { try { wanted.focus(); } catch (e) {} }, 40);

    return promise;
  }

  function close(value) {
    if (!current) return;
    var dying = current;
    current = null;
    document.removeEventListener("keydown", onKey, true);

    function finish() {
      if (dying.root.parentNode) dying.root.parentNode.removeChild(dying.root);
      if (host && !host.children.length) host.hidden = true;
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus(); } catch (e) {}
      }
      dying.settle(value);
    }

    if (window.Motion && !Motion.isReduced()) {
      Motion.gsap.to(dying.root, {
        autoAlpha: 0, duration: Motion.DUR.fast, onComplete: finish
      });
    } else {
      finish();
    }
  }

  function mount() {
    host = document.getElementById("modals");
  }

  window.Modal = {
    mount: mount,
    open: open,
    close: close,
    isOpen: function () { return current !== null; },
    el: el
  };
})();
