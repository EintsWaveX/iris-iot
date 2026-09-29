/**
 * The Kode step's workspace (P8.3): the code, with the pins and schematic
 * docked beside it so nobody flips back to Persiapan to check a wire.
 *
 *   >= 1280  two resizable panes, the pin panel collapsible (`[` / `]` on the
 *            handle, or its own close button), open by default at 1680+
 *   <  1280  the code full width, "Pin & skema" opens the same panel as a
 *            bottom sheet
 */
import { useEffect, useState, type ComponentProps } from "react";
import { CircuitBoard, PanelRightClose, PanelRightOpen } from "lucide-react";
import ResizablePanes from "../ui/ResizablePanes";
import Dialog from "../ui/Dialog";
import ModuleCodeStep from "../ModuleCodeStep";
import PinSchematic, { type PinData } from "./PinSchematic";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import "./CodeWorkspace.css";

const T = {
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
};

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
  const wide = useMinWidth(1280);
  const xwide = useMinWidth(1680);
  const [open, setOpen] = useState(true);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(OPEN_KEY);
      setOpen(v === null ? true : v === "1");
    } catch {
      /* ignore */
    }
  }, [xwide]);

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
          <CircuitBoard size={18} aria-hidden="true" /> {t.pins}
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
            <PanelRightOpen size={18} aria-hidden="true" /> {t.show}
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
                  <CircuitBoard size={17} aria-hidden="true" /> {t.pins}
                </b>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  aria-label={t.hide}
                  onClick={() => toggle(false)}
                >
                  <PanelRightClose size={18} aria-hidden="true" />
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
