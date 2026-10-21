// TP files check (2026-10-21): starts `wrangler dev` with a throwaway local
// R2 and walks /tp/unggah, /tp/berkas and /tp/srv. Tickets are signed here
// with node:crypto, independently of src/lib/tp-r2.ts.
//
//   node test/uji-tp.mjs      (reads KONSOL_RELAY_SECRET from .dev.vars)
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.UJI_PORT ?? 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const ASAL = "https://irisiotlab.com";
const secret = /KONSOL_RELAY_SECRET=(.+)/
  .exec(readFileSync(".dev.vars", "utf8"))?.[1]
  ?.trim();
if (!secret) throw new Error("KONSOL_RELAY_SECRET missing in .dev.vars");

let lulus = 0;
let gagal = 0;
function cek(nama, ok, info = "") {
  if (ok) lulus++;
  else gagal++;
  console.log(
    `${ok ? "ok  " : "GAGAL"} ${nama}${ok || !info ? "" : `: ${info}`}`,
  );
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function tiket(isi, kunci = secret) {
  const body = b64(JSON.stringify(isi));
  return `${body}.${b64(createHmac("sha256", kunci).update(body).digest())}`;
}
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const pdf = Buffer.from(`%PDF-1.4\n${"x".repeat(5000)}\n%%EOF\n`);
const s = sha(pdf);
const k = `tp/2026-ganjil/2/100002/${s}.pdf`;
const put = (o = {}) =>
  tiket({ j: "tp-put", k, n: pdf.length, s, h: 3, e: now() + 600, ...o });
const baca = (o = {}) =>
  tiket({
    j: "tp-baca",
    k,
    e: now() + 600,
    d: "i",
    nm: "TP_Modul_2_100002.pdf",
    m: "application/pdf",
    ...o,
  });
const srv = (op, o = {}) =>
  tiket({ j: "tp-srv", op, k, s: "", e: now() + 60, ...o });

const simpan = mkdtempSync(join(tmpdir(), "uji-tp-"));
const dev = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
    "--persist-to",
    simpan,
  ],
  {
    shell: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));
function hentiDev() {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]);
  else {
    try {
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      dev.kill();
    }
  }
}
setTimeout(() => {
  console.log(`GAGAL stalled after ${lulus} checks:\n${log.slice(-4000)}`);
  hentiDev();
  process.exit(1);
}, 180_000).unref();

try {
  for (let i = 0; i < 1200 && !/Ready on/.test(log); i++) await tunggu(50);
  if (!/Ready on/.test(log))
    throw new Error(`wrangler dev did not start:\n${log}`);

  const pre = await fetch(`${BASE}/tp/unggah`, {
    method: "OPTIONS",
    headers: { origin: ASAL, "access-control-request-method": "PUT" },
  });
  cek(
    "preflight allows the site",
    pre.headers.get("access-control-allow-origin") === ASAL,
  );
  const asing = await fetch(`${BASE}/tp/unggah`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example" },
  });
  cek(
    "preflight gives a stranger nothing",
    !asing.headers.get("access-control-allow-origin"),
  );

  const up = (t, body = pdf) =>
    fetch(`${BASE}/tp/unggah?t=${encodeURIComponent(t)}`, {
      method: "PUT",
      body,
      headers: { origin: ASAL },
    });
  cek(
    "a forged ticket is refused",
    (
      await up(
        tiket(
          { j: "tp-put", k, n: pdf.length, s, h: 3, e: now() + 600 },
          "x".repeat(40),
        ),
      )
    ).status === 403,
  );
  cek(
    "an expired ticket is refused",
    (await up(put({ e: now() - 5 }))).status === 403,
  );
  cek("a read ticket can't put", (await up(baca())).status === 403);
  cek(
    "a bad key is refused",
    (await up(put({ k: "tp/../x.pdf" }))).status === 403,
  );
  const ubah = Buffer.from(pdf);
  ubah[100] = 0x79;
  cek(
    "other bytes than signed are refused",
    (await up(put(), ubah)).status === 400,
  );
  cek(
    "the wrong size is refused",
    (await up(put(), pdf.subarray(0, 100))).status === 400,
  );
  const bukan = Buffer.from(`hello${"x".repeat(5000)}`);
  const kb = `tp/2026-ganjil/2/100002/${sha(bukan)}.pdf`;
  cek(
    "a non-PDF is refused",
    (
      await up(
        tiket({
          j: "tp-put",
          k: kb,
          n: bukan.length,
          s: sha(bukan),
          h: 1,
          e: now() + 600,
        }),
        bukan,
      )
    ).status === 415,
  );
  const ok = await up(put());
  cek("the PDF goes in", ok.status === 201, String(ok.status));
  cek(
    "with CORS for the site",
    ok.headers.get("access-control-allow-origin") === ASAL,
  );
  cek("a retry of the same bytes is fine", (await up(put())).status === 201);

  const head = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    headers: { "x-tp-tiket": srv("head") },
  });
  const hj = await head.json();
  cek(
    "head reports size, sha and pages",
    hj.ada && hj.ukuran === pdf.length && hj.sha256 === s && hj.halaman === 3,
    JSON.stringify(hj),
  );
  cek(
    "srv without a ticket is refused",
    (await fetch(`${BASE}/tp/srv`, { method: "POST" })).status === 403,
  );

  const g = await fetch(`${BASE}/tp/berkas?t=${encodeURIComponent(baca())}`, {
    headers: { origin: ASAL },
  });
  const gb = Buffer.from(await g.arrayBuffer());
  cek("read returns the bytes", g.status === 200 && gb.equals(pdf));
  cek(
    "read is inline PDF, private cache",
    g.headers.get("content-type") === "application/pdf" &&
      /inline/.test(g.headers.get("content-disposition") ?? "") &&
      /private/.test(g.headers.get("cache-control") ?? ""),
  );
  cek(
    "read exposes range headers",
    /content-range/.test(g.headers.get("access-control-expose-headers") ?? ""),
  );
  const r = await fetch(`${BASE}/tp/berkas?t=${encodeURIComponent(baca())}`, {
    headers: { range: "bytes=0-9" },
  });
  cek(
    "a range read is partial",
    r.status === 206 &&
      (await r.text()) === "%PDF-1.4\nx" &&
      r.headers.get("content-range") === `bytes 0-9/${pdf.length}`,
  );
  const et = g.headers.get("etag");
  const nm = await fetch(`${BASE}/tp/berkas?t=${encodeURIComponent(baca())}`, {
    headers: { "if-none-match": et },
  });
  cek("a matching etag is 304", nm.status === 304, String(nm.status));
  const u = await fetch(
    `${BASE}/tp/berkas?t=${encodeURIComponent(baca({ d: "u" }))}`,
  );
  cek(
    "download asks to save",
    /attachment/.test(u.headers.get("content-disposition") ?? ""),
  );
  await u.arrayBuffer();
  const x = await fetch(
    `${BASE}/tp/berkas?t=${encodeURIComponent(baca({ m: "text/html" }))}`,
  );
  cek(
    "an unknown type is sandboxed",
    x.headers.get("content-type") === "application/octet-stream" &&
      /sandbox/.test(x.headers.get("content-security-policy") ?? ""),
  );
  await x.arrayBuffer();
  cek(
    "an expired read is refused",
    (
      await fetch(
        `${BASE}/tp/berkas?t=${encodeURIComponent(baca({ e: now() - 1 }))}`,
      )
    ).status === 403,
  );

  const doc = Buffer.from("PK\u0003\u0004 a word file");
  const kd = `tp/2026-ganjil/1/100002/${sha(doc)}.docx`;
  const sp = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    body: doc,
    headers: {
      "x-tp-tiket": srv("put", { k: kd, s: sha(doc) }),
      "x-tp-mime":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
  cek("the API can put any type", sp.status === 201);
  const sg = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    headers: { "x-tp-tiket": srv("get", { k: kd }) },
  });
  cek("and get it back", Buffer.from(await sg.arrayBuffer()).equals(doc));
  const salah = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    body: doc,
    headers: { "x-tp-tiket": srv("put", { k: kd, s: s }) },
  });
  cek("a put with other bytes than signed is refused", salah.status === 400);

  cek(
    "a prefix outside a semester is refused",
    (
      await fetch(`${BASE}/tp/srv`, {
        method: "POST",
        headers: { "x-tp-tiket": srv("hapus-awalan", { k: "tp/" }) },
      })
    ).status === 403,
  );
  const hp = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    headers: { "x-tp-tiket": srv("hapus-awalan", { k: "tp/2026-ganjil/" }) },
  });
  const hpj = await hp.json();
  cek("a semester goes at once", hpj.hapus === 2, JSON.stringify(hpj));
  const lagi = await fetch(`${BASE}/tp/srv`, {
    method: "POST",
    headers: { "x-tp-tiket": srv("head") },
  });
  cek("and is gone", (await lagi.json()).ada === false);
} catch (e) {
  cek("suite ran", false, e?.stack ?? String(e));
} finally {
  hentiDev();
  try {
    rmSync(simpan, { recursive: true, force: true });
  } catch {}
}
console.log(`\n${lulus} ok, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
