/**
 * The voice recording of one CaAs's Wawancara, for Penilaian to hear (the evidence behind the levels). The
 * parts play one after another in a single player; any part can be picked to jump to it. Fetched when the
 * Rincian opens; the audio itself streams from the gated iv-audio address, with seeking.
 */
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../../../../lib/kelas";
import { isFail } from "../../../../lib/recruitment/client";
import {
  fetchIvAudio,
  lamaAudio,
  urlIvAudio,
  type IvAudioPart,
} from "../../../../lib/recruitment/iv-audio";
import { RK } from "./rekamStrings";

export default function AudioEvidence({ id, lang }: { id: number; lang: Lang }) {
  const w = RK[lang];
  const [parts, setParts] = useState<IvAudioPart[] | null>(null);
  const [fail, setFail] = useState(false);
  const [at, setAt] = useState(0);
  const auto = useRef(false);
  const el = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let live = true;
    setParts(null);
    setFail(false);
    void fetchIvAudio(id).then((r) => {
      if (!live) return;
      if (isFail(r)) setFail(true);
      else setParts(r.parts);
    });
    return () => {
      live = false;
    };
  }, [id]);

  // The next part starts by itself when the one before it ends.
  useEffect(() => {
    if (auto.current) void el.current?.play().catch(() => undefined);
  }, [at]);

  if (fail) return <span className="hint">{w.loadFail}</span>;
  if (!parts) return null;
  const now = parts[at] ?? parts[0];
  return (
    <section className="r4audio" aria-label={w.title}>
      <div className="row row--between" style={{ gap: 8, flexWrap: "wrap" }}>
        <b>{w.title}</b>
        {parts.length > 0 && (
          <span className="hint num">
            {w.total(parts.length, lamaAudio(parts.reduce((a, p) => a + p.ms, 0)))}
          </span>
        )}
      </div>
      {parts.length === 0 ? (
        <span className="hint">{w.none}</span>
      ) : (
        <>
          <audio
            ref={el}
            key={now.id}
            controls
            preload="metadata"
            src={urlIvAudio(id, now.id)}
            onPlay={() => (auto.current = true)}
            onEnded={() => {
              if (at < parts.length - 1) setAt(at + 1);
            }}
            style={{ width: "100%" }}
          />
          {parts.length > 1 && (
            <div className="r4audio__parts" role="group" aria-label={w.title}>
              {parts.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="r4lane__size num"
                  data-diff={i === at ? "yes" : undefined}
                  aria-pressed={i === at}
                  title={`${w.part(i + 1)} · ${lamaAudio(p.ms)} · ${w.by(p.by)}`}
                  onClick={() => setAt(i)}
                >
                  {i + 1}
                  <b>·{lamaAudio(p.ms)}</b>
                </button>
              ))}
            </div>
          )}
          <span className="hint">
            {w.part(at + 1)} · {w.by(now.by)}
          </span>
        </>
      )}
    </section>
  );
}
