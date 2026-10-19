/**
 * A division (or the Inti) opened on Home: a full screen carousel whose
 * first page is the group's photo, whole and as large as the screen allows,
 * with its description, then one page per member with their photo, name,
 * code and position. Arrows, the keyboard (left, right, Esc), a swipe and a
 * strip of thumbnails move between pages; the next and previous photos load
 * ahead so a page turns without a blank. Radix keeps it in the kit's layer
 * stack, like the Lightbox it shares its frame with.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import IconButton from "../../ui/IconButton";
import type { Lang } from "../../../lib/kelas";
import { teksDi, type Foto, type OrangProfil, type TeksTiga } from "../../../lib/profil";
import { useGerakProfil } from "./parts";
import { P } from "./profilStrings";

/** A division or the Inti, as its card and this viewer show it. */
export interface Grup {
  /** "ASO".."ARM", or "INTI". */
  kunci: string;
  /** What the card and the viewer print as its code. */
  label: string;
  nama: string;
  warna: string;
  foto: Foto | null;
  baris: TeksTiga;
  deskripsi: TeksTiga;
  anggota: OrangProfil[];
}

/** A page's photo, or the code on the group's colour when there is none. */
function Gambar({ foto, kode, alt }: { foto: Foto | null; kode: string; alt: string }) {
  if (foto) return <img src={foto.besar} alt={alt} decoding="async" />;
  return (
    <span className="pl-gv__kode mono" role="img" aria-label={alt}>
      {kode}
    </span>
  );
}

export default function LihatGrup({
  lang,
  g,
  onClose,
}: {
  lang: Lang;
  g: Grup;
  onClose: () => void;
}) {
  const t = P[lang];
  const still = useGerakProfil() === 0;
  const n = g.anggota.length + 1;
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(0);
  const touch = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const ke = (j: number) => {
    setDir(j > i ? 1 : -1);
    setI(j);
  };
  const go = (d: number) => {
    setDir(d);
    setI((x) => (x + d + n) % n);
  };

  // A member who left while the viewer was open: stay within the pages.
  const cur = Math.min(i, n - 1);
  const o = cur > 0 ? g.anggota[cur - 1] : null;
  const fotoDi = (j: number) => (j === 0 ? g.foto : (g.anggota[j - 1]?.foto ?? null));

  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
    // The pages either side load ahead.
    for (const j of [cur + 1, cur - 1]) {
      const f = fotoDi((j + n) % n);
      if (f) new Image().src = f.besar;
    }
  }, [cur, n]);

  return (
    <RadixDialog.Root open onOpenChange={(v) => !v && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="pl-lb__overlay" />
        <RadixDialog.Content
          className="pl-lb pl-gv"
          style={{ "--c": g.warna } as CSSProperties}
          data-still={still || undefined}
          aria-describedby={undefined}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="pl-lb__top">
            <RadixDialog.Title className="pl-gv__title">
              <span className="mono">{g.label}</span>
              <span>{g.nama}</span>
            </RadixDialog.Title>
            <span className="pl-lb__count mono" aria-live="polite">
              {t.halaman(cur + 1, n)}
            </span>
            <RadixDialog.Close asChild>
              <IconButton icon={XIcon} label={t.tutup} />
            </RadixDialog.Close>
          </div>

          <div className="pl-gv__stage" key={cur} data-dir={dir}>
            <figure className="pl-gv__fig">
              {o ? (
                <Gambar foto={o.foto} kode={o.kode} alt={o.nama} />
              ) : (
                <Gambar foto={g.foto} kode={g.label} alt={t.divFoto(g.label)} />
              )}
            </figure>
            <div className="pl-gv__info">
              {o ? (
                <>
                  <span className="eyebrow">{t.peran[o.peran]}</span>
                  <h3 className="pl-gv__name">{o.nama}</h3>
                  <span className="pl-gv__code mono">{o.kode}</span>
                  <span className="pl-gv__muted">
                    {g.label} · {g.nama}
                  </span>
                </>
              ) : (
                <>
                  <span className="eyebrow">{t.nAsisten(g.anggota.length)}</span>
                  <h3 className="pl-gv__name">{g.nama}</h3>
                  <b className="pl-gv__line">{teksDi(g.baris, lang)}</b>
                  <p className="pl-gv__muted">{teksDi(g.deskripsi, lang)}</p>
                  {!g.anggota.length && <p className="pl-gv__muted">{t.belumAnggota}</p>}
                </>
              )}
            </div>
          </div>

          {n > 1 && (
            <div className="pl-gv__nav">
              <IconButton icon={CaretLeftIcon} label={t.sebelumnyaOrang} onClick={() => go(-1)} />
              <IconButton icon={CaretRightIcon} label={t.berikutnyaOrang} onClick={() => go(1)} />
            </div>
          )}

          {n > 1 && (
            <div className="pl-lb__strip pl-gv__strip" ref={strip}>
              <button
                type="button"
                aria-label={t.divFoto(g.label)}
                aria-current={cur === 0 ? "true" : undefined}
                onClick={() => ke(0)}
              >
                {g.foto ? (
                  <img src={g.foto.kecil} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="mono">{g.label}</span>
                )}
              </button>
              {g.anggota.map((p, j) => (
                <button
                  key={p.kode}
                  type="button"
                  aria-label={p.nama}
                  aria-current={cur === j + 1 ? "true" : undefined}
                  onClick={() => ke(j + 1)}
                >
                  {p.foto ? (
                    <img src={p.foto.kecil} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="mono">{p.kode}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
