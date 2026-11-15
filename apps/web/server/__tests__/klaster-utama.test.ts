import { afterEach, describe, expect, it, vi } from "vitest";
import type { DariUtama } from "../klaster/protokol.js";
import { buatUtama, type Utama } from "../klaster/utama.js";

interface Palsu {
  id: number;
  gen: number;
  masuk: DariUtama[];
}

let utamaTerakhir: Utama | null = null;
afterEach(() => {
  utamaTerakhir?.hentikan();
  utamaTerakhir = null;
  vi.useRealTimers();
});

function siapkan(opsi: Parameters<typeof buatUtama>[0] = {}) {
  const utama = buatUtama({ epoch: "e1", ...opsi });
  utamaTerakhir = utama;
  const pekerja = new Map<number, Palsu>();
  const tambah = (id: number, gen = 1, { siap = true, halo = true } = {}) => {
    const p: Palsu = { id, gen, masuk: [] };
    pekerja.set(id, p);
    utama.daftar({ id, gen, kirim: (m) => p.masuk.push(m) });
    if (halo) utama.terima(id, { i: "halo" });
    if (siap) utama.terima(id, { i: "siap", port: 5000 + id });
    return p;
  };
  const jenis = (p: Palsu, i: DariUtama["i"]) => p.masuk.filter((m) => m.i === i);
  return { utama, tambah, jenis, pekerja };
}

describe("numbering live-update messages", () => {
  it("numbers topics once and hands them to every worker, the sender too", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "siar", t: ["sesi"] });
    utama.terima(2, { i: "siar", t: ["nilai", "jadwal"] });
    for (const w of [a, b]) {
      expect(jenis(w, "siar")).toEqual([
        { i: "siar", n: 1, e: "e1", t: ["sesi"] },
        { i: "siar", n: 2, e: "e1", t: ["nilai", "jadwal"] },
      ]);
    }
  });

  it("ignores an empty or malformed list", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    utama.terima(1, { i: "siar", t: [] });
    utama.terima(1, { i: "siar", t: [1, null] as unknown as string[] });
    expect(jenis(a, "siar")).toEqual([]);
  });

  it("tells a new worker where the numbering is and what it holds, so a reconnecting page can be replayed", () => {
    const { utama, tambah, jenis } = siapkan({ cincinMaks: 2 });
    tambah(1);
    for (const t of ["a", "b", "c"]) utama.terima(1, { i: "siar", t: [t] });
    const baru = tambah(2, 1, { siap: false });
    const sk = jenis(baru, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>;
    expect(sk.n).toBe(3);
    expect(sk.e).toBe("e1");
    expect(sk.id).toBe(2);
    expect(sk.cincin.map((x) => x.n)).toEqual([2, 3]);
  });

  it("does not send to a worker that has not asked for the state yet", () => {
    const { utama, tambah } = siapkan();
    tambah(1);
    const belum = tambah(2, 1, { halo: false, siap: false });
    utama.terima(1, { i: "siar", t: ["sesi"] });
    expect(belum.masuk).toEqual([]);
  });
});

describe("rooms across workers", () => {
  it("passes a room message to the others, not back to the sender", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "kirim", ruang: "rec-1", m: [{ j: "ruang" }] });
    expect(jenis(b, "kirim")).toHaveLength(1);
    expect(jenis(a, "kirim")).toHaveLength(0);
    utama.terima(2, { i: "tutup", ruang: "rec-1" });
    expect(jenis(a, "tutup")).toHaveLength(1);
    expect(jenis(b, "tutup")).toHaveLength(0);
  });

  it("keeps the roster for a worker that starts later, minus its own entries, and forgets a worker that left", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    utama.terima(1, {
      i: "hadir",
      ruang: "rec-1",
      id: 7,
      info: { k: "u", peran: "kursi", s: 3, u: "K3" },
    });
    utama.terima(1, {
      i: "hadir",
      ruang: "rec-1",
      id: 8,
      info: { k: "u", peran: "kursi", s: 4, u: "K4" },
    });
    utama.terima(1, { i: "hadir", ruang: "rec-1", id: 8, info: null });
    const b = tambah(2, 1, { siap: false });
    const sk = jenis(b, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>;
    expect(sk.hadir).toEqual([[1, "rec-1", 7, { k: "u", peran: "kursi", s: 3, u: "K3" }]]);
    // The roster's change reaches the other worker, not the one that made it.
    expect(jenis(a, "hadir")).toHaveLength(0);
    utama.pergi(1);
    expect(jenis(b, "pergi")).toEqual([{ i: "pergi", w: 1 }]);
    const c = tambah(3, 1, { siap: false });
    expect((jenis(c, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>).hadir).toEqual([]);
    expect(utama.status().hadir).toBe(0);
  });
});

describe("things used once", () => {
  it("lets the first worker use a ticket and refuses the rest, whichever worker they are", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "sekali", r: 1, kunci: "ruang:n1", ttl: 60_000 });
    utama.terima(2, { i: "sekali", r: 1, kunci: "ruang:n1", ttl: 60_000 });
    utama.terima(2, { i: "sekali", r: 2, kunci: "ruang:n2", ttl: 60_000 });
    expect(jenis(a, "balas")).toEqual([{ i: "balas", r: 1, ok: true }]);
    expect(jenis(b, "balas")).toEqual([
      { i: "balas", r: 1, ok: false },
      { i: "balas", r: 2, ok: true },
    ]);
  });

  it("forgets a ticket after its time", () => {
    let t = 1_000_000;
    const { utama, tambah, jenis } = siapkan({ now: () => t });
    const a = tambah(1);
    utama.terima(1, { i: "sekali", r: 1, kunci: "k", ttl: 5000 });
    t += 6000;
    utama.terima(1, { i: "sekali", r: 2, kunci: "k", ttl: 5000 });
    expect(jenis(a, "balas").map((m) => (m as { ok: boolean }).ok)).toEqual([true, true]);
  });

  it("shares a small value with the other workers, and with one that starts later", () => {
    let t = 1_000;
    const { utama, tambah, jenis } = siapkan({ now: () => t });
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "taruh", kunci: "bangun:x", nilai: "1234", sampai: t + 10_000 });
    expect(jenis(b, "taruh")).toEqual([
      { i: "taruh", kunci: "bangun:x", nilai: "1234", sampai: t + 10_000 },
    ]);
    expect(jenis(a, "taruh")).toHaveLength(0);
    const c = tambah(3, 1, { siap: false });
    expect((jenis(c, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>).kv).toEqual([
      ["bangun:x", "1234", t + 10_000],
    ]);
    t += 20_000;
    const d = tambah(4, 1, { siap: false });
    expect((jenis(d, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>).kv).toEqual([]);
  });

  it("tells the other workers to drop their caches", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "batal" });
    expect(jenis(b, "batal")).toHaveLength(1);
    expect(jenis(a, "batal")).toHaveLength(0);
  });
});

describe("the leader", () => {
  it("is the first worker that is ready, and everybody is told where it is", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    expect(utama.pemimpin()).toBe(1);
    expect(jenis(a, "pimpin")).toHaveLength(1);
    expect(jenis(b, "pimpin")).toHaveLength(0);
    // One that was already listening hears it in a message; one that joins later in its starting state.
    expect(jenis(a, "pemimpin")).toEqual([{ i: "pemimpin", id: 1, port: 5001 }]);
    expect((jenis(b, "sinkron")[0] as Extract<DariUtama, { i: "sinkron" }>).pemimpin).toEqual({
      id: 1,
      port: 5001,
    });
  });

  it("does not move to another worker of the same generation", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(2);
    tambah(1);
    expect(utama.pemimpin()).toBe(2);
    expect(jenis(a, "lepas")).toHaveLength(0);
  });

  it("is not given to a worker that is not ready", () => {
    const { utama, tambah } = siapkan();
    tambah(1, 1, { siap: false });
    expect(utama.pemimpin()).toBeNull();
    utama.terima(1, { i: "siap", port: 5001 });
    expect(utama.pemimpin()).toBe(1);
  });

  it("hands over to newer code: the old one puts its duties down first, then the new one takes them", () => {
    const { utama, tambah, jenis } = siapkan();
    const lama = tambah(1, 1);
    const baru = tambah(2, 2);
    // The old leader is asked to stop; the new one has not been asked to start yet.
    expect(jenis(lama, "lepas")).toHaveLength(1);
    expect(jenis(baru, "pimpin")).toHaveLength(0);
    expect(utama.pemimpin()).toBe(1);
    utama.terima(1, { i: "lepas-ok" });
    expect(jenis(baru, "pimpin")).toHaveLength(1);
    expect(utama.pemimpin()).toBe(2);
    expect(jenis(lama, "pemimpin").at(-1)).toEqual({ i: "pemimpin", id: 2, port: 5002 });
  });

  it("goes ahead with the hand-over when the old leader does not answer in time", () => {
    vi.useFakeTimers();
    const { utama, tambah, jenis } = siapkan({ lepasMs: 1000 });
    tambah(1, 1);
    const baru = tambah(2, 2);
    expect(jenis(baru, "pimpin")).toHaveLength(0);
    vi.advanceTimersByTime(1100);
    expect(jenis(baru, "pimpin")).toHaveLength(1);
    expect(utama.pemimpin()).toBe(2);
  });

  it("moves to a survivor when the leader's process dies", () => {
    const { utama, tambah, jenis } = siapkan();
    tambah(1);
    const b = tambah(2);
    utama.pergi(1);
    expect(utama.pemimpin()).toBe(2);
    expect(jenis(b, "pimpin")).toHaveLength(1);
  });

  it("lets a worker that is being replaced hand over before it drains", async () => {
    const { utama, tambah, jenis } = siapkan();
    const lama = tambah(1, 1);
    const baru = tambah(2, 2);
    utama.terima(1, { i: "lepas-ok" }); // the roll's first hand-over already happened
    expect(utama.pemimpin()).toBe(2);
    // Retiring a worker that does not lead resolves at once.
    await expect(utama.pensiunkan(1)).resolves.toBeUndefined();
    // Retiring the leader waits until another worker has taken over.
    const c = tambah(3, 2);
    let selesai = false;
    const p = utama.pensiunkan(2).then(() => (selesai = true));
    expect(jenis(baru, "lepas")).toHaveLength(1);
    await Promise.resolve();
    expect(selesai).toBe(false);
    utama.terima(2, { i: "lepas-ok" });
    await p;
    expect(selesai).toBe(true);
    expect(utama.pemimpin()).toBe(3);
    expect(jenis(c, "pimpin")).toHaveLength(1);
    expect(lama.masuk.length).toBeGreaterThan(0);
  });

  it("passes a page's ask for the leader's job to the leader only", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(2, { i: "pantau", kunci: "sheet", isi: [1] });
    expect(jenis(a, "pantau")).toEqual([{ i: "pantau", kunci: "sheet", isi: [1] }]);
    utama.terima(1, { i: "pantau", kunci: "sheet", isi: [1] });
    expect(jenis(b, "pantau")).toHaveLength(0);
  });
});

describe("asking every worker", () => {
  it("collects each worker's answer and gives the asker the list, under the asker's own number", () => {
    const { utama, tambah, jenis } = siapkan();
    const a = tambah(1);
    const b = tambah(2);
    utama.terima(1, { i: "tanya", r: 77, apa: "stat" });
    const qa = (jenis(a, "tanya")[0] as Extract<DariUtama, { i: "tanya" }>).r;
    const qb = (jenis(b, "tanya")[0] as Extract<DariUtama, { i: "tanya" }>).r;
    expect(qa).toBe(qb);
    utama.terima(1, { i: "jawab", r: qa, data: { id: 1 } });
    expect(jenis(a, "hasil")).toHaveLength(0);
    utama.terima(2, { i: "jawab", r: qb, data: { id: 2 } });
    expect(jenis(a, "hasil")).toEqual([{ i: "hasil", r: 77, data: [{ id: 1 }, { id: 2 }] }]);
  });

  it("answers with what it has when a worker is slow, or gone", () => {
    vi.useFakeTimers();
    const { utama, tambah, jenis } = siapkan({ jawabMs: 500 });
    const a = tambah(1);
    tambah(2);
    utama.terima(1, { i: "tanya", r: 5, apa: "metrik" });
    const q = (jenis(a, "tanya")[0] as Extract<DariUtama, { i: "tanya" }>).r;
    utama.terima(1, { i: "jawab", r: q, data: "a" });
    vi.advanceTimersByTime(600);
    expect(jenis(a, "hasil")).toEqual([{ i: "hasil", r: 5, data: ["a"] }]);
    // A worker that dies while the others have answered does not hold it up.
    utama.terima(1, { i: "tanya", r: 6, apa: "stat" });
    const q2 = (jenis(a, "tanya")[1] as Extract<DariUtama, { i: "tanya" }>).r;
    utama.terima(1, { i: "jawab", r: q2, data: "a2" });
    utama.pergi(2);
    expect(jenis(a, "hasil").at(-1)).toEqual({ i: "hasil", r: 6, data: ["a2"] });
  });
});
