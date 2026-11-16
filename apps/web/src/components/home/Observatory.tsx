/**
 * Home's first screen for who is signed in (Nov 2026 redesign): Langit Lab as one wide glass pane laid over
 * the painted cosmos. Each group is a sparkle star (brighter with more blanks filled) spread across the
 * pane's width; the person's own card sits compact and centered at the bottom as the main focus, and the
 * live counts are a slim glass strip, so the sky behind stays visible. Data is the same /api/session/lab
 * answer the old LabSky used; the old LabSky stays for the Modules hero.
 */
import type { CSSProperties, ReactNode } from "react";
import { KELOMPOK_NAMA, MODUL_NAMA } from "../../lib/app";
import { placeStars } from "../../lib/home-sky";
import { modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import Pill from "../ui/Pill";
import { ModConstellation } from "../shared/Instruments";
import { H } from "./homeStrings";
import type { Lab } from "./HomePage";
import "./observatory.css";

export function LabPane({
  lang,
  lab,
  mine,
  holder,
  center,
}: {
  lang: Lang;
  lab: Lab | null | undefined;
  mine: number[];
  holder: "praktikan" | "asisten" | null;
  center?: ReactNode;
}) {
  const t = H[lang];
  if (lab === undefined) {
    return (
      <section className="obs__pane" aria-busy="true">
        <span className="skeleton obs__wait" />
      </section>
    );
  }
  const bintang = lab?.bintang ?? [];
  const pts = placeStars(bintang.length);
  const celah = lab?.celah ?? 0;
  const stats: [string, string][] | null = lab
    ? [
        [String(lab.kelompok), t.groups],
        [lab.anggota ? `${lab.hadir}/${lab.anggota}` : String(lab.hadir), t.here],
        [celah ? t.blankOf(lab.benar ?? lab.blank, celah * lab.kelompok) : String(lab.benar ?? lab.blank), t.blanks],
        [String(lab.pesan), t.pesan(lab.modul)],
      ]
    : null;
  return (
    <section
      className="obs__pane"
      data-quiet={lab ? "no" : "yes"}
      style={lab ? ({ "--m": `var(--mod-${lab.modul})` } as CSSProperties) : undefined}
      aria-label={t.sky}
    >
      <header className="obs__head">
        <div className="obs__headrow">
          <h2 className="obs__title">{t.sky}</h2>
          {lab ? (
            <>
              <Pill modul={lab.modul}>
                {modulLabel(lab.modul, lang)} · {MODUL_NAMA[lab.modul]}
              </Pill>
              <Pill tone="ok">
                <span className="dot dot--ok dot--pulse" aria-hidden="true" />
                {t.live}
              </Pill>
            </>
          ) : (
            <Pill>{t.quiet}</Pill>
          )}
        </div>
        {!lab && <p className="obs__hint">{t.skyQuiet}</p>}
        {lab && mine.length > 0 && holder && (
          <p className="obs__hint obs__hint--key">{holder === "praktikan" ? t.keyMine : t.keyHold}</p>
        )}
      </header>

      {stats && (
        <div className="obs__stats">
          {stats.map(([v, l]) => (
            <div key={l}>
              <b className="mono">{v}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}

      <div className="obs__field" data-multi={mine.length > 1 ? "yes" : "no"} role="img" aria-label={t.skyAria}>
        {lab ? (
          <>
            <svg className="obs__links" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
              {pts.slice(0, -1).map((p, i) => (
                <line key={i} x1={p.x} y1={p.y} x2={pts[i + 1].x} y2={pts[i + 1].y} />
              ))}
            </svg>
            {bintang.map((g, i) => {
              const right = g.benar ?? g.terisi;
              const p = celah ? Math.min(1, right / celah) : 0;
              const me = mine.includes(g.nomor);
              const pt = pts[i];
              return (
                <div
                  className="obs__star"
                  key={g.nomor}
                  data-me={me ? "yes" : "no"}
                  data-flip={pt.x > 78 ? "far" : pt.x > 58 ? "mid" : "no"}
                  style={
                    {
                      left: `${pt.x}%`,
                      top: `${(pt.y / 60) * 94}%`,
                      "--c": `var(--group-${((g.nomor - 1) % 10) + 1})`,
                      "--p": p,
                      "--i": i,
                    } as CSSProperties
                  }
                >
                  <span className="obs__halo" />
                  {me && <span className="obs__ring" />}
                  <span className="obs__core" />
                  <span className="obs__lead" />
                  <span className="obs__plaque">
                    <b>
                      <span className="obs__n">{g.nomor}</span>
                      {KELOMPOK_NAMA[g.nomor] ? <span className="obs__nm"> · {KELOMPOK_NAMA[g.nomor]}</span> : null}
                    </b>
                    <span className="mono">{p === 1 ? t.starDone : t.starP(right, celah)}</span>
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <div className="obs__quiet">
            {[1, 2, 3, 4].map((m) => (
              <div className="obs__mini" key={m} style={{ "--m": `var(--mod-${m})` } as CSSProperties}>
                <ModConstellation m={m} h={96} lang={lang} />
                <span>{modulLabel(m, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {center && <div className="obs__center">{center}</div>}
    </section>
  );
}
