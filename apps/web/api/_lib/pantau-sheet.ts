/**
 * Watches a Google Form responses sheet on behalf of the pages looking at it (the QR wall, the Kehadiran
 * drawer): while a page keeps asking, the server reads the sheet every few seconds itself and announces the
 * moment its newest rows change, so pages are told instead of each one asking every 6 s. It stops reading
 * `sepiMs` after the last ask. Off until switched on (`aktif`), so tests and scripts never read a sheet in the
 * background.
 */
export interface OpsiPantau<T> {
  /** Reads the sheet now (not from a cache); null when it cannot be read. */
  baca: (kunci: string) => Promise<T | null>;
  /** Called when what the sheet shows changed since the last look. */
  kabari: () => Promise<unknown> | unknown;
  jedaMs?: number;
  sepiMs?: number;
  now?: () => number;
}

export interface Pantau<T> {
  aktif: boolean;
  /** A page just asked and was shown `isi`; keeps (or starts) the watch for `kunci`. */
  diminta(kunci: string, isi: T): void;
  jumlah(): number;
  hentikan(): void;
}

export function buatPantau<T>(opsi: OpsiPantau<T>): Pantau<T> {
  const now = opsi.now ?? Date.now;
  const jedaMs = opsi.jedaMs ?? 2_500;
  const sepiMs = opsi.sepiMs ?? 30_000;
  const peta = new Map<
    string,
    { diminta: number; tanda: string; timer: ReturnType<typeof setInterval> }
  >();

  const p: Pantau<T> = {
    aktif: false,
    diminta(kunci, isi) {
      if (!p.aktif) return;
      const ada = peta.get(kunci);
      if (ada) {
        ada.diminta = now();
        return;
      }
      const w = {
        diminta: now(),
        tanda: JSON.stringify(isi),
        timer: undefined as unknown as ReturnType<typeof setInterval>,
        jalan: false,
      };
      w.timer = setInterval(() => {
        void (async () => {
          if (now() - w.diminta > sepiMs) {
            clearInterval(w.timer);
            peta.delete(kunci);
            return;
          }
          // A read still going when the next one is due is not doubled.
          if (w.jalan) return;
          w.jalan = true;
          try {
            const baru = await opsi.baca(kunci);
            if (baru === null) return;
            const tanda = JSON.stringify(baru);
            if (tanda === w.tanda) return;
            w.tanda = tanda;
            await opsi.kabari();
          } catch (err) {
            console.error("[pantau-sheet] read failed:", err);
          } finally {
            w.jalan = false;
          }
        })();
      }, jedaMs);
      w.timer.unref?.();
      peta.set(kunci, w);
    },
    jumlah: () => peta.size,
    hentikan() {
      for (const w of peta.values()) clearInterval(w.timer);
      peta.clear();
    },
  };
  return p;
}
