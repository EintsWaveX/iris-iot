/** The robot's short guide (Phase 14, mockup s14-panduan): connect once,
 *  Kirim Nilai, watch the strip. */
import { href } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { RB } from "./robotStrings";
import "./robot.css";

export default function RobotGuide({ lang }: { lang: Lang }) {
  const t = RB[lang];
  return (
    <section className="panel slr-card" aria-label={t.guideTitle}>
      <div className="slr-head" data-tone="accent">
        <div className="slr-head__t">
          <h2 className="panel__title">{t.guideTitle}</h2>
          <span className="hint">{t.guideSub}</span>
        </div>
      </div>
      <ol className="slr-rights">
        {t.guideSteps.map(([judul, isi], i) => (
          <li key={judul} data-on="yes">
            <span className="pill pill--mono">{i + 1}</span>
            <span className="stack stack--sm">
              <b>{judul}</b>
              <span className="hint">{isi}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="slr-acts">
        <a className="btn btn--secondary" href={href(lang, "/account")}>
          {t.guideOpen}
        </a>
      </div>
    </section>
  );
}
