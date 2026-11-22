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

  /*
   * Matahari: the sky follows the real sun over the lab (Gedung P, Telkom University, Bandung).
   * Sunrise and sunset come from the standard solar equations (the ones suncalc uses), so no
   * location is ever asked of the reader. Dawn runs from 40 min before sunrise to 20 min after it,
   * dusk from 20 min before sunset to 40 min after; in between the sky is fully day or night.
   *   data-sun   night | dawn | day | dusk
   *   --sun      0 (night) .. 1 (day): how much of the day sky shows
   * A test hook, ?langit=<ISO time> or localStorage iris-langit-at, pretends it is that moment.
   */
  var LAB = { lat: -6.9147, lng: 107.6098 };
  var RAD = Math.PI / 180;
  var DAWN = [40, 20];
  var DUSK = [20, 40];

  function sunTimes(ms) {
    var lw = RAD * -LAB.lng;
    var phi = RAD * LAB.lat;
    var d = ms / 86400000 - 0.5 + 2440588 - 2451545;
    var n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
    var ds = 0.0009 + lw / (2 * Math.PI) + n;
    var M = RAD * (357.5291 + 0.98560028 * ds);
    var C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + RAD * 102.9372 + Math.PI;
    var dec = Math.asin(Math.sin(L) * Math.sin(RAD * 23.4397));
    var transit = 2451545 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    var w = Math.acos(
      (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)),
    );
    var a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
    var set = 2451545 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    var rise = transit - (set - transit);
    var toMs = function (j) {
      return (j + 0.5 - 2440588) * 86400000;
    };
    return { rise: toMs(rise), set: toMs(set) };
  }

  function langitNow() {
    var at = null;
    try {
      at = new URLSearchParams(window.location.search).get("langit");
    } catch (e) {
      /* old browser: no test hook */
    }
    at = at || get("iris-langit-at");
    var t = at ? Date.parse(at) : NaN;
    return isFinite(t) ? t : Date.now();
  }

  // 0..1 with an eased start and end, so the sky never visibly lurches into or out of a transition.
  function ease(x) {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  }

  /** Where the sun is over the lab right now: { phase, sun } (sun 0 = night, 1 = day). */
  function sun() {
    var now = langitNow();
    var s = sunTimes(now);
    var m = 60000;
    if (now >= s.rise - DAWN[0] * m && now <= s.rise + DAWN[1] * m)
      return {
        phase: "dawn",
        sun: ease((now - (s.rise - DAWN[0] * m)) / ((DAWN[0] + DAWN[1]) * m)),
      };
    if (now >= s.set - DUSK[0] * m && now <= s.set + DUSK[1] * m)
      return {
        phase: "dusk",
        sun: 1 - ease((now - (s.set - DUSK[0] * m)) / ((DUSK[0] + DUSK[1]) * m)),
      };
    return now > s.rise && now < s.set ? { phase: "day", sun: 1 } : { phase: "night", sun: 0 };
  }

  function theme() {
    var p = get("iris-theme");
    if (p === "light" || p === "dark") return p;
    if (p === "system") return systemLight() ? "light" : "dark";
    if (p === "matahari") return sun().sun >= 0.5 ? "light" : "dark";
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
    // Gelap can be Malam or Senja, Terang Siang or Fajar (iris-langit): the Matahari transition held at one point,
    // dusk 35% of the way to night, dawn 65% of the way to day, so the UI keeps its theme.
    var pref = get("iris-theme");
    var held = get("iris-langit");
    var s = null;
    if (pref === "matahari") s = sun();
    else if (t === "dark" && held === "senja") s = { phase: "dusk", sun: 0.35 };
    else if (t === "light" && held === "fajar") s = { phase: "dawn", sun: 0.65 };
    if (s) {
      root.setAttribute("data-sun", s.phase);
      root.style.setProperty("--sun", s.sun.toFixed(3));
      // The warm horizon peaks halfway through a dawn or dusk and is gone at either end
      root.style.setProperty("--sun-glow", (1 - Math.abs(2 * s.sun - 1)).toFixed(3));
    } else {
      root.removeAttribute("data-sun");
      // An empty value removes a custom property (and is all setProperty needs)
      root.style.setProperty("--sun", "");
      root.style.setProperty("--sun-glow", "");
    }
    try {
      window.dispatchEvent(new Event("iris-sun"));
    } catch (e) {
      /* very old browser: the sky catches up on the next theme change */
    }
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

  // Matahari: follow the sun. Once a minute is plenty (a dawn takes an hour); a hidden tab skips the work.
  if (typeof window.setInterval === "function")
    window.setInterval(function () {
      if (get("iris-theme") === "matahari" && !document.hidden) apply(document.documentElement);
    }, 60000);

  window.IrisPrefs = {
    apply: function () {
      apply(document.documentElement);
    },
    theme: theme,
    sun: sun,
    sunTimes: sunTimes,
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
