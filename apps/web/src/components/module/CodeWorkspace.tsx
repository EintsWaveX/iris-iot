/**
 * The Kode step's workspace (P8.3): the code, with the pins and schematic
 * docked beside it so nobody flips back to Persiapan to check a wire.
 *
 *   >= 1280  two resizable panes, the pin panel collapsible (`[` / `]` on the
 *            handle, or its own close button), open by default at 1680+
 *   <  1280  the code full width, "Pin & skema" opens the same panel as a
 *            bottom sheet
 *
 * Mounted client:only, so the first render already knows the width and the
 * saved dock state. Deciding either after hydration swapped the layout and
 * remounted the editor, dropping the blank a student had just tapped.
 */
import { useState, type ComponentProps } from "react";
import { CircuitryIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import ResizablePanes from "../ui/ResizablePanes";
import Dialog from "../ui/Dialog";
import ModuleCodeStep from "../ModuleCodeStep";
import PinSchematic, { type PinData } from "./PinSchematic";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import "./CodeWorkspace.css";
import { dict } from "../../lib/app";

const T = dict({
  id: {
    pins: "Pin & skema",
    hide: "Sembunyikan panel pin",
    show: "Tampilkan panel pin",
    handle: "Ubah lebar panel",
  },
  en: {
    pins: "Pins & schematic",
    hide: "Hide the pin panel",
    show: "Show the pin panel",
    handle: "Resize the panels",
  },
});

const OPEN_KEY = "iris-code-dock";

export default function CodeWorkspace({
  lang,
  pin,
  mcu,
  skema,
  code,
}: {
  lang: Lang;
  pin: PinData;
  mcu: string;
  skema: string;
  code: ComponentProps<typeof ModuleCodeStep>;
}) {
  const t = T[lang];
  const wide = useMinWidth(1280, true);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [sheet, setSheet] = useState(false);

  function toggle(v: boolean) {
    setOpen(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const panel = (
    <PinSchematic lang={lang} modul={code.modul} pin={pin} mcu={mcu} skema={skema} variant="dock" />
  );
  const editor = <ModuleCodeStep {...code} />;

  if (!wide) {
    return (
      <div className="codews">
        <button
          type="button"
          className="btn btn--secondary codews__sheetbtn"
          onClick={() => setSheet(true)}
        >
          {t.pins}
        </button>
        {editor}
        <Dialog open={sheet} onOpenChange={setSheet} title={t.pins} sheet size="xl" lang={lang}>
          {panel}
        </Dialog>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="codews">
        <div className="row row--end">
          <button type="button" className="btn btn--secondary" onClick={() => toggle(true)}>
            {t.show}
          </button>
        </div>
        {editor}
      </div>
    );
  }

  return (
    <ResizablePanes
      id="code-dock"
      className="codews codews--split"
      stackBelow={1280}
      handleLabel={t.handle}
      panes={[
        { id: "code", label: code.boardLabel, defaultSize: 66, minSize: 45, content: editor },
        {
          id: "pins",
          label: t.pins,
          defaultSize: 34,
          minSize: 24,
          maxSize: 50,
          collapsible: true,
          content: (
            <aside className="codews__dock">
              <div className="codews__dock-head">
                <b>
                  <CircuitryIcon size={17} aria-hidden="true" /> {t.pins}
                </b>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  aria-label={t.hide}
                  onClick={() => toggle(false)}
                >
                  <SidebarSimpleIcon size={18} aria-hidden="true" />
                </button>
              </div>
              {panel}
            </aside>
          ),
        },
      ]}
    />
  );
}
