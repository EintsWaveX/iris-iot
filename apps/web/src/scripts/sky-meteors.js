/**
 * Shooting stars (Phase 8, apps/web only).
 *
 * cosmos.core.js already has slow comets, but it is shared with apps/games
 * and stays untouched. This is a separate, lightweight canvas layer with
 * three things the sky was missing:
 *
 * - meteors: a quick, thin streak with a bright head and a fading tail,
 *   crossing part of the sky in well under a second;
 * - fireballs (about one in fourteen): slower and brighter, shedding sparks
 *   that drift down and fade;
 * - showers: a handful of meteors radiating from one point within a couple
 *   of seconds, now and then;
 * - glints: every few seconds one star flares into a four-point sparkle.
 *
 * How often each happens depends on the scene on <html data-scene>: the
 * front door is lively, working pages are calmer, and a running practicum
 * ("sesi") gets only the odd meteor so the sky never competes with the work.
 *
 * Motion tier 1 or higher without reduced motion. The loop sleeps between
 * events instead of drawing empty frames, and pauses while the tab is hidden.
 */
(function () {
  "use strict";

  var canvas = document.querySelector(".cosmos__meteors");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var root = document.documentElement;

  // Mean seconds between single meteors, and between showers (0 = never).
  var RATES = {
    beranda: { meteor: 3.2, shower: 55, glint: 2.5 },
    masuk: { meteor: 7, shower: 0, glint: 4 },
    kerja: { meteor: 6.5, shower: 150, glint: 4 },
    teknis: { meteor: 8, shower: 200, glint: 5 },
    sesi: { meteor: 24, shower: 0, glint: 9 },
  };
  var DEFAULT_RATE = { meteor: 7, shower: 180, glint: 5 };

  var TINTS = ["#ffffff", "#bfe6ff", "#c9f7ee", "#ded4ff", "#ffe7b8"];

  var width = 0;
  var height = 0;
  var dpr = 1;
  var meteors = [];
  var sparks = [];
  var glints = [];
  var running = false;
  var rafId = 0;
  var sleepId = 0;
  var last = 0;
  var nextMeteor = 0;
  var nextShower = 0;
  var nextGlint = 0;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function rate() {
    return RATES[root.getAttribute("data-scene") || ""] || DEFAULT_RATE;
  }

  // Exponential gaps read as natural randomness; clamp the tail so a long
  // silence never happens by pure chance.
  function gap(mean) {
    return Math.min(mean * 3, -Math.log(1 - Math.random()) * mean);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnMeteor(opts) {
    opts = opts || {};
    var fire = opts.fire !== undefined ? opts.fire : Math.random() < 0.07;
    var leftward = opts.leftward !== undefined ? opts.leftward : Math.random() < 0.5;
    var ang = opts.angle !== undefined ? opts.angle : rnd(0.42, 0.95);
    if (leftward && opts.angle === undefined) ang = Math.PI - ang;
    var speed = fire ? rnd(520, 760) : rnd(900, 1500);
    meteors.push({
      x: opts.x !== undefined ? opts.x : rnd(0.08, 0.92) * width,
      y: opts.y !== undefined ? opts.y : rnd(0.02, 0.45) * height,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0,
      max: fire ? rnd(1.3, 1.9) : rnd(0.45, 0.95),
      len: fire ? rnd(220, 340) : rnd(110, 260),
      w: fire ? rnd(2.2, 3.2) : rnd(0.9, 1.7),
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      fire: fire,
      shed: 0,
    });
  }

  function spawnShower() {
    var rx = rnd(0.2, 0.8) * width;
    var ry = rnd(-0.05, 0.12) * height;
    var n = Math.round(rnd(4, 7));
    var base = rnd(0.9, 2.2);
    for (var i = 0; i < n; i++) {
      (function (delay) {
        setTimeout(function () {
          if (!running) return;
          var a = base + rnd(-0.55, 0.55);
          spawnMeteor({
            x: rx + Math.cos(a) * rnd(20, 90),
            y: ry + Math.sin(a) * rnd(20, 90),
            angle: a,
            fire: false,
          });
          wake();
        }, delay);
      })(i * rnd(180, 480));
    }
  }

  function spawnGlint() {
    glints.push({
      x: rnd(0.05, 0.95) * width,
      y: rnd(0.04, 0.6) * height,
      life: 0,
      max: rnd(0.9, 1.5),
      r: rnd(7, 13),
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    });
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function drawMeteor(m) {
    var k = m.life / m.max;
    var alpha = k < 0.12 ? k / 0.12 : k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
    var sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy) || 1;
    var ux = m.vx / sp;
    var uy = m.vy / sp;
    var len = m.len * Math.min(1, k * 4);
    var tx = m.x - ux * len;
    var ty = m.y - uy * len;
    var g = ctx.createLinearGradient(m.x, m.y, tx, ty);
    g.addColorStop(0, hexA(m.tint, 0.95 * alpha));
    g.addColorStop(0.25, hexA(m.tint, 0.35 * alpha));
    g.addColorStop(1, hexA(m.tint, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = m.w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    var hr = m.w * (m.fire ? 7 : 4.5);
    var h = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, hr);
    h.addColorStop(0, "rgba(255,255,255," + 0.95 * alpha + ")");
    h.addColorStop(0.35, hexA(m.tint, 0.5 * alpha));
    h.addColorStop(1, hexA(m.tint, 0));
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(m.x, m.y, hr, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGlint(gl) {
    var k = gl.life / gl.max;
    var a = Math.sin(Math.PI * k);
    var r = gl.r * (0.6 + 0.4 * a);
    ctx.save();
    ctx.translate(gl.x, gl.y);
    ctx.rotate(k * 0.6);
    ctx.fillStyle = hexA(gl.tint, 0.85 * a);
    for (var i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r * 0.12);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r * 0.12);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.fill();
      ctx.rotate(Math.PI / 2);
    }
    var h = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    h.addColorStop(0, "rgba(255,255,255," + 0.9 * a + ")");
    h.addColorStop(1, hexA(gl.tint, 0));
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function schedule(now) {
    var r = rate();
    nextMeteor = now + gap(r.meteor) * 1000;
    nextShower = r.shower ? now + gap(r.shower) * 1000 : Infinity;
    nextGlint = now + gap(r.glint) * 1000;
  }

  function busy() {
    return meteors.length > 0 || sparks.length > 0 || glints.length > 0;
  }

  function frame(now) {
    rafId = 0;
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    var r = rate();

    if (now >= nextMeteor) {
      spawnMeteor();
      nextMeteor = now + gap(r.meteor) * 1000;
    }
    if (now >= nextShower) {
      spawnShower();
      nextShower = r.shower ? now + gap(r.shower) * 1000 : Infinity;
    }
    if (now >= nextGlint) {
      spawnGlint();
      nextGlint = now + gap(r.glint) * 1000;
    }

    ctx.clearRect(0, 0, width, height);

    var alive = [];
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.fire) {
        m.shed += dt;
        while (m.shed > 0.018) {
          m.shed -= 0.018;
          sparks.push({
            x: m.x,
            y: m.y,
            vx: m.vx * 0.08 + rnd(-40, 40),
            vy: m.vy * 0.08 + rnd(-20, 40),
            life: 0,
            max: rnd(0.4, 0.9),
            tint: m.tint,
          });
        }
      }
      if (m.life < m.max) {
        drawMeteor(m);
        alive.push(m);
      }
    }
    meteors = alive;

    var liveSparks = [];
    for (var s = 0; s < sparks.length; s++) {
      var p = sparks[s];
      p.life += dt;
      p.vy += 90 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life < p.max) {
        ctx.fillStyle = hexA(p.tint, 0.8 * (1 - p.life / p.max));
        ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
        liveSparks.push(p);
      }
    }
    sparks = liveSparks;

    var liveGlints = [];
    for (var g = 0; g < glints.length; g++) {
      var gl = glints[g];
      gl.life += dt;
      if (gl.life < gl.max) {
        drawGlint(gl);
        liveGlints.push(gl);
      }
    }
    glints = liveGlints;

    if (busy()) {
      rafId = requestAnimationFrame(frame);
    } else {
      // Nothing on screen: sleep until the next event is due.
      last = 0;
      var due = Math.min(nextMeteor, nextShower, nextGlint) - performance.now();
      sleepId = setTimeout(wake, Math.max(16, due));
    }
  }

  function wake() {
    if (!running || rafId) return;
    clearTimeout(sleepId);
    rafId = requestAnimationFrame(frame);
  }

  function allowed() {
    return (
      !!window.Motion &&
      window.Motion.getTier() >= 1 &&
      !window.Motion.isReduced() &&
      !document.hidden
    );
  }

  function sync() {
    if (allowed()) {
      if (running) return;
      running = true;
      last = 0;
      resize();
      schedule(performance.now());
      wake();
    } else {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      clearTimeout(sleepId);
      meteors = [];
      sparks = [];
      glints = [];
      ctx.clearRect(0, 0, width, height);
    }
  }

  if (window.Motion) {
    window.Motion.onTierChange(sync);
    window.Motion.onReducedChange(sync);
  }
  document.addEventListener("visibilitychange", sync);

  // A scene change reschedules, so arriving on the front door does not wait
  // out a gap that was rolled for a quiet working page.
  new MutationObserver(function () {
    if (running) schedule(performance.now());
  }).observe(root, { attributes: true, attributeFilter: ["data-scene"] });

  var resizeTimer = null;
  window.addEventListener(
    "resize",
    function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    },
    { passive: true },
  );

  sync();
})();
