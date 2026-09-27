/**
 * Stage 11's layer X-ray: one reading crossing five layers, the live value
 * shown at each -- generalizes apps/modul4/src/ui-layers.js (which calls
 * this "the teaching centrepiece") from LoRa alone to all four modules, per
 * the plan's own table of what each layer means for each protocol. `layers`
 * supplies the per-module name and structural caption already authored in
 * content (src/content/modules/*), unchanged since Stage 7's static
 * carousel preview; this component adds the live value on top of that.
 *
 * Stage 20: Modules 2-4 poll for a real reading first (telemetry-live.ts)
 * and fall back to the simulator (telemetry-sim.ts) only until the first
 * real one arrives -- see live/FlowDiagram.tsx's own header comment for why this
 * never falls back once real data starts flowing. Module 1 always
 * simulates; no real BLE relay exists.
 */
import { useEffect, useState } from "react";
import { startPolling } from "../scripts/polling";
import { nextReading, describeLayers, type Reading } from "../lib/telemetry-sim";
import { fetchLiveReading, resetLiveReadingMemory } from "../lib/telemetry-live";
import GroupPicker from "./ui/GroupPicker";
import "./LayerXray.css";

interface LayerCaption {
  nama: string;
  nilai: string;
}

interface Props {
  modul: number;
  groups: number[];
  layers: LayerCaption[];
}

const FLUSH_MS = 1200;

export default function LayerXray({ modul, groups, layers }: Props) {
  const [group, setGroup] = useState(groups[0]);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    setReading(null);
    resetLiveReadingMemory(modul, group);
    let live = false;

    const stop = startPolling(async () => {
      if (modul !== 1) {
        const real = await fetchLiveReading(modul, group);
        if (real) {
          live = true;
          setReading(real);
          return;
        }
        if (live) return;
      }
      setReading(nextReading(modul, group));
    }, FLUSH_MS);
    return stop;
  }, [modul, group]);

  const values = reading ? describeLayers(reading) : layers.map(() => "menunggu…");

  return (
    <div className="layer-xray">
      {groups.length > 1 && <GroupPicker value={group} onValueChange={setGroup} groups={groups} />}

      <ol
        className="layer-xray__layers"
        style={{ "--tile-hue": `var(--group-${group})` } as React.CSSProperties}
      >
        {layers.map((layer, i) => (
          <li key={layer.nama} className="layer-xray__layer">
            <div className="layer-xray__layer-head">
              <span className="layer-xray__layer-index">{layers.length - i}</span>
              <span className="layer-xray__layer-name">{layer.nama}</span>
            </div>
            <p className="layer-xray__layer-value mono">{values[i]}</p>
            <p className="layer-xray__layer-caption">{layer.nilai}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
