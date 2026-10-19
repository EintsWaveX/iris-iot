/**
 * Home for a visitor (Phase 21, user 2026-10-18): only a frame for now, the
 * lab's name with Praktikum in the centre beside Lihat Modul. The lab
 * profile (divisions, history, photos) comes in its own design pass; what
 * Beranda used to show a visitor now lives on Modul (ModuleCards.tsx).
 */
import { DoorOpenIcon } from "@phosphor-icons/react";
import { href } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { openSignIn } from "../../lib/signin";
import { H } from "./homeStrings";

export default function HomeFrame({ lang }: { lang: Lang }) {
  const t = H[lang];
  return (
    <section className="homeframe">
      <p className="eyebrow eyebrow--accent">{t.frameEyebrow}</p>
      <h1 className="home__display homeframe__title">{t.frameTitle}</h1>
      <div className="homeframe__cta">
        <a className="btn btn--lg" href={href(lang, "/modules")}>
          {t.browse}
        </a>
        <button type="button" className="btn btn--primary btn--lg" onClick={() => openSignIn()}>
          <span className="btn__label">{t.framePraktikum}</span>
          <DoorOpenIcon size={20} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
