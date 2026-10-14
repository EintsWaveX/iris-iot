/**
 * The LMS sync's minute timer (2026-10-14): how long until IRIS reads the
 * LMS again, as seconds and a bar that drains over the minute, with when it
 * last read it in the history template ("00:00:42 lalu"). Shown on LMS ›
 * Ringkasan and Penilaian › TP while a window is open; the relay's timer
 * wakes the sync every minute, so at zero it is "any moment".
 */
import type { CSSProperties } from "react";
import { sejak, useDetik } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { JEDA_SINKRON_MS } from "../../lib/tp";
import { TPS } from "./tpStrings";
import "./tp.css";

export default function SinkronBar({
  terakhir,
  lang,
  ringkas,
}: {
  terakhir: string | null;
  lang: Lang;
  /** Just the bar and seconds (LMS › Ringkasan's mini list). */
  ringkas?: boolean;
}) {
  const t = TPS[lang];
  const now = useDetik();
  const lalu = terakhir ? Date.parse(terakhir) : null;
  const sisa = lalu === null ? 0 : Math.max(0, Math.ceil((lalu + JEDA_SINKRON_MS - now) / 1000));
  const total = JEDA_SINKRON_MS / 1000;
  const teks = sisa === 0 ? t.sinkronSegera : t.sinkronDetik(sisa);
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
          aria-valuenow={sisa}
          aria-valuetext={teks}
        >
          <i style={{ "--sisa": sisa / total } as CSSProperties} />
        </span>
        <b className="mono sinkbar__n">{teks}</b>
      </span>
      {!ringkas && terakhir && (
        <span className="hint">{t.sinkronTerakhir(sejak(terakhir, lang, now))}</span>
      )}
    </div>
  );
}
