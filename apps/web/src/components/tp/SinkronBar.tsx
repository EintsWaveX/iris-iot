/**
 * The LMS sync's minute timer (2026-10-14): how long until IRIS reads the
 * LMS again, as seconds and a bar that drains over the minute, with when it
 * last read it in the history template ("00:00:42 lalu"). Shown on LMS ›
 * Ringkasan and Penilaian › TP while a window is open. It counts 60 s from
 * the last run on a timer of its own (user, 2026-10-17), and at zero the
 * page asks for a read, which starts the due run.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { JEDA_SINKRON_MS, sisaSinkron } from "../../lib/tp";
import { TPS } from "./tpStrings";
import "./tp.css";

/** Seconds past the due moment at which the page asks for a read: at once
 *  (that read runs the sync), then again while no newer run has come in. */
const BACA_LAGI = [0, 6, 15, 30];

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
  /** The run is due and no newer one has come in: read again. */
  onLewat?: () => void;
}) {
  const t = TPS[lang];
  const now = useTick(1000);
  const lalu = terakhir ? Date.parse(terakhir) : null;
  const sisa = lalu === null ? 0 : sisaSinkron(lalu, now);
  const total = JEDA_SINKRON_MS / 1000;
  const teks = sisa === 0 ? t.sinkronSegera : t.sinkronDetik(sisa);
  // A fresh read refills the bar quickly; only the draining is linear.
  const sebelum = useRef(sisa);
  const isi = sisa > sebelum.current;
  sebelum.current = sisa;
  // Each step of BACA_LAGI asks once per run, even if a hidden tab skipped
  // a few seconds.
  const diminta = useRef<{ lalu: number | null; n: number }>({ lalu: null, n: 0 });
  useEffect(() => {
    if (lalu === null) return;
    if (diminta.current.lalu !== lalu) diminta.current = { lalu, n: 0 };
    const lewat = now - (lalu + JEDA_SINKRON_MS);
    let minta = false;
    while (diminta.current.n < BACA_LAGI.length && lewat >= BACA_LAGI[diminta.current.n] * 1000) {
      diminta.current.n++;
      minta = true;
    }
    if (minta) onLewat?.();
  }, [lalu, now, onLewat]);
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
          <i
            data-isi={isi ? "yes" : undefined}
            style={{ "--sisa": sisa / total } as CSSProperties}
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
