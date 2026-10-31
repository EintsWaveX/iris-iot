import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/EintsWaveX/Documents/WebApps/DMagis/package.json")("playwright-core");
const ROOT = process.env.ROOT || "C:/Users/EintsWaveX/Downloads/design-review/mockups/recruitment";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await chromium.launch({ executablePath: "C:/Users/EintsWaveX/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
const p = await (await b.newContext({ viewport: { width: 1900, height: 1300 } })).newPage();
await p.goto(`file:///${ROOT}/index.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => window.P9 && document.querySelector(".dev"), null, { timeout: 60000 });
await p.addStyleTag({ content: ".pc, .notes { display: none !important; }" });
const DEF = { n7Bagian: "fitb", r3Bank: "daftar", n7Malam: "persiapan", r3Hand: "tidak", n7Tahap: "firstmeet", n7Jadwal: "pilih", n7Hasil: "lolos", r1Caas: "disetujui" };
const screens = [
  ["r1-home", {}], ["caas-fm", { screen: "n7-caas", v: { n7Tahap: "firstmeet" } }], ["caas-tulis-jadwal", { screen: "n7-caas", v: { n7Tahap: "tulis", n7Jadwal: "terpilih" } }], ["caas-gagal", { screen: "n7-caas", v: { n7Tahap: "gagal" } }], ["caas-menunggu", { screen: "n7-caas", v: { r1Caas: "menunggu" } }], ["caas-revisi", { screen: "n7-caas", v: { r1Caas: "revisi" } }],
  ["r1-panel", {}], ["n7-latihan", { v: { n7Mode: "asisten" } }], ["r1-kalender", {}], ["r1-panitia", {}],
  ["n7-cutting", {}], ["n7-plot", {}], ["r2-berkas", {}], ["r2-qr", {}],
  ["r3-checkin", {}], ["r3-soal", {}], ["r3-putar", {}], ["r3-lc", {}],
  ["malam-p", { screen: "n7-malam", v: { n7Malam: "persiapan" } }], ["malam-b", { screen: "n7-malam", v: { n7Malam: "berjalan" } }], ["malam-lc", { screen: "n7-malam", v: { n7Malam: "berjalan", n7Bagian: "lc" } }], ["malam-s", { screen: "n7-malam", v: { n7Malam: "selesai" } }],
  ["bank", { screen: "n7-bank", v: {} }], ["bank-editor", { screen: "n7-bank", v: { r3Bank: "edit" } }], ["bank-kunci", { screen: "n7-bank", v: { r3Bank: "kunci" } }], ["bank-config", { screen: "n7-bank", v: { r3Bank: "konfig" } }], ["bank-lc", { screen: "n7-bank", v: { r3Bank: "lc" } }],

  ["m8-kandidat-late", { screen: "r1-panel", v: { r1Role: "ketua", r1Tab: "kandidat", r1Hari: "tulis" } }], ["m8-tinjau", { screen: "r8-final", v: { r1Role: "ketua" } }], ["m8-tutup-pra", { screen: "r8-tutup", v: { r1Role: "ketua", r8Tutup: "pratutup" } }], ["m8-tutup-auto", { screen: "r8-tutup", v: { r1Role: "ketua", r8Tutup: "otomatis" } }],
  ["m8-r6-slot", { screen: "r6-plot", v: { n7Bag: "slot" } }], ["m8-r6-papan", { screen: "r6-plot", v: { n7Bag: "papan" } }], ["m8-r6-slotku", { screen: "r6-slotku", v: { r1Role: "akademik" } }], ["m8-r6-template", { screen: "r6-template", v: { r1Role: "akademik" } }],
  ["m8-tubes-team", { screen: "r5-tubes", v: { r5Bag: "kumpul", r5Waktu: "tutup", r5Tim: "tim" } }], ["m8-caas-sealed", { screen: "n7-caas", v: { n7Tahap: "mengajar" } }], ["m8-mengajar-nav", { screen: "r6-slotku", v: { r1Role: "ketua" } }],
].map(([n, o]) => [n, { screen: o.screen || n, v: o.v || {} }]);
const audit = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, bk) => [f[0] * f[3] + bk[0] * (1 - f[3]), f[1] * f[3] + bk[1] * (1 - f[3]), f[2] * f[3] + bk[2] * (1 - f[3]), 1];
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; const c = rgba(bg); if (c[3] > 0) layers.push(c); if (c[3] >= 0.999) break; } let base = rgba(getComputedStyle(document.querySelector(".dev")).backgroundColor); if (base[3] < 1) base = [10, 12, 20, 1]; let out = base; for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out); return out; };
  const res = []; const seen = new Set();
  const root = document.querySelector(".dev__scroll") || document.body;
  for (const el of root.querySelectorAll("*")) {
    
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!own) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const fg = over([...rgba(cs.color).slice(0, 3), rgba(cs.color)[3] * op], bgOf(el));
    const bg = bgOf(el);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const cr = ratio(fg, bg);
    const need = large ? 3 : 4.5;
    if (cr < need) { const key = el.className + "|" + el.textContent.trim().slice(0, 24); if (!seen.has(key)) { seen.add(key); res.push({ cls: String(el.className).slice(0, 40), t: el.textContent.trim().slice(0, 28), cr: +cr.toFixed(2), need, fs: size }); } }
  }
  return res.sort((a, b) => a.cr - b.cr);
};
for (const theme of (process.env.THEMES || "dark,light").split(",")) {
  console.log("===== THEME", theme);
  for (const [name, st] of screens) {
    if (ONLY && !ONLY.includes(name)) continue;
    await p.evaluate(([st, theme, DEFV]) => { P9.set({ width: 1440, short: false, lang: "id", theme, detail: "normal", reduce: true }); for (const [k, x] of Object.entries({ ...DEFV, ...st.v })) P9.setVariant(k, x); P9.set({ screen: st.screen }); }, [st, theme, DEF]);
    await p.waitForTimeout(1300);
    const r = await p.evaluate(audit);
    console.log(`-- ${name}: ${r.length} below threshold`);
    r.slice(0, 14).forEach((x) => console.log(`   ${x.cr} (need ${x.need}) .${x.cls} "${x.t}" ${x.fs}px`));
  }
}
await b.close();
