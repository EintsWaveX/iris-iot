/**
 * The LMS sync's minute timer (2026-10-14): how long until IRIS reads the
 * LMS again, as seconds and a bar that drains over the minute, with when it
 * last read it in the history template ("00:00:42 lalu"). Shown on LMS ›
 * Ringkasan and Penilaian › TP while a window is open. The relay's timer
 * fires on each whole minute, so the seconds match a countdown to a whole
 * minute (2026-10-16); at zero it is "any moment".
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { sejak, useDetik } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { JEDA_SINKRON_MS, sinkronBerikut } from "../../lib/tp";
import { TPS } from "./tpStrings";
import "./tp.css";

/** Seconds past the due minute at which the page asks for the new read. */
const BACA_LAGI = [6, 15, 30];

export default function SinkronBar({
  terakhir,
  lang,
  ringkas,
  onLewat,
}: {
  terakhir: string | null;
  lang: Lang;
  /** Just the bar and seconds (LMS › Ringkasan's mini list). */
  ringkas?: boolean;
  /** The due minute passed and no newer run has come in: read again. */
  onLewat?: () => void;
}) {
  const t = TPS[lang];
  const now = useDetik();
  const lalu = terakhir ? Date.parse(terakhir) : null;
  const target = lalu === null ? now : sinkronBerikut(lalu);
  const sisa = Math.max(0, Math.ceil((target - now) / 1000));
  const total = JEDA_SINKRON_MS / 1000;
  const teks = sisa === 0 ? t.sinkronSegera : t.sinkronDetik(sisa);
  // A fresh read refills the bar quickly; only the draining is linear.
  const sebelum = useRef(sisa);
  const isi = sisa > sebelum.current;
  sebelum.current = sisa;
  // The run's own news only goes out when files changed, so a page past
  // the due minute asks for the new time itself, a few times.
  const lewat = lalu === null ? -1 : (now - target) / 1000;
  const dibaca = useRef(-1);
  useEffect(() => {
    if (!BACA_LAGI.includes(lewat) || dibaca.current === now) return;
    dibaca.current = now;
    onLewat?.();
  }, [lewat, now, onLewat]);
  return (
    <div className="sinkbar" data-ringkas={ringkas ? "yes" : undefined}>
      {!ringkas && <span className="label-caps">{t.sinkronBerikut}</span>}
      <span className="sinkbar__row">
        <span
          className="sinkbar__track"
          role="progressbar"
          aria-label={t.sinkronBerikut}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(sisa, total)}
          aria-valuetext={teks}
        >
          <i
            data-isi={isi ? "yes" : undefined}
            style={{ "--sisa": Math.min(1, sisa / total) } as CSSProperties}
          />
        </span>
        <b className="mono sinkbar__n">{teks}</b>
      </span>
      {!ringkas && terakhir && (
        <span className="hint">{t.sinkronTerakhir(sejak(terakhir, lang, now))}</span>
      )}
    </div>
  );
}
