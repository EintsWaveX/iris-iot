/**
 * Perburuan LoRa IRIS - the assistant's console.
 *
 * Three jobs, in the order they matter during a session: rule on claims,
 * keep the day's schedule, and hold the controls that used to sit on the
 * public board where any phone could press them.
 *
 * The review queue is the point of the whole feature. An assistant sitting
 * in the practicum room decides whether a group outside really has the
 * beacon, from a photograph, in claim order.
 *
 * The schedule editor is the second point. Four sessions a day, each with
 * its own students, typed once in the morning. The previous version gave
 * each group a single comma-joined text field, which on a phone showed
 * "Alya Rahmawati, Bagus Prasetyo, Citra Dewi Lest..." with the rest
 * unreachable - unusable for seven groups, let alone twenty-eight. This
 * one takes a paste straight out of a spreadsheet, parses it in front of
 * you, and only then lets you save.
 *
 * Nothing here is reachable without the token.
 *
 * window.UIAssistant = { mount, render, askToken }
 */
(function () {
  "use strict";

  var screenEl = null;
  var lockedEl = null;
  var toolsEl = null;
  var queueEl = null;
  var queueEmptyEl = null;
  var dayEl = null;
  var expiryEl = null;

  // The server's copy of the plan, including the student IDs that never
  // ride the broadcast frame. Requested once on unlock and after each save.
  var jadwal = null;
  var typing = false;    // a textarea has focus; do not rebuild under it
  var drafts = {};       // session id -> unsaved paste text

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mmss(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  // ------------------------------------------------------------ token in

  function askToken() {
    var body = el("div", "tokenform");
    var input = document.createElement("input");
    input.type = "text";
    input.className = "tokenform__input";
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("inputmode", "text");
    input.maxLength = 12;
    input.placeholder = "K J 7 R Q 4";
    body.appendChild(input);
    body.appendChild(el("p", "tokenform__hint", I18N.t("token.hint")));

    return Modal.open({
      title: I18N.t("token.title"),
      lede: I18N.t("token.lede"),
      body: body,
      actions: [
        { label: I18N.t("token.cancel"), value: null },
        { label: I18N.t("token.enter"), value: "go",
          kind: "btn--confirm", primary: true }
      ]
    }).then(function (answer) {
      if (answer !== "go") return false;
      var value = (input.value || "").replace(/\s+/g, "").toUpperCase();
      if (!value) return false;
      Identity.setToken(value);
      return true;
    });
  }

  // ------------------------------------------------------------- queue

  function reviewPhoto(url, grup) {
    var body = el("div", "shot");
    var img = new Image();
    img.className = "shot__img";
    img.alt = "";
    img.src = url;
    body.appendChild(img);
    return Modal.open({
      title: I18N.t("card.group") + " " + grup,
      body: body,
      hue: "var(--group-" + grup + ")",
      actions: [{ label: I18N.t("assist.close"), value: null, primary: true }]
    });
  }

  function askReject(grup) {
    var body = el("div", "rejectform");
    var input = document.createElement("input");
    input.type = "text";
    input.className = "rejectform__input";
    input.maxLength = 120;
    input.placeholder = I18N.t("assist.reasonHint");
    body.appendChild(input);

    var quick = el("div", "rejectform__quick");
    ["assist.reasonWrong", "assist.reasonFar", "assist.reasonUnclear"]
      .forEach(function (key) {
        var b = el("button", "chip", I18N.t(key));
        b.type = "button";
        b.addEventListener("click", function () { input.value = I18N.t(key); });
        quick.appendChild(b);
      });
    body.appendChild(quick);

    return Modal.open({
      title: I18N.t("assist.rejectTitle"),
      lede: I18N.t("assist.rejectLede", grup),
      body: body,
      hue: "var(--group-" + grup + ")",
      actions: [
        { label: I18N.t("assist.cancel"), value: null },
        { label: I18N.t("assist.reject"), value: "go", primary: true }
      ]
    }).then(function (answer) {
      if (answer !== "go") return;
      Store.reject(grup, input.value || "");
    });
  }

  function buildQueue(state) {
    var rows = (state && state.antrian) || [];
    queueEl.textContent = "";
    queueEmptyEl.hidden = rows.length > 0;

    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        var card = el("article", "review");
        card.style.setProperty("--hue", "var(--group-" + row.grup + ")");

        var head = el("div", "review__head");
        head.appendChild(el("span", "review__ord", "#" + row.urut));
        head.appendChild(el("h3", "review__name", Roster.label(row.grup)));
        head.appendChild(el("span", "review__age",
                            I18N.t("assist.waiting", mmss(row.sejak))));
        card.appendChild(head);

        var meta = el("p", "review__meta",
          I18N.t("assist.atClaim") + ": " + I18N.jarak(row.jarak_m) +
          "  ·  " + (row.rssi === null ? "—" : row.rssi + " dBm") +
          "  ·  " + I18N.t("assist.attempt", row.klaim_ke));
        card.appendChild(meta);

        var names = Roster.names(row.grup);
        if (names.length) {
          card.appendChild(el("p", "review__names", names.join(" · ")));
        }

        if (row.foto_url) {
          var shot = el("button", "review__shot");
          shot.type = "button";
          var img = new Image();
          img.alt = "";
          img.loading = "lazy";
          img.src = row.foto_url;
          shot.appendChild(img);
          shot.addEventListener("click", function () {
            reviewPhoto(row.foto_url, row.grup);
          });
          card.appendChild(shot);
        } else {
          card.appendChild(el("p", "review__nophoto", I18N.t("assist.noPhoto")));
        }

        var act = el("div", "review__actions");
        var no = el("button", "btn btn--ghost", I18N.t("assist.reject"));
        no.type = "button";
        no.addEventListener("click", function () { askReject(row.grup); });

        var yes = el("button", "btn btn--confirm", I18N.t("assist.approve"));
        yes.type = "button";
        yes.addEventListener("click", function () {
          Modal.open({
            title: I18N.t("assist.approveTitle"),
            lede: I18N.t("assist.approveLede", row.grup),
            body: el("p", "modal__note", I18N.t("assist.approveNote")),
            hue: "var(--group-" + row.grup + ")",
            actions: [
              { label: I18N.t("assist.cancel"), value: null },
              { label: I18N.t("assist.approve"), value: "go",
                kind: "btn--confirm", primary: true }
            ]
          }).then(function (a) {
            if (a === "go") Store.confirmFind(row.grup);
          });
        });

        act.appendChild(no);
        act.appendChild(yes);
        card.appendChild(act);
        queueEl.appendChild(card);
      })(rows[i]);
    }
  }

  // -------------------------------------------------------- paste parser

  /**
   * Turn a pasted block into {regu, jumlah, galat}.
   *
   * A line beginning with "#" opens a group: "#3" or "#3 Kelompok Gamma".
   * Every other non-blank line is one member, "NIM<sep>Name", where the
   * separator is a comma, a semicolon, a tab, or the first whitespace run
   * after the ID. Accepting all four matters: a spreadsheet paste arrives
   * tab-separated, a CSV export comma-separated, and a human types a space.
   *
   * Errors are collected rather than thrown, so the assistant sees every
   * bad line at once instead of fixing them one reload at a time.
   */
  function parsePaste(text) {
    var regu = {};
    var galat = [];
    var jumlah = 0;
    var current = null;
    var seen = {};
    var lines = String(text || "").split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var head = /^#\s*(\d{1,2})\s*(.*)$/.exec(line);
      if (head) {
        current = String(parseInt(head[1], 10));
        if (!regu[current]) {
          regu[current] = { nama: head[2].trim(), aktif: true, anggota: [] };
        } else if (head[2].trim()) {
          regu[current].nama = head[2].trim();
        }
        continue;
      }

      if (current === null) {
        galat.push(I18N.t("paste.noGroup", i + 1));
        continue;
      }

      var m = /^([A-Za-z0-9]{4,20})\s*(?:[,;\t]|\s)\s*(.+)$/.exec(line);
      if (!m) {
        // A bare ID with no name is still a member; anything else is not.
        if (/^[A-Za-z0-9]{4,20}$/.test(line)) {
          m = [line, line, ""];
        } else {
          galat.push(I18N.t("paste.badLine", i + 1));
          continue;
        }
      }

      var nim = m[1].toUpperCase();
      if (seen[nim]) {
        galat.push(I18N.t("paste.dupNim", nim));
        continue;
      }
      seen[nim] = true;
      regu[current].anggota.push({ nim: nim, nama: m[2].trim().slice(0, 40) });
      jumlah += 1;
    }

    return { regu: regu, jumlah: jumlah, galat: galat };
  }

  /** Render a saved session back into the paste format, so it round-trips. */
  function toPaste(entry) {
    var out = [];
    var keys = Object.keys(entry.regu || {}).sort(function (a, b) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
    for (var i = 0; i < keys.length; i++) {
      var g = entry.regu[keys[i]];
      out.push("#" + keys[i] + (g.nama ? " " + g.nama : ""));
      for (var j = 0; j < (g.anggota || []).length; j++) {
        var a = g.anggota[j];
        out.push(a.nim + (a.nama ? ", " + a.nama : ""));
      }
      out.push("");
    }
    return out.join("\n").trim();
  }

  // ---------------------------------------------------------- day editor

  function sessionPanel(entry) {
    var panel = el("section", "sesi");
    var running = jadwal && jadwal.aktif === entry.id;
    panel.setAttribute("data-running", running ? "yes" : "no");

    var head = el("div", "sesi__head");
    head.appendChild(el("span", "sesi__num", I18N.t("assist.sesiN", entry.id)));

    var jam = document.createElement("input");
    jam.type = "time";
    jam.className = "sesi__jam";
    jam.value = entry.mulai;
    // Chromium formats a time input from the element's own lang, and the
    // practicum schedule is written 06:30, never 6:30 AM.
    jam.setAttribute("lang", "en-GB");
    jam.setAttribute("aria-label", I18N.t("assist.startTime"));
    head.appendChild(jam);

    var badge = el("span", "sesi__state");
    if (running) {
      var sisa = jadwal.sisa;
      badge.textContent = sisa === null || sisa === undefined
        ? I18N.t("assist.running")
        : I18N.t("assist.runningLeft", mmss(sisa));
      badge.setAttribute("data-on", "yes");
    } else {
      badge.textContent = I18N.t("assist.ready");
    }
    head.appendChild(badge);
    panel.appendChild(head);

    var area = document.createElement("textarea");
    area.className = "sesi__paste";
    area.rows = 6;
    area.spellcheck = false;
    area.setAttribute("autocapitalize", "off");
    area.placeholder = I18N.t("assist.pasteHint");
    area.value = Object.prototype.hasOwnProperty.call(drafts, entry.id)
      ? drafts[entry.id]
      : toPaste(entry);

    var tally = el("p", "sesi__tally");
    var errors = el("ul", "sesi__errors");

    function repaint() {
      var parsed = parsePaste(area.value);
      var groups = Object.keys(parsed.regu).length;
      tally.textContent = I18N.t("assist.tally", groups, parsed.jumlah,
                                 parsed.galat.length);
      tally.setAttribute("data-bad", parsed.galat.length ? "yes" : "no");
      errors.textContent = "";
      for (var i = 0; i < parsed.galat.length; i++) {
        errors.appendChild(el("li", "sesi__error", parsed.galat[i]));
      }
      return parsed;
    }

    area.addEventListener("focus", function () { typing = true; });
    area.addEventListener("blur", function () { typing = false; });
    area.addEventListener("input", function () {
      drafts[entry.id] = area.value;
      repaint();
    });

    panel.appendChild(area);
    panel.appendChild(tally);
    panel.appendChild(errors);

    var row = el("div", "sesi__actions");

    var save = el("button", "btn btn--confirm", I18N.t("assist.save"));
    save.type = "button";
    save.addEventListener("click", function () {
      var parsed = repaint();
      if (parsed.galat.length) {
        if (window.UINotify) UINotify.toast(I18N.t("assist.fixFirst"), "warn");
        return;
      }
      var jamAll = [];
      for (var i = 0; i < jadwal.sesi.length; i++) {
        jamAll.push(jadwal.sesi[i].id === entry.id
                    ? jam.value : jadwal.sesi[i].mulai);
      }
      typing = false;
      delete drafts[entry.id];
      Store.jadwalSet(entry.id, parsed.regu, jamAll);
    });
    row.appendChild(save);

    if (running) {
      var stop = el("button", "btn btn--ghost", I18N.t("assist.endNow"));
      stop.type = "button";
      stop.addEventListener("click", function () {
        Modal.open({
          title: I18N.t("assist.endTitle"),
          lede: I18N.t("assist.endLede", entry.id),
          body: el("p", "modal__note", I18N.t("assist.endNote")),
          actions: [
            { label: I18N.t("assist.cancel"), value: null },
            { label: I18N.t("assist.endNow"), value: "go", primary: true }
          ]
        }).then(function (a) { if (a === "go") Store.sesiAkhiri(); });
      });
      row.appendChild(stop);
    } else {
      var go = el("button", "btn btn--ghost", I18N.t("assist.startNow"));
      go.type = "button";
      go.addEventListener("click", function () {
        Modal.open({
          title: I18N.t("assist.startTitle"),
          lede: I18N.t("assist.startLede", entry.id),
          body: el("p", "modal__note", I18N.t("assist.startNote")),
          actions: [
            { label: I18N.t("assist.cancel"), value: null },
            { label: I18N.t("assist.startNow"), value: "go",
              kind: "btn--confirm", primary: true }
          ]
        }).then(function (a) { if (a === "go") Store.sesiMulai(entry.id); });
      });
      row.appendChild(go);
    }

    panel.appendChild(row);
    repaint();
    return panel;
  }

  function buildDay() {
    if (!dayEl) return;
    // Rebuilt only when nothing is being typed into, so a 10 Hz frame does
    // not yank the caret out of a half-finished paste.
    if (typing) return;
    dayEl.textContent = "";
    if (!jadwal || !jadwal.sesi) {
      dayEl.appendChild(el("p", "empty", I18N.t("assist.dayLoading")));
      return;
    }
    for (var i = 0; i < jadwal.sesi.length; i++) {
      dayEl.appendChild(sessionPanel(jadwal.sesi[i]));
    }
  }

  function renderExpiry() {
    if (!expiryEl) return;
    var state = Store.getState();
    var running = state && state.sesi;
    if (!running) {
      expiryEl.textContent = I18N.t("assist.noSession");
      expiryEl.removeAttribute("data-soon");
      return;
    }
    var sisa = state.sesi_sisa;
    if (sisa === null || sisa === undefined) {
      expiryEl.textContent = I18N.t("assist.running");
      expiryEl.removeAttribute("data-soon");
      return;
    }
    var mins = Math.floor(sisa / 60);
    expiryEl.textContent = I18N.t("assist.clearsIn", running, mins + " " +
                                  I18N.t("assist.minutes"));
    if (mins <= 10) expiryEl.setAttribute("data-soon", "yes");
    else expiryEl.removeAttribute("data-soon");
  }

  // ------------------------------------------------------------- render

  function render(state) {
    if (!screenEl) return;

    var unlocked = Identity.isAssistant();
    lockedEl.hidden = unlocked;
    toolsEl.hidden = !unlocked;
    if (!unlocked) return;

    if (jadwal === null) Store.jadwalBaca();

    buildQueue(state);
    buildDay();
    renderExpiry();
  }

  function mount() {
    screenEl = document.getElementById("screen-assist");
    lockedEl = document.getElementById("assist-locked");
    toolsEl = document.getElementById("assist-tools");
    queueEl = document.getElementById("assist-queue");
    queueEmptyEl = document.getElementById("assist-queue-empty");
    dayEl = document.getElementById("assist-day");
    expiryEl = document.getElementById("assist-expiry");

    var unlock = document.getElementById("assist-unlock");
    if (unlock) unlock.addEventListener("click", function () { askToken(); });

    var signout = document.getElementById("assist-signout");
    if (signout) {
      signout.addEventListener("click", function () {
        jadwal = null;
        drafts = {};
        Identity.clearToken();
        render(Store.getState());
      });
    }

    var resetBtn = document.getElementById("assist-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Modal.open({
          title: I18N.t("assist.resetTitle"),
          lede: I18N.t("assist.resetLede"),
          body: el("p", "modal__note", I18N.t("assist.resetNote")),
          actions: [
            { label: I18N.t("assist.cancel"), value: null },
            { label: I18N.t("hud.reset"), value: "go", primary: true }
          ]
        }).then(function (a) { if (a === "go") Store.reset(); });
      });
    }

    var clearBtn = document.getElementById("assist-day-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        Modal.open({
          title: I18N.t("assist.clearTitle"),
          lede: I18N.t("assist.clearLede"),
          body: el("p", "modal__note", I18N.t("assist.clearNote")),
          actions: [
            { label: I18N.t("assist.cancel"), value: null },
            { label: I18N.t("assist.clear"), value: "go", primary: true }
          ]
        }).then(function (a) {
          if (a !== "go") return;
          drafts = {};
          Store.jadwalClear();
        });
      });
    }

    // The server is the authority: a token that a restart rotated must
    // re-lock this tab rather than leave dead buttons on screen.
    Store.onReply(function (msg) {
      if (msg.tipe === "halo") {
        Identity.acceptServerRole(msg);
        if (msg.ok === false && msg.alasan && window.UINotify) {
          UINotify.toast(msg.alasan, "warn");
        }
        render(Store.getState());
        return;
      }
      if (msg.tipe !== "balas") return;

      if (msg.jadwal) {
        jadwal = msg.jadwal;
        typing = false;
        buildDay();
      }
      if (msg.ok === false && msg.aksi && window.UINotify &&
          Identity.isAssistant()) {
        UINotify.toast(msg.alasan || "", "warn");
      }
      if (msg.ok === true && msg.aksi === "jadwal_set" && window.UINotify) {
        UINotify.toast(I18N.t("assist.saved"), "info");
      }
    });

    Identity.onChange(function () { render(Store.getState()); });
    I18N.onChange(function () { typing = false; render(Store.getState()); });
  }

  window.UIAssistant = { mount: mount, render: render, askToken: askToken };
})();
