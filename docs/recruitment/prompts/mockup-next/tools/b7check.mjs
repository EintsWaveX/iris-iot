/* B7.0 check: load the redrawn mockup, open the five Tes Tulis screens in every
   state, print page errors and any leftover IoT words, and take screenshots. */
import { open } from "./lib8.mjs";

const OUTDIR = "C:/Users/EINTSW~1/AppData/Local/Temp/claude/C--Users-EintsWaveX-Documents-WebApps-iris-iot/e5380353-49a2-4494-b02c-1a3f5856d7f0/scratchpad/b7";
const IOT = /mikro|esp32|mqtt|hotspot|bluetooth|serial monitor|kit lc|\bkit\b|papan 1|protokol|arduino/i;
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const o = await open({ W, H, noDef: false, wait: 700 });
import fs from "node:fs";
fs.mkdirSync(OUTDIR, { recursive: true });
const bad = [];
const shotTo = (n) => o.p.screenshot({ path: `${OUTDIR}/${n}-${W}.png` });

const cases = [
  ["r3-putar", { r3Spin: "siap" }], ["r3-putar", { r3Spin: "keluar" }], ["r3-putar", { r3Spin: "tugas" }], ["r3-putar", { r3Spin: "auto" }], ["r3-putar", { r3Spin: "ulang" }],
  ["r3-lc", { r3Run: "salah" }], ["r3-lc", { r3Run: "kosong" }], ["r3-lc", { r3Run: "contoh" }], ["r3-lc", { r3Run: "antre" }], ["r3-lc", { r3Run: "jalan" }], ["r3-lc", { r3Run: "benar" }], ["r3-lc", { r3Run: "gagal" }], ["r3-lc", { r3Run: "lama" }], ["r3-lc", { r3Run: "mati" }],
  ["r3-soal", {}], ["r3-checkin", {}],
  ["n7-malam", { n7Malam: "persiapan" }], ["n7-malam", { n7Malam: "persiapan", n7Atur: "juri" }], ["n7-malam", { n7Malam: "berjalan", n7Kursi: "buka" }], ["n7-malam", { n7Malam: "berjalan", n7Ruang: "spin" }], ["n7-malam", { n7Malam: "berjalan", r3Lp: "siap" }], ["n7-malam", { n7Malam: "selesai" }],
  ["n7-bank", { r3Bank: "daftar" }], ["n7-bank", { r3Bank: "konfig" }], ["n7-bank", { r3Bank: "lc" }],
];
for (const [screen, v] of cases) {
  const tag = screen + "_" + Object.values(v).join("_");
  o.errs.length = 0;
  try {
    await o.go(screen, v);
  } catch (e) {
    bad.push(`${tag}: go failed ${e.message.slice(0, 120)}`);
    continue;
  }
  const t = await o.all();
  const hits = [...new Set((t.match(new RegExp(IOT, "gi")) || []).map((s) => s.toLowerCase()))];
  if (o.errs.length) bad.push(`${tag}: ${o.errs.slice(0, 2).join(" | ")}`);
  if (hits.length) bad.push(`${tag}: words ${hits.join(", ")}`);
  if (!/Tes Tulis|Live Coding|Bank Soal|Soal|Undian|Masuk/.test(t)) bad.push(`${tag}: looks empty`);
  await shotTo(tag);
}

/* the flows */
const flows = [];
await o.go("n7-malam", { n7Malam: "persiapan" });
flows.push(["juri row opens", await o.click("Penilai Kode C", "button")]);
flows.push(["cek penilai", await o.click("Cek Penilai", "button")]);
await o.go("n7-malam", { n7Malam: "persiapan", n7Kursi: "buka" });
flows.push(["manual button", await o.has("Masukkan Manual")]);
flows.push(["manual click", await o.click("Masukkan Manual", "button")]);
flows.push(["manual confirm", await o.click("^Masukkan$", "button")]);
await shotTo("flow-manual");
await o.go("r3-lc", { r3Run: "salah" });
flows.push(["kirim", await o.click("^Kirim$", "button")]);
await o.p.waitForTimeout(9000);
flows.push(["result after kirim", await o.has("tes lolos")]);
await shotTo("flow-kirim");
await o.go("r3-putar", { r3Spin: "siap" });
flows.push(["putar", await o.click("Putar Undianku", "button")]);
await o.p.waitForTimeout(3200);
flows.push(["see problems", await o.click("Lihat Soalmu", "button")]);
flows.push(["problems listed", await o.has("Tertinggi dan Terendah")]);
await o.go("n7-bank", { r3Bank: "lc" });
flows.push(["bank check", await o.click("^Cek dengan Solusi Acuan$", "button")]);
await o.p.waitForTimeout(1300);
flows.push(["bank ok", await o.has("cocok dengan solusi acuan")]);
await shotTo("flow-bank");

console.log("flows:", flows.map(([n, r]) => `${r ? "ok " : "FAIL "}${n}`).join("; "));
console.log("problems:", bad.length ? "\n" + bad.join("\n") : "none");
await o.b.close();
