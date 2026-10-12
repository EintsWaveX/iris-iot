/**
 * A group's own wiring in the running session (2026-10-12): pins a
 * Praktikan moved by dragging a jumper in a Pin dan Skema card. Saved for
 * their group only (api/_lib/pin.ts, pin-grup), so every groupmate's cards
 * and Kode step follow, and dropped when the session ends. The module's own
 * pins never change.
 *
 * Who it is for: a Praktikan in this module's running session (their group,
 * and they may rewire it), or an Asisten viewing as a group (?lihat=N, read
 * only). Anyone else gets an unsaved try out on the page, gone on reload.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, useMe, useSessionNow } from "./app";
import { useSiaran } from "./siaran";
import type { BarisPin } from "./pin-kode";

type Dengar = (b: BarisPin | null) => void;
const nilai = new Map<string, BarisPin | null>();
const dengar = new Map<string, Set<Dengar>>();
const coba = new Map<number, BarisPin | null>();

function kabari(url: string, b: BarisPin | null) {
  nilai.set(url, b);
  dengar.get(url)?.forEach((fn) => fn(b));
}

export interface PinGrup {
  /** The group's rows, or null for the module's own pins */
  baris: BarisPin | null;
  /** Saved for a group (else only tried out on this page) */
  grup: boolean;
  /** May move wires (a Praktikan on their own group, or anyone trying out) */
  boleh: boolean;
  simpan: (b: BarisPin | null) => Promise<boolean>;
}

export function usePinGrup(modul: number): PinGrup {
  const me = useMe();
  const praktikan = me?.role === "praktikan";
  const now = useSessionNow(praktikan);
  const lihat =
    me?.role === "asisten" && typeof location !== "undefined"
      ? Number(new URLSearchParams(location.search).get("lihat"))
      : NaN;
  const diSesi = praktikan && now.data?.modul === modul && now.data.milikSaya !== false;
  const sebagai = Number.isInteger(lihat) && lihat >= 1;
  const url = diSesi
    ? `/api/presentasi/pin-grup?modul=${modul}`
    : sebagai
      ? `/api/presentasi/pin-grup?modul=${modul}&kelompok=${lihat}`
      : null;
  const [baris, setBaris] = useState<BarisPin | null>(() =>
    url ? (nilai.get(url) ?? null) : (coba.get(modul) ?? null),
  );

  const muat = useCallback(() => {
    if (!url) return;
    getJson<{ ok: boolean; baris: BarisPin | null }>(url)
      .then((d) => d.ok && kabari(url, d.baris))
      .catch(() => {});
  }, [url]);

  useEffect(() => {
    if (!url) {
      setBaris(coba.get(modul) ?? null);
      const fn: Dengar = (b) => setBaris(b);
      const k = `coba:${modul}`;
      if (!dengar.has(k)) dengar.set(k, new Set());
      dengar.get(k)!.add(fn);
      return () => void dengar.get(k)?.delete(fn);
    }
    if (!dengar.has(url)) dengar.set(url, new Set());
    const set = dengar.get(url)!;
    set.add(setBaris);
    if (nilai.has(url)) setBaris(nilai.get(url) ?? null);
    if (set.size === 1 || !nilai.has(url)) muat();
    return () => void set.delete(setBaris);
  }, [url, modul, muat]);
  // A groupmate's move (other groups' moves cost one small read).
  useSiaran(["pingrup", "sesi"], muat, !!url);

  const simpan = useCallback(
    async (b: BarisPin | null): Promise<boolean> => {
      if (!url) {
        coba.set(modul, b);
        dengar.get(`coba:${modul}`)?.forEach((fn) => fn(b));
        return true;
      }
      if (!diSesi) return false;
      const lama = nilai.get(url) ?? null;
      kabari(url, b);
      const r = await postJson<{ ok: boolean }>("/api/presentasi/pin-grup", {
        modul,
        baris: b,
      }).catch(() => ({ ok: false }));
      if (!r.ok) kabari(url, lama);
      return r.ok;
    },
    [url, diSesi, modul],
  );

  return { baris, grup: !!url, boleh: !url || diSesi, simpan };
}
