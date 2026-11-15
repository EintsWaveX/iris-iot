import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { jalankanFanout, minta, persentil, topikUnik } from "../../scripts/fanout-lib.mjs";

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
