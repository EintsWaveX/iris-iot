import { open } from "./lib.mjs";
import fs from "node:fs";
const W = +(process.argv[2] || 390);
const { b, p, errs } = await open(W + 40, 900);
const list = await p.evaluate(() => P9.screens.map((s) => [s.id, (s.variants || []).map((v) => [v.key, v.options.map((o) => o.v)])]));
const probe = () => {
  const fr = document.querySelector(".dev__frame") || document.querySelector(".dev__scroll");
  const sc = document.querySelector(".dev__scroll");
  const app = document.querySelector(".app") || sc;
  const aw = app.getBoundingClientRect();
  const lim = Math.round(aw.right) + 1;
  const off = [];
  const scrollable = (e) => { for (let x = e.parentElement; x && x !== app; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden") && x.scrollWidth > x.clientWidth) return true; if (o === "hidden" && x.clientWidth <= aw.width) { if (x.getBoundingClientRect().right <= lim) return true; } } return false; };
  for (const e of document.querySelectorAll(".app *, .dialog *, .drawer *, .sheet *")) {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(e); if (cs.position === "fixed" && false) continue;
    if (r.right > lim + 1 && !scrollable(e)) off.push((e.className && String(e.className).slice(0, 30)) + ":" + e.tagName + ":" + Math.round(r.right - lim) + ":" + (e.textContent || "").trim().slice(0, 18));
  }
  return { sw: app.scrollWidth, cw: app.clientWidth, n: off.length, off: off.slice(0, 4) };
};
const res = [];
for (const [id, vars] of list) {
  await p.evaluate(([id, W]) => P9.set({ screen: id, width: W, short: false, lang: "id", theme: "dark", reduce: true }), [id, W]);
  await p.waitForTimeout(350);
  const r = await p.evaluate(probe);
  res.push([id, "", r]);
  if (r.n || r.sw > r.cw + 1) console.log("OFF", id, JSON.stringify(r));
}
console.log("screens done");
fs.writeFileSync(`phone-${W}.json`, JSON.stringify(res));
console.log("errs", errs.length, errs.slice(0, 3).join("|"));
await b.close();
