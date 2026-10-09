/* Perburuan LoRa IRIS: the entry point.

   One address for everyone. Roles are told apart inside the page: a
   student types their NIM once, an assistant types the token once, and
   the projector opens ?stage=1. Tabs live in the hash (#buru, #tim,
   #lapisan, #hasil, #asisten) so the back button and a reload keep the
   place. Language is ?lang=id|en|zh or the Display sheet. */
(function () {
  const { html, render, useEffect, useState } = window.htmPreact;
  const H = window.H;
  const L = H.L;

  const HASH = { hunt: "buru", team: "tim", layers: "lapisan", results: "hasil", mission: "asisten" };
  const BACK = Object.fromEntries(Object.entries(HASH).map(([k, v]) => [v, k]));
  const fromHash = () => BACK[(window.location.hash || "").replace(/^#\/?/, "")] || "hunt";
  const STAGE = new URLSearchParams(window.location.search).get("stage") === "1";
  H.state.route = fromHash();
  H.go = (k) => {
    if (HASH[k] && window.location.hash !== "#" + HASH[k]) window.location.hash = HASH[k];
    H.set({ route: k });
    const s = document.querySelector(".huntapp__scroll");
    if (s) s.scrollTop = 0;
  };
  window.addEventListener("hashchange", () => {
    H.set({ route: fromHash() });
    const s = document.querySelector(".huntapp__scroll");
    if (s) s.scrollTop = 0;
  });

  /* the group a screen shows: your own, or the one an assistant picked */
  H.viewGroup = () => {
    const N = H.net;
    if (N.grup !== null) return N.grup;
    const ids = H.groups();
    return H.state.viewG && ids.includes(H.state.viewG) ? H.state.viewG : ids[0] || 1;
  };
  H.setViewGroup = (g) => H.set({ viewG: g });

  /* "Round over" shows once per round, then the phone can browse again */
  let endedSeen = null;
  H.dismissEnded = () => {
    endedSeen = H.net.frame && H.net.frame.ronde;
  };

  /* Toasts for what matters to this phone: its own group's moments, any
     announcement, and for assistants every claim and call. */
  H.onEvents((evs) => {
    /* the projector shows moments in its own banner */
    if (STAGE) return;
    const N = H.net;
    const mine = N.grup;
    const asisten = N.role === "asisten";
    for (const ev of evs) {
      if (ev.kind === "_ping") {
        const p = ev.ping;
        if (p.dari_id !== N.connId) H.toast(`${asisten && p.grup !== mine ? H.gname(p.grup) + " · " : ""}${p.dari}: ${H.pingText(p.kode)}`, { icon: "chat-circle-dots" });
        continue;
      }
      if (ev.kind === "pengumuman" && N.frame && N.frame.pengumuman) {
        H.toast(N.frame.pengumuman.teks, { icon: "megaphone", ms: 8000 });
        if (navigator.vibrate && H.state.vib) navigator.vibrate([60, 40, 60]);
        continue;
      }
      /* rivalry: being overtaken is news too, not only overtaking */
      if (ev.kind === "salip" && mine !== null && ev.lawan === mine) {
        H.toast(L(`${H.gname(ev.grup)} menyalip kalian. Kejar!`, `${H.gname(ev.grup)} just overtook you. Catch up!`), { tone: "warn", icon: "arrows-left-right" });
        continue;
      }
      const own = mine !== null && ev.grup === mine;
      const forAsisten = asisten && (ev.kind === "klaim" || ev.kind === "panggil");
      if (!own && !forAsisten && ev.kind !== "ditemukan") continue;
      if (own && ev.kind === "bergabung") continue;
      const t = H.eventText(ev);
      if (!t) continue;
      const tone = ev.kind === "tolak" ? "warn" : ev.kind === "ditemukan" || ev.kind === "zona" ? "ok" : undefined;
      H.toast(t, { tone, icon: ev.kind === "ditemukan" ? "flag-checkered" : ev.kind === "klaim" ? "camera" : ev.kind === "panggil" ? "hand-waving" : undefined });
    }
  });

  const Screen = () => {
    const st = H.useStore();
    const N = H.useNet();
    const [down, setDown] = useState(false);
    /* a dropped socket only takes over the screen after 4 seconds, so a
       Wi-Fi blip never flashes an error */
    useEffect(() => {
      if (N.status === "live" || N.status === "connecting") {
        setDown(false);
        return;
      }
      const t = setTimeout(() => setDown(true), 4000);
      return () => clearTimeout(t);
    }, [N.status]);
    if (STAGE) return html`<${H.Stage} />`;
    if (N.locked) return html`<${H.States} kind="token" />`;
    if (down && N.status !== "live") return html`<${H.States} kind=${N.closeCode === 1001 ? "restart" : "offline"} />`;
    if (!N.frame) return html`<${H.HuntApp} tab="hunt" bare><div class="hpage__in hpage__in--narrow"><section class="card card--raised hjoin"><${H.StateView} icon="broadcast" title=${L("Menyambung ke Pi", "Connecting to the Pi")} body=${L("Pastikan ponselmu tersambung ke Wi-Fi IRIS-IOT.", "Make sure your phone is on the IRIS-IOT Wi-Fi.")} /></section></div></${H.HuntApp}>`;
    if (N.rolled && N.grup === null) return html`<${H.States} kind="rolled" />`;
    const route = st.route;
    const asisten = N.role === "asisten";
    if (route === "mission") return html`<${H.Mission} />`;
    const f = N.frame;
    const ended = f.penghargaan && f.penghargaan.beku && endedSeen !== f.ronde;
    if (ended && route !== "results" && (N.grup !== null || asisten)) return html`<${H.States} kind="ended" />`;
    if (N.grup === null && !asisten) return html`<${H.Join} />`;
    if (N.grup !== null && !N.peranTim && route === "hunt") return html`<${H.Join} />`;
    if (route === "team") return html`<${H.Team} />`;
    if (route === "layers") return html`<${H.Layers} />`;
    if (route === "results") return html`<${H.Results} />`;
    return html`<${H.Hunt} />`;
  };

  const App = () => {
    const st = H.useStore();
    useEffect(() => {
      document.documentElement.lang = st.lang === "zh" ? "zh-Hans" : st.lang;
      document.title = H.title(L("Perburuan LoRa", "LoRa Hunt")) + " · IRIS";
    }, [st.lang]);
    return html`<div class=${"huntapp" + (st.reduce ? " reduce" : "")} data-t=${st.sun ? "light" : st.theme} data-f="jakarta" data-zhw=${st.zhW} lang=${st.lang === "zh" ? "zh-Hans" : st.lang} data-stage=${STAGE ? "yes" : "no"}>
      <div class="huntapp__scroll"><${Screen} /></div>
      <div class="huntapp__layers"></div>
      <${H.Toasts} />
      <${H.TipLayer} />
    </div>`;
  };

  const boot = () => {
    const root = document.getElementById("app");
    root.textContent = "";
    render(html`<${App} />`, root);
    H.startNet();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
