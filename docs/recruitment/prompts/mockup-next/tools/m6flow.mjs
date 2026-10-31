import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/favicon|net::ERR/.test(m.text()) && errs.push(m.text().slice(0, 300)));
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
await p.addStyleTag({ content: ".pc, .notes { display: none !important; } .stage { padding: 0 !important; margin: 0 !important; }" });
const DEF = { n7Tahap: "firstmeet", n7Jadwal: "pilih", n7Hasil: "lolos", r1Caas: "disetujui", n7Akhir: "jalan", n7Fase: "tutup", n7Keadaan: "bebas", n7Pick: "tutup", n7Kabut: "ya", n7Pick2: "", r5Topik: "terbit", r5Checkin: "buka", r5Kumpul: "sebagian", r5Giliran: "terbit", r1Viewer: "praktikan" };
let theme = "dark", W = 1440, H = 900, reduce = true;
const go = async (v = {}, screen = "n7-caas") => {
  await p.evaluate(() => P9.go("r1-home")); await p.waitForTimeout(100);
  await p.evaluate(([x]) => { P9.set(x.base); for (const [k, y] of Object.entries({ ...x.def, ...x.v })) P9.setVariant(k, y); P9.set({ screen: x.screen }); }, [{ base: { width: 1280, short: H < 800, lang: "id", theme, detail: "normal", reduce }, v, def: DEF, screen }]);
  await p.waitForTimeout(500);
};
const log = [];
let fails = 0;
const ok = async (name, fn) => { const e0 = errs.length; try { const r = await fn(); const bad = r === false; if (bad) fails++; log.push([bad ? "FAIL" : "ok", name, typeof r === "string" ? r : ""]); } catch (e) { fails++; log.push(["FAIL", name, String(e.message).split("\n")[0]]); } if (errs.length > e0) { fails++; log.push(["ERR", name, errs.slice(e0).join(" || ")]); } };
const txt = () => p.evaluate(() => document.querySelector(".dev__scroll")?.innerText.replace(/\s+/g, " ") || "");
const I = (t, s) => t.toLowerCase().includes(s.toLowerCase());
const has = async (...s) => { const t = await txt(); return s.every((x) => I(t, x)); };
const hasNot = async (...s) => { const t = await txt(); return s.every((x) => !I(t, x)); };
const shot = (n) => p.screenshot({ path: `${OUT}/m8-${theme}-${W}x${H}-${n}.png` });
const modalText = () => p.evaluate(() => [...document.querySelectorAll(".drawer, .dialog, .r2stage")].map((e) => e.innerText.replace(/\s+/g, " ")).join(" | "));
const esc = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(250); };
const click = async (sel, nth = 0) => { await p.locator(sel).nth(nth).click({ timeout: 4000 }); await p.waitForTimeout(350); };
const clickText = async (re) => { await p.evaluate((r) => [...document.querySelectorAll("button, a")].find((e) => new RegExp(r).test(e.innerText.trim()))?.click(), re); await p.waitForTimeout(350); };
/* hold the envelope until it opens (the hold works anywhere on the envelope) */
const holdOpen = async () => { const el = p.locator(".r2stage .r2env").first(); const bx = await el.boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(1500); await p.mouse.up(); await p.waitForTimeout(1800); };

const BASE = Date.now();
/* ---------------------------------------------------------------- A: one candidate walks the whole road with Naik Tahap */
await go({ r1Caas: "tamu" });
await ok("A tamu: public road, Google Form link, no fog", async () => { const t = await txt(); const href = await p.evaluate(() => [...document.querySelectorAll("a.btn")].map((a) => a.href).join(" ")); await shot("a1-tamu"); return I(t, "Jadi Asisten IRIS") && I(t, "Daftar lewat Google Form") && href.includes("forms.gle") && href.includes("line.me") && (await p.locator(".n7-journey .n7-star[data-hid=yes]").count()) === 0; });
await ok("A tamu: Agenda view of the public calendar", async () => { await clickText("^Agenda$"); const t = await txt(); await shot("a1-tamu-agenda"); await clickText("^Bulan$"); return /Open Recruitment|Pengumuman/.test(t); });
const walkTo = async (label, check) => { await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => /Naik Tahap/.test(e.innerText))?.click()); await p.waitForTimeout(1600); await ok(label, check); };
await walkTo("A -> buka: open, not applied, Google Form active", async () => { const t = await txt(); return I(t, "Pendaftaran lewat Google Form sampai Senin, 2 November 2026") && !(await p.locator("button[disabled]:has-text('Daftar lewat Google Form')").count()); });
await walkTo("A -> menunggu: waiting card, tools Berkasku and Mundur only", async () => { const t = await txt(); await shot("a2-menunggu"); return I(t, "Berkasmu menunggu verifikasi") && (await p.locator("button.n7-ctile").count()) === 2 && I(t, "Menunggu Verifikasi"); });
await walkTo("A -> berkas: journey starts, fog on, Berkasku locked", async () => { const t = await txt(); await shot("a3-berkas"); return I(t, "Berkasmu sedang diperiksa") && I(t, "Berikutnya") && I(t, "Pengumuman Seleksi Berkas") && I(t, "Terkunci"); });
await ok("A berkas: fog does not leak later stages", async () => hasNot("Wawancara", "Tubes", "Mengajar", "Tes Tulis dan Program"));
await walkTo("A -> firstmeet: arrives with the Berkas envelope SEALED (M8), the star waits", async () => { const t = await txt(); await shot("a4-firstmeet-sealed"); return I(t, "Ada amplop untukmu") && I(t, "Pengumuman Seleksi Berkas") && !I(t, "Pilih Malam Tes"); });
await ok("A firstmeet: open the Berkas envelope, then Berikutnya First Meet and the pick button", async () => { await clickText("^Buka Amplop$"); await p.waitForSelector(".r2stage"); await holdOpen(); await esc(); const t = await txt(); await shot("a4-firstmeet"); return I(t, "Hadir di First Meet") && I(t, "Pilih Malam Tes") && I(t, "Berikutnya First Meet"); });
await walkTo("A -> tulis: sealed Tes Tulis? no, Berkas opened; test night card", async () => { const t = await txt(); return I(t, "Tes malammu") && I(t, "Jadwalku"); });
await ok("A tulis: pick a slot end to end (Jadwalku, Pilih Jadwal, slot, confirm)", async () => {
  await click("button.n7-ctile:has-text('Jadwalku')"); await p.waitForSelector(".r2pick");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => e.innerText.trim() === "Pilih Jadwal").click()); await p.waitForSelector(".dialog--lg"); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector(".dialog--lg .r2slot:not([disabled])").click()); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll(".dialog--lg button")].find((e) => /Lanjut|Ambil|Pilih/.test(e.innerText) && !e.disabled)?.click()); await p.waitForTimeout(400);
  const m = await modalText(); await shot("a5-tulis-pick");
  return true;
});
await esc(); await esc(); await esc();
await go({ n7Tahap: "tulis", n7Jadwal: "terpilih" });
await ok("A tulis terpilih: Berikutnya becomes Tes Tulismu with the evening", async () => { const t = await txt(); await shot("a5b-tulis-terpilih"); return I(t, "Tes Tulismu") && I(t, "TULT"); });
await go({ n7Tahap: "wawancara" });
await ok("A wawancara: Tes Tulis envelope sealed first, then do-now", async () => { const t = await txt(); await shot("a6-wawancara"); return I(t, "Ada amplop untukmu") && I(t, "Pengumuman Tes Tulis") && I(t, "Pilih Shift Wawancara"); });
await ok("A wawancara: open the Tes Tulis envelope, scene has its own words", async () => { await clickText("^Buka Amplop$"); await p.waitForSelector(".r2stage"); await holdOpen(); const m = await modalText(); await shot("a6b-tulis-open"); return I(m, "Pengumuman Tes Tulis dan Program") && I(m, "Selanjutnya Wawancara") && I(m, "Berikutnya") && !I(m, "Document Screening"); });
await ok("A wawancara: closing the scene reveals the do-now card and tiles", async () => { await esc(); const t = await txt(); return !I(t, "Ada amplop untukmu") && I(t, "Wawancaramu: Rabu, 2 Desember 2026"); });
await go({ n7Tahap: "tubes" });
await ok("A tubes: Wawancara envelope is the only sealed one; open it", async () => { const t = await txt(); if (!I(t, "Pengumuman Tes Wawancara")) return false; await clickText("^Buka Amplop$"); await p.waitForSelector(".r2stage"); await holdOpen(); const m = await modalText(); await esc(); return I(m, "Pengumuman Tes Wawancara") && I(m, "Techmeet Tubes"); });
await ok("A tubes: Tubesku modal embeds topic, check-in, submission, Presentasi", async () => { await click("button.n7-ctile:has-text('Tubesku')"); await p.waitForSelector(".r5c"); await p.waitForTimeout(400); const m = await modalText(); await shot("a7-tubes-modal"); return ["Topik Tubes-mu", "Check-in Malam Ini", "Pengumpulan Tubes", "Presentasi"].every((x) => m.includes(x)); });
await esc();
await ok("A tubes: do-now button opens Tubesku too", async () => { await clickText("^Buka Tubesku$"); await p.waitForSelector(".r5c"); await esc(); return true; });
await go({ n7Tahap: "mengajar" });
await ok("A mengajar: Tubes envelope sealed, then Jadwal Mengajar picker with the Calendar's 18:30 to 21:00", async () => { const t = await txt(); await shot("a8-mengajar"); if (!I(t, "Pengumuman Tubes")) return false; await click("button.n7-ctile:has-text('Jadwalku')"); await p.waitForSelector(".r2pick"); const m = await modalText(); await esc(); return I(m, "Pilih Jadwal Mengajar") && I(m, "18.30") && I(m, "21.00") && !I(m, "15.30"); });
await go({ n7Tahap: "mengajar", n7Jadwal: "susulan" });
await ok("A mengajar: Susulan offer card (26 Desember)", async () => { await click("button.n7-ctile:has-text('Jadwalku')"); await p.waitForSelector(".r6scard"); const m = await modalText(); await shot("a8b-susulan"); await esc(); const t = await txt(); return I(m, "26 Desember 2026") && I(t, "Jawab tawaran Susulan Mengajar"); });
await go({ n7Tahap: "diterima" });
await ok("A diterima: two sealed envelopes, Mengajar first then Penerimaan, the gold scene with the Asisten code", async () => {
  let t = await txt(); if (!I(t, "Pengumuman Tes Mengajar")) return false;
  await clickText("^Buka Amplop$"); await p.waitForSelector(".r2stage"); await holdOpen(); let m = await modalText(); await esc();
  if (!(I(m, "Pengumuman Tes Mengajar") && I(m, "Satu amplop lagi"))) return "mengajar scene: " + m.slice(0, 200);
  t = await txt(); if (!I(t, "Pengumuman Penerimaan Asisten Baru")) return "no penerimaan card";
  await clickText("^Buka Amplop$"); await p.waitForSelector(".r2stage"); await holdOpen(); m = await modalText(); await shot("a9-penerimaan");
  return I(m, "Selamat datang di IRIS") && /[A-Z]{3}/.test(m) && I(m, "Kode Asistenmu");
});
await ok("A diterima: Lihat Perjalananku stays on this page and keeps both envelopes opened", async () => { await clickText("^Lihat Perjalananku$"); await p.waitForTimeout(700); const t = await txt(); const s = await p.evaluate(() => P9.state.screen); await shot("a9b-asisten"); return s === "n7-caas" && I(t, "Selamat datang di IRIS!") && I(t, "Kode Asistenmu") && I(t, "Semua sudah dibuka"); });
await ok("A diterima: Naik Tahap is off at the end of the road", async () => (await p.locator("button:has-text('Naik Tahap')[disabled]").count()) === 1);

/* ---------------------------------------------------------------- B: one candidate who ends at each stage */
for (const k of ["berkas", "tulis", "wawancara", "tubes", "mengajar", "diterima"]) {
  await go({ n7Tahap: k, n7Akhir: "gagal" });
  await ok(`B ${k}: journey ended, thank you card, no scores, tools shrink`, async () => { const t = await txt(); await shot("b-" + k); return I(t, "Makasih sudah ikut sejauh ini") && I(t, "Buka Amplop Lagi") && (await p.locator("button.n7-ctile").count()) === 1 && !/Skor|Nilai|\d+\s*\/\s*100/.test(t) && !I(t, "Ada amplop untukmu") && (await p.locator(".n7-star[data-st=end]").count()) === 1; });
  await ok(`B ${k}: the envelope opens again, quiet scene with its own words`, async () => { await clickText("^Buka Amplop Lagi$"); await p.waitForSelector(".r2stage"); await holdOpen(); const m = await modalText(); await shot("b-" + k + "-env"); await esc(); return k === "diterima" ? I(m, "Terima kasih, Oktavia") && I(m, "belum bisa menerimamu") : k === "mengajar" ? I(m, "Terima kasih.") && !I(m, "Ouhhh") && I(m, "tidak ada amplop Penerimaan") && I(m, "belum bisa menerimamu") : I(m, "Ouhhh") && !I(m, "Hooray"); });
}
/* ---------------------------------------------------------------- C: Akhir at First Meet is not a state (no result there) and the old shortcut works */
await go({ n7Tahap: "firstmeet", n7Akhir: "gagal" });
await ok("C firstmeet + Akhir: journey keeps going (First Meet has no result)", async () => hasNot("Makasih sudah ikut"));
await go({ n7Keadaan: "gagal" });
await ok("C old Tidak lolos Tes Tulis shortcut still ends at Tes Tulis", async () => has("Perjalananmu sampai di Tes Tulis", "Mengerjakan Tes Tulis dan Program"));
await go({ n7Tahap: "gagal" });
await ok("C old n7Tahap=gagal still renders the thank you card", async () => (await p.locator(".r2thanks").count()) === 1);

/* ---------------------------------------------------------------- D: pre-journey states live in the same page */
for (const [st, want] of [["tutup", "Pendaftaran dibuka Minggu, 25 Oktober 2026"], ["buka", "Pendaftaran lewat Google Form"], ["menunggu", "Berkasmu menunggu verifikasi"], ["revisi", "Admin meminta satu perbaikan"]]) {
  await go({ r1Caas: st });
  await ok("D " + st, async () => { const t = await txt(); await shot("d-" + st); return t.includes(want) && (await p.locator(".n7-journey").count()) === 1; });
}
await ok("D revisi: Perbaiki Berkas opens the documents with one Unggah Ulang", async () => { await clickText("^Perbaiki Berkas$"); await p.waitForSelector(".drawer"); const m = await modalText(); await esc(); return I(m, "Unggah Ulang") && I(m, "Visi Misi Motivasi"); });
await go({ r1Caas: "tutup" });
await ok("D tutup: the Google Form button is off with the reason", async () => (await p.locator("button[disabled]:has-text('Daftar lewat Google Form')").count()) === 1 && (await has("Tombolnya aktif sendiri")));
await go({ r1Caas: "menunggu" });
await ok("D menunggu: Mundur is a hold", async () => { await click("button.n7-ctile:has-text('Mundur')"); await p.waitForSelector(".n7-hold"); await esc(); return true; });

/* ---------------------------------------------------------------- E: Home banner takes the diterima option */
await go({ r1Viewer: "caas", n7Tahap: "diterima" }, "r1-home");
await ok("E Home banner at Diterima shows the welcome card", async () => { const t = await txt(); await shot("e-home-diterima"); return I(t, "Selamat datang di IRIS"); });
await go({ r1Viewer: "caas", n7Tahap: "mengajar" }, "r1-home");
await ok("E Home banner at Mengajar no longer says 15.30", async () => { const t = await txt(); return I(t, "18.30 sampai 21.00") && !I(t, "15.30"); });

/* ---------------------------------------------------------------- F: laptop sizes, both themes (primary action visible at 1280x600) */
const SIZES = [[1440, 900], [1440, 640], [1280, 600]];
for (const th of ["dark", "light"]) for (const [w, h] of SIZES) {
  theme = th; W = w; H = h;
  await p.setViewportSize({ width: w, height: h });
  for (const [name, v] of [["firstmeet", { n7Tahap: "firstmeet" }], ["tubes", { n7Tahap: "tubes" }], ["mengajar-pilih", { n7Tahap: "mengajar" }], ["diterima", { n7Tahap: "diterima" }], ["out-tubes", { n7Tahap: "tubes", n7Akhir: "gagal" }], ["menunggu", { r1Caas: "menunggu" }]]) {
    await go(v);
    await ok(`F ${th} ${w}x${h} ${name}: top card action visible without scrolling`, async () => {
      const r = await p.evaluate(() => { const f = document.querySelector(".dev").getBoundingClientRect(); const bt = document.querySelector(".n7-top button, .n7-top a.btn"); if (!bt) return { none: true }; const x = bt.getBoundingClientRect(); return { top: x.top - f.top, bottom: x.bottom - f.top, fh: f.height, scrollW: document.querySelector(".dev__scroll").scrollWidth - document.querySelector(".dev__scroll").clientWidth }; });
      await shot("f-" + name);
      return r.none ? name === "menunggu" : r.bottom <= r.fh && r.scrollW <= 1;
    });
  }
}
theme = "dark"; W = 1440; H = 900; await p.setViewportSize({ width: 1440, height: 900 });

console.log(log.map((l) => l.join(" | ")).join("\n"));
console.log("fails:", fails, "| errors:", errs.length ? errs.join("\n") : "none", "| secs:", Math.round((Date.now() - BASE) / 1000));
await b.close();
