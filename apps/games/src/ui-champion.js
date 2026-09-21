/**
 * Arena Asisten IRIS - the champion takeover.
 *
 * The climax of every game used to be a small banner sitting below four group
 * columns and three matches, at the bottom of a scrolling page. This replaces
 * it with a full-viewport moment: the starfield pulls inward, the winning
 * group's constellation draws itself, the name lands, the members list in, and
 * confetti fires. It then settles back and leaves the slim gold strip on the
 * game screen as the permanent record.
 *
 * Exposes window.Champion. Deliberately self-contained: it renders from a
 * plain descriptor, so both the normal UI and the projector Stage view can
 * fire the same moment without either owning it.
 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var HOLD_MS = 7000;

  var root = null;
  var els = null;
  var built = false;
  var dismissTimer = null;
  var openTimeline = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function reduced() {
    return !!(window.Motion && window.Motion.isReduced());
  }

  /**
   * Builds a group's constellation crest from its DATA.groups entry. Returns
   * the <svg> plus the node lists the opening timeline animates.
   */
  function buildCrest(group) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "champion__crest");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");

    var lines = [];
    var stars = [];

    if (group && group.lines) {
      group.lines.forEach(function (pair) {
        var a = group.stars[pair[0]];
        var b = group.stars[pair[1]];
        if (!a || !b) return;
        var line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", a[0]);
        line.setAttribute("y1", a[1]);
        line.setAttribute("x2", b[0]);
        line.setAttribute("y2", b[1]);
        line.setAttribute("class", "champion__crest-line");
        svg.appendChild(line);
        lines.push(line);
      });
    }

    if (group && group.stars) {
      group.stars.forEach(function (point, i) {
        var dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", point[0]);
        dot.setAttribute("cy", point[1]);
        // The first star of each crest is the anchor and reads brighter.
        dot.setAttribute("r", i === 0 ? 4 : 2.6);
        dot.setAttribute("class", "champion__crest-star");
        svg.appendChild(dot);
        stars.push(dot);
      });
    }

    return { svg: svg, lines: lines, stars: stars };
  }

  function buildOnce() {
    root = document.getElementById("champion-overlay");
    if (!root) return false;

    var inner = el("div", "champion__inner");

    var eyebrow = el("p", "champion__eyebrow", "Juara");
    var crestSlot = el("div", "champion__crest-slot");
    var groupName = el("h2", "champion__group", "");
    var constellation = el("p", "champion__constellation", "");
    var members = el("ul", "champion__members");
    var hint = el("p", "champion__hint", "Ketuk untuk menutup");

    inner.appendChild(eyebrow);
    inner.appendChild(crestSlot);
    inner.appendChild(groupName);
    inner.appendChild(constellation);
    inner.appendChild(members);
    inner.appendChild(hint);
    root.appendChild(inner);

    els = {
      inner: inner,
      eyebrow: eyebrow,
      crestSlot: crestSlot,
      groupName: groupName,
      constellation: constellation,
      members: members,
      hint: hint
    };

    root.addEventListener("click", hide);
    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape" && root.classList.contains("is-open")) hide();
    });

    built = true;
    return true;
  }

  function fireConfetti() {
    if (!window.confetti || reduced()) return;

    var cs = getComputedStyle(document.documentElement);
    function pick(name, fallback) {
      var v = cs.getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }
    var colors = [
      pick("--gold", "#e8b64d"),
      pick("--gold-bright", "#f7d488"),
      pick("--accent", "#40b0ff"),
      pick("--text", "#eef1f6")
    ];

    // Two angled cannons rather than one overhead burst: it reads as a stage
    // effect instead of as falling debris, which suits the moment better.
    var common = { colors: colors, disableForReducedMotion: true, zIndex: 1200 };
    window.confetti(
      Object.assign({}, common, {
        particleCount: 90,
        angle: 62,
        spread: 62,
        origin: { x: 0, y: 0.75 },
        startVelocity: 52
      })
    );
    window.confetti(
      Object.assign({}, common, {
        particleCount: 90,
        angle: 118,
        spread: 62,
        origin: { x: 1, y: 0.75 },
        startVelocity: 52
      })
    );
    setTimeout(function () {
      window.confetti(
        Object.assign({}, common, {
          particleCount: 70,
          spread: 100,
          origin: { x: 0.5, y: 0.35 },
          startVelocity: 34,
          scalar: 0.9
        })
      );
    }, 260);
  }

  /**
   * @param {{groupIndex:number, members:string[], gameName?:string,
   *          holdMs?:number}} info
   *   holdMs overrides how long the takeover stays up before dismissing
   *   itself. The Stage view holds it longer than a phone does, because a
   *   room reads it from further away and nobody is going to tap it.
   */
  function show(info) {
    if (!built && !buildOnce()) return;
    if (!info || typeof info.groupIndex !== "number") return;

    var groupIndex = info.groupIndex;
    var group = ((window.DATA && window.DATA.groups) || [])[groupIndex] || null;

    root.setAttribute("data-group", String(groupIndex + 1));
    els.groupName.textContent = "Grup " + (groupIndex + 1);
    els.constellation.textContent = group ? group.nama : "";

    els.crestSlot.textContent = "";
    var crest = buildCrest(group);
    els.crestSlot.appendChild(crest.svg);

    els.members.textContent = "";
    var memberNodes = [];
    (info.members || []).forEach(function (name) {
      var li = el("li", "champion__member", name);
      els.members.appendChild(li);
      memberNodes.push(li);
    });

    var holdMs = typeof info.holdMs === "number" ? info.holdMs : HOLD_MS;

    if (dismissTimer) clearTimeout(dismissTimer);
    root.classList.add("is-open");
    root.removeAttribute("hidden");

    if (window.Cosmos) window.Cosmos.converge({ inDuration: 1.2, hold: 1.4 });

    var gsap = window.gsap;
    if (!gsap || reduced()) {
      fireConfetti();
      dismissTimer = setTimeout(hide, holdMs);
      return;
    }

    if (openTimeline) openTimeline.kill();
    openTimeline = gsap.timeline();

    openTimeline
      .fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "outExpo" })
      .fromTo(
        els.eyebrow,
        { opacity: 0, letterSpacing: "0.6em" },
        { opacity: 1, letterSpacing: "0.18em", duration: 0.9, ease: "outExpo" },
        0.15
      );

    // The crest draws itself: lines first, then the stars pop on.
    if (window.DrawSVGPlugin && crest.lines.length) {
      openTimeline.fromTo(
        crest.lines,
        { drawSVG: "50% 50%" },
        { drawSVG: "0% 100%", duration: 0.75, ease: "outExpo", stagger: 0.07 },
        0.35
      );
    }
    if (crest.stars.length) {
      openTimeline.fromTo(
        crest.stars,
        { scale: 0, transformOrigin: "center" },
        { scale: 1, duration: 0.5, ease: "back.out(2.4)", stagger: 0.05 },
        0.55
      );
    }

    openTimeline.fromTo(
      els.groupName,
      { opacity: 0, y: 26, filter: "blur(10px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "outExpo" },
      0.75
    );

    openTimeline.fromTo(
      els.constellation,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.7, ease: "outExpo" },
      0.95
    );

    if (memberNodes.length) {
      openTimeline.fromTo(
        memberNodes,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.55, ease: "outExpo", stagger: 0.06 },
        1.05
      );
    }

    openTimeline.fromTo(
      els.hint,
      { opacity: 0 },
      { opacity: 0.55, duration: 0.6 },
      1.8
    );

    openTimeline.call(fireConfetti, null, 0.9);

    dismissTimer = setTimeout(hide, holdMs);
  }

  function hide() {
    if (!root || !root.classList.contains("is-open")) return;
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = null;

    var gsap = window.gsap;
    if (!gsap || reduced()) {
      root.classList.remove("is-open");
      root.setAttribute("hidden", "");
      return;
    }

    if (openTimeline) openTimeline.kill();
    gsap.to(root, {
      opacity: 0,
      duration: 0.5,
      ease: "inOutSoft",
      onComplete: function () {
        root.classList.remove("is-open");
        root.setAttribute("hidden", "");
        gsap.set(root, { clearProps: "opacity" });
      }
    });
  }

  window.Champion = { show: show, hide: hide };
})();
