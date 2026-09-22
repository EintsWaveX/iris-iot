/**
 * /groups/[n]: that group's own readings and ladder, in its hue -- the plan's
 * own words for this page. The group is fixed by the URL (Ladder's picker
 * hides itself once given a single-element groups array); what a visitor
 * picks here is the MODULE instead, since a group works through all four
 * across the practicum, one at a time. Simulated, same as everywhere else
 * on this stage -- there is no live per-session data source yet.
 */
import { useState } from "react";
import Ladder from "./Ladder";
import "./GroupLive.css";

interface Props {
  group: number;
}

const MODULES = [1, 2, 3, 4];
const MODULE_NAMES: Record<number, string> = {
  1: "Bluetooth Low Energy",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

export default function GroupLive({ group }: Props) {
  const [modul, setModul] = useState(1);

  return (
    <div className="group-live">
      <div className="group-live__picker" role="tablist" aria-label="Pilih modul">
        {MODULES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={m === modul}
            className="group-live__picker-btn"
            onClick={() => setModul(m)}
          >
            Modul {m}
            <span className="group-live__picker-name">{MODULE_NAMES[m]}</span>
          </button>
        ))}
      </div>

      <Ladder modul={modul} groups={[group]} showReadings />
    </div>
  );
}
