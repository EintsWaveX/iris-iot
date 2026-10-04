/* Perburuan LoRa IRIS: the one socket to the Pi, and who this phone is.

   One WebSocket (/live) carries the whole hunt: the server pushes a full
   frame ten times a second, so there is no patch protocol to get wrong.
   Replies addressed to this phone alone (halo, masuk, balas, ping,
   ping_riwayat, galat) come down the same socket and are told apart by
   their "tipe".

   The watchdog matters: a socket can deliver a frame and then go quiet
   without an error (a phone screen locking, Wi-Fi handing over), so it
   tracks the last frame and rebuilds the socket when frames stop.

   The phone never names its own group. It stores a NIM and the server
   answers with the group for the running session, on every connect. When
   the session rolls over the NIM stops resolving and the phone drops back
   to the sign-in screen. The NIM itself never leaves this phone except to
   the Pi, and the Pi never sends anyone else's. */
(function () {
  const H = window.H;
  const { useState, useEffect } = window.htmPreact;

  const STALE_MS = 3500;
  const RETRY_MIN = 500;
  const RETRY_MAX = 8000;
  const RENDER_MS = 250; /* frames come at 10 Hz, the screen redraws at 4 Hz */
  const HIST_SEC = 15 * 60;
  const KEY_NIM = "iris_hunt_nim";
  const KEY_TOKEN = "iris_hunt_token";

  const cleanNim = (v) => {
    if (typeof v !== "string") return null;
    const s = v.replace(/\s+/g, "").toUpperCase();
    return /^[A-Z0-9]{4,20}$/.test(s) ? s : null;
  };

  const N = {
    frame: null,
    status: "connecting" /* connecting | live | reconnecting | offline */,
    closeCode: null,
    locked: false /* five wrong tokens: closed until a reload */,
    downSince: null,
    nim: cleanNim(H.read(KEY_NIM)),
    token: H.read(KEY_TOKEN) || null,
    role: "tamu",
    grup: null,
    nama: "",
    sesi: null,
    connId: null,
    peranTim: null,
    rolled: false /* this phone was in a session that has ended */,
    tokenFails: 0,
    roster: { regu: {}, sesi: null, sisa: null },
    pings: [],
  };
  H.net = N;
  /* Phase 9: the web's Perburuan step links here with ?nim=, so a phone
     that scanned the QR signs in without typing. Read once, then dropped
     from the address so a reload doesn't sign in again. */
  H.urlNim = (() => {
    try {
      const u = new URL(window.location.href);
      const v = cleanNim(u.searchParams.get("nim"));
      if (u.searchParams.has("nim")) {
        u.searchParams.delete("nim");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
      return v;
    } catch (e) {
      return null;
    }
  })();

  /* ------------------------------------------------ change notification */
  const subs = new Set();
  let dirty = false;
  let timer = null;
  const flush = () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    subs.forEach((f) => f());
  };
  const changed = (now) => {
    dirty = true;
    if (now) {
      if (timer) clearTimeout(timer);
      flush();
    } else if (!timer) timer = setTimeout(flush, RENDER_MS);
  };
  H.useNet = () => {
    const [, force] = useState(0);
    useEffect(() => {
      const f = () => force((n) => n + 1);
      subs.add(f);
      return () => subs.delete(f);
    }, []);
    return N;
  };

  /* ------------------------------------------------ events and replies */
  const evSubs = new Set();
  H.onEvents = (fn) => {
    evSubs.add(fn);
    return () => evSubs.delete(fn);
  };
  const seen = new Set();
  let primed = false;
  const drain = (list) => {
    if (!list || !list.length) return;
    const fresh = [];
    for (const ev of list) {
      const key = ev.kind + "|" + ev.grup + "|" + ev.at;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(ev);
    }
    /* the first frame after a connect carries history, not news */
    if (!primed) {
      primed = true;
      return;
    }
    if (fresh.length) evSubs.forEach((f) => f(fresh));
  };

  const waiting = [];
  const settle = (msg) => {
    for (let i = 0; i < waiting.length; i++) {
      const w = waiting[i];
      if (w.match(msg)) {
        waiting.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(msg);
        return;
      }
    }
  };
  /* Send and wait for the matching reply. Never rejects: a timeout or a
     closed socket resolves { ok: false } so screens can say what happened. */
  const request = (msg, match) =>
    new Promise((resolve) => {
      if (!send(msg)) {
        resolve({ ok: false, alasan: "offline" });
        return;
      }
      const w = { match, resolve };
      w.timer = setTimeout(() => {
        const i = waiting.indexOf(w);
        if (i >= 0) waiting.splice(i, 1);
        resolve({ ok: false, alasan: "timeout" });
      }, 8000);
      waiting.push(w);
    });
  const balas = (aksi) => (m) => m.tipe === "balas" && m.aksi === aksi;

  /* ------------------------------------------------ history per group */
  const hist = {}; /* gid -> [{t, halus, snr, jarak, delay, lost, kem}] */
  const packets = {}; /* gid -> [{seq, tx, rx, delay, rssi, snr, lost}] */
  const delays = {}; /* gid -> last per-packet delays, for jitter */
  let lastSample = 0;
  const sample = (frame) => {
    const now = Date.now();
    for (const r of frame.grup || []) {
      const g = r.grup;
      /* one packet row per new sequence number, with the gap filled */
      const log = (packets[g] = packets[g] || []);
      const prev = log.length ? log[log.length - 1].seq : null;
      if (r.seq && r.seq !== prev) {
        if (prev != null && r.seq > prev + 1) {
          for (let s = Math.max(prev + 1, r.seq - 4); s < r.seq; s++) log.push({ seq: s, lost: true });
        }
        log.push({ seq: r.seq, tx: r.tx, rx: r.rx, delay: r.delay_ms, rssi: r.rssi, snr: r.snr });
        if (log.length > 60) log.splice(0, log.length - 60);
        if (r.delay_ms != null) {
          const d = (delays[g] = delays[g] || []);
          d.push(r.delay_ms);
          if (d.length > 21) d.shift();
        }
      }
    }
    if (now - lastSample < 1000) return;
    lastSample = now;
    for (const r of frame.grup || []) {
      if (r.halus == null) continue;
      const h = (hist[r.grup] = hist[r.grup] || []);
      h.push({ t: now, halus: r.halus, snr: r.snr, jarak: r.jarak_m, delay: r.delay_ms, lost: r.rugi_persen, kem: r.kemajuan });
      while (h.length && h[0].t < now - HIST_SEC * 1000) h.shift();
    }
  };
  H.series = (g, key) => () => (hist[g] || []).filter((s) => s[key] != null).map((s) => ({ t: s.t, v: s[key] }));
  H.packets = (g) => (packets[g] || []).slice(-9).reverse();
  H.jitter = (g) => {
    const d = delays[g] || [];
    if (d.length < 3) return null;
    let sum = 0;
    for (let i = 1; i < d.length; i++) sum += Math.abs(d[i] - d[i - 1]);
    return sum / (d.length - 1);
  };
  H.avgDelay = (g) => {
    const h = (hist[g] || []).filter((s) => s.delay != null);
    return h.length ? h.reduce((a, s) => a + s.delay, 0) / h.length : null;
  };
  /* smoothed RSSI now against ten seconds ago: naik, turun or stabil */
  H.trend10 = (g) => {
    const h = hist[g] || [];
    if (h.length < 4) return "stabil";
    const now = h[h.length - 1];
    const past = h.find((s) => s.t >= now.t - 10500) || h[0];
    const d = now.halus - past.halus;
    return d > 1.5 ? "naik" : d < -1.5 ? "turun" : "stabil";
  };

  /* ------------------------------------------------ roster */
  let rosterStamp = null;
  let rosterBusy = false;
  const fetchRoster = (stamp) => {
    if (rosterBusy) return;
    rosterBusy = true;
    fetch("roster.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        rosterBusy = false;
        if (!data) return;
        rosterStamp = stamp;
        N.roster = { regu: data.regu || {}, sesi: data.sesi == null ? null : data.sesi, sisa: data.sisa };
        changed();
      })
      .catch(() => {
        rosterBusy = false;
        /* a dropped request: the next frame tries again */
      });
  };
  const GNAMES = ["Vela", "Lyra", "Cygnus", "Orion", "Carina", "Draco", "Pyxis", "Lepus", "Corvus", "Ara"];
  /* a group's own name from the schedule, or its star name */
  H.gname = (g) => {
    const r = N.roster.regu[String(g)];
    return (r && r.nama && r.nama.trim()) || GNAMES[(g - 1) % GNAMES.length];
  };
  H.members = (g) => {
    const r = N.roster.regu[String(g)];
    const names = (r && r.anggota) || [];
    const tim = (N.frame && N.frame.tim && N.frame.tim[String(g)]) || { peran: "", hadir: "" };
    const P = { p: "pemandu", i: "pengintai", o: "operator" };
    return names.map((nama, i) => ({ nama, peran: P[tim.peran[i]] || null, hadir: tim.hadir[i] === "1" }));
  };
  H.initials = (nama) =>
    (nama || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0].toUpperCase())
      .join("");
  H.row = (g) => (N.frame && N.frame.grup ? N.frame.grup.find((r) => r.grup === g) : null);
  H.groups = () => {
    const ids = new Set(Object.keys(N.roster.regu).map(Number));
    if (N.frame) for (const r of N.frame.grup || []) ids.add(r.grup);
    return [...ids].filter((n) => n > 0).sort((a, b) => a - b);
  };

  /* ------------------------------------------------ the socket */
  let socket = null;
  let retry = RETRY_MIN;
  let retryTimer = null;
  let lastFrameAt = 0;
  let lastHaloAt = 0;

  const endpoint = () => (location.protocol === "https:" ? "wss:" : "ws:") + "//" + (location.host || "127.0.0.1:8080") + "/live";
  const setStatus = (s) => {
    if (N.status === s) return;
    N.status = s;
    if (s === "live") N.downSince = null;
    else if (N.downSince == null) N.downSince = Date.now();
    changed(true);
  };
  const send = (msg) => {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg));
      return true;
    } catch (e) {
      return false;
    }
  };
  /* privileged actions carry the token on the message itself */
  const sendAuth = (msg) => (N.token ? Object.assign(msg, { token: N.token }) : msg);
  const halo = () => {
    lastHaloAt = Date.now();
    const msg = { aksi: "halo" };
    if (N.nim) msg.nim = N.nim;
    if (N.token) msg.token = N.token;
    return send(msg);
  };

  const onHalo = (m) => {
    if (m.ok === false && m.alasan === "token salah") {
      /* a token the server no longer knows (it was restarted with a new
         one): forget it and fall back to whatever the NIM gives */
      N.token = null;
      H.write(KEY_TOKEN, null);
      halo();
      return;
    }
    N.role = m.peran || "tamu";
    N.connId = m.id || N.connId;
    const was = N.grup;
    N.grup = typeof m.grup === "number" ? m.grup : null;
    if (N.grup === null && N.nim) {
      /* the NIM no longer resolves: the session rolled over */
      if (was !== null || m.kode === "tak_terdaftar") N.rolled = true;
      N.nim = null;
      N.nama = "";
      N.sesi = null;
      H.write(KEY_NIM, null);
    } else {
      N.sesi = m.sesi;
      N.nama = m.nama || N.nama;
    }
    N.peranTim = N.grup !== null ? m.peran_tim || null : null;
    changed(true);
  };

  const onMessage = (raw) => {
    if (typeof raw !== "string") return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return;
    }
    lastFrameAt = Date.now();
    retry = RETRY_MIN;
    if (N.status !== "live") setStatus("live");
    const tipe = m.tipe || "bingkai";
    if (tipe === "bingkai") {
      const prev = N.frame;
      N.frame = m;
      sample(m);
      drain(m.peristiwa);
      const stamp = m.roster_rev + "|" + m.sesi;
      if (stamp !== rosterStamp) fetchRoster(stamp);
      /* the running session changed under a joined phone: ask again */
      if (N.grup !== null && m.sesi !== N.sesi && Date.now() - lastHaloAt > 3000) halo();
      if (prev && prev.ronde !== m.ronde) {
        for (const k in hist) delete hist[k];
        for (const k in packets) delete packets[k];
        for (const k in delays) delete delays[k];
        N.pings = [];
      }
      changed();
      return;
    }
    if (tipe === "halo") onHalo(m);
    else if (tipe === "ping") {
      N.pings = [...N.pings.filter((p) => p.id !== m.id), m].slice(-40);
      evSubs.forEach((f) => f([{ kind: "_ping", ping: m }]));
      changed(true);
    } else if (tipe === "ping_riwayat") {
      N.pings = (m.daftar || []).slice(-40);
      changed(true);
    }
    settle(m);
  };

  const open = () => {
    if (N.locked) return;
    try {
      socket = new WebSocket(endpoint());
    } catch (e) {
      setStatus("offline");
      schedule();
      return;
    }
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      lastFrameAt = Date.now();
      primed = false;
      halo();
    };
    socket.onmessage = (ev) => onMessage(ev.data);
    socket.onclose = (ev) => {
      N.closeCode = ev.code;
      if (ev.code === 1008) {
        N.locked = true;
        setStatus("offline");
        return;
      }
      setStatus("reconnecting");
      schedule();
    };
    socket.onerror = () => {
      /* onclose always follows; the retry is scheduled there */
    };
  };
  const schedule = () => {
    if (retryTimer || N.locked) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, retry);
    retry = Math.min(RETRY_MAX, retry * 2);
  };
  const rebuild = () => {
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      try {
        socket.close();
      } catch (e) {
        /* already gone */
      }
      socket = null;
    }
    setStatus("reconnecting");
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    open();
  };
  H.retryNow = () => {
    retry = RETRY_MIN;
    rebuild();
  };
  /* seconds until the next automatic try, for the offline screen */
  H.retryIn = () => Math.ceil(retry / 1000);
  const watchdog = () => {
    if (document.hidden || N.locked) return;
    const closed = !socket || socket.readyState === 2 || socket.readyState === 3;
    if (closed) schedule();
    else if (socket.readyState === 1 && Date.now() - lastFrameAt > STALE_MS) rebuild();
  };
  H.startNet = () => {
    open();
    setInterval(watchdog, 1000);
    document.addEventListener("visibilitychange", () => !document.hidden && watchdog());
    window.addEventListener("online", watchdog);
    window.addEventListener("offline", () => setStatus("offline"));
  };

  /* ------------------------------------------------ actions */
  H.masuk = async (nim) => {
    const clean = cleanNim(nim);
    if (!clean) return { ok: false, kode: "nim_cacat" };
    const r = await request({ aksi: "masuk", nim: clean }, (m) => m.tipe === "masuk");
    if (r.ok) {
      N.nim = clean;
      H.write(KEY_NIM, clean);
      N.grup = r.grup;
      N.nama = r.nama || "";
      N.sesi = r.sesi;
      N.connId = r.id || N.connId;
      N.peranTim = r.peran_tim || null;
      N.role = r.peran || "anggota";
      N.rolled = false;
      changed(true);
    }
    return r;
  };
  H.keluar = () => {
    N.nim = null;
    N.grup = null;
    N.nama = "";
    N.sesi = null;
    N.peranTim = null;
    H.write(KEY_NIM, null);
    halo();
    changed(true);
  };
  /* The token is tried with a halo of its own; a wrong one counts towards
     the five the server allows on one connection. */
  H.tryToken = async (code) => {
    const tok = String(code || "").trim().toUpperCase();
    const msg = { aksi: "halo", token: tok };
    if (N.nim) msg.nim = N.nim;
    const r = await request(msg, (m) => m.tipe === "halo");
    if (r.ok && r.peran === "asisten") {
      N.token = tok;
      N.tokenFails = 0;
      H.write(KEY_TOKEN, tok);
      onHalo(r);
      return { ok: true };
    }
    if (r.alasan === "token salah") N.tokenFails += 1;
    changed(true);
    return { ok: false, alasan: r.alasan, left: Math.max(0, 5 - N.tokenFails) };
  };
  H.dropToken = () => {
    N.token = null;
    H.write(KEY_TOKEN, null);
    halo();
    changed(true);
  };
  H.timPeran = (peran) => request({ aksi: "tim_peran", peran: peran || null }, balas("tim_peran")).then((r) => {
    if (r.ok) {
      N.peranTim = peran || null;
      changed(true);
    }
    return r;
  });
  H.ping = (kode) => request({ aksi: "ping", kode }, balas("ping"));
  H.panggil = (batal) => request({ aksi: "panggil_asisten", batal: !!batal }, balas("panggil_asisten"));
  H.sapuan = (arah, mode, awalDeg) => {
    const msg = { aksi: "sapuan", arah, mode: mode || "manual" };
    if (typeof awalDeg === "number") msg.awal_deg = awalDeg;
    return request(msg, balas("sapuan"));
  };
  H.klaim = (grup, foto) => request({ aksi: "klaim", grup, foto: foto || null }, balas("klaim"));
  H.asisten = (aksi, extra) => request(sendAuth(Object.assign({ aksi }, extra || {})), balas(aksi));

  /* A claim photo: shrunk on the phone first (a 4 MB camera capture has no
     business crossing a busy hotspot), announced, then sent as one binary
     frame. Resolves to the stored file name, or { ok: false, alasan }. */
  const shrink = (file) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const tryQ = (q) =>
          c.toBlob((b) => {
            if (b && b.size > 480 * 1024 && q > 0.4) tryQ(q - 0.15);
            else resolve(b);
          }, "image/jpeg", q);
        tryQ(0.72);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  H.uploadPhoto = async (grup, file) => {
    const blob = await shrink(file);
    if (!blob) return { ok: false, alasan: "foto tidak terbaca" };
    const start = await request({ aksi: "foto_mulai", grup, ukuran: blob.size, mime: "image/jpeg" }, balas("foto_mulai"));
    if (!start.ok) return start;
    const buf = await blob.arrayBuffer();
    const done = request(buf, balas("foto"));
    return done;
  };

  /* the replay and the moments list, fetched on demand */
  H.fetchJejak = (langkah) =>
    fetch("jejak.json?langkah=" + (langkah || 1), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
})();
