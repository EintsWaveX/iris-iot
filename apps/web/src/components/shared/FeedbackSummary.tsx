/**
 * An anonymous feedback summary (Phase 8): the average as a big number with
 * stars, the 5-to-1 distribution as bars, the most picked chips, and the
 * newest comments. Used for "Umpan balik saya" (only the assessed
 * assistant's own) and for the Lab summary every assistant sees. It never
 * receives a NIM: the API strips it.
 */
import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import { LABEL_CHIP, type Ringkasan } from "../../lib/umpan-balik";
import { sejak } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./FeedbackSummary.css";

export default function FeedbackSummary({
  data,
  lang,
  empty,
  countLabel,
  maxComments = 3,
}: {
  data: Ringkasan | null;
  lang: Lang;
  empty: string;
  countLabel: (n: number) => string;
  maxComments?: number;
}) {
  if (!data) return <span className="skeleton" style={{ height: 120 }} />;
  if (data.jumlah === 0) return <p className="hint">{empty}</p>;
  const max = Math.max(...data.sebaran, 1);
  const avg = data.rataRata ?? 0;
  return (
    <div className="fbsum">
      <div className="fbsum__head">
        <span className="fbsum__avg num">{avg.toFixed(1)}</span>
        <span className="stack" style={{ gap: 2 }}>
          <span className="fbsum__stars" aria-label={`${avg.toFixed(1)} / 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={18}
                aria-hidden="true"
                className={i <= Math.round(avg) ? "fbsum__star--on" : "fbsum__star"}
              />
            ))}
          </span>
          <span className="hint">{countLabel(data.jumlah)}</span>
        </span>
      </div>
      <ol className="fbsum__bars" aria-hidden="true">
        {[5, 4, 3, 2, 1].map((v) => (
          <li key={v}>
            <span className="num faint">{v}</span>
            <span className="fbsum__bar">
              <span style={{ "--w": `${(data.sebaran[v - 1] / max) * 100}%` } as CSSProperties} />
            </span>
            <span className="num hint">{data.sebaran[v - 1]}</span>
          </li>
        ))}
      </ol>
      {data.chips.length > 0 && (
        <div className="row">
          {data.chips.slice(0, 5).map((c) => (
            <span key={c.chip} className="pill">
              {LABEL_CHIP[c.chip]?.[lang] ?? c.chip} · <span className="num">{c.n}</span>
            </span>
          ))}
        </div>
      )}
      {data.komentar.length > 0 && (
        <ul className="fbsum__quotes">
          {data.komentar.slice(0, maxComments).map((k, i) => (
            <li key={i}>
              <span className="grow">{k.teks}</span>
              <span className="hint faint">{sejak(k.pada, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
