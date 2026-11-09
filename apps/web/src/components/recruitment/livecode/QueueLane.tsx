/**
 * Where a waiting Run Samples or Submit stands in the judge's queue: a row of person-in-a-square icons,
 * the front on the left, the seat's own marker sliding left as the jobs ahead finish. The page re-reads
 * its state every 1.5 s while a job waits, so the marker moves by itself (see LccPage).
 */
import type { CSSProperties } from "react";
import { UserSquareIcon } from "@phosphor-icons/react";
import { laneOf } from "../../../lib/recruitment/queue-lane";

export function QueueLane({
  position,
  total,
  label,
}: {
  position: number | null;
  total: number | null;
  /** What a screen reader says, e.g. "In the queue, number 3 of 7" */
  label: string;
}) {
  const lane = laneOf(position, total);
  if (!lane) return null;
  return (
    <div
      className="lcc-lane"
      role="img"
      aria-label={label}
      style={{ "--lane-me": lane.me - 1 } as CSSProperties}
    >
      {lane.hidden > 0 && <span className="lcc-lane__more">+{lane.hidden}</span>}
      <div className="lcc-lane__track">
        {Array.from({ length: lane.slots }, (_, i) => (
          <span key={i} className="lcc-lane__slot" data-front={i === 0 ? "yes" : undefined}>
            <UserSquareIcon size={26} aria-hidden="true" />
          </span>
        ))}
        <span className="lcc-lane__me" aria-hidden="true">
          <UserSquareIcon size={26} weight="fill" />
        </span>
      </div>
    </div>
  );
}
