/*
 * Phase 9: applies the reader's display choices to <html> before the first
 * paint, so a light-theme reader never sees a dark flash. An external file
 * on purpose: the CSP allows script-src 'self', and an inline script would
 * need its hash in vercel.json.
 *
 *   data-theme      dark | light   from iris-theme (dark, light, system)
 *   data-detail     ldm | normal | hd   from iris-detail (Low Detail is the
 *                   default; the pre-Phase 9 iris-kurangi-efek "penuh"
 *                   becomes hd, anything else ldm)
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

  function detail() {
    var v = get("iris-detail");
    if (v === "ldm" || v === "normal" || v === "hd") return v;
    var old = get("iris-kurangi-efek");
    return old === "penuh" || old === "0" ? "hd" : "ldm";
  }

  // Phone status bar and browser chrome follow the nav colour of the theme.
  var BAR = { dark: "#0a0c14", light: "#f6faff" };

  function apply(root) {
    var t = theme();
    root.setAttribute("data-theme", t);
    var bar = root.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute("content", BAR[t]);
    root.setAttribute("data-detail", detail());
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
  };

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
