/**
 * What Beranda showed a visitor, now on Modul (Phase 21, user 2026-10-18):
 * the practicum's thesis beside Langit Lab, and the path of one session.
 * A signed-in Praktikan outside a session gets the thesis and the sky too.
 */
import {
  BookOpenTextIcon,
  ChatCircleTextIcon,
  CheckIcon,
  CircuitryIcon,
} from "@phosphor-icons/react";
import type { Me } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { LabSky, type Lab } from "./HomePage";
import { H } from "./homeStrings";
import "../ui/Display.css";
import "./home.css";

/** The thesis and Langit Lab, side by side from a laptop's width. Modul
 *  passes who is looking (the projector's group too) and the lab it read. */
export function ModulHero({
  lang,
  me,
  lab: labData,
}: {
  lang: Lang;
  me: Me | null;
  lab: Lab | null | undefined;
}) {
  const t = H[lang];
  const praktikan = me?.role === "praktikan";
  return (
    <div className="home10__top modhero21">
      <div className="stack stack--lg">
        <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
        <h1 className="home__display">{t.title}</h1>
        <p className="home__lede">{t.lede}</p>
      </div>
      <LabSky
        lang={lang}
        lab={labData}
        mine={praktikan && me?.kelompok ? [me.kelompok] : []}
        holder={praktikan ? "praktikan" : null}
      />
    </div>
  );
}

/** Before, during and after one session, for a visitor. */
export function SessionPath({ lang }: { lang: Lang }) {
  const t = H[lang];
  const steps = [
    { icon: <BookOpenTextIcon size={24} />, title: t.before, list: t.beforeList },
    { icon: <CircuitryIcon size={24} />, title: t.during, list: t.duringList },
    { icon: <ChatCircleTextIcon size={24} />, title: t.after, list: t.afterList },
  ];
  return (
    <section className="stack">
      <div className="home10__head">
        <span className="eyebrow">{t.flowEyebrow}</span>
        <h2 className="home__h1">{t.flowTitle}</h2>
      </div>
      <ol className="orbitpath">
        {steps.map((s) => (
          <li className="orbitpath__stop" key={s.title}>
            <span className="orbitpath__node" aria-hidden="true">
              {s.icon}
            </span>
            <h3 className="home__h2">{s.title}</h3>
            <ul className="orbitpath__list">
              {s.list.map((x) => (
                <li key={x}>
                  <CheckIcon size={16} weight="bold" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
