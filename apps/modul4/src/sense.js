/* Perburuan LoRa IRIS: hunting without watching the screen.

   A Geiger tick that speeds up as the heat rises, a short buzz each time
   the group reaches a hotter step (from Warm upwards), and a screen that
   stays on where the browser allows it. Sound needs a tap before it may
   play, so the role step and the Display sheet both offer "Izinkan". */
(function () {
  const H = window.H;
  const RATE = { dingin: 0.6, sejuk: 1.2, hangat: 2.4, panas: 4.5, membara: 8 };
  const LEVEL = { hilang: 0, dingin: 1, sejuk: 2, hangat: 3, panas: 4, membara: 5 };
  let ctx = null;
  let next = 0;
  let heat = "hilang";
  let lastLevel = 0;

  const tick = () => {
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = heat === "membara" ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.06);
  };
  setInterval(() => {
    if (!H.state.sound || !RATE[heat] || document.hidden) return;
    const now = performance.now();
    if (now < next) return;
    /* a little jitter so it sounds like a counter, not a metronome */
    next = now + (1000 / RATE[heat]) * (0.75 + Math.random() * 0.5);
    tick();
  }, 40);

  H.unlockSound = () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {
      ctx = null;
    }
    H.set({ sound: true, vib: true });
    tick();
    if (navigator.vibrate) navigator.vibrate(30);
    H.keepAwake();
  };

  /* called with the group's heat on every render of the Hunt screen */
  H.feelHeat = (k) => {
    heat = k;
    const lv = LEVEL[k] || 0;
    if (lv > lastLevel && lv >= LEVEL.hangat && H.state.vib && navigator.vibrate) {
      navigator.vibrate(lv === LEVEL.membara ? [80, 60, 80, 60, 160] : lv === LEVEL.panas ? [70, 50, 70] : [60]);
    }
    lastLevel = lv;
  };

  /* Wake Lock needs a secure context, so on the IRIS_IOT Wi-Fi (plain HTTP) it
     is missing. A playing video keeps a phone screen on, so there a silent
     one-pixel stream drawn from a canvas stands in (the NoSleep trick, with
     no video file to ship). It starts from the same tap that unlocks sound;
     which phones honour it is unverified, so the Display sheet words it as a
     backup. */
  let lock = null;
  let keepVideo = null;
  let keepTimer = 0;
  const hasLock = () => "wakeLock" in navigator && window.isSecureContext;
  const canVideo = () =>
    !hasLock() && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
  H.canStayAwake = () => hasLock() || canVideo();
  /* "lock" | "video" | "none": how the screen is kept on, for the Display sheet */
  H.awakeBy = () => (hasLock() ? "lock" : canVideo() ? "video" : "none");
  const stopVideo = () => {
    clearInterval(keepTimer);
    if (keepVideo) keepVideo.remove();
    keepVideo = null;
  };
  const startVideo = () => {
    if (keepVideo) return void keepVideo.play().catch(() => {});
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const g = c.getContext("2d");
      let n = 0;
      /* a stream only plays while its picture changes */
      const draw = () => {
        g.fillStyle = n++ % 2 ? "#000000" : "#010101";
        g.fillRect(0, 0, 2, 2);
      };
      draw();
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("aria-hidden", "true");
      v.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
      v.srcObject = c.captureStream(2);
      document.body.appendChild(v);
      keepVideo = v;
      keepTimer = setInterval(draw, 500);
      v.play().catch(stopVideo);
    } catch (e) {
      stopVideo();
    }
  };
  H.keepAwake = async () => {
    if (canVideo()) return startVideo();
    if (!hasLock() || lock) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } catch (e) {
      lock = null;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && H.state.sound) H.keepAwake();
  });
})();
