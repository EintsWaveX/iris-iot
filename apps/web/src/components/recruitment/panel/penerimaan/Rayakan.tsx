/**
 * The full-screen celebration for the Panitia when Jadikan Asisten succeeds
 * (mockup r8-rayakan): the biggest moment of the site. A dark veil, the title
 * rising in, each new Asisten's code landing one after another, confetti from
 * the corners and the centre and the five-note chime. Lighter at Low Detail,
 * and no motion or confetti at all for reduced motion (the words stay).
 */
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Lang } from "../../../../lib/kelas";
import { burst, chime, makeShooter, useRevealMotion } from "../../reveal/fx";
import { PNW } from "./pnStrings";

export default function Rayakan({
  lang,
  baru,
  onClose,
}: {
  lang: Lang;
  baru: { nim: string; nama: string; kode: string }[];
  onClose: () => void;
}) {
  const t = PNW(lang).celebrate;
  const motion = useRevealMotion();
  const root = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const tutup = useRef<HTMLButtonElement | null>(null);

  const keluar = useRef(onClose);
  keluar.current = onClose;

  // Focus moves to the close button once, and goes back to whatever opened the
  // celebration (the button the Panitia pressed) when it closes.
  useEffect(() => {
    const pembuka = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tutup.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") keluar.current();
      // The close button is the only control, so Tab stays on it.
      if (e.key === "Tab") {
        e.preventDefault();
        tutup.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (pembuka?.isConnected) pembuka.focus();
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timers: number[] = [];
    let alive = true;
    const ctx = gsap.context(() => {
      if (motion === "reduce") return;
      gsap.from(".r8cel__veil", { opacity: 0, duration: 0.5, ease: "power2.out" });
      gsap.from(".r8cel__title", {
        y: 36,
        opacity: 0,
        scale: 0.94,
        duration: 0.9,
        delay: 0.25,
        ease: "expo.out",
      });
      gsap.from(".r8cel__sub", {
        y: 16,
        opacity: 0,
        duration: 0.6,
        delay: 0.6,
        ease: "power3.out",
      });
      gsap.from(".r8cel__chip", {
        y: 22,
        opacity: 0,
        scale: 0.8,
        duration: 0.5,
        delay: 0.9,
        stagger: { each: motion === "ldm" ? 0.02 : 0.07, from: "random" },
        ease: "back.out(1.6)",
      });
      gsap.to(".r8cel__glow", {
        scale: 1.1,
        opacity: 0.4,
        duration: 2.4,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    }, el);
    chime("terima");
    if (canvas.current && motion !== "reduce")
      void makeShooter(canvas.current).then((shooter) => {
        if (!alive) return;
        burst(shooter, "terima", motion, timers);
      });
    return () => {
      alive = false;
      timers.forEach((x) => window.clearTimeout(x));
      ctx.revert();
    };
  }, [motion]);

  return (
    <div className="r8cel" ref={root} role="dialog" aria-modal="true" aria-label={t.title}>
      <div className="r8cel__veil" />
      <div className="r8cel__glow" aria-hidden="true" />
      <canvas ref={canvas} className="r8cel__canvas" aria-hidden="true" />
      <div className="r8cel__body">
        <h2 className="r8cel__title">{t.title}</h2>
        <p className="r8cel__sub">{t.sub(baru.length)}</p>
        <ul className="r8cel__chips">
          {baru.map((b) => (
            <li key={b.nim} className="r8cel__chip">
              <b className="acode">{b.kode}</b>
              <span>{b.nama}</span>
            </li>
          ))}
        </ul>
        <button type="button" ref={tutup} className="btn btn--inverse" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}
