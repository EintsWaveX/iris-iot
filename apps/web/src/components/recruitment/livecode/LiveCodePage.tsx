/**
 * Live Coding on /recruitment/test (prompt 12), in place of the stand-in the
 * runner shipped with: the draw while the room is in the spins, the editor
 * once the Live Coding timer runs. Time is the page's own `phase` (the room's
 * state and the server's clock); everything else is `GET lc`, asked again when
 * the relay says a compile finished, the Master re-rolled or moved a board,
 * and when the phase changes (the automatic deal at Start happens then).
 */
import { useEffect, useRef } from "react";
import type { Lang } from "../../../lib/kelas";
import type { LiveCodeSelf } from "../../../lib/recruitment/lc-api";
import type { QueueChip } from "../../../lib/recruitment/lc-types";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { Gate, type Motion } from "../exam/parts";
import { Notice } from "../exam/Screens";
import { TS } from "../exam/testStrings";
import Draw from "./Draw";
import Workbench from "./Workbench";
import { useLc } from "./useLc";

import "../recruitment-s3-lc.css";

export type Antrean = { chips: QueueChip[]; typical: LiveCodeSelf["typicalMs"] } | null;

export default function LiveCodePage({
  lang,
  tv,
  phase,
  motion,
  signal,
  antrean,
  linkDown,
  onChanged,
}: {
  lang: Lang;
  tv: TestView;
  phase: SeatPhase;
  motion: Motion;
  /** Counts up when the relay says Live Coding changed for this seat */
  signal: number;
  antrean: Antrean;
  linkDown: boolean;
  onChanged: () => void;
}) {
  const t = TS[lang];
  const api = useLc(true, signal);
  const { lc, err, loading, errors, refresh } = api;

  // The phase moved (spins to work): ask again now and once more shortly, for the automatic deal
  const kind = phase.k;
  const lastKind = useRef(kind);
  useEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    refresh();
    const id = setTimeout(refresh, 1500);
    return () => clearTimeout(id);
  }, [kind, refresh]);

  // Without the live link nothing tells the page a compile finished: ask again on a timer, faster while a job is in flight
  const inflight = !!lc?.jobs.some((j) => j.status === "antre" || j.status === "diambil");
  useEffect(() => {
    if (!linkDown) return;
    const id = setInterval(refresh, inflight ? 4000 : 15_000);
    return () => clearInterval(id);
  }, [linkDown, inflight, refresh]);

  // Work began but the deal is not in yet: ask again until it is
  const incomplete = !!lc && phase.k === "work" && (!lc.topic || !lc.protocol);
  useEffect(() => {
    if (!incomplete) return;
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [incomplete, refresh]);

  if (loading && !lc)
    return errors >= 2 ? (
      <Notice
        lang={lang}
        motion={motion}
        title={t.errTitle}
        body={t.errBody}
        action={
          <button type="button" className="btn btn--primary" onClick={refresh}>
            {t.retry}
          </button>
        }
      />
    ) : (
      <Gate motion={motion} title={t.loading}>
        <span className="skeleton" style={{ height: 120 }} />
      </Gate>
    );
  if (err || !lc) return <Notice lang={lang} motion={motion} title={t.errTitle} body={t.errBody} />;

  const drawing = phase.k === "spin" || !lc.topic || !lc.protocol;
  return (
    <div className="r3lcwrap" data-m={motion}>
      {drawing ? (
        <Draw
          lang={lang}
          lc={lc}
          tier={motion}
          api={api}
          hotspot={tv.hotspot}
          onHotspot={() => {
            onChanged();
            refresh();
          }}
        />
      ) : phase.k === "work" ? (
        <Workbench
          lang={lang}
          lc={lc}
          api={api}
          tier={motion}
          phase={phase}
          hotspot={tv.hotspot}
          onHotspot={() => {
            onChanged();
            refresh();
          }}
          antrean={antrean}
          linkDown={linkDown}
        />
      ) : null}
    </div>
  );
}
