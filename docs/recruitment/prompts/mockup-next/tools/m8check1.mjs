import { open } from "./lib8.mjs";
const t = await open({});
const { p, errs, go, txt, all, shot, click, has } = t;
const log = [];
const ok = async (name, fn) => { const e0 = errs.length; let r; try { r = await fn(); } catch (e) { r = "EXC " + String(e.message).split("\n")[0]; } const bad = r === false || (typeof r === "string" && r.startsWith("EXC")); log.push([bad ? "FAIL" : "ok", name, typeof r === "string" ? r : ""]); if (errs.length > e0) log.push(["ERR", name, errs.slice(e0).join(" || ")]); };

// Mengajar Plot Slot: PJ card
await go("r6-plot", { n7Bag: "slot" });
await ok("r6 Slot has PJ Tiap Malam", async () => { await shot("r6-slot"); return has("PJ Tiap Malam"); });
await go("r6-plot", { n7Bag: "papan", r6Sus: "awal" });
await ok("r6 Papan has Catat Jawaban + Pulihkan", async () => { await shot("r6-papan"); return has("Catat Jawaban", "Pulihkan"); });
await ok("r6 Catat Jawaban dialog", async () => { await click("^Catat Jawaban$"); await shot("r6-catat"); const a = await all(); return /Catat Jawaban Susulan/.test(a); });
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await ok("r6 Pulihkan dialog needs a reason", async () => { await click("^Pulihkan$"); const dis = await p.evaluate(() => [...document.querySelectorAll(".dialog button")].find((b) => /^Pulihkan$/.test(b.innerText.trim()))?.disabled); await shot("r6-pulihkan"); return dis === true; });
await ok("r6 Pulihkan with reason works", async () => { await p.fill(".dialog textarea", "Menjawab lewat LINE setelah batas waktu, sudah dikonfirmasi."); await click("^Pulihkan$", ".dialog button"); await p.waitForTimeout(400); return has("dipulihkan"); });
await go("r6-slotku", { r1Role: "akademik" });
await ok("r6 Slotku PJ card for NUE", async () => { await shot("r6-slotku"); return has("Kamu PJ malam ini"); });
await go("r6-template", { r1Role: "akademik" });
await ok("r6 Template has PJ per malam and Susulan deadline", async () => { await shot("r6-template"); return has("PJ per malam", "Jawab Susulan paling lambat"); });

// Penerimaan
await go("r8-final", { r1Role: "ketua", r8Final: "tinjau" });
await ok("r8 Tinjau quota card", async () => { await shot("r8-tinjau"); return has("Target Asisten baru", "di bawah target"); });
await go("r8-tutup", { r1Role: "ketua", r8Tutup: "pratutup" });
await ok("r8 Tutup pratutup: N and retention steppers", async () => { await shot("r8-tutup-pra"); return has("Cara Edisi Ditutup", "Tutup Edisi Sekarang"); });
await go("r8-tutup", { r1Role: "ketua", r8Tutup: "otomatis" });
await ok("r8 Tutup otomatis", async () => { await shot("r8-tutup-auto"); return has("ditutup otomatis"); });
await go("r8-tutup", { r1Role: "akademik", r8Tutup: "tutup" });
await ok("r8 Tutup tutup non-ketua readonly", async () => { await shot("r8-tutup-tutup"); return has("Ditutup Ketua") || has("ditutup oleh Ketua"); });

// Kandidat
await go("r1-panel", { r1Role: "ketua", r1Tab: "kandidat", r1Hari: "tulis" });
await ok("Kandidat late: stage column + Cutting link + Tambah CaAs for Ketua", async () => { await shot("kand-tulis"); return has("Tambah CaAs", "Berjalan", "Cutting Tes Tulis"); });
await go("r1-panel", { r1Role: "admin", r1Tab: "kandidat", r1Hari: "daftar" });
await ok("Kandidat registration still has doc statuses", async () => { await shot("kand-daftar"); return has("Menunggu Verifikasi", "Tambah CaAs"); });
await go("r1-panel", { r1Role: "akademik", r1Tab: "kandidat", r1Hari: "diterima" });
await ok("Kandidat akademik: no Tambah CaAs", async () => { await shot("kand-diterima"); return !(await has("Tambah CaAs")); });

// sealed arrival
await go("n7-caas", { n7Tahap: "wawancara" });
await ok("direct stage pick starts sealed", async () => { await shot("caas-wawancara"); return has("Ada amplop untukmu", "Pengumuman Tes Tulis"); });

// Cutting wording editor
await go("n7-cutting", { r1Role: "ketua", n7CutTahap: "mengajar" });
await ok("Cutting: Ubah Teks Amplop dialog", async () => { await click("Ubah Teks Amplop"); await shot("words"); return has("Teks Amplop", "Pratinjau"); });

console.log(log.map((x) => x.join(" | ")).join("\n"));
console.log("errors:", errs.length, errs.slice(0, 5));
await t.b.close();
