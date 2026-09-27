/**
 * /groups/[n]: that group's own readings and flow diagram, in its hue --
 * the plan's own words for this page. The group is fixed by the URL
 * (FlowDiagram's own GroupPicker hides itself once given a single-element
 * groups array); what a visitor picks here is the MODULE instead, since a
 * group works through all four across the practicum, one at a time.
 * Simulated, same as everywhere else on this stage -- there is no live
 * per-session data source yet.
 */
import { useState } from "react";
import FlowDiagram from "./live/FlowDiagram";
import SegmentedControl from "./ui/SegmentedControl";
import "./GroupLive.css";

interface Props {
  group: number;
}

const MODULES = [1, 2, 3, 4];

export default function GroupLive({ group }: Props) {
  const [modul, setModul] = useState(1);

  return (
    <div className="group-live">
      <SegmentedControl
        value={String(modul)}
        onValueChange={(v) => setModul(Number(v))}
        aria-label="Pilih modul"
        options={MODULES.map((m) => ({ value: String(m), label: `Modul ${m}` }))}
      />

      <div className="group-live__flow">
        <FlowDiagram modul={modul} groups={[group]} showReadings />
      </div>
    </div>
  );
}
