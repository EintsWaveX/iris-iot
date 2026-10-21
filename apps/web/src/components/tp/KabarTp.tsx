/**
 * The TP notices a Praktikan sees (2026-10-21, the LMS Pengumuman's, inside
 * IRIS now): on the Dasbor's TP card and in the module's TP step, newest
 * first. Tutup hides one in this browser only.
 */
import { useState } from "react";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import type { KabarTampil } from "../../lib/tp-kabar";
import { TPS } from "./tpStrings";
import { waktuPanjang } from "./shared";

const KUNCI = "iris-tp-kabar-tutup";

function bacaTutup(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KUNCI) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function KabarTp({ lang, kabar }: { lang: Lang; kabar: KabarTampil[] | undefined }) {
  const t = TPS[lang];
  const [tutup, setTutup] = useState(bacaTutup);
  const tampil = (kabar ?? []).filter((k) => !tutup.includes(k.id));
  if (!tampil.length) return null;
  const sembunyikan = (id: string) => {
    // The newest 50 are enough to remember.
    const baru = [id, ...tutup.filter((x) => x !== id)].slice(0, 50);
    setTutup(baru);
    try {
      localStorage.setItem(KUNCI, JSON.stringify(baru));
    } catch {
      /* private window: hidden until the page reloads */
    }
  };
  return (
    <ul className="tpkabar" aria-label={t.kabarLabel}>
      {tampil.map((k) => (
        <li key={k.id} className="banner" data-jenis={k.jenis}>
          <span className="stack stack--sm">
            <b>{k.judul}</b>
            <span>{k.isi}</span>
            <span className="hint">
              {[k.modul ? modulLabel(k.modul, lang) : "", waktuPanjang(k.pada, lang)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => sembunyikan(k.id)}
          >
            {t.kabarTutup}
          </button>
        </li>
      ))}
    </ul>
  );
}
