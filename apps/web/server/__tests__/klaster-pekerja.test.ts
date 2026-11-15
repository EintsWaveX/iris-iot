import { describe, expect, it, vi } from "vitest";
import { buatBusPekerja } from "../klaster/pekerja.js";
import type { DariPekerja } from "../klaster/protokol.js";

function bus(opsi: { balasMs?: number } = {}) {
  const keluar: DariPekerja[] = [];
  const b = buatBusPekerja({ kirim: (m) => keluar.push(m), ...opsi });
  return { b, keluar };
}

const sinkron = {
  i: "sinkron" as const,
  id: 4,
  gen: 2,
  n: 10,
  e: "ee",
  cincin: [{ n: 10, t: ["sesi"] }],
  hadir: [],
  kv: [] as Array<[string, unknown, number]>,
  pemimpin: { id: 1, port: 6000 },
};

describe("worker bus", () => {
  it("says hello and resolves with the supervisor's state", async () => {
    const { b, keluar } = bus();
    const p = b.halo();
    expect(keluar).toEqual([{ i: "halo" }]);
    b.terima(sinkron);
    const sk = await p;
    expect(sk).toMatchObject({ id: 4, gen: 2, n: 10, e: "ee" });
    expect(b.pemimpin()).toEqual({ id: 1, port: 6000 });
  });

  it("gives up on hello when the supervisor stays silent", async () => {
    vi.useFakeTimers();
    const { b } = bus();
    const p = b.halo(100);
    vi.advanceTimersByTime(150);
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("turns calls into messages", () => {
    const { b, keluar } = bus();
    b.siarkan(["sesi"]);
    b.kirimRuang("rec-1", [{ j: "ruang" }]);
    b.tutupRuang("rec-1");
    b.hadir("rec-1", 3, null);
    b.batal();
    b.pantau("k", [1]);
    b.siap(7000);
    expect(keluar.map((m) => m.i)).toEqual([
      "siar",
      "kirim",
      "tutup",
      "hadir",
      "batal",
      "pantau",
      "siap",
    ]);
  });

  it("asks 'first time?' and gets the supervisor's answer", async () => {
    const { b, keluar } = bus();
    const p = b.sekali("ruang:n1", 60_000);
    const q = keluar[0] as Extract<DariPekerja, { i: "sekali" }>;
    expect(q).toMatchObject({ i: "sekali", kunci: "ruang:n1", ttl: 60_000 });
    b.terima({ i: "balas", r: q.r, ok: true });
    await expect(p).resolves.toBe(true);
    const p2 = b.sekali("ruang:n1", 60_000);
    b.terima({ i: "balas", r: (keluar[1] as { r: number }).r, ok: false });
    await expect(p2).resolves.toBe(false);
  });

  it("refuses when the supervisor does not answer (a ticket is not let in on a guess)", async () => {
    vi.useFakeTimers();
    const { b } = bus({ balasMs: 50 });
    const p = b.sekali("k", 1000);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("hands each message to its handler, and one that throws does not stop the next", () => {
    const { b } = bus();
    const log: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(b.penangan, {
      siar: (n: number, e: string, t: string[]) => {
        log.push(`siar ${n} ${e} ${t.join(",")}`);
        throw new Error("boom");
      },
      kirim: (r: string) => log.push(`kirim ${r}`),
      pergi: (w: number) => log.push(`pergi ${w}`),
    });
    b.terima({ i: "siar", n: 1, e: "x", t: ["a", "b"] });
    b.terima({ i: "kirim", ruang: "rec-2", m: [] });
    b.terima({ i: "pergi", w: 9 });
    expect(log).toEqual(["siar 1 x a,b", "kirim rec-2", "pergi 9"]);
    vi.restoreAllMocks();
  });

  it("answers 'put the leader's duties down' even when putting them down fails", async () => {
    const { b, keluar } = bus();
    vi.spyOn(console, "error").mockImplementation(() => {});
    b.penangan.lepas = async () => {
      throw new Error("save failed");
    };
    b.terima({ i: "lepas" });
    await vi.waitFor(() => expect(keluar.some((m) => m.i === "lepas-ok")).toBe(true));
    vi.restoreAllMocks();
  });

  it("answers the supervisor's question with this worker's numbers", async () => {
    const { b, keluar } = bus();
    b.penangan.tanya = (apa) => ({ apa, pid: 1 });
    b.terima({ i: "tanya", r: 12, apa: "stat" });
    await vi.waitFor(() =>
      expect(keluar).toContainEqual({ i: "jawab", r: 12, data: { apa: "stat", pid: 1 } }),
    );
  });

  it("collects every worker's numbers, or an empty list when nobody answers", async () => {
    const { b, keluar } = bus();
    const p = b.tanyaSemua("metrik");
    const q = keluar[0] as Extract<DariPekerja, { i: "tanya" }>;
    b.terima({ i: "hasil", r: q.r, data: [{ a: 1 }, { a: 2 }] });
    await expect(p).resolves.toEqual([{ a: 1 }, { a: 2 }]);
    vi.useFakeTimers();
    const p2 = b.tanyaSemua("stat", 40);
    vi.advanceTimersByTime(60);
    await expect(p2).resolves.toEqual([]);
    vi.useRealTimers();
  });

  it("follows the leader as the supervisor names it", () => {
    const { b } = bus();
    b.terima({ i: "pemimpin", id: 3, port: 6100 });
    expect(b.pemimpin()).toEqual({ id: 3, port: 6100 });
    b.terima({ i: "pemimpin", id: null, port: null });
    expect(b.pemimpin()).toBeNull();
  });
});
