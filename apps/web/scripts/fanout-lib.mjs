/**
 * Real-time fan-out load test (real-time upgrade, Phase 0): opens N listener sockets on a live-update
 * room, makes the server announce a unique topic M times, and measures how long every socket took to hear
 * each one (p50/p95/p99/max), how many deliveries went missing, and how long the sockets took to connect.
 *
 * Node 22+, uses the `ws` package the site already depends on. The CLI is scripts/fanout.mjs.
 */
import { createHmac, randomBytes } from "node:crypto";
import { WebSocket } from "ws";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The p-th percentile (0-100) of a list of numbers, 0 when empty. */
export function persentil(nilai, p) {
  if (!nilai.length) return 0;
  const u = [...nilai].sort((a, b) => a - b);
  return u[Math.min(u.length - 1, Math.max(0, Math.ceil((p / 100) * u.length) - 1))];
}

const bulat = (x) => Math.round(x * 100) / 100;
const maks = (a) => a.reduce((m, x) => (x > m ? x : m), 0);

/** A topic name the relay accepts (/^[a-z]{2,16}$/) and nobody else uses. */
export function topikUnik() {
  const huruf = randomBytes(8)
    .toString("hex")
    .replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)]);
  return "zz" + huruf.slice(0, 10);
}

/** How a "make the server announce a topic" request is made: the current Worker relay signs with HMAC. */
export function minta(emit, topik) {
  const badan = JSON.stringify({ t: [topik] });
  if (emit.mode === "hmac") {
    const ts = String(Math.floor(Date.now() / 1000));
    const tanda = createHmac("sha256", emit.rahasia).update(`siaran|${badan}|${ts}`).digest("hex");
    return {
      badan,
      header: { "content-type": "application/json", "x-siaran-ts": ts, "x-siaran-tanda": tanda },
    };
  }
  if (emit.mode === "bearer") {
    return {
      badan,
      header: { "content-type": "application/json", authorization: `Bearer ${emit.rahasia}` },
    };
  }
  throw new Error(`emit mode ${emit.mode}`);
}

/**
 * @param {{ url: string, soket: number, putaran: number, jeda: number, tahan?: number, rampa?: number, tungguAkhir?: number,
 *           emit?: { mode: "hmac"|"bearer", url: string, rahasia: string }, origin?: string }} o
 */
export async function jalankanFanout(o) {
  const mulai = performance.now();
  const socks = [];
  const waktuSambung = [];
  let gagalSambung = 0;
  let terputus = 0;
  /** topic -> { t0, terima: number[] } */
  const putaran = new Map();

  const buka = () =>
    new Promise((selesai) => {
      const t0 = performance.now();
      const ws = new WebSocket(o.url, o.origin ? { headers: { origin: o.origin } } : undefined);
      let sudah = false;
      const tmr = setTimeout(() => {
        if (!sudah) gagalSambung++;
        sudah = true;
        ws.terminate();
        selesai();
      }, 15_000);
      ws.on("open", () => {
        sudah = true;
        clearTimeout(tmr);
        waktuSambung.push(performance.now() - t0);
        socks.push(ws);
        selesai();
      });
      ws.on("message", (d) => {
        const t = performance.now();
        const teks = d.toString();
        if (teks === "pong") return;
        let tema;
        try {
          tema = JSON.parse(teks).t;
        } catch {
          return;
        }
        if (!Array.isArray(tema)) return;
        for (const nama of tema) {
          const p = putaran.get(nama);
          if (p) p.terima.push(t - p.t0);
        }
      });
      ws.on("close", () => {
        if (socks.includes(ws)) terputus++;
      });
      ws.on("error", () => {
        clearTimeout(tmr);
        if (!sudah) gagalSambung++;
        sudah = true;
        selesai();
      });
    });

  // Open in batches (rampa per second) so the test measures the room, not a connection storm.
  const rampa = o.rampa ?? 100;
  for (let i = 0; i < o.soket; i += rampa) {
    const n = Math.min(rampa, o.soket - i);
    await Promise.all(Array.from({ length: n }, () => buka()));
    if (i + n < o.soket) await wait(1000);
  }
  const ping = setInterval(() => {
    for (const s of socks) if (s.readyState === WebSocket.OPEN) s.send("ping");
  }, 20_000);

  const hasil = [];
  if (o.emit) {
    for (let r = 0; r < o.putaran; r++) {
      const topik = topikUnik();
      const p = { t0: 0, terima: [] };
      putaran.set(topik, p);
      const { badan, header } = minta(o.emit, topik);
      p.t0 = performance.now();
      let status = 0;
      let rtt = 0;
      try {
        const res = await fetch(o.emit.url, { method: "POST", headers: header, body: badan });
        status = res.status;
        await res.arrayBuffer();
        rtt = performance.now() - p.t0;
      } catch {
        status = -1;
      }
      // Give stragglers a moment before counting a delivery as missing.
      await wait(o.tungguAkhir ?? 1500);
      hasil.push({ topik, status, rttEmit: rtt, lat: p.terima });
      await wait(o.jeda);
    }
  } else {
    await wait((o.tahan ?? 10) * 1000);
  }
  clearInterval(ping);
  const hidup = socks.filter((s) => s.readyState === WebSocket.OPEN).length;
  for (const s of socks) s.terminate();

  const semua = hasil.flatMap((h) => h.lat);
  const diharap = hasil.length * socks.length;
  const rtts = hasil.map((h) => h.rttEmit);
  return {
    url: o.url,
    soketDiminta: o.soket,
    soketTersambung: socks.length,
    gagalSambung,
    terputusSelama: terputus,
    hidupDiAkhir: hidup,
    sambungMs: {
      p50: bulat(persentil(waktuSambung, 50)),
      p95: bulat(persentil(waktuSambung, 95)),
      maks: bulat(maks(waktuSambung)),
    },
    putaran: hasil.length,
    emitGagal: hasil.filter((h) => h.status < 200 || h.status >= 300).length,
    rttEmitMs: { p50: bulat(persentil(rtts, 50)), maks: bulat(maks(rtts)) },
    diharap,
    diterima: semua.length,
    hilang: diharap - semua.length,
    latensiMs: {
      p50: bulat(persentil(semua, 50)),
      p95: bulat(persentil(semua, 95)),
      p99: bulat(persentil(semua, 99)),
      maks: bulat(maks(semua)),
    },
    totalDetik: bulat((performance.now() - mulai) / 1000),
  };
}
