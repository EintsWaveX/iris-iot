import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ viewport: { width: 1700, height: 1100 } })).newPage();
let errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
const list = await p.evaluate(() => P9.screens.map((s) => [s.id, s.group, s.title, (s.variants || []).map((v) => [v.key, v.options.map((o) => o.v)])]));
console.log("picker:", list.map((x) => `${x[1]} ${x[0]}`).join(" | "));
let bad = 0;
for (const [id, g, t, vars] of list) {
  for (const theme of ["dark", "light"]) {
    errs = [];
    await p.evaluate(([id, theme]) => P9.set({ screen: id, width: 1440, short: false, lang: "id", theme, detail: "normal", reduce: true }), [id, theme]);
    await p.waitForTimeout(450);
    const n = await p.evaluate(() => document.querySelector(".dev__scroll")?.innerText.length || 0);
    if (errs.length || n < 40) { bad++; console.log("BAD", id, theme, n, errs.join(" || ")); }
  }
  // every variant option once (dark)
  for (const [key, opts] of vars) for (const o of opts) {
    errs = [];
    await p.evaluate(([id, key, o]) => { P9.set({ screen: id, width: 1440, theme: "dark", reduce: true }); P9.setVariant(key, o); }, [id, key, o]);
    await p.waitForTimeout(350);
    const n = await p.evaluate(() => document.querySelector(".dev__scroll")?.innerText.length || 0);
    if (errs.length || n < 40) { bad++; console.log("BAD variant", id, key, o, n, errs.join(" || ")); }
    await p.evaluate(([key, d]) => P9.setVariant(key, d), [key, vars.find((v) => v[0] === key)[1][0]]);
  }
}
/* M8: the aliases of the retired screens are gone; check they are really not registered */
const gone = ["r1-daftar", "r1-caas", "r2-caas", "r2-jadwal", "r2-amplop", "r2-cutting", "r2-plot", "r3-konsol", "r3-ruang", "r3-lcpanel", "r3-bank"];
const still = await p.evaluate((g) => g.filter((id) => P9.screens.some((s) => s.id === id) || (P9.ALIAS && P9.ALIAS[id]) || P9.OLD), gone);
if (still.length) { bad++; console.log("BAD retired still present", still); } else console.log("retired screens gone: ok");
console.log("bad:", bad);
await b.close();
