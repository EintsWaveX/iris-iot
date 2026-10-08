/**
 * Panduan (2026-10-09): the SeeLabs guide, the first tab of Kirim ke
 * SeeLabs and always there, with or without a session. Nine steps from
 * scoring in IRIS to Simpan Penilaian; each step's button opens the place
 * it talks about. The last step seen is kept on this device.
 */
import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CaretRightIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import { PANDUAN_SEELABS_URL, PD, type LangkahPanduan } from "./panduanStrings";

const KUNCI = "iris-panduan-seelabs";

function bacaLangkah(): number {
  try {
    const n = Number(localStorage.getItem(KUNCI));
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export default function Panduan({
  lang,
  onGo,
  bisaSalin,
}: {
  lang: Lang;
  /** Opens another tab of Kirim ke SeeLabs, or the Score Table. */
  onGo: (ke: NonNullable<LangkahPanduan["aksi"]>["ke"]) => void;
  /** The Copy tab needs a session. */
  bisaSalin: boolean;
}) {
  const t = PD[lang];
  const total = t.langkah.length;
  const [i, setI] = useState(0);
  useEffect(() => setI(Math.min(bacaLangkah(), total - 1)), [total]);
  useEffect(() => {
    try {
      localStorage.setItem(KUNCI, String(i));
    } catch {
      /* storage blocked: the guide still works for this visit */
    }
  }, [i]);
  const l = t.langkah[i];
  const aksi = l.aksi && (l.aksi.ke !== "salin" || bisaSalin) ? l.aksi : null;

  return (
    <section className="panel panduan">
      <div className="panduan__head">
        <h2 className="panel__title">{t.title}</h2>
        <p className="panel__sub">{t.sub}</p>
      </div>
      <ol className="panduan__flow" aria-label={t.title}>
        {t.flow.map((f, k) => (
          <li key={f}>
            <span>{f}</span>
            {k < t.flow.length - 1 && <CaretRightIcon size={14} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="panduan__body">
        <ol className="panduan__list">
          {t.langkah.map((x, k) => (
            <li key={x.judul}>
              <button
                type="button"
                className="panduan__pick"
                aria-current={k === i ? "step" : undefined}
                data-seen={k < i ? "yes" : "no"}
                onClick={() => setI(k)}
              >
                <span className="panduan__num">
                  {k < i ? <CheckIcon size={14} weight="bold" aria-hidden="true" /> : k + 1}
                </span>
                <span>{x.judul}</span>
              </button>
            </li>
          ))}
        </ol>
        <article className="panduan__step" aria-live="polite">
          <span className="eyebrow">{t.step(i + 1, total)}</span>
          <h3 className="panduan__title">{l.judul}</h3>
          <ul className="panduan__isi">
            {l.isi.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {i === 2 && (
            <div className="panduan__legend">
              <b>{t.legendTitle}</b>
              <dl>
                {t.legend.map(([k, v]) => (
                  <div key={k}>
                    <dt className="mono">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {aksi &&
            (aksi.ke === "seelabs" ? (
              <a
                className="btn panduan__aksi"
                href={PANDUAN_SEELABS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOutIcon size={18} aria-hidden="true" />
                {aksi.label}
              </a>
            ) : (
              <button type="button" className="btn panduan__aksi" onClick={() => onGo(aksi.ke)}>
                {aksi.label}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            ))}
          {i === total - 1 && <p className="hint">{t.finished}</p>}
          <div className="panel__actions panduan__nav">
            <button
              type="button"
              className="btn"
              disabled={i === 0}
              onClick={() => setI((x) => Math.max(0, x - 1))}
            >
              <ArrowLeftIcon size={18} aria-hidden="true" />
              {t.prev}
            </button>
            {i < total - 1 ? (
              <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)}>
                {t.next}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => setI(0)}>
                {t.restart}
              </button>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
