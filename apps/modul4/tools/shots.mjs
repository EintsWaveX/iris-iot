/* Screenshot and layout-audit harness for the hunt scoreboard.

   Drives a running hunt (python server.py --token UJICOBA, with
   tools/fake_hunt.py --jalur --bot --token UJICOBA running so there is a
   session, a roster and live data) in Chromium and, for every scene at every
   width, saves a PNG and lists what is wrong with the layout.

     node tools/shots.mjs --out <dir> [--base http://127.0.0.1:8080]
        [--token UJICOBA] [--widths 360,390,820,1024,1280x720,1280,1680]
        [--langs id] [--themes dark] [--scenes join,reveal,...] [--nim D0301]

   The audit per shot flags: elements wider than the screen, clipped text
   (ellipsis or overflow:hidden that really cuts something), touch targets
   under 44px on touch widths, buttons and links with no name, and text under
   12px. Output: <out>/audit.json plus a one-line-per-finding audit.txt.

   Playwright comes from a sibling project (it is not a dependency of this
   app): set PLAYWRIGHT_CORE to the playwright-core folder and CHROMIUM to the
   browser if the defaults below are not where yours are. */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg("base", "http://127.0.0.1:8080");
const OUT = arg("out", "shots");
const TOKEN = arg("token", "UJICOBA");
const NIM = arg("nim", "D0301"); // a member of group 3 who is not the fake player
const LANGS = arg("langs", "id").split(",");
const THEMES = arg("themes", "dark").split(","); // dark | light | sun
const SCENES = arg("scenes", "join,reveal,roles,hunt,display,team,layers,results,mission,stage").split(",");

// width or WxH; phones and tablets are touch devices
const SIZES = arg("widths", "360,390,820,1024,1280x720,1280,1680")
  .split(",")
  .map((s) => {
    const [w, h] = s.split("x").map(Number);
    const dflt = w <= 390 ? 800 : w <= 820 ? 1180 : w <= 1024 ? 768 : 900;
    return { w, h: h || dflt, touch: w <= 820 };
  });

const CORE =
  process.env.PLAYWRIGHT_CORE ||
  path.join(homedir(), "Documents", "WebApps", "DMagis", "node_modules", "playwright-core");
const CHROMIUM =
  process.env.CHROMIUM ||
  path.join(homedir(), "AppData", "Local", "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const { chromium } = createRequire(import.meta.url)(CORE);

const ringkas = await (await fetch(BASE + "/ringkas.json")).json().catch(() => null);
if (!ringkas || !ringkas.kode) throw new Error(`no hunt answering at ${BASE} (is the server up with a session?)`);
const KODE = ringkas.kode;

mkdirSync(OUT, { recursive: true });
const audit = [];

/* what to look for, run inside the page */
const AUDIT = () => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const root = document.querySelector(".huntapp") || document.body;
  const label = (el) =>
    (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + [...el.classList].slice(0, 3).join(".")).slice(0, 70) +
    (el.textContent.trim() ? ` "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 28)}"` : "");
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.right > vw + 1 && !el.closest("[data-scroll-x], .htabs, .hbottom")) out.push(["wide", label(el), `right=${Math.round(r.right)} vw=${vw}`]);
    if ((s.textOverflow === "ellipsis" || s.overflow === "hidden") && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim())
      out.push(["clipped", label(el), `${el.scrollWidth}>${el.clientWidth}`]);
    const fs = parseFloat(s.fontSize);
    if (fs < 12 && el.children.length === 0 && el.textContent.trim() && !(el instanceof SVGElement)) out.push(["tiny", label(el), `${fs}px`]);
    if (el.matches("button, a[href], [role=button], [role=tab], input, .rolecard")) {
      if ((r.width < 44 || r.height < 44) && !el.closest(".tips, .toast") && !(el.closest("label") && el.closest("label").getBoundingClientRect().height >= 44)) out.push(["target", label(el), `${Math.round(r.width)}x${Math.round(r.height)}`]);
      const name = el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("title");
      if (!name) out.push(["noname", label(el), ""]);
    }
  }
  return out.slice(0, 60);
};

const sizeName = (z) => `${z.w}x${z.h}`;

async function shoot(page, scene, lang, theme, z) {
  const file = `${scene}-${lang}-${theme}-${sizeName(z)}.png`;
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  const found = await page.evaluate(AUDIT).catch((e) => [["audit-error", String(e), ""]]);
  for (const [kind, who, info] of found) {
    if (kind === "target" && !z.touch) continue;
    audit.push({ scene, lang, theme, size: sizeName(z), kind, who, info });
  }
  return file;
}

const ui = (lang, theme) => JSON.stringify({ lang, theme: theme === "light" ? "light" : "dark", sun: theme === "sun", sound: false, vib: false, zhW: "700" });

async function open(browser, z, lang, theme, { nim, token, stage } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: z.w, height: z.h },
    deviceScaleFactor: 1,
    hasTouch: z.touch,
    isMobile: z.w <= 430,
  });
  await ctx.addInitScript(
    ([ui, kode, nim, token]) => {
      try {
        localStorage.setItem("iris_hunt_ui", ui);
        localStorage.setItem("iris_hunt_kode", kode);
        if (nim) localStorage.setItem("iris_hunt_nim", nim);
        if (token) localStorage.setItem("iris_hunt_token", token);
      } catch (e) {}
    },
    [ui(lang, theme), KODE, nim || "", token || ""],
  );
  const page = await ctx.newPage();
  const q = `?lang=${lang}${stage ? "&stage=1" : ""}`;
  await page.goto(`${BASE}/${q}#k=${KODE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".huntapp", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const tryClick = async (page, sel, ms = 3000) => {
  try {
    await page.locator(sel).first().click({ timeout: ms });
    await page.waitForTimeout(600);
    return true;
  } catch (e) {
    return false;
  }
};

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const done = [];
for (const lang of LANGS)
  for (const theme of THEMES)
    for (const z of SIZES) {
      const want = (s) => SCENES.includes(s);

      if (["join", "reveal", "roles", "hunt", "display", "team", "layers", "results"].some(want)) {
        // one phone, start to finish: sign in with the NIM, see the group, pick a role, use the tabs
        const { ctx, page } = await open(browser, z, lang, theme);
        if (want("join")) done.push(await shoot(page, "join", lang, theme, z));
        await page.fill("#h-nim", NIM).catch(() => {});
        await tryClick(page, "form button[type=submit]");
        await page.waitForTimeout(900);
        if (want("reveal")) done.push(await shoot(page, "reveal", lang, theme, z));
        await tryClick(page, ".hreveal .btn--primary");
        if (want("roles")) done.push(await shoot(page, "roles", lang, theme, z));
        await tryClick(page, ".rolecard");
        await tryClick(page, ".hjoin > .btn--primary");
        await page.waitForTimeout(800);
        const goTab = async (hash) => {
          await page.evaluate((h) => (location.hash = h), hash);
          await page.waitForTimeout(700);
        };
        if (want("hunt")) {
          await goTab("#buru");
          done.push(await shoot(page, "hunt", lang, theme, z));
        }
        if (want("display")) {
          const opened = await tryClick(page, 'button[aria-label*="isplay" i], button[aria-label*="ampilan" i], button[aria-label*="显示" i]');
          if (opened) done.push(await shoot(page, "display", lang, theme, z));
          else audit.push({ scene: "display", lang, theme, size: sizeName(z), kind: "scene", who: "display button not found", info: "" });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
        }
        for (const [scene, hash] of [["team", "#tim"], ["layers", "#lapisan"], ["results", "#hasil"]])
          if (want(scene)) {
            await goTab(hash);
            done.push(await shoot(page, scene, lang, theme, z));
          }
        // the server remembers a member's role: give it back so the next run starts from the reveal
        await page.evaluate(() => window.H && window.H.timPeran && window.H.timPeran(null)).catch(() => {});
        await ctx.close();
      }

      if (want("mission")) {
        const { ctx, page } = await open(browser, z, lang, theme, { token: TOKEN });
        await page.evaluate(() => (location.hash = "#asisten"));
        await page.waitForTimeout(1200);
        done.push(await shoot(page, "mission", lang, theme, z));
        await ctx.close();
      }

      if (want("stage")) {
        const { ctx, page } = await open(browser, z, lang, theme, { stage: true });
        await page.waitForTimeout(1000);
        done.push(await shoot(page, "stage", lang, theme, z));
        await ctx.close();
      }
      console.log(`done ${lang} ${theme} ${sizeName(z)}`);
    }
await browser.close();

writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(audit, null, 1));
const byKind = {};
for (const a of audit) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
writeFileSync(
  path.join(OUT, "audit.txt"),
  audit.map((a) => `${a.scene}\t${a.lang}/${a.theme}\t${a.size}\t${a.kind}\t${a.who}\t${a.info}`).join("\n") + "\n",
);
console.log(`${done.length} screenshots in ${OUT}; findings:`, JSON.stringify(byKind));
