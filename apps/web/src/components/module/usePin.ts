/**
 * The pin tables as set in the pin settings dialog, for every Pin dan Skema card
 * and the editor. One request per page however many cards ask, again when
 * a schematic or pin change is announced or saved here; every card hears
 * the new tables at once.
 */
import { useEffect, useState } from "react";
import { getJson } from "../../lib/app";
import { useSiaran } from "../../lib/siaran";
import type { BarisPin } from "../../lib/pin-kode";
import type { PapanId } from "../../lib/papan";

export interface PinData {
  /** Saved rows per module, null = the bundled table */
  pin: Record<string, BarisPin | null>;
  /** The boards each module is set for */
  papan: Record<string, PapanId[]>;
  /** The bundled rows per module */
  bawaan: Record<string, BarisPin>;
}

const KOSONG: PinData = { pin: {}, papan: {}, bawaan: {} };
const dengar = new Set<(d: PinData) => void>();
let muat: Promise<PinData> | null = null;
let muatPada = 0;

/** The shared request; `segar` asks again unless one went out a moment ago */
export function ambilPin(segar = false): Promise<PinData> {
  if (!muat || (segar && Date.now() - muatPada > 1000)) {
    muatPada = Date.now();
    muat = getJson<{ ok: boolean } & PinData>("/api/presentasi/pin")
      .then((d) =>
        d.ok ? { pin: d.pin ?? {}, papan: d.papan ?? {}, bawaan: d.bawaan ?? {} } : KOSONG,
      )
      .catch(() => KOSONG);
    void muat.then((d) => dengar.forEach((fn) => fn(d)));
  }
  return muat;
}

export function usePin(): PinData | null {
  const [data, setData] = useState<PinData | null>(null);
  useEffect(() => {
    dengar.add(setData);
    void ambilPin().then(setData);
    return () => {
      dengar.delete(setData);
    };
  }, []);
  useSiaran(["presentasi"], () => void ambilPin(true));
  return data;
}
