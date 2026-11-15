/**
 * Keeps the workers running and replaces them one at a time (real-time upgrade, Phase 3).
 *
 *  - `mulai()` starts N workers.
 *  - A worker that dies is replaced (with a growing pause, so a build that cannot start does not spin).
 *  - `gulir()` (the deploy's rolling restart): for each old worker, start a new one on the code now on disk,
 *    wait until it is ready, hand the leader's duties to a new worker if the old one led, then tell the old
 *    one to drain and wait for it to leave. The site never has fewer workers listening than it started with,
 *    so no visitor meets a closed door. A new worker that does not come up stops the roll and leaves the old
 *    ones serving.
 *  - `berhenti()`: every worker drains, then they are ended.
 *
 * It knows no processes: `fork` makes one (the supervisor passes Node's `cluster.fork`; tests pass fakes).
 */
import type { DariPekerja, DariUtama } from "./protokol.js";
import type { Utama } from "./utama.js";

export interface ProsesPekerja {
  id: number;
  pid: number | undefined;
  kirim(m: DariUtama): void;
  bunuh(sinyal: "SIGTERM" | "SIGKILL"): void;
  padaPesan(cb: (m: DariPekerja) => void): void;
  padaKeluar(cb: (kode: number | null, sinyal: string | null) => void): void;
}

export interface OpsiPengawas {
  jumlah: number;
  fork: (gen: number) => ProsesPekerja;
  utama: Utama;
  log?: (teks: string) => void;
  /** A new worker has this long to say it is ready (default 90 s). */
  siapMs?: number;
  /** A draining worker has this long to leave before it is ended (default 65 s). */
  hentiMs?: number;
  /** The leader has this long to hand over before a worker is drained anyway (default 30 s). */
  pensiunMs?: number;
  /** Pause before replacing a worker that died, by how many times in a row (default 1 s, doubling, at most 30 s). */
  jeda?: (kaliBerturut: number) => number;
}

interface Catatan {
  p: ProsesPekerja;
  gen: number;
  siap: boolean;
  /** Told to drain or ended on purpose: its exit is not a crash. */
  disengaja: boolean;
  keluar: boolean;
  waktuMulai: number;
}

export interface Pengawas {
  mulai(): void;
  /** The rolling restart. Resolves true when every worker runs the new code, false when it was stopped. */
  gulir(): Promise<boolean>;
  berhenti(): Promise<void>;
  status(): {
    gen: number;
    menggulir: boolean;
    pekerja: Array<{ id: number; gen: number; siap: boolean }>;
  };
}

export function buatPengawas(opsi: OpsiPengawas): Pengawas {
  const log = opsi.log ?? (() => {});
  const siapMs = opsi.siapMs ?? 90_000;
  const hentiMs = opsi.hentiMs ?? 65_000;
  const pensiunMs = opsi.pensiunMs ?? 30_000;
  const jeda = opsi.jeda ?? ((n: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, n - 1)));

  const hidup = new Map<number, Catatan>();
  let gen = 1;
  let berhentiSemua = false;
  let menggulir = false;
  let gulirLagi = false;
  let gagalBerturut = 0;
  const menungguSiap = new Map<number, Array<() => void>>();
  const menungguKeluar = new Map<number, Array<() => void>>();

  function mulaiSatu(g: number): Catatan {
    const p = opsi.fork(g);
    const c: Catatan = {
      p,
      gen: g,
      siap: false,
      disengaja: false,
      keluar: false,
      waktuMulai: Date.now(),
    };
    hidup.set(p.id, c);
    opsi.utama.daftar({ id: p.id, gen: g, kirim: (m) => p.kirim(m) });
    p.padaPesan((m) => {
      if (m.i === "siap") {
        c.siap = true;
        menungguSiap.get(p.id)?.forEach((f) => f());
        menungguSiap.delete(p.id);
      }
      opsi.utama.terima(p.id, m);
    });
    p.padaKeluar((kode, sinyal) => {
      c.keluar = true;
      hidup.delete(p.id);
      opsi.utama.pergi(p.id);
      menungguSiap.get(p.id)?.forEach((f) => f());
      menungguSiap.delete(p.id);
      menungguKeluar.get(p.id)?.forEach((f) => f());
      menungguKeluar.delete(p.id);
      if (c.disengaja || berhentiSemua) return;
      // A worker that was up a while did not crash because of how it started; count from fresh.
      if (Date.now() - c.waktuMulai > 60_000) gagalBerturut = 0;
      gagalBerturut++;
      const tunggu = jeda(gagalBerturut);
      log(
        `worker ${p.id} ended unexpectedly (code ${kode}, signal ${sinyal}); replacing in ${tunggu} ms`,
      );
      const t = setTimeout(() => {
        if (!berhentiSemua) mulaiSatu(gen);
      }, tunggu);
      t.unref?.();
    });
    return c;
  }

  /** Resolves true when the worker says it is ready, false when it left or took too long. */
  function tungguSiap(c: Catatan, ms: number): Promise<boolean> {
    if (c.siap) return Promise.resolve(true);
    if (c.keluar) return Promise.resolve(false);
    return new Promise<boolean>((selesai) => {
      const t = setTimeout(() => selesai(false), ms);
      t.unref?.();
      const daftar = menungguSiap.get(c.p.id) ?? [];
      daftar.push(() => {
        clearTimeout(t);
        selesai(c.siap && !c.keluar);
      });
      menungguSiap.set(c.p.id, daftar);
    });
  }

  function tungguKeluar(c: Catatan, ms: number): Promise<boolean> {
    if (c.keluar) return Promise.resolve(true);
    return new Promise<boolean>((selesai) => {
      const t = setTimeout(() => selesai(false), ms);
      t.unref?.();
      const daftar = menungguKeluar.get(c.p.id) ?? [];
      daftar.push(() => {
        clearTimeout(t);
        selesai(c.keluar);
      });
      menungguKeluar.set(c.p.id, daftar);
    });
  }

  /** Asks a worker to drain and waits for it to leave; ends it when it does not. */
  async function hentikan(c: Catatan): Promise<void> {
    c.disengaja = true;
    c.p.kirim({ i: "henti" });
    if (await tungguKeluar(c, hentiMs)) return;
    log(`worker ${c.p.id} did not leave in ${hentiMs} ms; ending it`);
    c.p.bunuh("SIGKILL");
    await tungguKeluar(c, 5000);
  }

  async function sekali(): Promise<boolean> {
    gen++;
    const g = gen;
    const lama = [...hidup.values()].filter((c) => c.gen < g && !c.disengaja);
    log(`rolling restart: generation ${g}, replacing ${lama.length} worker(s)`);
    for (const x of lama) {
      if (berhentiSemua || x.keluar) continue;
      const baru = mulaiSatu(g);
      if (!(await tungguSiap(baru, siapMs))) {
        log(
          `rolling restart stopped: worker ${baru.p.id} did not become ready; the old workers keep serving`,
        );
        baru.disengaja = true;
        baru.p.bunuh("SIGKILL");
        gen = g - 1;
        return false;
      }
      // The leader's duties go to the newest generation before the old worker drains.
      await Promise.race([
        opsi.utama.pensiunkan(x.p.id),
        new Promise<void>((selesai) => {
          const t = setTimeout(selesai, pensiunMs);
          t.unref?.();
        }),
      ]);
      await hentikan(x);
    }
    log(`rolling restart done: generation ${g}`);
    return true;
  }

  return {
    mulai() {
      for (let i = 0; i < opsi.jumlah; i++) mulaiSatu(gen);
    },
    async gulir() {
      if (berhentiSemua) return false;
      if (menggulir) {
        gulirLagi = true;
        return true;
      }
      menggulir = true;
      let ok = true;
      try {
        do {
          gulirLagi = false;
          ok = await sekali();
          if (!ok) break;
        } while (gulirLagi && !berhentiSemua);
      } finally {
        menggulir = false;
      }
      return ok;
    },
    async berhenti() {
      berhentiSemua = true;
      await Promise.all([...hidup.values()].map((c) => hentikan(c)));
    },
    status: () => ({
      gen,
      menggulir,
      pekerja: [...hidup.values()].map((c) => ({ id: c.p.id, gen: c.gen, siap: c.siap })),
    }),
  };
}
