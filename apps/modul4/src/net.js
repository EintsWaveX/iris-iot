/* Perburuan LoRa IRIS: the one socket to the PC, and who this phone is.

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
   the PC, and the PC never sends anyone else's. */
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
  const KEY_KODE = "iris_hunt_kode";
  const KEY_DEV = "iris_hunt_dev";
  /* A small random id for this browser, made once. The PC lets one NIM be
     signed in on one browser at a time: a second tab here is fine, a second
     phone is turned away until the first one logs out. */
  const makeDev = () => {
    const have = H.read(KEY_DEV);
    if (typeof have === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(have)) return have;
    let id = "";
    try {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 28);
    } catch (e) {
      id = (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 28);
    }
    id = id.replace(/[^A-Za-z0-9_-]/g, "x").padEnd(12, "z");
    H.write(KEY_DEV, id);
    return id;
  };
  const cleanKode = (v) => {
    if (typeof v !== "string") return null;
    const s = v.trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(s) ? s : null;
  };

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
    /* The board is open on the internet, so the IRIS site's link carries a
       join code (#k=...). Without it the NIM is never tried and the roster
       stays closed. Kept on this phone for the rest of the session. */
    kode: cleanKode(H.read(KEY_KODE)),
    dev: makeDev(),
    problem: null /* why sign-in failed: { kode, tunggu } */,
    closeReason: "",
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
  /* The join code arrives in the address fragment, which a browser never
     sends to a server or a log. Read once, then dropped from the address. */
  const takeKodeFromLink = () => {
    try {
      const m = /[#&]k=([A-Za-z0-9]{4,12})/.exec(window.location.hash);
      if (!m) return false;
      N.kode = cleanKode(m[1]);
      H.write(KEY_KODE, N.kode);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return !!N.kode;
    } catch (e) {
      /* no history API: the stored copy still works */
      return !!N.kode;
    }
  };
  takeKodeFromLink();
  /* A fresh link opened in a tab that is already running (a new QR scanned
     into the same tab, or a link with a new code pasted over the address):
     take its code and say hello again so the sign-in does not wait for a
     reload. */
  window.addEventListener("hashchange", () => {
    if (takeKodeFromLink()) {
      N.problem = null;
      if (N.nim && N.grup === null) halo();
      changed(true);
    }
  });
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
    /* a hidden tab keeps the latest data but does not redraw; it catches up
       the moment it is visible again */
    if (document.hidden && !now) return;
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
  let rosterPausedUntil = 0;
  const fetchRoster = (stamp) => {
    /* names are only handed to a phone that holds the join code */
    if (rosterBusy || !N.kode || Date.now() < rosterPausedUntil) return;
    rosterBusy = true;
    fetch("roster.json?k=" + encodeURIComponent(N.kode), { cache: "no-store" })
      .then((r) => {
        if (r.status === 403) {
          /* The code on this phone is from an earlier session or day. Asking again
             with it every frame only fills the PC's failure count for this whole
             network address, which can lock other phones out; drop it and wait
             for the link from the site, which carries the current one. */
          N.kode = null;
          H.write(KEY_KODE, null);
          changed();
          return null;
        }
        if (r.status === 429) {
          rosterPausedUntil = Date.now() + 60000;
          return null;
        }
        return r.ok ? r.json() : null;
      })
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
  /* The lab picks the network on the IRIS site and the server says which in
     every frame. Before the first frame, plain http (not localhost) can only
     be the PC's own IRIS_IOT Wi-Fi, so the sign-in wording is right at once. */
  H.lokal = () =>
    N.frame && N.frame.jaringan
      ? N.frame.jaringan === "iris_iot"
      : location.protocol === "http:" && !/^(localhost|127\.)/.test(location.hostname);
  /* H.NET(forInternet, forIrisIot): pick the wording that matches the network */
  H.NET = (internet, lokal) => (H.lokal() ? lokal : internet);
  /* The server answers in short Indonesian reasons. People get a plain
     sentence in their own language, never the raw reason. */
  H.why = (r) => {
    const t = String(r || "");
    if (t === "tunggu sebentar") return L("Tunggu sebentar, lalu coba lagi.", "Wait a moment, then try again.");
    if (/berkas|unggahan|penyimpanan/.test(t)) return L("Fotonya belum masuk dengan benar. Foto lagi.", "The photo didn't upload cleanly. Take it again.");
    if (t === "kelompok belum mengirim data") return L("Hunter kelompokmu belum mengirim data.", "Your group's hunter hasn't sent any data yet.");
    if (t === "masuk dengan NIM dulu") return L("Masuk dengan NIM dulu.", "Sign in with your NIM first.");
    if (t === "tidak ada sesi yang berjalan") return L("Belum ada sesi yang berjalan.", "No session is running.");
    if (t === "token salah" || t === "butuh token asisten") return L("Token salah atau belum diisi.", "Wrong or missing token.");
    if (/hanya kelompok itu/.test(t)) return L("Hanya anggota kelompok itu yang bisa mengklaim.", "Only that group's own members can claim.");
    if (t === "foto tidak dikenal") return L("Foto itu bukan dari kelompokmu. Foto lagi.", "That photo isn't from your group. Take it again.");
    return L("Coba lagi.", "Try again.");
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
  let masukBusy = false;
  const halo = () => {
    /* a hello sent while a sign-in is still on its way could arrive with the
       old NIM and undo it */
    if (masukBusy) return false;
    lastHaloAt = Date.now();
    const msg = { aksi: "halo", dev: N.dev };
    if (N.nim) msg.nim = N.nim;
    if (N.token) msg.token = N.token;
    if (N.kode) msg.kode_papan = N.kode;
    return send(msg);
  };
  let haloTimer = null;

  const onHalo = (m) => {
    if (m.ok === false && m.alasan === "token salah") {
      /* a token the server no longer knows (it was restarted with a new
         one): forget it and fall back to whatever the NIM gives */
      N.token = null;
      H.write(KEY_TOKEN, null);
      halo();
      return;
    }
    /* an assistant's hello carries today's join code, for the projector and
       for the links it hands out */
    if (m.kode_papan && m.kode_papan !== N.kode) {
      N.kode = cleanKode(m.kode_papan);
      H.write(KEY_KODE, N.kode);
      rosterStamp = null;
    }
    N.role = m.peran || "tamu";
    N.connId = m.id || N.connId;
    if (m.kode === "sudah_masuk") {
      /* a stale hello: the PC keeps whoever is signed in on this socket */
      if (typeof m.grup === "number") N.grup = m.grup;
      changed(true);
      return;
    }
    const was = N.grup;
    N.grup = typeof m.grup === "number" ? m.grup : null;
    if (N.grup === null && N.nim) {
      if (m.kode === "kode_papan" || m.kode === "terlalu_sering") {
        /* The NIM is fine; the link or the network is the problem. Keep the
           NIM and say why, instead of signing the person out. */
        N.problem = { kode: m.kode, tunggu: m.tunggu || 0 };
        N.sesi = null;
        if (m.kode === "terlalu_sering" && !haloTimer) {
          haloTimer = setTimeout(() => {
            haloTimer = null;
            halo();
          }, Math.min(600, Math.max(5, (m.tunggu || 30) + 1)) * 1000);
        }
      } else {
        /* the session rolled over, the NIM left the list, an assistant
           released it, or it is open on another phone */
        if (m.kode === "tak_terdaftar" || m.kode === "tak_ada_sesi") {
          if (was !== null || m.kode === "tak_terdaftar") N.rolled = true;
        } else if (m.kode === "dilepas" || m.kode === "sedang_dipakai") {
          N.problem = { kode: m.kode, tunggu: 0 };
        }
        N.nim = null;
        N.nama = "";
        N.sesi = null;
        H.write(KEY_NIM, null);
      }
    } else {
      N.sesi = m.sesi;
      N.nama = m.nama || N.nama;
      if (N.grup !== null) N.problem = null;
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
      /* the PC sends the radio and distance model only when they change */
      if (prev) {
        if (!m.model && prev.model) m.model = prev.model;
        if (!m.radio && prev.radio) m.radio = prev.radio;
      }
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
      N.closeReason = ev.reason || "";
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
    masukBusy = true;
    const r = await request({ aksi: "masuk", nim: clean, dev: N.dev, kode_papan: N.kode || undefined }, (m) => m.tipe === "masuk");
    masukBusy = false;
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
      N.problem = null;
      changed(true);
    }
    return r;
  };
  /* Log out for real: the PC releases the NIM (another phone can use it) and
     drops assistant rights; this phone forgets the NIM and the token. If the
     socket is down the PC lets go of the NIM when the socket closes anyway. */
  const signOutHere = (tellPc, write) => {
    if (tellPc) send({ aksi: "keluar" });
    N.nim = null;
    N.grup = null;
    N.nama = "";
    N.sesi = null;
    N.peranTim = null;
    N.role = "tamu";
    N.token = null;
    N.tokenFails = 0;
    N.pings = [];
    N.rolled = false;
    N.problem = null;
    if (write) {
      H.write(KEY_NIM, null);
      H.write(KEY_TOKEN, null);
    }
    H.set({ reveal: false, viewG: null });
    changed(true);
  };
  H.keluar = () => {
    signOutHere(true, true);
    H.go("hunt");
  };
  /* another tab on this browser signed in as somebody else, or logged out:
     this tab follows so two people never share one saved login */
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY_NIM || !N.nim) return;
    if (cleanNim(e.newValue) === N.nim) return;
    const other = !!cleanNim(e.newValue);
    signOutHere(true, false);
    if (other) N.problem = { kode: "tab_lain", tunggu: 0 };
    H.go("hunt");
    changed(true);
  });
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
})();
