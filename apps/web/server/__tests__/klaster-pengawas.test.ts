import { afterEach, describe, expect, it, vi } from "vitest";
import { buatPengawas, type ProsesPekerja } from "../klaster/pengawas.js";
import type { DariPekerja, DariUtama } from "../klaster/protokol.js";
import { buatUtama } from "../klaster/utama.js";

/** A pretend worker process: it says hello and ready on its own, and leaves when told to drain. */
class Palsu implements ProsesPekerja {
  pid = 1000;
  masuk: DariUtama[] = [];
  private pesan: Array<(m: DariPekerja) => void> = [];
  private keluarCb: Array<(k: number | null, s: string | null) => void> = [];
  keluar = false;
  constructor(
    public id: number,
    public gen: number,
    private sikap: { siap: boolean; lepasOk: boolean; keluarSaatHenti: boolean },
  ) {
    this.pid += id;
  }
  kirim(m: DariUtama) {
    this.masuk.push(m);
    if (m.i === "lepas" && this.sikap.lepasOk) queueMicrotask(() => this.dari({ i: "lepas-ok" }));
    if (m.i === "henti" && this.sikap.keluarSaatHenti) queueMicrotask(() => this.pergi(0, null));
  }
  bunuh(sinyal: "SIGTERM" | "SIGKILL") {
    queueMicrotask(() => this.pergi(null, sinyal));
  }
  padaPesan(cb: (m: DariPekerja) => void) {
    this.pesan.push(cb);
  }
  padaKeluar(cb: (k: number | null, s: string | null) => void) {
    this.keluarCb.push(cb);
  }
  dari(m: DariPekerja) {
    this.pesan.forEach((f) => f(m));
  }
  pergi(k: number | null, s: string | null) {
    if (this.keluar) return;
    this.keluar = true;
    this.keluarCb.forEach((f) => f(k, s));
  }
  nyalakan() {
    queueMicrotask(() => {
      this.dari({ i: "halo" });
      if (this.sikap.siap) this.dari({ i: "siap", port: 9000 + this.id });
    });
  }
}

const hidup: Array<{ berhenti(): Promise<void> }> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const h of hidup.splice(0)) await h.berhenti().catch(() => {});
});

function siapkan(
  opsi: {
    jumlah?: number;
    sikapBaru?: (gen: number) => Partial<ConstructorParameters<typeof Palsu>[2]>;
  } = {},
) {
  const semua: Palsu[] = [];
  const utama = buatUtama({ epoch: "e" });
  let id = 0;
  const pengawas = buatPengawas({
    jumlah: opsi.jumlah ?? 2,
    utama,
    siapMs: 200,
    hentiMs: 200,
    pensiunMs: 200,
    jeda: () => 10,
    fork: (gen) => {
      const p = new Palsu(++id, gen, {
        siap: true,
        lepasOk: true,
        keluarSaatHenti: true,
        ...opsi.sikapBaru?.(gen),
      });
      semua.push(p);
      p.nyalakan();
      return p;
    },
  });
  hidup.push(pengawas);
  return { semua, utama, pengawas };
}

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the supervisor's workers", () => {
  it("starts the number it was asked for and elects one leader", async () => {
    const { semua, utama, pengawas } = siapkan({ jumlah: 3 });
    pengawas.mulai();
    await tunggu(20);
    expect(semua).toHaveLength(3);
    expect(pengawas.status().pekerja.every((p) => p.siap)).toBe(true);
    expect(utama.pemimpin()).toBe(1);
  });

  it("replaces a worker that dies on its own", async () => {
    const { semua, pengawas } = siapkan({ jumlah: 2 });
    pengawas.mulai();
    await tunggu(20);
    semua[0].pergi(1, null);
    await tunggu(60);
    expect(semua).toHaveLength(3);
    expect(pengawas.status().pekerja).toHaveLength(2);
  });

  it("rolls: each new worker is ready before an old one is told to drain, so the count never drops", async () => {
    const { semua, utama, pengawas } = siapkan({ jumlah: 2 });
    pengawas.mulai();
    await tunggu(20);
    const jumlah: number[] = [];
    const lihat = setInterval(
      () => jumlah.push(pengawas.status().pekerja.filter((p) => p.siap).length),
      1,
    );
    const ok = await pengawas.gulir();
    clearInterval(lihat);
    expect(ok).toBe(true);
    expect(Math.min(...jumlah)).toBeGreaterThanOrEqual(2);
    const status = pengawas.status();
    expect(status.gen).toBe(2);
    expect(status.pekerja.map((p) => p.gen)).toEqual([2, 2]);
    // The first two (old) were told to drain, the new ones were not.
    expect(semua.slice(0, 2).every((p) => p.masuk.some((m) => m.i === "henti"))).toBe(true);
    expect(semua.slice(2).every((p) => !p.masuk.some((m) => m.i === "henti"))).toBe(true);
    // And the leader is now one of the new ones.
    expect(semua[utama.pemimpin()! - 1].gen).toBe(2);
  });

  it("hands the leader's duties to new code before the old leader drains", async () => {
    const { semua, pengawas } = siapkan({ jumlah: 1 });
    pengawas.mulai();
    await tunggu(20);
    const ok = await pengawas.gulir();
    expect(ok).toBe(true);
    const lama = semua[0];
    const baru = semua[1];
    const urutanLama = lama.masuk.map((m) => m.i).filter((i) => i === "lepas" || i === "henti");
    expect(urutanLama).toEqual(["lepas", "henti"]);
    expect(baru.masuk.some((m) => m.i === "pimpin")).toBe(true);
  });

  it("stops the roll and keeps the old workers when a new one never gets ready", async () => {
    const { semua, pengawas } = siapkan({
      jumlah: 2,
      sikapBaru: (gen) => (gen === 2 ? { siap: false } : {}),
    });
    pengawas.mulai();
    await tunggu(20);
    const ok = await pengawas.gulir();
    expect(ok).toBe(false);
    // Nobody old was told to drain.
    expect(semua.slice(0, 2).every((p) => !p.masuk.some((m) => m.i === "henti"))).toBe(true);
    expect(pengawas.status().pekerja.filter((p) => p.gen === 1)).toHaveLength(2);
    expect(pengawas.status().gen).toBe(1);
  });

  it("ends a worker that does not leave when told to", async () => {
    const { semua, pengawas } = siapkan({
      jumlah: 1,
      sikapBaru: (gen) => (gen === 1 ? { keluarSaatHenti: false } : {}),
    });
    pengawas.mulai();
    await tunggu(20);
    const ok = await pengawas.gulir();
    expect(ok).toBe(true);
    expect(semua[0].keluar).toBe(true);
  });

  it("drains every worker when it stops, and does not replace them", async () => {
    const { semua, pengawas } = siapkan({ jumlah: 2 });
    pengawas.mulai();
    await tunggu(20);
    await pengawas.berhenti();
    await tunggu(40);
    expect(semua).toHaveLength(2);
    expect(semua.every((p) => p.keluar && p.masuk.some((m) => m.i === "henti"))).toBe(true);
  });

  it("does not roll twice at once; a second ask runs once more afterwards", async () => {
    const { semua, pengawas } = siapkan({ jumlah: 1 });
    pengawas.mulai();
    await tunggu(20);
    const a = pengawas.gulir();
    const b = pengawas.gulir();
    await Promise.all([a, b]);
    expect(pengawas.status().gen).toBe(3);
    expect(semua).toHaveLength(3);
  });
});
