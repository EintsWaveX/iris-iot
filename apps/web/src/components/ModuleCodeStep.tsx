/**
 * The Kode step's file switcher (P7.4). Every module ships exactly two
 * sketches (Central/Peripheral, Server/Client, Publisher/Subscriber,
 * Hunter/Beacon -- see src/content/modules/*.json's own `berkas` arrays),
 * which used to render as two separate stacked Card+BlankEditor pairs.
 * The signed-off mockup shows one at a time behind a SegmentedControl
 * instead, so a student's screen holds one board's code at full width
 * rather than two half-height columns -- BlankEditor.tsx itself is
 * untouched, this only controls which instance is visible.
 *
 * Falls back to rendering the single BlankEditor directly, with no
 * SegmentedControl, on the (currently theoretical) case of a module with
 * just one file -- a control with one option is not a real choice.
 */
import { useState } from "react";
import type { Segment } from "../lib/blanks";
import BlankEditor from "./BlankEditor";
import SegmentedControl from "./ui/SegmentedControl";
import "./ModuleCodeStep.css";

interface BerkasEntry {
  slug: string;
  judul: string;
  segments: Segment[];
}

interface Props {
  modul: number;
  bahasa: "id" | "en";
  berkas: BerkasEntry[];
  boardLabel: string;
  downloadLabel: string;
  downloadHint: string;
  masukHint: string;
  sesiBerubahHint: string;
  terkunciHint: string;
}

/** "Central/Client: Bluetooth Low Energy (ESP32)" -> "Central/Client". */
function shortLabel(judul: string): string {
  return judul.split(":")[0].trim();
}

export default function ModuleCodeStep({ modul, bahasa, berkas, boardLabel, ...hints }: Props) {
  const [active, setActive] = useState(berkas[0]?.slug ?? "");

  if (berkas.length <= 1) {
    const b = berkas[0];
    if (!b) return null;
    return (
      <BlankEditor modul={modul} berkas={b.slug} bahasa={bahasa} segments={b.segments} {...hints} />
    );
  }

  return (
    <div className="module-code-step">
      <SegmentedControl
        value={active}
        onValueChange={setActive}
        aria-label={boardLabel}
        options={berkas.map((b) => ({ value: b.slug, label: shortLabel(b.judul) }))}
      />
      {berkas.map((b) => (
        <div key={b.slug} hidden={b.slug !== active} className="module-code-step__panel">
          <BlankEditor
            modul={modul}
            berkas={b.slug}
            bahasa={bahasa}
            segments={b.segments}
            {...hints}
          />
        </div>
      ))}
    </div>
  );
}
