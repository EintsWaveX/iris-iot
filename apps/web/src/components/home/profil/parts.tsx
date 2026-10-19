/**
 * Small pieces the Lab Profile shares: a photo in a fixed aspect box (no
 * layout shift, two sizes), a person's round avatar, the section heading
 * with its Edit link, the reveal-on-scroll hook, the count-up and the
 * pointer tilt. Every motion piece follows the motion tier (useMotionTier):
 * 0 or reduced motion shows everything still.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useMotionTier } from "../../../lib/hooks";
import type { Foto, OrangProfil } from "../../../lib/profil";

/**
 * How much the profile moves: 0 still, 2 everything. Only the reader's
 * reduced motion setting stills it. Its motion runs once (lines blending
 * in, reveals, the coverflow), so the site's detail level, which guards the
 * sky's never-ending drawing (Low Detail counts as reduced for the sky),
 * doesn't stop it; Low Detail only stands the hero's aurora still.
 */
export function useGerakProfil(): 0 | 2 {
  // Re-renders when the reduced motion setting changes.
  useMotionTier();
  if (typeof window === "undefined") return 2;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 2;
}

/** A photo filling its box, the small file first and the large one for
 *  wide boxes. `sizes` says how wide the box gets. */
export function Gambar({
  foto,
  alt,
  ratio,
  sizes,
  className,
}: {
  foto: Foto;
  alt: string;
  ratio?: string;
  sizes: string;
  className?: string;
}) {
  return (
    <span
      className={`pl-img${className ? ` ${className}` : ""}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      <img
        src={foto.kecil}
        srcSet={`${foto.kecil} 480w, ${foto.besar} 1600w`}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/** A person's photo, or their code on the division's colour. */
export function Avatar({
  o,
  size,
}: {
  o: Pick<OrangProfil, "nama" | "kode" | "foto">;
  size: number;
}) {
  const style = { width: size, height: size } as CSSProperties;
  if (o.foto)
    return (
      <img
        className="pl-av"
        src={o.foto.kecil}
        alt={o.nama}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <span className="pl-av pl-av--kode mono" style={style} role="img" aria-label={o.nama}>
      {o.kode}
    </span>
  );
}

export function Kepala({
  id,
  eyebrow,
  title,
  lede,
  ubah,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  /** The Edit link for those with the profil right. */
  ubah?: { href: string; label: string };
}) {
  return (
    <div className="pl-head" data-rv>
      <span className="eyebrow">{eyebrow}</span>
      <div className="pl-head__row">
        <h2 className="home__h1" id={id}>
          {title}
        </h2>
        {ubah && (
          <a className="btn btn--ghost btn--sm" href={ubah.href}>
            <span className="btn__label">{ubah.label}</span>
            <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
          </a>
        )}
      </div>
      {lede && <p className="pl-head__lede">{lede}</p>}
    </div>
  );
}

/** [data-rv] blocks under the returned ref lift in once as they enter the
 *  view (CSS in profil.css); tier 0 shows them at once. */
export function useMuncul<T extends HTMLElement>(tier: 0 | 2, dep: unknown) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const baru = () => [...root.querySelectorAll<HTMLElement>("[data-rv]:not(.is-in)")];
    if (tier === 0 || !("IntersectionObserver" in window)) {
      const semua = () => baru().forEach((e) => e.classList.add("is-in"));
      semua();
      // Blocks that load later (the events) show at once too.
      const mo = new MutationObserver(semua);
      mo.observe(root, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    const io = new IntersectionObserver(
      (list) =>
        list.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    const lihat = () => baru().forEach((e) => io.observe(e));
    lihat();
    const mo = new MutationObserver(lihat);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [tier, dep]);
  return ref;
}

/** Counts up once to `to` when it first shows (tier 2); else shows it. */
export function Hitung({ to, tier }: { to: number | null; tier: 0 | 2 }) {
  const ref = useRef<HTMLElement | null>(null);
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (to === null) return;
    if (tier === 0 || !("IntersectionObserver" in window)) {
      setV(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / 1100);
          setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, tier]);
  return (
    <b className="pl-stat__n mono" ref={ref}>
      {v ?? " "}
    </b>
  );
}

/** A light tilt toward the pointer: mouse only, tier 2 only. */
export function miring(tier: 0 | 2) {
  if (tier === 0) return {};
  return {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--rx", `${((e.clientY - r.top) / r.height - 0.5) * -6}deg`);
      el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.style.setProperty("--rx", "0deg");
      e.currentTarget.style.setProperty("--ry", "0deg");
    },
  };
}
