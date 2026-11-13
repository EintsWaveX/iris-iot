import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { LihatHost, Simpanan } from "../../src/lib/kuis/engine.js";
import { pasangKuis, type KonteksKuis, type PasangKuis, type SesiKuis } from "../kuis.js";

/** The cookie is "role:nim:nama:kelompok:sesiId[:lihat]" so a test can mint anyone. */
function bacaCookie(nilai: string | undefined): SessionPayload | null {
  if (!nilai) return null;
  const [role, nim, nama, kelompok, sesiId, lihat] = nilai.split(":");
  if (role !== "asisten" && role !== "praktikan") return null;
  return {
    role,
    nim,
    nama,
    ...(kelompok ? { kelompokNomor: Number(kelompok) } : {}),
    ...(sesiId ? { sesiId: Number(sesiId) } : {}),
    ...(lihat ? { lihat: true as const } : {}),
    exp: 9_999_999_999,
  };
}

interface Uji {
  server: http.Server;
  pasang: PasangKuis;
  port: number;
  sesi: SesiKuis | null;
  tersimpan: Map<number, Simpanan & { hasil?: unknown }>;
}

let u: Uji;
const dibuka: WebSocket[] = [];

async function mulaiUji(awal?: Map<number, Simpanan & { hasil?: unknown }>): Promise<Uji> {
  const server = http.createServer((_q, s) => s.end("x"));
  const tersimpan = awal ?? new Map();
  const uji = {
    server,
    tersimpan,
    sesi: { id: 1, modul: 4, kelas: "reguler" } as SesiKuis | null,
  } as Uji;
  const ctx: KonteksKuis = {
    sesiAktif: async () => uji.sesi,
    bacaCookie,
    muat: async (id) => (tersimpan.get(id) as Simpanan | undefined) ?? null,
    simpan: async (id, nilai) => {
      tersimpan.set(id, JSON.parse(JSON.stringify(nilai)));
    },
  };
  uji.pasang = pasangKuis(server, ctx, {
    izinTanpaOrigin: true,
    jedaTickMs: 20,
    jedaKirimMs: 5,
    jedaSimpanMs: 20,
    jedaSesiMs: 40,
    jedaPingMs: 60_000,
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  uji.port = (server.address() as AddressInfo).port;
  return uji;
}

type Pesan = { t: string; [k: string]: unknown };

interface Klien {
  ws: WebSocket;
  msgs: Pesan[];
  tunggu: (pred: (m: Pesan) => boolean, ms?: number) => Promise<Pesan>;
  kirim: (o: unknown) => void;
  lihat: () => LihatHost | undefined;
}

async function klien(
  cookie: string | null,
  opsi: { host?: string; origin?: string; b?: string } = {},
): Promise<Klien> {
  const headers: Record<string, string> = { Host: opsi.host ?? "games.localhost" };
  if (cookie) headers.Cookie = `iris_session=${cookie}`;
  if (opsi.origin) headers.Origin = opsi.origin;
  const ws = new WebSocket(`ws://127.0.0.1:${u.port}/kuis/ws${opsi.b ? `?b=${opsi.b}` : ""}`, {
    headers,
  });
  dibuka.push(ws);
  const msgs: Pesan[] = [];
  const peminat = new Set<() => void>();
  ws.on("message", (d) => {
    msgs.push(JSON.parse(d.toString()));
    for (const p of [...peminat]) p();
  });
  await new Promise<void>((ok, no) => {
    ws.once("open", () => ok());
    ws.once("unexpected-response", (_q, s) =>
      no(Object.assign(new Error(`HTTP ${s.statusCode}`), { status: s.statusCode })),
    );
    ws.once("error", no);
  });
  return {
    ws,
    msgs,
    kirim: (o) => ws.send(JSON.stringify(o)),
    lihat: () => [...msgs].reverse().find((m) => m.t === "lihat")?.d as LihatHost | undefined,
    tunggu: (pred, ms = 2500) =>
      new Promise((ok, no) => {
        const cari = () => [...msgs].reverse().find(pred);
        const awal = cari();
        if (awal) return ok(awal);
        const timer = setTimeout(() => {
          peminat.delete(cek);
          no(new Error(`timed out; last: ${JSON.stringify(msgs.at(-1))?.slice(0, 300)}`));
        }, ms);
        const cek = () => {
          const f = cari();
          if (!f) return;
          clearTimeout(timer);
          peminat.delete(cek);
          ok(f);
        };
        peminat.add(cek);
      }),
  };
}

const fase = (f: string) => (m: Pesan) => m.t === "lihat" && (m.d as { fase: string }).fase === f;

async function tolakDengan(cookie: string | null, opsi = {}): Promise<number | undefined> {
  try {
    await klien(cookie, opsi);
  } catch (e) {
    return (e as { status?: number }).status;
  }
  return undefined;
}

beforeEach(async () => {
  u = await mulaiUji();
});

afterEach(async () => {
  for (const w of dibuka.splice(0)) w.terminate();
  await u.pasang.tutup();
  await new Promise((ok) => u.server.close(ok));
});

describe("who may open the socket", () => {
  it("needs the games host, a signed-in cookie and a matching Origin", async () => {
    expect(await tolakDengan("asisten:a1:Kak A:", { host: "irisiotlab.com" })).toBe(404);
    expect(await tolakDengan(null)).toBe(401);
    expect(await tolakDengan("kacau")).toBe(401);
    expect(await tolakDengan("asisten:a1:Kak A::", { origin: "https://evil.example" })).toBe(403);
    // A matching Origin passes.
    const k = await klien("asisten:a1:Kak A::", { origin: "http://games.localhost" });
    expect(k.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("is only for a running Module 4 session", async () => {
    u.sesi = null;
    expect(await tolakDengan("asisten:a1:Kak A::")).toBe(403);
    u.sesi = { id: 1, modul: 3, kelas: "reguler" };
    // The cache holds the last answer for 2 s; a fresh room is a fresh server.
    await u.pasang.tutup();
    await new Promise((ok) => u.server.close(ok));
    u = await mulaiUji();
    u.sesi = { id: 1, modul: 3, kelas: "reguler" };
    expect(await tolakDengan("asisten:a1:Kak A::")).toBe(403);
  });

  it("lets a Praktikan in only for this session and not as a lookout", async () => {
    expect(await tolakDengan("praktikan:p1:Ani:1:2")).toBe(403);
    expect(await tolakDengan("praktikan:p1:Ani:1:1:lihat")).toBe(403);
    const k = await klien("praktikan:p1:Ani:1:1");
    expect((await k.tunggu((m) => m.t === "aku")).peran).toBe("pemain");
  });
});

describe("a whole game", () => {
  it("runs from the lobby to the podium and never shows an open question's answer to a player", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    expect((await host.tunggu((m) => m.t === "aku")).peran).toBe("host");
    const p1 = await klien("praktikan:p1:Ani:1:1");
    const p2 = await klien("praktikan:p2:Budi:2:1");
    await host.tunggu(
      (m) => m.t === "lihat" && (m.d as { jumlahPemain: number }).jumlahPemain === 2,
    );

    host.kirim({ t: "atur", jumlah: 2, detik: 10, acak: false });
    await host.tunggu(
      (m) => m.t === "lihat" && (m.d as { pengaturan: { jumlah: number } }).pengaturan.jumlah === 2,
    );
    host.kirim({ t: "mulai" });
    await p1.tunggu(fase("hitung"));
    host.kirim({ t: "lanjut" }); // skip the 3-2-1
    const soal = await p1.tunggu(fase("soal"));
    const d = soal.d as { soal: { id: string; pilihan: string[] }; hasil: unknown };
    expect(d.soal.id).toBe("m4-a1");
    expect(d.hasil).toBeNull();
    for (const k of [p1, p2]) {
      for (const m of k.msgs.filter((x) => x.t === "lihat")) {
        const j = JSON.stringify(m);
        if (
          (m.d as { fase: string }).fase === "soal" ||
          (m.d as { fase: string }).fase === "hitung"
        ) {
          expect(j).not.toContain("benarIndeks");
          expect(j).not.toContain("sebaran");
        }
      }
    }

    p1.kirim({ t: "jawab", pilih: 1 }); // right (Network server)
    p2.kirim({ t: "jawab", pilih: 0 }); // wrong
    const buka = await p1.tunggu(fase("buka"));
    const hasil = (buka.d as { hasil: { benar: boolean; poin: number; benarIndeks: number } })
      .hasil;
    expect(hasil).toMatchObject({ benar: true, benarIndeks: 1 });
    expect(hasil.poin).toBeGreaterThan(900);
    const hostBuka = await host.tunggu(fase("buka"));
    expect((hostBuka.d as { buka: { sebaran: number[] } }).buka.sebaran).toEqual([1, 1, 0, 0]);

    host.kirim({ t: "lanjut" });
    await p2.tunggu(fase("papan"));
    host.kirim({ t: "lanjut" });
    await p1.tunggu(fase("hitung"));
    host.kirim({ t: "lanjut" });
    await p1.tunggu(fase("soal"));
    host.kirim({ t: "lanjut" }); // skip: reveal
    await p1.tunggu(fase("buka"));
    host.kirim({ t: "lanjut" });
    const podium = await p2.tunggu(fase("podium"));
    expect((podium.d as { papan: { nim: string }[] }).papan[0].nim).toBe("p1");
    expect((podium.d as { saya: { peringkat: number } }).saya.peringkat).toBe(2);
  });

  it("serves a player in the language they pick", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const en = await klien("praktikan:p1:Ani:1:1", { b: "en" });
    const id = await klien("praktikan:p2:Budi:1:1");
    host.kirim({ t: "mulai" });
    await en.tunggu(fase("hitung"));
    host.kirim({ t: "lanjut" });
    const a = (await en.tunggu(fase("soal"))).d as { soal: { teks: string } };
    const b = (await id.tunggu(fase("soal"))).d as { soal: { teks: string } };
    expect(a.soal.teks).toMatch(/^In the LoRaWAN|^[A-Z]/);
    expect(a.soal.teks).not.toEqual(b.soal.teks);
    id.kirim({ t: "bahasa", b: "en" });
    const c = await id.tunggu(
      (m) => m.t === "lihat" && (m.d as { soal?: { teks: string } }).soal?.teks === a.soal.teks,
    );
    expect(c).toBeTruthy();
  });
});

describe("rights", () => {
  it("lets only the host run the game, and a spectator take over", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const lain = await klien("asisten:a2:Kak Budi::");
    expect((await lain.tunggu((m) => m.t === "aku")).peran).toBe("penonton");
    const p = await klien("praktikan:p1:Ani:1:1");
    lain.kirim({ t: "mulai" });
    expect((await lain.tunggu((m) => m.t === "galat")).kode).toBe("bukan-host");
    p.kirim({ t: "mulai" });
    p.kirim({ t: "atur", jumlah: 1 });
    await new Promise((r) => setTimeout(r, 60));
    expect(host.lihat()?.fase).toBe("lobi");
    expect(host.lihat()?.pengaturan.jumlah).not.toBe(1);

    lain.kirim({ t: "ambil-alih" });
    await lain.tunggu((m) => m.t === "aku" && m.peran === "host");
    await host.tunggu((m) => m.t === "aku" && m.peran === "penonton");
    lain.kirim({ t: "mulai" });
    await p.tunggu(fase("hitung"));
  });

  it("hands the lead on when the host leaves", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const lain = await klien("asisten:a2:Kak Budi::");
    await lain.tunggu((m) => m.t === "aku");
    host.ws.close();
    await lain.tunggu((m) => m.t === "aku" && m.peran === "host");
  });

  it("lets the host remove a player", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const p = await klien("praktikan:p1:Ani:1:1");
    await host.tunggu(
      (m) => m.t === "lihat" && (m.d as { jumlahPemain: number }).jumlahPemain === 1,
    );
    host.kirim({ t: "tendang", nim: "p1" });
    await new Promise<void>((ok) => p.ws.once("close", (kode) => (expect(kode).toBe(4003), ok())));
    await host.tunggu(
      (m) => m.t === "lihat" && (m.d as { jumlahPemain: number }).jumlahPemain === 0,
    );
  });

  it("ignores junk, oversized and flooded messages", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    host.ws.send("not json");
    host.ws.send(JSON.stringify([1, 2]));
    host.ws.send(JSON.stringify({ t: 5 }));
    host.kirim({ t: "tidak-ada" });
    await new Promise((r) => setTimeout(r, 40));
    expect(host.ws.readyState).toBe(WebSocket.OPEN);
    const tutup = new Promise<number>((ok) => host.ws.once("close", (kode) => ok(kode)));
    for (let i = 0; i < 80; i++) host.kirim({ t: "ping" });
    expect(await tutup).toBe(1008);
  });
});

describe("restart and the end of the session", () => {
  it("saves the room and brings it back paused after a restart", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const p = await klien("praktikan:p1:Ani:1:1");
    host.kirim({ t: "atur", jumlah: 2, detik: 10, acak: false });
    host.kirim({ t: "mulai" });
    await p.tunggu(fase("hitung"));
    host.kirim({ t: "lanjut" });
    await p.tunggu(fase("soal"));
    p.kirim({ t: "jawab", pilih: 1 });
    await p.tunggu(fase("buka"));
    await new Promise((r) => setTimeout(r, 80));
    const simpanan = u.tersimpan;
    expect(simpanan.get(1)?.fase).toBe("buka");

    await u.pasang.tutup();
    await new Promise((ok) => u.server.close(ok));
    u = await mulaiUji(simpanan);
    const host2 = await klien("asisten:a1:Kak Ani::");
    expect((await host2.tunggu((m) => m.t === "lihat")).d).toMatchObject({
      fase: "buka",
      jumlahPemain: 1,
    });
    const p2 = await klien("praktikan:p1:Ani:1:1");
    const v = (await p2.tunggu((m) => m.t === "lihat")).d as { saya: { skor: number } | null };
    expect(v.saya?.skor).toBeGreaterThan(900);
  });

  it("closes the room when the session ends", async () => {
    const host = await klien("asisten:a1:Kak Ani::");
    const tutup = new Promise<number>((ok) => host.ws.once("close", (kode) => ok(kode)));
    u.sesi = null;
    expect(await tutup).toBe(4001);
    expect(u.pasang.ruang.size).toBe(0);
  });
});
