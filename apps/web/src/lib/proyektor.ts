/**
 * Projector mode (user ruling 2026-10-04): an Asisten shows the class the
 * Praktikan view of the group they hold (Dasbor, module page with the live
 * code, Live, Presentasi, Perburuan) on the projector, with nothing
 * Asisten-only on screen. The group is kept in sessionStorage, so only the
 * tab on the projector changes; the Console's session bar turns it on and
 * the nav's Keluar Proyektor turns it off.
 */
import { useEffect, useState } from "react";
import type { Me } from "./app";

const KUNCI = "iris-proyektor";
const EVENT = "iris:proyektor";

export function bacaProyektor(): number | null {
  try {
    const v = Number(sessionStorage.getItem(KUNCI));
    return Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
  } catch {
    return null;
  }
}

export function masukProyektor(kelompok: number): void {
  try {
    sessionStorage.setItem(KUNCI, String(kelompok));
  } catch {
    /* private mode: the mode lasts until this page reloads */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function keluarProyektor(): void {
  try {
    sessionStorage.removeItem(KUNCI);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The projected group for a signed-in Asisten, else null. Read after mount
 *  (the server render has no sessionStorage). */
export function useProyektor(me: Me | null | undefined): number | null {
  const [g, setG] = useState<number | null>(null);
  useEffect(() => {
    const on = () => setG(bacaProyektor());
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return me?.role === "asisten" ? g : null;
}
