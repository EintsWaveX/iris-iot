/**
 * Stage 11's "coba sendiri" tab: one button fires one synthetic message and
 * animates it hop by hop, on demand, with no auto-advancing timer -- unlike
 * Ladder/LayerXray's continuous stream, this is a single-shot teaching
 * moment (and doubles as a harness for eyeballing the simulator itself). No
 * hardware, no session, no network.
 */
import { useRef, useState } from "react";
import { RAILS, nextReading, describeLayers, type Reading } from "../lib/telemetry-sim";
import GroupPicker from "./ui/GroupPicker";
import "./LayerXray.css";
import "./LiveSandbox.css";

interface LayerCaption {
  nama: string;
  nilai: string;
}

interface Props {
  modul: number;
  groups: number[];
  layers: LayerCaption[];
  lang?: "id" | "en";
}

const T = {
  id: {
    fire: "Kirim pesan uji",
    lost: (n: number) => `#${n} hilang di tengah jalan`,
    ok: (r: Reading) => `#${r.seq} · kirim ${r.tx} · terima ${r.rx} · delta ${r.delayMs} ms`,
  },
  en: {
    fire: "Send a test message",
    lost: (n: number) => `#${n} was lost on the way`,
    ok: (r: Reading) => `#${r.seq} · sent ${r.tx} · received ${r.rx} · delta ${r.delayMs} ms`,
  },
};

export default function LiveSandbox({ modul, groups, layers, lang = "id" }: Props) {
  const t = T[lang];
  const [group, setGroup] = useState(groups[0]);
  const [reading, setReading] = useState<Reading | null>(null);
  const [round, setRound] = useState(0);
  const layersHostRef = useRef<HTMLOListElement | null>(null);
  const rails = RAILS[modul] ?? RAILS[1];

  function kirim() {
    setReading(nextReading(modul, group));
    setRound((r) => r + 1);
    // Reveal the five layers one after another rather than all at once --
    // the whole point of "hop by hop" is that a viewer sees the message
    // land at Application, then watches it explain itself one layer down
    // at a time. Motion.enter() already no-ops under reduced motion.
    requestAnimationFrame(() => {
      window.Motion?.enter(".live-sandbox__layer", { stagger: 0.18, distance: 12 });
    });
  }

  const values = reading ? describeLayers(reading, lang) : null;

  return (
    <div className="live-sandbox">
      {groups.length > 1 && <GroupPicker value={group} onValueChange={setGroup} groups={groups} />}

      <button type="button" className="btn btn--primary btn--lg live-sandbox__fire" onClick={kirim}>
        {t.fire}
      </button>

      {reading && (
        <div key={round} className="live-sandbox__result">
          <div
            className="live-sandbox__rails"
            style={{ "--tile-hue": `var(--group-${group})` } as React.CSSProperties}
          >
            {rails.map((label, i) => (
              <div
                key={label}
                className="live-sandbox__rail"
                style={
                  { "--rail-index": i, "--rail-count": rails.length - 1 } as React.CSSProperties
                }
              >
                <span className="live-sandbox__rail-label">{label}</span>
              </div>
            ))}
            <span
              className="live-sandbox__arrow"
              data-hilang={reading.rx === null ? "yes" : "no"}
            />
          </div>
          <p className="live-sandbox__readout mono">
            {reading.rx === null ? t.lost(reading.seq) : t.ok(reading)}
          </p>

          <ol className="live-sandbox__layers" ref={layersHostRef}>
            {layers.map((layer, i) => (
              <li key={layer.nama} className="live-sandbox__layer layer-xray__layer">
                <div className="layer-xray__layer-head">
                  <span className="layer-xray__layer-index">{layers.length - i}</span>
                  <span className="layer-xray__layer-name">{layer.nama}</span>
                </div>
                <p className="layer-xray__layer-value mono">{values![i]}</p>
                <p className="layer-xray__layer-caption">{layer.nilai}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
