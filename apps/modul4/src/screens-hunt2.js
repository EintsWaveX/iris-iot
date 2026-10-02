/* Perburuan LoRa IRIS, part 2: Layers (the link and the send time paired
   by packet number), Results (podium, awards, replay), the Asisten mission
   control, the projector and the error states. Ported from the Phase 9
   mockup (screens-hunt2.js) onto the real frame and /jejak.json. */
(function () {
  const { html, useState, useEffect, useRef } = window.htmPreact;
  const H = window.H;
  const { L, Icon, Btn, IconBtn, Badge, Stepper } = H;

  /* one line per event, for toasts, the ticker and the moments list */
  H.eventText = (ev) => {
    const g = ev.grup != null ? H.gname(ev.grup) : "";
    switch (ev.kind) {
      case "bergabung": return L(`${g} mulai mengirim data`, `${g} started sending data`);
      case "zona": return L(`${g} masuk zona ${H.heatLabel(ev.heat)}`, `${g} reached ${H.heatLabel(ev.heat)}`);
      case "klaim": return L(`${g} mengirim klaim`, `${g} sent a claim`);
      case "tolak": return L(`Klaim ${g} ditolak`, `${g}'s claim was turned down`);
      case "ditemukan": return L(`${g} menemukan beaconnya · ${H.ms(ev.durasi)}`, `${g} found its beacon · ${H.ms(ev.durasi)}`);
      case "salip": return L(`${g} menyalip ${H.gname(ev.lawan)}`, `${g} overtook ${H.gname(ev.lawan)}`);
      case "panggil": return L(`${g} memanggil asisten`, `${g} called an assistant`);
      case "sapuan": return L(`${g} menyapu 8 arah`, `${g} swept 8 facings`);
      case "kembali": return L(`Sinyal ${g} kembali`, `${g}'s signal is back`);
      case "pengumuman": return L("Pengumuman dari asisten", "An announcement from the assistants");
      case "kalibrasi": return L(`Kalibrasi 1 m dari ${g}`, `1 m calibration from ${g}`);
      case "reset": return L("Ronde baru dimulai", "A new round started");
      case "mulai": return L("Perburuan dimulai", "The hunt started");
      case "arena": return L(`Arena diubah ke ${ev.arena_m} m`, `Arena set to ${ev.arena_m} m`);
      default: return null;
    }
  };
  const EVICON = { ditemukan: "flag-checkered", salip: "arrows-left-right", klaim: "camera", tolak: "x-circle", panggil: "hand-waving", zona: "fire", sapuan: "compass", pengumuman: "megaphone" };

  /* ------------------------------------------------ Layers */
  H.Layers = () => {
    const N = H.useNet();
    const member = N.grup !== null;
    const g = H.viewGroup();
    const row = H.row(g);
    const f = N.frame;
    const model = (f && f.model) || {};
    const radio = (f && f.radio) || {};
    const jit = H.jitter(g);
    const rows = H.packets(g);
    const csv = () => {
      const lines = ["seq,waktu_kirim_beacon,waktu_terima_pi,delay_ms,rssi,snr"];
      H.packets(g).slice().reverse().forEach((r) => lines.push(r.lost ? `${r.seq},,,,,` : `${r.seq},${r.tx || ""},${r.rx || ""},${r.delay == null ? "" : r.delay},${r.rssi == null ? "" : r.rssi},${r.snr == null ? "" : r.snr}`));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
      a.download = `paket-kelompok-${g}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    return html`<${H.HuntApp} tab="layers">
      <div class="hpage__in">
        <div class="pagehead"><span class="eyebrow">${H.gfull(g)} · ${L("tautan beacon ke hunter", "beacon to hunter link")}</span><h1 class="h-title">${H.T("Lapisan", "Layers")}</h1>
          <p class="lede">${L("Yang terjadi di bawah perburuan: radio LoRa, waktu, dan paket yang hilang. Angka ini juga masuk jurnal Modul 4.", "What happens under the hunt: the LoRa radio, timing and lost packets. These numbers also go into the Module 4 journal.")}</p>
          ${!member && html`<${H.GroupPick} g=${g} />`}</div>
        ${!row
          ? html`<section class="card"><${H.StateView} icon="broadcast" title=${L("Belum ada paket", "No packets yet")} body=${L("Pi belum menerima paket dari hunter kelompok ini.", "The Pi hasn't had a packet from this group's hunter yet.")} /></section>`
          : html`<div class="dcards dcards--6 hlayers">
              <${H.DataCard} label=${L("RSSI halus", "Smoothed RSSI")} value=${H.fmt(row.halus, 0)} unit="dBm" sub=${L("median 5, lalu EWMA 0,25", "median of 5, then EWMA 0.25")} series=${H.series(g, "halus")} />
              <${H.DataCard} label="SNR" value=${H.fmt(row.snr, 1)} unit="dB" dp=${1} series=${H.series(g, "snr")} />
              <${H.DataCard} label=${L("Perkiraan jarak", "Estimated distance")} value=${row.jarak_m == null ? "·" : H.fmt(row.jarak_m, 1)} unit="m" dp=${1} sub=${L(`n = ${H.fmt(model.n, 1)}`, `n = ${H.fmt(model.n, 1)}`)} series=${H.series(g, "jarak")} />
              <${H.DataCard} label=${L("Delay", "Delay")} value=${H.fmt(row.delay_ms)} unit="ms" tone="var(--accent)" sub=${L("terima di Pi dikurangi kirim di beacon", "Pi receive time minus beacon send time")} series=${H.series(g, "delay")} />
              <${H.DataCard} label="Jitter" value=${jit == null ? "·" : H.fmt(jit, 1)} unit="ms" dp=${1} tone="var(--accent)" sub=${L("selisih delay antarpaket", "delay change between packets")} series=${H.series(g, "delay")} />
              <${H.DataCard} label=${L("Paket hilang", "Lost packets")} value=${H.fmt(row.rugi_persen, 1)} unit="%" dp=${1} tone="var(--danger)" sub=${L(`${H.fmt(row.hilang)} dari ${H.fmt(row.hilang + row.diterima)}`, `${H.fmt(row.hilang)} of ${H.fmt(row.hilang + row.diterima)}`)} series=${H.series(g, "lost")} />
            </div>
            <section class="card">
              <div class="card__head"><h2 class="card__title">${H.T("Paket terakhir", "Latest packets")}</h2><${Badge} tone="ok"><${Icon} n="link" sm />${L("dipasangkan lewat nomor paket", "paired by packet number")}</${Badge}></div>
              <p class="card__sub">${L("Beacon menaruh waktu kirimnya di payload LoRa (kelompok, nomor paket, waktu kirim). Hunter meneruskannya ke Pi, jadi Waktu Kirim di sini dipasangkan dengan baris serial hunter lewat nomor paket. Sketsa tidak perlu diubah.", "The beacon puts its send time in the LoRa payload (group, packet number, send time). The hunter forwards it to the Pi, so Send Time here is paired with the hunter's serial line by packet number. No sketch change.")}</p>
              <div class="scrollx"><table class="table table--tight"><thead><tr><th>#</th><th>${L("Waktu kirim (beacon)", "Send time (beacon)")}</th><th>${L("Waktu terima (Pi)", "Receive time (Pi)")}</th><th class="num">${L("Delay", "Delay")}</th><th class="num">RSSI</th><th class="num">SNR</th></tr></thead>
                <tbody>${rows.map((r) => html`<tr><td class="mono">${r.seq}</td><td class="mono">${r.lost ? "·" : r.tx || "·"}</td><td class="mono hint">${r.lost ? "·" : r.rx || "·"}</td><td class="num">${r.lost ? html`<span style="color:var(--danger)">${L("hilang", "lost")}</span>` : r.delay == null ? "·" : r.delay + " ms"}</td><td class="num">${r.lost || r.rssi == null ? "·" : r.rssi}</td><td class="num">${r.lost || r.snr == null ? "·" : H.fmt(r.snr, 1)}</td></tr>`)}</tbody></table></div>
              <div class="r5act"><${Btn} sm icon="download-simple" onClick=${csv}>${L("Unduh CSV", "Download CSV")}</${Btn}></div>
            </section>`}
        <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Pengaturan radio", "Radio settings")}</h2></div>
          <div class="kv">${[
            [L("Frekuensi", "Frequency"), radio.freq || "920.0 MHz"],
            ["SF / BW", `SF${radio.sf || 7} · ${radio.bw || "250 kHz"}`],
            [L("Daya", "Power"), radio.daya || "10 dBm"],
            H.sync(g) ? ["Sync word", H.sync(g)] : null,
            [L("Jadwal kirim", "Send schedule"), L("TDMA 500 ms, slot 100 ms per kelompok", "TDMA 500 ms, a 100 ms slot per group")],
            [L("Model jarak", "Distance model"), L(`RSSI 1 m ${H.fmt(model.rssi_1m, 0)} dBm, n ${H.fmt(model.n, 1)}, batas 2000 m`, `RSSI at 1 m ${H.fmt(model.rssi_1m, 0)} dBm, n ${H.fmt(model.n, 1)}, capped at 2000 m`)],
          ].filter(Boolean).map(([a, b]) => html`<span class="label">${a}</span><span class="mono">${b}</span>`)}</div></section>
      </div>
    </${H.HuntApp}>`;
  };

  /* ------------------------------------------------ Results */
  const Replay = ({ jejak }) => {
    const ids = Object.keys(jejak.grup || {}).map(Number).sort((a, b) => a - b);
    const end = Math.max(1, jejak.berjalan || 1);
    const [t, setT] = useState(end);
    const [play, setPlay] = useState(false);
    const [show, setShow] = useState({});
    useEffect(() => {
      if (!play) setT(end);
    }, [end]);
    const stepT = Math.max(1, Math.round(end / 60));
    H.useInterval(() => {
      if (!play) return;
      if (t >= end) setPlay(false);
      else setT(Math.min(end, t + stepT));
    }, play ? (H.state.reduce ? 60 : 250) : null);
    const bar = useRef(null);
    const pick = (e) => {
      const r = bar.current.getBoundingClientRect();
      setT(Math.max(0, Math.min(end, Math.round(((e.clientX - r.left) / r.width) * end))));
    };
    const X = (s) => 30 + (s / end) * 560;
    const Y = (v) => 210 - v * 190;
    const marks = (jejak.peristiwa || []).filter((e) => e.kind === "salip" || e.kind === "ditemukan");
    const at = (pts, s) => {
      let v = 0;
      for (const p of pts) if (p[0] <= s) v = p[2];
      return v;
    };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(k * end));
    return html`<div class="stack">
      <div class="row" style="gap:6px">${ids.map((n) => html`<button type="button" class="chipbtn gchip" style=${`--g:var(--group-${n})`} aria-pressed=${String(show[n] !== false)} onClick=${() => setShow({ ...show, [n]: show[n] === false })}><i></i>${H.gname(n)}</button>`)}</div>
      <svg class="replay" viewBox="0 0 620 230" role="img" aria-label=${L("Jarak tertutup tiap kelompok sepanjang waktu", "Distance closed per group over time")}>
        ${[0, 0.25, 0.5, 0.75, 1].map((v) => html`<line x1="30" x2="590" y1=${Y(v)} y2=${Y(v)} class="chart__grid" /><text x="24" y=${Y(v) + 4} class="chart__tick" text-anchor="end">${Math.round(v * 100)}%</text>`)}
        ${ticks.map((s) => html`<text x=${X(s)} y="226" class="chart__tick" text-anchor="middle">${H.ms(s)}</text>`)}
        ${ids.filter((n) => show[n] !== false).map((n) => {
          const pts = jejak.grup[String(n)].s.filter((p) => p[0] <= t);
          if (!pts.length) return null;
          return html`<polyline class="replay__line" style=${`--g:var(--group-${n})`} points=${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join(" ")} /><circle cx=${X(Math.min(t, pts[pts.length - 1][0]))} cy=${Y(at(pts, t))} r="5" class="replay__dot" style=${`--g:var(--group-${n})`} />`;
        })}
        <line x1=${X(t)} x2=${X(t)} y1="18" y2="210" class="replay__now" />
      </svg>
      <div class="scrub" ref=${bar} role="slider" tabindex="0" aria-valuemin="0" aria-valuemax=${end} aria-valuenow=${t} aria-valuetext=${H.ms(t)} aria-label=${L("Waktu putar ulang", "Replay time")}
        onPointerDown=${(e) => { setPlay(false); pick(e); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ } }}
        onPointerMove=${(e) => e.buttons && pick(e)}
        onKeyDown=${(e) => { if (e.key === "ArrowRight") setT(Math.min(end, t + stepT)); if (e.key === "ArrowLeft") setT(Math.max(0, t - stepT)); }}>
        <span class="scrub__fill" style=${`width:${(t / end) * 100}%`}></span><span class="scrub__knob" style=${`left:${(t / end) * 100}%`}></span>
        ${marks.map((m) => html`<span class="scrub__mark" data-k=${m.kind === "salip" ? "salip" : "menang"} style=${`left:${(m.t / end) * 100}%`}></span>`)}</div>
      <div class="row row--between"><span class="mono">${H.ms(t)}</span><span class="row" style="gap:6px"><${IconBtn} sm icon="rewind" label=${L("Ke awal", "To the start")} disabled=${t === 0 && !play} onClick=${() => { setPlay(false); setT(0); }} /><${IconBtn} sm icon=${play ? "pause" : "play"} label=${play ? L("Jeda", "Pause") : L("Putar", "Play")} pressed=${play} onClick=${() => { if (!play && t >= end) setT(0); setPlay(!play); }} /></span></div>
    </div>`;
  };
  const Podium = ({ podium, stage }) => {
    const order = [podium[1], podium[0], podium[2]].filter(Boolean);
    return html`<div class=${"hpodium" + (stage ? " hpodium--stage" : "")}>${order.map((p) => html`<div class="hpod" data-r=${p.posisi} style=${`--g:var(--group-${p.grup})`}>
      <div class="hpod__photo">${p.foto_url ? html`<img src=${p.foto_url} alt=${L(`Foto klaim ${H.gname(p.grup)}`, `${H.gname(p.grup)}'s claim photo`)} />` : html`<${Icon} n="camera" />`}</div><b>${H.gname(p.grup)}</b><span class="mono">${H.ms(p.durasi)}</span><div class="hpod__step"><span class="num">${p.posisi}</span></div></div>`)}</div>`;
  };
  H.Podium = Podium;
  H.Results = () => {
    const N = H.useNet();
    const [jejak, setJejak] = useState(null);
    const load = () => {
      const run = (N.frame && N.frame.berjalan) || 0;
      H.fetchJejak(Math.max(1, Math.ceil(run / 240))).then((d) => d && setJejak(d));
    };
    useEffect(load, []);
    H.useInterval(load, 15000);
    const aw = (N.frame && N.frame.penghargaan) || { podium: [] };
    const AW = [
      { k: "pendekat_tercepat", i: "lightning", l: ["Pendekat Tercepat", "Fastest Closer"], v: (a) => L(`${H.fmt(a.nilai, 1)} dB per detik`, `${H.fmt(a.nilai, 1)} dB per second`) },
      { k: "tautan_tercepat", i: "timer", l: ["Tautan Tercepat", "Fastest Link"], v: (a) => L(`delay terbaik ${H.fmt(a.nilai)} ms`, `best delay ${H.fmt(a.nilai)} ms`) },
      { k: "tautan_terandal", i: "shield-check", l: ["Tautan Terandal", "Most Reliable Link"], v: (a) => L(`${H.fmt(a.nilai, 1)}% hilang`, `${H.fmt(a.nilai, 1)}% lost`) },
    ];
    const moments = jejak ? (jejak.peristiwa || []).filter((e) => e.kind === "salip" || e.kind === "ditemukan").slice(-8).reverse() : [];
    const d = new Date();
    return html`<${H.HuntApp} tab="results">
      <div class="hpage__in">
        <div class="pagehead"><span class="eyebrow">${H.tgl(d)}${N.frame && N.frame.sesi ? L(` · Sesi ${N.frame.sesi}`, ` · Session ${N.frame.sesi}`) : ""}</span><h1 class="h-title">${H.T("Hasil perburuan", "Hunt results")}</h1></div>
        <section class="card">${aw.podium.length ? html`<${Podium} podium=${aw.podium} />` : html`<p class="hint" style="text-align:center">${L("Podium terisi begitu asisten mengonfirmasi beacon pertama.", "The podium fills once an assistant confirms the first beacon.")}</p>`}</section>
        <div class="hgrid hgrid--3">${AW.map((a) => {
          const v = aw[a.k];
          return html`<section class="card haward" style=${v ? `--g:var(--group-${v.grup})` : ""}><span class="haward__ic"><${Icon} n=${a.i} lg /></span><b class="h3">${L(...a.l)}</b><span>${v ? H.gname(v.grup) : L("Belum ada", "Nobody yet")}</span><span class="hint">${v ? a.v(v) : L("butuh 200 paket", "needs 200 packets")}</span></section>`;
        })}</div>
        <span class="hint">${L("Penghargaan selain podium butuh paling sedikit 200 paket.", "Awards other than the podium need at least 200 packets.")}</span>
        <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Putar ulang", "Replay")}</h2><a class="btn btn--sm" href="jejak.csv" download><${Icon} n="download-simple" />${H.title(L("Unduh jejak CSV", "Download the track CSV"))}</a></div>
          ${jejak && Object.keys(jejak.grup || {}).length ? html`<${Replay} jejak=${jejak} />` : html`<p class="hint">${L("Jejak muncul setelah perburuan berjalan beberapa detik.", "The track appears once the hunt has run for a few seconds.")}</p>`}
          ${moments.length > 0 && html`<div class="tabstops tabstops--3">${moments.map((e) => html`<div class="tabstops__row"><span class="mono hint">${H.ms(e.t)}</span><span class="row" style="gap:8px;flex-wrap:nowrap"><${Icon} n=${EVICON[e.kind]} sm />${H.eventText(e)}</span><span></span></div>`)}</div>`}
          <span class="hint">${L("Jejak CSV tidak memuat NIM.", "The track CSV holds no NIM.")}</span></section>
      </div>
    </${H.HuntApp}>`;
  };

  /* ------------------------------------------------ mission control */
  const REASONS = () => [L("Bukan beacon kelompok ini", "Not this group's beacon"), L("Foto buram", "Blurry photo"), L("Beacon dipindah", "The beacon was moved"), L("Lainnya", "Something else")];
  const TokenGate = () => {
    const N = H.useNet();
    const [code, setCode] = useState("");
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const input = useRef(null);
    /* tokens the Pi makes are 6 letters from an unambiguous alphabet, but
       --token accepts any letters and digits, so the box does too */
    const ALPHA = /[^A-Z0-9]/g;
    const open = async (e) => {
      if (e) e.preventDefault();
      if (code.length < 4 || busy) return;
      setBusy(true);
      const r = await H.tryToken(code);
      setBusy(false);
      if (!r.ok) {
        setErr(r.alasan === "token salah" ? r.left : -1);
        setCode("");
      }
    };
    return html`<${H.HuntApp} tab="mission" bare><div class="hpage__in hpage__in--narrow"><form class="card card--raised hjoin" onSubmit=${open}>
      <span class="eyebrow">${L("Ruang kendali asisten", "Assistant mission control")}</span><h1 class="h-title">${H.T("Masukkan token", "Enter the token")}</h1>
      <p class="lede">${L("Token 6 huruf ada di Konsol, bagian Server, saat Modul 4 berjalan.", "The 6-letter token is in the Console, Server section, while Module 4 runs.")}</p>
      <label class="tokbox" onClick=${() => input.current && input.current.focus()}>
        ${Array.from({ length: Math.max(6, code.length) }, (_, i) => i).map((i) => html`<span class=${"tokbox__c" + (i === code.length ? " is-cur" : "")}>${code[i] || ""}</span>`)}
        <input ref=${input} class="sr" aria-label=${L("Token asisten", "Assistant token")} autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase().replace(ALPHA, "").slice(0, 12))} autofocus />
      </label>
      ${err != null && html`<span class="error"><${Icon} n="warning" sm />${err >= 0 ? L(`Token salah. Sisa ${err} kali coba sebelum sambungan ditutup.`, `Wrong token. ${err} tries left before the connection closes.`) : L("Tidak tersambung ke Pi. Coba lagi.", "Not connected to the Pi. Try again.")}</span>`}
      <${Btn} type="submit" kind="primary" lg block icon="lock-key" disabled=${code.length < 4 || busy}>${L("Buka", "Open")}</${Btn}>
      <span class="hint">${L("Tab Asisten tidak tampil di ponsel praktikan sampai token benar.", "The Assistant tab doesn't show on student phones until the token is right.")}</span>
      ${N.grup === null && html`<button type="button" class="hjoin__asisten" onClick=${() => H.go("hunt")}><${Icon} n="arrow-left" sm />${L("Kembali ke masuk NIM", "Back to the NIM sign-in")}</button>`}
    </form></div></${H.HuntApp}>`;
  };
  const act = async (aksi, extra, ok) => {
    const r = await H.asisten(aksi, extra);
    if (r.ok) {
      if (ok) H.toast(ok, { tone: "ok" });
    } else H.toast(L(`Gagal: ${r.alasan || "coba lagi"}.`, `That failed: ${r.alasan || "try again"}.`), { tone: "warn" });
    return r;
  };
  const Confirm = ({ title, body, okLabel, danger, onOk, onClose }) =>
    html`<${H.Dialog} sm title=${title} onClose=${onClose}
      foot=${(c) => html`<${Btn} kind="ghost" onClick=${c}>${L("Batal", "Cancel")}</${Btn}><${Btn} kind=${danger ? "danger" : "primary"} onClick=${() => { c(); onOk(); }}>${okLabel}</${Btn}>`}><p>${body}</p></${H.Dialog}>`;
  const GroupMenu = ({ g, onClose }) => {
    const N = H.useNet();
    const row = H.row(g);
    const [ask, setAsk] = useState(null);
    const calling = N.frame && N.frame.panggil && N.frame.panggil[String(g)] != null;
    return html`<${H.Dialog} sm title=${H.gfull(g)} desc=${row ? `${H.heatLabel(H.heatOf(row))} · ${H.closedOf(row)}%` : L("Belum mengirim data", "Not sending data yet")} onClose=${onClose}
      foot=${(c) => html`<${Btn} kind="primary" onClick=${c}>${L("Selesai", "Done")}</${Btn}>`}>${(c) => html`<div class="stack">
      <${Btn} block icon="eye" onClick=${() => { H.setViewGroup(g); c(); H.go("hunt"); }}>${L("Lihat di Layar Buru", "View on the Hunt Screen")}</${Btn}>
      ${calling && html`<${Btn} block icon="check" onClick=${() => act("panggil_selesai", { grup: g }, L("Panggilan ditutup.", "Call closed."))}>${L("Tutup Panggilan", "Close the Call")}</${Btn}>`}
      <${Btn} block icon="ruler" disabled=${!row || row.halus == null} onClick=${() => setAsk("kal")}>${L("Kalibrasi 1 m dari Kelompok Ini", "Calibrate 1 m from This Group")}</${Btn}>
      <${Btn} block kind="danger" icon="seal-check" disabled=${!row || row.status === "menang"} onClick=${() => setAsk("paksa")}>${L("Paksa Konfirmasi", "Force Confirm")}</${Btn}>
      <span class="hint">${L("Paksa Konfirmasi untuk beacon yang terbukti ketemu tapi sinyalnya jatuh atau kameranya tidak bisa dipakai.", "Force Confirm is for a beacon that was clearly found but whose signal dropped or whose camera failed.")}</span>
      ${ask === "kal" && html`<${Confirm} title=${L("Kalibrasi 1 m", "1 m calibration")} body=${L("Pegang hunter kelompok ini tepat 1 m dari beaconnya, diam 5 detik, lalu tekan Ukur. Seluruh perkiraan jarak ikut bergeser.", "Hold this group's hunter exactly 1 m from its beacon, still for 5 seconds, then press Measure. Every distance estimate shifts with it.")} okLabel=${L("Ukur", "Measure")} onOk=${() => act("kalibrasi", { grup: g }, L("Kalibrasi tersimpan.", "Calibration saved."))} onClose=${() => setAsk(null)} />`}
      ${ask === "paksa" && html`<${Confirm} danger title=${L("Paksa konfirmasi", "Force confirm")} body=${L(`${H.gname(g)} dicatat menemukan beaconnya sekarang, tanpa klaim. Tidak bisa dibatalkan.`, `${H.gname(g)} is recorded as finding its beacon now, without a claim. This can't be undone.`)} okLabel=${L("Paksa Konfirmasi", "Force Confirm")} onOk=${() => act("konfirmasi", { grup: g, paksa: true }, L(`${H.gname(g)} menang.`, `${H.gname(g)} wins.`))} onClose=${() => setAsk(null)} />`}
    </div>`}</${H.Dialog}>`;
  };
  const Mission = () => {
    const N = H.useNet();
    const f = N.frame || {};
    const [rej, setRej] = useState(null);
    const [why, setWhy] = useState(0);
    const [other, setOther] = useState("");
    const [menu, setMenu] = useState(null);
    const [ann, setAnn] = useState("");
    const [ask, setAsk] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [arena, setArena] = useState(null);
    const arenaNow = f.model ? f.model.arena_m : 300;
    const arenaTimer = useRef(null);
    const ids = H.groups();
    const rows = f.grup || [];
    const queue = f.antrian || [];
    const changeArena = (v) => {
      setArena(v);
      clearTimeout(arenaTimer.current);
      arenaTimer.current = setTimeout(() => act("arena", { arena_m: v }, L(`Arena ${v} m.`, `Arena ${v} m.`)).then(() => setArena(null)), 700);
    };
    const totalIn = ids.reduce((a, g) => a + H.members(g).filter((m) => m.hadir).length, 0);
    const total = ids.reduce((a, g) => a + H.members(g).length, 0);
    const packets = rows.reduce((a, r) => a + (r.diterima || 0), 0);
    const reasons = REASONS();
    const reason = why === reasons.length - 1 ? other.trim() || reasons[why] : reasons[why];
    const pings = N.pings.slice(-6).reverse();
    return html`<${H.HuntApp} tab="mission">
      <div class="hpage__in">
        <div class="pagehead pagehead__row pagehead__row--center"><div class="stack stack--sm"><span class="eyebrow">${L("Ruang kendali", "Mission control")} · ${H.tgl(new Date())}${f.sesi ? L(` · Sesi ${f.sesi}`, ` · Session ${f.sesi}`) : ""}</span><h1 class="h-title">${f.sesi ? H.T("Perburuan berjalan", "Hunt running") : H.T("Belum ada sesi", "No session running")}</h1></div>
          ${f.sesi_sisa != null && html`<span class="strip strip--compact" role="timer"><span class="strip__i strip__left" data-low=${f.sesi_sisa < 1800 ? "yes" : "no"}><small>${L("Sisa", "Left")}</small><b class="mono">${H.hms(f.sesi_sisa)}</b></span></span>`}</div>
        <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Jalur kelompok", "Group lanes")}</h2><span class="hint">${L("dibandingkan lewat jarak tertutup", "compared by distance closed")}</span></div>
          ${ids.length ? html`<div class="lanes">${ids.map((g) => {
            const r = H.row(g);
            const calling = f.panggil && f.panggil[String(g)] != null;
            return html`<div class="lane2" style=${`--g:var(--group-${g})`}>
              <span class="lane2__n"><i></i><b>${H.gname(g)}</b></span>
              <span class="lane2__bar"><i style=${`width:${H.closedOf(r)}%`}></i></span>
              <span class="num">${r && r.status === "menang" ? H.ms(r.durasi) : H.closedOf(r) + "%"}</span>
              <${H.HeatChip} k=${H.heatOf(r)} />
              <span class="row" style="gap:4px;flex-wrap:nowrap">${calling ? html`<${Badge} tone="warn"><${Icon} n="hand-waving" sm />${L("memanggil", "calling")}</${Badge}>` : r && r.status === "menunggu" ? html`<${Badge} tone="warn"><${Icon} n="camera" sm />${L("klaim", "claim")}</${Badge}>` : null}<${IconBtn} sm icon="dots-three" label=${L(`Menu ${H.gname(g)}`, `${H.gname(g)} menu`)} onClick=${() => setMenu(g)} /></span></div>`;
          })}</div>` : html`<p class="hint">${L("Belum ada kelompok. Daftar sesi datang dari situs web lewat agent Pi.", "No groups yet. The session list comes from the website through the Pi agent.")}</p>`}</section>
        <div class="hgrid hgrid--2">
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Antrean klaim", "Claim queue")}</h2>${queue.length > 0 && html`<${Badge} tone="warn">${queue.length}</${Badge}>`}</div>
            ${queue.length ? queue.map((q) => html`<div class="claimq" style=${`--g:var(--group-${q.grup})`}>
              <button type="button" class="hphoto hphoto--sm" onClick=${() => q.foto_url && setPhoto(q)} aria-label=${L("Perbesar foto", "Enlarge the photo")} data-tip=${q.foto_url ? L("Perbesar foto", "Enlarge the photo") : undefined}>${q.foto_url ? html`<img src=${q.foto_url} alt="" />` : html`<${Icon} n="camera-slash" />`}</button>
              <div class="stack stack--sm grow"><b>${H.gfull(q.grup)}</b><span class="hint">${L(`${q.jarak_m == null ? "·" : H.fmt(q.jarak_m, 1)} m saat klaim · ${q.sejak} detik lalu · klaim ke-${q.klaim_ke}`, `${q.jarak_m == null ? "·" : H.fmt(q.jarak_m, 1)} m at the claim · ${q.sejak} seconds ago · claim ${q.klaim_ke}`)}</span>
                <div class="r5act"><${Btn} sm icon="x" onClick=${() => { setRej(q.grup); setWhy(0); setOther(""); }}>${L("Tolak", "Turn Down")}</${Btn}><${Btn} sm kind="primary" icon="check" onClick=${() => act("konfirmasi", { grup: q.grup }, L(`${H.gname(q.grup)} menang.`, `${H.gname(q.grup)} wins.`))}>${L("Konfirmasi", "Confirm")}</${Btn}></div></div></div>`)
              : html`<p class="hint">${L("Belum ada klaim yang menunggu.", "No claims waiting.")}</p>`}
            <span class="hint">${L("Paksa Konfirmasi ada di menu kelompok, untuk beacon yang terbukti ketemu tapi sinyalnya jatuh.", "Force Confirm is in the group menu, for a beacon that was clearly found but whose signal dropped.")}</span></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Pengumuman dan hitung mundur", "Announcements and countdown")}</h2></div>
            <label class="field"><span class="label">${L("Pengumuman ke semua ponsel", "Announcement to every phone")}</span><input class="input" id="m-ann" maxlength="140" value=${ann} onInput=${(e) => setAnn(e.target.value)} placeholder=${L("contoh: 10 menit lagi, kumpul di lobi", "e.g. 10 minutes left, meet at the lobby")} /></label>
            ${f.pengumuman && html`<span class="hint">${L(`Tampil sekarang: ${f.pengumuman.teks}`, `Showing now: ${f.pengumuman.teks}`)}</span>`}
            <div class="r5act r5act--alt">
              ${f.pengumuman ? html`<${Btn} kind="ghost" icon="x" onClick=${() => act("pengumuman", { teks: "" }, L("Pengumuman dihapus.", "Announcement cleared."))}>${L("Hapus Pengumuman", "Clear It")}</${Btn}>` : html`<span></span>`}
              <${Btn} icon="timer" onClick=${() => act("aba_aba", {}, L("Hitung mundur tampil di proyektor.", "The countdown is on the projector."))}>${L("Hitung Mundur 10 Detik", "10-Second Countdown")}</${Btn}>
              <${Btn} kind="primary" icon="megaphone" disabled=${!ann.trim()} onClick=${() => act("pengumuman", { teks: ann.trim() }, L("Pengumuman terkirim.", "Announcement sent.")).then((r) => r.ok && setAnn(""))}>${L("Kirim", "Send")}</${Btn}></div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Kalibrasi dan arena", "Calibration and arena")}</h2></div>
            <div class="kv"><span class="label">${L("RSSI pada 1 m", "RSSI at 1 m")}</span><span class="mono">${f.model ? H.fmt(f.model.rssi_1m, 1) : "·"} dBm</span><span class="label">${L("Eksponen n", "Exponent n")}</span><span class="mono">${f.model ? H.fmt(f.model.n, 1) : "·"}</span></div>
            <span class="hint">${L("Ukur ulang lewat menu kelompok: hunter tepat 1 m dari beaconnya.", "Measure again from a group's menu: its hunter exactly 1 m from its beacon.")}</span>
            <div class="field"><span class="label">${L("Jari-jari arena", "Arena radius")}</span><${Stepper} value=${arena == null ? arenaNow : arena} min=${50} max=${600} step=${50} onChange=${changeArena} fmt=${(v) => v + " m"} label=${L("Jari-jari arena", "Arena radius")} /><span class="hint">${L("Tangga panas ikut ukuran arena. Ruang terbuka di sekitar gedung: 300 m.", "The heat ladder follows the arena size. Open ground around the building: 300 m.")}</span></div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sesi", "Session")}</h2></div>
            <div class="kv"><span class="label">${L("Tanggal", "Date")}</span><span>${H.tgl(new Date())}</span><span class="label">${L("Sesi", "Session")}</span><span>${f.sesi ? f.sesi : L("tidak ada", "none")}</span><span class="label">${L("Praktikan tersambung", "Students connected")}</span><span class="num">${totalIn}/${total}</span><span class="label">${L("Paket diterima", "Packets received")}</span><span class="num">${H.fmt(packets)}</span></div>
            <div class="r5act r5act--alt">
              <a class="btn btn--sm" href="jejak.csv" download><${Icon} n="download-simple" />${H.title(L("Unduh jejak CSV", "Download the track CSV"))}</a>
              <${Btn} sm icon="arrow-counter-clockwise" onClick=${() => setAsk("reset")}>${L("Ronde Baru", "New Round")}</${Btn}>
              ${f.sesi ? html`<${Btn} sm kind="danger" icon="stop" onClick=${() => setAsk("akhiri")}>${L("Akhiri Sesi", "End the Session")}</${Btn}>` : html`<${Btn} sm kind="primary" icon="play" onClick=${() => setAsk("mulai")}>${L("Mulai Sesi", "Start a Session")}</${Btn}>`}</div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sinyal tim", "Team pings")}</h2></div>
            ${pings.length ? html`<div class="tabstops tabstops--3">${pings.map((p) => html`<div class="tabstops__row"><span class="mono hint">${p.at.slice(0, 5)}</span><span><b>${H.gname(p.grup)}</b> · ${p.dari}: ${H.pingText(p.kode).toLowerCase()}</span><span></span></div>`)}</div>` : html`<p class="hint">${L("Belum ada sinyal tim.", "No team pings yet.")}</p>`}</section>
        </div>
        <div class="r5act" style="justify-content:flex-start"><${Btn} kind="ghost" sm icon="lock-key" onClick=${H.dropToken}>${L("Kunci Ruang Kendali", "Lock Mission Control")}</${Btn}><a class="btn btn--sm btn--ghost" href="?stage=1" target="_blank" rel="noopener"><${Icon} n="projector-screen" />${H.title(L("Buka proyektor", "Open the projector"))}</a></div>
      </div>
      ${menu != null && html`<${GroupMenu} g=${menu} onClose=${() => setMenu(null)} />`}
      ${photo && html`<${H.Dialog} lg title=${L(`Foto klaim ${H.gname(photo.grup)}`, `${H.gname(photo.grup)}'s claim photo`)} onClose=${() => setPhoto(null)} foot=${(c) => html`<${Btn} kind="primary" onClick=${c}>${L("Selesai", "Done")}</${Btn}>`}><img class="hphoto__big" src=${photo.foto_url} alt="" /></${H.Dialog}>`}
      ${rej != null && html`<${H.Dialog} sm title=${L(`Tolak klaim ${H.gname(rej)}`, `Turn down ${H.gname(rej)}'s claim`)} onClose=${() => setRej(null)}
        foot=${(c) => html`<${Btn} kind="ghost" onClick=${c}>${L("Batal", "Cancel")}</${Btn}><${Btn} kind="danger" icon="x" onClick=${() => { c(); act("tolak", { grup: rej, alasan: reason }, L("Klaim ditolak. Kelompok melihat alasannya.", "Claim turned down. The group sees the reason.")); }}>${L("Tolak", "Turn Down")}</${Btn}>`}>
        <div class="row" style="gap:8px">${reasons.map((r, i) => html`<button type="button" class="chipbtn" aria-pressed=${String(i === why)} onClick=${() => setWhy(i)}>${r}</button>`)}</div>
        ${why === reasons.length - 1 && html`<label class="field"><span class="label">${L("Alasan", "Reason")}</span><input class="input" maxlength="120" value=${other} onInput=${(e) => setOther(e.target.value)} /></label>`}</${H.Dialog}>`}
      ${ask === "reset" && html`<${Confirm} danger title=${L("Mulai ronde baru", "Start a new round")} body=${L("Semua kemajuan, klaim, foto dan jejak ronde ini dihapus. Daftar sesi dan kalibrasi tetap.", "All progress, claims, photos and the track of this round are cleared. The session list and calibration stay.")} okLabel=${L("Ronde Baru", "New Round")} onOk=${() => act("reset", {}, L("Ronde baru dimulai.", "A new round started."))} onClose=${() => setAsk(null)} />`}
      ${ask === "akhiri" && html`<${Confirm} danger title=${L("Akhiri sesi", "End the session")} body=${L("Ponsel praktikan kembali ke layar masuk dan foto klaim dihapus.", "Student phones go back to the sign-in screen and the claim photos are deleted.")} okLabel=${L("Akhiri Sesi", "End the Session")} onOk=${() => act("sesi_akhiri", {}, L("Sesi diakhiri.", "Session ended."))} onClose=${() => setAsk(null)} />`}
      ${ask === "mulai" && html`<${H.Dialog} sm title=${L("Mulai sesi", "Start a session")} onClose=${() => setAsk(null)} foot=${(c) => html`<${Btn} kind="ghost" onClick=${c}>${L("Batal", "Cancel")}</${Btn}>`}>${(c) => html`<div class="stack">
        <p class="hint">${L("Biasanya sesi mulai sendiri sesuai jam. Pilih sesi untuk memulainya sekarang.", "Sessions normally start on their own at the scheduled time. Pick one to start it now.")}</p>
        ${[["1", "06:30"], ["2", "09:30"], ["3", "12:30"], ["4", "15:30"]].map(([s, t]) => html`<${Btn} block icon="play" onClick=${() => { c(); act("sesi_mulai", { sesi: Number(s) }, L(`Sesi ${s} dimulai.`, `Session ${s} started.`)); }}>${L(`Sesi ${s} · ${t}`, `Session ${s} · ${t}`)}</${Btn}>`)}</div>`}</${H.Dialog}>`}
    </${H.HuntApp}>`;
  };
  H.Mission = () => {
    const N = H.useNet();
    return N.role === "asisten" ? html`<${Mission} />` : html`<${TokenGate} />`;
  };

  /* ------------------------------------------------ the projector */
  H.Stage = () => {
    const N = H.useNet();
    const st = H.useStore();
    const [count, setCount] = useState(null);
    const [ticker, setTicker] = useState([]);
    useEffect(
      () =>
        H.onEvents((evs) => {
          for (const ev of evs) {
            if (ev.kind === "aba-aba") setCount(10);
            const t = H.eventText(ev);
            if (t && ev.kind !== "bergabung" && ev.kind !== "mulai") setTicker((l) => [...l, { t, k: ev.kind, id: Math.random() }].slice(-6));
          }
        }),
      [],
    );
    H.useInterval(() => setCount((c) => (c == null ? null : c <= 0 ? null : c - 1)), count == null ? null : 1000);
    H.useTick(1000);
    const f = N.frame || {};
    const rows = (f.grup || []).slice().sort((a, b) => (b.status === "menang") - (a.status === "menang") || (a.status === "menang" ? (a.durasi || 0) - (b.durasi || 0) : (b.kemajuan || 0) - (a.kemajuan || 0)));
    const finale = f.penghargaan && f.penghargaan.beku && f.penghargaan.podium && f.penghargaan.podium.length;
    const d = new Date();
    /* before anything new happens, the ticker shows the latest moments the
       frame already carries */
    const recent = (f.peristiwa || []).filter((e) => e.kind !== "bergabung" && e.kind !== "mulai").map((e) => ({ t: H.eventText(e), id: e.at + e.kind })).filter((x) => x.t).slice(-6);
    const items = ticker.length ? ticker : recent.length ? recent : [{ t: f.sesi ? L("Perburuan berjalan", "The hunt is running") : L("Menunggu sesi dimulai", "Waiting for a session to start"), id: 0 }];
    let body;
    if (count != null)
      body = html`<div class="hstage__count"><span class="hint">${L("Perburuan dimulai dalam", "The hunt starts in")}</span><b key=${count} class="num">${count > 0 ? count : L("Mulai!", "Go!")}</b></div>`;
    else if (finale)
      body = html`<div class="hstage__finale">${!st.reduce && html`<div class="confetti">${Array.from({ length: 36 }, (_, i) => html`<i style=${`--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.35}s;--g:var(--group-${(i % 5) + 1})`}></i>`)}</div>`}
        <h1 class="h-display">${H.T("Selamat!", "Well done!")}</h1><${H.Podium} podium=${f.penghargaan.podium} stage /></div>`;
    else
      body = html`<div class="hstage__lanes">${rows.length ? rows.map((r, i) => html`<div class="slane" style=${`--g:var(--group-${r.grup})`}>
          <span class="slane__rank num">${i + 1}</span><span class="slane__n"><b>${H.gname(r.grup)}</b><span>${H.kelompok(r.grup)}</span></span>
          <span class="slane__bar"><i style=${`width:${H.closedOf(r)}%`}></i></span>
          <b class="slane__v num">${r.status === "menang" ? H.ms(r.durasi) : H.closedOf(r) + "%"}</b><${H.HeatChip} k=${H.heatOf(r)} lg /></div>`) : html`<p class="lede" style="text-align:center">${L("Belum ada hunter yang mengirim data.", "No hunter is sending data yet.")}</p>`}</div>
        <div class="ticker"><div class="ticker__in">${(st.reduce ? items : items.concat(items)).map((x, i) => html`<span aria-hidden=${i >= items.length ? "true" : undefined}><${Icon} n="sparkle" sm />${x.t}</span>`)}</div></div>`;
    return html`<div class="hstage" data-sun=${st.sun ? "yes" : "no"}>
      <header class="hstage__top"><img src=${H.LOGO} alt="IRIS" /><b>${H.T("Perburuan LoRa", "LoRa Hunt")} · ${H.modul(4)}</b><span class="grow"></span>
        ${f.pengumuman && html`<span class="hstage__ann"><${Icon} n="megaphone" />${f.pengumuman.teks}</span>`}
        <span class="hstage__clock"><span>${H.tgl(d)}</span><b class="mono">${H.hms(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds())}</b></span></header>
      ${body}
    </div>`;
  };

  /* ------------------------------------------------ the error states */
  H.States = ({ kind }) => {
    const N = H.useNet();
    H.useTick(1000);
    const V = {
      offline: ["wifi-slash", L("Tidak tersambung ke IRIS-IOT", "Not connected to IRIS-IOT"), L("Ponselmu keluar dari Wi-Fi hotspot Pi. Biasanya karena terlalu jauh dari gedung, atau ponsel pindah ke data seluler.", "Your phone left the Pi's hotspot Wi-Fi. Usually you're too far from the building, or the phone switched to mobile data."), L("Mencoba lagi sendiri", "Trying again by itself")],
      restart: ["arrows-clockwise", L("Server perburuan dimulai ulang", "The hunt server is restarting"), L("Asisten memulai ulang server. Posisi dan klaim kalian aman.", "An assistant restarted the server. Your progress and claims are safe."), L("Tersambung lagi sendiri", "Reconnects by itself")],
      ended: ["flag-checkered", L("Ronde selesai", "Round over"), L("Semua kelompok sudah menemukan beaconnya, atau asisten menutup ronde.", "Every group found its beacon, or an assistant closed the round."), null],
      rolled: ["calendar-blank", L("Sesi sudah berganti", "The session changed"), L("Sesi ini sudah lewat. Masuk lagi dengan NIM kalau kamu ikut sesi berikutnya.", "This session is over. Sign in again with your NIM if you're in the next one."), null],
      token: ["lock-key", L("Terlalu banyak token salah", "Too many wrong tokens"), L("Sambungan ini ditutup setelah 5 kali salah. Muat ulang halaman untuk mencoba lagi.", "This connection closed after 5 wrong tries. Reload the page to try again."), null],
    }[kind];
    const action =
      kind === "ended" ? html`<${Btn} kind="primary" iconEnd="arrow-right" onClick=${() => { H.dismissEnded(); H.go("results"); }}>${L("Lihat Hasil", "See the Results")}</${Btn}>`
      : kind === "rolled" ? html`<${Btn} kind="primary" onClick=${() => { N.rolled = false; H.go("hunt"); }}>${L("Masuk Lagi", "Sign In Again")}</${Btn}>`
      : kind === "token" ? html`<${Btn} icon="arrow-clockwise" onClick=${() => window.location.reload()}>${L("Muat Ulang", "Reload")}</${Btn}>`
      : html`<${Btn} icon="arrow-clockwise" onClick=${H.retryNow}>${L("Coba Lagi", "Try Again")}</${Btn}>`;
    return html`<${H.HuntApp} tab="hunt" bare><div class="hpage__in hpage__in--narrow"><section class="card card--raised hjoin">
      <${H.StateView} icon=${V[0]} title=${V[1]} body=${V[2]} actions=${action} />
      ${V[3] && html`<span class="hint num" style="text-align:center">${V[3]}</span>`}</section></div></${H.HuntApp}>`;
  };
})();
