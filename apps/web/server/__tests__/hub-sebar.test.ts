/**
 * Load smoothing in the topic hub (15 Nov 2026): past a threshold of sockets a broadcast reaches them in
 * slices a few ms apart, so the pages do not all fetch again in the same instant. Real sockets, fake
 * `setTimeout` only (the sockets' own I/O does not use it), so the slice delays are exact.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { buatHubSiaran, IRISAN } from "../hub/siaran.js";
import { buatPengarah } from "../upgrade.js";

// Captured before any test fakes the timer, for waiting on real network delivery.
const nyata = globalThis.setTimeout;
const tunggu = (ms: number) => new Promise<void>((r) => nyata(r, ms));

let tutup: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  tutup.forEach((f) => f());
  tutup = [];
});

async function pasang(opsi: Parameters<typeof buatHubSiaran>[0], jumlah: number) {
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
  const klien: Array<{ ws: WebSocket; n: number[] }> = [];
  for (let i = 0; i < jumlah; i++) {
    const c = { ws: new WebSocket(`ws://127.0.0.1:${port}/siaran`), n: [] as number[] };
    c.ws.on("message", (d) => {
      const m = JSON.parse(d.toString()) as { n: number; w?: number; t?: string[] };
      if (!m.w) c.n.push(m.n);
    });
    await new Promise<void>((ok, no) => {
      c.ws.once("open", () => ok());
      c.ws.once("error", no);
    });
    tutup.push(() => c.ws.terminate());
    klien.push(c);
  }
  await tunggu(40);
  return { hub, klien };
}

const sudah = (k: Array<{ n: number[] }>) => k.filter((c) => c.n.length > 0).length;

describe("hub load smoothing", () => {
  it("sends one slice at once and the rest a little later, and still says how many it targets", async () => {
    // 24 sockets, threshold 0: the spread is min(700, 24) = 24 ms over 8 slices of 3 sockets.
    const { hub, klien } = await pasang({ sebarMaksMs: 700, sebarAmbang: 0 }, 24);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(hub.publish(["sesi"])).toBe(24);
    await tunggu(60);
    expect(sudah(klien)).toBe(24 / IRISAN);
    await vi.advanceTimersByTimeAsync(10);
    await tunggu(60);
    const tengah = sudah(klien);
    expect(tengah).toBeGreaterThan(24 / IRISAN);
    expect(tengah).toBeLessThan(24);
    await vi.advanceTimersByTimeAsync(20);
    await tunggu(60);
    expect(sudah(klien)).toBe(24);
    expect(hub.statistik().terkirim).toBe(24);
  });

  it("keeps each socket's messages in order when a second broadcast comes during the spread", async () => {
    const { hub, klien } = await pasang({ sebarMaksMs: 700, sebarAmbang: 0 }, 16);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hub.publish(["sesi"]);
    await vi.advanceTimersByTimeAsync(5);
    hub.publish(["nilai"]);
    await vi.advanceTimersByTimeAsync(100);
    await tunggu(80);
    for (const c of klien) expect(c.n).toEqual([1, 2]);
  });

  it("does not delay a hub under the threshold, or one told not to spread", async () => {
    const a = await pasang({ sebarMaksMs: 700, sebarAmbang: 16 }, 16);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(a.hub.publish(["sesi"])).toBe(16);
    await tunggu(60);
    expect(sudah(a.klien)).toBe(16);

    const b = await pasang({ sebarMaksMs: 0, sebarAmbang: 0 }, 16);
    expect(b.hub.publish(["sesi"])).toBe(16);
    await tunggu(60);
    expect(sudah(b.klien)).toBe(16);
  });

  it("never waits longer than the cap, however many sockets", async () => {
    // 40 sockets over the threshold would be 40 ms; the cap says 12 ms.
    const { hub, klien } = await pasang({ sebarMaksMs: 12, sebarAmbang: 0 }, 40);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hub.publish(["sesi"]);
    await vi.advanceTimersByTimeAsync(12);
    await tunggu(80);
    expect(sudah(klien)).toBe(40);
  });

  it("drops waiting slices when the hub closes, without sending to closed sockets", async () => {
    const { hub, klien } = await pasang({ sebarMaksMs: 700, sebarAmbang: 0 }, 16);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hub.publish(["sesi"]);
    hub.tutup();
    await vi.advanceTimersByTimeAsync(1000);
    await tunggu(60);
    expect(sudah(klien)).toBeLessThan(16);
    expect(vi.getTimerCount()).toBe(0);
  });
});
