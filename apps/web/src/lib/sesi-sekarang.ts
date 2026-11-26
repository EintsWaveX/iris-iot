import type { SesiNow } from "./app";

export type SesiSekarang = { ok: boolean; sesi: SesiNow | null };

/**
 * The running session as this browser sees it right after sign-in. A Praktikan who just joined one
 * (`harusAda`) must get it back with `milikSaya` not false; a phone on a slow or switching link can miss the
 * first answer, and a miss used to read as "no session" (the button said Ke Dasbor instead of Masuk ke
 * Praktikum). So a join asks up to three times, a short wait between; any other sign-in asks once.
 */
export async function sesiSekarang(
  harusAda: boolean,
  ambil: () => Promise<SesiSekarang>,
  tunggu: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SesiSekarang> {
  let hasil: SesiSekarang = { ok: false, sesi: null };
  for (let i = 0; i < (harusAda ? 3 : 1); i++) {
    if (i > 0) await tunggu(700 * i);
    try {
      hasil = await ambil();
    } catch {
      continue;
    }
    if (!harusAda || (hasil.sesi && hasil.sesi.milikSaya !== false)) break;
  }
  return hasil;
}
