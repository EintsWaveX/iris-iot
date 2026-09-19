/**
 * Perburuan LoRa IRIS - the login screen.
 *
 * The first thing a phone sees. Everything downstream - your own distance,
 * the claim button, who the assistant is ruling on - depends on this one
 * answer being right.
 *
 * It used to be a grid of coloured tiles: tap the one you think you are.
 * That put the answer in the hands of whoever tapped, and a phone that
 * tapped wrong spent the afternoon watching a group it was not in. Now a
 * practitioner types their student ID and the server says which group
 * that is, from the list the assistant typed in this morning. The
 * confirmation modal survives the change - it now confirms a real record
 * rather than a guess, showing the name the roster has against that ID.
 *
 * An ID that does not resolve is refused. There is deliberately no manual
 * fallback to picking a group: a fallback would re-open exactly the hole
 * this screen was rebuilt to close.
 *
 * window.UIOnboard = { mount, render, show, hide }
 */
(function () {
  "use strict";

  var rootEl = null;
  var formEl = null;
  var inputEl = null;
  var errorEl = null;
  var noteEl = null;
  var busy = false;
  var pending = null;   // resolver waiting on the server's "masuk" reply

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
  }

  /**
   * Say the server's refusal in the language the page is in.
   *
   * The server has no idea which language this phone is showing, so it
   * sends a stable code beside its Indonesian sentence. Anything without a
   * translation falls back to that sentence, which is still better than a
   * blank.
   */
  function reason(reply) {
    var kode = reply && reply.kode;
    if (kode) {
      var key = "login.err." + kode;
      var text = I18N.t(key);
      if (text !== key) return text;
    }
    return (reply && reply.alasan) || I18N.t("login.unknown");
  }

  /**
   * Ask the server. Resolves with the reply, or with a synthetic failure
   * when the socket is down or the answer never comes - a phone on a weak
   * hotspot must get a sentence, not a spinner that never stops.
   */
  function askServer(nim) {
    return new Promise(function (resolve) {
      var done = function (reply) {
        if (pending !== done) return;
        pending = null;
        window.clearTimeout(timer);
        resolve(reply);
      };
      var timer = window.setTimeout(function () {
        done({ ok: false, alasan: I18N.t("login.timeout") });
      }, 6000);

      pending = done;
      if (!Store.masuk(nim)) {
        done({ ok: false, alasan: I18N.t("login.offline") });
      }
    });
  }

  /** The confirmation step. Resolves true if the person owned up to it. */
  function confirm(nim, reply) {
    var body = el("div", "confirmgroup");

    var badge = el("div", "confirmgroup__badge", String(reply.grup));
    badge.style.setProperty("--hue", "var(--group-" + reply.grup + ")");
    body.appendChild(badge);

    // textContent, never innerHTML: these strings were typed by an
    // assistant into a form and go straight onto a projector.
    if (reply.nama) {
      body.appendChild(el("p", "confirmgroup__you", reply.nama));
    }

    // The person's own name is already the headline above, so listing it
    // again underneath just reads as a stutter. What is worth showing is
    // who else is in the group - that is what actually confirms the ID
    // landed on the right row.
    var names = window.Roster ? Roster.names(reply.grup) : [];
    var others = [];
    for (var i = 0; i < names.length; i++) {
      if (!reply.nama || names[i] !== reply.nama) others.push(names[i]);
    }
    if (others.length) {
      body.appendChild(el("p", "confirmgroup__with", I18N.t("login.with")));
      var list = el("ul", "confirmgroup__names");
      for (var j = 0; j < others.length; j++) {
        list.appendChild(el("li", "confirmgroup__name", others[j]));
      }
      body.appendChild(list);
    }

    var label = window.Roster ? Roster.label(reply.grup)
                              : I18N.t("card.group") + " " + reply.grup;

    return Modal.open({
      title: label,
      lede: I18N.t("login.confirmLede"),
      body: body,
      hue: "var(--group-" + reply.grup + ")",
      actions: [
        { label: I18N.t("login.deny"), value: false },
        { label: I18N.t("login.affirm"), value: true,
          kind: "btn--confirm", primary: true }
      ]
    }).then(function (answer) { return answer === true; });
  }

  function submit() {
    if (busy) return;
    var raw = (inputEl.value || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(raw)) {
      setError(I18N.t("login.badFormat"));
      inputEl.focus();
      return;
    }

    busy = true;
    setError("");
    rootEl.setAttribute("data-busy", "1");

    askServer(raw).then(function (reply) {
      rootEl.removeAttribute("data-busy");
      if (!reply || reply.ok !== true) {
        busy = false;
        setError(reason(reply));
        inputEl.select();
        return;
      }
      return confirm(raw, reply).then(function (yes) {
        busy = false;
        if (!yes) {
          setError("");
          inputEl.select();
          return;
        }
        Identity.accept(raw, reply);
        hide();
        if (window.UINotify) {
          UINotify.toast(I18N.t("login.welcome", reply.grup), "info");
        }
      });
    });
  }

  function renderNote() {
    if (!noteEl) return;
    // Before any session is running there is nobody to look up, and saying
    // so is kinder than letting every ID come back "not registered".
    var state = Store.getState();
    var running = state && state.sesi;
    noteEl.textContent = running ? I18N.t("login.session", running)
                                 : I18N.t("login.noSession");
    noteEl.setAttribute("data-idle", running ? "no" : "yes");
  }

  function show() {
    if (rootEl.hidden) {
      rootEl.hidden = false;
      document.body.setAttribute("data-onboarding", "1");
      // A session rollover puts this screen back up with the previous
      // session's ID still sitting in the field, which reads as "this is
      // you" and earns a refusal on the first tap. Start empty.
      if (inputEl) inputEl.value = "";
      setError("");
    }
    renderNote();
  }

  function hide() {
    rootEl.hidden = true;
    document.body.removeAttribute("data-onboarding");
  }

  function needed() {
    // The projector never logs in, and neither does an assistant who has
    // already unlocked the tools.
    if (window.Stage && Stage.active()) return false;
    if (Identity.isAssistant()) return false;
    if (document.body.getAttribute("data-watching") === "1") return false;
    return Identity.group() === null;
  }

  function render() {
    if (!rootEl) return;
    if (needed()) show();
    else hide();
  }

  /**
   * A phone that arrived from the main site's dashboard already typed its
   * NIM once, to sign into web/. Reading it back out of the URL here saves
   * a second identical prompt without changing the trust model one bit -
   * this still goes through the exact same server round trip and the same
   * "is this you" confirmation screen as typing it by hand; the URL only
   * fills the box.
   */
  function readAutoNim() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = (params.get("nim") || "").replace(/\s+/g, "").toUpperCase();
      return /^[A-Z0-9]{4,20}$/.test(raw) ? raw : null;
    } catch (err) {
      return null;
    }
  }

  function mount() {
    rootEl = document.getElementById("onboard");
    formEl = document.getElementById("login-form");
    inputEl = document.getElementById("login-nim");
    errorEl = document.getElementById("login-error");
    noteEl = document.getElementById("login-note");

    if (formEl) {
      formEl.addEventListener("submit", function (ev) {
        ev.preventDefault();
        submit();
      });
    }
    if (inputEl) {
      inputEl.addEventListener("input", function () { setError(""); });
    }

    var autoNim = readAutoNim();
    if (autoNim) {
      // Scrub it from the address bar immediately: a NIM sitting in the URL
      // survives in browser history and can end up in a screenshot of the
      // address bar, neither of which typing it into a form does.
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete("nim");
        window.history.replaceState(null, "", url.toString());
      } catch (err) { /* URL/history unavailable; harmless to skip */ }

      if (inputEl) inputEl.value = autoNim;

      var tried = false;
      var tryAuto = function () {
        if (tried || Store.status() !== "live" || !needed()) return;
        tried = true;
        submit();
      };
      Store.onStatus(tryAuto);
      tryAuto();
    }

    var skip = document.getElementById("onboard-skip");
    if (skip) {
      skip.addEventListener("click", function () {
        // Watching without joining is legitimate: a spare laptop, or an
        // assistant who has not typed the token yet. The flag is what
        // stops render() from putting the screen straight back up.
        document.body.setAttribute("data-watching", "1");
        hide();
      });
    }

    Store.onReply(function (msg) {
      if (msg.tipe === "masuk" && pending) pending(msg);
    });

    I18N.onChange(function () { if (!rootEl.hidden) renderNote(); });
  }

  window.UIOnboard = { mount: mount, render: render, show: show, hide: hide };
})();
