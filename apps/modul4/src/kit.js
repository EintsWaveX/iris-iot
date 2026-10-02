/* Perburuan LoRa IRIS: the shared kit.
   Ported from the Phase 9 mockup's core.js (the source of truth for the
   look), cut down to what the hunt uses. Classic script: everything hangs
   off window.H so the screen files stay classic scripts too, and build.py
   can concatenate them into one offline page. */
(function () {
  const { html, render, useState, useEffect, useLayoutEffect, useRef } = window.htmPreact;
  const H = (window.H = window.H || {});

  /* ---------------------------------------------------------------- store */
  const listeners = new Set();
  const KEEP = ["lang", "theme", "sun", "sound", "vib", "zhW"];
  const KEY = "iris_hunt_ui";
  const read = (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch (e) {
      /* a private window: the choice lasts until the tab closes */
    }
  };
  H.read = read;
  H.write = write;
  const saved = (() => {
    try {
      return JSON.parse(read(KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  })();
  const firstLang = () => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "id" || q === "en" || q === "zh") return q;
    if (saved.lang === "id" || saved.lang === "en" || saved.lang === "zh") return saved.lang;
    const nav = (navigator.language || "id").toLowerCase();
    return nav.startsWith("zh") ? "zh" : nav.startsWith("en") ? "en" : "id";
  };
  const state = Object.assign(
    { theme: "dark", sun: false, sound: false, vib: true, zhW: "700", width: window.innerWidth, reduce: false },
    saved,
    { lang: firstLang() },
  );
  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  state.reduce = !!(mq && mq.matches);
  H.state = state;
  H.set = (patch) => {
    Object.assign(state, typeof patch === "function" ? patch(state) : patch);
    const o = {};
    KEEP.forEach((k) => (o[k] = state[k]));
    write(KEY, JSON.stringify(o));
    listeners.forEach((f) => f());
  };
  H.useStore = () => {
    const [, force] = useState(0);
    useEffect(() => {
      const f = () => force((n) => n + 1);
      listeners.add(f);
      return () => listeners.delete(f);
    }, []);
    return state;
  };
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - state.width) > 2) H.set({ width: window.innerWidth });
  });
  if (mq && mq.addEventListener) mq.addEventListener("change", () => H.set({ reduce: mq.matches }));

  /* Copy: L("Indonesia", "English"). In Mandarin the English text is the
     key into window.HUNT_ZH (src/i18n/zh.json). Strings built from template
     literals match a pattern key where each ${...} became {0}, {1} and so
     on. A missing key falls back to English. */
  const ZHP = [];
  const zhCache = new Map();
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const Z = window.HUNT_ZH || {};
  Object.keys(Z).forEach((k) => {
    if (!/\{\d\}/.test(k)) return;
    const parts = k.split(/\{(\d)\}/);
    let re = "^";
    const order = [];
    parts.forEach((p, i) => (i % 2 ? ((re += "([\\s\\S]*?)"), order.push(+p)) : (re += esc(p))));
    ZHP.push({ re: new RegExp(re + "$"), order, zh: Z[k], fixed: k.replace(/\{\d\}/g, "").length });
  });
  ZHP.sort((a, b) => b.fixed - a.fixed);
  H.zh = (en) => {
    if (typeof en !== "string" || !en) return en;
    if (zhCache.has(en)) return zhCache.get(en);
    let out = Z[en];
    if (out === undefined) {
      for (const p of ZHP) {
        const m = en.match(p.re);
        if (m) {
          const caps = p.order.reduce((o, n, i) => ((o[n] = m[i + 1]), o), {});
          out = p.zh.replace(/\{(\d)\}/g, (_, n) => {
            const c = caps[n] != null ? caps[n] : "";
            return Z[c] !== undefined ? Z[c] : c;
          });
          break;
        }
      }
    }
    if (out === undefined) out = en;
    zhCache.set(en, out);
    return out;
  };
  H.L = (id, en) => (state.lang === "en" ? en : state.lang === "zh" ? H.zh(en) : id);
  const L = H.L;
  /* Title case for headers, tabs, buttons and menu items. Short joiners
     stay lower case unless they open the title. Codes and numbers are left
     alone. Hints and body text stay in sentence case. */
  const JOIN = new Set(["dan", "di", "ke", "dari", "per", "untuk", "atau", "yang", "dengan", "pada", "oleh", "bagi",
    "a", "an", "the", "and", "or", "but", "of", "to", "for", "in", "on", "at", "by", "with", "from", "vs"]);
  H.title = (str) => {
    if (typeof str !== "string" || state.lang === "zh") return str;
    let first = true;
    return str.replace(/[^\s]+/g, (w) => {
      const lead = first;
      first = /[:·.!?]$/.test(w) || w === "·";
      /* "8-facing" reads "8-Facing": a number joined to a word */
      const nw = w.match(/^(\d+-)([a-z])(.*)$/);
      if (nw) return nw[1] + nw[2].toUpperCase() + nw[3];
      const m = w.match(/^([("“']*)([a-zà-ɏ][a-zà-ɏ'’]*)(.*)$/);
      if (!m || /[0-9_@/]/.test(w)) return w;
      if (!lead && JOIN.has(m[2])) return w;
      return m[1] + m[2][0].toUpperCase() + m[2].slice(1) + m[3];
    });
  };
  H.T = (id, en) => H.title(L(id, en));
  const tc = (c) => (typeof c === "string" ? H.title(c) : Array.isArray(c) ? c.map(tc) : c);

  /* ---------------------------------------------------------- formatting */
  H.locale = () => (state.lang === "en" ? "en-GB" : state.lang === "zh" ? "zh-CN" : "id-ID");
  H.fmt = (v, dp = 0) =>
    v == null || Number.isNaN(v) ? "·" : Number(v).toLocaleString(H.locale(), { minimumFractionDigits: dp, maximumFractionDigits: dp });
  H.hms = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };
  /* minutes and seconds of the hunt, "24:10" */
  H.ms = (sec) => {
    if (sec == null) return "·";
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
  };
  /* Dates always in full: "Kamis, 1 Oktober 2026" */
  H.tgl = (d) => {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const wd = d.getDay();
    if (state.lang === "zh") return `${y}年${m + 1}月${day}日 ${["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][wd]}`;
    const ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const IM = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const EM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return state.lang === "en" ? `${EN[wd]}, ${day} ${EM[m]} ${y}` : `${ID[wd]}, ${day} ${IM[m]} ${y}`;
  };
  H.modul = (n) => L(`Modul ${n}`, `Module ${n}`);
  H.kelompok = (n) => L(`Kelompok ${n}`, `Group ${n}`);
  H.menit = (n) => L(`${n} menit`, `${n} minutes`);
  H.cls = (...a) => a.filter(Boolean).join(" ");
  const cls = H.cls;

  /* the IRIS mark, inlined by build.py */
  H.LOGO = window.HUNT_LOGO || "";

  /* ---------------------------------------------------------------- icons */
  const PH = window.PH_ICONS || {};
  H.Icon = ({ n, sm, lg, label }) =>
    html`<svg class=${"ic" + (sm ? " ic--sm" : "") + (lg ? " ic--lg" : "")} viewBox="0 0 256 256" aria-hidden=${label ? undefined : "true"} role=${label ? "img" : undefined} aria-label=${label}><path d=${PH[n] || PH.x || ""} /></svg>`;
  const Icon = H.Icon;

  /* ------------------------------------------------------------ primitives */
  H.Btn = ({ kind, lg, sm, block, icon, iconEnd, children, onClick, disabled, tip, pressed, type }) =>
    html`<button type=${type || "button"} class=${cls("btn", kind && "btn--" + kind, lg && "btn--lg", sm && "btn--sm", block && "btn--block")} onClick=${onClick} disabled=${disabled} data-tip=${tip} aria-pressed=${pressed === undefined ? undefined : String(pressed)}>
      ${icon && html`<${Icon} n=${icon} />`}${tc(children)}${iconEnd && html`<${Icon} n=${iconEnd} />`}
    </button>`;
  /* Icon-only buttons always carry a tooltip and an aria-label */
  H.IconBtn = ({ icon, label, onClick, kind, sm, pressed, disabled }) =>
    html`<button type="button" class=${cls("iconbtn", kind && "iconbtn--" + kind, sm && "iconbtn--sm")} aria-label=${label} data-tip=${label} onClick=${onClick} disabled=${disabled} aria-pressed=${pressed === undefined ? undefined : String(pressed)}><${Icon} n=${icon} /></button>`;
  H.Badge = ({ tone, g, children, tip }) =>
    html`<span class=${cls("badge", tone && "badge--" + tone, g && "badge--g")} style=${g ? `--g:var(--group-${g})` : ""} data-tip=${tip}>${children}</span>`;
  H.Switch = ({ on, onChange, label }) =>
    html`<button type="button" class="switch" role="switch" aria-checked=${String(!!on)} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
  H.Bar = ({ p, g }) =>
    html`<div class="bar" role="progressbar" aria-valuenow=${p} aria-valuemin="0" aria-valuemax="100"><i style=${`width:${p}%;${g ? `--g:var(--group-${g})` : ""}`}></i></div>`;
  H.Stepper = ({ value, min, max, step = 1, onChange, fmt, label }) =>
    html`<div class="stepper" role="group" aria-label=${label}>
      <button type="button" aria-label=${L("Kurangi", "Less")} data-tip=${L("Kurangi", "Less")} disabled=${value <= min} onClick=${() => onChange(Math.max(min, value - step))}><${Icon} n="caret-left" /></button>
      <output aria-live="polite">${fmt ? fmt(value) : value}</output>
      <button type="button" aria-label=${L("Tambah", "More")} data-tip=${L("Tambah", "More")} disabled=${value >= max} onClick=${() => onChange(Math.min(max, value + step))}><${Icon} n="caret-right" /></button>
    </div>`;
  H.Tabs = ({ value, tabs, onChange, fill, label }) =>
    html`<div class=${cls("tabs", fill && "tabs--fill")} role="tablist" aria-label=${label}>
      ${tabs.map((t) => html`<button role="tab" type="button" aria-selected=${String(t.v === value)} onClick=${() => onChange(t.v)}>${t.icon && html`<${Icon} n=${t.icon} sm />`}${H.title(t.l)}</button>`)}
    </div>`;
  H.StateView = ({ icon, title, body, actions, tone }) =>
    html`<div class="card" style="justify-items:center;text-align:center;padding:42px 20px;gap:14px">
      <div style=${`width:68px;height:68px;border-radius:50%;display:grid;place-items:center;background:var(--${tone || "accent"}-soft);color:var(--${tone || "accent"}${tone ? "" : "-bright"})`}><${Icon} n=${icon} lg /></div>
      <h2 class="h2">${title}</h2>
      ${body && html`<p class="lede" style="max-width:46ch">${body}</p>`}
      ${actions && html`<div class="row" style="justify-content:center">${actions}</div>`}
    </div>`;
  H.useInterval = (fn, ms) => {
    const r = useRef(fn);
    r.current = fn;
    useEffect(() => {
      if (ms == null) return;
      const id = setInterval(() => r.current(), ms);
      return () => clearInterval(id);
    }, [ms]);
  };
  H.useTick = (ms = 1000) => {
    const [, tick] = useState(0);
    H.useInterval(() => tick((n) => n + 1), ms);
  };

  /* ------------------------------------------------ overlay layer, stack
     Every overlay (dialog, sheet, toasts) renders into .huntapp__layers, outside
     the page's grids and overflow. One stack orders them: Esc and scrim
     clicks close only the top layer. */
  H.Portal = ({ children }) => {
    const host = useRef(null);
    useLayoutEffect(() => {
      const root = document.querySelector(".huntapp__layers");
      if (!root) return;
      const el = document.createElement("div");
      el.className = "layer";
      root.appendChild(el);
      host.current = el;
      return () => {
        render(null, el);
        el.remove();
        host.current = null;
      };
    }, []);
    useLayoutEffect(() => {
      if (host.current) render(children, host.current);
    });
    return null;
  };
  const stack = [];
  const subs = new Set();
  const notify = () => subs.forEach((f) => f());
  const unstack = (id) => {
    const i = stack.findIndex((x) => x.id === id);
    if (i >= 0) {
      stack.splice(i, 1);
      notify();
    }
  };
  H.closeTop = () => stack.length && stack[stack.length - 1].close();
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !stack.length) return;
      e.preventDefault();
      e.stopPropagation();
      H.closeTop();
    },
    true,
  );
  const useOverlay = (onClose, ms = 190) => {
    const [st, setSt] = useState("open");
    const idRef = useRef(Math.random());
    const id = idRef.current;
    const closing = useRef(false);
    const cb = useRef(onClose);
    cb.current = onClose;
    const [, force] = useState(0);
    const close = () => {
      if (closing.current) return;
      closing.current = true;
      unstack(id);
      setSt("closed");
      setTimeout(() => cb.current && cb.current(), state.reduce ? 0 : ms);
    };
    const closeRef = useRef(close);
    closeRef.current = close;
    useLayoutEffect(() => {
      stack.push({ id, close: () => closeRef.current() });
      notify();
      const f = () => force((n) => n + 1);
      subs.add(f);
      return () => {
        subs.delete(f);
        unstack(id);
      };
    }, []);
    const top = stack.length > 0 && stack[stack.length - 1].id === id;
    const under = stack.some((x) => x.id === id) && !top;
    return { st, close, top, under, scrimClick: () => (top ? close() : H.closeTop()) };
  };
  const useAutoFocus = (ref) =>
    useEffect(() => {
      const t = setTimeout(() => ref.current && ref.current.focus({ preventScroll: true }), 30);
      return () => clearTimeout(t);
    }, []);
  /* Footers: Cancel on the left, the main action on the right */
  H.Dialog = ({ title, desc, onClose, children, foot, lg, sm }) => {
    const o = useOverlay(onClose);
    const box = useRef(null);
    useAutoFocus(box);
    return html`<${H.Portal}>
      <div class="scrim" data-state=${o.st} data-under=${o.under ? "yes" : "no"} onClick=${o.scrimClick}></div>
      <div class=${"dialog" + (lg ? " dialog--lg" : sm ? " dialog--sm" : "")} ref=${box} tabindex="-1" data-state=${o.st} data-under=${o.under ? "yes" : "no"} inert=${o.under ? "" : undefined} role="dialog" aria-modal="true" aria-label=${title}>
        <div class="dialog__head">
          <div class="stack stack--sm"><h2 class="h2">${H.title(title)}</h2>${desc && html`<p class="dialog__desc">${desc}</p>`}</div>
          <${H.IconBtn} icon="x" label=${L("Tutup", "Close")} onClick=${o.close} />
        </div>
        ${children && html`<div class="dialog__body">${typeof children === "function" ? children(o.close) : children}</div>`}
        ${foot && html`<div class="dialog__foot">${typeof foot === "function" ? foot(o.close) : foot}</div>`}
      </div>
    </${H.Portal}>`;
  };
  H.Sheet = ({ title, onClose, children }) => {
    const o = useOverlay(onClose);
    const box = useRef(null);
    useAutoFocus(box);
    return html`<${H.Portal}>
      <div class="scrim" data-state=${o.st} data-under=${o.under ? "yes" : "no"} onClick=${o.scrimClick}></div>
      <div class="sheet" ref=${box} tabindex="-1" data-state=${o.st} inert=${o.under ? "" : undefined} role="dialog" aria-modal="true" aria-label=${title}>
        <div class="row row--between" style="flex-wrap:nowrap"><h2 class="h2">${H.title(title)}</h2><${H.IconBtn} icon="x" label=${L("Tutup", "Close")} onClick=${o.close} /></div>
        ${typeof children === "function" ? children(o.close) : children}
      </div>
    </${H.Portal}>`;
  };

  /* Toasts */
  let pushToast = () => {};
  H.toast = (msg, opts) => pushToast(msg, opts || {});
  H.Toasts = () => {
    const [list, setList] = useState([]);
    pushToast = (msg, opts) => {
      const id = Math.random();
      setList((l) => [...l.slice(-3), { id, msg, ...opts }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), opts.ms || 4200);
    };
    return html`<${H.Portal}><div class="toasts" aria-live="polite">
      ${list.map((t) => html`<div class=${"toast" + (t.tone ? " toast--" + t.tone : "")}>
        <${Icon} n=${t.icon || (t.tone === "danger" || t.tone === "warn" ? "warning" : "check-circle")} /><span>${t.msg}</span>
      </div>`)}
    </div></${H.Portal}>`;
  };

  /* One tooltip on top of every layer. Any element with data-tip shows it
     on hover or keyboard focus; it flips below when there is no room. */
  H.TipLayer = () => {
    const [t, setT] = useState(null);
    const box = useRef(null);
    useEffect(() => {
      const app = document.querySelector(".huntapp");
      if (!app) return;
      let cur = null;
      const show = (el) => {
        cur = el;
        setT({ text: el.getAttribute("data-tip"), r: el.getBoundingClientRect() });
      };
      const hide = () => {
        cur = null;
        setT(null);
      };
      const over = (e) => {
        if (e.pointerType === "touch") return;
        const el = e.target.closest && e.target.closest("[data-tip]");
        if (el && el !== cur && el.getAttribute("data-tip")) show(el);
      };
      const out = (e) => {
        if (!cur) return;
        const to = e.relatedTarget;
        if (!to || !cur.contains(to)) hide();
      };
      const focus = (e) => {
        const el = e.target;
        if (el.matches && el.matches(":focus-visible") && el.getAttribute("data-tip")) show(el);
      };
      app.addEventListener("pointerover", over);
      app.addEventListener("pointerout", out);
      app.addEventListener("focusin", focus);
      app.addEventListener("focusout", out);
      app.addEventListener("pointerdown", hide);
      app.addEventListener("scroll", hide, true);
      return () => {
        app.removeEventListener("pointerover", over);
        app.removeEventListener("pointerout", out);
        app.removeEventListener("focusin", focus);
        app.removeEventListener("focusout", out);
        app.removeEventListener("pointerdown", hide);
        app.removeEventListener("scroll", hide, true);
      };
    }, []);
    useLayoutEffect(() => {
      const el = box.current;
      if (!el || !t) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const { r } = t;
      const W = window.innerWidth;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), W - w - 8);
      const above = r.top - h - 8;
      el.style.left = left + "px";
      el.style.top = (above >= 8 ? above : r.bottom + 8) + "px";
      el.setAttribute("data-side", above >= 8 ? "top" : "bottom");
    }, [t]);
    return t ? html`<div class="tip" ref=${box} role="tooltip" style="position:fixed">${t.text}</div>` : null;
  };

  /* ------------------------------------------------------- language pick */
  H.LANGS = [{ v: "id", l: "Bahasa Indonesia" }, { v: "en", l: "English" }, { v: "zh", l: "中文 (简体)" }];
  H.LangPick = () => {
    const st = H.useStore();
    const sub = { id: L("Indonesia", "Indonesian"), en: L("Inggris", "English"), zh: L("Mandarin, aksara sederhana", "Mandarin, Simplified") };
    return html`<div class="langpick" role="radiogroup" aria-label=${L("Bahasa", "Language")}>${H.LANGS.map((o) => html`<button type="button" role="radio" class="langpick__o" aria-checked=${String(st.lang === o.v)} onClick=${() => H.set({ lang: o.v })}>
      <span class="stack" style="gap:0"><b lang=${o.v === "zh" ? "zh-Hans" : o.v}>${o.l}</b><span class="hint">${sub[o.v]}</span></span>${st.lang === o.v && html`<${Icon} n="check" />`}</button>`)}</div>`;
  };
  /* Mandarin only: the heading weight */
  H.ZhWeight = () => {
    const st = H.useStore();
    if (st.lang !== "zh") return null;
    return html`<div class="stack stack--sm"><span class="label">标题粗细</span>
      <${H.Tabs} fill value=${st.zhW || "700"} onChange=${(v) => H.set({ zhW: v })} label="标题粗细" tabs=${[{ v: "700", l: "粗 700" }, { v: "500", l: "细 500" }]} />
      <span class="hint">只在中文界面出现。改的是页面标题和卡片标题的字重。</span></div>`;
  };

  /* ------------------------------------------------------------- charts
     Inline SVG, one axis, 2px line, a light area wash, hairline grid and a
     crosshair with one tooltip. Every value is also in a stat. */
  const nice = (lo, hi) => {
    const span = hi - lo || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    const m = [1, 2, 2.5, 5, 10].find((x) => span / (x * step) <= 5) * step;
    const a = Math.floor(lo / m) * m;
    const b = Math.ceil(hi / m) * m;
    const ticks = [];
    for (let v = a; v <= b + m / 2; v += m) ticks.push(+v.toFixed(6));
    return { a, b, ticks };
  };
  /* data: [{t: epoch ms, v}] */
  H.LineChart = ({ data, unit, dp = 0, tone = "var(--mod-4)", title, h = 190 }) => {
    const ref = useRef(null);
    const [hi, setHi] = useState(null);
    if (!data || data.length < 2)
      return html`<p class="hint">${L("Belum cukup data untuk grafik. Tunggu beberapa detik.", "Not enough data for a chart yet. Wait a few seconds.")}</p>`;
    const vals = data.map((d) => d.v);
    const W = 640;
    const pad = { l: 46, r: 14, t: 12, b: 26 };
    const { a, b, ticks } = nice(Math.min(...vals), Math.max(...vals));
    const x = (i) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - a) / (b - a || 1)) * (h - pad.t - pad.b);
    const path = vals.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const area = path + ` L${x(data.length - 1)} ${h - pad.b} L${x(0)} ${h - pad.b} Z`;
    const clock = (t) => {
      const d = new Date(t);
      return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
    };
    const move = (e) => {
      const r = ref.current.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
      setHi(Math.max(0, Math.min(data.length - 1, i)));
    };
    const xt = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    return html`<figure class="vchart" style=${`--c:${tone}`}>
      ${title && html`<figcaption class="chart__cap"><b>${title}</b><span class="hint">${unit}</span></figcaption>`}
      <div class="chart__box">
        <svg ref=${ref} viewBox=${`0 0 ${W} ${h}`} role="img" aria-label=${`${title || ""}, ${data.length} ${L("titik", "points")}`} onPointerMove=${move} onPointerLeave=${() => setHi(null)} tabindex="0"
          onKeyDown=${(e) => {
            if (e.key === "ArrowRight") setHi(Math.min(data.length - 1, (hi == null ? data.length - 2 : hi) + 1));
            if (e.key === "ArrowLeft") setHi(Math.max(0, (hi == null ? data.length : hi) - 1));
          }}>
          ${ticks.map((t) => html`<g><line class="chart__grid" x1=${pad.l} x2=${W - pad.r} y1=${y(t)} y2=${y(t)} /><text class="chart__tick" x=${pad.l - 8} y=${y(t) + 4} text-anchor="end">${H.fmt(t, dp && b - a < 5 ? 1 : 0)}</text></g>`)}
          <path class="chart__area" d=${area} />
          <path class="chart__line" d=${path} />
          ${xt.map((i) => html`<text class="chart__tick" x=${x(i)} y=${h - 6} text-anchor=${i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>${clock(data[i].t)}</text>`)}
          <circle class="chart__end" cx=${x(data.length - 1)} cy=${y(vals[vals.length - 1])} r="4.5" />
          ${hi != null && html`<g><line class="chart__cross" x1=${x(hi)} x2=${x(hi)} y1=${pad.t} y2=${h - pad.b} /><circle class="chart__dot" cx=${x(hi)} cy=${y(vals[hi])} r="5" /></g>`}
        </svg>
        ${hi != null && html`<div class="chart__tip" style=${`left:${(x(hi) / W) * 100}%`} data-side=${hi > data.length * 0.6 ? "left" : "right"}>
          <b class="num">${H.fmt(vals[hi], dp)} ${unit}</b><span><i class="chart__key"></i>${title}</span><span class="hint mono">${clock(data[hi].t)}</span></div>`}
      </div>
    </figure>`;
  };
  H.Spark = ({ data, tone = "var(--mod-4)" }) => {
    if (!data || data.length < 2) return html`<svg class="vspark" viewBox="0 0 100 30" aria-hidden="true"></svg>`;
    const vals = data.slice(-40).map((d) => d.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const n = vals.length;
    const pts = vals.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / (hi - lo || 1)) * 22).toFixed(1)}`).join(" ");
    return html`<svg class="vspark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" style=${`--c:${tone}`}><polyline points=${pts} /></svg>`;
  };
  const statsOf = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
    return { min: s[0], max: s[s.length - 1], mean: a.reduce((x, y) => x + y, 0) / a.length, p50: q(0.5), p95: q(0.95), now: a[a.length - 1] };
  };
  H.statsOf = statsOf;
  /* A live value. Tap (or Enter) opens its chart, drawn from the samples
     this phone has kept since it opened the page. */
  const RANGES = [{ v: 1, l: ["1 menit", "1 minute"] }, { v: 5, l: ["5 menit", "5 minutes"] }, { v: 15, l: ["15 menit", "15 minutes"] }];
  H.DataCard = ({ label, value, unit, sub, series, dp = 0, tone, desc }) => {
    const [open, setOpen] = useState(false);
    return html`<button type="button" class="dcard" style=${tone ? `--tone:${tone}` : ""} onClick=${() => setOpen(true)} aria-haspopup="dialog">
        <span class="dcard__l">${label}</span>
        <span class="dcard__v"><b class="num">${value}</b>${unit && html`<small>${unit}</small>`}</span>
        ${sub && html`<span class="hint">${sub}</span>`}
        <${H.Spark} data=${series && series()} tone=${tone} />
        <span class="dcard__more"><${Icon} n="arrows-out-simple" sm /></span>
      </button>
      ${open && html`<${DataModal} label=${label} unit=${unit} dp=${dp} series=${series} tone=${tone} desc=${desc} onClose=${() => setOpen(false)} />`}`;
  };
  const DataModal = ({ label, unit, dp, series, tone, desc, onClose }) => {
    const [range, setRange] = useState(5);
    H.useTick(1000);
    const all = (series && series()) || [];
    const since = Date.now() - range * 60000;
    const data = all.filter((d) => d.t >= since);
    const s = data.length ? statsOf(data.map((d) => d.v)) : null;
    const items = s ? [[L("Sekarang", "Now"), s.now], [L("Terendah", "Lowest"), s.min], [L("Tertinggi", "Highest"), s.max], [L("Rata-rata", "Average"), s.mean]] : [];
    return html`<${H.Dialog} lg title=${label} desc=${desc} onClose=${onClose}
      foot=${(c) => html`<${H.Btn} kind="primary" onClick=${c}>${L("Selesai", "Done")}</${H.Btn}>`}>
      <div class="row row--between"><${H.Tabs} value=${range} onChange=${setRange} label=${L("Rentang", "Range")} tabs=${RANGES.map((r) => ({ v: r.v, l: L(...r.l) }))} /><span class="hint"><span class="dot dot--ok"></span> ${L("diperbarui tiap detik", "updates every second")}</span></div>
      ${s && html`<div class="stats">${items.map(([t, v]) => html`<div class="stat"><b>${H.fmt(v, dp)} <small class="hint">${unit}</small></b><span>${t}</span></div>`)}</div>`}
      <${H.LineChart} data=${data} unit=${unit} dp=${dp} tone=${tone} title=${L("Garis waktu", "Timeline")} />
    </${H.Dialog}>`;
  };
})();
