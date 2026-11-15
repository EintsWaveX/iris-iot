/**
 * Real-time fan-out load test (real-time upgrade, Phase 0): opens N listener sockets on a live-update
 * room, makes the server announce a unique topic M times, and measures how long every socket took to hear
 * each one (p50/p95/p99/max), how many deliveries went missing, and how long the sockets took to connect.
 *
 * Rooms mode (Phase 7): the same measurement on a session room (/aliran/sesi-N) or an exam room
 * (/ujian/rec-N). Every socket enters with a ticket this script signs (KONSOL_RELAY_SECRET, from the
 * environment); socket 0 is the sender, and each round it sends one frame the room fans out to all the
 * others (a `tel` board reading in a session room, a seat's `kemajuan` in an exam room), so no API
 * route and no database is involved and the numbers are the room hub's own.
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

const b64u = (b) => Buffer.from(b).toString("base64url");

/** A room ticket, as src/lib/tanda.ts signs it: base64url(JSON).base64url(HMAC-SHA256 over that part). */
export function buatTiket(isi, rahasia) {
  const badan = b64u(JSON.stringify(isi));
  return `${badan}.${createHmac("sha256", rahasia).update(badan).digest("base64url")}`;
}

/** The ticket for socket `i` of a rooms run: socket 0 sends, the rest listen. */
export function tiketRuang(ruang, i, rahasia, now = Date.now()) {
  const dasar = {
    v: 1,
    exp: Math.floor(now / 1000) + 60,
    n: randomBytes(18).toString("base64url"),
  };
  if (ruang.jenis === "ujian") {
    // Seat 1 sends its progress; the others are Panitia consoles, which hear every seat.
    return buatTiket(
      {
        ...dasar,
        p: "ujian",
        r: ruang.nama,
        peran: i === 0 ? "kursi" : "panitia",
        s: i === 0 ? 1 : null,
        u: `fanout${i}`,
      },
      rahasia,
    );
  }
  // A Praktikan of group 1 sends board readings; every Praktikan in the room hears `tel`.
  return buatTiket(
    {
      ...dasar,
      p: "aliran",
      r: ruang.nama,
      peran: "praktikan",
      g: i === 0 ? 1 : 2 + (i % 90),
      u: `fanout${i}`,
    },
    rahasia,
  );
}

/** The frame the sender puts into the room for round `r` (1-based), and where the receivers find `r` again. */
export function bingkaiRuang(ruang, r) {
  if (ruang.jenis === "ujian") {
    // answered <= total <= 200, so a run has at most 200 rounds
    return JSON.stringify({ j: "kemajuan", d: { part: "logika", answered: r, total: 200 } });
  }
  return JSON.stringify({
    j: "tel",
    d: [{ seq: r, tx: "12:00:00:000", rx: null, delayMs: null, nilai: null }],
  });
}

/** Which round a frame from the room carries, as strings (null when it is not a round frame). */
export function bulatanDariRuang(ruang, teks) {
  let m;
  try {
    m = JSON.parse(teks)?.m;
  } catch {
    return [];
  }
  if (!Array.isArray(m)) return [];
  const hasil = [];
  for (const x of m) {
    if (ruang.jenis === "ujian") {
      if (x?.j === "kemajuan" && Number.isInteger(x?.d?.answered)) hasil.push(String(x.d.answered));
    } else if (x?.j === "tel" && Array.isArray(x.d)) {
      for (const b of x.d) if (Number.isInteger(b?.seq)) hasil.push(String(b.seq));
    }
  }
  return hasil;
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
  if (emit.mode === "metrik") {
    // The server's own manual announcement (POST /api/sehat?siarkan=1), gated by IRIS_METRIK_TOKEN.
    return {
      badan,
      header: { "content-type": "application/json", "x-metrik": emit.rahasia },
    };
  }
  throw new Error(`emit mode ${emit.mode}`);
}

/**
 * @param {{ url: string, soket: number, putaran: number, jeda: number, tahan?: number, rampa?: number, tungguAkhir?: number,
 *           emit?: { mode: "hmac"|"bearer", url: string, rahasia: string }, origin?: string,
 *           ruang?: { jenis: "aliran"|"ujian", nama: string, rahasia: string } }} o
 * With `ruang`, `url` is the server's base (ws://host:port) and no `emit` is used: socket 0 is the sender.
 */
export async function jalankanFanout(o) {
  const mulai = performance.now();
  const socks = [];
  const waktuSambung = [];
  let gagalSambung = 0;
  let terputus = 0;
  /** topic -> { t0, terima: number[] } */
  const putaran = new Map();

  let nomorSoket = 0;
  /** Socket 0 of a rooms run: the one that sends (null until it is open). */
  let pengirim = null;
  const urlRuang = (i) =>
    `${o.url.replace(/\/$/, "")}/${o.ruang.jenis}/${o.ruang.nama}?tiket=${encodeURIComponent(tiketRuang(o.ruang, i, o.ruang.rahasia))}`;

  const buka = () =>
    new Promise((selesai) => {
      const t0 = performance.now();
      const i = nomorSoket++;
      const ws = new WebSocket(
        o.ruang ? urlRuang(i) : o.url,
        o.origin ? { headers: { origin: o.origin } } : undefined,
      );
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
        if (o.ruang && i === 0) pengirim = ws;
        else socks.push(ws);
        selesai();
      });
      ws.on("message", (d) => {
        const t = performance.now();
        const teks = d.toString();
        if (teks === "pong") return;
        if (o.ruang) {
          for (const nama of bulatanDariRuang(o.ruang, teks)) {
            const p = putaran.get(nama);
            if (p) p.terima.push(t - p.t0);
          }
          return;
        }
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
    for (const s of [...socks, ...(pengirim ? [pengirim] : [])])
      if (s.readyState === WebSocket.OPEN) s.send("ping");
  }, 20_000);

  const hasil = [];
  if (o.ruang) {
    if (!pengirim) throw new Error("the sender socket (socket 0) did not connect");
    // An exam seat may send one progress frame every 1.5 s; the room drops faster ones.
    const gap = Math.max(o.jeda, o.ruang.jenis === "ujian" ? 1600 : 0);
    const rondeMaks = o.ruang.jenis === "ujian" ? 200 : Infinity;
    for (let r = 1; r <= Math.min(o.putaran, rondeMaks); r++) {
      const kunci = String(r);
      const p = { t0: 0, terima: [] };
      putaran.set(kunci, p);
      p.t0 = performance.now();
      let status = 200;
      try {
        pengirim.send(bingkaiRuang(o.ruang, r));
      } catch {
        status = -1;
      }
      await wait(o.tungguAkhir ?? 1500);
      hasil.push({ topik: kunci, status, rttEmit: 0, lat: p.terima });
      await wait(gap);
    }
  } else if (o.emit) {
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
  pengirim?.terminate();

  const semua = hasil.flatMap((h) => h.lat);
  // Every listener must hear every round (the sender is not told its own frame back).
  const diharap = hasil.length * socks.length;
  const rtts = hasil.map((h) => h.rttEmit);
  return {
    url: o.url,
    ruang: o.ruang ? `${o.ruang.jenis}/${o.ruang.nama}` : undefined,
    soketDiminta: o.soket,
    soketTersambung: socks.length + (pengirim ? 1 : 0),
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
