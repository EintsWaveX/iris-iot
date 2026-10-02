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

  /* Wake Lock needs a secure context, so on the hotspot (plain HTTP) it is
     usually missing; the Display sheet says so. */
  let lock = null;
  H.canStayAwake = () => "wakeLock" in navigator && window.isSecureContext;
  H.keepAwake = async () => {
    if (!H.canStayAwake() || lock) return;
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
