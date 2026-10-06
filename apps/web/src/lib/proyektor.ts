/**
 * Projector mode (user ruling 2026-10-04): an Asisten shows the class the
 * Praktikan view of the group they hold (Dasbor, module page with the live
 * code, Live, Presentasi, Perburuan) on the projector, with nothing
 * Asisten-only on screen. The group is kept in sessionStorage, so only the
 * tab on the projector changes; the Console's session bar turns it on and
 * the nav's Keluar Proyektor turns it off.
 */
import { useEffect, useMemo, useState } from "react";
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

/** Who a page is drawn for. In Projector mode the Asisten is drawn as a
 *  Praktikan of the projected group, with no Asisten-only fields, so every
 *  role check on a page the projector can reach goes through this instead of
 *  me.role (2026-10-07: Beranda and Modul showed the Asisten view). */
export function sebagaiTampil(
  me: Me | null | undefined,
  pro: number | null,
): Me | null | undefined {
  if (!me || pro === null) return me;
  return {
    ok: true,
    role: "praktikan",
    nim: me.nim,
    nama: me.nama,
    kelompok: pro,
  };
}

/** sebagaiTampil for a component: the same object until me or the mode changes. */
export function useTampil(me: Me | null | undefined): Me | null | undefined {
  const pro = useProyektor(me);
  return useMemo(() => sebagaiTampil(me, pro), [me, pro]);
}
