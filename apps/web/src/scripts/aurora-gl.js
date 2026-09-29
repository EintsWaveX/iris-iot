/**
 * The moving aurora: WebGL curtains at motion tier 2 (P6.4, rebuilt in
 * Phase 8 to look like the real thing).
 *
 * A real aurora is not a soft glow. It is a set of curtains, each hanging
 * from a sharp, bright lower hem that wanders across the sky, with fine
 * vertical rays rising from that hem and fading upward, slow folds that
 * travel along the curtain, and brightness surges that ripple sideways. The
 * colour changes with height: the hem is the scene's base hue (and nearly
 * white where it is brightest), the tops shift toward the next hues around
 * the wheel. That is what the shader below draws, three curtains deep.
 *
 * The canvas covers the whole sky now (Cosmos.astro moved it out of the
 * bottom-band .cosmos__aurora box). It renders at a reduced internal
 * resolution and is upscaled by the browser: the curtains are soft enough
 * that nobody can tell, and it keeps the fragment cost low.
 *
 * Unchanged from P6.4: apps/web only (apps/games has no canvas for it to
 * find), never touches cosmos.core.js, reads colour and intensity from the
 * SAME CSS custom properties the ray layer uses (--au-1 hue, --au-opacity,
 * --modul-hue tint) through one MutationObserver on <html>, and runs only
 * at motion tier 2 without reduced motion.
 */
(function () {
  "use strict";

  var VERT = ["attribute vec2 a_pos;", "void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }"].join(
    "\n",
  );

  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",

    "uniform vec2  u_res;",
    "uniform float u_time;",
    "uniform float u_fade;",
    "uniform float u_intensity;",
    "uniform float u_hueBase;",
    "uniform float u_tint;",
    "uniform vec3  u_seed;",
    "uniform vec3  u_speed;",

    "float hash21(vec2 p) {",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",

    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i);",
    "  float b = hash21(i + vec2(1.0, 0.0));",
    "  float c = hash21(i + vec2(0.0, 1.0));",
    "  float d = hash21(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",

    "float fbm(vec2 p) {",
    "  float s = 0.0;",
    "  float a = 0.5;",
    "  for (int i = 0; i < 4; i++) {",
    "    s += a * vnoise(p);",
    "    p = p * 2.03 + vec2(17.1, 9.7);",
    "    a *= 0.5;",
    "  }",
    "  return s / 0.9375;",
    "}",

    "vec3 hue2rgb(float h) {",
    "  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);",
    "  return clamp(min(k, 4.0 - k), 0.0, 1.0);",
    "}",

    // One curtain. base = height of the hem (0 bottom, 1 top), amp = how far
    // the hem wanders, len = how tall the rays reach above it.
    "vec3 curtain(vec2 uv, float aspect, float t, float seed, float hue, float spd, float base, float amp, float len) {",
    "  float x = uv.x * aspect;",
    // Folds: a slow sideways displacement that grows with height, so the
    // curtain leans and ripples instead of standing like a wall.
    "  float fold = (fbm(vec2(x * 0.45 + seed, t * 0.03 * spd)) - 0.5) * 2.4;",
    "  float xf = x + fold * (0.45 + uv.y * 0.9);",
    "  float hem = base + amp * (fbm(vec2(xf * 0.85 + seed * 1.7, t * 0.045 * spd)) - 0.5) * 2.0;",
    "  float d = uv.y - hem;",
    "  float up = exp(-max(d, 0.0) / len);",
    "  float down = exp(-max(-d, 0.0) / 0.03);",
    "  float prof = d > 0.0 ? up : down;",
    "  float edge = exp(-abs(d) / 0.016);",
    // Rays: noise that varies fast along x and barely along y, drifting
    // sideways at two speeds so they shimmer rather than slide as one.
    "  float r1 = vnoise(vec2(xf * 34.0 + t * 0.55 * spd, uv.y * 1.3 + seed));",
    "  float r2 = vnoise(vec2(xf * 83.0 - t * 0.85 * spd, uv.y * 2.1 + seed + 3.1));",
    "  float rays = 0.10 + 1.25 * pow(r1 * 0.62 + r2 * 0.38, 2.2);",
    // Brightness pockets travel along the curtain; surges ripple through.
    "  float pocket = smoothstep(0.32, 0.84, fbm(vec2(xf * 1.5 - t * 0.085 * spd, seed + t * 0.018)));",
    "  float surge = 0.72 + 0.28 * sin(t * 0.65 * spd + xf * 2.4 + seed);",
    "  float a = prof * rays * pocket * surge + edge * pocket * 0.32;",
    "  float h = fract(hue + clamp(d, 0.0, 0.55) * 0.5);",
    "  vec3 c = hue2rgb(h);",
    "  c = mix(c, vec3(1.0), edge * pocket * 0.4);",
    "  return c * a;",
    "}",

    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    "  float aspect = u_res.x / max(u_res.y, 1.0);",
    "  float t = u_time;",
    "  float h0 = fract(u_hueBase + u_tint);",
    "  vec3 col = vec3(0.0);",
    "  col += curtain(uv, aspect, t, u_seed.x, h0, u_speed.x, 0.30, 0.11, 0.30) * 0.85;",
    "  col += curtain(uv, aspect, t, u_seed.y, fract(h0 + 0.33), u_speed.y, 0.44, 0.13, 0.22) * 0.62;",
    "  col += curtain(uv, aspect, t, u_seed.z, fract(h0 + 0.66), u_speed.z, 0.20, 0.08, 0.38) * 0.5;",
    // Keep the very top of the page (the nav) clear, and lay a faint glow
    // of the base hue along the horizon underneath the curtains.
    "  col *= smoothstep(0.98, 0.58, uv.y);",
    "  col += hue2rgb(h0) * 0.045 * smoothstep(0.45, 0.0, uv.y);",
    /* Zero alpha under premultiplied blending is pure addition, which is
       what lets the curtains glow over the page instead of sitting on it
       as an opaque layer. */
    "  gl_FragColor = vec4(col * 1.45 * u_intensity * u_fade, 0.0);",
    "}",
  ].join("\n");

  var canvas = document.querySelector(".cosmos__aurora-gl");
  if (!canvas) return;

  if (typeof window.WebGLRenderingContext === "undefined") return;

  var gl = null;
  try {
    var opts = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  } catch (e) {
    gl = null;
  }
  if (!gl) return;

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uFade = gl.getUniformLocation(prog, "u_fade");
  var uIntensity = gl.getUniformLocation(prog, "u_intensity");
  var uHueBase = gl.getUniformLocation(prog, "u_hueBase");
  var uTint = gl.getUniformLocation(prog, "u_tint");

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  // Rolled once per load: unlike speeds so the three curtains slide past
  // each other rather than moving as one sheet.
  gl.uniform3f(gl.getUniformLocation(prog, "u_seed"), rnd(0, 60), rnd(0, 60), rnd(0, 60));
  gl.uniform3f(
    gl.getUniformLocation(prog, "u_speed"),
    rnd(0.75, 1.25),
    rnd(0.55, 1.05),
    rnd(0.9, 1.5),
  );

  gl.clearColor(0, 0, 0, 0);

  // Internal resolution relative to CSS pixels. The curtains are soft, so
  // 0.6 of the device's own density (capped) is indistinguishable and a
  // fraction of the fragment work.
  var RES_SCALE = 0.6;
  var DPR_CAP = 1.5;
  var width = 0;
  var height = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * RES_SCALE;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }

  // ---- colour: read from the same CSS the tier-1 ray layer already uses --
  var root = document.documentElement;
  var targetIntensity = 0.7;
  var targetHue = 0;
  var curIntensity = targetIntensity;
  var curHue = targetHue;
  var curTint = 0;

  function rgbStringToHue(rgb) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(rgb || "");
    if (!m) return 0;
    var r = parseFloat(m[1]) / 255;
    var g = parseFloat(m[2]) / 255;
    var b = parseFloat(m[3]) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    if (d === 0) return 0;
    var h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h / 6;
    return h < 0 ? h + 1 : h;
  }

  function readSceneVars() {
    var cs = getComputedStyle(root);
    var opacity = parseFloat(cs.getPropertyValue("--au-opacity"));
    targetIntensity = isNaN(opacity) ? 0.7 : opacity;
    targetHue = rgbStringToHue(cs.getPropertyValue("--au-1"));
    var hueDeg = parseFloat(cs.getPropertyValue("--modul-hue"));
    curTint = isNaN(hueDeg) ? 0 : hueDeg / 360;
  }

  readSceneVars();

  new MutationObserver(readSceneVars).observe(root, {
    attributes: true,
    attributeFilter: ["data-scene", "style"],
  });

  // ---- motion-tier + reduced-motion gating (mirrors cosmos.core.js's own) --
  var running = false;
  var rafId = 0;
  var start = 0;
  var fade = 0;
  var lit = false;

  function tierAllows() {
    return !!window.Motion && window.Motion.getTier() >= 2 && !window.Motion.isReduced();
  }

  function frame(now) {
    if (!running) return;
    if (!start) start = now;
    var t = (now - start) / 1000;

    // Ease toward the current scene's hue and intensity, so a scene change
    // blends over about a second instead of snapping.
    curIntensity += (targetIntensity - curIntensity) * 0.03;
    var hueDelta = targetHue - curHue;
    if (hueDelta > 0.5) hueDelta -= 1;
    if (hueDelta < -0.5) hueDelta += 1;
    curHue = (curHue + hueDelta * 0.03 + 1) % 1;

    fade = Math.min(1, fade + 0.015);

    resize();
    gl.uniform1f(uTime, t);
    gl.uniform1f(uFade, fade);
    gl.uniform1f(uIntensity, curIntensity);
    gl.uniform1f(uHueBase, curHue);
    gl.uniform1f(uTint, curTint);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!lit) {
      lit = true;
      root.classList.add("aurora-gl-on");
      canvas.classList.add("lit");
    }
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running || !tierAllows()) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function syncToCapability() {
    if (tierAllows()) {
      play();
    } else {
      pause();
      if (lit) {
        lit = false;
        fade = 0;
        root.classList.remove("aurora-gl-on");
        canvas.classList.remove("lit");
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
  }

  if (window.Motion) {
    window.Motion.onTierChange(syncToCapability);
    window.Motion.onReducedChange(syncToCapability);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pause();
    else syncToCapability();
  });

  var resizeTimer = null;
  window.addEventListener(
    "resize",
    function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    },
    { passive: true },
  );

  resize();
  syncToCapability();
})();
