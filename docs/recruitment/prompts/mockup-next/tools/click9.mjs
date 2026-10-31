import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ viewport: { width: 1700, height: 1100 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 240)));
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
await p.addStyleTag({ content: ".pc, .notes { display: none !important; } .stage { padding: 0 !important; margin: 0 !important; }" });
const base = { width: 1440, short: false, lang: "id", theme: "dark", detail: "normal", reduce: false };
const DEF = { n7Bagian: "fitb", r3Bank: "daftar", n7Malam: "persiapan", r3Hand: "tidak", r3Lp: "hotspot", n7Tahap: "firstmeet", n7Jadwal: "pilih", n7Hasil: "lolos", r1Caas: "disetujui", n7Win: "belum", n7Auto: "sebelum" };
const set = async (screen, v = {}) => { await p.evaluate(() => P9.go("r1-home")); await p.waitForTimeout(120); await p.evaluate(([o]) => { P9.set(o.base); for (const [k, x] of Object.entries({ ...o.def, ...o.v })) P9.setVariant(k, x); P9.set({ screen: o.screen }); }, [{ base, screen, v, def: DEF }]); };
const log = [];
const ok = async (name, fn) => { try { const r = await fn(); log.push(["ok", name, r ?? ""]); } catch (e) { log.push(["FAIL", name, String(e.message).split("\n")[0]]); } };
const shot = (n) => p.screenshot({ path: `${OUT}/c9-${n}.png` });

/* ---- Bank */
await set("n7-bank"); await p.waitForTimeout(800);
await ok("bank: tabs include Live Coding and Pengaturan", async () => (await p.textContent(".n7-bank__top")).includes("Pengaturan") && (await p.textContent(".n7-bank__top")).includes("Live Coding"));
await ok("bank: pool meters + real list", async () => { await p.waitForSelector(".r3pool"); await p.waitForSelector("table.r3qtab"); });
await ok("bank: Tambah Soal opens the real editor with 7 formats", async () => { await p.click("button:has-text('Tambah Soal')"); await p.waitForSelector(".r3fmts"); return await p.locator(".r3fmt").count(); });
await ok("bank: editor shows candidate preview", async () => { await p.waitForSelector(".r3bed__prev"); await shot("bank-editor"); });
await set("n7-bank", { r3Bank: "kunci" }); await p.waitForTimeout(700);
await ok("bank: shown question locks + Perbaiki Kunci dialog", async () => { await p.waitForSelector(".r3locknote"); await p.waitForTimeout(600); await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => /Perbaiki Kunci/.test(e.innerText)).click()); await p.waitForSelector("text=Simpan Kunci"); await p.keyboard.press("Escape"); });
await ok("bank: Batalkan Soal needs the hold", async () => { await p.waitForTimeout(400); await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => /Batalkan Soal/.test(e.innerText)).click()); await p.waitForSelector("text=Tahan untuk Membatalkan"); await p.keyboard.press("Escape"); });
await set("n7-bank", { r3Bank: "berjalan" }); await p.waitForTimeout(600);
await ok("bank: running room blocks Simpan", async () => { await p.waitForSelector("text=sedang berjalan"); });
await set("n7-bank"); await p.waitForTimeout(600);
await ok("bank: Impor via menu runs dry run", async () => { await p.click("button[aria-label*='Impor']"); await p.click("button:has-text('Impor') >> nth=1"); await p.waitForSelector("text=Dilewati"); await p.keyboard.press("Escape"); });
await ok("bank: Pengaturan tab", async () => { await p.click("[role=tab]:has-text('Pengaturan')"); await p.waitForSelector(".r3cfg"); });
await ok("bank: Live Coding tab", async () => { await p.click("[role=tab]:has-text('Live Coding')"); await p.waitForSelector(".r3lct"); });

/* ---- Malam */
await set("n7-malam", { n7Malam: "persiapan" }); await p.waitForTimeout(900);
await ok("malam: Pengawas row opens Atur Ruang on its tab, with practice switch", async () => { await p.click("button.n7-task:has-text('Pengawas')"); await p.waitForSelector(".n7-practice"); await p.keyboard.press("Escape"); });
await ok("malam: kit drawer = real loan list, fills readiness", async () => { await p.click("button.n7-task:has-text('Kit')"); await p.waitForSelector(".r3kits"); for (let i = 0; i < 12; i++) { const l = p.locator("button:has-text('Pinjamkan Kit')").first(); if (!(await l.count())) break; await l.click({ force: true }); await p.waitForTimeout(60); } await p.waitForTimeout(300); await shot("malam-kits"); await p.keyboard.press("Escape"); });
await set("n7-malam", { n7Malam: "berjalan" }); await p.waitForTimeout(900);
await ok("malam: Atur Ruang > Hotspot is the real one", async () => { await p.click("button:has-text('Atur Ruang')"); await p.click("[role=tab]:has-text('Hotspot')"); await p.waitForSelector(".r3hs"); await shot("malam-hotspot"); await p.keyboard.press("Escape"); });
await ok("malam: Selesai Lebih Awal asks for a reason", async () => { await p.click("button:has-text('Selesai Lebih Awal')"); await p.waitForSelector("text=Alasan (wajib)"); await p.keyboard.press("Escape"); });
for (const h of ["minta", "basi", "kosong"]) {
  await set("n7-malam", { n7Malam: "berjalan", r3Hand: h }); await p.waitForTimeout(700);
  await ok("malam: handover " + h, async () => { await p.waitForSelector(".r3hand"); });
}
await set("n7-malam", { n7Malam: "berjalan", n7Bagian: "lc" }); await p.waitForTimeout(800);
await ok("malam: Live Coding drawer (boards by hotspot, grading)", async () => { const nilai = p.locator("button:has-text('Penilaian Live Coding')").first(); await nilai.click({ timeout: 3000 }); await p.waitForTimeout(300); await p.waitForFunction(() => [...document.querySelectorAll(".drawer")].some((e) => /Papan per Hotspot/.test(e.innerText) && /Butuh/i.test(e.innerText)), null, { timeout: 10000 }); await shot("malam-lc"); });

/* ---- Plot */
await set("n7-plot"); await p.waitForTimeout(800);
await ok("plot: Papan = real drag board", async () => { await p.click("[role=tab]:has-text('Papan')"); await p.waitForSelector(".r2board, [data-dnd], .r2pool", { timeout: 4000 }); await shot("plot-board"); });
await ok("plot: Permintaan = real requests", async () => { await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((e) => /Permintaan/.test(e.innerText)).click()); await p.waitForTimeout(900); await p.waitForFunction(() => /Setujui/.test(document.querySelector(".n7-plot")?.innerText || ""), null, { timeout: 10000 }); });
/* ---- Cutting */
await set("n7-cutting"); await p.waitForTimeout(800);
await ok("cutting: Berkas stage has Usulkan dari Status Berkas", async () => { await p.click("[role=tab]:has-text('Berkas')"); await p.waitForSelector("button:has-text('Usulkan dari Status Berkas')"); });
/* ---- CaAs */
await set("n7-caas", { n7Tahap: "wawancara", n7Jadwal: "pilih" }); await p.waitForTimeout(900);
await ok("caas: Amplop drawer lists envelopes", async () => { await p.click("button.n7-ctile:has-text('Amplop')"); await p.waitForSelector(".drawer button:has-text('Buka Amplop')"); });
await ok("caas: Buka Amplop mounts the real scene (drag or hold)", async () => { await p.evaluate(() => [...document.querySelectorAll(".drawer button")].find((e) => /Buka Amplop/.test(e.innerText)).click()); await p.waitForSelector(".r2stage, .r2res, [class*=r2stage]", { timeout: 4000 }); await p.waitForTimeout(600); await shot("caas-envelope"); });
await set("n7-caas", { n7Tahap: "tulis", n7Jadwal: "pilih" }); await p.waitForTimeout(700);
await ok("caas: Jadwalku opens the real picker (3 evenings, live seats)", async () => { await p.waitForTimeout(500); await p.evaluate(() => [...document.querySelectorAll("button.n7-ctile")].find((e) => /Jadwal/.test(e.innerText)).click()); await p.waitForFunction(() => [...document.querySelectorAll(".drawer button")].some((e) => e.innerText.trim() === "Pilih Jadwal"), null, { timeout: 8000 }); await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => e.innerText.trim() === "Pilih Jadwal").click()); await p.waitForSelector(".dialog--lg"); await p.waitForTimeout(600); await shot("caas-picker"); });
for (const st of ["terpilih", "minta", "setuju", "tolak", "h1"]) { await set("n7-caas", { n7Tahap: "tulis", n7Jadwal: st }); await p.waitForTimeout(500); await ok("caas: Jadwalku state " + st, async () => { await p.click("button.n7-ctile:has-text('Jadwal')"); await p.waitForSelector(".r2pick"); await p.keyboard.press("Escape"); }); }
await set("n7-caas", { n7Tahap: "gagal" }); await p.waitForTimeout(700);
await ok("caas: Tidak lolos shows the thank-you card", async () => { await p.waitForSelector(".r2thanks"); await shot("caas-gagal"); });
for (const st of ["tamu", "tutup", "buka", "menunggu", "revisi"]) { await set("n7-caas", { r1Caas: st }); await p.waitForTimeout(450); await ok("caas: pre-approval state " + st, async () => { await p.waitForSelector(".page"); const t = await p.textContent(".dev__scroll"); return t.length; }); }
console.log(log.map((l) => l.join(" | ")).join("\n"));
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
