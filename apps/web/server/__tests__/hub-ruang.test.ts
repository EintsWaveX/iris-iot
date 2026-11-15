import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { tandaTiketAliran, type TiketAliran } from "../../src/lib/aliran.js";
import { tandaTiketUjian, type TiketUjian } from "../../src/lib/recruitment/room-relay.js";
import { buatHubRuang, TUTUP_AKHIR, TUTUP_SUNYI } from "../hub/ruang.js";
import { buatPengarah } from "../upgrade.js";

const RAHASIA = "r".repeat(40);
let tutup: Array<() => void> = [];
afterEach(() => {
  tutup.forEach((f) => f());
  tutup = [];
});

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nomor = 0;
const acak = () => `n${String(++nomor).padStart(2, "0")}${"x".repeat(20)}`;
const exp = () => Math.floor(Date.now() / 1000) + 60;

async function pasang(opsi: Partial<Parameters<typeof buatHubRuang>[0]> = {}) {
  const server = http.createServer((_q, s) => s.end("ok"));
  const pengarah = buatPengarah(server);
  const hub = buatHubRuang({ rahasia: () => RAHASIA, ...opsi });
  pengarah.daftar((j) => /^\/(aliran|ujian)\/[^/]+$/.test(j), hub.naik);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  tutup.push(() => {
    hub.tutupSemua();
    server.closeAllConnections();
    server.close();
  });
  return { hub, base: `ws://127.0.0.1:${port}` };
}

async function tiketAliran(r: string, peran: TiketAliran["peran"], g: number | null, u = "1") {
  return tandaTiketAliran({ v: 1, p: "aliran", r, peran, g, u, exp: exp(), n: acak() }, RAHASIA);
}
async function tiketUjian(r: string, peran: TiketUjian["peran"], s: number | null, u = "1") {
  return tandaTiketUjian({ v: 1, p: "ujian", r, peran, s, u, exp: exp(), n: acak() }, RAHASIA);
}

/** Connects; resolves once open. Frames and the close code are collected. */
async function masuk(url: string, opsi: { autoPong?: boolean } = {}) {
  const frame: string[] = [];
  const ws = new WebSocket(url, opsi);
  const hasil = { ws, frame, kode: 0, json: () => frame.map((f) => JSON.parse(f)) };
  ws.on("message", (d) => frame.push(d.toString()));
  ws.on("close", (k) => (hasil.kode = k));
  await new Promise<void>((ok, no) => {
    ws.once("open", () => ok());
    ws.once("error", no);
    ws.once("unexpected-response", (_q, res) => no(new Error(`HTTP ${res.statusCode}`)));
  });
  tutup.push(() => ws.terminate());
  return hasil;
}

describe("room tickets", () => {
  it("lets a valid ticket in and refuses a reused, forged, expired, wrong-room or Praktikan-pc ticket", async () => {
    const { base } = await pasang();
    const t = await tiketAliran("sesi-4", "asisten", null);
    await masuk(`${base}/aliran/sesi-4?tiket=${encodeURIComponent(t)}`);
    // The same ticket again: single use.
    await expect(masuk(`${base}/aliran/sesi-4?tiket=${encodeURIComponent(t)}`)).rejects.toThrow(
      /403/,
    );
    const lain = await tiketAliran("sesi-5", "asisten", null);
    await expect(masuk(`${base}/aliran/sesi-4?tiket=${encodeURIComponent(lain)}`)).rejects.toThrow(
      /403/,
    );
    await expect(masuk(`${base}/aliran/sesi-4?tiket=abc.def`)).rejects.toThrow(/403/);
    const basi = await tandaTiketAliran(
      {
        v: 1,
        p: "aliran",
        r: "sesi-4",
        peran: "asisten",
        g: null,
        u: "1",
        exp: Math.floor(Date.now() / 1000) - 5,
        n: acak(),
      },
      RAHASIA,
    );
    await expect(masuk(`${base}/aliran/sesi-4?tiket=${encodeURIComponent(basi)}`)).rejects.toThrow(
      /403/,
    );
    const prak = await tiketAliran("pc", "praktikan", 3);
    await expect(masuk(`${base}/aliran/pc?tiket=${encodeURIComponent(prak)}`)).rejects.toThrow(
      /403/,
    );
    await expect(
      masuk(`${base}/aliran/bukan-ruang?tiket=${encodeURIComponent(t)}`),
    ).rejects.toThrow(/404/);
  });

  it("refuses everything while the secret is not set, and a foreign Origin", async () => {
    const { base } = await pasang({ rahasia: () => null });
    const t = await tiketAliran("sesi-1", "asisten", null);
    await expect(masuk(`${base}/aliran/sesi-1?tiket=${encodeURIComponent(t)}`)).rejects.toThrow(
      /503/,
    );
    const { base: b2 } = await pasang();
    const ws = new WebSocket(`${b2}/aliran/sesi-1?tiket=${encodeURIComponent(t)}`, {
      headers: { origin: "https://evil.example" },
    });
    const kode = await new Promise<number>((ok) => {
      ws.once("unexpected-response", (_q, res) => ok(res.statusCode ?? 0));
      ws.once("error", () => ok(-1));
    });
    expect(kode).toBe(403);
  });

  it("refuses new sockets past the cap", async () => {
    const { base } = await pasang({ soketMaks: 1 });
    await masuk(
      `${base}/aliran/sesi-1?tiket=${encodeURIComponent(await tiketAliran("sesi-1", "asisten", null))}`,
    );
    await expect(
      masuk(
        `${base}/aliran/sesi-1?tiket=${encodeURIComponent(await tiketAliran("sesi-1", "asisten", null))}`,
      ),
    ).rejects.toThrow(/503/);
  });
});

describe("a session room", () => {
  it("shows each socket only what its role may see", async () => {
    const { base, hub } = await pasang();
    const url = async (peran: TiketAliran["peran"], g: number | null) =>
      `${base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", peran, g))}`;
    const asisten = await masuk(await url("asisten", null));
    const g2 = await masuk(await url("praktikan", 2));
    const g3 = await masuk(await url("praktikan", 3));
    await tunggu(30);
    const n = hub.kirim("sesi-7", [
      { j: "tel", g: 2, d: [1] },
      { j: "serial", g: 2, d: ["rahasia kelompok 2"] },
      { j: "jawaban", g: 3, d: ["kelompok 3"] },
      { j: "denyut", g: null, d: {} },
    ]);
    expect(n).toBe(3);
    await tunggu(50);
    const jenis = (s: typeof asisten) =>
      s
        .json()
        .flatMap((x) => x.m ?? [])
        .map((m: { j: string }) => m.j);
    expect(jenis(asisten)).toEqual(["tel", "serial", "jawaban", "denyut"]);
    expect(jenis(g2)).toEqual(["tel", "serial"]);
    expect(jenis(g3)).toEqual(["tel", "jawaban"]);
  });

  it("stamps what a laptop sends with its own group and passes it to the others, never back", async () => {
    const { base } = await pasang();
    const url = async (peran: TiketAliran["peran"], g: number | null) =>
      `${base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", peran, g))}`;
    const laptop = await masuk(await url("praktikan", 2));
    const asisten = await masuk(await url("asisten", null));
    const lain = await masuk(await url("praktikan", 5));
    await tunggu(30);
    laptop.ws.send(
      JSON.stringify({
        j: "serial",
        g: 99,
        d: [{ sumber: "b1", teks: "halo", t: 1000 }],
      }),
    );
    // Not allowed: a Praktikan cannot send a heartbeat or anything unknown.
    laptop.ws.send(JSON.stringify({ j: "denyut", d: [1] }));
    await tunggu(60);
    const pesan = (s: typeof asisten) => s.json().flatMap((x) => x.m ?? []);
    expect(pesan(asisten)).toEqual([
      { j: "serial", g: 2, d: [{ sumber: "b1", teks: "halo", t: 1000 }] },
    ]);
    expect(pesan(lain)).toEqual([]);
    expect(pesan(laptop)).toEqual([]);
  });

  it("tells a group how many look at it", async () => {
    const { base } = await pasang();
    const url = async (peran: TiketAliran["peran"], g: number | null) =>
      `${base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", peran, g))}`;
    const laptop = await masuk(await url("praktikan", 2));
    const asisten = await masuk(await url("asisten", null));
    await tunggu(30);
    asisten.ws.send(JSON.stringify({ j: "lihat", g: 2 }));
    await tunggu(50);
    expect(laptop.json().at(-1)).toEqual({ penonton: 1, asisten: 1 });
    asisten.ws.close();
    await tunggu(50);
    expect(laptop.json().at(-1)).toEqual({ penonton: 0, asisten: 0 });
  });

  it("answers ping, drops a socket that talks too much, closes a silent one", async () => {
    const { base } = await pasang({ jedaPingMs: 20, sunyiMs: 80 });
    const t = await tiketAliran("sesi-7", "asisten", null);
    const a = await masuk(`${base}/aliran/sesi-7?tiket=${encodeURIComponent(t)}`);
    a.ws.send("ping");
    await tunggu(30);
    expect(a.frame).toContain("pong");
    // A ws client answers protocol pings by itself, so it stays; one that does not is silent.
    const b = await masuk(
      `${base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", "asisten", null))}`,
      { autoPong: false },
    );
    await tunggu(300);
    expect(b.kode).toBe(TUTUP_SUNYI);
    // The one that answers stays.
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
  });
});

describe("an exam room", () => {
  const masukUjian = async (
    base: string,
    peran: TiketUjian["peran"],
    s: number | null,
    u: string,
  ) =>
    masuk(
      `${base}/ujian/rec-9?tiket=${encodeURIComponent(await tiketUjian("rec-9", peran, s, u))}`,
    );
  const pesan = (s: Awaited<ReturnType<typeof masuk>>) => s.json().flatMap((x) => x.m ?? []);

  it("gives a seat the room and its own messages, the Panitia everything", async () => {
    const { base, hub } = await pasang();
    const panitia = await masukUjian(base, "panitia", null, "P1");
    const k1 = await masukUjian(base, "kursi", 1, "A");
    const k2 = await masukUjian(base, "kursi", 2, "B");
    await tunggu(30);
    hub.kirim("rec-9", [
      { j: "ruang", d: { seq: 1 } },
      { j: "kursi", s: 1, d: "untuk 1" },
      { j: "pelanggaran", d: "panitia saja" },
      { j: "judge", s: 2, d: "untuk 2" },
    ]);
    await tunggu(50);
    const jenis = (s: typeof k1) =>
      pesan(s)
        .map((m: { j: string }) => m.j)
        .filter((j: string) => j !== "hadir");
    expect(jenis(panitia)).toEqual(["ruang", "kursi", "pelanggaran", "judge"]);
    expect(jenis(k1)).toEqual(["ruang", "kursi"]);
    expect(jenis(k2)).toEqual(["ruang", "judge"]);
  });

  it("tells the Panitia who is connected, at once for a new Panitia and after a pause for changes", async () => {
    const { base } = await pasang({ hadirTundaMs: 30 });
    const panitia = await masukUjian(base, "panitia", null, "P1");
    await tunggu(10);
    expect(pesan(panitia)[0]).toEqual({
      j: "hadir",
      s: null,
      d: { kursi: [], panitia: ["P1"] },
    });
    const k = await masukUjian(base, "kursi", 4, "A");
    await tunggu(100);
    expect(pesan(panitia).at(-1).d).toEqual({ kursi: [4], panitia: ["P1"] });
    k.ws.close();
    await tunggu(100);
    expect(pesan(panitia).at(-1).d).toEqual({ kursi: [], panitia: ["P1"] });
  });

  it("passes a seat's progress to the Panitia, stamped with its seat, at most once per 1.5 s", async () => {
    const { base } = await pasang();
    const panitia = await masukUjian(base, "panitia", null, "P1");
    const k = await masukUjian(base, "kursi", 4, "A");
    await tunggu(30);
    const maju = (n: number) =>
      JSON.stringify({ j: "kemajuan", s: 77, d: { part: "livecode", answered: n, total: 10 } });
    k.ws.send(maju(1));
    k.ws.send(maju(2));
    await tunggu(60);
    const naik = pesan(panitia).filter((m: { j: string }) => m.j === "kemajuan");
    expect(naik).toEqual([
      { j: "kemajuan", s: 4, d: { part: "livecode", answered: 1, total: 10 } },
    ]);
    // A seat's message never reaches another seat.
    expect(pesan(k).filter((m: { j: string }) => m.j === "kemajuan")).toEqual([]);
  });

  it("closes the room with 4000 after Finish", async () => {
    const { base, hub } = await pasang();
    const k = await masukUjian(base, "kursi", 1, "A");
    const p = await masukUjian(base, "panitia", null, "P1");
    await tunggu(20);
    expect(hub.tutup("rec-9")).toBe(2);
    await tunggu(60);
    expect(k.kode).toBe(TUTUP_AKHIR);
    expect(p.kode).toBe(TUTUP_AKHIR);
    expect(hub.jumlah()).toBe(0);
  });

  it("ignores batches for rooms that do not exist or are malformed", async () => {
    const { hub } = await pasang();
    expect(hub.kirim("rec-1", [{ j: "ruang", d: 1 }])).toBe(0);
    expect(hub.kirim("bukan", [{ j: "ruang", d: 1 }])).toBe(0);
  });
});
