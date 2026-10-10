/**
 * One rail for every page alert under the nav (offline, lab, live, TOT).
 * The first alert shows in full; the rest wait behind one chip, so two or
 * three notices never push the page below the first screen on a phone.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: {
    more: (n: number) => `${n} Peringatan Lain`,
    less: "Sembunyikan",
  },
  en: {
    more: (n: number) => `${n} More Alert${n > 1 ? "s" : ""}`,
    less: "Hide",
  },
  zh: {
    more: (n: number) => `另外 ${n} 条提醒`,
    less: "收起",
  },
});

export default function AlertRail({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = T[lang];
  const rail = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  // Each notice decides for itself whether to show, so count what landed
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const tally = () => setCount(el.querySelectorAll(":scope > .banner").length);
    tally();
    const watch = new MutationObserver(tally);
    watch.observe(el, { childList: true });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2) setOpen(false);
  }, [count]);

  return (
    <div
      ref={rail}
      className="alertrail"
      data-open={open ? "yes" : "no"}
      data-count={count}
      hidden={count === 0}
    >
      {children}
      {count > 1 && (
        <button
          type="button"
          className="alertrail__more"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t.less : t.more(count - 1)}
          <CaretDownIcon size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
