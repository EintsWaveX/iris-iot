/**
 * The module page's Code step (Phase 9 Stage 7d, mockup p-module › Code).
 * One sketch at a time behind the file switch; both stay mounted so a
 * blank being typed in survives switching files. The pins and schematic
 * sit beside the code from 1280 wide (toggle remembered), and open as a
 * bottom sheet below that. An Asisten gets Show Answers on top.
 *
 * Mounted client:only (through ModuleSteps), so the first render already
 * knows the width and the saved dock state.
 */
import { useState } from "react";
import { EyeIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { Switch } from "../ui/Controls";
import PinSchematic, { type PinData } from "./PinSchematic";
import BlankFile, { type BerkasEntry, type CodeMode } from "./BlankFile";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { C } from "./codeStrings";
import "./code.css";

const DOCK_KEY = "iris-code-dock";

export interface CodeProps {
  modul: number;
  bahasa: "id" | "en";
  berkas: BerkasEntry[];
}

interface Props {
  lang: Lang;
  mode: CodeMode;
  pin: PinData;
  mcu: string;
  skema: string;
  code: CodeProps;
  /** Lihat Sebagai Praktikan: the group an Asisten acts for. */
  wakil?: { nomor: number; own: boolean };
}

export default function CodeStep({ lang, mode, pin, mcu, skema, code, wakil }: Props) {
  const t = C[lang];
  const wide = useMinWidth(1280, true);
  const [active, setActive] = useState(code.berkas[0]?.slug ?? "");
  const [showKeys, setShowKeys] = useState(false);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DOCK_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [sheet, setSheet] = useState(false);

  function togglePins() {
    if (!wide) {
      setSheet(true);
      return;
    }
    setOpen((v) => {
      try {
        localStorage.setItem(DOCK_KEY, v ? "0" : "1");
      } catch {
        /* private mode: the toggle still works for this visit */
      }
      return !v;
    });
  }

  const panel = (
    <PinSchematic lang={lang} modul={code.modul} pin={pin} mcu={mcu} skema={skema} variant="dock" />
  );
  const side =
    wide && open ? (
      <aside className="panel codestep__pins">
        <h3 className="panel__title">{t.pins}</h3>
        {panel}
      </aside>
    ) : undefined;

  return (
    <div className="stack codestep">
      {mode === "asisten" && (
        <div className="banner codestep__keys">
          <EyeIcon aria-hidden="true" />
          <b>{t.showKeys}</b>
          <span className="hint codestep__keys-hint">{t.keysOnly}</span>
          <span className="grow" />
          <Switch on={showKeys} onChange={setShowKeys} label={t.showKeys} />
        </div>
      )}
      {wakil && !wakil.own && (
        <div className="banner banner--lock">
          <EyeIcon aria-hidden="true" />
          <span>{t.viewOnly}</span>
        </div>
      )}
      {code.berkas.map((f) => (
        <div key={f.slug} hidden={f.slug !== active}>
          <BlankFile
            lang={lang}
            mode={mode}
            modul={code.modul}
            bahasa={code.bahasa}
            file={f}
            files={code.berkas}
            onPick={setActive}
            showKeys={showKeys}
            pinsOpen={open}
            onPins={togglePins}
            wide={wide}
            side={f.slug === active ? side : undefined}
            wakil={wakil}
          />
        </div>
      ))}
      <Dialog open={sheet} onOpenChange={setSheet} title={t.pins} sheet size="xl" lang={lang}>
        {panel}
      </Dialog>
    </div>
  );
}
