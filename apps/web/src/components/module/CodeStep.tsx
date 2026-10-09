/**
 * The module page's Code step (Phase 9 Stage 7d, mockup p-module › Code).
 * One sketch at a time behind the file switch; both stay mounted so a
 * blank being typed in survives switching files. The pins and schematic
 * sit beside the code from 1280 wide (toggle remembered), and open as a
 * bottom sheet below that. An Asisten gets Show Answers on top, and picks
 * whose file to read: each group's file carries its own identity lines
 * (GROUP_ID, Module 4's sync word) and per-group answers.
 *
 * Mounted client:only (through ModuleSteps), so the first render already
 * knows the width and the saved dock state.
 *
 * The files come baked into the page (version 1); once ASO publish a newer
 * version, the published Praktikan files replace them (GET /api/modul/kode,
 * again whenever a version is published).
 */
import { useEffect, useState } from "react";
import { EyeIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { Switch } from "../ui/Controls";
import SegmentedControl from "../ui/SegmentedControl";
import PinSchematic, { type PinData } from "./PinSchematic";
import BlankFile, { type BerkasEntry, type CodeMode } from "./BlankFile";
import { useMinWidth } from "../../lib/hooks";
import { getJson } from "../../lib/app";
import { parseBlanks } from "../../lib/blanks";
import { useSiaran } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import { C } from "./codeStrings";
import "./code.css";

const DOCK_KEY = "iris-code-dock";

/** `?blank=<file slug>.<n>` (the Konsol's Open in Code): that file, that blank. */
function blankDariUrl(): { slug: string; nomor: number } | null {
  try {
    const m = /^([a-z0-9_]+)\.(\d+)$/.exec(new URLSearchParams(location.search).get("blank") ?? "");
    return m ? { slug: m[1], nomor: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

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
  wakil?: { nomor: number; own: boolean; pemegang?: string | null };
}

interface KodeTerbit {
  ok: boolean;
  versi: number | null;
  berkas: { slug: string; templat: Record<"id" | "en", string> }[];
}

/** The module's files as published, over the baked ones. */
function useBerkasTerbit(code: CodeProps): BerkasEntry[] {
  const [berkas, setBerkas] = useState(code.berkas);
  const muat = () =>
    getJson<KodeTerbit>(`/api/modul/kode?modul=${code.modul}`)
      .then((d) => {
        if (!d.ok || d.versi === null) return;
        setBerkas(
          code.berkas.map((f) => {
            const t = d.berkas.find((b) => b.slug === f.slug)?.templat[code.bahasa];
            return t === undefined ? f : { ...f, segments: parseBlanks(t) };
          }),
        );
      })
      .catch(() => {});
  useEffect(() => void muat(), [code.modul, code.bahasa]);
  useSiaran(["kode"], muat);
  return berkas;
}

export default function CodeStep({ lang, mode, pin, mcu, skema, code: baked, wakil }: Props) {
  const t = C[lang];
  const berkas = useBerkasTerbit(baked);
  const code = { ...baked, berkas };
  const wide = useMinWidth(1280, true);
  const [awal] = useState(blankDariUrl);
  const [active, setActive] = useState(
    awal && code.berkas.some((f) => f.slug === awal.slug)
      ? awal.slug
      : (code.berkas[0]?.slug ?? ""),
  );
  const [showKeys, setShowKeys] = useState(false);
  const [grupLihat, setGrupLihat] = useState(1);
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
          <Switch on={showKeys} onChange={setShowKeys} label={t.showKeys} />
          <b>{t.showKeys}</b>
          <span className="hint codestep__keys-hint">{t.keysOnly}</span>
          <span className="grow" />
          <span className="codestep__grup">
            <span className="field__label">{t.groupPick}</span>
            <SegmentedControl
              value={String(grupLihat)}
              onValueChange={(v) => setGrupLihat(Number(v))}
              aria-label={t.groupPick}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: <span title={t.groupN(n)}>{n}</span>,
              }))}
            />
          </span>
        </div>
      )}
      {wakil && !wakil.own && (
        <div className="banner banner--lock">
          <EyeIcon aria-hidden="true" />
          <span>{wakil.pemegang ? t.viewOnly : t.viewOnlyFree}</span>
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
            grupLihat={grupLihat}
            awal={awal?.slug === f.slug ? awal.nomor : undefined}
          />
        </div>
      ))}
      <Dialog open={sheet} onOpenChange={setSheet} title={t.pins} sheet size="xl" lang={lang}>
        {panel}
      </Dialog>
    </div>
  );
}
