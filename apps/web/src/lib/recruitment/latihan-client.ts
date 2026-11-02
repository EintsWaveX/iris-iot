/**
 * Mode Latihan on the page (latihan.ts has the idea, recruitment-latihan.ts
 * the server). The server sets the `iris_latihan` cookie; the page only reads
 * it to draw the bar and to treat an Asisten who acts as CaAs like a
 * candidate. Every switch ends in a reload, so each island starts again on the
 * right edition instead of mixing two.
 */
import { useEffect, useState } from "react";
import { useMe, type Me } from "../app";
import { usePoll } from "../hooks";
import { modeDariCookie, type LatihanMode, type LatihanRingkas } from "./latihan";
import { isFail, recGet, recPost, type RecFail } from "./client";

export const LATIHAN_BERUBAH = "iris:latihan";

export const bacaLatihan = (): LatihanMode | null =>
  typeof document === "undefined" ? null : modeDariCookie(document.cookie);

/** The mode of this browser, kept in step with the cookie. */
export function useLatihanMode(): LatihanMode | null {
  // Null on the first render (the server cannot see the cookie); the effect reads it right after.
  const [mode, setMode] = useState<LatihanMode | null>(null);
  useEffect(() => {
    const baca = () => setMode(bacaLatihan());
    baca();
    window.addEventListener(LATIHAN_BERUBAH, baca);
    window.addEventListener("focus", baca);
    return () => {
      window.removeEventListener(LATIHAN_BERUBAH, baca);
      window.removeEventListener("focus", baca);
    };
  }, []);
  return mode;
}

/**
 * useMe(), except an Asisten who is practicing As CaAs reads as a plain
 * person: the recruitment pages then show them the CaAs side.
 */
export function useRecOrang(): Me | null | undefined {
  const me = useMe();
  const mode = useLatihanMode();
  return me?.role === "asisten" && mode === "caas" ? { ...me, role: "praktikan" } : me;
}

type LatihanJawab = { ok: true; latihan: LatihanRingkas };

export function useLatihanRingkas(enabled: boolean) {
  return usePoll(
    async () => {
      const r = await recGet<LatihanJawab>("latihan");
      return isFail(r) ? null : r.latihan;
    },
    300_000,
    enabled,
    [],
  );
}

/** Where to land after a switch: the panel for Asisten, the CaAs page for CaAs. */
function tujuan(mode: LatihanMode | null, prefix: string): string {
  return mode === "asisten" ? `${prefix}/recruitment/panel` : `${prefix}/recruitment`;
}

async function aksi(
  nama: "latihan-masuk" | "latihan-ganti" | "latihan-reset" | "latihan-keluar",
  body: unknown,
  mode: LatihanMode | null,
  prefix: string,
): Promise<RecFail | null> {
  const r = await recPost<LatihanJawab>(nama, body);
  if (isFail(r)) return r;
  window.dispatchEvent(new Event(LATIHAN_BERUBAH));
  location.assign(nama === "latihan-reset" ? location.href : tujuan(mode, prefix));
  return null;
}

export const latihanMasuk = (as: LatihanMode, prefix: string) =>
  aksi("latihan-masuk", { as }, as, prefix);
export const latihanGanti = (as: LatihanMode, prefix: string) =>
  aksi("latihan-ganti", { as }, as, prefix);
export const latihanReset = (prefix: string) => aksi("latihan-reset", {}, bacaLatihan(), prefix);
export const latihanKeluar = (prefix: string) => aksi("latihan-keluar", {}, null, prefix);

/** Prepares the sample CaAs from the Asisten list without entering practice or moving the page. */
export async function latihanSiapkan(): Promise<LatihanJawab | RecFail> {
  const r = await recPost<LatihanJawab>("latihan-siapkan", {});
  if (isFail(r)) return r;
  window.dispatchEvent(new Event(LATIHAN_BERUBAH));
  return r;
}
