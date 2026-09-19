/**
 * Perburuan LoRa IRIS - the cosmos: starfield, constellations, comets,
 * planets, and the warp transition between screens.
 *
 * Adapted from games/src/cosmos.js; the rendering engine is unchanged and
 * only the per-screen scene weights were retargeted. Every screen gets its
 * own sky. Switching tabs fires a hyperspace warp -- the stars stretch into
 * radial streaks, the scene weights cross-fade, then the field decelerates
 * into the new arrangement -- so navigation reads as travelling somewhere
 * rather than as a panel swap.
 *
 *   Perburuan  a live field, comets running for the groups on the hunt
 *   Lapisan    quiet and sparse, so the dense layer text carries the screen
 *   Panggung   bright and dense, built to read from the back of the room
 *   Ditemukan  everything at once, the takeover when a beacon is found
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
    void: "#05060b"
  };

  var sprites = {};

  // ---------------------------------------------------------------------
  // scenes
  // ---------------------------------------------------------------------

  // Weights are multipliers, cross-faded by GSAP on every scene change, so a
  // screen switch is a dissolve between skies rather than a hard cut.
  // One sky per screen of the hunt. "found" is the takeover moment, so it is
  // the brightest and busiest; "layers" is the quietest because the layer
  // panel is dense text that the background must not compete with.
  var SCENES = {
    hunt: { stars: 1.0, links: 0.55, comets: 0.6, planets: 0.15, hueShift: 0 },
    layers: { stars: 0.5, links: 0.3, comets: 0.1, planets: 0.1, hueShift: 2 },
    stage: { stars: 1.1, links: 0.2, comets: 0.8, planets: 0.4, hueShift: 3 },
    found: { stars: 1.3, links: 1.0, comets: 1.0, planets: 0.5, hueShift: 4 },
    // Awards sits just below the champion moment: brighter than the working
    // screens, quieter than the takeover it usually follows.
    awards: { stars: 1.15, links: 0.7, comets: 0.7, planets: 0.45, hueShift: 4 },
    // The assistant screen is a work surface. Everything recedes so a
    // photograph being judged is the brightest thing on it.
    assist: { stars: 0.35, links: 0.15, comets: 0.05, planets: 0.05, hueShift: 1 }
  };

  var weights = {
    stars: SCENES.hunt.stars,
    links: SCENES.hunt.links,
    comets: SCENES.hunt.comets,
    planets: SCENES.hunt.planets
  };

  var currentScene = "hunt";

  var LAYER_SPECS = [
    { divisor: 9000, max: 260, rMin: 0.4, rMax: 1.0, drift: 3, parallax: 0.004, alpha: 0.5, glow: false, streak: false },
    { divisor: 22000, max: 110, rMin: 0.8, rMax: 1.7, drift: 7, parallax: 0.012, alpha: 0.72, glow: false, streak: true },
    { divisor: 38000, max: 55, rMin: 1.2, rMax: 2.4, drift: 13, parallax: 0.026, alpha: 0.95, glow: true, streak: true }
  ];

  var LINK_DISTANCE = 165;
  var LINK_ALPHA = 0.19;

  var PLANET_SPECS = [
    { x: 0.14, y: 0.74, r: 0.26, tint: "violet", parallax: 0.014, ring: false },
    { x: 0.86, y: 0.2, r: 0.12, tint: "accent", parallax: 0.038, ring: true },
    { x: 0.66, y: 1.02, r: 0.34, tint: "teal", parallax: 0.008, ring: false }
  ];

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
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
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
      rose: makeGlowSprite(palette.rose)
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
      tint: palette[tintKey] || palette.star
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
    var body = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.05, cx, cy, r);
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
        vy: rand(-0.3, 0.3)
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
      tint: palette[tintKey] || palette.star
    });
  }

  function resize() {
    if (!canvas) return;
    // Capping DPR at 2 halves the fill cost on 3x phones for no visible loss
    // on a field of sub-pixel dots.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      spec.alpha * flicker * weights.stars * (1 + converge * 0.6 + hyper * 0.5)
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
    for (var pi = 0; pi < planets.length; pi++) drawPlanet(planets[pi]);

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
                (1 - dist / LINK_DISTANCE) * LINK_ALPHA * linkAlpha * (1 + converge * 3);
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
        paintStar(stars[i], drawnPosition(stars[i], spec, cx, cy), spec, t, cx, cy);
      }
    }

    for (var ci = 0; ci < comets.length; ci++) drawComet(comets[ci]);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------
  // public
  // ---------------------------------------------------------------------

  function applySceneWeights(scene, duration) {
    var target = SCENES[scene] || SCENES.hunt;
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
      overwrite: true
    });
  }

  function setScene(scene) {
    if (!SCENES[scene]) return;
    currentScene = scene;
    document.documentElement.setAttribute("data-scene", scene);
    applySceneWeights(scene);
  }

  /**
   * The screen-change transition: punch into hyperspace, swap the sky at the
   * peak (while the streaks hide the change), then decelerate out.
   */
  function warpTo(scene) {
    var gsap = window.gsap;
    var reduced = window.Motion && window.Motion.isReduced();

    if (!SCENES[scene]) scene = "hunt";
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
        }
      })
      .to(state, {
        v: 1,
        duration: 0.34,
        ease: "power2.in",
        onUpdate: function () {
          hyper = state.v;
        }
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
        }
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
        }
      })
      .to(
        state,
        {
          v: 0,
          duration: opts.outDuration || 2.4,
          ease: "inOutSoft",
          onUpdate: function () {
            converge = state.v;
          }
        },
        opts.hold === undefined ? "+=0.5" : "+=" + opts.hold
      );
  }

  function init() {
    canvas = document.getElementById("cosmos-stars");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;

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
        { passive: true }
      );
    }

    if (window.Motion && window.Motion.isReduced()) {
      draw(0);
      // If the viewer relaxes the preference mid-session, come to life.
      window.Motion.onReducedChange(function (isReduced) {
        if (isReduced || started) return;
        started = true;
        window.Motion.onTick(step);
      });
      return;
    }

    started = true;
    if (window.Motion) window.Motion.onTick(step);
  }

  window.Cosmos = {
    warpTo: warpTo,
    setScene: setScene,
    converge: convergeIn,
    redraw: function () {
      draw(0);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
