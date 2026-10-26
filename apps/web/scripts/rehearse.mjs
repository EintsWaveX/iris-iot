#!/usr/bin/env node
/**
 * Production checks (2026-10-05), turned from that night's ad hoc rehearsal
 * scripts into one tool. Node 22+, no dependencies.
 *
 *   node scripts/rehearse.mjs [base]                 smoke: read-only, no sign-in
 *   node scripts/rehearse.mjs [base] --tot           + a full TOT rehearsal
 *   node scripts/rehearse.mjs [base] --tot --load 30 + 30 dummy Praktikan working at once
 *
 * base defaults to https://irisiotlab.com.
 *
 * Smoke (runs after every production deploy, .github/workflows/smoke.yml):
 * pages and security headers, the API answering, the relay's live-update
 * room answering a ping. It writes nothing.
 *
 * --tot signs in as an Asisten (IRIS_NIM and IRIS_PW from the environment,
 * never from a file) with the `jadwal` and `pair` rights, and on production:
 * switches Mode TOT on, starts a TOT session, signs dummy Praktikan in with
 * the session code, works through their pages, ends the session and
 * switches TOT off again. Mode TOT never touches real data, but while it is
 * on real Praktikan can't sign in, so it refuses to run while a session
 * runs, while TOT is already on, or between 06:00 and 21:00 WIB on a class
 * day (Monday to Saturday) unless --force. --keep leaves the TOT session in
 * the history; by default it is cleared at the end.
 *
 * --load N (with --tot): N dummies sign in at once and poll like real
 * students for --menit minutes (default 3), each with its own live-update
 * socket. Reports latency (p50, p95, max) per endpoint and every failure.
 *
 * Exit code 1 when any check fails.
 */

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? "https://irisiotlab.com").replace(
  /\/$/,
  "",
);
const RELAY = BASE.includes("localhost")
  ? "ws://127.0.0.1:8788/siaran"
  : "wss://konsol.irisiotlab.com/siaran";

const hasil = [];
function cek(nama, ok, info = "") {
  hasil.push({ nama, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${nama}${info ? `  (${String(info).slice(0, 200)})` : ""}`);
  return ok;
}

/** A tiny cookie-keeping client: one per signed-in person. */
class Klien {
  constructor(nama) {
    this.nama = nama;
    this.cookie = "";
  }
  async minta(path, body, method) {
    const t0 = performance.now();
    const r = await fetch(BASE + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const ms = performance.now() - t0;
    const sc = r.headers.getSetCookie?.() ?? [];
    for (const c of sc) {
      const m = /^iris_session=([^;]*)/.exec(c);
      if (m) this.cookie = m[1] ? `iris_session=${m[1]}` : "";
    }
    let json = null;
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("json")) json = await r.json().catch(() => null);
    else await r.arrayBuffer();
    return { status: r.status, json: json ?? {}, ms, headers: r.headers };
  }
}

function pingRelay(ms = 6000) {
  return new Promise((resolve) => {
    let ws;
    const t0 = performance.now();
    const done = (ok, info) => {
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
      resolve({ ok, info, ms: performance.now() - t0 });
    };
    const timer = setTimeout(() => done(false, "no pong"), ms);
    try {
      ws = new WebSocket(RELAY);
    } catch (e) {
      return done(false, String(e));
    }
    ws.onopen = () => ws.send("ping");
    ws.onmessage = (e) => e.data === "pong" && done(true, "");
    ws.onerror = () => done(false, "socket error");
  });
}

/* ------------------------------------------------------------- smoke */

async function smoke() {
  console.log(`\n# Smoke: ${BASE}`);
  const tamu = new Klien("tamu");
  for (const p of ["/", "/login", "/en/login", "/zh/login", "/modules/1", "/modules/4"]) {
    try {
      const r = await fetch(BASE + p, { signal: AbortSignal.timeout(20_000) });
      const html = await r.text();
      cek(`page ${p}`, r.status === 200 && /<title>/.test(html), r.status);
      // vercel.json sets the headers, so a local dev server has none.
      if (p === "/login" && !BASE.includes("localhost")) {
        cek(
          "CSP header",
          (r.headers.get("content-security-policy") ?? "").includes("default-src 'self'"),
        );
        cek("HSTS header", (r.headers.get("strict-transport-security") ?? "").includes("max-age"));
        const js = /<script[^>]+src="(\/_astro\/[^"]+\.js)"/.exec(html)?.[1];
        if (js) {
          const a = await fetch(BASE + js, { signal: AbortSignal.timeout(20_000) });
          await a.arrayBuffer();
          cek("a page script loads", a.status === 200, js);
        }
      }
    } catch (e) {
      cek(`page ${p}`, false, e.message);
    }
  }
  const me = await tamu.minta("/api/auth/me");
  cek("api: /auth/me answers a visitor", me.status === 200 && me.json.ok === false, me.status);
  const now = await tamu.minta("/api/session/now");
  cek(
    "api: /session/now wants a sign-in",
    now.status === 401 && now.json.kode === "belum_masuk",
    now.status,
  );
  const akses = await tamu.minta("/api/session/akses");
  cek("api: module access is public", akses.status === 200 && akses.json.ok === true, akses.status);
  const fmt = await tamu.minta("/api/auth/student", { nim: "!" });
  cek(
    "api: student sign-in checks the format",
    fmt.json.kode === "format_salah",
    JSON.stringify(fmt.json),
  );
  const r = await pingRelay();
  cek("relay: live updates answer a ping", r.ok, r.ok ? `${Math.round(r.ms)} ms` : r.info);
}

/* --------------------------------------------------------------- TOT */

function jamWib() {
  const d = new Date(Date.now() + 7 * 3600_000);
  return { jam: d.getUTCHours() + d.getUTCMinutes() / 60, hari: d.getUTCDay() };
}

async function tot() {
  console.log("\n# TOT rehearsal");
  const nim = process.env.IRIS_NIM;
  const pw = process.env.IRIS_PW;
  if (!nim || !pw) {
    cek("IRIS_NIM and IRIS_PW are set", false);
    return;
  }
  const { jam, hari } = jamWib();
  if (!flag("--force") && hari >= 1 && hari <= 6 && jam >= 6 && jam < 21) {
    cek("outside class hours (06:00 to 21:00 WIB, Mon to Sat)", false, "use --force to override");
    return;
  }
  const a = new Klien("asisten");
  const masuk = await a.minta("/api/auth/assistant", { nim, password: pw });
  if (!cek("Asisten signs in", masuk.json.ok === true, masuk.json.kode)) return;

  const awal = await a.minta("/api/session/tot");
  const sesiAwal = await a.minta("/api/session/current");
  if (!cek("no session is running", !sesiAwal.json.sesi, sesiAwal.json.sesi?.id)) return;
  if (!cek("Mode TOT is off before", awal.json.aktif === false)) return;

  let nyala = false;
  let sesiId = null;
  try {
    const on = await a.minta("/api/session/tot", { aktif: true });
    nyala = cek("Mode TOT switches on", on.json.ok === true, on.json.kode);
    if (!nyala) return;

    // Module 1 needs no PC, so the lab check passes without one.
    const modul = Number(opt("--modul", "1"));
    let start = await a.minta("/api/session", { jenis: "tot", modul, durasiMenit: 30 });
    if (start.json.kode === "belum_siap") {
      cek(
        "lab check reports what isn't ready",
        Array.isArray(start.json.cek),
        JSON.stringify(start.json.cek?.filter((c) => c.status === "gagal").map((c) => c.id)),
      );
      start = await a.minta("/api/session", {
        jenis: "tot",
        modul,
        durasiMenit: 30,
        paksa: "smoke test, rehearse.mjs",
      });
    }
    if (!cek("TOT session starts", start.json.ok === true, start.json.kode)) return;
    sesiId = start.json.sesi?.id;

    const cur = await a.minta("/api/session/current");
    const kode = cur.json.sesi?.kodeMasuk;
    cek(
      "the session has a 4-digit sign-in code",
      /^\d{4}$/.test(kode ?? ""),
      kode ? "" : "missing",
    );

    const p = new Klien("100000");
    const tujuan = await p.minta("/api/auth/student", { nim: "100000" });
    cek(
      "a dummy is first asked why they sign in",
      tujuan.json.kode === "perlu_tujuan",
      tujuan.json.kode,
    );
    const tanpa = await p.minta("/api/auth/student", { nim: "100000", tujuan: "praktikum" });
    cek(
      "a dummy joining without the code is asked for it",
      tanpa.json.kode === "perlu_kode",
      tanpa.json.kode,
    );
    const salah = await p.minta("/api/auth/student", {
      nim: "100000",
      kodeSesi: kode === "0000" ? "0001" : "0000",
    });
    cek("a wrong code is refused", salah.json.kode === "kode_salah", salah.json.kode);
    const benar = await p.minta("/api/auth/student", { nim: "100000", kodeSesi: kode });
    cek("a dummy signs in with the code", benar.json.ok === true, benar.json.kode);
    const pn = await p.minta("/api/session/now");
    cek(
      "the dummy sees the session",
      pn.json.sesi?.modul === modul && pn.json.sesi?.milikSaya === true,
    );
    cek("the dummy never sees the code", pn.json.sesi && !("kodeMasuk" in pn.json.sesi));
    for (const path of [
      "/api/session/results",
      "/api/session/brief",
      "/api/session/mine",
      `/api/modul/kode?modul=${modul}`,
    ]) {
      const r = await p.minta(path);
      cek(
        `dummy: ${path}`,
        r.status === 200 && r.json.ok !== false,
        `${r.status} ${r.json.kode ?? ""}`,
      );
    }
    const w = await a.minta("/api/session/waspada");
    cek("alert endpoint answers", w.json.ok === true, JSON.stringify(w.json.galat?.jumlah));

    if (flag("--load")) await beban(kode, modul);
  } finally {
    if (sesiId) {
      const end = await a.minta("/api/session/end", { sesiId });
      cek("TOT session ends", end.json.ok === true, end.json.kode);
    }
    if (nyala) {
      const off = await a.minta("/api/session/tot", { aktif: false });
      cek("Mode TOT switches off, roster back", off.json.ok === true, off.json.kode);
      if (!flag("--keep")) {
        const h = await a.minta("/api/session/tot", { hapusRiwayat: true });
        cek("TOT history cleared", h.json.ok === true, `${h.json.dihapus ?? 0} sessions`);
      }
    }
    await a.minta("/api/auth/logout", {});
  }
}

/* -------------------------------------------------------------- load */

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function beban(kode, modul) {
  const n = Math.min(60, Number(opt("--load", "30")));
  const menit = Number(opt("--menit", "3"));
  console.log(`\n# Load: ${n} dummy Praktikan for ${menit} min`);
  const nims = [];
  for (let g = 1; g <= 6 && nims.length < n; g++)
    for (let i = 0; i < 10 && nims.length < n; i++) nims.push(`${g}0000${i}`);

  const lat = new Map();
  const gagal = [];
  const catat = (ep, r) => {
    if (!lat.has(ep)) lat.set(ep, []);
    lat.get(ep).push(r.ms);
    if (r.status >= 400 || r.json.ok === false)
      gagal.push(`${ep} ${r.status} ${r.json.kode ?? ""}`);
  };

  // Everyone signs in at once, the way a class does when told to.
  const klien = nims.map((x) => new Klien(x));
  const t0 = performance.now();
  const masuk = await Promise.all(
    klien.map((k) =>
      k
        .minta("/api/auth/student", { nim: k.nama, kodeSesi: kode })
        .then((r) => (catat("POST /auth/student", r), r)),
    ),
  );
  const okMasuk = masuk.filter((r) => r.json.ok).length;
  cek(
    `${n} sign in at once`,
    okMasuk === n,
    `${okMasuk}/${n} in ${Math.round(performance.now() - t0)} ms`,
  );

  // Each keeps a live-update socket, as the module page does.
  const sockets = [];
  let sockOk = 0;
  for (const _ of klien) {
    try {
      const ws = new WebSocket(RELAY);
      ws.onopen = () => sockOk++;
      sockets.push(ws);
    } catch {}
  }

  const sampai = Date.now() + menit * 60_000;
  const berkas = (await klien[0].minta(`/api/modul/kode?modul=${modul}`)).json;
  const namaBerkas = berkas?.berkas?.[0]?.slug ?? null;
  await Promise.all(
    klien.map(async (k, i) => {
      const kel = Math.floor(i / 10) + 1;
      await new Promise((r) => setTimeout(r, Math.random() * 5000));
      while (Date.now() < sampai) {
        const eps = [
          "/api/session/now",
          "/api/auth/me",
          "/api/session/results",
          `/api/session/telemetry?modul=${modul}&kelompok=${kel}`,
          ...(namaBerkas
            ? [`/api/modul/draft?modul=${modul}&berkas=${encodeURIComponent(namaBerkas)}`]
            : []),
        ];
        for (const ep of eps) {
          try {
            catat(`GET ${ep.split("?")[0]}`, await k.minta(ep));
          } catch (e) {
            gagal.push(`${ep} ${e.name}`);
          }
        }
        // About one poll cycle of the real page (usePoll's 20 s, sped up).
        await new Promise((r) => setTimeout(r, 8000 + Math.random() * 4000));
      }
    }),
  );
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
  cek(`${n} live-update sockets open`, sockOk >= n * 0.95, `${sockOk}/${n}`);

  console.log("\n  endpoint                         n     p50    p95    max  (ms)");
  for (const [ep, xs] of lat) {
    console.log(
      `  ${ep.padEnd(32)} ${String(xs.length).padStart(4)} ${String(Math.round(pct(xs, 50))).padStart(7)} ${String(Math.round(pct(xs, 95))).padStart(6)} ${String(Math.round(Math.max(...xs))).padStart(6)}`,
    );
  }
  const total = [...lat.values()].reduce((s, xs) => s + xs.length, 0);
  const semua = [...lat.values()].flat();
  cek(
    "load: under 1% of requests fail",
    gagal.length <= total * 0.01,
    `${gagal.length}/${total}${gagal.length ? ": " + [...new Set(gagal)].slice(0, 5).join("; ") : ""}`,
  );
  cek("load: p95 under 2 s", pct(semua, 95) < 2000, `${Math.round(pct(semua, 95))} ms`);
}

/* -------------------------------------------------------------- main */

try {
  await smoke();
  if (flag("--tot")) await tot();
} catch (e) {
  cek("ran without crashing", false, e.stack ?? e.message);
}
const gagal = hasil.filter((h) => !h.ok).length;
console.log(`\n${hasil.length - gagal}/${hasil.length} passed`);
process.exit(gagal ? 1 : 0);
