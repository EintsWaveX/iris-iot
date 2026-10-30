/**
 * R1 to R3 layout audit (30 Oct 2026). Walks every screen of R1, R2 and R3 in
 * every state its picker offers (each variant option on its own, the rest at
 * their default), at four laptop sizes and both themes, and measures what the
 * eye would catch: overflow and clipping, overlaps, badges and buttons whose
 * text is off centre, rows whose parts sit on different lines, near-miss edges
 * and spacing off the 4px grid. Findings are written to shots/audit9.json and
 * the screenshots to shots/a9/. Usage: node audit9.mjs [screenIdPrefix ...]
 */
import fs from "node:fs";
import { open } from "./lib8.mjs";

const SIZES = [
  { W: 1440, H: 900, theme: "dark", keep: true },
  { W: 1440, H: 900, theme: "light", keep: true },
  { W: 1280, H: 720, theme: "dark" },
  { W: 1680, H: 1050, theme: "dark" },
  { W: 1280, H: 600, theme: "dark" },
];
const only = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync("./shots/enum9.json", "utf8")).filter((s) => !only.length || only.some((o) => s.id.startsWith(o)));
fs.mkdirSync("./shots/a9", { recursive: true });

/* Runs inside the page. Returns a list of findings for what is on screen. */
const PROBE = () => {
  const root = document.querySelector(".dev__scroll") || document.querySelector(".dev");
  const rr = root.getBoundingClientRect();
  const out = [];
  const cls = (e) => (typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "");
  const txt = (e) => (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 36);
  const name = (e) => `${e.tagName.toLowerCase()}${cls(e) ? "." + cls(e) : ""}${txt(e) ? ` "${txt(e)}"` : ""}`;
  const shown = (e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05;
  };
  const inRoot = (e) => root.contains(e);
  const all = [...root.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "PATH", "CIRCLE", "RECT", "LINE", "G", "DEFS", "USE", "POLYGON", "POLYLINE", "ELLIPSE", "TITLE"].includes(e.tagName.toUpperCase()) && shown(e));
  const add = (kind, sev, e, detail) => { const r = e.getBoundingClientRect(); out.push({ kind, sev, el: name(e), detail, rect: [r.left, r.top, r.width, r.height].map(Math.round) }); };
  const textRect = (e) => {
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let n, box = null;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const c of r.getClientRects()) if (c.width > 0 && c.height > 0) box = box ? { l: Math.min(box.l, c.left), t: Math.min(box.t, c.top), r: Math.max(box.r, c.right), b: Math.max(box.b, c.bottom) } : { l: c.left, t: c.top, r: c.right, b: c.bottom };
    }
    return box;
  };
  const firstLine = (e) => {
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const c = [...r.getClientRects()].find((x) => x.width > 0 && x.height > 0);
      if (c) return c;
    }
    return null;
  };
  const lineH = (e) => { const cs = getComputedStyle(e); const l = parseFloat(cs.lineHeight); return isNaN(l) ? parseFloat(cs.fontSize) * 1.3 : l; };

  /* A. the screen itself scrolls sideways */
  if (root.scrollWidth > root.clientWidth + 1) add("h-scroll", "broken", root, `scrollWidth ${root.scrollWidth} > ${root.clientWidth}`);

  for (const e of all) {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    /* B. text cut off or squeezed */
    if (own && /(hidden|clip)/.test(cs.overflowX + cs.overflow) && e.scrollWidth > e.clientWidth + 1) {
      add(cs.textOverflow === "ellipsis" ? "truncated" : "clipped", cs.textOverflow === "ellipsis" ? "info" : "ugly", e, `scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
    }
    if (own && /(hidden|clip)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && cs.display !== "-webkit-box") add("clipped-v", "ugly", e, `scrollHeight ${e.scrollHeight} > clientHeight ${e.clientHeight}`);
    /* C. sticks out of the screen on the right */
    if (own && r.right > rr.right + 2 && !e.closest("[data-scroll],.scrollx,pre,.r3ed__code,.lc-ed")) add("outside-right", "broken", e, `right ${Math.round(r.right)} > ${Math.round(rr.right)}`);
    /* D. text smaller than readable */
    if (own && parseFloat(cs.fontSize) < 11) add("tiny-text", "fragile", e, `${cs.fontSize}`);
    /* E. a pill, badge, chip or button whose text is off centre or wraps */
    const isPill = /(^|[\s_-])(pill|badge|chip|tag|status|lg__|btn|sc-flag|mk)([\s_-]|$)/i.test(typeof e.className === "string" ? e.className : "") || e.tagName === "BUTTON";
    if (isPill && own && r.height < 80) {
      const tr = textRect(e);
      if (tr) {
        const lh = lineH(e);
        const lines = Math.round((tr.b - tr.t) / lh);
        const pillish = cs.borderRadius !== "0px" || cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopWidth !== "0px";
        if (pillish) {
          const dy = Math.abs((tr.t + tr.b) / 2 - (r.top + r.bottom) / 2);
          const dx = Math.abs((tr.l + tr.r) / 2 - (r.left + r.right) / 2);
          const justify = cs.textAlign === "left" || cs.textAlign === "start" ? 99 : dx;
          if (dy > 2.5) add("text-off-centre-y", "ugly", e, `text centre ${dy.toFixed(1)}px off`);
          if (justify !== 99 && dx > 3 && cs.textAlign === "center" && !e.querySelector("svg,img,i") && e.tagName !== "TD" && e.tagName !== "BUTTON") add("text-off-centre-x", "fragile", e, `${dx.toFixed(1)}px off`);
          if (lines >= 2 && r.width < 220) add("pill-wraps", "ugly", e, `${lines} lines in ${Math.round(r.width)}px`);
        }
      }
    }
    /* F. a row whose parts sit on different lines */
    if (cs.display.includes("flex") && /^row/.test(cs.flexDirection) && cs.flexWrap === "nowrap") {
      const kids = [...e.children].filter(shown);
      if (kids.length >= 2 && kids.length <= 8 && cs.alignItems !== "center") {
        const lines = kids.map((k) => ({ k, fl: firstLine(k), h: k.getBoundingClientRect().height })).filter((x) => x.fl && x.h < lineH(x.k) * 1.9 + 14);
        if (lines.length >= 2) {
          const cy = lines.map((x) => (x.fl.top + x.fl.bottom) / 2);
          const spread = Math.max(...cy) - Math.min(...cy);
          if (spread > 3.5 && spread < 40) add("row-misaligned", "ugly", e, `first lines differ ${spread.toFixed(1)}px (align-items:${cs.alignItems}) [${lines.map((x) => cls(x.k) || x.k.tagName.toLowerCase()).join(" | ")}]`);
        }
        /* icon beside text */
        for (const k of kids) {
          if (k.tagName.toLowerCase() === "svg" || /icon|ico/i.test(cls(k))) {
            const kr = k.getBoundingClientRect();
            const sib = kids.find((x) => x !== k && firstLine(x));
            const f = sib && firstLine(sib);
            if (f && kr.height < 40) {
              const d = Math.abs((kr.top + kr.bottom) / 2 - (f.top + f.bottom) / 2);
              if (d > 3.5 && d < 30 && sib.getBoundingClientRect().height < lineH(sib) * 1.9) add("icon-off-line", "ugly", k, `icon ${d.toFixed(1)}px off its text line`);
            }
          }
        }
      }
    }
    /* G. siblings that overlap */
    if (e.children.length >= 2 && !cs.display.includes("grid") && cs.position !== "absolute") {
      const kids = [...e.children].filter((k) => shown(k) && getComputedStyle(k).position !== "absolute" && getComputedStyle(k).position !== "fixed" && getComputedStyle(k).position !== "sticky");
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 3 && h > 3 && txt(kids[i]) && txt(kids[j]) && !kids[i].contains(kids[j]) && getComputedStyle(kids[i]).transform === "none") add("overlap", "broken", kids[i], `overlaps ${name(kids[j])} by ${Math.round(w)}x${Math.round(h)}`);
      }
    }
  }

  /* H. near-miss edges: same-class siblings whose left or top differ by a hair */
  const seen = new Set();
  for (const e of all) {
    if (e.children.length < 2) continue;
    const cs = getComputedStyle(e);
    const kids = [...e.children].filter((k) => shown(k) && getComputedStyle(k).position === "static" || getComputedStyle(k).position === "relative");
    const groups = {};
    for (const k of kids.filter(shown)) { const c = cls(k); if (c) (groups[c] ||= []).push(k); }
    for (const [c, ks] of Object.entries(groups)) {
      if (ks.length < 2) continue;
      const rs = ks.map((k) => k.getBoundingClientRect());
      const col = cs.display === "block" || (cs.display.includes("flex") && /^column/.test(cs.flexDirection));
      const row = cs.display.includes("grid") || (cs.display.includes("flex") && /^row/.test(cs.flexDirection));
      if (col) {
        const lefts = rs.map((r) => r.left), d = Math.max(...lefts) - Math.min(...lefts);
        if (d > 0.9 && d <= 12 && !seen.has(e)) { seen.add(e); add("left-edge-near-miss", "ugly", ks[0], `${ks.length} "${c}" siblings start ${d.toFixed(1)}px apart`); }
      }
      if (row) {
        const tops = rs.map((r) => r.top), d = Math.max(...tops) - Math.min(...tops);
        if (d > 0.9 && d <= 8 && !seen.has(e) && cs.alignItems !== "baseline" && cs.alignItems !== "center" && cs.alignItems !== "flex-end" && cs.alignItems !== "end") { seen.add(e); add("top-edge-near-miss", "ugly", ks[0], `${ks.length} "${c}" siblings top ${d.toFixed(1)}px apart (align-items:${cs.alignItems})`); }
      }
    }
  }

  /* I. spacing off the 4px grid on cards and containers (odd px, not 2px steps) */
  const odd = new Map();
  for (const e of all) {
    const cs = getComputedStyle(e);
    const boxed = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopWidth !== "0px";
    if (!boxed) continue;
    for (const p of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "rowGap", "columnGap"]) {
      const v = parseFloat(cs[p]);
      if (!isNaN(v) && v >= 5 && Math.abs(v - Math.round(v / 2) * 2) > 0.25) odd.set(`${p}:${v}`, (odd.get(`${p}:${v}`) || 0) + 1);
    }
  }
  if (odd.size) out.push({ kind: "odd-spacing", sev: "fragile", el: "(several)", detail: [...odd].map(([k, n]) => `${k}px x${n}`).slice(0, 6).join(", ") });

  /* H2. stacked blocks that should share one left and right edge but miss by a few px */
  const SEEN2 = new Set();
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (!(cs.display === "block" || cs.display === "flex" || cs.display === "grid") || (cs.display === "flex" && /^row/.test(cs.flexDirection)) || (cs.display === "grid" && cs.gridTemplateColumns.trim().split(/\s+/).length > 1)) continue;
    const kids = [...e.children].filter((k) => shown(k) && ["static", "relative"].includes(getComputedStyle(k).position) && getComputedStyle(k).display !== "inline");
    if (kids.length < 2) continue;
    const pr = e.getBoundingClientRect();
    const wide = kids.filter((k) => k.getBoundingClientRect().width >= pr.width * 0.6 && (txt(k) || k.querySelector("*")));
    if (wide.length < 2) continue;
    const L = wide.map((k) => k.getBoundingClientRect().left), R = wide.map((k) => k.getBoundingClientRect().right);
    const dl = Math.max(...L) - Math.min(...L), dr = Math.max(...R) - Math.min(...R);
    if (((dl > 1 && dl <= 24) || (dr > 1 && dr <= 24)) && !SEEN2.has(e)) {
      SEEN2.add(e);
      add("stack-edge-mismatch", "ugly", e, `${wide.length} stacked blocks: left edges differ ${dl.toFixed(0)}px, right edges ${dr.toFixed(0)}px [${wide.map((k) => (cls(k) || k.tagName.toLowerCase()) + "@" + Math.round(k.getBoundingClientRect().left) + "-" + Math.round(k.getBoundingClientRect().right)).join(" | ")}]`);
    }
  }

  /* J. a primary action below the fold in the viewport */
  const fold = window.innerHeight;
  for (const b of root.querySelectorAll(".btn--primary,.btn.primary,button.primary")) {
    if (!shown(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.top > fold) out.push({ kind: "primary-below-fold", sev: "info", el: name(b), detail: `top ${Math.round(r.top)} > ${fold}` });
  }
  return out;
};

const t = await open({ W: 1440, H: 900 });
const results = [];
let n = 0;
const stateOf = (s) => {
  const st = [{ label: "default", v: {} }];
  for (const v of s.variants) for (const o of v.opts) { const [val, l] = [o.split("=")[0], o.split("=").slice(1).join("=")]; if (val !== v.def) st.push({ label: `${v.key}=${val}`, v: { [v.key]: val }, human: `${v.key}: ${l}` }); }
  return st;
};
for (const s of list) {
  for (const sz of SIZES) {
    await t.p.setViewportSize({ width: sz.W, height: sz.H });
    t.S.theme = sz.theme; t.S.W = sz.W; t.S.H = sz.H;
    for (const st of stateOf(s)) {
      try {
        await t.go(s.id, st.v);
        const f = await t.p.evaluate(PROBE);
        const key = `${s.id}__${st.label.replace(/[^a-z0-9=_-]/gi, "_")}__${sz.theme}__${sz.W}x${sz.H}`;
        if (sz.keep || f.some((x) => x.sev !== "info")) await t.p.screenshot({ path: `./shots/a9/${key}.png` });
        results.push({ screen: s.id, state: st.label, human: st.human || "default", size: `${sz.W}x${sz.H}`, theme: sz.theme, findings: f });
        n++;
      } catch (e) {
        results.push({ screen: s.id, state: st.label, size: `${sz.W}x${sz.H}`, theme: sz.theme, error: String(e).slice(0, 200) });
      }
    }
  }
  console.log(s.id, "done", n);
  fs.writeFileSync("./shots/audit9.json", JSON.stringify({ errs: t.errs, results }, null, 1));
}
await t.b.close();
console.log("renders", n, "page errors", t.errs.length);
