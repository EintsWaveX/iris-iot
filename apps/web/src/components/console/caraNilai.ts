/**
 * How this Asisten enters scores: one Praktikan at a time (Per Orang), or
 * one value for every present member of a group (Sama Rata). It is their
 * own habit rather than session data, so it lives in this browser; the
 * inspector and the Tabel Nilai follow the same choice at once.
 */
import { useEffect, useState } from "react";

export type CaraNilai = "orang" | "rata";

const KEY = "iris-nilai-cara";
const EV = "iris-nilai-cara";
/** The choice on this page, for when storage is blocked. */
let terakhir: CaraNilai = "orang";

function baca(): CaraNilai {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "rata" || v === "orang") return v;
  } catch {
    /* fall through */
  }
  return terakhir;
}

export function useCaraNilai(): [CaraNilai, (v: CaraNilai) => void] {
  const [cara, setCara] = useState<CaraNilai>("orang");
  useEffect(() => {
    setCara(baca());
    const ikut = () => setCara(baca());
    window.addEventListener(EV, ikut);
    window.addEventListener("storage", ikut);
    return () => {
      window.removeEventListener(EV, ikut);
      window.removeEventListener("storage", ikut);
    };
  }, []);
  const ubah = (v: CaraNilai) => {
    terakhir = v;
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      /* storage blocked: the choice still holds on this page */
    }
    setCara(v);
    window.dispatchEvent(new Event(EV));
  };
  return [cara, ubah];
}
