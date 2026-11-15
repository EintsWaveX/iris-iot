import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import {
  bingkaiRuang,
  buatTiket,
  bulatanDariRuang,
  jalankanFanout,
  minta,
  persentil,
  tiketRuang,
  topikUnik,
} from "../../scripts/fanout-lib.mjs";
import { cekTiketAliran } from "../../src/lib/aliran.js";
import { cekTiketUjian } from "../../src/lib/recruitment/room-relay.js";
import { buatHubRuang } from "../hub/ruang.js";
import type { RuangFanout } from "../../scripts/fanout-lib.mjs";
import { buatPengarah } from "../upgrade.js";

let tutup: Array<() => void> = [];
afterEach(() => {
  tutup.forEach((f) => f());
  tutup = [];
});

/** A stand-in live room: sockets listen, POST /kirim announces the topics to `siapa` of them. */
async function ruangPalsu(siapa: (semua: WebSocket[]) => WebSocket[] = (s) => s) {
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      for (const ws of siapa([...wss.clients])) ws.send(b);
      res.end("ok");
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => ws.on("message", (m) => m.toString() === "ping" && ws.send("pong")));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  tutup.push(() => {
    wss.clients.forEach((c) => c.terminate());
    server.close();
  });
  const port = (server.address() as AddressInfo).port;
  return { ws: `ws://127.0.0.1:${port}/siaran`, kirim: `http://127.0.0.1:${port}/kirim` };
}

describe("fanout helpers", () => {
  it("percentiles read from sorted values and unique topics fit the relay's rule", () => {
    expect(persentil([], 50)).toBe(0);
    expect(persentil([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(persentil([1, 2, 3, 4, 100], 99)).toBe(100);
    for (let i = 0; i < 50; i++) expect(topikUnik()).toMatch(/^[a-z]{2,16}$/);
    expect(topikUnik()).not.toBe(topikUnik());
  });

  it("signs a Worker announcement with HMAC and a hub one with a bearer token", () => {
    const h = minta({ mode: "hmac", url: "x", rahasia: "s".repeat(32) }, "abc");
    expect(h.header["x-siaran-tanda"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(h.badan)).toEqual({ t: ["abc"] });
    const b = minta({ mode: "bearer", url: "x", rahasia: "tok" }, "abc");
    expect(b.header.authorization).toBe("Bearer tok");
  });
});

describe("jalankanFanout", () => {
  it("measures every socket hearing every announcement", async () => {
    const r = await ruangPalsu();
    const h = await jalankanFanout({
      url: r.ws,
      soket: 20,
      putaran: 3,
      jeda: 5,
      tungguAkhir: 80,
      rampa: 20,
      emit: { mode: "bearer", url: r.kirim, rahasia: "tok" },
    });
    expect(h.soketTersambung).toBe(20);
    expect(h).toMatchObject({
      gagalSambung: 0,
      putaran: 3,
      emitGagal: 0,
      diharap: 60,
      diterima: 60,
      hilang: 0,
    });
    expect(h.latensiMs.p99).toBeGreaterThanOrEqual(0);
    expect(h.latensiMs.p99).toBeLessThan(1000);
  });

  it("reports deliveries that never arrived", async () => {
    const r = await ruangPalsu((s) => s.slice(0, 5));
    const h = await jalankanFanout({
      url: r.ws,
      soket: 10,
      putaran: 2,
      jeda: 5,
      tungguAkhir: 80,
      rampa: 10,
      emit: { mode: "bearer", url: r.kirim, rahasia: "tok" },
    });
    expect(h.diharap).toBe(20);
    expect(h.diterima).toBe(10);
    expect(h.hilang).toBe(10);
  });

  it("counts sockets that could not connect", async () => {
    const h = await jalankanFanout({
      url: "ws://127.0.0.1:1/siaran",
      soket: 3,
      putaran: 0,
      jeda: 0,
      tahan: 0,
      rampa: 3,
    });
    expect(h.soketTersambung).toBe(0);
    expect(h.gagalSambung).toBe(3);
  });
});

describe("rooms mode", () => {
  const RAHASIA = "f".repeat(40);

  /** The real room hub behind the real upgrade dispatcher. */
  async function hubNyata() {
    const server = http.createServer((_q, r) => r.end("ok"));
    const pengarah = buatPengarah(server);
    const hub = buatHubRuang({ rahasia: () => RAHASIA });
    pengarah.daftar((j) => /^\/(aliran|ujian)\/[^/]+$/.test(j), hub.naik);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    tutup.push(() => {
      hub.tutupSemua();
      server.closeAllConnections();
      server.close();
    });
    return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("signs tickets the server's own checker accepts, one per socket, for both room kinds", async () => {
    const a: RuangFanout = { jenis: "aliran", nama: "sesi-999001", rahasia: RAHASIA };
    const t0 = await cekTiketAliran(tiketRuang(a, 0, RAHASIA), RAHASIA, "sesi-999001");
    const t5 = await cekTiketAliran(tiketRuang(a, 5, RAHASIA), RAHASIA, "sesi-999001");
    expect(t0).toMatchObject({ ok: true, tiket: { peran: "praktikan", g: 1 } });
    expect(t5).toMatchObject({ ok: true, tiket: { peran: "praktikan" } });
    expect(t0.ok && t5.ok && t0.tiket.n !== t5.tiket.n).toBe(true);
    const u: RuangFanout = { jenis: "ujian", nama: "rec-999001", rahasia: RAHASIA };
    expect(await cekTiketUjian(tiketRuang(u, 0, RAHASIA), RAHASIA, "rec-999001")).toMatchObject({
      ok: true,
      tiket: { peran: "kursi", s: 1 },
    });
    expect(await cekTiketUjian(tiketRuang(u, 3, RAHASIA), RAHASIA, "rec-999001")).toMatchObject({
      ok: true,
      tiket: { peran: "panitia", s: null },
    });
    expect(buatTiket({ a: 1 }, RAHASIA)).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it("reads the round out of what the room sends back", () => {
    const a: RuangFanout = { jenis: "aliran", nama: "sesi-1", rahasia: RAHASIA };
    const u: RuangFanout = { jenis: "ujian", nama: "rec-1", rahasia: RAHASIA };
    expect(
      bulatanDariRuang(a, JSON.stringify({ m: [{ j: "tel", g: 1, d: [{ seq: 7 }] }] })),
    ).toEqual(["7"]);
    expect(bulatanDariRuang(a, JSON.stringify({ penonton: 2, asisten: 0 }))).toEqual([]);
    expect(bulatanDariRuang(a, "not json")).toEqual([]);
    expect(
      bulatanDariRuang(u, JSON.stringify({ m: [{ j: "kemajuan", s: 1, d: { answered: 4 } }] })),
    ).toEqual(["4"]);
    expect(bulatanDariRuang(u, JSON.stringify({ m: [{ j: "hadir", d: {} }] }))).toEqual([]);
    expect(JSON.parse(bingkaiRuang(a, 3)).d[0].seq).toBe(3);
  });

  it("measures a session room end to end against the real hub, nothing lost", async () => {
    const base = await hubNyata();
    const h = await jalankanFanout({
      url: base,
      soket: 30,
      putaran: 4,
      jeda: 5,
      tungguAkhir: 150,
      rampa: 30,
      ruang: { jenis: "aliran", nama: "sesi-999001", rahasia: RAHASIA },
    });
    expect(h).toMatchObject({
      ruang: "aliran/sesi-999001",
      soketTersambung: 30,
      gagalSambung: 0,
      putaran: 4,
      emitGagal: 0,
      diharap: 4 * 29,
      diterima: 4 * 29,
      hilang: 0,
    });
  });

  it("measures an exam room: one seat sends progress, the Panitia consoles all hear it", async () => {
    const base = await hubNyata();
    const h = await jalankanFanout({
      url: base,
      soket: 12,
      putaran: 2,
      jeda: 5,
      tungguAkhir: 150,
      rampa: 12,
      ruang: { jenis: "ujian", nama: "rec-999001", rahasia: RAHASIA },
    });
    expect(h).toMatchObject({ soketTersambung: 12, putaran: 2, diharap: 2 * 11, hilang: 0 });
  });

  it("is refused by a hub with a different secret", async () => {
    const base = await hubNyata();
    const h = await jalankanFanout({
      url: base,
      soket: 3,
      putaran: 1,
      jeda: 0,
      tahan: 0,
      rampa: 3,
      ruang: { jenis: "aliran", nama: "sesi-999001", rahasia: "z".repeat(40) },
    }).catch((e: Error) => e);
    // Nobody got in, so there is no sender either.
    expect(h).toBeInstanceOf(Error);
  });
});
