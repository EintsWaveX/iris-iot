/**
 * The four module cards (Phase 8), shared by the landing page and the
 * modules index. Each card shows its live state: running now, open or
 * locked. A praktikan also sees their code progress as a ring; an assistant
 * gets the module's lock switch right on the card (the same action as the
 * console's access popover, with undo). Cards tilt towards the pointer and
 * glow in the module's hue at motion tier 1 and up, and the running module
 * pulses slowly.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Switch } from "../ui/Controls";
import { ProgressRing } from "../ui/Display";
import { href, useMe, useSessionNow } from "../../lib/app";
import { getAksesState } from "../../scripts/modul-akses";
import { setModulAkses } from "../shell/AsistenCommands";
import { useProgres } from "../shared/useProgres";
import type { Lang } from "../../lib/kelas";
import "./ModuleCards.css";

export interface ModulKartu {
  modul: number;
  judul: string;
  tagline: string;
  fakta: string[];
  berkas: { slug: string; blanks: number }[];
}

const T = {
  id: {
    modul: "Modul",
    run: "Berjalan",
    open: "Terbuka",
    locked: "Belum dibuka",
    go: "Buka modul",
    access: (n: number) => `Buka Modul ${n} untuk praktikan`,
    blanks: (b: number, t: number) => `${b}/${t} rumpang`,
  },
  en: {
    modul: "Module",
    run: "Running",
    open: "Open",
    locked: "Not open yet",
    go: "Open module",
    access: (n: number) => `Open Module ${n} to students`,
    blanks: (b: number, t: number) => `${b}/${t} blanks`,
  },
};

const PATHS: Record<number, string[]> = {
  1: ["M7 7l10 10-5 5V2l5 5L7 17"],
  2: ["M4 12h4l2-6 4 12 2-6h4"],
  3: ["M12 3v4M12 17v4M3 12h4M17 12h4", "M12 9.6a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 1 0 0-4.8"],
  4: [
    "M4 18c4-8 12-8 16 0M7.5 18c2.4-4.8 6.6-4.8 9 0",
    "M12 16.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8",
  ],
};

export function ModIcon({ modul }: { modul: number }) {
  return (
    <span className="mcard__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        {PATHS[modul]?.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

function Card({
  m,
  i,
  lang,
  state,
  progres,
  asisten,
  onToggle,
}: {
  m: ModulKartu;
  i: number;
  lang: Lang;
  state: "run" | "open" | "locked" | null;
  progres: { benar: number; total: number } | null | undefined;
  asisten: boolean;
  onToggle: (open: boolean) => void;
}) {
  const t = T[lang];
  const ref = useRef<HTMLDivElement>(null);
  const total = m.berkas.reduce((a, b) => a + b.blanks, 0);

  function tilt(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--rx", `${((e.clientY - r.top) / r.height - 0.5) * -6}deg`);
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
    el.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
  }
  function reset() {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      ref={ref}
      className="mcard"
      data-state={state ?? undefined}
      style={{ "--mod-hue": `var(--mod-${m.modul})`, "--i": i } as CSSProperties}
      onPointerMove={tilt}
      onPointerLeave={reset}
    >
      <a className="mcard__link" href={href(lang, `/modules/${m.modul}`)}>
        <span className="mcard__glow" aria-hidden="true" />
        <span className="mcard__head">
          <ModIcon modul={m.modul} />
          {state && (
            <span
              className={`pill ${state === "run" ? "pill--ok" : state === "open" ? "pill--accent" : ""}`}
            >
              {state === "run" && <span className="dot dot--ok dot--pulse" aria-hidden="true" />}
              {state === "locked" && <Lock size={12} aria-hidden="true" />}
              {state === "run" ? t.run : state === "open" ? t.open : t.locked}
            </span>
          )}
        </span>
        <span className="mcard__eyebrow mono">
          {t.modul} {m.modul}
        </span>
        <b className="mcard__title">{m.judul}</b>
        <span className="mcard__tagline">{m.tagline}</span>
        <span className="mcard__facts">
          {m.fakta.slice(0, 3).map((f) => (
            <span key={f} className="pill pill--mono">
              {f}
            </span>
          ))}
        </span>
        <span className="mcard__foot">
          {progres ? (
            <span className="mcard__progress">
              <ProgressRing
                value={progres.benar}
                max={progres.total || 1}
                color={progres.benar === progres.total ? "var(--ok)" : `var(--mod-${m.modul})`}
              />
              <span className="hint">{t.blanks(progres.benar, total)}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="mcard__go">
            {t.go} <ArrowRight size={15} aria-hidden="true" />
          </span>
        </span>
      </a>
      {asisten && state && (
        <div className="mcard__admin">
          <Switch on={state !== "locked"} onChange={onToggle} label={t.access(m.modul)} showLabel />
        </div>
      )}
    </div>
  );
}

export default function ModuleCards({ lang, modules }: { lang: Lang; modules: ModulKartu[] }) {
  const me = useMe();
  const signedIn = Boolean(me);
  const now = useSessionNow(30_000, signedIn);
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [asisten, setAsisten] = useState(false);

  useEffect(() => {
    if (me === undefined) return;
    const load = () =>
      void getAksesState(true).then((s) => {
        setTerbuka(s.terbuka);
        setAsisten(s.asisten);
      });
    load();
    window.addEventListener("iris:akses-berubah", load);
    return () => window.removeEventListener("iris:akses-berubah", load);
  }, [me]);

  const progres = useProgres(modules, me?.role === "praktikan" ? terbuka : null);
  const running = now.data?.modul ?? null;

  return (
    <div className="mcards">
      {modules.map((m, i) => {
        const state =
          terbuka === null
            ? null
            : running === m.modul
              ? "run"
              : terbuka.includes(m.modul)
                ? "open"
                : "locked";
        return (
          <Card
            key={m.modul}
            m={m}
            i={i}
            lang={lang}
            state={state}
            progres={progres[m.modul]}
            asisten={asisten}
            onToggle={(open) => void setModulAkses(m.modul, open, lang)}
          />
        );
      })}
    </div>
  );
}
