/**
 * Perburuan LoRa IRIS - app shell.
 *
 * Wires the screens to the store, owns the router, and drives the connection
 * chip. Deliberately thin: everything that draws lives in a ui-* module and
 * everything that knows about the network lives in store.js.
 *
 * window.App = { show }
 */
(function () {
  "use strict";

  var screens = {};
  var navLinks = [];
  var current = "hunt";
  var linkState = null;

  function show(name) {
    if (!screens[name] || name === current) return;

    screens[current].classList.remove("is-active");
    screens[name].classList.add("is-active");
    current = name;

    for (var i = 0; i < navLinks.length; i++) {
      var on = navLinks[i].getAttribute("data-screen") === name;
      navLinks[i].classList.toggle("is-active", on);
      if (on) {
        navLinks[i].setAttribute("aria-current", "page");
      } else {
        navLinks[i].removeAttribute("aria-current");
      }
    }

    if (window.Cosmos) Cosmos.warpTo(name);
    render(Store.getState());
  }

  function render(state) {
    if (!state) return;

    // The roster rides a revision counter rather than the frame, so this
    // has to run before anything that renders a group name.
    if (window.Roster) Roster.sync(state);
    watchSession(state);

    if (window.Stage && Stage.active()) {
      // A scoreboard that blanks itself mid-session is the same failure a
      // sleeping phone is, on a bigger screen. It never ticks: it has no
      // distance of its own to tick about.
      if (window.Sense) Sense.keepAwake(true);
      Stage.render(state);
      UINotify.render(state);
      return;
    }

    if (window.UIOnboard) UIOnboard.render(state);

    // Outside the per-screen dispatch on purpose: the eyes-free channels
    // follow the field, not whichever tab happens to be open.
    UIHunt.follow(state);

    if (current === "hunt") UIHunt.render(state);
    if (current === "layers") UILayers.render(state);
    if (current === "awards" && window.UIAwards) UIAwards.render(state);
    if (current === "assist" && window.UIAssistant) UIAssistant.render(state);
    UINotify.render(state);
  }

  /** The assistant tab is hidden until the token unlocks it. */
  function syncRole() {
    var unlocked = Identity.isAssistant();
    for (var i = 0; i < navLinks.length; i++) {
      if (navLinks[i].classList.contains("nav-link--assist")) {
        navLinks[i].hidden = !unlocked;
      }
    }
    if (!unlocked && current === "assist") show("hunt");

    // Lets the stylesheet reorder the hunt screen for somebody who has
    // joined a group: on a phone their own distance has to be the first
    // thing on screen, not four lines of explanation below the fold.
    document.body.setAttribute("data-mine",
                               Identity.group() === null ? "0" : "1");

    // Session controls now need the token, so leaving them on the public
    // board would only offer students a button that refuses them.
    var hudAction = document.querySelector(".hud__cell--action");
    if (hudAction) hudAction.hidden = !unlocked;

    var chip = document.getElementById("whoami");
    var label = document.getElementById("whoami-label");
    if (!chip || !label) return;

    var grup = Identity.group();
    if (unlocked) {
      chip.hidden = false;
      chip.setAttribute("data-role", "asisten");
      chip.style.removeProperty("--hue");
      label.textContent = I18N.t("nav.assist");
    } else if (grup !== null) {
      chip.hidden = false;
      chip.setAttribute("data-role", "anggota");
      chip.style.setProperty("--hue", "var(--group-" + grup + ")");
      label.textContent = window.Roster ? Roster.label(grup)
                                        : I18N.t("card.group") + " " + grup;
      chip.title = Identity.nama() || "";
    } else {
      chip.hidden = true;
    }
  }

  /**
   * Three taps on the brand mark opens the token prompt. Deliberately
   * undiscoverable rather than secret: it keeps a "sign in" affordance off
   * a screen that is mostly looked at by students, without pretending the
   * gesture itself is a security measure.
   */
  function mountTokenGesture() {
    var brand = document.querySelector(".nav__brand");
    if (!brand) return;
    var taps = 0;
    var timer = 0;

    brand.addEventListener("click", function () {
      taps += 1;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { taps = 0; }, 900);
      if (taps >= 3) {
        taps = 0;
        if (window.UIAssistant) UIAssistant.askToken();
      }
    });
  }

  function mountWhoami() {
    var chip = document.getElementById("whoami");
    if (!chip) return;
    chip.addEventListener("click", function () {
      if (Identity.isAssistant()) { show("assist"); return; }
      // Signing out mid-hunt is disruptive, so it asks.
      Modal.open({
        title: I18N.t("whoami.title"),
        lede: I18N.t("whoami.lede"),
        body: Modal.el("p", "modal__note", I18N.t("whoami.note")),
        actions: [
          { label: I18N.t("whoami.stay"), value: null, primary: true },
          { label: I18N.t("whoami.switch"), value: "switch" }
        ]
      }).then(function (answer) {
        if (answer !== "switch") return;
        document.body.removeAttribute("data-watching");
        if (window.Sense) Sense.stop();
        Identity.clear();
        if (window.UIOnboard) UIOnboard.show();
      });
    });
  }

  /**
   * A session rollover logs every phone out, and it does so from the
   * broadcast frame alone - no push message, no reconnect required.
   *
   * The frame says which session is running. A phone that logged in under
   * a different one is, by definition, not in the session on the field
   * any more: its student ID belongs to the morning group and the names
   * on screen belong to the afternoon one. Rather than let it sit there
   * showing a stale group, it drops its identity and goes back to the
   * login screen, where the new session either recognises the ID or says
   * plainly that it does not.
   */
  function watchSession(state) {
    if (Identity.isAssistant()) return;
    var mine = Identity.session();
    if (mine === null || typeof mine === "undefined") return;
    if (state.sesi === mine) return;

    if (window.Sense) Sense.stop();
    Identity.clear();
    document.body.removeAttribute("data-watching");
    if (window.UIOnboard) UIOnboard.show();
    if (window.UINotify) UINotify.toast(I18N.t("login.rolled"), "warn");
  }

  function setLinkState(status) {
    if (!linkState) return;
    linkState.setAttribute("data-status", status);
    var label = linkState.querySelector(".link-state__value");
    if (label) {
      label.setAttribute("data-i18n", "status." + status);
      label.textContent = I18N.t("status." + status);
    }
  }

  function mountLangToggle() {
    var toggle = document.getElementById("lang-toggle");
    if (!toggle) return;

    function paint() {
      var opts = toggle.querySelectorAll(".lang-toggle__opt");
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle(
          "is-on", opts[i].getAttribute("data-lang") === I18N.lang());
      }
    }

    toggle.addEventListener("click", function () {
      I18N.set(I18N.lang() === "id" ? "en" : "id");
    });

    I18N.onChange(function () {
      paint();
      setLinkState(Store.status());
      render(Store.getState());
    });

    paint();
  }

  function init() {
    document.documentElement.setAttribute("lang", I18N.lang());
    I18N.apply();

    screens.hunt = document.getElementById("screen-hunt");
    screens.layers = document.getElementById("screen-layers");
    screens.awards = document.getElementById("screen-awards");
    screens.assist = document.getElementById("screen-assist");
    linkState = document.getElementById("link-state");

    var links = document.querySelectorAll("[data-screen]");
    for (var i = 0; i < links.length; i++) {
      navLinks.push(links[i]);
      (function (node) {
        node.addEventListener("click", function () {
          show(node.getAttribute("data-screen"));
        });
      })(links[i]);
    }

    Identity.hydrate();
    Modal.mount();

    UIHunt.mount();
    UILayers.mount();
    UINotify.mount();
    UIClaim.mount();
    UIAwards.mount();
    UIAssistant.mount();
    UIOnboard.mount();
    if (window.Sense) Sense.mount();
    if (window.Stage) Stage.mount();

    mountLangToggle();
    mountTokenGesture();
    mountWhoami();

    Identity.onChange(syncRole);
    if (window.Roster) Roster.onChange(syncRole);
    I18N.onChange(syncRole);
    syncRole();

    Store.onStatus(setLinkState);
    Store.subscribe(render);
    Store.init();

    // The roster is fetched once up front so the confirmation modal can
    // show group-mates on the very first paint, not one frame later.
    if (window.Roster) Roster.refresh();

    // The login screen must appear before any frame arrives. It used to be
    // driven only from render(), which returns early without state - so a
    // phone that opened the page before the hunter connected saw an empty
    // board and no way in.
    if (window.UIOnboard) UIOnboard.render();
  }

  window.App = { show: show, syncRole: syncRole };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
