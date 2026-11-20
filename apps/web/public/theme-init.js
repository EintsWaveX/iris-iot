/*
 * Phase 9: applies the reader's display choices to <html> before the first
 * paint, so a light-theme reader never sees a dark flash. An external file
 * on purpose: the CSP allows script-src 'self', and an inline script would
 * need its hash in vercel.json.
 *
 *   data-theme      dark | light   from iris-theme (dark, light, system)
 *   data-detail     ldm | normal | hd   the detail level IN FORCE. iris-detail holds the
 *                   reader's choice: auto (the default), ldm, normal or hd; the pre-Phase 9
 *                   iris-kurangi-efek "penuh" counts as hd. Otomatis resolves to ldm for a device
 *                   that is plainly weak (Save-Data, reduced motion, <= 2 GB, <= 2 cores) or that
 *                   the speed watcher (scripts/auto-detail.ts) found too slow in the last 14 days,
 *                   and to normal for everything else. Otomatis never picks hd: that stays a choice.
 *   data-zh-weight  500 when Mandarin headings are set lighter than 700
 *   data-keyhints   on when the reader asked to see shortcut keys on buttons
 *                   (iris-keyhints, the "?" sheet)
 *
 * ClientRouter replaces <html>'s attributes on every navigation, so the
 * same choices are stamped onto the incoming document before the swap.
 * window.IrisPrefs.apply() re-reads them after the Tampilan panel saves.
 */
(function () {
  "use strict";

  function get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function systemLight() {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches;
    } catch (e) {
      return false;
    }
  }

  function theme() {
    var p = get("iris-theme");
    if (p === "light" || p === "dark") return p;
    if (p === "system") return systemLight() ? "light" : "dark";
    return "dark";
  }

  /** What the reader chose: auto, ldm, normal or hd */
  function detailPref() {
    var v = get("iris-detail");
    if (v === "auto" || v === "ldm" || v === "normal" || v === "hd") return v;
    var old = get("iris-kurangi-efek");
    return old === "penuh" || old === "0" ? "hd" : "auto";
  }

  // The speed watcher's verdict stays for two weeks, then the device gets another chance.
  var DEMOTION_MS = 14 * 24 * 60 * 60 * 1000;

  function demoted() {
    if (window.__irisDemoted) return true;
    var at = Number(get("iris-auto-ldm"));
    return isFinite(at) && at > 0 && Date.now() - at < DEMOTION_MS;
  }

  /** Otomatis: Low Detail for a device that is plainly weak or was found slow, Normal for the rest */
  function autoDetail() {
    var nav = window.navigator || {};
    var conn = nav.connection;
    if (conn && conn.saveData) return "ldm";
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return "ldm";
    if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2) return "ldm";
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "ldm";
    } catch (e) {
      /* no matchMedia: carry on */
    }
    return demoted() ? "ldm" : "normal";
  }

  /** The level in force */
  function detail() {
    var p = detailPref();
    return p === "auto" ? autoDetail() : p;
  }

  // The painted background blurs while signed in (Tampilan, default 60%). The blur is a number the stylesheet reads.
  function bgBlur() {
    var v = get("iris-bg-blur");
    if (v === null || v === "") return 60;
    var n = Math.round(Number(v));
    return isFinite(n) ? Math.min(100, Math.max(0, n)) : 60;
  }

  // Phone status bar and browser chrome follow the nav colour of the theme.
  var BAR = { dark: "#0a0c14", light: "#f6faff" };

  function apply(root) {
    var t = theme();
    root.setAttribute("data-theme", t);
    var bar = root.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute("content", BAR[t]);
    root.setAttribute("data-detail", detail());
    root.style.setProperty("--bg-blur", String(bgBlur()));
    // Signed in or not: the page being left knows (app.ts loadMe keeps data-masuk current); a first paint guesses from
    // "was ever signed in here", and loadMe corrects it a moment later.
    var live = document.documentElement.getAttribute("data-masuk");
    root.setAttribute("data-masuk", live || (get("iris-pernah-masuk") === "1" ? "yes" : "no"));
    if (get("iris-zh-weight") === "500") root.setAttribute("data-zh-weight", "500");
    else root.removeAttribute("data-zh-weight");
    if (get("iris-keyhints") === "on") root.setAttribute("data-keyhints", "on");
    else root.removeAttribute("data-keyhints");
  }

  apply(document.documentElement);

  window.IrisPrefs = {
    apply: function () {
      apply(document.documentElement);
    },
    theme: theme,
    detail: detail,
    detailPref: detailPref,
    /** The speed watcher found this device too slow: Otomatis drops to Low Detail for two weeks */
    demote: function () {
      try {
        window.localStorage.setItem("iris-auto-ldm", String(Date.now()));
      } catch (e) {
        /* storage blocked: it holds for this page only */
        window.__irisDemoted = true;
      }
      apply(document.documentElement);
    },
  };

  // Toast hydrates when the page is idle (Base.astro), so a toast raised before that waits here and is
  // shown by Toast.tsx as soon as it is up (anything older than a few seconds is dropped there).
  window.__toastAntre = [];
  if (!window.Toast) {
    window.Toast = {
      show: function () {
        window.__toastAntre.push({ t: Date.now(), a: Array.prototype.slice.call(arguments) });
      },
    };
  }

  document.addEventListener("astro:before-swap", function (e) {
    if (e.newDocument) apply(e.newDocument.documentElement);
  });
  document.addEventListener("astro:after-swap", function () {
    apply(document.documentElement);
  });
  try {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      if (get("iris-theme") === "system") apply(document.documentElement);
    });
  } catch (e) {
    /* old browser without MediaQueryList events: the next load catches up */
  }
})();
