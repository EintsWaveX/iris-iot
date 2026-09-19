/**
 * Perburuan LoRa IRIS - claiming the find, with photographic evidence.
 *
 * A group that thinks it is holding the beacon photographs it. The photo
 * goes to the assistant sitting in the practicum room, who rules on it
 * without walking outside. This is the only part of the game where a phone
 * sends something substantial, so the work here is mostly about making a
 * four-megabyte camera capture small enough to cross a busy hotspot.
 *
 * The resize is a canvas draw, not a library: the project's whole
 * dependency budget for the server is one package, and it would be absurd
 * to spend more on the client than on the thing it talks to.
 *
 * window.UIClaim = { mount, open, armed }
 */
(function () {
  "use strict";

  var MAX_EDGE = 1280;      // px on the long side after downscale
  var QUALITY = 0.72;       // JPEG quality; ~310 KB from a modern phone
  var HARD_LIMIT = 512 * 1024;   // must match MAX_FOTO_BYTES on the server

  var waiting = null;       // settle fn for the in-flight upload
  var pendingBlob = null;   // body held back until the header is acked

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Is the claim button live for this group right now? */
  function armed(row) {
    if (!row) return false;
    return row.online && row.heat === "membara" &&
           row.status !== "menunggu" && row.status !== "menang";
  }

  function armReason(row, state) {
    if (!row) return I18N.t("claim.noData");
    if (state && state.ditemukan !== null) return I18N.t("claim.over");
    if (row.status === "menunggu") return I18N.t("claim.pending");
    if (row.status === "menang") return I18N.t("claim.won");
    if (!row.online) return I18N.t("claim.lost");
    if (row.heat !== "membara") {
      return I18N.t("claim.tooFar", I18N.jarak(row.jarak_m));
    }
    return "";
  }

  // ---------------------------------------------------------------- image

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  /**
   * Downscale to a long edge of MAX_EDGE and encode as JPEG. Returns a
   * Blob. Falls back to the original file if the canvas is unavailable or
   * tainted, which then almost certainly fails the size check - better a
   * clear "too large" than a silent upload of a 4 MB original.
   */
  function shrink(file) {
    return readImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, cw, ch);

      return new Promise(function (resolve) {
        if (!canvas.toBlob) { resolve(file); return; }
        canvas.toBlob(function (blob) {
          resolve(blob || file);
        }, "image/jpeg", QUALITY);
      });
    }).catch(function () { return file; });
  }

  // --------------------------------------------------------------- upload

  function upload(grup, blob) {
    return new Promise(function (resolve) {
      if (blob.size > HARD_LIMIT) {
        resolve({ ok: false, alasan: I18N.t("claim.tooBig") });
        return;
      }

      var timer = 0;
      // One settle function, registered once. Whichever of the reply, the
      // timeout or the send failure arrives first wins, and the rest see a
      // cleared `waiting` and do nothing.
      var settle = function (result) {
        if (waiting !== settle) return;
        waiting = null;
        pendingBlob = null;
        window.clearTimeout(timer);
        resolve(result);
      };

      waiting = settle;
      timer = window.setTimeout(function () {
        settle({ ok: false, alasan: I18N.t("claim.timeout") });
      }, 20000);

      // The body only goes once the header is acknowledged, so the server
      // can refuse a hopeless claim before 300 KB crosses the hotspot.
      pendingBlob = blob;
      if (!Store.photoStart(grup, blob.size, "image/jpeg")) {
        settle({ ok: false, alasan: I18N.t("claim.offline") });
      }
    });
  }

  function onReply(msg) {
    if (msg.tipe !== "balas") return;

    if (msg.aksi === "foto_mulai") {
      if (!msg.ok) {
        if (waiting) waiting({ ok: false, alasan: msg.alasan || "" });
        return;
      }
      if (pendingBlob) {
        var blob = pendingBlob;
        blob.arrayBuffer().then(function (buf) {
          // Still the same upload? A timeout may have fired while the
          // ArrayBuffer was being read.
          if (pendingBlob === blob) Store.sendBinary(buf);
        });
      }
      return;
    }

    if (msg.aksi === "foto") {
      if (waiting) {
        waiting({ ok: !!msg.ok, alasan: msg.alasan || "",
                  berkas: msg.berkas });
      }
      return;
    }

    if (msg.aksi === "klaim" && !msg.ok && window.UINotify) {
      UINotify.toast(msg.alasan || I18N.t("claim.rejected"), "warn");
    }
  }

  // ---------------------------------------------------------------- modal

  function openClaim(grup) {
    var body = el("div", "claimform");
    var preview = el("div", "claimform__preview");
    var hint = el("p", "claimform__hint", I18N.t("claim.hint"));

    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // Opens the rear camera directly on a phone rather than the gallery.
    input.setAttribute("capture", "environment");
    input.className = "claimform__file";
    input.id = "claim-file";

    var label = el("label", "btn btn--confirm claimform__pick",
                   I18N.t("claim.takePhoto"));
    label.setAttribute("for", "claim-file");

    var status = el("p", "claimform__status", "");
    var chosen = { blob: null };

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      status.textContent = I18N.t("claim.shrinking");
      preview.textContent = "";

      shrink(file).then(function (blob) {
        chosen.blob = blob;
        var img = new Image();
        img.className = "claimform__thumb";
        img.alt = "";
        img.src = URL.createObjectURL(blob);
        preview.appendChild(img);
        status.textContent = I18N.t("claim.ready",
                                    Math.round(blob.size / 1024) + " KB");
        label.textContent = I18N.t("claim.retake");
      });
    });

    body.appendChild(preview);
    body.appendChild(label);
    body.appendChild(input);
    body.appendChild(status);
    body.appendChild(hint);

    return Modal.open({
      title: I18N.t("claim.title"),
      lede: I18N.t("claim.lede"),
      body: body,
      hue: "var(--group-" + grup + ")",
      actions: [
        { label: I18N.t("claim.cancel"), value: null },
        { label: I18N.t("claim.send"), value: "send",
          kind: "btn--confirm", primary: true }
      ]
    }).then(function (answer) {
      if (answer !== "send") return false;

      // A claim with no photo is allowed. A dead camera or a denied
      // permission must not be the thing that stops a group finishing.
      if (!chosen.blob) {
        Store.claim(grup, null);
        if (window.UINotify) UINotify.toast(I18N.t("claim.sentNoPhoto"), "info");
        return true;
      }

      if (window.UINotify) UINotify.toast(I18N.t("claim.sending"), "info");
      return upload(grup, chosen.blob).then(function (res) {
        if (!res.ok) {
          if (window.UINotify) {
            UINotify.toast(res.alasan || I18N.t("claim.uploadFailed"), "warn");
          }
          return false;
        }
        Store.claim(grup, res.berkas);
        if (window.UINotify) UINotify.toast(I18N.t("claim.sent"), "info");
        return true;
      });
    });
  }

  function mount() {
    Store.onReply(onReply);
  }

  window.UIClaim = {
    mount: mount,
    open: openClaim,
    armed: armed,
    armReason: armReason
  };
})();
