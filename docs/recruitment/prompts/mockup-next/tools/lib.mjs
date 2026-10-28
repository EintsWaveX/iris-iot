import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
export const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
export const SP = process.env.SP || ".";
export async function open(vw = 1700, vh = 1100) {
  const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const p = await (await b.newContext({ viewport: { width: vw, height: vh } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 200)));
  for (let i = 0; i < 3; i++) {
    try {
      await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 40000 });
      break;
    } catch (e) { if (i == 2) throw e; }
  }
  return { b, p, errs };
}
