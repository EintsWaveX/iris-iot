/**
 * The TP's PDF as IRIS puts it on each class's LMS assignment (2026-10-14):
 * the saved Final Set, Reguler in Bahasa Indonesia and International in
 * English, built here in the browser and sent base64 with the lms-tugas
 * call. One build per class kind per batch.
 */
import { buatPdfTp, namaBerkasTp, type TpPdfIsi } from "../../lib/tp-pdf";
import type { KelasTp } from "../../lib/tp";
import { soalDari, type PaketData } from "./shared";

export interface PdfLms {
  nama: string;
  /** base64 */
  isi: string;
}

export function isiPdfLms(d: PaketData, kelas: KelasTp): TpPdfIsi {
  const bahasa = kelas === "inter" ? "en" : "id";
  return {
    modul: d.paket.modul,
    bahasa,
    kelas,
    semester: d.semester,
    jendela: d.jendela,
    petunjuk: d.paket.petunjuk[bahasa],
    soal: soalDari(d.paket, bahasa),
  };
}

function base64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A builder for one batch: each class kind's paper made once. */
export function pembuatPdfLms(d: PaketData): (kelas: string) => Promise<PdfLms> {
  const sudah = new Map<KelasTp, Promise<PdfLms>>();
  return (k) => {
    const kelas: KelasTp = k === "inter" ? "inter" : "reguler";
    let p = sudah.get(kelas);
    if (!p) {
      const isi = isiPdfLms(d, kelas);
      p = buatPdfTp(isi).then((b) => ({ nama: namaBerkasTp(isi), isi: base64(b) }));
      sudah.set(kelas, p);
    }
    return p;
  };
}
