/**
 * The Lab Profile's photo viewer: one photo at a time over a dark screen,
 * with arrows, the keyboard (left, right, Esc), a swipe on touch, a counter
 * and a strip of thumbnails. Radix keeps it in the same layer stack as the
 * kit's dialogs, so Esc closes only the viewer when it opens over one.
 */
import { useEffect, useRef, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import IconButton from "../../ui/IconButton";
import type { Lang } from "../../../lib/kelas";
import { useGerakProfil } from "./parts";
import { P } from "./profilStrings";

export interface FotoLihat {
  besar: string;
  kecil: string;
  alt: string;
  cap?: string;
}

export default function Lightbox({
  lang,
  pics,
  start,
  onClose,
}: {
  lang: Lang;
  pics: FotoLihat[];
  start: number;
  onClose: () => void;
}) {
  const t = P[lang];
  const [i, setI] = useState(start);
  const [dir, setDir] = useState(0);
  const touch = useRef<number | null>(null);
  const many = pics.length > 1;
  const still = useGerakProfil() === 0;
  const go = (d: number) => {
    setDir(d);
    setI((x) => (x + d + pics.length) % pics.length);
  };

  // Keep the current thumbnail in view.
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [i]);

  const p = pics[i];
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="pl-lb__overlay" />
        <RadixDialog.Content
          className="pl-lb"
          data-still={still || undefined}
          aria-describedby={undefined}
          tabIndex={-1}
          // Focus the viewer, as the kit's Dialog does: landing on the close
          // button would pop its tooltip, and Esc would close only that.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onKeyDown={(e) => {
            if (!many) return;
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
            if (many && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="pl-lb__top">
            <RadixDialog.Title className="pl-lb__count mono">
              {many ? `${i + 1} / ${pics.length}` : t.foto}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton icon={XIcon} label={t.tutup} />
            </RadixDialog.Close>
          </div>
          <figure className="pl-lb__fig" key={i} data-dir={dir}>
            <img src={p.besar} alt={p.alt} decoding="async" />
            {p.cap && <figcaption>{p.cap}</figcaption>}
          </figure>
          {many && (
            <div className="pl-lb__nav">
              <IconButton icon={CaretLeftIcon} label={t.fotoSebelumnya} onClick={() => go(-1)} />
              <IconButton icon={CaretRightIcon} label={t.fotoBerikutnya} onClick={() => go(1)} />
            </div>
          )}
          {many && (
            <div className="pl-lb__strip" ref={strip}>
              {pics.map((q, j) => (
                <button
                  key={q.kecil + j}
                  type="button"
                  aria-label={`${t.foto} ${j + 1}`}
                  aria-current={j === i ? "true" : undefined}
                  onClick={() => {
                    setDir(j > i ? 1 : -1);
                    setI(j);
                  }}
                >
                  <img src={q.kecil} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
