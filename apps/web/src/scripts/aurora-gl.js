/**
 * P6.4: the moving aurora. WebGL curtains at motion tier 2, ported from
 * ../../../../../../Documents/WebApps/portfolio/src/sky.js -- its aurora
 * only (the fbm curtain() x3 and the premultiplied additive night output).
 * The portfolio's stars, comets, clouds and sun are deliberately left
 * behind: this app already has its own canvas star layer
 * (packages/kosmik/js/cosmos.core.js), and apps/web is dark-only, so there
 * is no day branch to port.
 *
 * This file is apps/web-only (imported from Cosmos.astro's own <script>,
 * not from cosmos-web.js, which packages/kosmik/js/cosmos.core.js and
 * motion.core.js are shared through with apps/games). It never modifies
 * cosmos.core.js: instead of cosmos.core.js's setScene()/setModuleTint()
 * calling into this module directly, this module watches the same
 * `data-scene` attribute and `--modul-hue` custom property those functions
 * already write to `<html>`, via one MutationObserver -- so apps/games,
 * which has neither this file nor a `.cosmos__aurora-gl` canvas for it to
 * find, is unaffected by this stage in every way, not merely "untouched by
 * convention".
 *
 * Colour and intensity are read from the SAME CSS custom properties the
 * ray-based tier-1 layer already defines per scene (--au-1 for hue,
 * --au-opacity for intensity, --modul-hue for the per-module tint) rather
 * than a second, duplicated palette -- cosmos.css stays the one place a
 * scene's aurora colour is actually declared.
 */
(function () {
  "use strict";

  var VERT = ["attribute vec2 a_pos;", "void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }"].join(
    "\n",
  );

  // hash21/vnoise/fbm/hue2rgb/curtain are byte-for-byte the portfolio's own
  // (sky.js), since they are pure math with nothing day/night- or star/comet-
  // specific about them. main() below is new: night's premultiplied-additive
  // three-curtain sum only.
  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",

    "uniform vec2  u_res;",
    "uniform float u_time;",
    "uniform float u_fade;",
    "uniform float u_height;",
    "uniform float u_intensity;",
    "uniform float u_hueBase;",
    "uniform float u_tint;",
    "uniform vec3  u_seed;",
    "uniform vec3  u_speed;",
    "uniform vec3  u_freq;",

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
    "  for (int i = 0; i < 5; i++) {",
    "    s += a * vnoise(p);",
    "    p = p * 2.03 + vec2(17.1, 9.7);",
    "    a *= 0.5;",
    "  }",
    "  return s;",
    "}",

    "vec3 hue2rgb(float h) {",
    "  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);",
    "  return clamp(min(k, 4.0 - k), 0.0, 1.0);",
    "}",

    "vec4 curtain(vec2 uv, float t, float seed, float baseHue, float speed, float freq) {",
    "  float warp = fbm(vec2(uv.y * 1.8 + seed, t * speed * 0.35 + seed)) * 2.0 - 1.0;",
    "  float x = uv.x * freq + warp * 2.1 + t * speed * 0.10 + seed;",
    "  float f = fbm(vec2(x * 1.9, uv.y * 1.15 - t * speed * 0.45 + seed));",
    "  float band = pow(smoothstep(0.30, 0.86, f), 1.45);",
    "  float vfade = smoothstep(u_height, 0.0, uv.y);",
    "  float hue = fract(baseHue + uv.x * 0.30 + warp * 0.07 + t * 0.015 * speed);",
    "  return vec4(hue2rgb(hue), band * vfade);",
    "}",

    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    "  float h0 = fract(u_hueBase + u_tint);",
    "  float h1 = fract(u_hueBase + u_tint + 0.30);",
    "  float h2 = fract(u_hueBase + u_tint + 0.62);",
    "  vec4 c1 = curtain(uv, u_time, u_seed.x, h0, u_speed.x, u_freq.x);",
    "  vec4 c2 = curtain(uv, u_time, u_seed.y, h1, u_speed.y, u_freq.y);",
    "  vec4 c3 = curtain(uv, u_time, u_seed.z, h2, u_speed.z, u_freq.z);",
    "  vec3 col = vec3(0.0);",
    "  col += c1.rgb * c1.a * 0.30 * u_intensity;",
    "  col += c2.rgb * c2.a * 0.27 * u_intensity;",
    "  col += c3.rgb * c3.a * 0.20 * u_intensity;",
    /* Zero alpha under premultiplied blending is pure addition -- see
       sky.js's own comment. This is what lets the curtains glow over the
       page rather than sitting on it as an opaque layer. */
    "  gl_FragColor = vec4(col * u_fade, 0.0);",
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
  var uHeight = gl.getUniformLocation(prog, "u_height");
  var uIntensity = gl.getUniformLocation(prog, "u_intensity");
  var uHueBase = gl.getUniformLocation(prog, "u_hueBase");
  var uTint = gl.getUniformLocation(prog, "u_tint");

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  // Rolled once per load, same idiom as sky.js: unlike speeds/frequencies so
  // the three curtains slide past each other rather than moving as one sheet.
  gl.uniform3f(gl.getUniformLocation(prog, "u_seed"), rnd(0, 60), rnd(0, 60), rnd(0, 60));
  gl.uniform3f(
    gl.getUniformLocation(prog, "u_speed"),
    rnd(0.65, 1.35),
    rnd(0.45, 1.05),
    rnd(1.0, 1.9),
  );
  gl.uniform3f(gl.getUniformLocation(prog, "u_freq"), rnd(2.0, 3.4), rnd(2.6, 4.2), rnd(1.6, 2.8));
  gl.uniform1f(uHeight, 0.5);

  gl.clearColor(0, 0, 0, 0);

  var DPR_CAP = 1.5;
  var width = 0;
  var height = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
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

    // Cheap exponential smoothing toward the current scene's hue/intensity,
    // so a scene change eases in over about a second instead of snapping --
    // matching the CSS ray layer's own 1.2s opacity/filter transition.
    curIntensity += (targetIntensity - curIntensity) * 0.03;
    var hueDelta = targetHue - curHue;
    if (hueDelta > 0.5) hueDelta -= 1;
    if (hueDelta < -0.5) hueDelta += 1;
    curHue = (curHue + hueDelta * 0.03 + 1) % 1;

    fade = Math.min(1, fade + 0.02);

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
