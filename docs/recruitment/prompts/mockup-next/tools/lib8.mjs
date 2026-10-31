import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
export const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
export const OUT = "./shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
export const DEF = { n7Tahap: "firstmeet", n7Jadwal: "pilih", n7Hasil: "lolos", r1Caas: "disetujui", n7Akhir: "jalan", n7Fase: "tutup", n7Keadaan: "bebas", n7Pick: "tutup", n7Kabut: "ya", r5Topik: "terbit", r5Checkin: "buka", r5Kumpul: "sebagian", r5Giliran: "terbit", r1Viewer: "praktikan" };
export const open = async (o = {}) => {
  const W = o.W || 1440, H = o.H || 900;
  const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 300)));
  await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 90000 });
  await p.addStyleTag({ content: ".pc, .notes { display: none !important; } .stage { padding: 0 !important; margin: 0 !important; }" });
  const S = { theme: o.theme || "dark", W, H, reduce: true };
  const go = async (screen, v = {}) => {
    await p.evaluate(() => P9.go("r1-home")); await p.waitForTimeout(100);
    await p.evaluate(([x]) => { P9.set(x.base); for (const [k, y] of Object.entries({ ...x.def, ...x.v })) P9.setVariant(k, y); P9.set({ screen: x.screen }); }, [{ base: { width: 1280, short: S.H < 800, lang: "id", theme: S.theme, detail: "normal", reduce: S.reduce }, v, def: o.noDef ? {} : DEF, screen }]);
    await p.waitForTimeout(o.wait || 500);
  };
  const txt = () => p.evaluate(() => document.querySelector(".dev__scroll")?.innerText.replace(/\s+/g, " ") || "");
  const all = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const click = async (re, scope = "button, a") => { const r = await p.evaluate(([re, scope]) => { const e = [...document.querySelectorAll(scope)].filter((x) => x.offsetParent !== null).find((x) => new RegExp(re).test((x.innerText || x.getAttribute("aria-label") || "").trim())); if (e) { e.click(); return true; } return false; }, [re, scope]); await p.waitForTimeout(350); return r; };
  const has = async (...s) => { const t = (await all()).toLowerCase(); return s.every((x) => t.includes(x.toLowerCase())); };
  return { b, p, errs, go, txt, all, shot, click, has, S };
};
export const elShot = async (p, sel, name, pad = 0) => {
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await el.screenshot({ path: `${OUT}/${name}.png` });
};
