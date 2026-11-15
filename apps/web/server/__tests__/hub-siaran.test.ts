import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { buatHubSiaran, RING } from "../hub/siaran.js";
import { buatPengarah } from "../upgrade.js";

let tutup: Array<() => void> = [];
afterEach(() => {
  tutup.forEach((f) => f());
  tutup = [];
});

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A real HTTP server with the hub at /siaran behind the upgrade dispatcher. */
async function pasang(opsi: Parameters<typeof buatHubSiaran>[0] = {}) {
  const server = http.createServer((_q, s) => s.end("ok"));
  const pengarah = buatPengarah(server);
  const hub = buatHubSiaran(opsi);
  pengarah.daftar((j) => j === "/siaran", hub.naik);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  tutup.push(() => {
    hub.tutup();
    server.closeAllConnections();
    server.close();
  });
  return { hub, port, url: `ws://127.0.0.1:${port}/siaran` };
}

/** Connects and collects every frame; resolves once open. */
async function dengar(url: string, headers?: Record<string, string>) {
  const frame: string[] = [];
  const ws = new WebSocket(url, { headers });
  ws.on("message", (d) => frame.push(d.toString()));
  await new Promise<void>((ok, no) => {
    ws.once("open", () => ok());
    ws.once("error", no);
    ws.once("unexpected-response", (_q, res) => no(new Error(`HTTP ${res.statusCode}`)));
  });
  tutup.push(() => ws.terminate());
  return { ws, frame, json: () => frame.map((f) => JSON.parse(f)) };
}

describe("the topic hub", () => {
  it("greets a new socket and delivers a publish to every socket", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    const b = await dengar(url);
    await tunggu(30);
    expect(a.json()[0]).toMatchObject({ n: 0, w: 1 });
    expect(a.json()[0]).not.toHaveProperty("semua");
    expect(hub.publish(["sesi", "nilai"])).toBe(2);
    await tunggu(50);
    for (const s of [a, b]) expect(s.json().at(-1)).toEqual({ t: ["sesi", "nilai"], n: 1 });
  });

  it("drops invalid and repeated topic names, and announces nothing for an empty list", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    expect(hub.publish(["Sesi", "x", "has-hyphen", "../etc"])).toBe(0);
    expect(hub.publish([])).toBe(0);
    expect(hub.publish(["sesi", "sesi", "OK1", "nilai"])).toBe(1);
    await tunggu(50);
    expect(a.json().at(-1)).toEqual({ t: ["sesi", "nilai"], n: 1 });
  });

  it("answers a text ping with pong", async () => {
    const { url } = await pasang();
    const a = await dengar(url);
    a.ws.send("ping");
    await tunggu(50);
    expect(a.frame).toContain("pong");
  });

  it("tells a reconnecting page only what it missed", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    const e = (a.json()[0] as { e: string }).e;
    hub.publish(["sesi"]);
    hub.publish(["nilai"]);
    hub.publish(["sesi", "tim"]);
    const b = await dengar(`${url}?sejak=1&e=${e}`);
    await tunggu(40);
    expect(b.json()[0]).toMatchObject({ n: 3, w: 1, t: ["nilai", "sesi", "tim"] });
    const c = await dengar(`${url}?sejak=3&e=${e}`);
    await tunggu(40);
    expect(c.json()[0]).toEqual({ n: 3, e, w: 1 });
  });

  it("says 'fetch everything' after a restart or when the gap is older than the ring", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    const e = (a.json()[0] as { e: string }).e;
    const lain = await dengar(`${url}?sejak=2&e=deadbeef`);
    for (let i = 0; i < RING + 10; i++) hub.publish(["sesi"]);
    const lama = await dengar(`${url}?sejak=1&e=${e}`);
    const maju = await dengar(`${url}?sejak=99999&e=${e}`);
    await tunggu(60);
    expect(lain.json()[0]).toMatchObject({ w: 1, semua: true });
    expect(lama.json()[0]).toMatchObject({ w: 1, semua: true });
    expect(maju.json()[0]).toMatchObject({ w: 1, semua: true });
  });

  it("refuses a browser from another site, accepts the same site and a tool without Origin", async () => {
    const { port, url } = await pasang();
    await expect(dengar(url, { origin: "https://evil.example" })).rejects.toThrow("403");
    await dengar(url, { origin: `http://127.0.0.1:${port}` });
    await dengar(url);
  });

  it("can refuse a tool without Origin, and stops at the socket cap", async () => {
    const a = await pasang({ izinTanpaOrigin: false });
    await expect(dengar(a.url)).rejects.toThrow("403");
    const b = await pasang({ soketMaks: 2 });
    await dengar(b.url);
    await dengar(b.url);
    await expect(dengar(b.url)).rejects.toThrow("503");
  });

  it("drops a socket that talks too much", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    const kode = new Promise<number>((r) => a.ws.once("close", (c) => r(c)));
    for (let i = 0; i < 30; i++) a.ws.send("ping");
    expect(await kode).toBe(1008);
    await tunggu(20);
    expect(hub.jumlah()).toBe(0);
  });

  it("drops a socket that stops answering pings, and counts live sockets", async () => {
    const { hub, url } = await pasang({ jedaPingMs: 40 });
    const a = await dengar(url);
    // The client stops reading, so it never answers the server's ping.
    (a.ws as unknown as { _socket: { pause(): void } })._socket.pause();
    expect(hub.jumlah()).toBe(1);
    await tunggu(260);
    expect(hub.jumlah()).toBe(0);
  });

  it("closes every socket with 1001 when the server stops", async () => {
    const { hub, url } = await pasang();
    const a = await dengar(url);
    const kode = new Promise<number>((r) => a.ws.once("close", (c) => r(c)));
    hub.tutup();
    expect(await kode).toBe(1001);
  });

  it("reports what it has done", async () => {
    const { hub, url } = await pasang();
    await dengar(url);
    await dengar(url);
    hub.publish(["sesi"]);
    expect(hub.statistik()).toMatchObject({ soket: 2, nomor: 1, terkirim: 2 });
  });
});

describe("the upgrade dispatcher", () => {
  it("gives a path to its owner, 404s the rest, and survives a throwing handler", async () => {
    const server = http.createServer((_q, s) => s.end("ok"));
    const p = buatPengarah(server);
    p.daftar(
      (j) => j === "/boom",
      () => {
        throw new Error("boom");
      },
    );
    p.daftar(
      (j) => j === "/ok",
      (_req, socket) => {
        socket.write("HTTP/1.1 400 Teapot\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
      },
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    tutup.push(() => {
      server.closeAllConnections();
      server.close();
    });
    const port = (server.address() as AddressInfo).port;
    const status = (path: string) =>
      new Promise<number>((ok) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
        ws.once("unexpected-response", (_q, res) => ok(res.statusCode ?? 0));
        ws.once("error", () => ok(-1));
      });
    expect(await status("/nope")).toBe(404);
    expect(await status("/boom")).toBe(500);
    expect(await status("/ok")).toBe(400);
  });
});
