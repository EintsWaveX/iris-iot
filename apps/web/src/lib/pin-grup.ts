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
 *
 * The board starts empty: `terpasang` names the wires plugged in so far
 * ("row:column" of the pin cell). A wire not plugged in keeps the module's
 * pin in the table and the code. Wiring saved before this existed (rows
 * but no list) counts as every wire plugged in.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, useMe, useSessionNow } from "./app";
import { useProyektor } from "./proyektor";
import { useSiaran } from "./siaran";
import type { BarisPin } from "./pin-kode";

export interface IsiGrup {
  baris: BarisPin | null;
  /** The plugged wires' pin cells, "row:column"; null = all of them */
  terpasang: string[] | null;
}

type Dengar = (b: IsiGrup) => void;
const KOSONG: IsiGrup = { baris: null, terpasang: [] };
const nilai = new Map<string, IsiGrup>();
const dengar = new Map<string, Set<Dengar>>();
const coba = new Map<number, IsiGrup>();

function kabari(url: string, b: IsiGrup) {
  nilai.set(url, b);
  dengar.get(url)?.forEach((fn) => fn(b));
}

export interface PinGrup {
  /** The group's rows, or null for the module's own pins */
  baris: BarisPin | null;
  /** Whether the wire on this pin cell is plugged into the board */
  terpasang: (row: number, kolom: number) => boolean;
  /** Plugged pin cells so far ("row:column") */
  daftar: string[];
  /** Saved for a group (else only tried out on this page) */
  grup: boolean;
  /** May move wires (a Praktikan on their own group, or anyone trying out) */
  boleh: boolean;
  /** Saves the rows and the plugged list; null rows empty the board */
  simpan: (b: BarisPin | null, terpasang?: string[]) => Promise<boolean>;
}

export function usePinGrup(modul: number): PinGrup {
  const me = useMe();
  const praktikan = me?.role === "praktikan";
  const now = useSessionNow(praktikan);
  // Projector mode reads the projected group's wiring, without ?lihat=.
  const pro = useProyektor(me);
  const lihat =
    me?.role === "asisten" && typeof location !== "undefined"
      ? (pro ?? Number(new URLSearchParams(location.search).get("lihat")))
      : NaN;
  const diSesi = praktikan && now.data?.modul === modul && now.data.milikSaya !== false;
  const sebagai = Number.isInteger(lihat) && lihat >= 1;
  const url = diSesi
    ? `/api/presentasi/pin-grup?modul=${modul}`
    : sebagai
      ? `/api/presentasi/pin-grup?modul=${modul}&kelompok=${lihat}`
      : null;
  const [isi, setIsi] = useState<IsiGrup>(() =>
    url ? (nilai.get(url) ?? KOSONG) : (coba.get(modul) ?? KOSONG),
  );

  const muat = useCallback(() => {
    if (!url) return;
    getJson<{ ok: boolean; baris: BarisPin | null; terpasang?: string[] | null }>(url)
      .then(
        (d) =>
          d.ok &&
          kabari(url, {
            baris: d.baris,
            terpasang: d.baris ? (d.terpasang ?? null) : [],
          }),
      )
      .catch(() => {});
  }, [url]);

  useEffect(() => {
    if (!url) {
      setIsi(coba.get(modul) ?? KOSONG);
      const fn: Dengar = (b) => setIsi(b);
      const k = `coba:${modul}`;
      if (!dengar.has(k)) dengar.set(k, new Set());
      dengar.get(k)!.add(fn);
      return () => void dengar.get(k)?.delete(fn);
    }
    if (!dengar.has(url)) dengar.set(url, new Set());
    const set = dengar.get(url)!;
    set.add(setIsi);
    if (nilai.has(url)) setIsi(nilai.get(url) ?? KOSONG);
    if (set.size === 1 || !nilai.has(url)) muat();
    return () => void set.delete(setIsi);
  }, [url, modul, muat]);
  // A groupmate's move (other groups' moves cost one small read).
  useSiaran(["pingrup", "sesi"], muat, !!url);

  const simpan = useCallback(
    async (b: BarisPin | null, terpasang: string[] = []): Promise<boolean> => {
      // Nothing plugged in: an empty board on the module's pins.
      const baru: IsiGrup = b && terpasang.length ? { baris: b, terpasang } : KOSONG;
      if (!url) {
        coba.set(modul, baru);
        dengar.get(`coba:${modul}`)?.forEach((fn) => fn(baru));
        return true;
      }
      if (!diSesi) return false;
      const lama = nilai.get(url) ?? KOSONG;
      kabari(url, baru);
      const r = await postJson<{ ok: boolean }>("/api/presentasi/pin-grup", {
        modul,
        baris: baru.baris,
        terpasang: baru.terpasang,
      }).catch(() => ({ ok: false }));
      if (!r.ok) kabari(url, lama);
      return r.ok;
    },
    [url, diSesi, modul],
  );

  const daftar = isi.terpasang ?? [];
  const terpasang = useCallback(
    (row: number, kolom: number) =>
      isi.baris !== null && (isi.terpasang === null || isi.terpasang.includes(`${row}:${kolom}`)),
    [isi],
  );

  return {
    baris: isi.baris,
    terpasang,
    daftar,
    grup: !!url,
    boleh: !url || diSesi,
    simpan,
  };
}
