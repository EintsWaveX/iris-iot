/* Perburuan LoRa IRIS, part 1: the shell, joining, the Hunt screen and
   the Team screen. Ported from the Phase 9 mockup (screens-hunt.js) and
   wired to the real protocol: every number here comes from the Pi's frame.

   The rules are the server's: each group hunts its own beacon, groups are
   compared only by the share of their own distance closed or by finish
   time (never raw RSSI), three soft roles only reorder the Hunt screen,
   team pings reach the group and the assistants, the 8-facing sweep turns
   the body into an antenna, and the claim arms only at Membara. */
(function () {
  const { html, useState, useEffect, useRef } = window.htmPreact;
  const H = window.H;
  const { L, Icon, Btn, IconBtn, Badge, Tabs, Switch } = H;

  /* ------------------------------------------------ the rules, in one place */
  /* the heat ladder as a share of the arena radius, with a floor in metres
     (the same table as HEAT_LADDER in server.py) */
  H.LADDER = [
    { k: "membara", f: 0.02, floor: 3, l: ["Membara", "Burning"] },
    { k: "panas", f: 0.08, floor: 8, l: ["Panas", "Hot"] },
    { k: "hangat", f: 0.25, floor: 20, l: ["Hangat", "Warm"] },
    { k: "sejuk", f: 0.6, floor: 45, l: ["Sejuk", "Cool"] },
    { k: "dingin", f: null, floor: null, l: ["Dingin", "Cold"] },
  ];
  const arena = () => (H.net.frame && H.net.frame.model ? H.net.frame.model.arena_m : 300);
  const limit = (s) => Math.max(s.floor, Math.round(s.f * arena()));
  H.heatLabel = (k) =>
    k === "hilang" ? L("Hilang", "Lost") : k === "menang" ? L("Ketemu", "Found") : L(...(H.LADDER.find((x) => x.k === k) || H.LADDER[4]).l);
  H.ROLES = {
    pemandu: { l: ["Pemandu", "Navigator"], d: ["Memegang papan hunter, membaca sonar, memimpin sapuan.", "Holds the hunter board, reads the sonar, leads the sweep."], i: "compass" },
    pengintai: { l: ["Pengintai", "Scout"], d: ["Mencari tempat persembunyian, memotret, mengajukan klaim.", "Scouts hiding spots, takes the photo, files the claim."], i: "binoculars" },
    operator: { l: ["Operator Radio", "Radio Operator"], d: ["Mengawasi SNR, paket hilang dan delay tautan.", "Watches SNR, lost packets and link delay."], i: "broadcast" },
  };
  const ROLES = H.ROLES;
  H.PINGS = [
    { k: "ke_sini", l: ["Ke Sini", "Over Here"], i: "map-pin" },
    { k: "naik", l: ["Sinyal Naik", "Signal Rising"], i: "arrow-up" },
    { k: "tunggu", l: ["Tunggu", "Hold On"], i: "pause" },
    { k: "cek_klaim", l: ["Cek Klaim", "Check Claim"], i: "camera" },
  ];
  const PINGS = H.PINGS;
  const SYNC = { 1: "0xF1", 2: "0xF2", 3: "0xF3", 4: "0xF4", 5: "0xF5" };
  H.sync = (g) => SYNC[g] || null;
  H.gfull = (g) => `${H.kelompok(g)} · ${H.gname(g)}`;
  /* the heat a group shows: found, or the server's step */
  H.heatOf = (row) => (!row ? "hilang" : row.status === "menang" ? "menang" : row.heat || "hilang");
  H.closedOf = (row) => (!row ? 0 : Math.round((row.kemajuan || 0) * 100));
  const metres = (v) => (v == null ? "·" : v < 10 ? H.fmt(v, 1) : H.fmt(Math.round(v), 0));
  /* clock face of facing i of 8, starting at 12 */
  H.clockOf = (i) => (i === 0 ? 12 : i * 1.5);
  const clockText = (i) => {
    const c = H.clockOf(i);
    return Number.isInteger(c) ? String(c) : H.fmt(c, 1);
  };
  const slotTimes = ["06:30", "09:30", "12:30", "15:30"];
  const nextSlot = () => {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    return slotTimes.find((t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m > now;
    });
  };

  /* ------------------------------------------------ the game shell */
  const HClock = ({ compact }) => {
    H.useTick(1000);
    const d = new Date();
    const t = H.hms(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
    return html`<span class="hclock" role="timer"><span class="hclock__d">${H.tgl(d)}</span><b class="mono">${compact ? t.slice(0, 5) : t}</b></span>`;
  };
  H.HClock = HClock;
  const HDisplay = ({ onClose }) => {
    const st = H.useStore();
    return html`<${H.Sheet} title=${L("Tampilan perburuan", "Hunt display")} onClose=${onClose}><div class="stack">
      <label class="hset"><span class="stack" style="gap:0"><b>${L("Mode Terang Matahari", "Bright Sun Mode")}</b><span class="hint">${L("Kontras tinggi dan angka besar buat di luar ruangan.", "High contrast and big numbers for outdoors.")}</span></span><${Switch} on=${st.sun} onChange=${(v) => H.set({ sun: v })} label=${L("Mode Terang Matahari", "Bright Sun Mode")} /></label>
      <label class="hset"><span class="stack" style="gap:0"><b>${L("Suara Geiger", "Geiger sound")}</b><span class="hint">${L("Bunyi makin cepat saat makin dekat. Layar tidak perlu dilihat terus.", "Ticks faster as you get closer, so you don't have to watch the screen.")}</span></span><${Switch} on=${!!st.sound} onChange=${(v) => (v ? H.unlockSound() : H.set({ sound: false }))} label=${L("Suara Geiger", "Geiger sound")} /></label>
      <label class="hset"><span class="stack" style="gap:0"><b>${L("Getar", "Vibrate")}</b><span class="hint">${L("Getar pendek mulai dari Hangat.", "A short buzz from Warm upwards.")}</span></span><${Switch} on=${st.vib !== false} onChange=${(v) => H.set({ vib: v })} label=${L("Getar", "Vibrate")} /></label>
      <div class="field"><span class="label">${L("Bahasa", "Language")}</span><${H.LangPick} /></div>
      <${H.ZhWeight} />
      <div class="field"><span class="label">${L("Tema", "Theme")}</span><${Tabs} fill value=${st.theme} onChange=${(v) => H.set({ theme: v })} label=${L("Tema", "Theme")} tabs=${[{ v: "dark", l: L("Gelap", "Dark"), icon: "moon" }, { v: "light", l: L("Terang", "Light"), icon: "sun" }]} /></div>
      <span class="hint">${H.canStayAwake() ? L("Layar tetap menyala selama perburuan.", "The screen stays on during the hunt.") : L("Browser tidak mengizinkan layar tetap menyala di hotspot ini. Matikan kunci layar otomatis sebentar.", "The browser won't keep the screen on over this hotspot. Turn off auto-lock for a while.")}</span>
    </div></${H.Sheet}>`;
  };
  const TABS = [
    { k: "hunt", l: ["Buru", "Hunt"], i: "target" },
    { k: "team", l: ["Tim", "Team"], i: "users", member: true },
    { k: "layers", l: ["Lapisan", "Layers"], i: "wave-sine" },
    { k: "results", l: ["Hasil", "Results"], i: "trophy" },
    { k: "mission", l: ["Asisten", "Assistant"], i: "shield-check", asisten: true },
  ];
  H.HuntApp = ({ tab, children, bare }) => {
    const st = H.useStore();
    const N = H.useNet();
    const [disp, setDisp] = useState(false);
    const W = st.width;
    const asisten = N.role === "asisten";
    const member = N.grup !== null;
    const tabs = TABS.filter((t) => (!t.asisten || asisten) && (!t.member || member));
    const g = H.viewGroup();
    const live = N.status === "live";
    return html`<div class="hunt" data-sun=${st.sun ? "yes" : "no"}>
      <header class="hbar">
        <img class="hbar__logo" src=${H.LOGO} alt="IRIS" />
        <span class="hbar__t"><b>${H.T("Perburuan LoRa", "LoRa Hunt")}</b><span class="hint hide-sm">${H.modul(4)} · IRIS-IOT</span></span>
        ${!bare && (member || asisten) && html`<span class=${"hbar__g" + (asisten && !member ? " hbar__g--a" : "")} style=${`--g:var(--group-${asisten && !member ? 0 : g})`}>${asisten && !member ? html`<${Icon} n="shield-check" sm /><span>${L("Asisten", "Assistant")}</span>` : html`<i></i>${W < 640 ? H.gname(g) : H.gfull(g)}`}</span>`}
        <span class="grow"></span>
        <${HClock} compact=${W < 640} />
        <span class="hbar__link" data-tip=${live ? L("Tersambung ke Pi lewat IRIS-IOT", "Connected to the Pi over IRIS-IOT") : L("Menyambung ulang ke Pi", "Reconnecting to the Pi")} tabindex="0"><span class=${"dot " + (live ? "dot--ok dot--pulse" : "dot--warn")}></span></span>
        <${IconBtn} icon="sliders-horizontal" label=${L("Tampilan", "Display")} onClick=${() => setDisp(true)} />
      </header>
      ${!bare && W >= 900 && html`<nav class="htabs" aria-label=${L("Perburuan", "Hunt")}>${tabs.map((t) => html`<button type="button" aria-current=${tab === t.k ? "page" : undefined} onClick=${() => H.go(t.k)}><${Icon} n=${t.i} />${H.title(L(...t.l))}</button>`)}</nav>`}
      ${N.frame && N.frame.pengumuman && !bare && html`<div class="hann" role="status"><${Icon} n="megaphone" /><span>${N.frame.pengumuman.teks}</span></div>`}
      <main class="hpage">${children}</main>
      ${!bare && W < 900 && html`<nav class="hbottom" aria-label=${L("Perburuan", "Hunt")}>${tabs.map((t) => html`<button type="button" aria-current=${tab === t.k ? "page" : undefined} onClick=${() => H.go(t.k)}><${Icon} n=${t.i} /><span>${H.title(L(...t.l))}</span></button>`)}</nav>`}
      ${disp && html`<${HDisplay} onClose=${() => setDisp(false)} />`}
    </div>`;
  };

  /* ------------------------------------------------ pieces */
  H.HeatChip = ({ k, lg }) => html`<span class=${"heat" + (lg ? " heat--lg" : "")} data-h=${k}><i></i>${H.heatLabel(k)}</span>`;
  /* RSSI gives a distance, never a direction: the beacon sits somewhere on
     the dashed ring. Only a sweep from the last 3 minutes adds a bearing,
     on the sweep's own clock (12 is where the sweeper started facing). */
  H.SWEEP_FRESH_SEC = 180;
  H.sweepAge = (sw) => {
    const now = H.net.frame && H.net.frame.berjalan;
    return sw && sw.t != null && now != null ? Math.max(0, now - sw.t) : null;
  };
  const Sonar = ({ heat, closed, live = true, sw }) => {
    const r = 18 + (100 - closed) * 0.62;
    const age = H.sweepAge(sw);
    const a = sw && age != null && age <= H.SWEEP_FRESH_SEC ? (sw.terkuat * Math.PI) / 4 - Math.PI / 2 : null;
    const at = (rr, ang) => [100 + Math.cos(ang) * rr, 100 + Math.sin(ang) * rr];
    const arc = () => {
      const [x1, y1] = at(r, a - Math.PI / 8);
      const [x2, y2] = at(r, a + Math.PI / 8);
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    };
    const blip = a == null ? null : at(r, a);
    return html`<div class="sonar" data-h=${heat} data-live=${live ? "yes" : "no"} role="img" aria-label=${a == null ? L(`Sonar: ${H.heatLabel(heat)}, ${closed}% jarak tertutup, arah belum diketahui`, `Sonar: ${H.heatLabel(heat)}, ${closed}% of the distance closed, direction unknown`) : L(`Sonar: ${H.heatLabel(heat)}, ${closed}% jarak tertutup, terkuat di arah jam ${clockText(sw.terkuat)}`, `Sonar: ${H.heatLabel(heat)}, ${closed}% of the distance closed, strongest at ${clockText(sw.terkuat)} o'clock`)}>
      <svg viewBox="0 0 200 200">
        <defs><radialGradient id="sonarbg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="var(--heat)" stop-opacity=".28" /><stop offset="100%" stop-color="var(--heat)" stop-opacity="0" /></radialGradient>
          <linearGradient id="sweepg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--heat)" stop-opacity="0" /><stop offset="100%" stop-color="var(--heat)" stop-opacity=".55" /></linearGradient></defs>
        <circle cx="100" cy="100" r="96" fill="url(#sonarbg)" />
        ${[24, 48, 72, 96].map((rr) => html`<circle cx="100" cy="100" r=${rr} class="sonar__ring" />`)}
        <line x1="4" y1="100" x2="196" y2="100" class="sonar__ax" /><line x1="100" y1="4" x2="100" y2="196" class="sonar__ax" />
        <g class="sonar__sweep"><path d="M100 100 L196 100 A96 96 0 0 0 167.9 32.1 Z" fill="url(#sweepg)" /></g>
        ${live && html`<circle cx="100" cy="100" r=${r.toFixed(1)} class="sonar__band" />`}
        ${live && blip && html`<path d=${arc()} class="sonar__arc" /><circle cx=${blip[0]} cy=${blip[1]} r="6" class="sonar__blip" /><circle cx=${blip[0]} cy=${blip[1]} r="6" class="sonar__ping" />`}
        ${live && blip && html`<text x="100" y="15" class="sonar__clock">12</text>`}
        <circle cx="100" cy="100" r="5" class="sonar__me" />
      </svg>
    </div>`;
  };
  const Ladder = ({ heat }) =>
    html`<ol class="ladder" aria-label=${L("Tingkat panas", "Heat ladder")}>${H.LADDER.slice().reverse().map((s) => html`<li data-h=${s.k} data-on=${s.k === heat ? "yes" : "no"}><span>${L(...s.l)}</span><small class="num">${s.f ? L(`di bawah ${limit(s)} m`, `under ${limit(s)} m`) : L(`lebih dari ${limit(H.LADDER[3])} m`, `over ${limit(H.LADDER[3])} m`)}</small></li>`)}</ol>`;

  /* Hold-to-claim: press for 1.2 s. Only armed at Membara. */
  const HoldClaim = ({ armed, onDone }) => {
    const [p, setP] = useState(0);
    const timer = useRef(null);
    const start = () => {
      if (!armed || timer.current) return;
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const x = Math.min(1, (Date.now() - t0) / 1200);
        setP(x);
        if (x >= 1) {
          clearInterval(timer.current);
          timer.current = null;
          setP(0);
          if (navigator.vibrate && H.state.vib) navigator.vibrate(40);
          onDone();
        }
      }, 30);
    };
    /* let go early: say how, so a tap never looks broken */
    const stop = () => {
      if (timer.current) H.toast(L("Tahan terus sampai lingkarannya penuh.", "Keep holding until the ring fills."), { tone: "warn" });
      clearInterval(timer.current);
      timer.current = null;
      setP(0);
    };
    return html`<button type="button" class="hold" data-armed=${armed ? "yes" : "no"} style=${`--p:${p}`} disabled=${!armed}
      onPointerDown=${start} onPointerUp=${stop} onPointerLeave=${stop} onPointerCancel=${stop} onContextMenu=${(e) => e.preventDefault()}
      onKeyDown=${(e) => (e.key === " " || e.key === "Enter") && !e.repeat && (e.preventDefault(), start())} onKeyUp=${stop}>
      <span class="hold__fill"></span>
      <span class="hold__t"><${Icon} n="hand-tap" /><span class="stack" style="gap:0"><b>${armed ? L("Tahan untuk Klaim", "Hold to Claim") : L("Klaim Terbuka di Membara", "Claim Opens at Burning")}</b><small>${armed ? L("Tahan 1 detik, lalu foto beaconnya", "Hold 1 second, then photograph the beacon") : L(`Dekati sampai di bawah ${limit(H.LADDER[0])} m`, `Get under ${limit(H.LADDER[0])} m`)}</small></span></span>
    </button>`;
  };
  /* vals: 8 smoothed RSSI readings (or null), best: the strongest facing */
  H.Rose = ({ vals, best }) => {
    const got = vals.filter((v) => v != null);
    const lo = got.length ? Math.min(...got) : 0;
    const hi = got.length ? Math.max(...got) : 1;
    const len = (v) => (v == null ? 0 : 14 + ((v - lo) / (hi - lo || 1)) * 30);
    return html`<svg class="rose" viewBox="0 0 120 120" role="img" aria-label=${best == null ? L("Belum ada sapuan", "No sweep yet") : L(`Terkuat di arah jam ${clockText(best)}`, `Strongest at ${clockText(best)} o'clock`)}>
      <circle cx="60" cy="60" r="52" class="rose__ring" /><circle cx="60" cy="60" r="30" class="rose__ring" />
      ${vals.map((v, i) => {
        if (v == null) return null;
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const l = len(v);
        return html`<line x1="60" y1="60" x2=${60 + Math.cos(a) * l} y2=${60 + Math.sin(a) * l} class=${"rose__ray" + (i === best ? " is-best" : "")} />`;
      })}
      <text x="60" y="12" class="rose__lab">12</text><text x="112" y="64" class="rose__lab">3</text><text x="60" y="117" class="rose__lab">6</text><text x="8" y="64" class="rose__lab">9</text>
    </svg>`;
  };
  H.pingText = (k) => {
    const p = PINGS.find((x) => x.k === k);
    return p ? L(...p.l) : k;
  };
  const PingBar = ({ g }) => {
    const [cool, setCool] = useState(false);
    const fire = async (p) => {
      setCool(true);
      setTimeout(() => setCool(false), 3000);
      const r = await H.ping(p.k);
      if (r.ok) H.toast(L(`Terkirim ke ${H.gname(g)} dan asisten: ${L(...p.l)}`, `Sent to ${H.gname(g)} and the assistants: ${L(...p.l)}`), { tone: "ok" });
      else H.toast(r.kode === "terlalu_cepat" ? L("Tunggu 3 detik sebelum sinyal berikutnya.", "Wait 3 seconds before the next ping.") : L("Sinyal tidak terkirim. Cek sambungan ke IRIS-IOT.", "The ping didn't go through. Check the IRIS-IOT connection."), { tone: "warn" });
    };
    return html`<div class="pings">${PINGS.map((p) => html`<button type="button" class="ping" disabled=${cool} onClick=${() => fire(p)}><${Icon} n=${p.i} /><span>${H.title(L(...p.l))}</span></button>`)}</div>
      <span class="hint">${cool ? L("Tunggu 3 detik sebelum sinyal berikutnya.", "Wait 3 seconds before the next ping.") : L("Hanya timmu dan asisten yang melihat sinyal ini.", "Only your team and the assistants see these.")}</span>`;
  };
  /* the standings the projector uses too: found groups first by finish
     time, then the rest by the whole percent of their own distance closed,
     ties by group number, so lanes don't swap on noise */
  H.standings = (rows) =>
    rows.slice().sort((a, b) => (b.status === "menang") - (a.status === "menang") || (a.status === "menang" ? (a.durasi || 0) - (b.durasi || 0) : H.closedOf(b) - H.closedOf(a)) || a.grup - b.grup);
  /* The race at a glance, at the top of Buru: every group on one track,
     yours drawn larger, and who is just ahead or behind. */
  const Race = ({ g }) => {
    const rows = (H.net.frame && H.net.frame.grup) || [];
    const me = rows.find((r) => r.grup === g);
    if (!me || rows.length < 2) return null;
    const order = H.standings(rows);
    const place = order.indexOf(me) + 1;
    const ahead = place > 1 ? order[place - 2] : null;
    const behind = order[place] || null;
    const gap = (a, b) => Math.max(0, H.closedOf(a) - H.closedOf(b));
    const line =
      me.status === "menang" ? L(`Beacon ketemu, urutan ${place}`, `Beacon found, place ${place}`)
      : ahead && ahead.status === "menang" ? L(`${H.gname(ahead.grup)} sudah menemukan beaconnya`, `${H.gname(ahead.grup)} has found its beacon`)
      : ahead && gap(ahead, me) === 0 ? L(`Sejajar dengan ${H.gname(ahead.grup)}`, `Level with ${H.gname(ahead.grup)}`)
      : ahead ? L(`${H.gname(ahead.grup)} di depan ${gap(ahead, me)}%`, `${H.gname(ahead.grup)} is ${gap(ahead, me)}% ahead`)
      : behind ? L(`Kalian memimpin, ${H.gname(behind.grup)} ${gap(me, behind)}% di belakang`, `You're leading, ${H.gname(behind.grup)} is ${gap(me, behind)}% behind`)
      : L("Kalian memimpin", "You're leading");
    return html`<section class="card hrace" style=${`--g:var(--group-${g})`}>
      <div class="hrace__top"><span class="hrace__place num" data-lead=${place === 1 ? "yes" : "no"}>#${place}<small>/${rows.length}</small></span><b class="grow">${line}</b></div>
      <div class="hrace__track" role="img" tabindex="0" data-tip=${L("Tiap kelompok memburu beaconnya sendiri, jadi yang dibandingkan jarak tertutup, bukan RSSI.", "Each group hunts its own beacon, so the distance closed is compared, never RSSI.")} aria-label=${order.map((r) => `${H.gname(r.grup)} ${H.closedOf(r)}%`).join(", ")}>
        ${rows.map((r) => html`<span key=${r.grup} class=${"hrace__dot" + (r.grup === g ? " is-me" : "")} style=${`--g:var(--group-${r.grup});left:${H.closedOf(r)}%`}></span>`)}
        <span class="hrace__end"><${Icon} n="flag-checkered" sm /></span></div>
      <div class="hrace__legend">${order.map((r) => html`<span class=${r.grup === g ? "is-me" : ""} style=${`--g:var(--group-${r.grup})`}><i></i>${H.gname(r.grup)} <b class="num">${r.status === "menang" ? H.ms(r.durasi) : H.closedOf(r) + "%"}</b></span>`)}</div>
    </section>`;
  };

  /* ------------------------------------------------ joining */
  H.Join = () => {
    const N = H.useNet();
    const [step, setStep] = useState(N.grup !== null ? "role" : "nim");
    const [nim, setNim] = useState("");
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [role, setRole] = useState(N.peranTim);
    const st = H.useStore();
    /* set while the form signs in, so the group reveal isn't skipped: the
       effect below runs with the step from before the sign-in resolved */
    const viaForm = useRef(false);
    /* the server is the authority: a stored NIM that resolves on connect
       skips straight to the role, one that stops resolving goes back */
    useEffect(() => {
      if (N.grup === null && step !== "nim") setStep("nim");
      if (N.grup !== null && step === "nim" && !viaForm.current) {
        setRole(N.peranTim);
        setStep("role");
      }
    }, [N.grup]);
    const noSession = N.frame && N.frame.sesi == null;
    const submit = async (e, given) => {
      if (e) e.preventDefault();
      const v = given || nim;
      if (busy || v.length < 4) return;
      setBusy(true);
      setErr(null);
      viaForm.current = true;
      const r = await H.masuk(v);
      setBusy(false);
      if (!r.ok) viaForm.current = false;
      if (r.ok) {
        setRole(r.peran_tim || null);
        setStep("reveal");
        return;
      }
      setErr(r.kode || r.alasan || "galat");
    };
    const pick = async () => {
      setBusy(true);
      const r = await H.timPeran(role);
      setBusy(false);
      if (!r.ok) {
        H.toast(L("Peran belum tersimpan. Coba lagi.", "The role wasn't saved. Try again."), { tone: "warn" });
        return;
      }
      H.go("hunt");
    };
    /* a NIM from the web's QR link signs in as soon as the Pi answers */
    useEffect(() => {
      if (!H.urlNim || step !== "nim" || N.status !== "live" || noSession) return;
      const v = H.urlNim;
      H.urlNim = null;
      setNim(v);
      submit(null, v);
    }, [N.status, step, noSession]);
    const g = N.grup;
    let body;
    if (noSession && g === null)
      body = html`<section class="card card--raised hjoin"><${H.StateView} icon="hourglass-high" title=${L("Belum ada perburuan", "No hunt yet")} body=${nextSlot() ? L(`Perburuan berikutnya mulai pukul ${nextSlot()}. Halaman ini terbuka sendiri saat asisten memulainya.`, `The next hunt starts at ${nextSlot()}. This page opens by itself when the assistant starts it.`) : L("Tidak ada sesi lagi hari ini. Halaman ini terbuka sendiri saat asisten memulai sesi.", "There are no more sessions today. This page opens by itself when an assistant starts one.")} /><${HClock} />
        <button type="button" class="hjoin__asisten" onClick=${() => H.go("mission")}><${Icon} n="shield-check" sm />${L("Saya Asisten", "I'm an Assistant")}</button></section>`;
    else if (step === "nim" || g === null) {
      const msg = {
        tak_terdaftar: L("NIM ini tidak ada di daftar sesi yang berjalan. Cek lagi, atau panggil asisten.", "This NIM isn't on the running session's list. Check it, or call an assistant."),
        tak_ada_sesi: L("Belum ada sesi yang berjalan. Tunggu asisten memulainya.", "No session is running yet. Wait for the assistant to start it."),
        nim_cacat: L("NIM hanya berisi angka dan huruf, 4 sampai 20 karakter.", "A NIM has only digits and letters, 4 to 20 characters."),
        terlalu_sering: L("Terlalu banyak percobaan. Panggil asisten.", "Too many tries. Call an assistant."),
      }[err] || (err ? L("Tidak tersambung ke Pi. Cek Wi-Fi IRIS-IOT, lalu coba lagi.", "Not connected to the Pi. Check the IRIS-IOT Wi-Fi, then try again.") : null);
      body = html`<form class="card card--raised hjoin" onSubmit=${submit}>
        <span class="eyebrow">${L("Selamat datang di perburuan", "Welcome to the hunt")}</span>
        <h1 class="h-title">${H.T("Masuk dengan NIM", "Sign in with your NIM")}</h1>
        <p class="lede">${L("Kelompokmu diambil dari daftar sesi ini. Kamu tidak perlu memilihnya.", "Your group comes from this session's list. You don't pick it.")}</p>
        <label class="field"><span class="label">NIM</span><input class="input hnim mono" inputmode="numeric" autocomplete="off" maxlength="20" id="h-nim" value=${nim} onInput=${(e) => setNim(e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase())} placeholder="1032230310" />
          ${msg && html`<span class="error"><${Icon} n="warning" sm />${msg}</span>`}</label>
        <${Btn} type="submit" kind="primary" lg block icon="arrow-right" disabled=${nim.length < 4 || busy}>${busy ? L("Mencari", "Looking Up") : L("Masuk", "Sign In")}</${Btn}>
        <span class="hint">${L("Tanpa internet. Kamu tersambung ke Pi lewat Wi-Fi IRIS-IOT.", "No internet. You're connected to the Pi over the IRIS-IOT Wi-Fi.")}</span>
        <button type="button" class="hjoin__asisten" onClick=${() => H.go("mission")}><${Icon} n="shield-check" sm />${L("Saya Asisten", "I'm an Assistant")}</button>
      </form>`;
    } else if (step === "reveal") {
      const mem = H.members(g);
      body = html`<section class="card card--raised hjoin hreveal" style=${`--g:var(--group-${g})`}>
        <span class="eyebrow">${L("Kamu masuk sebagai", "You're in as")}</span>
        <div class="hreveal__star"><${Icon} n="star-four" lg /></div>
        <h1 class="h-title">${H.gname(g)}</h1>
        <p class="lede">${H.sync(g) ? L(`${H.kelompok(g)} · beacon kalian memancar dengan sync word ${H.sync(g)}. Papan lain tidak akan terbaca.`, `${H.kelompok(g)} · your beacon sends on sync word ${H.sync(g)}. Other boards won't be read.`) : H.kelompok(g)}</p>
        ${N.nama && html`<span class="hint">${L(`Halo, ${N.nama}`, `Hi, ${N.nama}`)}</span>`}
        <div class="row" style="gap:6px;justify-content:center">${mem.map((m) => html`<span class=${"hmem" + (m.hadir ? " is-on" : "")} data-tip=${m.nama} tabindex="0">${H.initials(m.nama)}</span>`)}</div>
        <${Btn} kind="primary" lg block iconEnd="arrow-right" onClick=${() => setStep("role")}>${L("Lanjut, Pilih Peran", "Next, Pick a Role")}</${Btn}>
      </section>`;
    } else {
      const mem = H.members(g);
      body = html`<section class="card card--raised hjoin">
        <span class="eyebrow">${H.gfull(g)}</span>
        <h1 class="h-title">${H.T("Pilih peranmu", "Pick your role")}</h1>
        <p class="lede">${L("Peran hanya mengubah urutan layar Buru. Semua ponsel tetap melihat seluruh perburuan.", "A role only reorders the Hunt screen. Every phone still sees the whole hunt.")}</p>
        <div class="roles">${Object.entries(ROLES).map(([k, r]) => html`<button type="button" class="rolecard" aria-pressed=${String(role === k)} onClick=${() => setRole(k)}>
          <span class="rolecard__ic"><${Icon} n=${r.i} lg /></span><span class="stack" style="gap:2px"><b>${L(...r.l)}</b><span class="hint">${L(...r.d)}</span></span>
          <span class="rolecard__who">${mem.filter((m) => m.peran === k).map((m) => html`<span class="hmem is-on" data-tip=${m.nama}>${H.initials(m.nama)}</span>`)}</span></button>`)}</div>
        ${!st.sound && html`<div class="banner banner--ok"><${Icon} n="speaker-high" /><span class="grow">${L("Izinkan suara dan getar supaya kamu bisa berburu tanpa melihat layar.", "Allow sound and vibration so you can hunt without watching the screen.")}</span><${Btn} sm onClick=${() => { H.unlockSound(); H.toast(L("Suara dan getar menyala.", "Sound and vibration on."), { tone: "ok" }); }}>${L("Izinkan", "Allow")}</${Btn}></div>`}
        <${Btn} kind="primary" lg block icon="target" disabled=${!role || busy} onClick=${pick}>${L("Mulai Berburu", "Start Hunting")}</${Btn}>
      </section>`;
    }
    const bare = g === null;
    return html`<${H.HuntApp} tab="hunt" bare=${bare}><div class="hpage__in hpage__in--narrow">${body}</div></${H.HuntApp}>`;
  };

  /* ------------------------------------------------ claim and sweep sheets */
  const ClaimSheet = ({ g, onClose }) => {
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState(null);
    const [busy, setBusy] = useState(false);
    const input = useRef(null);
    useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
    const choose = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      setFile(f);
      setUrl(URL.createObjectURL(f));
    };
    const send = async (close, withPhoto) => {
      setBusy(true);
      let foto = null;
      if (withPhoto && file) {
        const up = await H.uploadPhoto(g, file);
        if (!up.ok) {
          setBusy(false);
          H.toast(L(`Foto tidak terkirim: ${up.alasan || "coba lagi"}.`, `The photo didn't go through: ${up.alasan || "try again"}.`), { tone: "warn" });
          return;
        }
        foto = up.berkas;
      }
      const r = await H.klaim(g, foto);
      setBusy(false);
      if (r.ok) {
        close();
        H.toast(L("Klaim dikirim. Tetap di dekat beacon.", "Claim sent. Stay near the beacon."), { tone: "ok" });
      } else H.toast(L(`Klaim belum bisa dikirim: ${r.alasan || "coba lagi"}.`, `The claim couldn't be sent: ${r.alasan || "try again"}.`), { tone: "warn" });
    };
    return html`<${H.Sheet} title=${L("Kirim klaim", "Send a claim")} onClose=${onClose}>${(close) => html`<div class="stack">
      <input ref=${input} type="file" accept="image/*" capture="environment" hidden onChange=${choose} />
      <button type="button" class="hphoto" onClick=${() => input.current && input.current.click()}>
        ${url ? html`<img src=${url} alt=${L("Foto beacon", "Beacon photo")} />` : html`<${Icon} n="camera" lg /><span>${L("Foto beacon di tempatnya", "Photograph the beacon where it is")}</span>`}
      </button>
      <span class="hint">${L("Asisten mengecek fotonya. Kalau ditolak, kalian bisa klaim lagi.", "An assistant checks the photo. If it's turned down, you can claim again.")}</span>
      <${Btn} kind="primary" lg block icon="paper-plane-tilt" disabled=${!file || busy} onClick=${() => send(close, true)}>${busy ? L("Mengirim", "Sending") : L("Kirim Klaim", "Send the Claim")}</${Btn}>
      <button type="button" class="linkbtn" disabled=${busy} onClick=${() => send(close, false)}>${L("Kamera tidak bisa dipakai? Kirim tanpa foto", "Camera not working? Send without a photo")}</button>
    </div>`}</${H.Sheet}>`;
  };
  /* Your body is the antenna: face one way, stand still 4 seconds while
     the phone takes the median of the group's smoothed RSSI from the
     frames, turn 45 degrees, repeat. Over plain HTTP there is no compass,
     so each facing waits for a tap. */
  const SweepSheet = ({ g, onClose }) => {
    const [vals, setVals] = useState([null, null, null, null, null, null, null, null]);
    const [k, setK] = useState(0);
    const [rec, setRec] = useState(null);
    const [busy, setBusy] = useState(false);
    const samples = useRef([]);
    H.useInterval(() => {
      if (rec == null) return;
      const row = H.row(g);
      if (row && row.halus != null && !(H.heatOf(row) === "hilang")) samples.current.push(row.halus);
      const p = Math.min(1, (Date.now() - rec) / 4000);
      if (p >= 1) {
        const s = samples.current.slice().sort((a, b) => a - b);
        const med = s.length ? s[Math.floor(s.length / 2)] : null;
        setVals((v) => v.map((x, i) => (i === k ? med : x)));
        setRec(null);
        if (med == null) H.toast(L("Tidak ada paket selama 4 detik. Ulangi arah ini.", "No packets for 4 seconds. Record this facing again."), { tone: "warn" });
        else {
          if (navigator.vibrate && H.state.vib) navigator.vibrate(30);
          setK((x) => Math.min(7, x + 1));
        }
      } else setRec((r) => r);
    }, 100);
    H.useTick(rec == null ? null : 200);
    const done = vals.filter((v) => v != null).length;
    const best = done ? vals.reduce((b, v, i) => (v != null && (b == null || v > vals[b]) ? i : b), null) : null;
    const start = () => {
      samples.current = [];
      setRec(Date.now());
    };
    const sendIt = async (close) => {
      setBusy(true);
      const r = await H.sapuan(vals, "manual");
      setBusy(false);
      if (r.ok) {
        close();
        H.toast(L(`Sapuan terkirim. Terkuat di arah jam ${clockText(best)}.`, `Sweep sent. Strongest at ${clockText(best)} o'clock.`), { tone: "ok" });
      } else H.toast(L(`Sapuan belum terkirim: ${r.alasan || "coba lagi"}.`, `The sweep wasn't sent: ${r.alasan || "try again"}.`), { tone: "warn" });
    };
    const prog = rec == null ? 0 : Math.min(1, (Date.now() - rec) / 4000);
    return html`<${H.Sheet} title=${L("Sapuan 8 arah", "8-facing sweep")} onClose=${onClose}>${(close) => html`<div class="stack">
      <ol class="seesteps"><li>${L("Pilih arah awal. Itu jam 12.", "Pick a starting facing. That's 12 o'clock.")}</li><li>${L("Ketuk Rekam, lalu diam 4 detik.", "Tap Record, then stand still for 4 seconds.")}</li><li>${L("Putar 45 derajat searah jarum jam, ulangi sampai 8 arah.", "Turn 45 degrees clockwise and repeat for all 8.")}</li></ol>
      <div class="row" style="justify-content:center"><${H.Rose} vals=${vals} best=${best} /></div>
      <div class="row row--between"><span class="hint num">${L(`${done} dari 8 arah terekam`, `${done} of 8 facings recorded`)}</span><span class="hint num">${L(`Arah jam ${clockText(k)}`, `Facing ${clockText(k)} o'clock`)}</span></div>
      ${rec != null && html`<${H.Bar} p=${Math.round(prog * 100)} />`}
      <span class="hint">${L("Kompas otomatis hanya jalan lewat HTTPS. Di hotspot ini, putar sendiri lalu ketuk Rekam.", "The automatic compass only works over HTTPS. On this hotspot, turn yourself and tap Record.")}</span>
      <div class="r5act">
        <${Btn} disabled=${done < 4 || busy || rec != null} icon="paper-plane-tilt" onClick=${() => sendIt(close)}>${L("Kirim Sapuan", "Send the Sweep")}</${Btn}>
        <${Btn} kind="primary" lg icon="record" disabled=${rec != null} onClick=${start}>${rec != null ? L("Diam dulu", "Hold Still") : L(`Rekam Arah ${k + 1}`, `Record Facing ${k + 1}`)}</${Btn}>
      </div>
      <span class="hint">${L("Paling sedikit 4 arah sebelum sapuan bisa dikirim.", "At least 4 facings before the sweep can be sent.")}</span>
    </div>`}</${H.Sheet}>`;
  };

  /* ------------------------------------------------ the Hunt screen */
  const GroupPick = ({ g }) => {
    const ids = H.groups();
    if (!ids.length) return null;
    return html`<div class="row" style="gap:6px">${ids.map((n) => html`<button type="button" class="chipbtn gchip" style=${`--g:var(--group-${n})`} aria-pressed=${String(n === g)} onClick=${() => H.setViewGroup(n)}><i></i>${H.gname(n)}</button>`)}</div>`;
  };
  H.GroupPick = GroupPick;
  H.Hunt = () => {
    const N = H.useNet();
    const member = N.grup !== null;
    const g = H.viewGroup();
    const row = H.row(g);
    const heat = H.heatOf(row);
    const closed = H.closedOf(row);
    const role = member ? N.peranTim || "pemandu" : "operator";
    const [sheet, setSheet] = useState(null);
    const [seenReject, setSeenReject] = useState(0);
    useEffect(() => {
      if (member) H.feelHeat(heat === "menang" ? "hilang" : heat);
    });
    const f = N.frame;
    const sisa = f && f.sesi_sisa != null ? Math.ceil(f.sesi_sisa / 60) : null;
    const head = html`<div class="hhead"><span class="row" style="gap:8px">${member ? html`<${Badge}><${Icon} n=${ROLES[role].i} sm />${L(...ROLES[role].l)}</${Badge}>` : html`<${Badge} tone="ok"><${Icon} n="eye" sm />${L("Melihat sebagai asisten", "Viewing as an assistant")}</${Badge}>`}<span class="hint">${sisa != null ? L(`Arena ${arena()} m · sisa ${sisa} menit`, `Arena ${arena()} m · ${sisa} minutes left`) : L(`Arena ${arena()} m`, `Arena ${arena()} m`)}</span></span>${!member && html`<${GroupPick} g=${g} />`}</div>`;
    if (!row)
      return html`<${H.HuntApp} tab="hunt"><div class="hpage__in">${head}
        <section class="card card--raised hjoin"><${H.StateView} icon="broadcast" title=${L("Menunggu hunter kelompokmu", "Waiting for your group's hunter")} body=${L("Pi belum menerima paket dari hunter kelompok ini. Nyalakan papan hunter dan pastikan tersambung ke IRIS-IOT.", "The Pi hasn't had a packet from this group's hunter yet. Power the hunter board and make sure it's on IRIS-IOT.")} /></section></div></${H.HuntApp}>`;
    const band = row.jarak_dekat != null ? [metres(row.jarak_dekat), metres(row.jarak_jauh)] : null;
    const trend = H.trend10(g);
    const sw = f && f.sapuan ? f.sapuan[String(g)] : null;
    const swAge = H.sweepAge(sw);
    const fresh = swAge != null && swAge <= H.SWEEP_FRESH_SEC;
    const sweepAgo = swAge == null ? "" : swAge < 60 ? L("barusan", "just now") : L(`${Math.floor(swAge / 60)} menit lalu`, `${Math.floor(swAge / 60)} min ago`);
    const rejected = row.status === "ditolak" && seenReject !== row.klaim_ke;
    const place = row.status === "menang" ? row.rank : null;
    const avgDelay = H.avgDelay(g);
    const cards = {
      sonar: html`<section class="card hsonar" data-h=${heat}>
        <div class="hsonar__grid">
          <${Sonar} heat=${heat} closed=${closed} live=${heat !== "hilang"} sw=${sw} />
          <div class="stack hsonar__read">
            <${H.HeatChip} k=${heat} lg />
            ${heat !== "hilang" && band
              ? html`<b class="hdist num">${L(`${band[0]} sampai ${band[1]} m`, `${band[0]} to ${band[1]} m`)}</b><span class="hint">${L("perkiraan jarak dari RSSI halus", "estimated distance from the smoothed RSSI")}</span>`
              : html`<b class="hdist">${L("Tidak ada paket", "No packets")}</b><span class="hint">${L("3 detik tanpa paket. Kembali ke tempat terakhir sinyalnya kuat.", "3 seconds without a packet. Go back to where the signal was last strong.")}</span>`}
            <div class="hclosed"><div class="row row--between"><span class="label">${L("Jarak tertutup", "Distance closed")}</span><b class="num">${closed}%</b></div><${H.Bar} p=${closed} g=${g} /></div>
            ${heat !== "hilang" && heat !== "menang" && html`<span class="htrend" data-t=${trend}><${Icon} n=${trend === "naik" ? "arrow-up" : trend === "turun" ? "arrow-down" : "minus"} sm />${trend === "naik" ? L("Mendekat dalam 10 detik terakhir", "Getting closer over the last 10 seconds") : trend === "turun" ? L("Menjauh dalam 10 detik terakhir", "Moving away over the last 10 seconds") : L("Stabil dalam 10 detik terakhir", "Steady over the last 10 seconds")}</span>`}
            ${heat !== "hilang" && heat !== "menang" && html`<span class="hint hsonar__dir">${fresh ? L(`Arah dari sapuan ${sweepAgo}: terkuat di jam ${clockText(sw.terkuat)}.`, `Direction from the sweep ${sweepAgo}: strongest at ${clockText(sw.terkuat)} o'clock.`) : L("Cincin putus-putus menunjukkan jaraknya, belum arahnya. Sapu 8 arah untuk tahu arahnya.", "The dashed ring shows the distance, not yet the direction. Sweep 8 facings to find it.")}</span>`}
          </div>
        </div>
        <${Ladder} heat=${heat} />
      </section>`,
      claim: !member
        ? html`<section class="card hclaim" data-c="wait"><${Icon} n="hand-tap" lg /><div class="stack stack--sm"><b class="h3">${H.T("Klaim kelompok ini", "This group's claim")}</b><span>${{ memburu: L("Belum mengklaim.", "No claim yet."), menunggu: L("Klaim menunggu tinjauan di ruang kendali.", "A claim is waiting in mission control."), ditolak: L(`Klaim terakhir ditolak: ${row.tolak_alasan || ""}`, `Last claim turned down: ${row.tolak_alasan || ""}`), menang: L(`Ketemu pada ${H.ms(row.durasi)}.`, `Found at ${H.ms(row.durasi)}.`) }[row.status]}</span></div></section>`
        : row.status === "menunggu"
          ? html`<section class="card hclaim" data-c="wait"><${Icon} n="hourglass-high" lg /><div class="stack stack--sm"><b class="h3">${H.T("Klaim dikirim", "Claim sent")}</b><span>${L("Asisten sedang mengecek foto kalian. Tetap di dekat beacon.", "An assistant is checking your photo. Stay near the beacon.")}</span></div></section>`
          : rejected
            ? html`<section class="card hclaim" data-c="no"><${Icon} n="x-circle" lg /><div class="stack stack--sm"><b class="h3">${H.T("Klaim ditolak", "Claim turned down")}</b><span>${L(`Alasan dari asisten: ${row.tolak_alasan || "tanpa alasan"}`, `The assistant's reason: ${row.tolak_alasan || "no reason given"}`)}</span><div class="r5act" style="justify-content:flex-start"><${Btn} sm icon="arrow-clockwise" onClick=${() => setSeenReject(row.klaim_ke)}>${L("Klaim Lagi", "Claim Again")}</${Btn}></div></div></section>`
            : row.status === "menang"
              ? html`<section class="card hwin" style=${`--g:var(--group-${g})`}><div class="hwin__burst"></div><span class="eyebrow">${L("Beacon ketemu", "Beacon found")}</span><h2 class="h-display">${H.T("Kalian menang!", "You found it!")}</h2>
                  <div class="stats"><div class="stat"><b class="num">${H.ms(row.durasi)}</b><span>${L("waktu ketemu", "finish time")}</span></div><div class="stat"><b class="num">#${place}</b><span>${L("urutan", "place")}</span></div><div class="stat"><b class="num">${H.fmt(row.diterima)}</b><span>${L("paket diterima", "packets received")}</span></div><div class="stat"><b class="num">${avgDelay == null ? "·" : H.fmt(avgDelay) + " ms"}</b><span>${L("rata-rata delay", "average delay")}</span></div></div>
                  <div class="card__actions"><${Btn} kind="inverse" lg block iconEnd="arrow-right" onClick=${() => H.go("results")}>${L("Lihat Hasil", "See the Results")}</${Btn}></div></section>`
              : html`<section class="card"><${HoldClaim} armed=${!!row.calon} onDone=${() => setSheet("claim")} /></section>`,
      link: html`<section class="card"><div class="card__head"><h2 class="card__title">${H.T("Tautan radio", "Radio link")}</h2><span class="hint">${L("Ketuk angka untuk grafiknya", "Tap a number for its chart")}</span></div>
        <div class="dcards hdcards">
          <${H.DataCard} label="SNR" value=${H.fmt(row.snr, 1)} unit="dB" dp=${1} series=${H.series(g, "snr")} />
          <${H.DataCard} label=${L("Paket hilang", "Lost packets")} value=${H.fmt(row.rugi_persen, 1)} unit="%" dp=${1} tone="var(--danger)" series=${H.series(g, "lost")} />
          <${H.DataCard} label=${L("Delay satu arah", "One-way delay")} value=${H.fmt(row.delay_ms)} unit="ms" tone="var(--accent)" series=${H.series(g, "delay")} />
        </div></section>`,
      sweep: html`<section class="card hsweep"><div class="card__head"><h2 class="card__title">${H.T("Sapuan 8 arah", "8-facing sweep")}</h2>${sw && html`<span class="hint">${L(`oleh ${sw.oleh} pada ${sw.at.slice(0, 5)}`, `by ${sw.oleh} at ${sw.at.slice(0, 5)}`)}</span>`}</div>
        <div class="hsweep__row"><${H.Rose} vals=${sw ? sw.arah : [null, null, null, null, null, null, null, null]} best=${sw ? sw.terkuat : null} /><div class="stack stack--sm"><b>${sw ? L(`Terkuat di arah jam ${clockText(sw.terkuat)}`, `Strongest at ${clockText(sw.terkuat)} o'clock`) : L("Belum ada sapuan", "No sweep yet")}</b><span class="hint">${L("Tubuhmu jadi antena: hadap satu arah, diam 4 detik, putar 45 derajat.", "Your body is the antenna: face one way, stand still 4 seconds, turn 45 degrees.")}</span>
          ${member && html`<${Btn} sm icon="compass" onClick=${() => setSheet("sweep")}>${L("Sapu 8 Arah", "Sweep 8 Facings")}</${Btn}>`}</div></div></section>`,
      pings: member ? html`<section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sinyal tim", "Team pings")}</h2></div><${PingBar} g=${g} /></section>` : null,
      race: f && f.grup && f.grup.length > 1 ? html`<${Race} g=${g} />` : null,
    };
    const ORDER = { pemandu: ["race", "sonar", "claim", "sweep", "pings", "link"], pengintai: ["race", "claim", "sonar", "pings", "sweep", "link"], operator: ["race", "sonar", "link", "claim", "pings", "sweep"] }[role];
    return html`<${H.HuntApp} tab="hunt">
      <div class="hpage__in">${head}
        <div class="hgrid">${ORDER.filter((k) => cards[k]).map((k) => html`<div class=${"hcell hcell--" + k} key=${k}>${cards[k]}</div>`)}</div>
      </div>
      ${sheet === "claim" && html`<${ClaimSheet} g=${g} onClose=${() => setSheet(null)} />`}
      ${sheet === "sweep" && html`<${SweepSheet} g=${g} onClose=${() => setSheet(null)} />`}
    </${H.HuntApp}>`;
  };

  /* ------------------------------------------------ the Team screen */
  H.Team = () => {
    const N = H.useNet();
    const g = N.grup;
    if (g === null) return html`<${H.Hunt} />`;
    const mem = H.members(g);
    const role = N.peranTim;
    const setRole = async (v) => {
      const r = await H.timPeran(v);
      if (!r.ok) H.toast(L("Peran belum tersimpan. Coba lagi.", "The role wasn't saved. Try again."), { tone: "warn" });
    };
    const calling = N.frame && N.frame.panggil && N.frame.panggil[String(g)] != null;
    const call = async () => {
      const r = await H.panggil(calling);
      if (r.ok) H.toast(r.aktif ? L("Asisten dipanggil.", "Assistant called.") : L("Panggilan dibatalkan.", "Call cancelled."), { tone: "ok" });
      else H.toast(L("Panggilan tidak terkirim. Cek sambungan ke IRIS-IOT.", "The call didn't go through. Check the IRIS-IOT connection."), { tone: "warn" });
    };
    const log = N.pings.filter((p) => p.grup === g).slice(-5).reverse();
    const ann = N.frame && N.frame.pengumuman;
    const sw = N.frame && N.frame.sapuan ? N.frame.sapuan[String(g)] : null;
    return html`<${H.HuntApp} tab="team">
      <div class="hpage__in">
        <div class="hgrid hgrid--2">
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Peranmu", "Your role")}</h2><span class="hint">${L("hanya mengubah urutan layar Buru", "only reorders the Hunt screen")}</span></div>
            <${Tabs} fill value=${role} onChange=${setRole} label=${L("Peranmu", "Your role")} tabs=${Object.entries(ROLES).map(([v, r]) => ({ v, l: L(...r.l), icon: r.i }))} />
            <div class="crew">${Object.entries(ROLES).map(([k, r]) => html`<div class="crew__r"><span class="crew__role"><${Icon} n=${r.i} sm />${L(...r.l)}</span><span class="row" style="gap:6px">${mem.filter((m) => m.peran === k).map((m) => html`<span class="crew__m"><i class=${m.hadir ? "is-on" : ""}></i>${m.nama}</span>`)}</span></div>`)}
              ${mem.some((m) => !m.peran) && html`<div class="crew__r"><span class="crew__role">${L("Belum memilih", "No role yet")}</span><span class="row" style="gap:6px">${mem.filter((m) => !m.peran).map((m) => html`<span class="crew__m"><i class=${m.hadir ? "is-on" : ""}></i>${m.nama}</span>`)}</span></div>`}</div>
            <span class="hint">${L("Titik terang berarti ponselnya sedang tersambung.", "A lit dot means that phone is connected.")}</span></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sinyal tim", "Team pings")}</h2><span class="hint">${L(`hanya ${H.gname(g)} dan asisten`, `${H.gname(g)} and assistants only`)}</span></div><${PingBar} g=${g} />
            <div class="tabstops tabstops--3">
              ${ann && html`<div class="tabstops__row"><span class="mono hint">${ann.at.slice(0, 5)}</span><span><b>${L("Asisten", "Assistant")}</b> ${L(`mengumumkan: ${ann.teks}`, `announced: ${ann.teks}`)}</span><span></span></div>`}
              ${log.map((p) => html`<div class="tabstops__row"><span class="mono hint">${p.at.slice(0, 5)}</span><span><b>${p.dari || L("Anggota", "A member")}</b> ${H.pingText(p.kode).toLowerCase()}</span><span></span></div>`)}
              ${!log.length && !ann && html`<span class="hint">${L("Belum ada sinyal.", "No pings yet.")}</span>`}
            </div></section>
          <section class="card card--pin"><div class="card__head"><h2 class="card__title">${H.T("Panggil asisten", "Call an assistant")}</h2>${calling && html`<${Badge} tone="warn">${L("memanggil", "calling")}</${Badge}>`}</div>
            <p class="card__sub">${L("Papan mati, baterai habis, atau bingung? Asisten melihat panggilanmu di ruang kendali.", "Board dead, battery flat, or stuck? The assistants see your call in mission control.")}</p>
            <div class="card__actions"><${Btn} kind=${calling ? "secondary" : "inverse"} lg block icon=${calling ? "x" : "hand-waving"} onClick=${call}>${calling ? L("Batalkan Panggilan", "Cancel the Call") : L("Panggil Asisten", "Call an Assistant")}</${Btn}></div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sapuan terakhir", "Latest sweep")}</h2></div>
            <div class="hsweep__row"><${H.Rose} vals=${sw ? sw.arah : [null, null, null, null, null, null, null, null]} best=${sw ? sw.terkuat : null} /><div class="stack stack--sm"><b>${sw ? L(`Terkuat di arah jam ${clockText(sw.terkuat)}`, `Strongest at ${clockText(sw.terkuat)} o'clock`) : L("Belum ada sapuan", "No sweep yet")}</b>${sw && html`<span class="hint">${L(`oleh ${sw.oleh} pada ${sw.at.slice(0, 5)}`, `by ${sw.oleh} at ${sw.at.slice(0, 5)}`)}</span>`}</div></div></section>
        </div>
        <div class="r5act" style="justify-content:flex-start"><${Btn} kind="ghost" sm icon="sign-out" onClick=${H.keluar}>${L("Keluar dari Kelompok", "Leave the Group")}</${Btn}></div>
      </div>
    </${H.HuntApp}>`;
  };
})();
