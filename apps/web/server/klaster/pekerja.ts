/**
 * The worker's side of the bus to the supervisor (real-time upgrade, Phase 3). `server/main.ts` makes one when it
 * runs as a worker; it turns calls ("announce these topics") into messages (protokol.ts) and the supervisor's
 * messages into calls on the handlers main.ts sets. Pure over two functions (send, and a clock), so tests run
 * it against a fake supervisor.
 */
import type {
  ApaTanya,
  BarisHadir,
  Cincin,
  DariPekerja,
  DariUtama,
  InfoHadir,
} from "./protokol.js";

export interface Sinkron {
  id: number;
  gen: number;
  n: number;
  e: string;
  cincin: Cincin[];
  hadir: BarisHadir[];
  kv: Array<[string, unknown, number]>;
  pemimpin: { id: number; port: number } | null;
}

/** What the worker does when the supervisor says something. Anything left out is ignored. */
export interface PenanganBus {
  siar?(n: number, e: string, t: string[]): void;
  kirim?(ruang: string, m: unknown[]): void;
  tutup?(ruang: string): void;
  hadir?(w: number, ruang: string, id: number, info: InfoHadir | null): void;
  pergi?(w: number): void;
  batal?(): void;
  taruh?(kunci: string, nilai: unknown, sampai: number): void;
  pimpin?(): void | Promise<void>;
  /** Put the leader's duties down (it answers the supervisor itself when this returns). */
  lepas?(): void | Promise<void>;
  pemimpin?(p: { id: number; port: number } | null): void;
  pantau?(kunci: string, isi: unknown): void;
  /** The numbers this worker reports when asked. */
  tanya?(apa: ApaTanya): unknown;
  henti?(): void;
}

export interface BusPekerja {
  penangan: PenanganBus;
  /** Says hello and waits for the state to start from; null when the supervisor does not answer in `ms`. */
  halo(ms?: number): Promise<Sinkron | null>;
  /** Ready for visitors; `port` is this worker's own door on 127.0.0.1. */
  siap(port: number): void;
  siarkan(topik: string[]): void;
  kirimRuang(ruang: string, m: unknown[]): void;
  tutupRuang(ruang: string): void;
  hadir(ruang: string, id: number, info: InfoHadir | null): void;
  batal(): void;
  taruh(kunci: string, nilai: unknown, ttlMs: number): void;
  /** True the first time anyone on any worker shows `kunci`; false after, or when the supervisor does not answer. */
  sekali(kunci: string, ttlMs: number): Promise<boolean>;
  /** Tells the leader a page is asking for something only it watches. */
  pantau(kunci: string, isi: unknown): void;
  /** Every worker's numbers (this one included). */
  tanyaSemua(apa: ApaTanya, ms?: number): Promise<unknown[]>;
  pemimpin(): { id: number; port: number } | null;
  /** Hand every message the supervisor sends to this. */
  terima(m: DariUtama): void;
}

export interface OpsiBusPekerja {
  kirim: (m: DariPekerja) => void;
  /** Answers within this long or the question gives up (default 3 s). */
  balasMs?: number;
}

export function buatBusPekerja(opsi: OpsiBusPekerja): BusPekerja {
  const balasMs = opsi.balasMs ?? 3000;
  const penangan: PenanganBus = {};
  let r = 0;
  const sekaliMenunggu = new Map<number, (ok: boolean) => void>();
  const tanyaMenunggu = new Map<number, (d: unknown[]) => void>();
  let sambut: ((s: Sinkron) => void) | null = null;
  let pemimpin: { id: number; port: number } | null = null;

  const aman = (f: () => unknown) => {
    try {
      const h = f();
      if (h && typeof (h as Promise<unknown>).catch === "function") {
        (h as Promise<unknown>).catch((err) => console.error("[klaster] handler failed:", err));
      }
    } catch (err) {
      console.error("[klaster] handler failed:", err);
    }
  };

  const bus: BusPekerja = {
    penangan,
    halo(ms = 5000) {
      return new Promise<Sinkron | null>((selesai) => {
        const timer = setTimeout(() => {
          sambut = null;
          selesai(null);
        }, ms);
        timer.unref?.();
        sambut = (s) => {
          clearTimeout(timer);
          sambut = null;
          selesai(s);
        };
        opsi.kirim({ i: "halo" });
      });
    },
    siap: (port) => opsi.kirim({ i: "siap", port }),
    siarkan: (t) => opsi.kirim({ i: "siar", t }),
    kirimRuang: (ruang, m) => opsi.kirim({ i: "kirim", ruang, m }),
    tutupRuang: (ruang) => opsi.kirim({ i: "tutup", ruang }),
    hadir: (ruang, id, info) => opsi.kirim({ i: "hadir", ruang, id, info }),
    batal: () => opsi.kirim({ i: "batal" }),
    taruh: (kunci, nilai, ttlMs) =>
      opsi.kirim({ i: "taruh", kunci, nilai, sampai: Date.now() + ttlMs }),
    sekali(kunci, ttlMs) {
      return new Promise<boolean>((selesai) => {
        const no = ++r;
        const timer = setTimeout(() => {
          sekaliMenunggu.delete(no);
          selesai(false);
        }, balasMs);
        timer.unref?.();
        sekaliMenunggu.set(no, (ok) => {
          clearTimeout(timer);
          selesai(ok);
        });
        opsi.kirim({ i: "sekali", r: no, kunci, ttl: ttlMs });
      });
    },
    pantau: (kunci, isi) => opsi.kirim({ i: "pantau", kunci, isi }),
    tanyaSemua(apa, ms = 2000) {
      return new Promise<unknown[]>((selesai) => {
        const no = ++r;
        const timer = setTimeout(() => {
          tanyaMenunggu.delete(no);
          selesai([]);
        }, ms);
        timer.unref?.();
        tanyaMenunggu.set(no, (d) => {
          clearTimeout(timer);
          selesai(d);
        });
        opsi.kirim({ i: "tanya", r: no, apa });
      });
    },
    pemimpin: () => pemimpin,

    terima(m) {
      switch (m.i) {
        case "sinkron":
          pemimpin = m.pemimpin;
          sambut?.({
            id: m.id,
            gen: m.gen,
            n: m.n,
            e: m.e,
            cincin: m.cincin,
            hadir: m.hadir,
            kv: m.kv,
            pemimpin: m.pemimpin,
          });
          return;
        case "siar":
          return aman(() => penangan.siar?.(m.n, m.e, m.t));
        case "kirim":
          return aman(() => penangan.kirim?.(m.ruang, m.m));
        case "tutup":
          return aman(() => penangan.tutup?.(m.ruang));
        case "hadir":
          return aman(() => penangan.hadir?.(m.w, m.ruang, m.id, m.info));
        case "pergi":
          return aman(() => penangan.pergi?.(m.w));
        case "batal":
          return aman(() => penangan.batal?.());
        case "taruh":
          return aman(() => penangan.taruh?.(m.kunci, m.nilai, m.sampai));
        case "balas": {
          const f = sekaliMenunggu.get(m.r);
          sekaliMenunggu.delete(m.r);
          f?.(m.ok);
          return;
        }
        case "pimpin":
          return aman(() => penangan.pimpin?.());
        case "lepas":
          // Always answered, even when the handler fails: the supervisor is waiting on it.
          void (async () => {
            try {
              await penangan.lepas?.();
            } catch (err) {
              console.error("[klaster] putting the leader's duties down failed:", err);
            }
            opsi.kirim({ i: "lepas-ok" });
          })();
          return;
        case "pemimpin":
          pemimpin = m.id !== null && m.port !== null ? { id: m.id, port: m.port } : null;
          return aman(() => penangan.pemimpin?.(pemimpin));
        case "pantau":
          return aman(() => penangan.pantau?.(m.kunci, m.isi));
        case "tanya":
          void (async () => {
            let data: unknown = null;
            try {
              data = await penangan.tanya?.(m.apa);
            } catch (err) {
              console.error("[klaster] answering the supervisor failed:", err);
            }
            opsi.kirim({ i: "jawab", r: m.r, data });
          })();
          return;
        case "hasil": {
          const f = tanyaMenunggu.get(m.r);
          tanyaMenunggu.delete(m.r);
          f?.(m.data);
          return;
        }
        case "henti":
          return aman(() => penangan.henti?.());
      }
    },
  };
  return bus;
}
