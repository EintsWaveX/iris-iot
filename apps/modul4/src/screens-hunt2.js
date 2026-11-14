/* Perburuan LoRa IRIS, part 2: Results (podium, awards, moments), the
   Asisten mission control, the projector and the error states. The radio
   link numbers that used to be their own Layers tab now live in the Details
   drawer on the Buru screen. */
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

  /* ------------------------------------------------ Results */
  const Podium = ({ podium, stage }) => {
    const order = [podium[1], podium[0], podium[2]].filter(Boolean);
    return html`<div class=${"hpodium" + (stage ? " hpodium--stage" : "")}>${order.map((p) => html`<div class="hpod" data-r=${p.posisi} style=${`--g:var(--group-${p.grup})`}>
      <div class="hpod__photo">${p.foto_url ? html`<img src=${p.foto_url} alt=${L(`Foto klaim ${H.gname(p.grup)}`, `${H.gname(p.grup)}'s claim photo`)} />` : html`<${Icon} n="camera" />`}</div><b>${H.gname(p.grup)}</b><span class="mono">${H.ms(p.durasi)}</span><div class="hpod__step"><span class="num">${p.posisi}</span></div></div>`)}</div>`;
  };
  H.Podium = Podium;
  H.Results = () => {
    const N = H.useNet();
    const aw = (N.frame && N.frame.penghargaan) || { podium: [] };
    const AW = [
      { k: "pendekat_tercepat", i: "lightning", l: ["Pendekat Tercepat", "Fastest Closer"], v: (a) => L(`${H.fmt(a.nilai, 1)} dB per detik`, `${H.fmt(a.nilai, 1)} dB per second`) },
      { k: "tautan_tercepat", i: "timer", l: ["Tautan Tercepat", "Fastest Link"], v: (a) => L(`delay terbaik ${H.fmt(a.nilai)} ms`, `best delay ${H.fmt(a.nilai)} ms`) },
      { k: "tautan_terandal", i: "shield-check", l: ["Tautan Terandal", "Most Reliable Link"], v: (a) => L(`${H.fmt(a.nilai, 1)}% hilang`, `${H.fmt(a.nilai, 1)}% lost`) },
    ];
    const moments = ((N.frame && N.frame.peristiwa) || []).filter((e) => e.kind === "salip" || e.kind === "ditemukan").slice(-8).reverse();
    const d = new Date();
    return html`<${H.HuntApp} tab="results">
      <div class="hpage__in">
        <div class="pagehead"><span class="eyebrow">${H.tgl(d)}${N.frame && N.frame.sesi ? L(` · Sesi ${N.frame.sesi}`, ` · Session ${N.frame.sesi}`) : ""}</span><h1 class="h-title">${H.T("Hasil perburuan", "Hunt results")}</h1></div>
        <section class="card">${aw.podium.length ? html`<${Podium} podium=${aw.podium} />` : html`<p class="hint" style="text-align:center">${L("Podium terisi begitu asisten mengonfirmasi beacon pertama.", "The podium fills once an assistant confirms the first beacon.")}</p>`}</section>
        <div class="hgrid hgrid--3">${AW.map((a) => {
          const v = aw[a.k];
          return html`<section class="card haward" style=${v ? `--g:var(--group-${v.grup})` : ""}><span class="haward__ic"><${Icon} n=${a.i} lg /></span><span class="row" style="gap:8px"><b class="h3">${L(...a.l)}</b>${v && !aw.beku && html`<${Badge}>${L("sementara", "provisional")}</${Badge}>`}</span><span>${v ? H.gname(v.grup) : L("Belum ada", "Nobody yet")}</span><span class="hint">${v ? a.v(v) : L("butuh 200 paket", "needs 200 packets")}</span></section>`;
        })}</div>
        <span class="hint">${aw.beku ? L("Tiap penghargaan butuh paling sedikit 200 paket.", "Each award needs at least 200 packets.") : L("Penghargaan bisa berpindah sampai ronde selesai. Tiap penghargaan butuh paling sedikit 200 paket.", "Awards can change hands until the round ends. Each needs at least 200 packets.")}</span>
        <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Momen penting", "Key moments")}</h2><a class="btn btn--sm" href="jejak.csv" download><${Icon} n="download-simple" />${H.title(L("Unduh jejak CSV", "Download the track CSV"))}</a></div>
          ${moments.length > 0 ? html`<div class="tabstops tabstops--3">${moments.map((e) => html`<div class="tabstops__row"><span class="mono hint">${H.ms(e.t)}</span><span class="row" style="gap:8px;flex-wrap:nowrap"><${Icon} n=${EVICON[e.kind]} sm />${H.eventText(e)}</span><span></span></div>`)}</div>` : html`<p class="hint">${L("Momen muncul saat ada yang menyalip atau menemukan beaconnya.", "Moments show up when someone overtakes or finds its beacon.")}</p>`}
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
    /* tokens the PC makes are 6 letters from an unambiguous alphabet, but
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
      ${err != null && html`<span class="error"><${Icon} n="warning" sm />${err >= 0 ? L(`Token salah. Sisa kesempatan sebelum sambungan ditutup: ${err}.`, `Wrong token. Tries left before the connection closes: ${err}.`) : L("Tidak tersambung ke PC. Coba lagi.", "Not connected to the PC. Try again.")}</span>`}
      <${Btn} type="submit" kind="primary" lg block icon="lock-key" disabled=${code.length < 4 || busy}>${L("Buka", "Open")}</${Btn}>
      <span class="hint">${L("Tab Asisten tidak tampil di ponsel praktikan sampai token benar.", "The Assistant tab doesn't show on student phones until the token is right.")}</span>
      <button type="button" class="hjoin__asisten" onClick=${() => H.go("hunt")}><${Icon} n="arrow-left" sm />${N.grup === null ? L("Kembali ke Masuk NIM", "Back to the NIM Sign-In") : L("Kembali ke Perburuan", "Back to the Hunt")}</button>
    </form></div></${H.HuntApp}>`;
  };
  const act = async (aksi, extra, ok) => {
    const r = await H.asisten(aksi, extra);
    if (r.ok) {
      if (ok) H.toast(ok, { tone: "ok" });
    } else H.toast(L(`Gagal. ${H.why(r.alasan)}`, `That failed. ${H.why(r.alasan)}`), { tone: "warn" });
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
      <${Btn} block kind="danger" icon="seal-check" disabled=${!row || row.status === "menang"} onClick=${() => setAsk("paksa")}>${L("Paksa Konfirmasi", "Force Confirm")}</${Btn}>
      <span class="hint">${L("Paksa Konfirmasi untuk beacon yang terbukti ketemu tapi sinyalnya jatuh atau kameranya tidak bisa dipakai.", "Force Confirm is for a beacon that was clearly found but whose signal dropped or whose camera failed.")}</span>
      ${ask === "paksa" && html`<${Confirm} danger title=${L("Paksa konfirmasi", "Force confirm")} body=${L(`${H.gname(g)} dicatat menemukan beaconnya sekarang, tanpa klaim. Tidak bisa dibatalkan.`, `${H.gname(g)} is recorded as finding its beacon now, without a claim. This can't be undone.`)} okLabel=${L("Paksa Konfirmasi", "Force Confirm")} onOk=${() => act("konfirmasi", { grup: g, paksa: true }, L(`${H.gname(g)} menang.`, `${H.gname(g)} wins.`))} onClose=${() => setAsk(null)} />`}
    </div>`}</${H.Dialog}>`;
  };
  /* "Ukur Ulang di 1 M": pick whose hunter is held 1 m from its beacon. */
  const ReleaseNim = ({ onClose }) => {
    const [nim, setNim] = useState("");
    return html`<${H.Dialog} sm title=${L("Lepas NIM", "Release a NIM")} onClose=${onClose}
      foot=${(c) => html`<${Btn} kind="ghost" onClick=${c}>${L("Batal", "Cancel")}</${Btn}><${Btn} kind="primary" icon="sign-out" disabled=${nim.length < 4} onClick=${() => { c(); act("lepas_nim", { nim }, L("NIM dilepas. Ponselnya kembali ke layar masuk.", "NIM released. That phone is back on the sign-in screen.")); }}>${L("Lepas", "Release")}</${Btn}>`}>
      <div class="stack"><p>${L("Pakai ini kalau seseorang tidak bisa masuk karena NIM-nya masih terbuka di ponsel lain, misalnya ponselnya mati atau hilang.", "Use this when someone can't sign in because their NIM is still open on another phone, for example a dead or lost phone.")}</p>
        <label class="field"><span class="label">NIM</span><input class="input mono" aria-label="NIM" inputmode="numeric" autocomplete="off" maxlength="20" value=${nim} onInput=${(e) => setNim(e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase())} /></label></div></${H.Dialog}>`;
  };
  const KalPick = ({ rows, onClose }) => {
    const ready = rows.filter((r) => r.halus != null).map((r) => r.grup);
    const [g, setG] = useState(ready[0] ?? null);
    return html`<${H.Dialog} sm title=${L("Kalibrasi 1 m", "1 m calibration")} onClose=${onClose}
      foot=${(c) => html`<${Btn} kind="ghost" onClick=${c}>${L("Batal", "Cancel")}</${Btn}><${Btn} kind="primary" icon="ruler" disabled=${g == null} onClick=${() => { c(); act("kalibrasi", { grup: g }, L("Kalibrasi tersimpan.", "Calibration saved.")); }}>${L("Ukur", "Measure")}</${Btn}>`}>
      <div class="stack"><p>${L("Taruh hunter 1 m dari beacon, diam 5 detik, lalu tekan Ukur. Seluruh perkiraan jarak ikut bergeser.", "Put the hunter 1 m from the beacon, still for 5 seconds, then press Measure. Every distance estimate shifts with it.")}</p>
        <span class="label">${L("Hunter kelompok", "Group's hunter")}</span>
        <${H.GroupChips} ids=${ready} pressed=${(id) => id === g} onPick=${setG} label=${L("Hunter kelompok", "Group's hunter")} /></div></${H.Dialog}>`;
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
    const d = new Date();
    const jam = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const tot = f.sesi_total ? Math.round(f.sesi_total / 60) : 0;
    const lewat = tot ? Math.max(0, Math.min(tot, Math.round((f.sesi_total - (f.sesi_sisa || 0)) / 60))) : 0;
    return html`<${H.HuntApp} tab="mission">
      <div class="hpage__in">
        <div class="pagehead pagehead__row pagehead__row--center"><div class="stack stack--sm"><span class="eyebrow">${L("Ruang kendali", "Mission control")} · ${H.tgl(new Date())}${f.sesi ? L(` · Sesi ${f.sesi}`, ` · Session ${f.sesi}`) : ""}</span><h1 class="h-title">${f.sesi ? H.T("Perburuan berjalan", "Hunt running") : H.T("Belum ada sesi", "No session running")}</h1></div>
          ${f.sesi_sisa != null && html`<span class="strip strip--compact" role="timer"><span class="strip__i"><small>${L("Jam", "Time")}</small><b class="mono">${H.hms(jam)}</b></span><span class="strip__dot" aria-hidden="true">·</span><span class="strip__i strip__left" data-low=${f.sesi_sisa < 1800 ? "yes" : "no"}><small>${L("Sisa", "Left")}</small><b class="mono">${H.hms(f.sesi_sisa)}</b></span>${tot && html`<span class="strip__dot strip__prog-dot" aria-hidden="true">·</span><span class="strip__prog"><${H.Bar} p=${Math.round((lewat / tot) * 100)} /><span class="hint num">${L(`${lewat} dari ${tot} menit`, `${lewat} of ${tot} minutes`)}</span></span>`}</span>`}</div>
        <div class="hmtop">
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
          })}</div>` : html`<p class="hint">${L("Belum ada kelompok. Daftar sesi datang dari situs web lewat agent PC.", "No groups yet. The session list comes from the website through the PC agent.")}</p>`}</section>
        <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Antrean klaim", "Claim queue")}</h2>${queue.length > 0 && html`<${Badge} tone="warn">${queue.length}</${Badge}>`}</div>
            ${queue.length ? queue.map((q) => html`<div class="claimq" style=${`--g:var(--group-${q.grup})`}>
              <button type="button" class="hphoto hphoto--sm" onClick=${() => q.foto_url && setPhoto(q)} aria-label=${L("Perbesar foto", "Enlarge the photo")} data-tip=${q.foto_url ? L("Perbesar foto", "Enlarge the photo") : undefined}>${q.foto_url ? html`<img src=${q.foto_url} alt="" />` : html`<${Icon} n="camera-slash" />`}</button>
              <div class="stack stack--sm grow"><b>${H.gfull(q.grup)}</b><span class="hint">${L(`${q.jarak_m == null ? "·" : H.fmt(q.jarak_m, 1)} m saat klaim · ${q.sejak} detik lalu · klaim ke-${q.klaim_ke}`, `${q.jarak_m == null ? "·" : H.fmt(q.jarak_m, 1)} m at the claim · ${q.sejak} seconds ago · claim ${q.klaim_ke}`)}</span>
                <div class="r5act"><${Btn} sm icon="x" onClick=${() => { setRej(q.grup); setWhy(0); setOther(""); }}>${L("Tolak", "Turn Down")}</${Btn}><${Btn} sm kind="primary" icon="check" onClick=${() => act("konfirmasi", { grup: q.grup }, L(`${H.gname(q.grup)} menang.`, `${H.gname(q.grup)} wins.`))}>${L("Konfirmasi", "Confirm")}</${Btn}></div></div></div>`)
              : html`<p class="hint">${L("Belum ada klaim yang menunggu.", "No claims waiting.")}</p>`}
            <span class="hint">${L("Paksa Konfirmasi ada di menu kelompok, untuk beacon yang terbukti ketemu tapi sinyalnya jatuh.", "Force Confirm is in the group menu, for a beacon that was clearly found but whose signal dropped.")}</span></section>
        </div>
        <div class="hgrid hgrid--2">
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Pengumuman dan hitung mundur", "Announcements and countdown")}</h2></div>
            <label class="field"><span class="label">${L("Pengumuman ke semua ponsel", "Announcement to every phone")}</span><input class="input" id="m-ann" aria-label=${L("Pengumuman ke semua ponsel", "Announcement to every phone")} maxlength="140" value=${ann} onInput=${(e) => setAnn(e.target.value)} placeholder=${L("contoh: 10 menit lagi, kumpul di lobi", "e.g. 10 minutes left, meet at the lobby")} /></label>
            ${f.pengumuman && html`<span class="hint">${L(`Tampil sekarang: ${f.pengumuman.teks}`, `Showing now: ${f.pengumuman.teks}`)}</span>`}
            <div class="r5act r5act--alt">
              ${f.pengumuman ? html`<${Btn} kind="ghost" icon="x" onClick=${() => act("pengumuman", { teks: "" }, L("Pengumuman dihapus.", "Announcement cleared."))}>${L("Hapus Pengumuman", "Clear It")}</${Btn}>` : html`<span></span>`}
              <${Btn} icon="timer" onClick=${() => act("aba_aba", {}, L("Hitung mundur tampil di proyektor.", "The countdown is on the projector."))}>${L("Hitung Mundur 10 Detik", "10-Second Countdown")}</${Btn}>
              <${Btn} kind="primary" icon="megaphone" disabled=${!ann.trim()} onClick=${() => act("pengumuman", { teks: ann.trim() }, L("Pengumuman terkirim.", "Announcement sent.")).then((r) => r.ok && setAnn(""))}>${L("Kirim", "Send")}</${Btn}></div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Kalibrasi dan arena", "Calibration and arena")}</h2></div>
            <div class="kv"><span class="label">${L("RSSI pada 1 m", "RSSI at 1 m")}</span><span class="mono">${f.model ? H.fmt(f.model.rssi_1m, 1) : "·"} dBm</span><span class="label">${L("Diukur", "Measured")}</span><span>${f.model && f.model.diukur ? `${H.tgl(new Date(f.model.diukur.replace(" ", "T")))} · ${f.model.diukur.slice(11)}` : L("belum, angka bawaan", "not yet, the default")}</span><span class="label">${L("Eksponen n", "Exponent n")}</span><span class="mono">${f.model ? H.fmt(f.model.n, 1) : "·"}</span></div>
            <${Btn} block icon="ruler" disabled=${!rows.some((r) => r.halus != null)} onClick=${() => setAsk("kal")}>${L("Ukur Ulang di 1 M", "Measure Again at 1 M")}</${Btn}>
            <div class="field"><span class="label">${L("Jari-jari arena", "Arena radius")}</span><${Stepper} value=${arena == null ? arenaNow : arena} min=${50} max=${600} step=${50} onChange=${changeArena} fmt=${(v) => v + " m"} label=${L("Jari-jari arena", "Arena radius")} /><span class="hint">${L("Tangga panas ikut ukuran arena. Ruang terbuka di sekitar gedung: 300 m.", "The heat ladder follows the arena size. Open ground around the building: 300 m.")}</span></div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Sesi", "Session")}</h2></div>
            <div class="kv"><span class="label">${L("Tanggal", "Date")}</span><span>${H.tgl(new Date())}</span><span class="label">${L("Sesi", "Session")}</span><span>${f.sesi ? f.sesi : L("tidak ada", "none")}</span><span class="label">${L("Praktikan tersambung", "Students connected")}</span><span class="num">${totalIn}/${total}</span><span class="label">${L("Paket diterima", "Packets received")}</span><span class="num">${H.fmt(packets)}</span></div>
            <div class="r5act r5act--alt">
              <a class="btn btn--sm" href="jejak.csv" download><${Icon} n="download-simple" />${H.title(L("Unduh jejak CSV", "Download the track CSV"))}</a>
              <${Btn} sm icon="arrow-counter-clockwise" onClick=${() => setAsk("reset")}>${L("Ronde Baru", "New Round")}</${Btn}>
              ${f.sesi ? html`<${Btn} sm kind="danger" icon="stop" onClick=${() => setAsk("akhiri")}>${L("Akhiri Sesi", "End the Session")}</${Btn}>` : html`<${Btn} sm kind="primary" icon="play" onClick=${() => setAsk("mulai")}>${L("Mulai Sesi", "Start a Session")}</${Btn}>`}</div></section>
          <section class="card"><div class="card__head"><h2 class="card__title">${H.T("Kode dan akun", "Codes and sign-ins")}</h2></div>
            <div class="kv"><span class="label">${L("Kode masuk", "Join code")}</span><span class="mono">${N.kode || "·"}</span><span class="label">${L("Kunci papan", "Board keys")}</span><span>${L(`putaran ${f.kunci_epoch || 0}`, `round ${f.kunci_epoch || 0}`)}</span><span class="label">${L("Token asisten", "Assistant token")}</span><span>${L("tetap, dari PC", "fixed, set on the PC")}</span></div>
            <span class="hint">${L("Kode masuk ada di tautan dan QR. Kode ini berganti tiap sesi, dan tiap sesi dimulai lagi. Kunci papan tetap sama antar sesi, jadi papan tidak perlu diunggah ulang, sampai kamu menekan Kunci Papan Baru.", "The join code is in the link and the QR. It changes every session and every time a session is started again. Board keys stay the same between sessions, so boards need no new upload, until you press New Board Keys.")}</span>
            <div class="r5act r5act--alt"><${Btn} sm icon="sign-out" onClick=${() => setAsk("lepas")}>${L("Lepas NIM", "Release a NIM")}</${Btn}><${Btn} sm kind="danger" icon="lock-key" onClick=${() => setAsk("kunci")}>${L("Kunci Papan Baru", "New Board Keys")}</${Btn}></div></section>
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
      ${ask === "kal" && html`<${KalPick} rows=${rows} onClose=${() => setAsk(null)} />`}
      ${ask === "lepas" && html`<${ReleaseNim} onClose=${() => setAsk(null)} />`}
      ${ask === "kunci" && html`<${Confirm} danger title=${L("Kunci papan baru", "New board keys")} body=${L("Semua kelompok harus mengunggah ulang hunter dan beacon dengan kunci baru dari langkah Perburuan situs. Papan yang lama dibuang sampai itu. Lakukan ini hanya kalau kunci bocor.", "Every group must upload its hunter and beacon again with the new key from the site's Hunt step. The old boards are ignored until then. Only do this if a key leaked.")} okLabel=${L("Putar Kunci", "Change the Keys")} onOk=${() => act("kunci_baru", {}, L("Kunci papan baru sudah dipakai.", "The new board keys are in use."))} onClose=${() => setAsk(null)} />`}
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
  /* The room's screen. Lanes fill the height and slide when the order
     changes; overtakes and finds take the banner above them for a few
     seconds, and otherwise the banner holds the round's numbers. */
  const MOMENT_MS = 4500;
  H.Stage = () => {
    const N = H.useNet();
    const st = H.useStore();
    const [count, setCount] = useState(null);
    const [flash, setFlash] = useState({});
    const [moment, setMoment] = useState(null);
    useEffect(
      () =>
        H.onEvents((evs) => {
          for (const ev of evs) {
            if (ev.kind === "aba-aba") setCount(10);
            if ((ev.kind === "salip" || ev.kind === "ditemukan") && ev.grup != null) {
              const g = ev.grup;
              setFlash((m) => ({ ...m, [g]: ev.kind }));
              setTimeout(() => setFlash((m) => { const n = { ...m }; delete n[g]; return n; }), 3000);
              setMoment({ kind: ev.kind, grup: g, lawan: ev.lawan, durasi: ev.durasi, id: Math.random() });
            }
          }
        }),
      [],
    );
    useEffect(() => {
      if (!moment) return undefined;
      const t = setTimeout(() => setMoment(null), MOMENT_MS);
      return () => clearTimeout(t);
    }, [moment]);
    H.useInterval(() => setCount((c) => (c == null ? null : c <= 0 ? null : c - 1)), count == null ? null : 1000);
    H.useTick(1000);
    const f = N.frame || {};
    const rows = f.grup || [];
    const order = H.standings(rows);
    const rank = new Map(order.map((r, i) => [r.grup, i]));
    const found = rows.filter((r) => r.status === "menang").length;
    const finale = f.penghargaan && f.penghargaan.beku && f.penghargaan.podium && f.penghargaan.podium.length;
    const d = new Date();
    const banner = moment
      ? html`<div class="smoment" key=${moment.id} data-k=${moment.kind} style=${`--g:var(--group-${moment.grup})`}>
          <span class="smoment__ic"><${Icon} n=${moment.kind === "salip" ? "arrows-left-right" : "flag-checkered"} lg /></span>
          <b>${moment.kind === "salip" ? L(`${H.gname(moment.grup)} menyalip ${H.gname(moment.lawan)}!`, `${H.gname(moment.grup)} overtakes ${H.gname(moment.lawan)}!`) : L(`${H.gname(moment.grup)} menemukan beaconnya!`, `${H.gname(moment.grup)} found its beacon!`)}</b>
          ${moment.kind === "ditemukan" && moment.durasi != null && html`<span class="mono">${H.ms(moment.durasi)}</span>`}</div>`
      : html`<div class="smeta">
          <span><small>${L("Sisa waktu", "Time left")}</small><b class="mono">${f.sesi_sisa != null ? H.hms(f.sesi_sisa) : "·"}</b></span>
          <span><small>${L("Sudah ketemu", "Found")}</small><b class="num">${found}<em>/${rows.length || 5}</em></b></span>
          <span><small>${L("Memimpin", "Leading")}</small><b style=${order[0] ? `color:var(--group-${order[0].grup})` : ""}>${order[0] && (order[0].status === "menang" || H.closedOf(order[0]) > 0) ? H.gname(order[0].grup) : "·"}</b></span></div>`;
    let body;
    if (count != null)
      body = html`<div class="hstage__count"><span class="hint">${L("Perburuan dimulai dalam", "The hunt starts in")}</span><b key=${count} class="num">${count > 0 ? count : L("Mulai!", "Go!")}</b></div>`;
    else if (finale)
      body = html`<div class="hstage__finale">
        <h1 class="h-display">${H.T("Selamat!", "Well done!")}</h1><${H.Podium} podium=${f.penghargaan.podium} stage /></div>`;
    else
      body = html`${banner}
        ${rows.length
          ? html`<div class="hstage__lanes" data-dense=${rows.length > 6 ? "yes" : "no"} style=${`--n:${rows.length}`}>${rows.map((r) => {
              const i = rank.get(r.grup);
              const won = r.status === "menang";
              return html`<div key=${r.grup} class="slane" data-flash=${flash[r.grup] || "no"} data-won=${won ? "yes" : "no"} style=${`--g:var(--group-${r.grup});--i:${i}`}>
                <span class="slane__rank num">${i === 0 && (won || H.closedOf(r) > 0) ? html`<${Icon} n="crown" />` : i + 1}</span><span class="slane__n"><b>${H.gname(r.grup)}</b><span>${H.kelompok(r.grup)}</span></span>
                <span class="slane__bar" data-h=${H.heatOf(r)}><i style=${`width:${won ? 100 : H.closedOf(r)}%`}><em></em></i></span>
                <b class="slane__v num">${won ? H.ms(r.durasi) : H.closedOf(r) + "%"}</b><${H.HeatChip} k=${H.heatOf(r)} lg /></div>`;
            })}</div>`
          : html`<p class="lede hstage__empty">${L("Belum ada hunter yang mengirim data.", "No hunter is sending data yet.")}</p>`}`;
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
      offline: ["wifi-slash", L("Tidak Tersambung", "Not Connected"), H.NET(L("Tidak bisa menjangkau papan skor. Bisa jadi sinyal ponselmu lemah, atau PC sedang restart. Halaman mencoba lagi sendiri.", "Can't reach the scoreboard. Your phone's signal may be weak, or the PC may be restarting. The page tries again by itself."), L("Ponselmu terlepas dari Wi-Fi IRIS_IOT. Biasanya kamu terlalu jauh dari PC lab; halaman mencoba lagi sendiri.", "Your phone dropped off the IRIS_IOT Wi-Fi. Usually you are too far from the lab PC; the page tries again by itself.")), L("Mencoba lagi sendiri", "Trying again by itself")],
      restart: ["arrows-clockwise", L("Server perburuan dimulai ulang", "The hunt server is restarting"), L("Asisten memulai ulang server. Posisi dan klaim kalian aman.", "An assistant restarted the server. Your progress and claims are safe."), L("Tersambung lagi sendiri", "Reconnects by itself")],
      ended: ["flag-checkered", L("Ronde selesai", "Round over"), L("Semua kelompok sudah menemukan beaconnya, atau asisten menutup ronde.", "Every group found its beacon, or an assistant closed the round."), null],
      rolled: ["calendar-blank", L("Sesi sudah berganti", "The session changed"), L("Sesi ini sudah lewat. Masuk lagi dengan NIM kalau kamu ikut sesi berikutnya.", "This session is over. Sign in again with your NIM if you're in the next one."), null],
      token: ["lock-key", L("Terlalu banyak percobaan", "Too many tries"), L("Sambungan ditutup karena terlalu banyak token salah dari jaringan ini. Tunggu beberapa menit, lalu muat ulang halaman.", "The connection closed because too many wrong tokens came from this network. Wait a few minutes, then reload the page."), null],
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
