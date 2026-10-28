import { open, elShot } from "./lib8.mjs";
const t = await open({ H: 1000 });
const { p, errs, go, all, shot, click, has } = t;
const log = [];
const ok = async (name, fn) => { const e0 = errs.length; let r; try { r = await fn(); } catch (e) { r = "EXC " + String(e.message).split("\n")[0]; } const bad = r === false || (typeof r === "string" && r.startsWith("EXC")); log.push([bad ? "FAIL" : "ok", name, typeof r === "string" ? r : ""]); if (errs.length > e0) log.push(["ERR", name, errs.slice(e0).join(" || ")]); };
const esc = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(250); };

await go("r1-panel", { r1Role: "admin", r1Tab: "kandidat", r1Hari: "daftar" });
await ok("Atur Berkas opens, lists 8, add one", async () => { await click("^Atur Berkas$"); const n0 = await p.locator(".r9docs__r").count(); await click("^Tambah Berkas$", ".dialog button"); const n1 = await p.locator(".r9docs__r").count(); await shot("docs-editor"); return n0 === 8 && n1 === 9 ? "8->9" : `${n0}->${n1}`; });
await ok("Atur Berkas: changes show in Tambah CaAs slots (restore, then check)", async () => { await click("^Kembalikan Bawaan$", ".dialog button"); await esc(); await go("r1-panel", { r1Role: "admin", r1Tab: "kandidat", r1Tambah: "berkas" }); const slots = await p.locator(".rec9-up").count(); await shot("tambah-slots"); return slots === 7 ? "7 slots" : `slots ${slots}`; });
await esc();
await go("n7-caas", { r1Caas: "menunggu" });
await ok("CaAs Berkasku follows the list", async () => { await click("Berkasku", "button.n7-ctile"); const n = await p.locator(".n7-docs li").count(); return n === 8 ? "8" : `n ${n}`; });
await esc();

await go("n7-cutting", { r1Role: "ketua", n7CutTahap: "tes" });
await ok("Cutting: Atur titik awal dialog and edit", async () => { await p.click("button[aria-label*='titik awal']"); await p.waitForTimeout(300); const dlg = await p.evaluate(() => document.querySelector(".dialog")?.innerText.replace(/\s+/g, " ")); await shot("cutdef"); return /Titik Awal Cutting/.test(dlg) && /Sasaran deck/.test(dlg); });
await esc();
await go("n7-cutting", { r1Role: "ketua", n7CutTahap: "mengajar" });
await ok("Cutting Mengajar: titik awal uses Template numbers", async () => { await p.click("button[aria-label*='titik awal']"); await p.waitForTimeout(300); const dlg = await p.evaluate(() => document.querySelector(".dialog")?.innerText.replace(/\s+/g, " ")); return /Template Mengajar/.test(dlg); });
await esc();

await go("r2-qr", { r2Qr: "proyektor", r2QrStage: "tubes" });
await ok("QR wall tubes reads the Calendar event", async () => { return has("Senin, 14 Desember 2026"); });
await ok("Calendar write-through: edit Pengerjaan Tubes window, QR follows", async () => {
  await p.evaluate(() => { const e = window.REC.EVENTS.find((x) => x.id === "kerjatubes"); e.win = ["19:00", "22:30"]; });
  await go("r2-qr", { r2Qr: "proyektor", r2QrStage: "tubes" });
  const a = await all(); return a.includes("19:00") && a.includes("22:30");
});
await p.evaluate(() => { const e = window.REC.EVENTS.find((x) => x.id === "kerjatubes"); e.win = ["18:30", "22:00"]; });

// closed edition lock
await go("r8-tutup", { r1Role: "ketua", r8Tutup: "tutup" });
await p.evaluate(() => { P9.setVariant("r1Tab", "kandidat"); P9.go("r1-panel"); }); await p.waitForTimeout(1200);
await ok("closed edition: Kandidat mutating buttons locked, search/filters alive", async () => {
  await shot("closed-kandidat");
  const r = await p.evaluate(() => { const get = (re) => [...document.querySelectorAll(".dev__scroll button")].filter((b) => re.test(b.innerText.trim())); const add = get(/^Tambah CaAs$/)[0], docs = get(/^Atur Berkas$/)[0], xl = get(/^Unduh XLSX$/)[0], chip = document.querySelector(".rec9-chip"); return { add: add && add.disabled, docs: docs && docs.disabled, xl: xl && xl.disabled, chip: chip && chip.disabled }; });
  return r.add === true && r.docs === true && r.xl !== true && r.chip !== true ? JSON.stringify(r) : "FAIL " + JSON.stringify(r);
});

console.log(log.map((x) => x.join(" | ")).join("\n"));
console.log("errors:", errs.length, errs.slice(0, 5));
await t.b.close();
