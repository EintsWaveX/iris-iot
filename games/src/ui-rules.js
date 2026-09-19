/**
 * Arena Asisten IRIS - Aturan (rules) screen.
 *
 * Static content: the scoring rules were previously invisible in the UI and
 * lived only in engine.js, so nobody in the room could check why a group had
 * the points it had. Every word comes from `DATA.rules` so the Indonesian
 * copy is editable in one place; this module is pure presentation and holds
 * no state of its own.
 *
 * Built once and never patched - nothing here can be changed by a Store
 * snapshot, so the 3s reconcile must not touch it.
 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  var built = false;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          node.setAttribute(key, String(attrs[key]));
        }
      }
    }
    return node;
  }

  // -------------------------------------------------------------------------
  // the bracket diagram
  // -------------------------------------------------------------------------

  /* Geometry for the illustration. The four group boxes sit in two pairs;
     each pair elbows into a semifinal, and the two semifinals elbow into the
     final - the same shape ui-game.js draws with real measured wires, only
     fixed here because the bracket itself never changes. */
  var BOX_H = 34;
  var GROUP_X = 6;
  var GROUP_W = 130;
  var SF_X = 246;
  var SF_W = 140;
  var FINAL_X = 486;
  var FINAL_W = 148;

  var GROUP_Y = [37, 87, 167, 217]; // vertical centres, Grup 1..4
  var SF_Y = [62, 192];             // centres of the two semifinals
  var FINAL_Y = 127;

  function box(x, y, w, stroke, fill) {
    return svgEl("rect", {
      x: x,
      y: y - BOX_H / 2,
      width: w,
      height: BOX_H,
      rx: 4,
      fill: fill || "none",
      stroke: stroke,
      "stroke-width": 1
    });
  }

  function label(x, y, text, cls) {
    var node = svgEl("text", {
      x: x,
      y: y,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: cls
    });
    node.textContent = text;
    return node;
  }

  /** An elbow: out of `fromX` at `fromY`, across at the midpoint, into `toX`. */
  function elbow(fromX, fromY, toX, toY) {
    var midX = fromX + (toX - fromX) / 2;
    return svgEl("path", {
      d: "M" + fromX + "," + fromY + " H" + midX + " V" + toY + " H" + toX,
      fill: "none",
      stroke: "var(--hairline-strong)",
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  function buildDiagram() {
    var wrap = el("div", "rules-diagram");

    var svg = svgEl("svg", {
      class: "rules-diagram__svg",
      viewBox: "0 0 640 254",
      role: "img",
      "aria-labelledby": "rules-diagram-title rules-diagram-desc"
    });

    var title = svgEl("title", { id: "rules-diagram-title" });
    title.textContent = "Bagan turnamen";
    svg.appendChild(title);

    var desc = svgEl("desc", { id: "rules-diagram-desc" });
    desc.textContent =
      "Grup 1 melawan Grup 2 di Semifinal 1. Grup 3 melawan Grup 4 di " +
      "Semifinal 2. Kedua pemenang semifinal bertemu di Final, dan pemenang " +
      "Final menjadi juara.";
    svg.appendChild(desc);

    // Wires first, so every box paints over the end of its own line.
    var wires = svgEl("g", { class: "rules-diagram__wires" });
    var groupRight = GROUP_X + GROUP_W;
    wires.appendChild(elbow(groupRight, GROUP_Y[0], SF_X, SF_Y[0]));
    wires.appendChild(elbow(groupRight, GROUP_Y[1], SF_X, SF_Y[0]));
    wires.appendChild(elbow(groupRight, GROUP_Y[2], SF_X, SF_Y[1]));
    wires.appendChild(elbow(groupRight, GROUP_Y[3], SF_X, SF_Y[1]));

    var sfRight = SF_X + SF_W;
    wires.appendChild(elbow(sfRight, SF_Y[0], FINAL_X, FINAL_Y));
    wires.appendChild(elbow(sfRight, SF_Y[1], FINAL_X, FINAL_Y));
    svg.appendChild(wires);

    // The four groups, each in its own constellation hue.
    var groups = (window.DATA && window.DATA.groups) || [];
    for (var i = 0; i < 4; i++) {
      var hue = "var(--group-" + (i + 1) + ")";
      var g = svgEl("g", { class: "rules-diagram__group" });
      g.appendChild(box(GROUP_X, GROUP_Y[i], GROUP_W, hue));

      var nama = groups[i] && groups[i].nama;
      var text = nama ? "Grup " + (i + 1) + " · " + nama : "Grup " + (i + 1);
      var t = label(GROUP_X + GROUP_W / 2, GROUP_Y[i], text, "rules-diagram__label");
      t.setAttribute("fill", hue);
      g.appendChild(t);
      svg.appendChild(g);
    }

    // The two semifinals.
    var sfNames = ["Semifinal 1", "Semifinal 2"];
    for (var s = 0; s < 2; s++) {
      svg.appendChild(box(SF_X, SF_Y[s], SF_W, "var(--hairline-strong)"));
      svg.appendChild(
        label(
          SF_X + SF_W / 2,
          SF_Y[s],
          sfNames[s],
          "rules-diagram__label rules-diagram__label--muted"
        )
      );
    }

    // The final, and the one place gold is allowed to appear.
    svg.appendChild(box(FINAL_X, FINAL_Y, FINAL_W, "var(--gold)", "var(--gold-soft)"));
    var finalLabel = label(FINAL_X + FINAL_W / 2, FINAL_Y, "Final", "rules-diagram__label");
    finalLabel.setAttribute("fill", "var(--gold)");
    svg.appendChild(finalLabel);

    var juara = label(
      FINAL_X + FINAL_W / 2,
      FINAL_Y + 42,
      "Pemenang · Juara",
      "rules-diagram__caption"
    );
    juara.setAttribute("fill", "var(--gold)");
    svg.appendChild(juara);

    wrap.appendChild(svg);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // prose sections
  // -------------------------------------------------------------------------

  function buildPoints(poin) {
    var dl = el("dl", "rules-points");
    poin.forEach(function (item) {
      dl.appendChild(el("dt", "rules-points__term", item.label));
      dl.appendChild(el("dd", "rules-points__desc", item.teks));
    });
    return dl;
  }

  function buildScoreTable(skor) {
    var table = el("div", "rules-score");
    skor.forEach(function (row) {
      var line = el("div", "rules-score__row");
      // Gold marks the champion tier and nothing else.
      if (row.poin === 3) line.classList.add("rules-score__row--gold");

      line.appendChild(el("div", "rules-score__value tabular", String(row.poin)));

      var body = el("div", "rules-score__body");
      body.appendChild(el("div", "rules-score__label", row.label));
      body.appendChild(el("div", "rules-score__text", row.teks));
      line.appendChild(body);

      // The unit, so the numeral reads as a score and not as a rank.
      line.appendChild(el("div", "rules-score__unit mono", "poin"));

      table.appendChild(line);
    });
    return table;
  }

  function buildSection(section) {
    var node = el("section", "section");
    if (section.id) node.setAttribute("data-rules-section", section.id);

    var head = el("div", "section__head");
    var headText = el("div");
    if (section.eyebrow) headText.appendChild(el("p", "eyebrow", section.eyebrow));
    headText.appendChild(el("h3", "section__title", section.judul));
    head.appendChild(headText);
    node.appendChild(head);

    (section.paragraf || []).forEach(function (text) {
      node.appendChild(el("p", "rules-prose", text));
    });

    // The bracket illustration belongs to the section that describes it, and
    // the scoring table to the section about points. Both sit above the
    // qualifying notes, which read as footnotes to them.
    if (section.id === "bagan") node.appendChild(buildDiagram());

    if (section.id === "poin") {
      var skor = (window.DATA.rules && window.DATA.rules.skor) || [];
      if (skor.length) node.appendChild(buildScoreTable(skor));
    }

    if (section.poin && section.poin.length) node.appendChild(buildPoints(section.poin));

    return node;
  }

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  function render() {
    if (built) return;

    var root = document.getElementById("screen-rules");
    if (!root) return;

    var rules = window.DATA && window.DATA.rules;
    if (!rules || !rules.sections) return;

    var emptyState = root.querySelector('[data-empty="rules"]');

    var body = el("div", "rules measure");

    if (rules.ringkas) body.appendChild(el("p", "rules-lead", rules.ringkas));

    rules.sections.forEach(function (section) {
      body.appendChild(buildSection(section));
    });

    if (emptyState) {
      root.insertBefore(body, emptyState);
      emptyState.style.display = "none";
    } else {
      root.appendChild(body);
    }

    built = true;
  }

  window.UIRules = { render: render };
})();
