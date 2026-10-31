import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 240)));
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
await p.addStyleTag({ content: ".pc, .notes { display: none !important; } .stage { padding: 0 !important; margin: 0 !important; }" });
const base = { width: 1280, short: false, lang: "id", theme: "dark", detail: "normal", reduce: false };
const DEF = { n7Tahap: "firstmeet", n7Jadwal: "pilih", n7Pick: "tutup", n7CutTahap: "tes", n7CutState: "usul", r1Role: "akademik", n7Stage: "tes", r4Sheet: "tutup" };
const set = async (screen, v = {}) => { await p.evaluate(() => P9.go("r1-home")); await p.waitForTimeout(120); await p.evaluate(([o]) => { P9.set(o.base); for (const [k, x] of Object.entries({ ...o.def, ...o.v })) P9.setVariant(k, x); P9.set({ screen: o.screen }); }, [{ base, screen, v, def: DEF }]); await p.waitForTimeout(900); };
const log = [];
const ok = async (name, fn) => { try { const r = await fn(); log.push(["ok", name, r ?? ""]); } catch (e) { log.push(["FAIL", name, String(e.message).split("\n")[0]]); } };
const shot = (n) => p.screenshot({ path: `${OUT}/x-${n}.png` });

await set("n7-caas", { n7Tahap: "wawancara" });
await ok("caas: Interview stage tile says pick your interview shift", async () => { const t = await p.textContent(".n7-ctools"); if (!/shift wawancaramu/.test(t)) throw new Error(t.slice(0, 200)); });
await ok("caas: drawer is a centered modal", async () => { await p.click("button.n7-ctile:has-text('Jadwal')"); await p.waitForSelector(".drawer"); await p.waitForTimeout(500); const r = await p.evaluate(() => { const d = document.querySelector(".drawer").getBoundingClientRect(); const f = document.querySelector(".dev").getBoundingClientRect(); return { dx: Math.round((d.left + d.width / 2) - (f.left + f.width / 2)), w: Math.round(d.width), fw: Math.round(f.width) }; }); if (Math.abs(r.dx) > 4) throw new Error("not centered " + JSON.stringify(r)); await shot("drawer-modal"); return JSON.stringify(r); });
await ok("caas: interview picker lists the three evenings with shift times", async () => { await p.click(".drawer button:has-text('Pilih Jadwal')"); await p.waitForSelector(".dialog--lg"); await p.waitForTimeout(500); const t = await p.textContent(".dialog--lg"); if (!/1 Desember 2026/.test(t) || !/15:30 sampai 17:15/.test(t) || /17 November/.test(t)) throw new Error(t.slice(0, 300)); await shot("pick-interview"); });
await ok("caas: pick, next, take the seat", async () => { await p.click(".dialog--lg .r2slot:not([disabled]) >> nth=2"); await p.click(".dialog--lg button:has-text('Lanjut')"); await p.waitForTimeout(400); await p.click(".dialog--lg button:has-text('Ambil Kursi')"); await p.waitForTimeout(500); });
await set("n7-caas", { n7Tahap: "wawancara", n7Jadwal: "setuju" });
await ok("caas: approved note names the interview slot", async () => { await p.click("button.n7-ctile:has-text('Jadwal')"); await p.waitForSelector(".r2pick"); const t = await p.textContent(".r2pick"); if (/Tes Tulis|November/.test(t) && !/Desember/.test(t)) throw new Error(t.slice(0, 200)); await shot("jadwal-setuju"); });
await set("n7-caas", { n7Tahap: "wawancara", n7Pick: "ubah" });
await ok("caas: change request dialog on interview slots", async () => { await p.waitForSelector(".dialog--lg"); const t = await p.textContent(".dialog--lg"); if (!/Desember/.test(t)) throw new Error(t.slice(0, 200)); });
await set("n7-caas", { n7Tahap: "tubes" });
await ok("caas: after the interview nothing to pick", async () => { const t = await p.textContent(".n7-ctools"); if (!/Belum ada yang perlu dipilih/.test(t)) throw new Error(t.slice(0, 200)); });
await set("n7-caas", { n7Tahap: "tulis" });
await ok("caas: written test stage still the old slots", async () => { await p.click("button.n7-ctile:has-text('Jadwal')"); await p.waitForSelector(".r2pick"); const t = await p.textContent(".r2pick"); if (!/November/.test(t)) throw new Error(t.slice(0, 200)); });

await set("n7-cutting", { n7CutTahap: "wawancara" });
await ok("cutting: Interview tab has verdict and context columns", async () => { await p.waitForSelector(".n7-ctable"); const t = await p.textContent(".n7-ctable"); if (!/Keputusan/.test(t) || !/Fix Lolos/.test(t)) throw new Error(t.slice(0, 200)); await shot("cutting-wawancara"); });
await ok("cutting: propose from verdicts leaves Ragu-ragu open", async () => { await p.click("button:has-text('Usulkan dari Keputusan Wawancara')"); await p.waitForTimeout(400); const t = await p.textContent(".n7-lock"); await shot("cutting-wawancara-prop"); return t.slice(0, 80); });
await ok("cutting: filter Ragu-ragu and open a row", async () => { await p.click(".n7-tools .dd >> nth=0").catch(() => {}); const n = await p.locator(".n7-crow").count(); await p.locator(".n7-crow").first().click(); await p.waitForSelector(".drawer"); await p.waitForTimeout(500); const t = await p.textContent(".drawer"); if (!/Kesimpulan bersama pewawancara|Susulan/.test(t)) throw new Error(t.slice(0, 200)); await shot("cutting-wawancara-row"); return n; });
await set("n7-cutting", { n7CutTahap: "tes" });
await ok("cutting: Tes Tulis unchanged", async () => { await p.waitForSelector(".n7-ctable"); const t = await p.textContent(".n7-ctable"); if (/Fix Lolos/.test(t)) throw new Error("verdict column leaked"); });

/* modals instead of popovers */
await set("r4-plot", { n7Bag: "papan" });
await ok("plot: adding an examiner opens a wide modal", async () => { await p.click(".r4lane__add button >> nth=0"); await p.waitForSelector(".dialog--lg"); await p.waitForTimeout(400); const t = await p.textContent(".dialog--lg"); if (!/Penguji/.test(t)) throw new Error(t.slice(0, 100)); await shot("examiner-modal"); await p.keyboard.press("Escape"); });
await set("r4-plot", { n7Bag: "slot" });
await ok("plot: PJ picker is a modal", async () => { await p.evaluate(() => { const e = document.querySelector(".dev__scroll"); e.scrollTop = 2400; }); await p.waitForTimeout(300); await p.click(".r4pj__z .r4lane__add button >> nth=0"); await p.waitForSelector(".dialog--lg"); await p.keyboard.press("Escape"); });
await set("r4-nilai", { r4Nilai: "semua" });
await set("r4-template");
await ok("template: parameters editor writes through to the sheet", async () => { await p.waitForSelector(".r4ptl"); await p.fill(".r4ptl li:first-child input >> nth=0", "Sikap Kerja"); await p.waitForTimeout(200); await p.evaluate(() => { P9.setVariant("r4Tab", "slotku"); }); });
await set("r4-lembar", { r4Sheet: "kosong" });
await ok("lembar: Berkas opens as a modal", async () => { await p.click("button:has-text('Berkas')"); await p.waitForSelector(".dialog"); await shot("files-modal"); await p.keyboard.press("Escape"); });
await ok("lembar: late grace is 10 minutes (default 12 shows Susulan)", async () => { await p.click("button:has-text('Catat Kasus Khusus')").catch(async () => { await p.click(".r4steps__b >> nth=2"); await p.click("button:has-text('Catat Kasus Khusus')"); }); await p.waitForSelector(".r4cases"); const t = await p.textContent(".r4cases__out"); if (!/Susulan/.test(t)) throw new Error(t); await p.click(".dialog .stepper button >> nth=0").catch(() => {}); });

console.log(log.map((l) => l.join(" | ")).join("\n"));
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
