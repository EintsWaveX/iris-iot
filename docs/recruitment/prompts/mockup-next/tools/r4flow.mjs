import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const OUT = process.argv[2];
const W = Number(process.argv[3] || 1440), H = Number(process.argv[4] || 900);
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 240)));
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
await p.addStyleTag({ content: ".pc, .notes { display: none !important; } .stage { padding: 0 !important; margin: 0 !important; }" });
const base = { width: Number(process.env.DW || 1280), short: H < 800, lang: process.env.LANGV || "id", theme: process.env.THEME || "dark", detail: "normal", reduce: false };
const DEF = { r4Sheet: "tutup", r4Kasus: "biasa", r4Nilai: "semua", r4Tab: "slotku", n7Stage: "tes", n7Bag: "slot", n7Auto: "sebelum", n7Win: "belum", r1Role: "akademik" };
const set = async (screen, v = {}) => { await p.evaluate(() => P9.go("r1-home")); await p.waitForTimeout(120); await p.evaluate(([o]) => { P9.set(o.base); for (const [k, x] of Object.entries({ ...o.def, ...o.v })) P9.setVariant(k, x); P9.set({ screen: o.screen }); }, [{ base, screen, v, def: DEF }]); await p.waitForTimeout(900); };
const log = [];
const ok = async (name, fn) => { try { const r = await fn(); log.push(["ok", name, r ?? ""]); } catch (e) { log.push(["FAIL", name, String(e.message).split("\n")[0]]); } };
const shot = (n) => p.screenshot({ path: `${OUT}/f-${n}-${process.env.TAG || ""}${W}x${H}.png` });
const scrollDev = (y) => p.evaluate((yy) => { const e = document.querySelector(".dev__scroll"); if (e) e.scrollTop = yy; }, y);

/* ---- Plotting, Wawancara stage */
await set("r4-plot");
await ok("plot: stage dropdown says Tes Wawancara and slot tab has crew + PJ", async () => { const t = await p.textContent(".dev__scroll"); if (!/Susunan Tiap Shift/.test(t) || !/PJ Tiap Shift/.test(t)) throw new Error("missing crew or PJ cards"); await scrollDev(900); await p.waitForTimeout(300); await shot("plot-slot-crew"); });
await set("r4-plot", { n7Bag: "papan" });
await ok("plot: Papan has examiner rows, pair numbers and Periksa Papan", async () => {
  await p.waitForSelector(".r4lane"); const n = await p.locator(".r4lane").count(); const pairs = await p.locator(".r4ex[data-b]").count();
  const flags = await p.textContent(".r4check"); await shot("plot-board"); return `${n} lanes, ${pairs} pair marks; ` + flags.slice(0, 160);
});
await ok("plot: Periksa Papan lists GAN double booking, short roster, PJ", async () => { const t = await p.textContent(".r4check"); if (!/GAN/.test(t)) throw new Error("no GAN clash: " + t.slice(0, 200)); return t.length; });
await ok("plot: Lihat scrolls to a column", async () => { await p.click(".r4check__list li button >> nth=0"); await p.waitForTimeout(500); await shot("plot-lihat"); });
await set("r4-plot", { n7Bag: "minta" });
await ok("plot: Permintaan uses the interview slots", async () => { await p.waitForFunction(() => /Setujui/.test(document.querySelector(".dev__scroll")?.innerText || ""), null, { timeout: 8000 }); const t = await p.textContent(".dev__scroll"); if (!/TULT 060/.test(t)) throw new Error("no room names"); await shot("plot-minta"); });
await set("n7-plot");
await ok("plot: Tes Tulis stage still its own board", async () => { await p.click("[role=tab]:has-text('Papan')"); await p.waitForTimeout(700); const n = await p.locator(".r4lane").count(); if (n) throw new Error("examiner lanes leaked into Tes Tulis"); });

/* ---- Slotku */
await set("r4-slotku");
await ok("slotku: live card, standby or next, PJ card", async () => { const t = await p.textContent(".dev__scroll"); if (!/Buka Lembar/.test(t)) throw new Error("no open sheet button"); await shot("slotku"); await scrollDev(700); await p.waitForTimeout(200); await shot("slotku-2"); return t.match(/Kamu mewawancarai[^.]*\./)?.[0]; });
await set("r4-slotku", { r1Role: "acara" });
await ok("slotku: GMW (acara) sees own shifts", async () => { const t = await p.textContent(".dev__scroll"); if (!/GMW|Buka Lembar/.test(t)) throw new Error("no GMW view"); });

/* ---- Lembar */
const open = async (v) => { await set("r4-lembar", v); await p.waitForSelector(".r4sheet", { timeout: 6000 }); await p.waitForTimeout(500); };
await open({ r4Sheet: "kosong" });
await ok("lembar: new sheet, question 1, rail, foot has Next", async () => { const n = await p.locator(".r4rail__b").count(); await shot("lembar-new"); const foot = await p.textContent(".drawer__foot"); if (!/Berikutnya/.test(foot)) throw new Error("no Berikutnya in foot: " + foot); return n + " cards"; });
await ok("lembar: Next moves the question", async () => { await p.click(".drawer__foot button:has-text('Berikutnya')"); await p.waitForTimeout(300); const t = await p.textContent(".r4qc__t"); if (!/Kelebihan/.test(t)) throw new Error("did not move: " + t); });
await ok("lembar: typing an answer marks it done", async () => { await p.fill(".r4qc__a", "Contoh jawaban."); await p.waitForTimeout(200); const st = await p.getAttribute(".r4rail__b[aria-current=step]", "data-st"); if (st !== "done") throw new Error("state " + st); });
await ok("lembar: add own question card", async () => { await p.fill(".r4own input", "Apa proyek terakhirmu?"); await p.click(".r4own button"); await p.waitForTimeout(400); const t = await p.textContent(".r4rail"); if (!/Apa proyek terakhirmu/.test(t)) throw new Error("not added"); });
await ok("lembar: Berkas popover", async () => { await p.click("button:has-text('Berkas')"); await p.waitForTimeout(300); await shot("lembar-files"); await p.keyboard.press("Escape"); });
await open({ r4Sheet: "isi", r4Kasus: "dua" });
await ok("lembar: special cards appear for First Meet and other lab", async () => { const t = await p.textContent(".r4rail"); if (!/khusus/i.test(t)) throw new Error("no khusus tag"); return (await p.locator(".r4rail__k").count()) + " special"; });
await ok("lembar: reveal card shows the scores only there", async () => { const idx = await p.evaluate(() => [...document.querySelectorAll(".r4rail__b")].findIndex((e) => /nilai sebenarnya/.test(e.innerText))); await p.locator(".r4rail__b").nth(idx).click(); await p.waitForTimeout(300); await p.click("button:has-text('Tampilkan Nilai Sebenarnya')"); await p.waitForTimeout(200); await shot("lembar-reveal"); });
await ok("lembar: step 2 shows five parameters with form indicators", async () => { await p.click(".r4steps__b >> nth=1"); await p.waitForTimeout(400); const n = await p.locator(".r4p").count(); await shot("lembar-simpul"); const t = await p.textContent(".r4par"); if (!/Disiplin waktu/.test(t)) throw new Error("no indicators"); return n; });
await ok("lembar: send with gaps rings and moves to first empty", async () => { await p.click(".r4steps__b >> nth=2"); await p.waitForTimeout(300); await p.click(".drawer__foot button:has-text('Kirim Lembar')"); await p.waitForTimeout(500); const cur = await p.getAttribute(".r4steps__b[aria-selected=true]", "role"); const t = await p.textContent(".drawer__foot"); await shot("lembar-gap"); return t.slice(-40); });
await open({ r4Sheet: "lengkap" });
await ok("lembar: complete sheet goes to Keputusan and sends", async () => { await p.click(".r4steps__b >> nth=2"); await p.waitForTimeout(300); await shot("lembar-putus"); await p.click(".drawer__foot button:has-text('Kirim Lembar')"); await p.waitForTimeout(700); const t = await p.textContent(".r4sheet"); if (!/terkirim/i.test(t) || !/Video komitmen/.test(t)) throw new Error("no sent view: " + t.slice(0, 120)); await shot("lembar-sent"); });
await ok("lembar: video komitmen asks about class, then sends the deadline", async () => { await p.click(".r4yn__b >> nth=1"); await p.waitForTimeout(200); await p.click(".r4yn__b >> nth=0"); await p.waitForTimeout(200); await p.click("button:has-text('Beri Tahu CaAs')"); await p.waitForTimeout(300); const t = await p.textContent(".r4vid"); if (!/Terkirim/.test(t)) throw new Error("not sent"); });
await open({ r4Sheet: "kasus" });
await ok("lembar: special case dialog opens with rules", async () => { await p.waitForSelector(".dialog", { timeout: 4000 }); await shot("lembar-kasus"); await p.click(".r4cases__b >> nth=1"); await p.waitForTimeout(200); await p.click(".r4cases__b >> nth=0"); await p.waitForTimeout(200); await p.click("button:has-text('Catat')"); await p.waitForTimeout(700); await shot("lembar-kasus-out"); });
await open({ r4Sheet: "putus" });
await ok("lembar: no-signal draft state", async () => { const t = await p.textContent(".drawer__foot"); if (!/Sinyal putus/.test(t)) throw new Error(t); });
await open({ r4Sheet: "ubah" });
await ok("lembar: edit a sent sheet", async () => { const t = await p.textContent(".drawer__foot"); if (!/Simpan Perubahan/.test(t) || !/Tarik Lembar/.test(t)) throw new Error(t); });

/* ---- Penilaian + template */
await set("r4-nilai");
await ok("nilai: tally, verdict column, per-examiner", async () => { const t = await p.textContent(".dev__scroll"); if (!/Ragu-ragu/.test(t) || !/Keputusan/.test(t) || !/Rata-Rata per Penguji/.test(t)) throw new Error("missing"); await shot("nilai"); });
await set("r4-nilai", { r4Nilai: "baris" });
await ok("nilai: details show shared conclusion", async () => { const t = await p.textContent(".r4bd"); if (!/Kesimpulan bersama/.test(t)) throw new Error("no conclusion col"); await shot("nilai-rincian"); });
await set("r4-nilai", { r1Role: "acara" });
await ok("nilai: acara sees own sheets only", async () => { const t = await p.textContent(".dev__scroll"); if (!/Kamu melihat lembarmu sendiri/.test(t)) throw new Error("no notice"); });
await set("r4-template");
await ok("template: list, edit a row, add", async () => { await p.waitForSelector(".r4tpl"); await p.click(".r4tpl__a button[aria-label='Ubah'] >> nth=2"); await p.waitForTimeout(300); await shot("template"); await p.click("button:has-text('Tambah Pertanyaan')"); await p.waitForTimeout(300); const n = await p.locator(".r4tpl__r").count(); return n + " rows"; });

console.log(log.map((l) => l.join(" | ")).join("\n"));
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
