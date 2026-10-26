/**
 * Arena Asisten IRIS - the cosmos: starfield, constellations, comets, planets,
 * and the warp transition between screens.
 *
 * Every screen gets its own sky. Switching tabs fires a hyperspace warp --
 * the stars stretch into radial streaks, the scene weights cross-fade, then
 * the field decelerates into the new arrangement -- so navigation reads as
 * travelling somewhere rather than as a panel swap.
 *
 *   Kehadiran  constellations, the roster drawn as a star chart
 *   Daftar Game comets, one per game waiting to happen
 *   Game       planets, big slow bodies for the screen you sit on longest
 *   Klasemen   a bright dense field, comets and a distant planet
 *   Aturan     quiet and sparse, so the text carries the screen
 *
 * Design constraints this file is written around:
 *
 *   - It runs on 25 phones and one projector laptop, so density derives from
 *     viewport area and is hard-capped, the O(n^2) constellation pass is
 *     confined to the near layer, and every glow is a pre-rendered sprite
 *     blitted with drawImage rather than a per-star gradient or shadowBlur.
 *   - It shares motion.js's ticker rather than owning a rAF loop.
 *   - Under prefers-reduced-motion it paints one frame and never subscribes;
 *     warps become instant scene swaps. A still night sky is still a night
 *     sky, and blanking it would leave a flat void where the whole visual
 *     language lives.
 *
 * Exposes window.Cosmos.
 */
(function () {
  "use strict";

  var canvas = null;
  var ctx = null;
  var width = 0;
  var height = 0;
  var dpr = 1;

  var layers = [];
  var comets = [];
  var planets = [];
  var started = false;

  // Pointer parallax, lerped toward its target so it glides rather than snaps.
  var pointerX = 0;
  var pointerY = 0;
  var offsetX = 0;
  var offsetY = 0;

  // 0 = at rest, 1 = fully pulled toward the centre. Driven by converge();
  // this is the champion moment's inward collapse.
  var converge = 0;

  // 0 = at rest, 1 = full hyperspace. Driven by warpTo(); this is the outward
  // radial streak fired on every screen change.
  var hyper = 0;

  var cometTimer = 0;

  var palette = {
    star: "#eef1f6",
    accent: "#40b0ff",
    gold: "#e8b64d",
    violet: "#a78bfa",
    teal: "#5eead4",
    rose: "#fb7185",
    void: "#05060b",
  };

  var sprites = {};

  // ---------------------------------------------------------------------
  // scenes
  // ---------------------------------------------------------------------

  // Weights are multipliers, cross-faded by GSAP on every scene change, so a
  // screen switch is a dissolve between skies rather than a hard cut.
  var SCENES = {
    roster: { stars: 1.0, links: 1.0, comets: 0.2, planets: 0.0, hueShift: 0 },
    games: { stars: 0.9, links: 0.2, comets: 1.0, planets: 0.25, hueShift: 1 },
    game: { stars: 0.8, links: 0.45, comets: 0.3, planets: 1.0, hueShift: 2 },
    board: { stars: 1.1, links: 0.15, comets: 0.7, planets: 0.45, hueShift: 3 },
    rules: {
      stars: 0.55,
      links: 0.35,
      comets: 0.1,
      planets: 0.15,
      hueShift: 4,
    },

    // apps/web's pages. Character per Stage 3's plan: beranda is the front
    // door and gets to be dramatic; every page after that quiets down, in
    // proportion to how much reading/typing/watching happens there.
    beranda: {
      stars: 1.0,
      links: 0.35,
      comets: 0.85,
      planets: 0.65,
      hueShift: 0,
    },
    masuk: { stars: 0.55, links: 0.1, comets: 0.0, planets: 0.15, hueShift: 1 },
    // Stage 6: raised from stars 0.45/comets 0.08 -- the comet spawn gate is
    // `weights.comets > 0.05`, so the old value barely cleared it and then
    // drew at 0.08 alpha, which reads as nothing. This is most of what "the
    // site feels still" traced back to: three of four apps/web pages were a
    // dim star field and nothing else. Still well under beranda's (the
    // front door, allowed to be dramatic), since this is a working page.
    kerja: {
      stars: 0.65,
      links: 0.18,
      comets: 0.16,
      planets: 0.24,
      hueShift: 2,
    },
    teknis: {
      stars: 0.55,
      links: 0.1,
      comets: 0.12,
      planets: 0.18,
      hueShift: 3,
    },
    // Deliberately NOT raised along with kerja/teknis above: a practicum
    // runs on top of this scene for up to 165 minutes straight and the sky
    // must never be what anyone notices, which is the one place "make it
    // feel alive" has to lose to "stay out of the way".
    sesi: { stars: 0.28, links: 0.05, comets: 0.0, planets: 0.05, hueShift: 4 },
  };

  var weights = {
    stars: SCENES.roster.stars,
    links: SCENES.roster.links,
    comets: SCENES.roster.comets,
    planets: SCENES.roster.planets,
  };

  var currentScene = "roster";

  var LAYER_SPECS = [
    {
      divisor: 9000,
      max: 260,
      rMin: 0.4,
      rMax: 1.0,
      drift: 3,
      parallax: 0.004,
      alpha: 0.5,
      glow: false,
      streak: false,
    },
    {
      divisor: 22000,
      max: 110,
      rMin: 0.8,
      rMax: 1.7,
      drift: 7,
      parallax: 0.012,
      alpha: 0.72,
      glow: false,
      streak: true,
    },
    {
      divisor: 38000,
      max: 55,
      rMin: 1.2,
      rMax: 2.4,
      drift: 13,
      parallax: 0.026,
      alpha: 0.95,
      glow: true,
      streak: true,
    },
  ];

  var LINK_DISTANCE = 165;
  var LINK_ALPHA = 0.19;

  var PLANET_SPECS = [
    { x: 0.14, y: 0.74, r: 0.26, tint: "violet", parallax: 0.014, ring: false },
    { x: 0.86, y: 0.2, r: 0.12, tint: "accent", parallax: 0.038, ring: true },
    { x: 0.66, y: 1.02, r: 0.34, tint: "teal", parallax: 0.008, ring: false },
  ];

  // ---------------------------------------------------------------------
  // legibility ceiling
  //
  // apps/web puts running text directly over this canvas (portfolio-style
  // "warp between pages" layout, not a game HUD). Stage 2's own contrast
  // audit found that a sustained bright patch (a planet's disc) can push
  // even --text's luminance high enough to drop its contrast against
  // itself to 3.15:1 -- every token/size pair passing against the flat
  // --bg says nothing about what a drifting planet does to it. Ported
  // from portfolio/src/sky.js's u_minLum approach: that solver holds a
  // LIGHT-theme sky above a luminance FLOOR so dark text stays legible.
  // Ours is the mirror image for a dark theme -- a luminance CEILING, so
  // --text (the lightest colour ever set on this canvas) stays >= 4.5:1
  // no matter how bright the sky under it gets.
  //
  // The ceiling is derived from the real WCAG formula, not eyeballed:
  // contrast = (Ltext + 0.05) / (Lbg + 0.05) >= 4.5
  //   => Lbg <= (Ltext + 0.05) / 4.5 - 0.05
  // --text is #eef1f6, whose relative luminance (real piecewise sRGB
  // decode, see relLum01 below) is ~0.878, giving Lbg_max ~0.156.
  //
  // Rather than inverting canvas 2D's gamma-space alpha compositing
  // analytically (sky.js can do this exactly because it owns a WebGL
  // shader; this file is deliberately plain Canvas2D sprite-blitting per
  // its own header), a small feedback controller nudges a darkening
  // scrim toward keeping the sampled worst-case luminance at or below
  // the ceiling, checked a few times a second rather than every frame --
  // reading pixels back from the GPU is the one canvas operation genuinely
  // worth throttling on a phone.
  var LUM_CEILING = 0.156;
  var LUM_SAMPLE_W = 16;
  var LUM_SAMPLE_H = 9;
  var LUM_CHECK_MS = 220;
  var SCRIM_MAX = 0.6;
  var SCRIM_STEP_UP = 0.12;
  var SCRIM_STEP_DOWN = 0.05;

  var scrimAlpha = 0;
  var lumCanvas = null;
  var lumCtx = null;
  var lastLumCheck = -Infinity;

  // ---------------------------------------------------------------------
  // colour helpers
  // ---------------------------------------------------------------------

  function hexToRgb(hex) {
    var h = String(hex).trim().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
  }

  // Real piecewise sRGB decode (not a pow(2.2) shortcut, which over- or
  // under-estimates by several thousandths and is exactly the kind of
  // eyeballing this project has repeatedly caught). Input channels 0-255.
  function relLum01(r, g, b) {
    function lin(c) {
      c = c / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function updateLegibilityScrim(now) {
    if (!canvas || now - lastLumCheck < LUM_CHECK_MS) return;
    lastLumCheck = now;

    if (!lumCanvas) {
      lumCanvas = document.createElement("canvas");
      lumCanvas.width = LUM_SAMPLE_W;
      lumCanvas.height = LUM_SAMPLE_H;
      lumCtx = lumCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (!lumCtx) return;

    lumCtx.clearRect(0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H);
    lumCtx.drawImage(canvas, 0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H);

    var data;
    try {
      data = lumCtx.getImageData(0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H).data;
    } catch (e) {
      // A tainted canvas (e.g. a cross-origin favicon draw upstream, or a
      // browser that refuses readback under some privacy mode) means the
      // ceiling can't be measured. Fail toward the safe side: hold whatever
      // scrim is already set rather than fighting the exception every tick.
      return;
    }

    var maxLum = 0;
    for (var i = 0; i < data.length; i += 4) {
      var l = relLum01(data[i], data[i + 1], data[i + 2]);
      if (l > maxLum) maxLum = l;
    }

    if (maxLum > LUM_CEILING) {
      scrimAlpha = Math.min(scrimAlpha + SCRIM_STEP_UP, SCRIM_MAX);
    } else {
      scrimAlpha = Math.max(scrimAlpha - SCRIM_STEP_DOWN, 0);
    }
  }

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function pick(name, fallback) {
      var v = cs.getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }
    palette.star = pick("--text", "#eef1f6");
    palette.accent = pick("--accent", "#40b0ff");
    palette.gold = pick("--gold", "#e8b64d");
    palette.violet = pick("--group-2", "#a78bfa");
    palette.teal = pick("--group-1", "#5eead4");
    palette.rose = pick("--group-3", "#fb7185");
    palette.void = pick("--void", "#05060b");
  }

  /**
   * Pre-renders a soft radial glow once per colour. Blitting these with
   * drawImage is an order of magnitude cheaper than building a gradient or
   * setting shadowBlur per star, which matters at ~400 stars a frame.
   */
  function makeGlowSprite(hex) {
    var size = 64;
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    grd.addColorStop(0, rgba(hex, 0.95));
    grd.addColorStop(0.18, rgba(hex, 0.42));
    grd.addColorStop(0.45, rgba(hex, 0.1));
    grd.addColorStop(1, rgba(hex, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function buildSprites() {
    sprites = {
      star: makeGlowSprite(palette.star),
      accent: makeGlowSprite(palette.accent),
      gold: makeGlowSprite(palette.gold),
      violet: makeGlowSprite(palette.violet),
      teal: makeGlowSprite(palette.teal),
      rose: makeGlowSprite(palette.rose),
    };
  }

  // ---------------------------------------------------------------------
  // construction
  // ---------------------------------------------------------------------

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeStar(spec) {
    // A small minority of stars take a palette hue. A field of pure white
    // reads as noise; a field of colour reads as a screensaver.
    var tintKey = "star";
    var roll = Math.random();
    if (roll < 0.05) tintKey = "accent";
    else if (roll < 0.07) tintKey = "gold";
    else if (roll < 0.085) tintKey = "violet";
    else if (roll < 0.1) tintKey = "teal";

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: rand(spec.rMin, spec.rMax),
      // Mostly leftward drift with enough vertical jitter that the field
      // never looks like it is on rails.
      vx: -spec.drift * rand(0.6, 1.4),
      vy: spec.drift * rand(-0.35, 0.35),
      phase: Math.random() * Math.PI * 2,
      twinkle: rand(0.4, 1.5),
      tintKey: tintKey,
      tint: palette[tintKey] || palette.star,
    };
  }

  function buildLayers() {
    var area = width * height;
    layers = LAYER_SPECS.map(function (spec) {
      var count = Math.min(spec.max, Math.round(area / spec.divisor));
      var stars = [];
      for (var i = 0; i < count; i++) stars.push(makeStar(spec));
      return { spec: spec, stars: stars };
    });
  }

  /**
   * Renders one planet into its own offscreen canvas: atmosphere halo, lit
   * body, bright limb, and a ring where the spec asks for one.
   *
   * Planets are by far the most expensive thing on this canvas -- two large
   * radial gradients plus big arc fills each -- and their appearance never
   * changes, only their position. Baking each into a sprite once per resize
   * turns all of that into a single drawImage per frame.
   */
  function renderPlanetSprite(spec, r, tint) {
    var pad = r * 1.35;
    var size = Math.ceil(pad * 2);
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var g = c.getContext("2d");
    var cx = pad;
    var cy = pad;

    // Atmosphere: a halo just outside the limb.
    var halo = g.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.3);
    halo.addColorStop(0, rgba(tint, 0.16));
    halo.addColorStop(1, rgba(tint, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    g.fill();

    // Body: lit from the upper left, falling away to the void on the far
    // limb, which is what makes it read as a sphere and not a disc.
    var body = g.createRadialGradient(
      cx - r * 0.4,
      cy - r * 0.4,
      r * 0.05,
      cx,
      cy,
      r,
    );
    body.addColorStop(0, rgba(tint, 0.34));
    body.addColorStop(0.55, rgba(tint, 0.12));
    body.addColorStop(1, rgba(palette.void, 0.62));
    g.fillStyle = body;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();

    // A bright sliver on the lit limb.
    g.strokeStyle = rgba(tint, 0.3);
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 1.72);
    g.stroke();

    if (spec.ring) {
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.42);
      g.strokeStyle = rgba(tint, 0.24);
      g.lineWidth = Math.max(1.5, r * 0.07);
      g.beginPath();
      g.ellipse(0, 0, r * 1.75, r * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    return { canvas: c, size: size, half: pad };
  }

  function buildPlanets() {
    var base = Math.min(width, height);
    planets = PLANET_SPECS.map(function (spec) {
      var r = spec.r * base;
      var tint = palette[spec.tint] || palette.accent;
      return {
        spec: spec,
        cx: spec.x * width,
        cy: spec.y * height,
        r: r,
        tint: tint,
        sprite: renderPlanetSprite(spec, r, tint),
        // A very slow independent drift so the bodies are not pinned to the
        // viewport like wallpaper.
        vx: rand(-1.6, -0.4),
        vy: rand(-0.3, 0.3),
      };
    });
  }

  function spawnComet() {
    // Enter from the top or the left, always heading down-right across the
    // frame, so comets read as one weather system rather than random noise.
    var fromTop = Math.random() < 0.65;
    var speed = rand(260, 460);
    var angle = rand(0.35, 0.72); // radians below horizontal
    var tintKeys = ["star", "accent", "teal", "gold", "rose"];
    var tintKey = tintKeys[Math.floor(Math.random() * tintKeys.length)];

    comets.push({
      x: fromTop ? rand(-0.1, 0.9) * width : -60,
      y: fromTop ? -60 : rand(-0.05, 0.6) * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: rand(2.2, 4.2),
      size: rand(1.6, 3.1),
      len: rand(90, 240),
      tintKey: tintKey,
      tint: palette[tintKey] || palette.star,
    });
  }

  function resize() {
    if (!canvas) return;
    // Capping DPR tighter than the device's own ratio trades a little
    // crispness for fill-rate on the phones this actually has to run on.
    // Was 2; measured against the portfolio's own DPR_CAP and the actual
    // audience (assorted Android phones, several with 3x+ panels), 1.5 is
    // the better trade for a field of sub-pixel dots nobody is examining
    // that closely.
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLayers();
    buildPlanets();
  }

  function wrap(star) {
    var m = 12;
    if (star.x < -m) star.x = width + m;
    else if (star.x > width + m) star.x = -m;
    if (star.y < -m) star.y = height + m;
    else if (star.y > height + m) star.y = -m;
  }

  // ---------------------------------------------------------------------
  // simulation
  // ---------------------------------------------------------------------

  function step(time, deltaMs) {
    // A tab returning from the background can hand over a huge delta; clamp
    // it so the field does not teleport.
    var dt = Math.min(deltaMs || 16.7, 50) / 1000;

    var targetX = pointerX - width / 2;
    var targetY = pointerY - height / 2;
    offsetX += (targetX - offsetX) * Math.min(1, dt * 2.4);
    offsetY += (targetY - offsetY) * Math.min(1, dt * 2.4);

    // Warping accelerates the whole field; converging does too, more gently.
    var speedScale = 1 + converge * 2.2 + hyper * 9;

    for (var li = 0; li < layers.length; li++) {
      var stars = layers[li].stars;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x += s.vx * dt * speedScale;
        s.y += s.vy * dt * speedScale;
        wrap(s);
      }
    }

    for (var p = 0; p < planets.length; p++) {
      var pl = planets[p];
      pl.cx += pl.vx * dt;
      pl.cy += pl.vy * dt;
      var margin = pl.r * 1.5;
      if (pl.cx < -margin) pl.cx = width + margin;
      if (pl.cx > width + margin) pl.cx = -margin;
      if (pl.cy < -margin) pl.cy = height + margin;
      if (pl.cy > height + margin) pl.cy = -margin;
    }

    // Comet spawning is scene-weighted: the games list rains them, the rules
    // screen almost never does.
    cometTimer -= dt * (0.35 + weights.comets * 1.5);
    if (cometTimer <= 0 && comets.length < 4 && weights.comets > 0.05) {
      spawnComet();
      cometTimer = rand(1.4, 4.2);
    }

    var alive = [];
    for (var c = 0; c < comets.length; c++) {
      var comet = comets[c];
      comet.life += dt;
      comet.x += comet.vx * dt;
      comet.y += comet.vy * dt;
      if (
        comet.life < comet.maxLife &&
        comet.x < width + 300 &&
        comet.y < height + 300
      ) {
        alive.push(comet);
      }
    }
    comets = alive;

    draw(time);
  }

  // ---------------------------------------------------------------------
  // drawing
  // ---------------------------------------------------------------------

  function drawnPosition(star, spec, cx, cy) {
    var x = star.x + offsetX * spec.parallax;
    var y = star.y + offsetY * spec.parallax;
    if (converge > 0) {
      x += (cx - x) * converge * 0.55;
      y += (cy - y) * converge * 0.55;
    }
    return { x: x, y: y };
  }

  function drawPlanet(planet) {
    var alpha = weights.planets;
    if (alpha <= 0.01 || !planet.sprite) return;

    var spec = planet.spec;
    var cx = planet.cx + offsetX * spec.parallax;
    var cy = planet.cy + offsetY * spec.parallax;
    var sprite = planet.sprite;

    // Fully off screen? Skip the blit entirely.
    if (
      cx + sprite.half < 0 ||
      cx - sprite.half > width ||
      cy + sprite.half < 0 ||
      cy - sprite.half > height
    ) {
      return;
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.canvas, cx - sprite.half, cy - sprite.half);
    ctx.globalAlpha = 1;
  }

  function drawComet(comet) {
    var alpha = weights.comets;
    if (alpha <= 0.01) return;

    // Fade in over the first fifth of life, out over the last third.
    var t = comet.life / comet.maxLife;
    var fade = Math.min(1, t / 0.2) * Math.min(1, (1 - t) / 0.33);
    if (fade <= 0) return;

    var speed = Math.sqrt(comet.vx * comet.vx + comet.vy * comet.vy) || 1;
    var ux = comet.vx / speed;
    var uy = comet.vy / speed;
    var tailX = comet.x - ux * comet.len;
    var tailY = comet.y - uy * comet.len;

    var grd = ctx.createLinearGradient(comet.x, comet.y, tailX, tailY);
    grd.addColorStop(0, rgba(comet.tint, 0.85 * fade * alpha));
    grd.addColorStop(0.35, rgba(comet.tint, 0.22 * fade * alpha));
    grd.addColorStop(1, rgba(comet.tint, 0));

    ctx.strokeStyle = grd;
    ctx.lineWidth = comet.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(comet.x, comet.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    var sprite = sprites[comet.tintKey] || sprites.star;
    if (sprite) {
      var g = comet.size * 16;
      ctx.globalAlpha = 0.95 * fade * alpha;
      ctx.drawImage(sprite, comet.x - g / 2, comet.y - g / 2, g, g);
      ctx.globalAlpha = 1;
    }
  }

  function paintStar(star, pos, spec, t, cx, cy) {
    var flicker = 0.62 + 0.38 * Math.sin(t * star.twinkle + star.phase);
    var alpha = Math.min(
      1,
      spec.alpha * flicker * weights.stars * (1 + converge * 0.6 + hyper * 0.5),
    );
    if (alpha <= 0.01) return;

    var radius = star.r * (1 + converge * 0.5);

    // Hyperspace: stretch each star into a streak pointing away from the
    // centre, longer the further out it already is. This is the whole warp
    // effect -- the positions barely move, the *shape* does.
    if (hyper > 0.01 && spec.streak) {
      var dx = pos.x - cx;
      var dy = pos.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var streak = hyper * (24 + dist * 0.55) * (0.4 + spec.parallax * 22);
      ctx.strokeStyle = star.tint;
      ctx.globalAlpha = alpha;
      // Thickness ramps with the warp rather than staying at the star's
      // resting weight, so the streaks read as mass being pulled past the
      // camera instead of as hairlines that merely got longer. Scaled off
      // `radius` so the parallax layers stay distinguishable: the near
      // stars thicken most, the far ones stay fine.
      ctx.lineWidth = radius * (1.7 + hyper * 1.8);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + (dx / dist) * streak, pos.y + (dy / dist) * streak);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    if (spec.glow && hyper < 0.15) {
      var sprite = sprites[star.tintKey] || sprites.star;
      if (sprite) {
        var g = radius * 13;
        ctx.globalAlpha = alpha * 0.55;
        ctx.drawImage(sprite, pos.x - g / 2, pos.y - g / 2, g, g);
      }
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = star.tint;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    var cx = width / 2;
    var cy = height / 2;
    var t = time || 0;

    // Planets are drawn with normal compositing, BEFORE the additive pass.
    // They are large opaque-ish bodies that should occlude, not add -- and
    // blitting sprites that big under "lighter" measured catastrophically
    // slow (a 53fps roster against a 6fps game screen), because the large
    // additive blit falls off the fast path.
    ctx.globalCompositeOperation = "source-over";
    for (var pc = 0; pc < planets.length; pc++) drawPlanet(planets[pc]);

    // Additive blending is what makes the star field glow rather than sit
    // flat on the background.
    ctx.globalCompositeOperation = "lighter";

    for (var li = 0; li < layers.length; li++) {
      var layer = layers[li];
      var spec = layer.spec;
      var stars = layer.stars;
      var isNear = li === layers.length - 1;

      if (isNear) {
        var positions = new Array(stars.length);
        for (var p = 0; p < stars.length; p++) {
          positions[p] = drawnPosition(stars[p], spec, cx, cy);
        }

        // Constellation pass first, so the lines sit behind their nodes.
        // Suppressed during a warp: streaking stars plus a link mesh is
        // visual soup.
        var linkAlpha = weights.links * (1 - hyper);
        if (linkAlpha > 0.02) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = palette.accent;
          for (var a = 0; a < positions.length; a++) {
            for (var b = a + 1; b < positions.length; b++) {
              var dx = positions[a].x - positions[b].x;
              var dy = positions[a].y - positions[b].y;
              var distSq = dx * dx + dy * dy;
              if (distSq > LINK_DISTANCE * LINK_DISTANCE) continue;
              var dist = Math.sqrt(distSq);
              var alpha =
                (1 - dist / LINK_DISTANCE) *
                LINK_ALPHA *
                linkAlpha *
                (1 + converge * 3);
              ctx.globalAlpha = Math.min(alpha, 0.85);
              ctx.beginPath();
              ctx.moveTo(positions[a].x, positions[a].y);
              ctx.lineTo(positions[b].x, positions[b].y);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        }

        for (var n = 0; n < stars.length; n++) {
          paintStar(stars[n], positions[n], spec, t, cx, cy);
        }
        continue;
      }

      for (var i = 0; i < stars.length; i++) {
        paintStar(
          stars[i],
          drawnPosition(stars[i], spec, cx, cy),
          spec,
          t,
          cx,
          cy,
        );
      }
    }

    for (var ci = 0; ci < comets.length; ci++) drawComet(comets[ci]);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    updateLegibilityScrim(window.performance ? performance.now() : Date.now());
    if (scrimAlpha > 0.001) {
      ctx.fillStyle = "rgb(5, 6, 11)";
      ctx.globalAlpha = scrimAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------
  // public
  // ---------------------------------------------------------------------

  function applySceneWeights(scene, duration) {
    var target = SCENES[scene] || SCENES.roster;
    var gsap = window.gsap;

    if (!gsap || (window.Motion && window.Motion.isReduced())) {
      weights.stars = target.stars;
      weights.links = target.links;
      weights.comets = target.comets;
      weights.planets = target.planets;
      if (!started) draw(0);
      return;
    }

    gsap.to(weights, {
      stars: target.stars,
      links: target.links,
      comets: target.comets,
      planets: target.planets,
      duration: duration === undefined ? 1.1 : duration,
      ease: "inOutSoft",
      overwrite: true,
    });
  }

  function setScene(scene) {
    if (!SCENES[scene]) return;
    currentScene = scene;
    document.documentElement.setAttribute("data-scene", scene);
    applySceneWeights(scene);
  }

  // Per-module tint for the "sesi" scene, distinct from each scene's own
  // static hueShift field above (which nothing consumes and this does not
  // touch): four modules sharing one quiet scene still read as
  // interchangeable without something distinguishing which one is
  // actually running, so a session's module number nudges the aurora's
  // hue a little rather than repainting it outright -- cosmos.css scopes
  // the actual filter to [data-scene="sesi"] only, so this variable does
  // nothing on any other screen.
  var MODULE_HUE_DEG = { 1: 0, 2: 18, 3: 36, 4: 54 };

  function setModuleTint(modul) {
    var deg = MODULE_HUE_DEG[modul] || 0;
    document.documentElement.style.setProperty("--modul-hue", deg + "deg");
  }

  /**
   * The screen-change transition: punch into hyperspace, swap the sky at the
   * peak (while the streaks hide the change), then decelerate out.
   */
  function warpTo(scene) {
    var gsap = window.gsap;
    var reduced = window.Motion && window.Motion.isReduced();

    if (!SCENES[scene]) scene = "roster";
    if (!gsap || reduced) {
      setScene(scene);
      return;
    }

    // Re-entering the same screen should not re-fire the whole effect.
    if (scene === currentScene && hyper > 0.01) return;

    currentScene = scene;
    document.documentElement.setAttribute("data-scene", scene);

    // Lets the CSS layers surge along with the canvas: the aurora flares, the
    // circuit grid brightens, the nebula swells. Without this the warp would
    // read as a canvas effect sitting on top of a static page.
    document.documentElement.setAttribute("data-warp", "on");

    var state = { v: hyper };
    gsap.killTweensOf(state);
    gsap
      .timeline({
        onComplete: function () {
          document.documentElement.removeAttribute("data-warp");
        },
      })
      .to(state, {
        v: 1,
        duration: 0.34,
        ease: "power2.in",
        onUpdate: function () {
          hyper = state.v;
        },
      })
      .add(function () {
        // Swapped under cover of the streaks.
        applySceneWeights(scene, 0.8);
        document.documentElement.removeAttribute("data-warp");
      })
      .to(state, {
        v: 0,
        duration: 1.15,
        ease: "outExpo",
        onUpdate: function () {
          hyper = state.v;
        },
      });
  }

  /**
   * Pulls the whole field toward the centre and brightens the constellation
   * lines, then releases. The champion takeover fires this as its opening
   * beat. No-ops without GSAP or under reduced motion, so callers can invoke
   * it unconditionally.
   */
  function convergeIn(options) {
    var opts = options || {};
    var gsap = window.gsap;
    if (!gsap || (window.Motion && window.Motion.isReduced())) return;

    var state = { v: 0 };
    gsap.killTweensOf(state);
    gsap
      .timeline()
      .to(state, {
        v: 1,
        duration: opts.inDuration || 1.1,
        ease: "outExpo",
        onUpdate: function () {
          converge = state.v;
        },
      })
      .to(
        state,
        {
          v: 0,
          duration: opts.outDuration || 2.4,
          ease: "inOutSoft",
          onUpdate: function () {
            converge = state.v;
          },
        },
        opts.hold === undefined ? "+=0.5" : "+=" + opts.hold,
      );
  }

  // Whether the one-time canvas setup (sprite baking, first resize, the
  // resize/pointermove listeners) has run yet. Kept separate from
  // `started` (which tracks the ticker subscription) because apps/web's
  // probe can grant tier 2 well after init() first runs -- see
  // motion-tier.ts's pessimistic-interim design, chosen specifically so
  // the probe's own measurement never runs concurrently with a live
  // starfield ticker it would then be measuring the COMBINED cost of.
  var canvasReady = false;

  function setUpCanvas() {
    if (canvasReady) return;
    canvasReady = true;

    readPalette();
    buildSprites();
    resize();

    pointerX = width / 2;
    pointerY = height / 2;

    document.documentElement.setAttribute("data-scene", currentScene);

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        if (!started) draw(0);
      }, 150);
    });

    // Pointer parallax is a nicety, not a feature: skip it entirely on touch,
    // where there is no hover and the listener would only cost battery.
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
      window.addEventListener(
        "pointermove",
        function (evt) {
          pointerX = evt.clientX;
          pointerY = evt.clientY;
        },
        { passive: true },
      );
    }
  }

  function tierAllows() {
    return !window.Motion || window.Motion.getTier() >= 2;
  }

  // Brings the canvas up to whatever started/frozen state its current
  // tier and reduced-motion status call for. Safe to call repeatedly and
  // from either direction (a downgrade or an upgrade), which is exactly
  // what it has to do: apps/web's tier can only ever be set once
  // synchronously (a cache hit, or a declared-weak device) or resolve
  // asynchronously a few hundred milliseconds later (a still-probing
  // device), and either one can also flip with reduced motion at any
  // point after that.
  function syncToCapability() {
    if (!tierAllows()) {
      if (started) {
        started = false;
        window.Motion.offTick(step);
      }
      // Below tier 2, no canvas content is the whole point -- cosmos.css's
      // CSS-only layers carry the sky at tiers 0 and 1. Only clear if
      // setup ever ran; skipping it otherwise avoids touching ctx before
      // it exists.
      if (canvasReady) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    setUpCanvas();

    if (window.Motion && window.Motion.isReduced()) {
      if (started) {
        started = false;
        window.Motion.offTick(step);
      }
      draw(0);
      return;
    }

    if (!started) {
      started = true;
      window.Motion.onTick(step);
    }
  }

  function init() {
    canvas = document.getElementById("cosmos-stars");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.Motion) {
      // Reacts to EITHER axis changing, in either direction: reduced
      // motion relaxing or tightening, and the capability tier being
      // granted (a still-probing device's measurement finishing) or
      // withdrawn. apps/games never calls Motion.setTier, so
      // window.Motion.getTier() there is always 2 and tierAllows() is
      // always true -- unchanged behaviour for that app; only
      // onReducedChange ever fires for it, exactly as before this axis
      // existed.
      window.Motion.onReducedChange(syncToCapability);
      window.Motion.onTierChange(syncToCapability);
    }

    syncToCapability();
  }

  window.Cosmos = {
    warpTo: warpTo,
    setScene: setScene,
    setModuleTint: setModuleTint,
    converge: convergeIn,
    redraw: function () {
      draw(0);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
