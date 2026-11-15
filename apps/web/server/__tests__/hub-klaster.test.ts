/**
 * Several workers without processes: each worker is a real http server with the real hubs, joined to one real
 * supervisor (server/klaster/utama.ts) through real bus clients (server/klaster/pekerja.ts), the way
 * server/main.ts joins them, with messages delivered a tick later like an IPC channel does.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { tandaTiketAliran, type TiketAliran } from "../../src/lib/aliran.js";
import { tandaTiketUjian, type TiketUjian } from "../../src/lib/recruitment/room-relay.js";
import { buatHubRuang } from "../hub/ruang.js";
import { buatHubSiaran } from "../hub/siaran.js";
import { buatBusPekerja } from "../klaster/pekerja.js";
import { buatUtama } from "../klaster/utama.js";
import { buatPengarah } from "../upgrade.js";

const RAHASIA = "k".repeat(40);
let tutup: Array<() => void> = [];
afterEach(() => {
  tutup.forEach((f) => f());
  tutup = [];
});
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nomor = 0;
const acak = () => `n${String(++nomor).padStart(2, "0")}${"x".repeat(20)}`;
const exp = () => Math.floor(Date.now() / 1000) + 60;
const tiketAliran = (r: string, peran: TiketAliran["peran"], g: number | null, u = "1") =>
  tandaTiketAliran({ v: 1, p: "aliran", r, peran, g, u, exp: exp(), n: acak() }, RAHASIA);
const tiketUjian = (r: string, peran: TiketUjian["peran"], s: number | null, u = "1") =>
  tandaTiketUjian({ v: 1, p: "ujian", r, peran, s, u, exp: exp(), n: acak() }, RAHASIA);

type Pekerja = {
  id: number;
  base: string;
  hub: ReturnType<typeof buatHubSiaran>;
  ruang: ReturnType<typeof buatHubRuang>;
  bus: ReturnType<typeof buatBusPekerja>;
};

/** One worker joined to `utama` the way server/main.ts joins it. */
async function tambahPekerja(utama: ReturnType<typeof buatUtama>, id: number): Promise<Pekerja> {
  const bus = buatBusPekerja({
    kirim: (m) => void queueMicrotask(() => utama.terima(id, m)),
  });
  const hub = buatHubSiaran({ urutan: (t) => bus.siarkan(t) });
  const ruang = buatHubRuang({
    rahasia: () => RAHASIA,
    hadirTundaMs: 20,
    sebar: {
      kirim: (r, m) => bus.kirimRuang(r, m),
      tutup: (r) => bus.tutupRuang(r),
      hadir: (r, i, info) => bus.hadir(r, i, info),
      pakaiNonce: (n, e) =>
        bus.sekali(`ruang:${n}`, Math.max(1000, e * 1000 - Date.now()) + 60_000),
    },
  });
  Object.assign(bus.penangan, {
    siar: (n: number, e: string, t: string[]) => void hub.terapkan(n, e, t),
    kirim: ruang.terimaKirim,
    tutup: (r: string) => void ruang.terimaTutup(r),
    hadir: ruang.terimaHadir,
    pergi: ruang.terimaPergi,
  });
  utama.daftar({ id, gen: 1, kirim: (m) => void queueMicrotask(() => bus.terima(m)) });
  const server = http.createServer((_q, s) => s.end("ok"));
  const pengarah = buatPengarah(server);
  pengarah.daftar((j) => j === "/siaran", hub.naik);
  pengarah.daftar((j) => /^\/(aliran|ujian)\/[^/]+$/.test(j), ruang.naik);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  tutup.push(() => {
    hub.tutup();
    ruang.tutupSemua();
    server.closeAllConnections();
    server.close();
  });
  const sk = await bus.halo();
  hub.sinkron(sk!.n, sk!.e, sk!.cincin);
  ruang.sinkronHadir(sk!.hadir);
  bus.siap(0);
  return { id, base: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`, hub, ruang, bus };
}

async function klaster(jumlah: number) {
  const utama = buatUtama({ epoch: "ep" });
  tutup.push(() => utama.hentikan());
  const pekerja: Pekerja[] = [];
  for (let id = 1; id <= jumlah; id++) pekerja.push(await tambahPekerja(utama, id));
  await tunggu(5);
  return Object.assign(pekerja, { utama });
}

async function masuk(url: string) {
  const frame: string[] = [];
  const ws = new WebSocket(url);
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

describe("the live-update hub across workers", () => {
  it("publishes on one worker and every worker's pages hear it, under one number", async () => {
    const [a, b, c] = await klaster(3);
    const sa = await masuk(`${a.base}/siaran`);
    const sb = await masuk(`${b.base}/siaran`);
    const sc = await masuk(`${c.base}/siaran`);
    b.hub.publish(["sesi", "nilai"]);
    await tunggu(40);
    for (const s of [sa, sb, sc]) {
      expect(s.json().at(-1)).toEqual({ t: ["sesi", "nilai"], n: 1 });
    }
    a.hub.publish(["jadwal"]);
    await tunggu(40);
    for (const s of [sa, sb, sc]) expect(s.json().at(-1)).toEqual({ t: ["jadwal"], n: 2 });
  });

  it("greets every page with the same epoch, and replays what a page missed whichever worker it returns to", async () => {
    const [a, b] = await klaster(2);
    const s1 = await masuk(`${a.base}/siaran`);
    a.hub.publish(["sesi"]);
    await tunggu(30);
    const n = s1.json().at(-1).n;
    s1.ws.close();
    b.hub.publish(["nilai"]);
    a.hub.publish(["jadwal"]);
    await tunggu(30);
    const s2 = await masuk(`${b.base}/siaran?sejak=${n}&e=ep`);
    await tunggu(20);
    const salam = s2.json()[0];
    expect(salam.e).toBe("ep");
    expect(salam.semua).toBeUndefined();
    expect([...salam.t].sort()).toEqual(["jadwal", "nilai"]);
  });

  it("starts a worker that joins late at the right number, able to replay what it missed", async () => {
    const k = await klaster(1);
    k[0].hub.publish(["sesi"]);
    k[0].hub.publish(["nilai"]);
    await tunggu(30);
    const baru = await tambahPekerja(k.utama, 2);
    expect(baru.hub.statistik()).toMatchObject({ nomor: 2, epoch: "ep" });
    const s = await masuk(`${baru.base}/siaran?sejak=1&e=ep`);
    await tunggu(20);
    expect(s.json()[0]).toMatchObject({ n: 2, e: "ep", t: ["nilai"] });
    // And it hears what is announced from now on, under the next number.
    k[0].hub.publish(["jadwal"]);
    await tunggu(30);
    expect(s.json().at(-1)).toEqual({ t: ["jadwal"], n: 3 });
  });

  it("does not deliver a stale or repeated number twice", () => {
    const hub = buatHubSiaran({ urutan: () => {} });
    expect(hub.terapkan(5, "x", ["sesi"])).toBe(0);
    expect(hub.statistik().nomor).toBe(5);
    expect(hub.terapkan(5, "x", ["sesi"])).toBe(0);
    expect(hub.statistik().nomor).toBe(5);
    expect(hub.terapkan(4, "x", ["nilai"])).toBe(0);
    expect(hub.statistik().nomor).toBe(5);
    hub.tutup();
  });
});

describe("the exam rooms across workers", () => {
  it("shows the Panitia every seat that is online, whichever worker holds it", async () => {
    const [a, b, c] = await klaster(3);
    const panitia = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "panitia", null, "P"))}`,
    );
    await masuk(
      `${b.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 2, "K2"))}`,
    );
    const k5 = await masuk(
      `${c.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 5, "K5"))}`,
    );
    await tunggu(80);
    const hadir = panitia
      .json()
      .flatMap((f) => f.m ?? [])
      .filter((m) => m.j === "hadir")
      .at(-1);
    expect(hadir.d).toEqual({ kursi: [2, 5], panitia: ["P"] });
    k5.ws.close();
    await tunggu(80);
    const hadir2 = panitia
      .json()
      .flatMap((f) => f.m ?? [])
      .filter((m) => m.j === "hadir")
      .at(-1);
    expect(hadir2.d.kursi).toEqual([2]);
  });

  it("lets a ticket in once for the whole cluster", async () => {
    const [a, b] = await klaster(2);
    const t = await tiketUjian("rec-3", "kursi", 1, "K1");
    await masuk(`${a.base}/ujian/rec-3?tiket=${encodeURIComponent(t)}`);
    await expect(masuk(`${b.base}/ujian/rec-3?tiket=${encodeURIComponent(t)}`)).rejects.toThrow(
      /403/,
    );
    await expect(masuk(`${a.base}/ujian/rec-3?tiket=${encodeURIComponent(t)}`)).rejects.toThrow(
      /403/,
    );
  });

  it("carries a seat's progress to the Panitia on another worker, and to no other seat", async () => {
    const [a, b] = await klaster(2);
    const panitia = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "panitia", null, "P"))}`,
    );
    const kursi = await masuk(
      `${b.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 4, "K4"))}`,
    );
    const lain = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 6, "K6"))}`,
    );
    await tunggu(60);
    panitia.frame.length = 0;
    lain.frame.length = 0;
    kursi.ws.send(
      JSON.stringify({ j: "kemajuan", d: { part: "livecode", answered: 1, total: 3 } }),
    );
    await tunggu(60);
    const kem = panitia
      .json()
      .flatMap((f) => f.m ?? [])
      .find((m) => m.j === "kemajuan");
    expect(kem).toMatchObject({ s: 4, d: { answered: 1, total: 3 } });
    expect(
      lain
        .json()
        .flatMap((f) => f.m ?? [])
        .some((m) => m.j === "kemajuan"),
    ).toBe(false);
  });

  it("delivers a message the API sends on any worker to the room's sockets on every worker, filtered per socket", async () => {
    const [a, b, c] = await klaster(3);
    const panitia = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "panitia", null, "P"))}`,
    );
    const k1 = await masuk(
      `${b.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 1, "K1"))}`,
    );
    const k2 = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 2, "K2"))}`,
    );
    await tunggu(60);
    for (const s of [panitia, k1, k2]) s.frame.length = 0;
    // Sent on the third worker, which holds nobody from this room.
    c.ruang.kirim("rec-3", [
      { j: "ruang", d: { tahap: "mulai" } },
      { j: "kursi", s: 1, d: { rahasia: "hanya kursi 1" } },
    ]);
    await tunggu(60);
    const jenis = (s: typeof panitia) =>
      s
        .json()
        .flatMap((f) => f.m ?? [])
        .map((m) => m.j);
    expect(jenis(panitia)).toEqual(["ruang", "kursi"]);
    expect(jenis(k1)).toEqual(["ruang", "kursi"]);
    expect(jenis(k2)).toEqual(["ruang"]);
  });

  it("closes the room's sockets on every worker after Finish", async () => {
    const [a, b] = await klaster(2);
    const k1 = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 1, "K1"))}`,
    );
    const k2 = await masuk(
      `${b.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 2, "K2"))}`,
    );
    await tunggu(40);
    a.ruang.tutup("rec-3");
    await tunggu(60);
    expect(k1.kode).toBe(4000);
    expect(k2.kode).toBe(4000);
  });

  it("forgets a worker's sockets when that worker is gone", async () => {
    const [a, b] = await klaster(2);
    const panitia = await masuk(
      `${a.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "panitia", null, "P"))}`,
    );
    await masuk(
      `${b.base}/ujian/rec-3?tiket=${encodeURIComponent(await tiketUjian("rec-3", "kursi", 8, "K8"))}`,
    );
    await tunggu(80);
    expect(
      panitia
        .json()
        .flatMap((f) => f.m ?? [])
        .filter((m) => m.j === "hadir")
        .at(-1).d.kursi,
    ).toEqual([8]);
    a.ruang.terimaPergi(b.id);
    await tunggu(80);
    expect(
      panitia
        .json()
        .flatMap((f) => f.m ?? [])
        .filter((m) => m.j === "hadir")
        .at(-1).d.kursi,
    ).toEqual([]);
  });
});

describe("the session rooms across workers", () => {
  it("tells a Praktikan how many look at their group, counting the Asisten on other workers", async () => {
    const [a, b] = await klaster(2);
    const prak = await masuk(
      `${a.base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", "praktikan", 2, "M"))}`,
    );
    const asisten = await masuk(
      `${b.base}/aliran/sesi-7?tiket=${encodeURIComponent(await tiketAliran("sesi-7", "asisten", null, "A"))}`,
    );
    await tunggu(40);
    asisten.ws.send(JSON.stringify({ j: "lihat", g: 2 }));
    await tunggu(60);
    expect(prak.json().find((f) => f.penonton > 0)).toEqual({ penonton: 1, asisten: 1 });
    asisten.ws.close();
    await tunggu(60);
    expect(prak.json().at(-1)).toEqual({ penonton: 0, asisten: 0 });
  });

  it("lets a message from the API reach a session room's sockets on another worker", async () => {
    const [a, b] = await klaster(2);
    const asisten = await masuk(
      `${a.base}/aliran/pc?tiket=${encodeURIComponent(await tiketAliran("pc", "asisten", null, "A"))}`,
    );
    await tunggu(40);
    asisten.frame.length = 0;
    const denyut = { j: "denyut", d: { serverId: 3, ok: true } };
    b.ruang.kirim("pc", [denyut]);
    await tunggu(60);
    expect(asisten.json().flatMap((f) => f.m ?? [])).toHaveLength(1);
  });
});
